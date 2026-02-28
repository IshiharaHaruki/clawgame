import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { GameState, ServerMessage, ClientMessage } from './types.js';
import type { StateManager } from './state-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DaemonServer {
  private app = Fastify();
  private clients = new Set<WebSocket>();
  private stateManager: StateManager;
  private port: number;

  constructor(stateManager: StateManager, port: number) {
    this.stateManager = stateManager;
    this.port = port;
  }

  async start(): Promise<string> {
    // Register static file serving
    const webDistPath = path.resolve(__dirname, '..', '..', '..', 'web', 'dist');
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

        if (msg.type === 'request:snapshot') {
          const snap = this.stateManager.getSnapshot();
          this.send(socket, { type: 'snapshot', data: snap });
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
      });
    });

    // Listen for state changes and broadcast to all clients
    this.stateManager.on('change', (state: GameState) => {
      this.broadcast({ type: 'snapshot', data: state });
    });

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
}
