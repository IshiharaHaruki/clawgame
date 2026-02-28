# ClawGame MVP-Lite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local daemon that connects to OpenClaw Gateway and a web frontend that renders agents as pixel art characters in a virtual office.

**Architecture:** pnpm monorepo with two packages: `packages/daemon` (Node.js CLI + Fastify server + OpenClaw WS client) and `packages/web` (Vite + React + Phaser 3). The daemon connects to OpenClaw Gateway via WebSocket RPC, maintains agent state, serves the built web frontend as static files, and exposes a WebSocket for real-time state updates to the browser.

**Tech Stack:** TypeScript, Node.js 22+, pnpm workspaces, Fastify, ws (WebSocket), Zod, Vite, React 18, Phaser 3.90

**Design Doc:** `docs/plans/2026-02-28-clawgame-design.md`

---

## Task 1: Monorepo Scaffolding + Shared Types

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/daemon/package.json`
- Create: `packages/daemon/tsconfig.json`
- Create: `packages/daemon/src/types.ts`
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`

**Step 1: Initialize root monorepo**

`package.json` (root):
```json
{
  "name": "clawgame",
  "private": true,
  "scripts": {
    "dev:daemon": "pnpm --filter @clawgame/daemon dev",
    "dev:web": "pnpm --filter @clawgame/web dev",
    "build:web": "pnpm --filter @clawgame/web build",
    "build": "pnpm -r build"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

Run: `pnpm init && pnpm install`

**Step 2: Create daemon package**

`packages/daemon/package.json`:
```json
{
  "name": "@clawgame/daemon",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "clawgame": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx watch src/cli.ts",
    "build": "tsup src/cli.ts --format esm --dts",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/static": "^8.0.0",
    "@fastify/websocket": "^11.0.0",
    "ws": "^8.18.0",
    "zod": "^3.23.0",
    "open": "^10.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/daemon/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Create web package**

`packages/web/package.json`:
```json
{
  "name": "@clawgame/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.90.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

**Step 4: Define shared types**

`packages/daemon/src/types.ts` — Zod schemas used by both daemon and serialized to the frontend:

```typescript
import { z } from 'zod';

// Agent status enum, ordered by priority (highest first)
export const AgentStatus = z.enum(['error', 'offline', 'cron_running', 'working', 'idle']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const STATUS_PRIORITY: Record<AgentStatus, number> = {
  error: 5,
  offline: 4,
  cron_running: 3,
  working: 2,
  idle: 1,
};

export const CronSchedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('at'), at: z.string() }),
  z.object({ kind: z.literal('every'), everyMs: z.number() }),
  z.object({ kind: z.literal('cron'), expr: z.string(), tz: z.string().optional() }),
]);

export const CronJobState = z.object({
  nextRunAtMs: z.number().optional(),
  lastRunAtMs: z.number().optional(),
  lastRunStatus: z.enum(['ok', 'error', 'skipped']).optional(),
  lastError: z.string().optional(),
  lastDurationMs: z.number().optional(),
  runningAtMs: z.number().optional(),
});

export const CronJob = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  schedule: CronSchedule,
  agentId: z.string().optional(),
  state: CronJobState,
});
export type CronJob = z.infer<typeof CronJob>;

export const AgentInfo = z.object({
  id: z.string(),
  displayName: z.string(),
  status: AgentStatus,
  model: z.string().optional(),
  lastActivityAt: z.number(), // ms timestamp
  cronJobs: z.array(CronJob),
});
export type AgentInfo = z.infer<typeof AgentInfo>;

export const GameState = z.object({
  seq: z.number(),
  agents: z.array(AgentInfo),
  connectedToGateway: z.boolean(),
  gatewayUrl: z.string(),
  timestamp: z.number(),
});
export type GameState = z.infer<typeof GameState>;

// WebSocket messages from daemon → frontend
export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), data: GameState }),
  z.object({ type: z.literal('agent:update'), data: AgentInfo }),
  z.object({ type: z.literal('connection:status'), connected: z.boolean() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

// WebSocket messages from frontend → daemon
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('request:snapshot') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
```

**Step 5: Install dependencies**

Run: `cd /Users/moss/Documents/Projects/clawgame && pnpm install`

**Step 6: Commit**

```bash
git init
echo "node_modules\ndist\n.vite" > .gitignore
git add -A
git commit -m "chore: scaffold monorepo with daemon and web packages"
```

---

## Task 2: OpenClaw Gateway WebSocket Client

**Files:**
- Create: `packages/daemon/src/gateway-client.ts`
- Create: `packages/daemon/src/mock-gateway.ts`
- Create: `packages/daemon/src/__tests__/gateway-client.test.ts`

**Context:** The OpenClaw Gateway runs at `ws://127.0.0.1:18789` and uses a JSON-based RPC protocol with three frame types:

- `RequestFrame`: `{ type: "req", id: string, method: string, params?: unknown }`
- `ResponseFrame`: `{ type: "res", id: string, ok: boolean, payload?: unknown, error?: { code: string, message: string } }`
- `EventFrame`: `{ type: "event", event: string, payload?: unknown, seq?: number }`

Connection starts with a handshake: client sends `ConnectParams`, server responds with `HelloOk` containing features, snapshot, and policy.

**Step 1: Write the gateway client**

`packages/daemon/src/gateway-client.ts`:

```typescript
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface GatewayClientOptions {
  url: string;
  reconnect?: boolean;
  reconnectMaxDelay?: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnect: boolean;
  private reconnectMaxDelay: number;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
  private pending = new Map<string, PendingRequest>();
  private _connected = false;
  private destroyed = false;

  constructor(options: GatewayClientOptions) {
    super();
    this.url = options.url;
    this.reconnect = options.reconnect ?? true;
    this.reconnectMaxDelay = options.reconnectMaxDelay ?? 30000;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this._connected = true;
        this.reconnectDelay = 1000;
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const frame = JSON.parse(data.toString());
          this.handleFrame(frame);
        } catch (e) {
          this.emit('error', e);
        }
      });

      this.ws.on('close', () => {
        this._connected = false;
        this.rejectAllPending('Connection closed');
        this.emit('disconnected');
        if (this.reconnect && !this.destroyed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err) => {
        if (!this._connected) {
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  async rpc(method: string, params?: unknown, timeoutMs = 10000): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to gateway');
    }

    const id = String(++this.requestId);
    const frame = { type: 'req', id, method, ...(params !== undefined && { params }) };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  private handleFrame(frame: { type: string; [key: string]: unknown }): void {
    switch (frame.type) {
      case 'res': {
        const id = frame.id as string;
        const pending = this.pending.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(id);
          if (frame.ok) {
            pending.resolve(frame.payload);
          } else {
            const err = frame.error as { code: string; message: string } | undefined;
            pending.reject(new Error(err?.message ?? 'RPC error'));
          }
        }
        break;
      }
      case 'event': {
        const event = frame.event as string;
        const payload = frame.payload;
        const seq = frame.seq as number | undefined;
        this.emit('gateway:event', { event, payload, seq });
        this.emit(`gateway:${event}`, payload, seq);
        break;
      }
      case 'hello-ok': {
        this.emit('hello', frame);
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxDelay);
        if (!this.destroyed) this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending('Client destroyed');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

**Step 2: Write the mock gateway for development/testing**

`packages/daemon/src/mock-gateway.ts`:

This simulates an OpenClaw Gateway with fake agents and cron jobs, useful when no real OpenClaw is running.

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

interface MockAgent {
  id: string;
  name: string;
  model: string;
  isWorking: boolean;
}

export class MockGateway extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private seq = 0;
  private agents: MockAgent[] = [
    { id: 'main', name: 'Main Agent', model: 'anthropic/claude-sonnet-4-5', isWorking: false },
    { id: 'ops', name: 'Ops Agent', model: 'anthropic/claude-haiku-4-5', isWorking: true },
    { id: 'research', name: 'Research Agent', model: 'openai/gpt-5.2', isWorking: false },
  ];
  private cronJobs = [
    {
      id: 'cron-1', name: 'Morning Briefing', agentId: 'main', enabled: true,
      schedule: { kind: 'cron' as const, expr: '0 7 * * *', tz: 'America/Los_Angeles' },
      state: { nextRunAtMs: Date.now() + 3600000, lastRunAtMs: Date.now() - 86400000, lastRunStatus: 'ok' as const },
    },
    {
      id: 'cron-2', name: 'Inbox Check', agentId: 'ops', enabled: true,
      schedule: { kind: 'every' as const, everyMs: 1800000 },
      state: { nextRunAtMs: Date.now() + 900000, lastRunAtMs: Date.now() - 900000, lastRunStatus: 'ok' as const },
    },
    {
      id: 'cron-3', name: 'Daily Report', agentId: 'research', enabled: true,
      schedule: { kind: 'cron' as const, expr: '0 18 * * 1-5', tz: 'America/New_York' },
      state: { nextRunAtMs: Date.now() + 7200000, lastRunStatus: 'error' as const, lastError: 'API rate limit exceeded' },
    },
  ];
  private intervals: ReturnType<typeof setInterval>[] = [];

  async start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port }, () => {
        this.startSimulation();
        resolve();
      });

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        // Send hello-ok
        ws.send(JSON.stringify({
          type: 'hello-ok',
          protocol: 3,
          server: { version: '1.0.0-mock', connId: 'mock-conn' },
          features: { methods: ['sessions.list', 'cron.list', 'cron.status'], events: ['agent', 'presence', 'tick', 'cron'] },
          snapshot: { presence: [], health: {}, stateVersion: { presence: 0, health: 0 }, uptimeMs: 0 },
          policy: { maxPayload: 1048576, maxBufferedBytes: 4194304, tickIntervalMs: 30000 },
        }));

        ws.on('message', (data) => {
          const frame = JSON.parse(data.toString());
          if (frame.type === 'req') this.handleRequest(ws, frame);
        });

        ws.on('close', () => this.clients.delete(ws));
      });
    });
  }

  private handleRequest(ws: WebSocket, frame: { id: string; method: string; params?: unknown }): void {
    switch (frame.method) {
      case 'sessions.list':
        ws.send(JSON.stringify({
          type: 'res', id: frame.id, ok: true,
          payload: {
            ts: Date.now(), path: '/mock', count: this.agents.length,
            defaults: { modelProvider: null, model: null, contextTokens: null },
            sessions: this.agents.map((a) => ({
              key: `agent:${a.id}`, kind: 'direct', displayName: a.name,
              model: a.model, updatedAt: Date.now(),
            })),
          },
        }));
        break;
      case 'cron.list':
        ws.send(JSON.stringify({
          type: 'res', id: frame.id, ok: true,
          payload: {
            jobs: this.cronJobs, total: this.cronJobs.length,
            offset: 0, limit: 50, hasMore: false, nextOffset: null,
          },
        }));
        break;
      default:
        ws.send(JSON.stringify({
          type: 'res', id: frame.id, ok: false,
          error: { code: 'UNAVAILABLE', message: `Mock: ${frame.method} not implemented` },
        }));
    }
  }

  private broadcast(frame: object): void {
    const msg = JSON.stringify(frame);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  private startSimulation(): void {
    // Toggle random agent working/idle every 8-15 seconds
    this.intervals.push(setInterval(() => {
      const agent = this.agents[Math.floor(Math.random() * this.agents.length)];
      agent.isWorking = !agent.isWorking;
      if (agent.isWorking) {
        this.broadcast({
          type: 'event', event: 'agent', seq: ++this.seq,
          payload: { runId: `run-${Date.now()}`, seq: 0, stream: 'assistant', ts: Date.now(), data: { text: 'Working...' } },
        });
      }
      this.broadcast({
        type: 'event', event: 'presence', seq: ++this.seq,
        payload: {
          presence: this.agents.map((a) => ({
            host: 'mock', mode: 'agent', text: `Agent: ${a.name}`, ts: Date.now(),
            tags: [a.isWorking ? 'active' : 'idle', `agent:${a.id}`],
          })),
        },
      });
    }, 8000 + Math.random() * 7000));

    // Tick every 30s
    this.intervals.push(setInterval(() => {
      this.broadcast({ type: 'event', event: 'tick', seq: ++this.seq, payload: { ts: Date.now() } });
    }, 30000));
  }

  async stop(): Promise<void> {
    for (const interval of this.intervals) clearInterval(interval);
    this.intervals = [];
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    return new Promise((resolve) => {
      if (this.wss) this.wss.close(() => resolve());
      else resolve();
    });
  }
}
```

**Step 3: Write tests**

`packages/daemon/src/__tests__/gateway-client.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GatewayClient } from '../gateway-client.js';
import { MockGateway } from '../mock-gateway.js';

describe('GatewayClient', () => {
  let mock: MockGateway;
  const PORT = 19789;

  beforeAll(async () => {
    mock = new MockGateway();
    await mock.start(PORT);
  });

  afterAll(async () => {
    await mock.stop();
  });

  it('connects to gateway and receives hello', async () => {
    const client = new GatewayClient({ url: `ws://127.0.0.1:${PORT}`, reconnect: false });
    const helloPromise = new Promise((resolve) => client.once('hello', resolve));
    await client.connect();
    const hello = await helloPromise;
    expect(hello).toHaveProperty('type', 'hello-ok');
    client.destroy();
  });

  it('calls sessions.list via RPC', async () => {
    const client = new GatewayClient({ url: `ws://127.0.0.1:${PORT}`, reconnect: false });
    await client.connect();
    const result = await client.rpc('sessions.list', { limit: 50 }) as { sessions: unknown[] };
    expect(result.sessions).toHaveLength(3);
    client.destroy();
  });

  it('calls cron.list via RPC', async () => {
    const client = new GatewayClient({ url: `ws://127.0.0.1:${PORT}`, reconnect: false });
    await client.connect();
    const result = await client.rpc('cron.list') as { jobs: unknown[] };
    expect(result.jobs).toHaveLength(3);
    client.destroy();
  });

  it('receives events', async () => {
    const client = new GatewayClient({ url: `ws://127.0.0.1:${PORT}`, reconnect: false });
    await client.connect();
    const eventPromise = new Promise((resolve) => client.once('gateway:event', resolve));
    // Mock gateway sends events periodically, wait for one
    const event = await Promise.race([eventPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))]);
    expect(event).toHaveProperty('event');
    client.destroy();
  });
});
```

**Step 4: Run tests**

Run: `cd packages/daemon && pnpm vitest run`

**Step 5: Commit**

```bash
git add packages/daemon/src/gateway-client.ts packages/daemon/src/mock-gateway.ts packages/daemon/src/__tests__/
git commit -m "feat: add OpenClaw Gateway WebSocket client and mock"
```

---

## Task 3: State Manager

**Files:**
- Create: `packages/daemon/src/state-manager.ts`
- Create: `packages/daemon/src/__tests__/state-manager.test.ts`

**Context:** The state manager holds in-memory state for all agents and their cron jobs. It implements:
- State priority: `error > offline > cron_running > working > idle`
- Idle detection: 120s threshold with 10s check interval
- Resync: full state replacement with sequence counter
- Emits events when state changes (for WebSocket broadcast to frontend)

**Step 1: Write tests**

`packages/daemon/src/__tests__/state-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateManager } from '../state-manager.js';

describe('StateManager', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = new StateManager({ idleThresholdMs: 2000 }); // 2s for fast tests
  });

  afterEach(() => {
    sm.destroy();
  });

  it('initializes with empty state', () => {
    const state = sm.getSnapshot();
    expect(state.agents).toHaveLength(0);
    expect(state.seq).toBe(0);
  });

  it('adds agents from sessions.list', () => {
    sm.syncAgents([
      { key: 'agent:main', displayName: 'Main Agent', model: 'claude-sonnet-4-5', updatedAt: Date.now() },
      { key: 'agent:ops', displayName: 'Ops Agent', model: 'claude-haiku-4-5', updatedAt: Date.now() },
    ]);
    const state = sm.getSnapshot();
    expect(state.agents).toHaveLength(2);
    expect(state.agents[0].id).toBe('main');
    expect(state.agents[0].status).toBe('idle');
  });

  it('updates agent to working on activity', () => {
    sm.syncAgents([{ key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() }]);
    sm.onAgentActivity('main');
    expect(sm.getAgent('main')?.status).toBe('working');
  });

  it('transitions to idle after threshold', async () => {
    vi.useFakeTimers();
    sm.syncAgents([{ key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() }]);
    sm.onAgentActivity('main');
    expect(sm.getAgent('main')?.status).toBe('working');

    vi.advanceTimersByTime(3000); // past 2s threshold
    sm.checkIdleAgents();
    expect(sm.getAgent('main')?.status).toBe('idle');
    vi.useRealTimers();
  });

  it('respects state priority', () => {
    sm.syncAgents([{ key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() }]);
    sm.onAgentActivity('main'); // working
    sm.onAgentError('main');    // error > working
    expect(sm.getAgent('main')?.status).toBe('error');
  });

  it('sets cron_running on cron start', () => {
    sm.syncAgents([{ key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() }]);
    sm.onCronRunStart('main', 'cron-1');
    expect(sm.getAgent('main')?.status).toBe('cron_running');
  });

  it('increments seq on every snapshot', () => {
    const s1 = sm.getSnapshot();
    sm.syncAgents([{ key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() }]);
    const s2 = sm.getSnapshot();
    expect(s2.seq).toBeGreaterThan(s1.seq);
  });

  it('syncs cron jobs', () => {
    sm.syncAgents([{ key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() }]);
    sm.syncCronJobs([
      { id: 'c1', name: 'Job 1', enabled: true, agentId: 'main',
        schedule: { kind: 'cron', expr: '0 7 * * *' },
        state: { nextRunAtMs: Date.now() + 3600000 } },
    ]);
    const agent = sm.getAgent('main');
    expect(agent?.cronJobs).toHaveLength(1);
    expect(agent?.cronJobs[0].name).toBe('Job 1');
  });

  it('sets all agents offline on gateway disconnect', () => {
    sm.syncAgents([
      { key: 'agent:main', displayName: 'Main', model: 'x', updatedAt: Date.now() },
      { key: 'agent:ops', displayName: 'Ops', model: 'x', updatedAt: Date.now() },
    ]);
    sm.onAgentActivity('main');
    sm.onGatewayDisconnect();
    expect(sm.getAgent('main')?.status).toBe('offline');
    expect(sm.getAgent('ops')?.status).toBe('offline');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/daemon && pnpm vitest run src/__tests__/state-manager.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement StateManager**

`packages/daemon/src/state-manager.ts`:

```typescript
import { EventEmitter } from 'events';
import type { AgentInfo, CronJob, GameState, AgentStatus } from './types.js';
import { STATUS_PRIORITY } from './types.js';

interface SessionRow {
  key: string;
  displayName?: string;
  model?: string;
  updatedAt: number | null;
}

interface InternalAgent {
  id: string;
  displayName: string;
  model: string;
  status: AgentStatus;
  lastActivityAt: number;
  cronJobs: CronJob[];
  activeCronRunId?: string;
  errorMessage?: string;
}

export interface StateManagerOptions {
  idleThresholdMs?: number;
  idleCheckIntervalMs?: number;
}

export class StateManager extends EventEmitter {
  private agents = new Map<string, InternalAgent>();
  private seq = 0;
  private idleThresholdMs: number;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private gatewayConnected = false;
  private gatewayUrl = '';

  constructor(options: StateManagerOptions = {}) {
    super();
    this.idleThresholdMs = options.idleThresholdMs ?? 120_000;
    const checkInterval = options.idleCheckIntervalMs ?? 10_000;
    this.idleCheckTimer = setInterval(() => this.checkIdleAgents(), checkInterval);
  }

  setGatewayInfo(url: string, connected: boolean): void {
    this.gatewayUrl = url;
    this.gatewayConnected = connected;
  }

  syncAgents(sessions: SessionRow[]): void {
    const newIds = new Set<string>();
    for (const session of sessions) {
      const id = session.key.replace('agent:', '');
      newIds.add(id);
      if (!this.agents.has(id)) {
        this.agents.set(id, {
          id,
          displayName: session.displayName ?? id,
          model: session.model ?? 'unknown',
          status: 'idle',
          lastActivityAt: session.updatedAt ?? Date.now(),
          cronJobs: [],
        });
      } else {
        const agent = this.agents.get(id)!;
        agent.displayName = session.displayName ?? id;
        agent.model = session.model ?? agent.model;
      }
    }
    // Remove agents no longer in the roster
    for (const id of this.agents.keys()) {
      if (!newIds.has(id)) this.agents.delete(id);
    }
    this.emitChange();
  }

  syncCronJobs(jobs: Array<{ id: string; name: string; enabled: boolean; agentId?: string; description?: string; schedule: CronJob['schedule']; state: Partial<CronJob['state']> }>): void {
    // Clear existing cron jobs
    for (const agent of this.agents.values()) {
      agent.cronJobs = [];
    }
    // Assign to agents
    for (const job of jobs) {
      const agentId = job.agentId ?? 'main';
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.cronJobs.push({
          id: job.id,
          name: job.name,
          description: job.description,
          enabled: job.enabled,
          schedule: job.schedule,
          state: {
            nextRunAtMs: job.state.nextRunAtMs,
            lastRunAtMs: job.state.lastRunAtMs,
            lastRunStatus: job.state.lastRunStatus as 'ok' | 'error' | 'skipped' | undefined,
            lastError: job.state.lastError,
            lastDurationMs: job.state.lastDurationMs,
            runningAtMs: job.state.runningAtMs,
          },
        });
      }
    }
    this.emitChange();
  }

  onAgentActivity(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.lastActivityAt = Date.now();
    this.setStatus(agent, 'working');
  }

  onAgentError(agentId: string, message?: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.errorMessage = message;
    this.setStatus(agent, 'error');
  }

  onCronRunStart(agentId: string, cronJobId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.activeCronRunId = cronJobId;
    agent.lastActivityAt = Date.now();
    this.setStatus(agent, 'cron_running');
  }

  onCronRunEnd(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.activeCronRunId = undefined;
    this.setStatus(agent, 'idle');
  }

  onGatewayDisconnect(): void {
    this.gatewayConnected = false;
    for (const agent of this.agents.values()) {
      agent.status = 'offline';
    }
    this.emitChange();
  }

  onGatewayReconnect(): void {
    this.gatewayConnected = true;
    // Agents will be re-synced via syncAgents after reconnect
  }

  checkIdleAgents(): void {
    const now = Date.now();
    for (const agent of this.agents.values()) {
      if (agent.status === 'working' && now - agent.lastActivityAt > this.idleThresholdMs) {
        this.setStatus(agent, 'idle');
      }
    }
  }

  private setStatus(agent: InternalAgent, newStatus: AgentStatus): void {
    // State priority check — only allow higher or equal priority to override
    // Exception: idle can always be set (it's the natural decay state)
    if (newStatus !== 'idle' && STATUS_PRIORITY[newStatus] < STATUS_PRIORITY[agent.status]) {
      return;
    }
    if (agent.status !== newStatus) {
      agent.status = newStatus;
      this.emitChange();
    }
  }

  getAgent(id: string): AgentInfo | undefined {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    return this.toAgentInfo(agent);
  }

  getSnapshot(): GameState {
    return {
      seq: ++this.seq,
      agents: Array.from(this.agents.values()).map((a) => this.toAgentInfo(a)),
      connectedToGateway: this.gatewayConnected,
      gatewayUrl: this.gatewayUrl,
      timestamp: Date.now(),
    };
  }

  private toAgentInfo(agent: InternalAgent): AgentInfo {
    return {
      id: agent.id,
      displayName: agent.displayName,
      status: agent.status,
      model: agent.model,
      lastActivityAt: agent.lastActivityAt,
      cronJobs: agent.cronJobs,
    };
  }

  private emitChange(): void {
    this.emit('change');
  }

  destroy(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }
}
```

**Step 4: Run tests**

Run: `cd packages/daemon && pnpm vitest run src/__tests__/state-manager.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/daemon/src/state-manager.ts packages/daemon/src/__tests__/state-manager.test.ts
git commit -m "feat: add state manager with priority rules and idle detection"
```

---

## Task 4: Daemon HTTP + WebSocket Server

**Files:**
- Create: `packages/daemon/src/server.ts`

**Context:** The daemon runs a Fastify HTTP server that:
1. Serves the built web frontend from `packages/web/dist/` as static files
2. Exposes a WebSocket endpoint at `/ws` for browser clients
3. Broadcasts state changes to all connected browser clients
4. Responds to `request:snapshot` messages with full state

**Step 1: Implement the server**

`packages/daemon/src/server.ts`:

```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import type { StateManager } from './state-manager.js';
import type { ServerMessage, ClientMessage } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DaemonServerOptions {
  port: number;
  host?: string;
  stateManager: StateManager;
  webDistPath?: string;
}

export class DaemonServer {
  private app = Fastify({ logger: false });
  private clients = new Set<WebSocket>();
  private stateManager: StateManager;
  private port: number;
  private host: string;

  constructor(options: DaemonServerOptions) {
    this.stateManager = options.stateManager;
    this.port = options.port;
    this.host = options.host ?? '127.0.0.1';
    const webDist = options.webDistPath ?? path.resolve(__dirname, '../../web/dist');

    // Register plugins
    this.app.register(fastifyWebsocket);
    this.app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: false,
    });

    // WebSocket route
    this.app.register(async (app) => {
      app.get('/ws', { websocket: true }, (socket) => {
        this.clients.add(socket);

        // Send initial snapshot
        this.send(socket, { type: 'snapshot', data: this.stateManager.getSnapshot() });

        socket.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString()) as ClientMessage;
            if (msg.type === 'request:snapshot') {
              this.send(socket, { type: 'snapshot', data: this.stateManager.getSnapshot() });
            }
          } catch { /* ignore bad messages */ }
        });

        socket.on('close', () => this.clients.delete(socket));
      });
    });

    // Listen for state changes and broadcast
    this.stateManager.on('change', () => {
      this.broadcast({ type: 'snapshot', data: this.stateManager.getSnapshot() });
    });
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  async start(): Promise<string> {
    await this.app.listen({ port: this.port, host: this.host });
    return `http://${this.host}:${this.port}`;
  }

  async stop(): Promise<void> {
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    await this.app.close();
  }
}
```

**Step 2: Commit**

```bash
git add packages/daemon/src/server.ts
git commit -m "feat: add daemon Fastify server with WebSocket and static file serving"
```

---

## Task 5: Daemon Orchestrator + CLI

**Files:**
- Create: `packages/daemon/src/daemon.ts`
- Create: `packages/daemon/src/cli.ts`

**Context:** The daemon orchestrator wires together the GatewayClient, StateManager, and DaemonServer. The CLI provides `start`, `stop`, `open`, `status` commands with a `--mock` flag for development.

**Step 1: Implement daemon orchestrator**

`packages/daemon/src/daemon.ts`:

```typescript
import { GatewayClient } from './gateway-client.js';
import { StateManager } from './state-manager.js';
import { DaemonServer } from './server.js';
import { MockGateway } from './mock-gateway.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DaemonOptions {
  gatewayUrl: string;
  port: number;
  mock?: boolean;
  idleThresholdMs?: number;
  webDistPath?: string;
}

const STATE_DIR = path.join(os.homedir(), '.clawgame');
const STATE_FILE = path.join(STATE_DIR, 'daemon.state.json');

export class Daemon {
  private gateway: GatewayClient;
  private state: StateManager;
  private server: DaemonServer;
  private mockGateway: MockGateway | null = null;
  private cronRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private options: DaemonOptions;

  constructor(options: DaemonOptions) {
    this.options = options;
    this.gateway = new GatewayClient({
      url: options.gatewayUrl,
      reconnect: true,
    });
    this.state = new StateManager({
      idleThresholdMs: options.idleThresholdMs,
    });
    this.server = new DaemonServer({
      port: options.port,
      stateManager: this.state,
      webDistPath: options.webDistPath,
    });

    this.wireEvents();
  }

  private wireEvents(): void {
    this.gateway.on('connected', async () => {
      this.state.setGatewayInfo(this.options.gatewayUrl, true);
      this.state.onGatewayReconnect();
      await this.fullSync();
    });

    this.gateway.on('disconnected', () => {
      this.state.onGatewayDisconnect();
    });

    // Agent activity events
    this.gateway.on('gateway:agent', (payload: { runId: string; stream: string; data: Record<string, unknown> }) => {
      // Agent events don't directly contain agentId in payload;
      // we infer activity from any agent event arriving.
      // For MVP, map all agent events to the 'main' agent or use runId tracking.
      // A more complete implementation would track runId → agentId mapping.
      // For now, mark all known agents based on presence tags.
      for (const [id] of this.state['agents']) {
        // Simple heuristic: if we get an agent event, something is working
        // Real implementation: track which agent the runId belongs to
      }
    });

    // Presence events tell us which agents are connected
    this.gateway.on('gateway:presence', (payload: { presence: Array<{ tags?: string[]; text?: string }> }) => {
      if (payload.presence) {
        for (const entry of payload.presence) {
          const agentTag = entry.tags?.find((t: string) => t.startsWith('agent:'));
          if (agentTag) {
            const agentId = agentTag.replace('agent:', '');
            const isActive = entry.tags?.includes('active');
            if (isActive) {
              this.state.onAgentActivity(agentId);
            }
          }
        }
      }
    });

    // Cron events
    this.gateway.on('gateway:cron', (payload: { type: string; jobId: string; agentId?: string }) => {
      if (payload.type === 'run:start' && payload.agentId) {
        this.state.onCronRunStart(payload.agentId, payload.jobId);
      } else if (payload.type === 'run:end' && payload.agentId) {
        this.state.onCronRunEnd(payload.agentId);
        this.refreshCronJobs(); // re-fetch to update nextRunAt
      }
    });
  }

  private async fullSync(): Promise<void> {
    try {
      // Fetch all sessions (agents)
      const sessionsResult = await this.gateway.rpc('sessions.list', { limit: 100 }) as {
        sessions: Array<{ key: string; displayName?: string; model?: string; updatedAt: number | null }>;
      };
      this.state.syncAgents(sessionsResult.sessions.filter((s) => s.key.startsWith('agent:')));

      // Fetch all cron jobs
      await this.refreshCronJobs();
    } catch (err) {
      console.error('Full sync failed:', err);
    }
  }

  private async refreshCronJobs(): Promise<void> {
    try {
      const cronResult = await this.gateway.rpc('cron.list', { limit: 200 }) as {
        jobs: Array<{ id: string; name: string; enabled: boolean; agentId?: string; description?: string; schedule: unknown; state: unknown }>;
      };
      this.state.syncCronJobs(cronResult.jobs as Parameters<StateManager['syncCronJobs']>[0]);
    } catch (err) {
      console.error('Cron refresh failed:', err);
    }
  }

  async start(): Promise<string> {
    // Start mock gateway if needed
    if (this.options.mock) {
      this.mockGateway = new MockGateway();
      const mockPort = parseInt(new URL(this.options.gatewayUrl).port);
      await this.mockGateway.start(mockPort);
      console.log(`Mock gateway started on port ${mockPort}`);
    }

    // Start the HTTP+WS server
    const url = await this.server.start();

    // Connect to OpenClaw gateway
    try {
      await this.gateway.connect();
    } catch (err) {
      console.error(`Failed to connect to gateway at ${this.options.gatewayUrl}:`, err);
      if (!this.options.mock) {
        console.log('Tip: use --mock to run with a simulated gateway');
      }
    }

    // Periodically refresh cron jobs
    this.cronRefreshTimer = setInterval(() => this.refreshCronJobs(), 60_000);

    // Write state file
    this.writeStateFile(url);

    return url;
  }

  async stop(): Promise<void> {
    if (this.cronRefreshTimer) clearInterval(this.cronRefreshTimer);
    this.gateway.destroy();
    this.state.destroy();
    await this.server.stop();
    if (this.mockGateway) await this.mockGateway.stop();
    this.removeStateFile();
  }

  private writeStateFile(url: string): void {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      pid: process.pid,
      url,
      port: this.options.port,
      gatewayUrl: this.options.gatewayUrl,
      mock: this.options.mock ?? false,
      version: '0.1.0',
      startedAt: new Date().toISOString(),
    }, null, 2));
  }

  private removeStateFile(): void {
    try { fs.unlinkSync(STATE_FILE); } catch { /* ignore */ }
  }

  static readStateFile(): { pid: number; url: string; port: number; mock: boolean } | null {
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      // Check if process is still alive
      try { process.kill(data.pid, 0); } catch { return null; }
      return data;
    } catch { return null; }
  }
}
```

**Step 2: Implement CLI**

`packages/daemon/src/cli.ts`:

```typescript
#!/usr/bin/env node
import { Daemon } from './daemon.js';

const args = process.argv.slice(2);
const command = args[0] ?? 'start';

const flags = {
  mock: args.includes('--mock'),
  port: parseInt(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '3333'),
  gateway: args.find((a) => a.startsWith('--gateway='))?.split('=')[1] ?? 'ws://127.0.0.1:18789',
};

async function main() {
  switch (command) {
    case 'start': {
      const existing = Daemon.readStateFile();
      if (existing) {
        console.log(`Daemon already running (PID ${existing.pid}) at ${existing.url}`);
        process.exit(1);
      }

      const daemon = new Daemon({
        gatewayUrl: flags.mock ? `ws://127.0.0.1:${flags.port + 1}` : flags.gateway,
        port: flags.port,
        mock: flags.mock,
      });

      const url = await daemon.start();
      console.log(`ClawGame running at ${url}`);
      console.log(`Gateway: ${flags.mock ? 'mock' : flags.gateway}`);
      console.log('Press Ctrl+C to stop');

      const shutdown = async () => {
        console.log('\nShutting down...');
        await daemon.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      break;
    }

    case 'stop': {
      const state = Daemon.readStateFile();
      if (!state) {
        console.log('No daemon running');
        process.exit(1);
      }
      try {
        process.kill(state.pid, 'SIGTERM');
        console.log(`Stopped daemon (PID ${state.pid})`);
      } catch {
        console.log('Daemon process not found, cleaning up');
      }
      break;
    }

    case 'status': {
      const state = Daemon.readStateFile();
      if (!state) {
        console.log('No daemon running');
      } else {
        console.log(`Daemon running (PID ${state.pid})`);
        console.log(`URL: ${state.url}`);
        console.log(`Mock: ${state.mock}`);
      }
      break;
    }

    case 'open': {
      const state = Daemon.readStateFile();
      if (!state) {
        console.log('No daemon running. Start with: clawgame start');
        process.exit(1);
      }
      const open = (await import('open')).default;
      await open(state.url);
      break;
    }

    default:
      console.log('Usage: clawgame [start|stop|status|open] [--mock] [--port=3333] [--gateway=ws://...]');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 3: Commit**

```bash
git add packages/daemon/src/daemon.ts packages/daemon/src/cli.ts
git commit -m "feat: add daemon orchestrator and CLI with mock mode"
```

---

## Task 6: Web Frontend Scaffolding

**Files:**
- Create: `packages/web/index.html`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/App.css`
- Create: `packages/web/src/types.ts` (copy of shared types, JSON-only — no Zod on frontend)

**Step 1: Create Vite config**

`packages/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3333', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
```

`packages/web/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClawGame</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 2: Create React entry**

`packages/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`packages/web/src/App.tsx`:
```tsx
import { useState, useCallback } from 'react';
import { PhaserGame } from './game/PhaserGame';
import { AgentPanel } from './components/AgentPanel';
import { useGameState } from './hooks/useGameState';
import type { AgentInfo } from './types';

export default function App() {
  const { gameState, connected } = useGameState();
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);

  const handleAgentClick = useCallback((agentId: string) => {
    const agent = gameState?.agents.find((a) => a.id === agentId) ?? null;
    setSelectedAgent(agent);
  }, [gameState]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Connection status */}
      {!connected && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: '#e74c3c', color: 'white', padding: '4px 12px', borderRadius: 4,
          fontSize: 12, zIndex: 100,
        }}>
          Reconnecting...
        </div>
      )}

      {/* Phaser game canvas */}
      <PhaserGame agents={gameState?.agents ?? []} onAgentClick={handleAgentClick} />

      {/* Agent detail panel overlay */}
      {selectedAgent && (
        <AgentPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}
```

`packages/web/src/App.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

.pixel-font {
  font-family: 'Press Start 2P', monospace;
}
```

**Step 3: Create frontend types (JSON-safe copy of daemon types)**

`packages/web/src/types.ts`:
```typescript
export type AgentStatus = 'error' | 'offline' | 'cron_running' | 'working' | 'idle';

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: 'at'; at: string } | { kind: 'every'; everyMs: number } | { kind: 'cron'; expr: string; tz?: string };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastRunStatus?: 'ok' | 'error' | 'skipped';
    lastError?: string;
    lastDurationMs?: number;
    runningAtMs?: number;
  };
}

export interface AgentInfo {
  id: string;
  displayName: string;
  status: AgentStatus;
  model?: string;
  lastActivityAt: number;
  cronJobs: CronJob[];
}

export interface GameState {
  seq: number;
  agents: AgentInfo[];
  connectedToGateway: boolean;
  gatewayUrl: string;
  timestamp: number;
}

export interface ServerMessage {
  type: 'snapshot' | 'agent:update' | 'connection:status';
  data?: GameState | AgentInfo;
  connected?: boolean;
}
```

**Step 4: Commit**

```bash
git add packages/web/
git commit -m "feat: scaffold web frontend with Vite, React, and shared types"
```

---

## Task 7: Phaser Office Scene + Agent Characters

**Files:**
- Create: `packages/web/src/game/PhaserGame.tsx`
- Create: `packages/web/src/game/OfficeScene.ts`
- Create: `packages/web/src/game/AgentCharacter.ts`
- Create: `packages/web/src/game/SpriteGenerator.ts`
- Create: `packages/web/src/game/GameBridge.ts`

**Context:** The Phaser game renders a top-down pixel art office. Characters are generated programmatically (no external sprite sheets). The GameBridge connects React state to Phaser scene updates.

**Step 1: Create the sprite generator**

`packages/web/src/game/SpriteGenerator.ts` — Generates 16x16 pixel character textures with color palette swaps:

```typescript
import Phaser from 'phaser';

// Base character pixel pattern (16x16), 0 = transparent
// Simple top-down humanoid: head + body + legs
const BASE_PATTERN = [
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,3,3,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,2,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,4,4,1,1,0,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0],
  [0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,5,5,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,5,5,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,5,0,0,5,1,0,0,0,0,0],
  [0,0,0,0,0,1,6,0,0,6,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0],
];

// Sitting variant (shorter, no legs visible)
const SITTING_PATTERN = [
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,3,3,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,2,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,4,4,1,1,0,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,0,1,4,4,4,4,4,4,1,0,0,0,0],
  [0,0,0,0,0,1,4,4,4,4,1,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// Color palettes per agent (deterministic from ID hash)
const PALETTES = [
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0x4A90D9, pants: 0x2C3E50, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0xE74C3C, pants: 0x34495E, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0x2ECC71, pants: 0x2C3E50, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0xF39C12, pants: 0x34495E, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0x9B59B6, pants: 0x2C3E50, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0x1ABC9C, pants: 0x34495E, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0xE67E22, pants: 0x2C3E50, shoes: 0x5D4E37 },
  { outline: 0x333333, skin: 0xFFDBAC, eyes: 0x333333, shirt: 0x3498DB, pants: 0x34495E, shoes: 0x5D4E37 },
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function generateCharacterTextures(scene: Phaser.Scene, agentId: string): void {
  const palette = PALETTES[hashString(agentId) % PALETTES.length];
  const colorMap: Record<number, number> = {
    1: palette.outline, 2: palette.skin, 3: palette.eyes,
    4: palette.shirt, 5: palette.pants, 6: palette.shoes,
  };

  const drawPattern = (key: string, pattern: number[][]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = pattern[y][x];
        if (idx > 0) {
          const color = colorMap[idx];
          ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    scene.textures.addCanvas(key, canvas);
  };

  drawPattern(`agent-${agentId}-stand`, BASE_PATTERN);
  drawPattern(`agent-${agentId}-sit`, SITTING_PATTERN);
}
```

**Step 2: Create the GameBridge**

`packages/web/src/game/GameBridge.ts`:

```typescript
import { EventEmitter } from 'events';
import type { AgentInfo } from '../types';

// Singleton event bridge between React and Phaser
class GameBridgeClass extends EventEmitter {
  updateAgents(agents: AgentInfo[]): void {
    this.emit('agents:update', agents);
  }

  notifyAgentClick(agentId: string): void {
    this.emit('agent:click', agentId);
  }
}

export const GameBridge = new GameBridgeClass();
```

**Step 3: Create the AgentCharacter class**

`packages/web/src/game/AgentCharacter.ts`:

```typescript
import Phaser from 'phaser';
import type { AgentStatus } from '../types';
import { GameBridge } from './GameBridge';

interface DeskPosition {
  x: number;
  y: number;
}

interface CoffeePosition {
  x: number;
  y: number;
}

export class AgentCharacter {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Text | null = null;
  private id: string;
  private currentStatus: AgentStatus = 'idle';
  private deskPos: DeskPosition;
  private coffeePos: CoffeePosition;
  private moveTarget: { x: number; y: number } | null = null;
  private typingTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    scene: Phaser.Scene,
    id: string,
    displayName: string,
    deskPos: DeskPosition,
    coffeePos: CoffeePosition,
  ) {
    this.scene = scene;
    this.id = id;
    this.deskPos = deskPos;
    this.coffeePos = coffeePos;

    // Create sprite at coffee position (default idle)
    this.sprite = scene.add.sprite(coffeePos.x, coffeePos.y, `agent-${id}-stand`);
    this.sprite.setScale(2);
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => GameBridge.notifyAgentClick(id));

    // Name label
    this.nameLabel = scene.add.text(coffeePos.x, coffeePos.y + 20, displayName, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0);
  }

  setStatus(status: AgentStatus): void {
    if (status === this.currentStatus) return;
    const prev = this.currentStatus;
    this.currentStatus = status;

    // Clear existing status icon
    if (this.statusIcon) { this.statusIcon.destroy(); this.statusIcon = null; }
    if (this.typingTimer) { this.typingTimer.destroy(); this.typingTimer = null; }

    switch (status) {
      case 'working':
      case 'cron_running':
        this.moveTo(this.deskPos, () => {
          this.sprite.setTexture(`agent-${this.id}-sit`);
          this.startTypingAnimation();
          if (status === 'cron_running') {
            this.showStatusIcon('\u{23F0}'); // alarm clock emoji
          }
        });
        break;
      case 'idle':
        this.moveTo(this.coffeePos, () => {
          this.sprite.setTexture(`agent-${this.id}-stand`);
          this.showStatusIcon('\u{2615}'); // coffee emoji
        });
        break;
      case 'error':
        this.moveTo(this.deskPos, () => {
          this.sprite.setTexture(`agent-${this.id}-sit`);
          this.showStatusIcon('\u{26A0}'); // warning emoji
        });
        break;
      case 'offline':
        this.sprite.setAlpha(0.3);
        this.showStatusIcon('\u{1F4A4}'); // zzz emoji
        break;
    }
  }

  private moveTo(target: { x: number; y: number }, onComplete?: () => void): void {
    this.sprite.setAlpha(1);
    const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
    if (dist < 4) {
      this.sprite.setPosition(target.x, target.y);
      this.nameLabel.setPosition(target.x, target.y + 20);
      onComplete?.();
      return;
    }

    this.sprite.setTexture(`agent-${this.id}-stand`);
    this.scene.tweens.add({
      targets: [this.sprite],
      x: target.x,
      y: target.y,
      duration: Math.max(300, dist * 3),
      ease: 'Power1',
      onUpdate: () => {
        this.nameLabel.setPosition(this.sprite.x, this.sprite.y + 20);
        if (this.statusIcon) {
          this.statusIcon.setPosition(this.sprite.x + 12, this.sprite.y - 16);
        }
      },
      onComplete: () => onComplete?.(),
    });
  }

  private startTypingAnimation(): void {
    const dots = ['', '.', '..', '...'];
    let i = 0;
    this.typingTimer = this.scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        // Toggle between sit textures to simulate typing
        this.sprite.setTexture(`agent-${this.id}-sit`);
        i = (i + 1) % dots.length;
      },
    });
  }

  private showStatusIcon(emoji: string): void {
    this.statusIcon = this.scene.add.text(
      this.sprite.x + 12, this.sprite.y - 16, emoji,
      { fontSize: '12px' },
    ).setOrigin(0.5, 0.5);
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
    if (this.statusIcon) this.statusIcon.destroy();
    if (this.typingTimer) this.typingTimer.destroy();
  }
}
```

**Step 4: Create the Office Scene**

`packages/web/src/game/OfficeScene.ts`:

```typescript
import Phaser from 'phaser';
import { AgentCharacter } from './AgentCharacter';
import { GameBridge } from './GameBridge';
import { generateCharacterTextures } from './SpriteGenerator';
import type { AgentInfo } from '../types';

const TILE = 32;
const DESK_COLOR = 0x8B6914;
const FLOOR_COLOR = 0xD2B48C;
const WALL_COLOR = 0x4A4A4A;
const COFFEE_BAR_COLOR = 0x6B3A2A;

export class OfficeScene extends Phaser.Scene {
  private characters = new Map<string, AgentCharacter>();
  private deskPositions: Array<{ x: number; y: number }> = [];
  private coffeeArea = { x: 0, y: 0 };

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.drawOffice();

    // Listen for state updates from React
    GameBridge.on('agents:update', (agents: AgentInfo[]) => this.updateAgents(agents));

    this.events.emit('scene-ready');
  }

  private drawOffice(): void {
    const g = this.add.graphics();
    const cols = 4;
    const rows = 2;
    const officeW = (cols * 3 + 1) * TILE;
    const officeH = (rows * 3 + 5) * TILE;

    // Floor
    g.fillStyle(FLOOR_COLOR);
    g.fillRect(0, 0, officeW, officeH);

    // Walls
    g.fillStyle(WALL_COLOR);
    g.fillRect(0, 0, officeW, TILE); // top
    g.fillRect(0, 0, TILE, officeH); // left
    g.fillRect(officeW - TILE, 0, TILE, officeH); // right
    g.fillRect(0, officeH - TILE, officeW, TILE); // bottom

    // Desks (2 rows x 4 cols)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = TILE * 2 + col * TILE * 3;
        const dy = TILE * 2 + row * TILE * 3;
        g.fillStyle(DESK_COLOR);
        g.fillRect(dx, dy, TILE * 2, TILE);
        this.deskPositions.push({ x: dx + TILE, y: dy + TILE + 8 });
      }
    }

    // Coffee bar area
    const coffeeY = officeH - TILE * 3;
    g.fillStyle(COFFEE_BAR_COLOR);
    g.fillRect(TILE * 2, coffeeY, TILE * 4, TILE);
    this.coffeeArea = { x: TILE * 4, y: coffeeY + TILE + 16 };

    // Coffee bar label
    this.add.text(TILE * 2 + 4, coffeeY + 4, 'COFFEE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFD700',
    });

    // Schedule board
    g.fillStyle(0x2C3E50);
    g.fillRect(TILE * 8, coffeeY, TILE * 4, TILE);
    this.add.text(TILE * 8 + 4, coffeeY + 4, 'SCHEDULE', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ECF0F1',
    });

    // Set camera bounds
    this.cameras.main.setBounds(0, 0, officeW, officeH);

    // Title
    this.add.text(officeW / 2, TILE / 2, 'ClawGame Office', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FFD700',
    }).setOrigin(0.5);
  }

  private updateAgents(agents: AgentInfo[]): void {
    const currentIds = new Set(agents.map((a) => a.id));

    // Remove characters for agents no longer present
    for (const [id, char] of this.characters) {
      if (!currentIds.has(id)) {
        char.destroy();
        this.characters.delete(id);
      }
    }

    // Add/update characters
    agents.forEach((agent, index) => {
      if (!this.characters.has(agent.id)) {
        // Generate textures for new agent
        generateCharacterTextures(this, agent.id);

        const deskPos = this.deskPositions[index % this.deskPositions.length];
        const coffeePos = {
          x: this.coffeeArea.x + (index % 4) * 24 - 36,
          y: this.coffeeArea.y,
        };

        const character = new AgentCharacter(
          this, agent.id, agent.displayName, deskPos, coffeePos,
        );
        this.characters.set(agent.id, character);
      }

      this.characters.get(agent.id)!.setStatus(agent.status);
    });
  }
}
```

**Step 5: Create PhaserGame React wrapper**

`packages/web/src/game/PhaserGame.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OfficeScene } from './OfficeScene';
import { GameBridge } from './GameBridge';
import type { AgentInfo } from '../types';

interface PhaserGameProps {
  agents: AgentInfo[];
  onAgentClick: (agentId: string) => void;
}

export function PhaserGame({ agents, onAgentClick }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 800,
      height: 480,
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      backgroundColor: '#1a1a2e',
      scene: [OfficeScene],
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Push agent state to Phaser whenever it changes
  useEffect(() => {
    GameBridge.updateAgents(agents);
  }, [agents]);

  // Listen for agent clicks from Phaser
  useEffect(() => {
    GameBridge.on('agent:click', onAgentClick);
    return () => { GameBridge.off('agent:click', onAgentClick); };
  }, [onAgentClick]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```

**Step 6: Commit**

```bash
git add packages/web/src/game/
git commit -m "feat: add Phaser office scene with agent characters and sprite generation"
```

---

## Task 8: WebSocket Hook + React UI Components

**Files:**
- Create: `packages/web/src/hooks/useGameState.ts`
- Create: `packages/web/src/components/AgentPanel.tsx`

**Step 1: WebSocket hook**

`packages/web/src/hooks/useGameState.ts`:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, ServerMessage } from '../types';

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'snapshot' && msg.data) {
          setGameState(msg.data as GameState);
        } else if (msg.type === 'connection:status') {
          // gateway connection status from daemon
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { gameState, connected };
}
```

**Step 2: Agent detail panel**

`packages/web/src/components/AgentPanel.tsx`:

```tsx
import type { AgentInfo, CronJob } from '../types';

interface AgentPanelProps {
  agent: AgentInfo;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  working: '#2ecc71',
  idle: '#95a5a6',
  cron_running: '#3498db',
  error: '#e74c3c',
  offline: '#7f8c8d',
};

export function AgentPanel({ agent, onClose }: AgentPanelProps) {
  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 320,
      background: 'rgba(26, 26, 46, 0.95)', color: '#ecf0f1',
      padding: 16, overflowY: 'auto', zIndex: 50,
      borderLeft: '2px solid #34495e',
      fontFamily: '"Press Start 2P", monospace', fontSize: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span>{agent.displayName}</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#ecf0f1',
          cursor: 'pointer', fontSize: 14,
        }}>X</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: STATUS_COLORS[agent.status] ?? '#95a5a6',
          }} />
          <span>{agent.status.toUpperCase()}</span>
        </div>
        <div style={{ color: '#7f8c8d', marginBottom: 2 }}>ID: {agent.id}</div>
        {agent.model && <div style={{ color: '#7f8c8d' }}>Model: {agent.model}</div>}
      </div>

      <div style={{ borderTop: '1px solid #34495e', paddingTop: 12 }}>
        <div style={{ marginBottom: 8 }}>CRON SCHEDULE</div>
        {agent.cronJobs.length === 0 && <div style={{ color: '#7f8c8d' }}>No scheduled jobs</div>}
        {agent.cronJobs.map((job) => (
          <CronJobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

function CronJobRow({ job }: { job: CronJob }) {
  const scheduleStr = job.schedule.kind === 'cron'
    ? job.schedule.expr + (job.schedule.tz ? ` (${job.schedule.tz})` : '')
    : job.schedule.kind === 'every'
      ? `every ${Math.round(job.schedule.everyMs / 60000)}m`
      : `at ${job.schedule.at}`;

  const nextRun = job.state.nextRunAtMs
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(job.state.nextRunAtMs))
    : '-';

  const lastStatus = job.state.lastRunStatus ?? '-';
  const statusColor = lastStatus === 'ok' ? '#2ecc71' : lastStatus === 'error' ? '#e74c3c' : '#95a5a6';

  return (
    <div style={{
      background: '#2c3e50', padding: 8, marginBottom: 6, borderRadius: 4,
    }}>
      <div style={{ marginBottom: 4 }}>{job.name}</div>
      <div style={{ color: '#7f8c8d', fontSize: 8 }}>
        <div>{scheduleStr}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span>Next: {nextRun}</span>
          <span style={{ color: statusColor }}>Last: {lastStatus}</span>
        </div>
        {job.state.lastError && (
          <div style={{ color: '#e74c3c', marginTop: 2, wordBreak: 'break-all' }}>
            {job.state.lastError}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/web/src/hooks/ packages/web/src/components/
git commit -m "feat: add WebSocket hook and agent detail panel UI"
```

---

## Task 9: Integration + Build Pipeline

**Files:**
- Modify: `packages/daemon/package.json` (add build:web script)
- Modify: `packages/web/tsconfig.json`
- Create: `packages/web/src/vite-env.d.ts`

**Step 1: Add TypeScript declaration for Vite**

`packages/web/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

`packages/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

**Step 2: Build the web frontend**

Run: `cd packages/web && pnpm build`

**Step 3: Start the daemon in mock mode**

Run: `cd packages/daemon && pnpm dev -- start --mock`

Expected:
```
Mock gateway started on port 3334
ClawGame running at http://127.0.0.1:3333
Gateway: mock
```

**Step 4: Open in browser**

Open `http://127.0.0.1:3333` — should see pixel art office with 3 mock agents cycling between working/idle states.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire up full MVP-Lite with build pipeline and mock mode"
```

---

## Task Summary

| Task | Description | Dependency |
|------|-------------|------------|
| 1 | Monorepo scaffolding + shared types | None |
| 2 | OpenClaw Gateway WebSocket client + mock | Task 1 |
| 3 | State manager with priority/idle/resync | Task 1 |
| 4 | Daemon HTTP + WebSocket server | Task 1 |
| 5 | Daemon orchestrator + CLI | Tasks 2, 3, 4 |
| 6 | Web frontend scaffolding | Task 1 |
| 7 | Phaser office scene + agent characters | Task 6 |
| 8 | WebSocket hook + React UI | Task 6 |
| 9 | Integration + build pipeline | Tasks 5, 7, 8 |

**Parallelization:** After Task 1, Tasks 2-4 (backend) and Tasks 6-8 (frontend) can run in parallel. Task 5 depends on 2-4. Task 9 depends on 5+7+8.
