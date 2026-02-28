export type AgentStatus = 'error' | 'offline' | 'cron_running' | 'working' | 'idle';

export interface CronScheduleAt {
  type: 'at';
  at: string;
}

export interface CronScheduleEvery {
  type: 'every';
  every: string;
}

export interface CronScheduleCron {
  type: 'cron';
  cron: string;
}

export type CronSchedule = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

export interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: string;
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
  state: CronJobState;
}

export interface AgentInfo {
  id: string;
  displayName: string;
  status: AgentStatus;
  model?: string;
  lastActivityAt: string;
  cronJobs: CronJob[];
}

export interface GameState {
  seq: number;
  agents: AgentInfo[];
  connectedToGateway: boolean;
  gatewayUrl: string;
  timestamp: string;
}

export type ServerMessage =
  | { type: 'snapshot'; data: GameState }
  | { type: 'agent:update'; data: AgentInfo }
  | { type: 'connection:status'; data: { connectedToGateway: boolean } };
