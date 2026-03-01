import { EventEmitter } from 'node:events';
import os from 'node:os';
import WebSocket from 'ws';
import {
  type DeviceIdentity,
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
  buildDeviceAuthPayloadV3,
} from './device-identity.js';

export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

type Frame = RequestFrame | ResponseFrame | EventFrame;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GatewayClientOptions {
  url?: string;
  rpcTimeout?: number;
  /** Skip device identity (for mock/testing). */
  skipDeviceIdentity?: boolean;
  /** Gateway shared auth token (gateway.auth.token). */
  token?: string;
}

export class GatewayClient extends EventEmitter {
  private url: string;
  private rpcTimeout: number;
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private reqCounter = 0;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private connected = false;
  private deviceIdentity: DeviceIdentity | null;
  private connectNonce: string | null = null;
  private token: string | undefined;

  constructor(opts: GatewayClientOptions = {}) {
    super();
    this.url = opts.url ?? 'ws://127.0.0.1:18789';
    this.rpcTimeout = opts.rpcTimeout ?? 10_000;
    this.deviceIdentity = opts.skipDeviceIdentity ? null : loadOrCreateDeviceIdentity();
    this.token = opts.token;
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.connected = false;
    this.connectNonce = null;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectDelay = 1000;
      // Real OpenClaw: server sends connect.challenge first, we respond.
      // Both paths are handled in handleFrame.
    });

    ws.on('message', (data: WebSocket.Data) => {
      let frame: Frame;
      try {
        frame = JSON.parse(data.toString()) as Frame;
      } catch {
        return;
      }
      this.handleFrame(frame);
    });

    ws.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
      this.rejectAllPending('Connection closed');
      if (!this.destroyed) this.scheduleReconnect();
    });

    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  async rpc(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const id = String(++this.reqCounter);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, this.rpcTimeout);

      this.pending.set(id, { resolve, reject, timer });

      const frame: RequestFrame = { type: 'req', id, method };
      if (params !== undefined) frame.params = params;

      this.ws.send(JSON.stringify(frame));
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.connected = false;
    this.clearReconnectTimer();
    this.rejectAllPending('Client destroyed');
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.removeAllListeners();
  }

  private sendConnectRequest(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const id = String(++this.reqCounter);
    const role = 'operator';
    const scopes = ['operator.admin'];
    const signedAtMs = Date.now();
    const nonce = this.connectNonce ?? undefined;
    const authToken = this.token ?? undefined;

    // Build device identity for auth (V3 payload format)
    const device = this.deviceIdentity
      ? (() => {
          const payload = buildDeviceAuthPayloadV3({
            deviceId: this.deviceIdentity!.deviceId,
            clientId: 'gateway-client',
            clientMode: 'ui',
            role,
            scopes,
            signedAtMs,
            token: authToken ?? null,
            nonce: nonce ?? '',
            platform: os.platform(),
          });
          const signature = signDevicePayload(this.deviceIdentity!.privateKeyPem, payload);
          return {
            id: this.deviceIdentity!.deviceId,
            publicKey: publicKeyRawBase64UrlFromPem(this.deviceIdentity!.publicKeyPem),
            signature,
            signedAt: signedAtMs,
            nonce,
          };
        })()
      : undefined;

    const auth = authToken ? { token: authToken } : undefined;

    const connectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'gateway-client',
        version: '0.1.0',
        platform: os.platform(),
        mode: 'ui',
      },
      role,
      scopes,
      device,
      auth,
    };

    const frame: RequestFrame = {
      type: 'req',
      id,
      method: 'connect',
      params: connectParams,
    };

    // Register as a pending request so we get the hello-ok response
    const timer = setTimeout(() => {
      this.pending.delete(id);
      this.emit('error', new Error('Connect handshake timeout'));
    }, this.rpcTimeout);

    this.pending.set(id, {
      resolve: (payload: unknown) => {
        const p = payload as Record<string, unknown> | undefined;
        if (p?.type === 'hello-ok') {
          this.connected = true;
          this.emit('hello', p);
          this.emit('connected');
        }
      },
      reject: (err: Error) => {
        this.emit('error', new Error(`Connect handshake failed: ${err.message}`));
      },
      timer,
    });

    this.ws.send(JSON.stringify(frame));
  }

  private handleFrame(frame: Frame): void {
    if (frame.type === 'res') {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        pending.reject(new Error(frame.error?.message ?? 'RPC error'));
      }
    } else if (frame.type === 'event' && frame.event === 'connect.challenge') {
      // Real OpenClaw gateway: server sends connect.challenge with nonce
      const payload = frame.payload as { nonce?: string } | undefined;
      this.connectNonce = payload?.nonce ?? null;
      this.sendConnectRequest();
    } else if (
      (frame as { type: string }).type === 'hello-ok' ||
      (frame.type === 'event' && frame.event === 'hello-ok')
    ) {
      // Standalone hello-ok (legacy/other implementations)
      this.connected = true;
      this.emit('hello', frame);
      this.emit('connected');
    } else if (frame.type === 'event') {
      this.emit('gateway:event', frame);
      this.emit(`gateway:${frame.event}`, frame.payload);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
