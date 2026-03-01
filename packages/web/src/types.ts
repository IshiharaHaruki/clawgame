export type AgentStatus = 'error' | 'offline' | 'cron_running' | 'working' | 'idle';

export interface CronScheduleAt {
  kind: 'at';
  at: string;
}

export interface CronScheduleEvery {
  kind: 'every';
  everyMs: number;
}

export interface CronScheduleCron {
  kind: 'cron';
  expr: string;
  tz?: string;
}

export type CronSchedule = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

export interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  lastDurationMs?: number;
  runningAtMs?: number;
}

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: CronSchedule;
  agentId?: string;
  state: CronJobState;
}

export interface AgentInfo {
  id: string;
  displayName: string;
  status: AgentStatus;
  model?: string;
  lastActivityAt: number;
  cronJobs: CronJob[];
  // New fields
  identity?: AgentIdentity;
  currentTool?: string;
  lastChatSnippet?: string;
  sessionKey?: string;
}

export interface GameState {
  seq: number;
  agents: AgentInfo[];
  connectedToGateway: boolean;
  gatewayUrl: string;
  timestamp: number;
}

// --- New types for P0-P2 features ---

export interface AgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface ToolEvent {
  toolName: string;
  state: 'start' | 'end';
  runId: string;
  sessionKey?: string;
  timestamp: number;
}

export interface ChatMessage {
  runId: string;
  sessionKey: string;
  role: 'user' | 'assistant';
  content: string;
  state: 'delta' | 'final' | 'error' | 'aborted';
  timestamp: number;
}

export type ActivityEntry =
  | { kind: 'tool'; agentId: string; timestamp: number; toolName: string }
  | { kind: 'chat'; agentId: string; timestamp: number; snippet: string }
  | { kind: 'cron'; agentId: string; timestamp: number; jobName: string; event: 'start' | 'end' }
  | { kind: 'error'; agentId: string; timestamp: number; message: string }
  | { kind: 'status_change'; agentId: string; timestamp: number; from: AgentStatus; to: AgentStatus };

export interface PresenceEntry {
  host?: string;
  platform?: string;
  mode?: string;
  ts: number;
  deviceId?: string;
}

export type ToolVisibility = 'full' | 'inferred' | 'none';

export type ServerMessage =
  | { type: 'snapshot'; data: GameState }
  | { type: 'agent:update'; data: AgentInfo }
  | { type: 'connection:status'; data: { connectedToGateway: boolean } }
  | { type: 'agent:tool'; data: { agentId: string; toolName: string; state: 'start' | 'end' } }
  | { type: 'agent:chat'; data: { agentId: string; message: ChatMessage } }
  | { type: 'agent:status'; data: { agentId: string; status: AgentStatus; previousStatus: AgentStatus } }
  | { type: 'activity'; data: ActivityEntry }
  | { type: 'cron:event'; data: { agentId: string; jobId: string; jobName: string; event: 'start' | 'end' } }
  | { type: 'rpc:response'; data: { requestId: string; ok: boolean; payload?: unknown; error?: { code: string; message: string } } };

export type ClientMessage =
  | { type: 'request:snapshot' }
  | { type: 'rpc:request'; data: { requestId: string; method: string; params?: unknown } }
  | { type: 'subscribe:chat'; data: { sessionKey: string } }
  | { type: 'unsubscribe:chat'; data: { sessionKey: string } };
