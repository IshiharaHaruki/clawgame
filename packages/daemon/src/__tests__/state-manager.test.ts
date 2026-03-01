import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager } from '../state-manager.js';

const SESSIONS = [
  { key: 'agent:main', agentId: 'main', displayName: 'Main Agent', model: 'claude-sonnet-4-6' },
  { key: 'agent:ops', agentId: 'ops', displayName: 'Ops Agent' },
];

const CRON_JOBS = [
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
    sm.syncCronJobs(CRON_JOBS);
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
    sm.syncCronJobs(CRON_JOBS);
    sm.onCronRunStart('main', 'cron-1');
    const snap = sm.getSnapshot();
    expect(snap.agents.find((a) => a.id === 'main')!.status).toBe('cron_running');
  });

  it('should return to idle on cron end', () => {
    sm.syncAgents(SESSIONS);
    sm.syncCronJobs(CRON_JOBS);
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
});
