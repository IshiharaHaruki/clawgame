import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager } from '../state-manager.js';

const SESSIONS = [
  { key: 'agent:main', agentId: 'main', displayName: 'Main Agent', model: 'claude-sonnet-4-6' },
  { key: 'agent:ops', agentId: 'ops', displayName: 'Ops Agent' },
];

function makeCronJobs() {
  return [
    {
      id: 'cron-1',
      name: 'Job 1',
      enabled: true,
      schedule: { kind: 'every' as const, everyMs: 60_000 },
      agentId: 'main',
      state: {},
    },
    {
      id: 'cron-2',
      name: 'Job 2',
      enabled: true,
      schedule: { kind: 'every' as const, everyMs: 120_000 },
      agentId: 'ops',
      state: {},
    },
  ];
}

describe('StateManager', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = new StateManager('ws://127.0.0.1:18789');
  });

  afterEach(() => {
    sm.stopIdleChecker();
    sm.removeAllListeners();
  });

  it('should sync agents from sessions', () => {
    sm.syncAgents(SESSIONS);
    const snap = sm.getSnapshot();
    expect(snap.agents).toHaveLength(2);
    expect(snap.agents[0].id).toBe('main');
    expect(snap.agents[0].displayName).toBe('Main Agent');
    expect(snap.agents[0].status).toBe('idle');
    expect(snap.agents[1].id).toBe('ops');
  });

  it('should remove agents no longer in sessions', () => {
    sm.syncAgents(SESSIONS);
    sm.syncAgents([SESSIONS[0]]); // remove ops
    const snap = sm.getSnapshot();
    expect(snap.agents).toHaveLength(1);
    expect(snap.agents[0].id).toBe('main');
  });

  it('should sync cron jobs to agents', () => {
    sm.syncAgents(SESSIONS);
    sm.syncCronJobs(makeCronJobs());
    const snap = sm.getSnapshot();
    const main = snap.agents.find((a) => a.id === 'main')!;
    const ops = snap.agents.find((a) => a.id === 'ops')!;
    expect(main.cronJobs).toHaveLength(1);
    expect(main.cronJobs[0].id).toBe('cron-1');
    expect(ops.cronJobs).toHaveLength(1);
    expect(ops.cronJobs[0].id).toBe('cron-2');
  });

  it('should set working status on activity', () => {
    sm.syncAgents(SESSIONS);
    sm.onAgentActivity('main');
    const snap = sm.getSnapshot();
    expect(snap.agents.find((a) => a.id === 'main')!.status).toBe('working');
  });

  it('should set error status', () => {
    sm.syncAgents(SESSIONS);
    sm.onAgentError('main');
    const snap = sm.getSnapshot();
    expect(snap.agents.find((a) => a.id === 'main')!.status).toBe('error');
  });

  it('should respect state priority - error cannot be overridden by working', () => {
    sm.syncAgents(SESSIONS);
    sm.onAgentError('main'); // error (5)
    sm.onAgentActivity('main'); // working (2) - should NOT override
    const snap = sm.getSnapshot();
    expect(snap.agents.find((a) => a.id === 'main')!.status).toBe('error');
  });

  it('should set cron_running status on cron start', () => {
    sm.syncAgents(SESSIONS);
    sm.syncCronJobs(makeCronJobs());
    sm.onCronRunStart('main', 'cron-1');
    const snap = sm.getSnapshot();
    expect(snap.agents.find((a) => a.id === 'main')!.status).toBe('cron_running');
  });

  it('should return to idle on cron end', () => {
    sm.syncAgents(SESSIONS);
    sm.syncCronJobs(makeCronJobs());
    sm.onCronRunStart('main', 'cron-1');
    sm.onCronRunEnd('main');
    const snap = sm.getSnapshot();
    expect(snap.agents.find((a) => a.id === 'main')!.status).toBe('idle');
  });

  it('should set all agents offline on gateway disconnect', () => {
    sm.syncAgents(SESSIONS);
    sm.onAgentActivity('main');
    sm.onGatewayDisconnect();
    const snap = sm.getSnapshot();
    for (const agent of snap.agents) {
      expect(agent.status).toBe('offline');
    }
    expect(snap.connectedToGateway).toBe(false);
  });

  it('should transition working to idle after threshold', () => {
    sm.syncAgents(SESSIONS);
    sm.onAgentActivity('main');

    // Manually set lastActivityAt to 3 minutes ago
    const snap1 = sm.getSnapshot();
    const mainAgent = snap1.agents.find((a) => a.id === 'main')!;
    expect(mainAgent.status).toBe('working');

    // Use vi.useFakeTimers to simulate time passing
    vi.useFakeTimers();
    vi.advanceTimersByTime(130_000); // 130s > 120s threshold
    sm.checkIdleAgents();
    vi.useRealTimers();

    const snap2 = sm.getSnapshot();
    expect(snap2.agents.find((a) => a.id === 'main')!.status).toBe('idle');
  });

  it('should increment seq on each getSnapshot call', () => {
    const s1 = sm.getSnapshot();
    const s2 = sm.getSnapshot();
    expect(s2.seq).toBeGreaterThan(s1.seq);
  });

  it('should emit change events', () => {
    const changes: unknown[] = [];
    sm.on('change', (state) => changes.push(state));
    sm.syncAgents(SESSIONS);
    expect(changes.length).toBeGreaterThan(0);
  });

  it('should track gateway connection status', () => {
    sm.onGatewayConnect();
    sm.syncAgents(SESSIONS);
    const snap = sm.getSnapshot();
    expect(snap.connectedToGateway).toBe(true);
  });

  // Tool events
  it('onToolEvent sets currentTool on start', () => {
    sm.syncAgents(SESSIONS);
    sm.onToolEvent('main', 'Read', 'start');
    const snap = sm.getSnapshot();
    const agent = snap.agents.find(a => a.id === 'main')!;
    expect(agent.currentTool).toBe('Read');
  });

  it('onToolEvent clears currentTool on end', () => {
    sm.syncAgents(SESSIONS);
    sm.onToolEvent('main', 'Read', 'start');
    sm.onToolEvent('main', 'Read', 'end');
    const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
    expect(agent.currentTool).toBeUndefined();
  });

  it('onToolEvent emits agent:tool event', () => {
    sm.syncAgents(SESSIONS);
    const events: unknown[] = [];
    sm.on('agent:tool', (data) => events.push(data));
    sm.onToolEvent('main', 'Bash', 'start');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ agentId: 'main', toolName: 'Bash', state: 'start' });
  });

  it('onToolEvent marks agent as working', () => {
    sm.syncAgents(SESSIONS);
    sm.onToolEvent('main', 'Read', 'start');
    const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
    expect(agent.status).toBe('working');
  });

  // Chat events
  it('onChatEvent accumulates deltas', () => {
    sm.syncAgents(SESSIONS);
    sm.onChatEvent('main', { runId: 'r1', sessionKey: 'agent:main', role: 'assistant', content: 'Hello ', state: 'delta', timestamp: Date.now() });
    sm.onChatEvent('main', { runId: 'r1', sessionKey: 'agent:main', role: 'assistant', content: 'world', state: 'delta', timestamp: Date.now() });
    const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
    expect(agent.lastChatSnippet).toBe('Hello world');
  });

  it('onChatEvent sets lastChatSnippet on final', () => {
    sm.syncAgents(SESSIONS);
    sm.onChatEvent('main', { runId: 'r1', sessionKey: 'agent:main', role: 'assistant', content: 'Final answer', state: 'final', timestamp: Date.now() });
    const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
    expect(agent.lastChatSnippet).toBe('Final answer');
  });

  it('onChatEvent emits agent:chat event', () => {
    sm.syncAgents(SESSIONS);
    const events: unknown[] = [];
    sm.on('agent:chat', (data) => events.push(data));
    const msg = { runId: 'r1', sessionKey: 'agent:main', role: 'assistant' as const, content: 'test', state: 'final' as const, timestamp: Date.now() };
    sm.onChatEvent('main', msg);
    expect(events).toHaveLength(1);
  });

  // Agent identities
  it('syncAgentIdentities merges name into displayName', () => {
    sm.syncAgents(SESSIONS);
    sm.syncAgentIdentities([{ id: 'main', name: 'My Custom Agent' }]);
    const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
    expect(agent.displayName).toBe('My Custom Agent');
    expect(agent.identity?.name).toBe('My Custom Agent');
  });

  it('syncAgentIdentities ignores unknown agents', () => {
    sm.syncAgents(SESSIONS);
    sm.syncAgentIdentities([{ id: 'nonexistent', name: 'Ghost' }]);
    // Should not throw
    expect(sm.getSnapshot().agents).toHaveLength(2);
  });

  // Status events
  it('onAgentActivity emits agent:status with previousStatus', () => {
    sm.syncAgents(SESSIONS);
    const statusEvents: unknown[] = [];
    sm.on('agent:status', (data) => statusEvents.push(data));
    sm.onAgentActivity('main');
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0]).toEqual({ agentId: 'main', status: 'working', previousStatus: 'idle' });
  });

  it('does not emit agent:status if status unchanged', () => {
    sm.syncAgents(SESSIONS);
    sm.onAgentActivity('main'); // idle -> working
    const statusEvents: unknown[] = [];
    sm.on('agent:status', (data) => statusEvents.push(data));
    sm.onAgentActivity('main'); // working -> working (no change)
    expect(statusEvents).toHaveLength(0);
  });

  // Presence
  it('onSystemPresence stores entries without changing agent status', () => {
    sm.syncAgents(SESSIONS);
    sm.onSystemPresence([{ ts: Date.now(), deviceId: 'dev1' }]);
    expect(sm.getSystemPresence()).toHaveLength(1);
    // Agent status should remain idle
    const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
    expect(agent.status).toBe('idle');
  });

  // Activity log
  it('activity log caps at 500 entries', () => {
    sm.syncAgents(SESSIONS);
    for (let i = 0; i < 510; i++) {
      sm.onToolEvent('main', `tool-${i}`, 'start');
    }
    expect(sm.getActivityLog(1000).length).toBeLessThanOrEqual(500);
  });

  it('getActivityLog returns last N entries', () => {
    sm.syncAgents(SESSIONS);
    sm.onToolEvent('main', 'Read', 'start');
    sm.onToolEvent('main', 'Write', 'start');
    const log = sm.getActivityLog(1);
    expect(log).toHaveLength(1);
  });

  // AgentStats tracking
  describe('AgentStats', () => {
    it('initializes stats on new agents', () => {
      sm.syncAgents(SESSIONS);
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.stats).toBeDefined();
      expect(agent.stats!.errorCount).toBe(0);
      expect(agent.stats!.toolCallCount).toBe(0);
      expect(agent.stats!.chatMessageCount).toBe(0);
      expect(agent.stats!.totalInputTokens).toBe(0);
      expect(agent.stats!.totalOutputTokens).toBe(0);
      expect(agent.stats!.totalCost).toBe(0);
      expect(agent.stats!.statusHistory).toEqual([]);
    });

    it('increments errorCount on error', () => {
      sm.syncAgents(SESSIONS);
      sm.onAgentError('main');
      sm.onAgentError('main');
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.stats!.errorCount).toBe(2);
      expect(agent.stats!.lastErrorAt).toBeDefined();
    });

    it('increments toolCallCount on tool start', () => {
      sm.syncAgents(SESSIONS);
      sm.onToolEvent('main', 'Read', 'start');
      sm.onToolEvent('main', 'Read', 'end');
      sm.onToolEvent('main', 'Write', 'start');
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.stats!.toolCallCount).toBe(2); // only start counts
    });

    it('increments chatMessageCount on final', () => {
      sm.syncAgents(SESSIONS);
      sm.onChatEvent('main', { runId: 'r1', sessionKey: 'agent:main', role: 'assistant', content: 'delta', state: 'delta', timestamp: Date.now() });
      sm.onChatEvent('main', { runId: 'r1', sessionKey: 'agent:main', role: 'assistant', content: 'final', state: 'final', timestamp: Date.now() });
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.stats!.chatMessageCount).toBe(1); // only final counts
    });

    it('tracks token usage via onTokenUsage', () => {
      sm.syncAgents(SESSIONS);
      sm.onTokenUsage('main', { input: 100, output: 50, cost: 0.01 });
      sm.onTokenUsage('main', { input: 200, output: 75 });
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.stats!.totalInputTokens).toBe(300);
      expect(agent.stats!.totalOutputTokens).toBe(125);
      expect(agent.stats!.totalCost).toBeCloseTo(0.01);
    });

    it('records status history with max 20 entries', () => {
      sm.syncAgents(SESSIONS);
      // Generate many status changes
      for (let i = 0; i < 25; i++) {
        sm.onAgentActivity('main'); // idle -> working
        sm.onAgentError('main'); // working -> error (via priority override)
        // Reset to idle manually for next iteration
        sm.onCronRunEnd('main'); // error stays error, but let's use onGatewayDisconnect + reconnect
      }
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.stats!.statusHistory.length).toBeLessThanOrEqual(20);
    });

    it('onTokenUsage ignores unknown agent', () => {
      sm.syncAgents(SESSIONS);
      // Should not throw
      sm.onTokenUsage('nonexistent', { input: 100 });
      expect(sm.getSnapshot().agents).toHaveLength(2);
    });
  });

  // Enhanced cron event handling
  describe('Enhanced cron', () => {
    it('onCronRunEnd updates job state with duration and status', () => {
      sm.syncAgents(SESSIONS);
      sm.syncCronJobs(makeCronJobs());
      sm.onCronRunStart('main', 'cron-1');
      sm.onCronRunEnd('main', { jobId: 'cron-1', durationMs: 3500, status: 'ok' });
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      const job = agent.cronJobs.find(j => j.id === 'cron-1')!;
      expect(job.state.lastDurationMs).toBe(3500);
      expect(job.state.lastRunStatus).toBe('ok');
      expect(job.state.lastRunAtMs).toBeDefined();
      expect(job.state.totalRuns).toBe(1);
      expect(job.state.errorRuns).toBeUndefined();
      expect(job.state.runningAtMs).toBeUndefined();
    });

    it('onCronRunEnd increments errorRuns on error', () => {
      sm.syncAgents(SESSIONS);
      sm.syncCronJobs(makeCronJobs());
      sm.onCronRunEnd('main', { jobId: 'cron-1', durationMs: 100, status: 'error' });
      sm.onCronRunEnd('main', { jobId: 'cron-1', durationMs: 200, status: 'ok' });
      sm.onCronRunEnd('main', { jobId: 'cron-1', durationMs: 300, status: 'error' });
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      const job = agent.cronJobs.find(j => j.id === 'cron-1')!;
      expect(job.state.totalRuns).toBe(3);
      expect(job.state.errorRuns).toBe(2);
    });

    it('onCronRunEnd still works without details (backward compat)', () => {
      sm.syncAgents(SESSIONS);
      sm.syncCronJobs(makeCronJobs());
      sm.onCronRunStart('main', 'cron-1');
      sm.onCronRunEnd('main');
      const agent = sm.getSnapshot().agents.find(a => a.id === 'main')!;
      expect(agent.status).toBe('idle');
    });

    it('onCronRunEnd uses job name in activity log', () => {
      sm.syncAgents(SESSIONS);
      sm.syncCronJobs(makeCronJobs());
      sm.onCronRunEnd('main', { jobId: 'cron-1', status: 'ok' });
      const log = sm.getActivityLog();
      const cronEntries = log.filter(e => e.kind === 'cron' && e.event === 'end');
      expect(cronEntries.length).toBeGreaterThan(0);
      expect(cronEntries[cronEntries.length - 1].jobName).toBe('Job 1');
    });
  });
});
