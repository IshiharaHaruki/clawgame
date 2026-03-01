import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { RequestFrame, ResponseFrame, EventFrame } from './gateway-client.js';

const FAKE_SESSIONS = [
  { key: 'agent:main', kind: 'direct' as const, displayName: 'Main Agent', model: 'claude-sonnet-4-6', updatedAt: Date.now() },
  { key: 'agent:ops', kind: 'direct' as const, displayName: 'Ops Agent', model: 'claude-haiku-4-5-20251001', updatedAt: Date.now() },
  { key: 'agent:research', kind: 'direct' as const, displayName: 'Research Agent', model: 'claude-sonnet-4-6', updatedAt: Date.now() },
];

const FAKE_CRON_JOBS = [
  {
    id: 'cron-health',
    name: 'Health Check',
    description: 'Run health checks across services',
    enabled: true,
    schedule: { kind: 'every' as const, everyMs: 300_000 },
    agentId: 'ops',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    sessionTarget: 'main' as const,
    wakeMode: 'now' as const,
    payload: { text: '' },
    state: {},
  },
  {
    id: 'cron-digest',
    name: 'Daily Digest',
    description: 'Compile daily summary report',
    enabled: true,
    schedule: { kind: 'cron' as const, expr: '0 9 * * *', tz: 'UTC' },
    agentId: 'main',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    sessionTarget: 'main' as const,
    wakeMode: 'now' as const,
    payload: { text: '' },
    state: {},
  },
  {
    id: 'cron-scrape',
    name: 'Web Scraper',
    description: 'Scrape research sources',
    enabled: true,
    schedule: { kind: 'every' as const, everyMs: 600_000 },
    agentId: 'research',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    sessionTarget: 'main' as const,
    wakeMode: 'now' as const,
    payload: { text: '' },
    state: {},
  },
];

const HELLO_OK_PAYLOAD = {
  type: 'hello-ok',
  protocol: 3,
  server: { version: '0.1.0-mock', connId: 'mock-conn' },
  features: { methods: ['sessions.list', 'cron.list'], events: ['presence', 'tick', 'agent'] },
  snapshot: { presence: [], health: {}, stateVersion: { presence: 0, health: 0 }, uptimeMs: 0 },
  policy: { maxPayload: 1048576, maxBufferedBytes: 4194304, tickIntervalMs: 30000 },
};

export class MockGateway {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private presenceTimers: ReturnType<typeof setTimeout>[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private agentStates = new Map<string, 'active' | 'idle'>();

  constructor() {
    for (const s of FAKE_SESSIONS) {
      const agentId = s.key.replace('agent:', '');
      this.agentStates.set(agentId, 'idle');
    }
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port }, () => resolve());

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        let handshakeDone = false;

        // Send connect.challenge immediately (matching real OpenClaw behavior)
        const nonce = randomUUID();
        ws.send(JSON.stringify({
          type: 'event',
          event: 'connect.challenge',
          payload: { nonce, ts: Date.now() },
        }));

        ws.on('message', (data) => {
          let frame: Record<string, unknown>;
          try {
            frame = JSON.parse(data.toString()) as Record<string, unknown>;
          } catch {
            return;
          }

          // Handle connect handshake
          if (!handshakeDone) {
            if (frame.type === 'req' && frame.method === 'connect') {
              // Real protocol: client sends { type: "req", method: "connect", params: ConnectParams }
              handshakeDone = true;
              const response: ResponseFrame = {
                type: 'res',
                id: frame.id as string,
                ok: true,
                payload: HELLO_OK_PAYLOAD,
              };
              ws.send(JSON.stringify(response));
              return;
            }
            // Reject non-connect frames before handshake
            if (frame.type === 'req') {
              const response: ResponseFrame = {
                type: 'res',
                id: (frame.id as string) ?? '0',
                ok: false,
                error: { code: 'INVALID_REQUEST', message: 'invalid handshake: first request must be connect' },
              };
              ws.send(JSON.stringify(response));
            }
            return;
          }

          if ((frame as { type?: string }).type === 'req') {
            this.handleRequest(ws, frame as unknown as RequestFrame);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
        });
      });

      this.startPresenceSimulation();
      this.tickTimer = setInterval(() => {
        this.broadcast({ type: 'event', event: 'tick', payload: { ts: Date.now() } });
      }, 30_000);
    });
  }

  stop(): void {
    for (const t of this.presenceTimers) clearTimeout(t);
    this.presenceTimers = [];
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private handleRequest(ws: WebSocket, frame: RequestFrame): void {
    let response: ResponseFrame;

    switch (frame.method) {
      case 'sessions.list':
        // Match real OpenClaw response shape: { ts, path, count, defaults, sessions }
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            ts: Date.now(),
            path: '/mock/sessions',
            count: FAKE_SESSIONS.length,
            defaults: { modelProvider: null, model: null, contextTokens: null },
            sessions: FAKE_SESSIONS,
          },
        };
        break;
      case 'cron.list':
        // Match real OpenClaw response shape: { jobs, total, offset, limit, hasMore, nextOffset }
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            jobs: FAKE_CRON_JOBS,
            total: FAKE_CRON_JOBS.length,
            offset: 0,
            limit: 50,
            hasMore: false,
            nextOffset: null,
          },
        };
        break;
      default:
        response = {
          type: 'res',
          id: frame.id,
          ok: false,
          error: { code: 'NOT_FOUND', message: `Unknown method: ${frame.method}` },
        };
    }

    ws.send(JSON.stringify(response));
  }

  private startPresenceSimulation(): void {
    const agents = [...FAKE_SESSIONS];

    const scheduleToggle = () => {
      const delay = 8000 + Math.random() * 7000; // 8-15s
      const timer = setTimeout(() => {
        const agent = agents[Math.floor(Math.random() * agents.length)];
        const agentId = agent.key.replace('agent:', '');
        const current = this.agentStates.get(agentId)!;
        const next = current === 'active' ? 'idle' : 'active';
        this.agentStates.set(agentId, next);

        this.broadcast({
          type: 'event',
          event: 'presence',
          payload: { agentId, status: next },
        });

        scheduleToggle();
      }, delay);
      this.presenceTimers.push(timer);
    };

    scheduleToggle();
  }

  private broadcast(frame: EventFrame): void {
    const data = JSON.stringify(frame);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
