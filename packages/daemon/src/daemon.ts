import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GatewayClient } from './gateway-client.js';
import { MockGateway } from './mock-gateway.js';
import { StateManager } from './state-manager.js';
import { DaemonServer } from './server.js';
import type { CronJob } from './types.js';

interface DaemonOptions {
  port: number;
  gatewayUrl: string;
  mock: boolean;
}

interface StateFile {
  pid: number;
  url: string;
  port: number;
  version: string;
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
  private opts: DaemonOptions;

  constructor(opts: DaemonOptions) {
    this.opts = opts;
    this.gateway = new GatewayClient({ url: opts.gatewayUrl });
    this.stateManager = new StateManager(opts.gatewayUrl);
    this.server = new DaemonServer(this.stateManager, opts.port);
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

    // Map gateway events to state manager
    this.gateway.on('gateway:presence', (payload: { agentId: string; status: string }) => {
      if (payload.status === 'active') {
        this.stateManager.onAgentActivity(payload.agentId);
      }
      // idle presence doesn't override — handled by idle checker
    });

    this.gateway.on('gateway:cron.run.start', (payload: { agentId: string; jobId: string }) => {
      this.stateManager.onCronRunStart(payload.agentId, payload.jobId);
    });

    this.gateway.on('gateway:cron.run.end', (payload: { agentId: string }) => {
      this.stateManager.onCronRunEnd(payload.agentId);
    });

    this.gateway.on('gateway:agent.error', (payload: { agentId: string }) => {
      this.stateManager.onAgentError(payload.agentId);
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
        const jobs = (await this.gateway.rpc('cron.list')) as CronJob[];
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
      const sessions = (await this.gateway.rpc('sessions.list')) as Session[];
      this.stateManager.syncAgents(sessions);

      const jobs = (await this.gateway.rpc('cron.list')) as CronJob[];
      this.stateManager.syncCronJobs(jobs);
    } catch (err) {
      console.error('Failed to sync from gateway:', (err as Error).message);
    }
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
