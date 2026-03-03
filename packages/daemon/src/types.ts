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
  totalRuns: z.number().optional(),
  errorRuns: z.number().optional(),
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

export const AgentStats = z.object({
  errorCount: z.number(),
  toolCallCount: z.number(),
  chatMessageCount: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCost: z.number(),
  lastErrorAt: z.number().optional(),
  statusHistory: z.array(z.object({ status: AgentStatus, at: z.number() })),
});
export type AgentStats = z.infer<typeof AgentStats>;

export const AgentIdentity = z.object({
  name: z.string().optional(),
  theme: z.string().optional(),
  emoji: z.string().optional(),
  avatar: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type AgentIdentity = z.infer<typeof AgentIdentity>;

export const ToolEvent = z.object({
  toolName: z.string(),
  state: z.enum(['start', 'end']),
  runId: z.string(),
  sessionKey: z.string().optional(),
  timestamp: z.number(),
});
export type ToolEvent = z.infer<typeof ToolEvent>;

export const ChatMessage = z.object({
  runId: z.string(),
  sessionKey: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  state: z.enum(['delta', 'final', 'error', 'aborted']),
  timestamp: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ActivityEntry = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tool'), agentId: z.string(), timestamp: z.number(), toolName: z.string() }),
  z.object({ kind: z.literal('chat'), agentId: z.string(), timestamp: z.number(), snippet: z.string() }),
  z.object({ kind: z.literal('cron'), agentId: z.string(), timestamp: z.number(), jobName: z.string(), event: z.enum(['start', 'end']) }),
  z.object({ kind: z.literal('error'), agentId: z.string(), timestamp: z.number(), message: z.string() }),
  z.object({ kind: z.literal('status_change'), agentId: z.string(), timestamp: z.number(), from: AgentStatus, to: AgentStatus }),
]);
export type ActivityEntry = z.infer<typeof ActivityEntry>;

export const PresenceEntry = z.object({
  host: z.string().optional(),
  ip: z.string().optional(),
  version: z.string().optional(),
  platform: z.string().optional(),
  deviceFamily: z.string().optional(),
  mode: z.string().optional(),
  ts: z.number(),
  deviceId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
});
export type PresenceEntry = z.infer<typeof PresenceEntry>;

export const AgentInfo = z.object({
  id: z.string(),
  displayName: z.string(),
  status: AgentStatus,
  model: z.string().optional(),
  lastActivityAt: z.number(),
  cronJobs: z.array(CronJob),
  identity: AgentIdentity.optional(),
  currentTool: z.string().optional(),
  lastChatSnippet: z.string().optional(),
  sessionKey: z.string().optional(),
  stats: AgentStats.optional(),
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
  z.object({ type: z.literal('connection:status'), data: z.object({ connectedToGateway: z.boolean() }) }),
  z.object({ type: z.literal('agent:tool'), data: z.object({ agentId: z.string(), toolName: z.string(), state: z.enum(['start', 'end']), targetAgentId: z.string().optional() }) }),
  z.object({ type: z.literal('agent:chat'), data: z.object({ agentId: z.string(), message: ChatMessage }) }),
  z.object({ type: z.literal('agent:status'), data: z.object({ agentId: z.string(), status: AgentStatus, previousStatus: AgentStatus }) }),
  z.object({ type: z.literal('activity'), data: ActivityEntry }),
  z.object({ type: z.literal('cron:event'), data: z.object({ agentId: z.string(), jobId: z.string(), jobName: z.string(), event: z.enum(['start', 'end']) }) }),
  z.object({ type: z.literal('rpc:response'), data: z.object({ requestId: z.string(), ok: z.boolean(), payload: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string() }).optional() }) }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

// WebSocket messages from frontend → daemon
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('request:snapshot') }),
  z.object({ type: z.literal('rpc:request'), data: z.object({ requestId: z.string(), method: z.string(), params: z.unknown().optional() }) }),
  z.object({ type: z.literal('subscribe:chat'), data: z.object({ sessionKey: z.string() }) }),
  z.object({ type: z.literal('unsubscribe:chat'), data: z.object({ sessionKey: z.string() }) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
