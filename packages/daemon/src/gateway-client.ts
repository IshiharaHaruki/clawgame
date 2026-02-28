import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

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

  constructor(opts: GatewayClientOptions = {}) {
    super();
    this.url = opts.url ?? 'ws://127.0.0.1:18789';
    this.rpcTimeout = opts.rpcTimeout ?? 10_000;
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectDelay = 1000;
      this.emit('connected');
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
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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
    this.clearReconnectTimer();
    this.rejectAllPending('Client destroyed');
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.removeAllListeners();
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
    } else if (frame.type === 'event') {
      if (frame.event === 'hello-ok') {
        this.emit('hello', frame.payload);
      }
      this.emit('gateway:event', frame);
      this.emit(`gateway:${frame.event}`, frame.payload);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
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
