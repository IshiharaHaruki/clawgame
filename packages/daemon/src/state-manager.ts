import { EventEmitter } from 'node:events';
import type { AgentInfo, AgentStatus, ChatMessage, ActivityEntry, PresenceEntry, CronJob, GameState } from './types.js';
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
  private activityLog: ActivityEntry[] = [];
  private systemPresence: PresenceEntry[] = [];
  private chatAccumulators = new Map<string, string>(); // runId → accumulated text

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

    const previousStatus = agent.status;
    if (this.canTransition(agent.status, 'working')) {
      agent.status = 'working';
    }
    agent.lastActivityAt = Date.now();
    if (agent.status !== previousStatus) {
      this.emit('agent:status', { agentId, status: 'working', previousStatus });
      this.pushActivity({ kind: 'status_change', agentId, timestamp: Date.now(), from: previousStatus, to: 'working' });
    }
    this.emit('agent:update', { ...agent });
    this.emitChange();
  }

  onAgentError(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const previousStatus = agent.status;
    agent.status = 'error';
    if (previousStatus !== 'error') {
      this.emit('agent:status', { agentId, status: 'error', previousStatus });
      this.pushActivity({ kind: 'status_change', agentId, timestamp: Date.now(), from: previousStatus, to: 'error' });
    }
    this.emit('agent:update', { ...agent });
    this.emitChange();
  }

  onCronRunStart(agentId: string, jobId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const previousStatus = agent.status;
    if (this.canTransition(agent.status, 'cron_running')) {
      agent.status = 'cron_running';
    }
    agent.lastActivityAt = Date.now();

    const job = agent.cronJobs.find((j) => j.id === jobId);
    if (job) {
      job.state.runningAtMs = Date.now();
    }

    if (agent.status !== previousStatus) {
      this.emit('agent:status', { agentId, status: 'cron_running', previousStatus });
    }
    const jobName = job?.name ?? jobId;
    this.pushActivity({ kind: 'cron', agentId, timestamp: Date.now(), jobName, event: 'start' });
    this.emit('agent:update', { ...agent });
    this.emitChange();
  }

  onCronRunEnd(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const previousStatus = agent.status;
    agent.status = 'idle';
    agent.lastActivityAt = Date.now();
    if (previousStatus !== 'idle') {
      this.emit('agent:status', { agentId, status: 'idle', previousStatus });
    }
    this.pushActivity({ kind: 'cron', agentId, timestamp: Date.now(), jobName: '', event: 'end' });
    this.emit('agent:update', { ...agent });
    this.emitChange();
  }

  onGatewayDisconnect(): void {
    this.connectedToGateway = false;
    this.emit('connection:status', { connectedToGateway: false });
    for (const agent of this.agents.values()) {
      const previousStatus = agent.status;
      agent.status = 'offline';
      if (previousStatus !== 'offline') {
        this.emit('agent:status', { agentId: agent.id, status: 'offline', previousStatus });
      }
      this.emit('agent:update', { ...agent });
    }
    this.emitChange();
  }

  onGatewayConnect(): void {
    this.connectedToGateway = true;
    this.emit('connection:status', { connectedToGateway: true });
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

  onToolEvent(agentId: string, toolName: string, state: 'start' | 'end'): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const previousStatus = agent.status;
    if (state === 'start') {
      agent.currentTool = toolName;
    } else {
      agent.currentTool = undefined;
    }
    agent.lastActivityAt = Date.now();
    this.emit('agent:tool', { agentId, toolName, state });
    this.emit('agent:update', { ...agent });
    this.pushActivity({ kind: 'tool', agentId, timestamp: Date.now(), toolName });
    if (this.canTransition(agent.status, 'working') && agent.status !== 'working') {
      agent.status = 'working';
      this.emit('agent:status', { agentId, status: 'working', previousStatus });
    }
    this.emitChange();
  }

  onChatEvent(agentId: string, message: ChatMessage): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    if (message.state === 'delta') {
      const acc = (this.chatAccumulators.get(message.runId) ?? '') + message.content;
      this.chatAccumulators.set(message.runId, acc);
      agent.lastChatSnippet = acc.slice(-80);
    } else if (message.state === 'final') {
      agent.lastChatSnippet = message.content.slice(0, 80);
      this.chatAccumulators.delete(message.runId);
    }
    agent.lastActivityAt = Date.now();
    this.emit('agent:chat', { agentId, message });
    this.emit('agent:update', { ...agent });
    this.pushActivity({ kind: 'chat', agentId, timestamp: Date.now(), snippet: message.content.slice(0, 50) });
    this.emitChange();
  }

  syncAgentIdentities(identities: Array<{ id: string; name?: string; workspace?: string }>): void {
    for (const ident of identities) {
      const agent = this.agents.get(ident.id);
      if (agent) {
        agent.identity = { name: ident.name };
        if (ident.name) agent.displayName = ident.name;
        this.emit('agent:update', { ...agent });
      }
    }
    this.emitChange();
  }

  onSystemPresence(entries: PresenceEntry[]): void {
    this.systemPresence = entries;
    // Does NOT affect agent status
  }

  getActivityLog(limit = 100): ActivityEntry[] {
    return this.activityLog.slice(-limit);
  }

  getSystemPresence(): PresenceEntry[] {
    return this.systemPresence;
  }

  private pushActivity(entry: ActivityEntry): void {
    this.activityLog.push(entry);
    if (this.activityLog.length > 500) this.activityLog.shift();
    this.emit('activity', entry);
  }

  private canTransition(current: AgentStatus, next: AgentStatus): boolean {
    return STATUS_PRIORITY[next] >= STATUS_PRIORITY[current];
  }

  private emitChange(): void {
    this.emit('change', this.getSnapshot());
  }
}
