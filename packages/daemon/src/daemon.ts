import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GatewayClient } from './gateway-client.js';
import { MockGateway } from './mock-gateway.js';
import { StateManager } from './state-manager.js';
import { DaemonServer } from './server.js';
import { DataCache } from './cache.js';
import type { CronJob } from './types.js';

interface DaemonOptions {
  port: number;
  gatewayUrl: string;
  mock: boolean;
  token?: string;
}

interface StateFile {
  pid: number;
  url: string;
  port: number;
  version: string;
}

interface GatewaySessionRow {
  key: string;
  kind?: string;
  displayName?: string;
  model?: string;
  updatedAt?: number | null;
}

interface SessionsListResult {
  ts: number;
  path: string;
  count: number;
  defaults: unknown;
  sessions: GatewaySessionRow[];
}

interface CronListResult {
  jobs: CronJob[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

interface Session {
  key: string;
  agentId: string;
  displayName: string;
  model?: string;
}

const STATE_DIR = path.join(os.homedir(), '.clawgame');
const STATE_FILE = path.join(STATE_DIR, 'daemon.state.json');
const CRON_REFRESH_INTERVAL = 60_000;

export class Daemon {
  private gateway: GatewayClient;
  private mockGateway: MockGateway | null = null;
  private stateManager: StateManager;
  private server: DaemonServer;
  private cronRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private agentIdentityCache = new DataCache<unknown>(5 * 60_000);
  private modelsCache = new DataCache<unknown>(10 * 60_000);
  private opts: DaemonOptions;

  constructor(opts: DaemonOptions) {
    this.opts = opts;
    this.gateway = new GatewayClient({
      url: opts.gatewayUrl,
      skipDeviceIdentity: opts.mock,
      token: opts.token,
    });
    this.stateManager = new StateManager(opts.gatewayUrl);
    this.server = new DaemonServer(this.stateManager, (method, params) => this.gateway.rpc(method, params), opts.port);
  }

  async start(): Promise<string> {
    // Start mock gateway if needed
    if (this.opts.mock) {
      this.mockGateway = new MockGateway();
      const mockPort = parseInt(new URL(this.opts.gatewayUrl).port, 10);
      await this.mockGateway.start(mockPort);
      console.log(`Mock gateway started on port ${mockPort}`);
    }

    // Wire gateway events
    this.gateway.on('connected', async () => {
      console.log('Connected to gateway');
      this.stateManager.onGatewayConnect();
      await this.syncFromGateway();
    });

    this.gateway.on('disconnected', () => {
      console.log('Disconnected from gateway');
      this.stateManager.onGatewayDisconnect();
    });

    this.gateway.on('error', (err: Error) => {
      // Suppress ECONNREFUSED noise during reconnect
      if (!('code' in err && (err as NodeJS.ErrnoException).code === 'ECONNREFUSED')) {
        console.error('Gateway error:', err.message);
      }
    });

    // "agent" event — covers tool, assistant, error, lifecycle streams
    this.gateway.on('gateway:agent', (payload: {
      runId: string; seq: number; stream: string;
      ts: number; data: Record<string, unknown>; sessionKey?: string;
    }) => {
      const agentId = this.sessionKeyToAgentId(payload.sessionKey);
      if (!agentId) return;

      switch (payload.stream) {
        case 'tool': {
          const toolName = (payload.data?.toolName as string) ?? 'unknown';
          const state = payload.data?.result !== undefined ? 'end' : 'start';
          this.stateManager.onToolEvent(agentId, toolName, state);
          break;
        }
        case 'assistant':
          this.stateManager.onAgentActivity(agentId);
          break;
        case 'error':
          this.stateManager.onAgentError(agentId);
          break;
        case 'lifecycle':
          this.stateManager.onAgentActivity(agentId);
          break;
      }
    });

    // "chat" event — streamed chat messages
    this.gateway.on('gateway:chat', (payload: {
      runId: string; sessionKey: string; seq: number;
      state: 'delta' | 'final' | 'aborted' | 'error';
      message?: { role: string; content: Array<{ type: string; text: string }>; timestamp: number };
      errorMessage?: string;
    }) => {
      const agentId = this.sessionKeyToAgentId(payload.sessionKey);
      if (!agentId) return;
      const text = payload.message?.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('') ?? payload.errorMessage ?? '';
      this.stateManager.onChatEvent(agentId, {
        runId: payload.runId,
        sessionKey: payload.sessionKey,
        role: 'assistant',
        content: text,
        state: payload.state,
        timestamp: Date.now(),
      });
    });

    // "cron" event — single event with action field
    this.gateway.on('gateway:cron', (payload: {
      ts: number; jobId: string; action: string;
      status?: string; sessionKey?: string;
    }) => {
      const agentId = payload.sessionKey
        ? this.sessionKeyToAgentId(payload.sessionKey)
        : this.findAgentByJobId(payload.jobId);
      if (!agentId) return;
      if (payload.action === 'finished') {
        this.stateManager.onCronRunEnd(agentId);
      }
    });

    // "presence" event — system-level connected devices snapshot
    this.gateway.on('gateway:presence', (payload: {
      presence?: Array<Record<string, unknown>>;
    }) => {
      this.stateManager.onSystemPresence((payload.presence ?? []) as any[]);
    });

    // Start idle checker
    this.stateManager.startIdleChecker();

    // Start server
    const address = await this.server.start();
    console.log(`Daemon server listening at ${address}`);

    // Connect to gateway
    this.gateway.connect();

    // Periodic cron refresh
    this.cronRefreshTimer = setInterval(async () => {
      try {
        const cronPayload = await this.gateway.rpc('cron.list');
        const jobs = this.extractCronJobs(cronPayload);
        this.stateManager.syncCronJobs(jobs);
      } catch {
        // ignore refresh failures
      }
    }, CRON_REFRESH_INTERVAL);

    // Write state file
    const url = `http://localhost:${this.opts.port}`;
    this.writeStateFile({ pid: process.pid, url, port: this.opts.port, version: '0.1.0' });

    return url;
  }

  async stop(): Promise<void> {
    if (this.cronRefreshTimer) {
      clearInterval(this.cronRefreshTimer);
      this.cronRefreshTimer = null;
    }
    this.stateManager.stopIdleChecker();
    this.gateway.destroy();
    if (this.mockGateway) {
      this.mockGateway.stop();
    }
    await this.server.stop();
    this.removeStateFile();
  }

  private async syncFromGateway(): Promise<void> {
    try {
      const sessionsPayload = await this.gateway.rpc('sessions.list');
      const sessions = this.extractSessions(sessionsPayload);
      this.stateManager.syncAgents(sessions);

      const cronPayload = await this.gateway.rpc('cron.list');
      const jobs = this.extractCronJobs(cronPayload);
      this.stateManager.syncCronJobs(jobs);

      try {
        const agentsPayload = await this.gateway.rpc('agents.list') as { agents?: Array<{ id: string; name?: string; workspace?: string }> };
        const agents = Array.isArray(agentsPayload) ? agentsPayload : (agentsPayload?.agents ?? []);
        this.stateManager.syncAgentIdentities(agents);
      } catch {
        // agents.list may not be available on older gateways
      }
    } catch (err) {
      console.error('Failed to sync from gateway:', (err as Error).message);
    }
  }

  /** Extract sessions from gateway response, handling real vs legacy shapes. */
  private extractSessions(payload: unknown): Session[] {
    const p = payload as SessionsListResult | GatewaySessionRow[];

    // Real OpenClaw: { ts, path, count, defaults, sessions: [...] }
    const rows: GatewaySessionRow[] = Array.isArray(p) ? p : (p as SessionsListResult).sessions;

    return rows
      .filter((row) => {
        // Only include agent sessions (key starts with "agent:")
        return row.key.startsWith('agent:');
      })
      .map((row) => ({
        key: row.key,
        agentId: row.key.replace(/^agent:/, ''),
        displayName: row.displayName ?? row.key,
        model: row.model,
      }));
  }

  /** Extract cron jobs from gateway response, handling real vs legacy shapes. */
  private extractCronJobs(payload: unknown): CronJob[] {
    const p = payload as CronListResult | CronJob[];

    // Real OpenClaw: { jobs: [...], total, offset, limit, hasMore, nextOffset }
    return Array.isArray(p) ? p : (p as CronListResult).jobs;
  }

  private sessionKeyToAgentId(key?: string): string | null {
    if (!key?.startsWith('agent:')) return null;
    const rest = key.slice('agent:'.length);
    const colonIdx = rest.indexOf(':');
    return colonIdx === -1 ? rest : rest.slice(0, colonIdx);
  }

  private findAgentByJobId(jobId: string): string | null {
    const snapshot = this.stateManager.getSnapshot();
    for (const agent of snapshot.agents) {
      if (agent.cronJobs.some((j) => j.id === jobId)) return agent.id;
    }
    return null;
  }

  private writeStateFile(state: StateFile): void {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  private removeStateFile(): void {
    try {
      fs.unlinkSync(STATE_FILE);
    } catch {
      // ignore
    }
  }

  static readStateFile(): StateFile | null {
    try {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data) as StateFile;
    } catch {
      return null;
    }
  }
}
