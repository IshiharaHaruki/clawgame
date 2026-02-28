import { EventEmitter } from 'node:events';
import type { AgentInfo, AgentStatus, CronJob, GameState } from './types.js';
import { STATUS_PRIORITY } from './types.js';

const IDLE_THRESHOLD_MS = 120_000;
const IDLE_CHECK_INTERVAL_MS = 10_000;

interface Session {
  key: string;
  agentId: string;
  displayName: string;
  model?: string;
}

export class StateManager extends EventEmitter {
  private agents = new Map<string, AgentInfo>();
  private seq = 0;
  private gatewayUrl: string;
  private connectedToGateway = false;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(gatewayUrl: string) {
    super();
    this.gatewayUrl = gatewayUrl;
  }

  startIdleChecker(): void {
    this.stopIdleChecker();
    this.idleCheckTimer = setInterval(() => this.checkIdleAgents(), IDLE_CHECK_INTERVAL_MS);
  }

  stopIdleChecker(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  setConnected(connected: boolean): void {
    this.connectedToGateway = connected;
  }

  syncAgents(sessions: Session[]): void {
    const currentIds = new Set(sessions.map((s) => s.agentId));

    // Remove agents not in sessions
    for (const id of this.agents.keys()) {
      if (!currentIds.has(id)) {
        this.agents.delete(id);
      }
    }

    // Add/update agents from sessions
    for (const session of sessions) {
      const existing = this.agents.get(session.agentId);
      if (!existing) {
        this.agents.set(session.agentId, {
          id: session.agentId,
          displayName: session.displayName,
          status: 'idle',
          model: session.model,
          lastActivityAt: Date.now(),
          cronJobs: [],
        });
      } else {
        existing.displayName = session.displayName;
        existing.model = session.model;
      }
    }

    this.emitChange();
  }

  syncCronJobs(jobs: CronJob[]): void {
    // Clear all existing cron jobs
    for (const agent of this.agents.values()) {
      agent.cronJobs = [];
    }

    // Assign jobs to agents
    for (const job of jobs) {
      if (job.agentId) {
        const agent = this.agents.get(job.agentId);
        if (agent) {
          agent.cronJobs.push(job);
        }
      }
    }

    this.emitChange();
  }

  onAgentActivity(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (this.canTransition(agent.status, 'working')) {
      agent.status = 'working';
    }
    agent.lastActivityAt = Date.now();
    this.emitChange();
  }

  onAgentError(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = 'error';
    this.emitChange();
  }

  onCronRunStart(agentId: string, jobId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (this.canTransition(agent.status, 'cron_running')) {
      agent.status = 'cron_running';
    }
    agent.lastActivityAt = Date.now();

    const job = agent.cronJobs.find((j) => j.id === jobId);
    if (job) {
      job.state.runningAtMs = Date.now();
    }

    this.emitChange();
  }

  onCronRunEnd(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = 'idle';
    agent.lastActivityAt = Date.now();
    this.emitChange();
  }

  onGatewayDisconnect(): void {
    this.connectedToGateway = false;
    for (const agent of this.agents.values()) {
      agent.status = 'offline';
    }
    this.emitChange();
  }

  onGatewayConnect(): void {
    this.connectedToGateway = true;
  }

  checkIdleAgents(): void {
    const now = Date.now();
    let changed = false;

    for (const agent of this.agents.values()) {
      if (agent.status === 'working' && now - agent.lastActivityAt >= IDLE_THRESHOLD_MS) {
        agent.status = 'idle';
        changed = true;
      }
    }

    if (changed) this.emitChange();
  }

  getSnapshot(): GameState {
    return {
      seq: ++this.seq,
      agents: [...this.agents.values()],
      connectedToGateway: this.connectedToGateway,
      gatewayUrl: this.gatewayUrl,
      timestamp: Date.now(),
    };
  }

  private canTransition(current: AgentStatus, next: AgentStatus): boolean {
    return STATUS_PRIORITY[next] >= STATUS_PRIORITY[current];
  }

  private emitChange(): void {
    this.emit('change', this.getSnapshot());
  }
}
