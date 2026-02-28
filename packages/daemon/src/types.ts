import { z } from 'zod';

// Agent status enum, ordered by priority (highest first)
export const AgentStatus = z.enum(['error', 'offline', 'cron_running', 'working', 'idle']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const STATUS_PRIORITY: Record<AgentStatus, number> = {
  error: 5,
  offline: 4,
  cron_running: 3,
  working: 2,
  idle: 1,
};

export const CronSchedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('at'), at: z.string() }),
  z.object({ kind: z.literal('every'), everyMs: z.number() }),
  z.object({ kind: z.literal('cron'), expr: z.string(), tz: z.string().optional() }),
]);

export const CronJobState = z.object({
  nextRunAtMs: z.number().optional(),
  lastRunAtMs: z.number().optional(),
  lastRunStatus: z.enum(['ok', 'error', 'skipped']).optional(),
  lastError: z.string().optional(),
  lastDurationMs: z.number().optional(),
  runningAtMs: z.number().optional(),
});

export const CronJob = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  schedule: CronSchedule,
  agentId: z.string().optional(),
  state: CronJobState,
});
export type CronJob = z.infer<typeof CronJob>;

export const AgentInfo = z.object({
  id: z.string(),
  displayName: z.string(),
  status: AgentStatus,
  model: z.string().optional(),
  lastActivityAt: z.number(),
  cronJobs: z.array(CronJob),
});
export type AgentInfo = z.infer<typeof AgentInfo>;

export const GameState = z.object({
  seq: z.number(),
  agents: z.array(AgentInfo),
  connectedToGateway: z.boolean(),
  gatewayUrl: z.string(),
  timestamp: z.number(),
});
export type GameState = z.infer<typeof GameState>;

// WebSocket messages from daemon → frontend
export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), data: GameState }),
  z.object({ type: z.literal('agent:update'), data: AgentInfo }),
  z.object({ type: z.literal('connection:status'), connected: z.boolean() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

// WebSocket messages from frontend → daemon
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('request:snapshot') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
