import { WebSocketServer, WebSocket } from 'ws';
import type { RequestFrame, ResponseFrame, EventFrame } from './gateway-client.js';

const FAKE_SESSIONS = [
  { key: 'agent:main', agentId: 'main', displayName: 'Main Agent', model: 'claude-sonnet-4-6' },
  { key: 'agent:ops', agentId: 'ops', displayName: 'Ops Agent', model: 'claude-haiku-4-5-20251001' },
  { key: 'agent:research', agentId: 'research', displayName: 'Research Agent', model: 'claude-sonnet-4-6' },
];

const FAKE_CRON_JOBS = [
  {
    id: 'cron-health',
    name: 'Health Check',
    description: 'Run health checks across services',
    enabled: true,
    schedule: { kind: 'every' as const, everyMs: 300_000 },
    agentId: 'ops',
    state: {},
  },
  {
    id: 'cron-digest',
    name: 'Daily Digest',
    description: 'Compile daily summary report',
    enabled: true,
    schedule: { kind: 'cron' as const, expr: '0 9 * * *', tz: 'UTC' },
    agentId: 'main',
    state: {},
  },
  {
    id: 'cron-scrape',
    name: 'Web Scraper',
    description: 'Scrape research sources',
    enabled: true,
    schedule: { kind: 'every' as const, everyMs: 600_000 },
    agentId: 'research',
    state: {},
  },
];

export class MockGateway {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private presenceTimers: ReturnType<typeof setTimeout>[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private agentStates = new Map<string, 'active' | 'idle'>();

  constructor() {
    for (const s of FAKE_SESSIONS) {
      this.agentStates.set(s.agentId, 'idle');
    }
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port }, () => resolve());

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        let handshakeDone = false;

        ws.on('message', (data) => {
          let frame: Record<string, unknown>;
          try {
            frame = JSON.parse(data.toString()) as Record<string, unknown>;
          } catch {
            return;
          }

          // Handle connect handshake (first message must be { protocol: N })
          if (!handshakeDone && 'protocol' in frame) {
            handshakeDone = true;
            ws.send(JSON.stringify({
              type: 'hello-ok',
              protocol: 3,
              server: { version: '0.1.0-mock', connId: 'mock-conn' },
              features: { methods: ['sessions.list', 'cron.list'], events: ['presence', 'tick', 'agent'] },
              snapshot: { presence: [], health: {}, stateVersion: { presence: 0, health: 0 }, uptimeMs: 0 },
              policy: { maxPayload: 1048576, maxBufferedBytes: 4194304, tickIntervalMs: 30000 },
            }));
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
        response = { type: 'res', id: frame.id, ok: true, payload: FAKE_SESSIONS };
        break;
      case 'cron.list':
        response = { type: 'res', id: frame.id, ok: true, payload: FAKE_CRON_JOBS };
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
        const current = this.agentStates.get(agent.agentId)!;
        const next = current === 'active' ? 'idle' : 'active';
        this.agentStates.set(agent.agentId, next);

        this.broadcast({
          type: 'event',
          event: 'presence',
          payload: { agentId: agent.agentId, status: next },
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
