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
  features: {
    methods: [
      'sessions.list', 'cron.list', 'cron.runs',
      'agents.list', 'models.list', 'channels.status', 'config.get',
      'chat.send', 'chat.history', 'chat.abort',
      'usage.cost', 'sessions.usage', 'sessions.usage.timeseries', 'sessions.usage.logs',
      'sessions.preview', 'health',
    ],
    events: ['agent', 'chat', 'cron', 'presence', 'tick'],
  },
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
      this.startAgentSimulation();
      this.startCronSimulation();
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
      case 'agents.list':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            agents: [
              { id: 'main', name: 'Main Agent', workspace: '/workspace/main' },
              { id: 'ops', name: 'Ops Agent', workspace: '/workspace/ops' },
              { id: 'research', name: 'Research Agent', workspace: '/workspace/research' },
            ],
          },
        };
        break;

      case 'chat.send': {
        const p = frame.params as { sessionKey?: string; message?: string; idempotencyKey?: string } | undefined;
        const sessionKey = p?.sessionKey ?? 'agent:main:mock:dm:user1';
        const runId = `run-${Date.now()}`;
        // Simulate streamed response after a delay
        setTimeout(() => {
          const words = 'I am processing your request and will respond shortly.'.split(' ');
          words.forEach((word, i) => {
            setTimeout(() => {
              const isFinal = i === words.length - 1;
              this.broadcast({
                type: 'event', event: 'chat',
                payload: {
                  runId, sessionKey, seq: i,
                  state: isFinal ? 'final' : 'delta',
                  message: { role: 'assistant', content: [{ type: 'text', text: word + ' ' }], timestamp: Date.now() },
                  ...(isFinal ? { usage: { input_tokens: 150 + Math.floor(Math.random() * 200), output_tokens: 50 + Math.floor(Math.random() * 100), cost: 0.001 + Math.random() * 0.005 } } : {}),
                },
              });
            }, i * 100);
          });
        }, 500);
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { runId, sessionKey, seq: 0, state: 'delta' },
        };
        break;
      }

      case 'chat.history':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            sessionKey: (frame.params as Record<string, unknown> | undefined)?.sessionKey ?? '',
            messages: [],
            thinkingLevel: 'default',
          },
        };
        break;

      case 'chat.abort':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { ok: true, aborted: false, runIds: [] },
        };
        break;

      case 'models.list':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            models: [
              { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
              { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
            ],
          },
        };
        break;

      case 'config.get':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { config: {} },
        };
        break;

      case 'channels.status':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { channels: [] },
        };
        break;

      case 'usage.cost':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            updatedAt: Date.now(), days: 7, daily: [],
            totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 },
          },
        };
        break;

      case 'sessions.usage':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: {
            sessions: [], totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 },
            messages: { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 },
            tools: { totalCalls: 0, uniqueTools: 0, tools: [] }, byModel: [], byProvider: [],
          },
        };
        break;

      case 'sessions.usage.timeseries':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { points: [] },
        };
        break;

      case 'sessions.usage.logs':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { logs: [] },
        };
        break;

      case 'cron.runs':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { items: [], limit: 50, offset: 0, total: 0 },
        };
        break;

      case 'sessions.preview':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { preview: null },
        };
        break;

      case 'health':
        response = {
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { status: 'ok', uptimeMs: Date.now(), version: '0.1.0-mock' },
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

        // Emit system presence snapshots in real OpenClaw format
        const presenceEntries = [...this.agentStates.entries()].map(([id]) => ({
          host: 'mock-host',
          platform: 'darwin',
          mode: 'ui',
          ts: Date.now(),
          deviceId: `mock-device-${id}`,
          roles: ['operator'],
        }));
        this.broadcast({
          type: 'event',
          event: 'presence',
          payload: { presence: presenceEntries },
        });

        scheduleToggle();
      }, delay);
      this.presenceTimers.push(timer);
    };

    scheduleToggle();
  }

  private startAgentSimulation(): void {
    const interval = setInterval(() => {
      for (const [agentId, state] of this.agentStates) {
        if (state !== 'active') continue;
        const sessionKey = `agent:${agentId}:mock:dm:user1`;
        const runId = `run-${Date.now()}-${agentId}`;

        if (Math.random() < 0.4) {
          // Tool event
          const tools = ['Read', 'Bash', 'Grep', 'Write', 'WebSearch'];
          const toolName = tools[Math.floor(Math.random() * tools.length)];
          this.broadcast({
            type: 'event', event: 'agent',
            payload: { runId, seq: 0, stream: 'tool', ts: Date.now(), data: { toolName, toolInput: {} }, sessionKey },
          });
          setTimeout(() => {
            this.broadcast({
              type: 'event', event: 'agent',
              payload: { runId, seq: 1, stream: 'tool', ts: Date.now(), data: { toolName, result: 'ok' }, sessionKey },
            });
          }, 1000 + Math.random() * 2000);
        } else {
          // Assistant event
          this.broadcast({
            type: 'event', event: 'agent',
            payload: { runId, seq: 0, stream: 'assistant', ts: Date.now(), data: { text: 'Processing...' }, sessionKey },
          });
        }
      }
    }, 5000);
    this.presenceTimers.push(interval as unknown as ReturnType<typeof setTimeout>);
  }

  private startCronSimulation(): void {
    const interval = setInterval(() => {
      const job = FAKE_CRON_JOBS[Math.floor(Math.random() * FAKE_CRON_JOBS.length)];
      const status = Math.random() < 0.9 ? 'ok' : 'error';
      const durationMs = 1000 + Math.floor(Math.random() * 5000);
      this.broadcast({
        type: 'event', event: 'cron',
        payload: {
          ts: Date.now(),
          jobId: job.id,
          action: 'finished',
          status,
          durationMs,
          sessionKey: `agent:${job.agentId}:cron:${job.id}`,
          usage: {
            input_tokens: 200 + Math.floor(Math.random() * 500),
            output_tokens: 100 + Math.floor(Math.random() * 300),
            cost: 0.002 + Math.random() * 0.008,
          },
        },
      });
    }, 30000);
    this.presenceTimers.push(interval as unknown as ReturnType<typeof setTimeout>);
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
