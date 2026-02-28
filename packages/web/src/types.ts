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
}

export interface GameState {
  seq: number;
  agents: AgentInfo[];
  connectedToGateway: boolean;
  gatewayUrl: string;
  timestamp: number;
}

export type ServerMessage =
  | { type: 'snapshot'; data: GameState }
  | { type: 'agent:update'; data: AgentInfo }
  | { type: 'connection:status'; data: { connectedToGateway: boolean } };
