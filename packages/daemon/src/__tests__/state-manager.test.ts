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
});
