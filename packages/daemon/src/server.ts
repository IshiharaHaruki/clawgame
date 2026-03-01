import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { ServerMessage, ClientMessage } from './types.js';
import type { StateManager } from './state-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_PROXY_RPCS = new Set([
  'chat.send', 'chat.history', 'chat.abort',
  'sessions.list', 'sessions.preview',
  'agents.list', 'models.list', 'channels.status', 'config.get',
  'cron.list', 'cron.runs',
  'usage.cost', 'sessions.usage', 'sessions.usage.timeseries', 'sessions.usage.logs',
]);

export class DaemonServer {
  private app = Fastify();
  private clients = new Set<WebSocket>();
  private chatSubscriptions = new Map<WebSocket, Set<string>>();
  private stateManager: StateManager;
  private rpcProxy: (method: string, params?: unknown) => Promise<unknown>;
  private port: number;

  constructor(stateManager: StateManager, rpcProxy: (method: string, params?: unknown) => Promise<unknown>, port: number) {
    this.stateManager = stateManager;
    this.rpcProxy = rpcProxy;
    this.port = port;
  }

  async start(): Promise<string> {
    // Register static file serving
    const webDistPath = path.resolve(__dirname, '..', '..', 'web', 'dist');
    await this.app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    });

    // Register websocket
    await this.app.register(fastifyWebsocket);

    // WebSocket endpoint
    this.app.get('/ws', { websocket: true }, (socket) => {
      this.clients.add(socket);

      // Send snapshot on connect
      const snapshot = this.stateManager.getSnapshot();
      this.send(socket, { type: 'snapshot', data: snapshot });

      socket.on('message', (data) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(data.toString()) as ClientMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'request:snapshot': {
            const snap = this.stateManager.getSnapshot();
            this.send(socket, { type: 'snapshot', data: snap });
            break;
          }

          case 'rpc:request': {
            const { requestId, method, params } = msg.data;
            if (!ALLOWED_PROXY_RPCS.has(method)) {
              this.send(socket, {
                type: 'rpc:response',
                data: { requestId, ok: false, error: { code: 'FORBIDDEN', message: `Method ${method} not allowed` } },
              });
              return;
            }
            this.rpcProxy(method, params)
              .then((payload) => {
                this.send(socket, { type: 'rpc:response', data: { requestId, ok: true, payload } });
              })
              .catch((err: Error) => {
                this.send(socket, { type: 'rpc:response', data: { requestId, ok: false, error: { code: 'RPC_ERROR', message: err.message } } });
              });
            break;
          }

          case 'subscribe:chat': {
            const subs = this.chatSubscriptions.get(socket) ?? new Set<string>();
            subs.add(msg.data.sessionKey);
            this.chatSubscriptions.set(socket, subs);
            break;
          }

          case 'unsubscribe:chat': {
            this.chatSubscriptions.get(socket)?.delete(msg.data.sessionKey);
            break;
          }
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
        this.chatSubscriptions.delete(socket);
      });
    });

    // Forward granular state-manager events to connected clients
    this.stateManager.on('agent:update', (agent: unknown) => this.broadcast({ type: 'agent:update', data: agent } as ServerMessage));
    this.stateManager.on('agent:tool', (data: unknown) => this.broadcast({ type: 'agent:tool', data } as ServerMessage));
    this.stateManager.on('agent:status', (data: unknown) => this.broadcast({ type: 'agent:status', data } as ServerMessage));
    this.stateManager.on('agent:chat', (data: { agentId: string; message: unknown }) => {
      this.sendToSubscribers(data.agentId, { type: 'agent:chat', data } as ServerMessage);
    });
    this.stateManager.on('activity', (entry: unknown) => this.broadcast({ type: 'activity', data: entry } as ServerMessage));
    this.stateManager.on('connection:status', (data: unknown) => this.broadcast({ type: 'connection:status', data } as ServerMessage));

    const address = await this.app.listen({ port: this.port, host: '0.0.0.0' });
    return address;
  }

  async stop(): Promise<void> {
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    await this.app.close();
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  private sendToSubscribers(agentId: string, msg: unknown): void {
    const snapshot = this.stateManager.getSnapshot();
    const agent = snapshot.agents.find((a) => a.id === agentId);
    const sessionKey = agent?.sessionKey;

    for (const [ws, subs] of this.chatSubscriptions) {
      // Send if subscribed to this agent's sessionKey, or if sessionKey matches agent:agentId pattern
      if ((sessionKey && subs.has(sessionKey)) || subs.has(`agent:${agentId}`)) {
        this.send(ws, msg as ServerMessage);
      }
    }
  }
}
