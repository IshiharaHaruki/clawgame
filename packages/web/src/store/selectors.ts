import type { GameStore } from './index';
import type { AgentInfo } from '../types';

export const selectAgentList = (s: GameStore): AgentInfo[] => s.agentList;
export const selectSelectedAgent = (s: GameStore) =>
  s.selectedAgentId ? s.agents.get(s.selectedAgentId) : undefined;
export const selectActiveTools = (s: GameStore) => s.activeTools;
export const selectToolVisibility =
  (agentId: string) => (s: GameStore) =>
    s.toolVisibility.get(agentId) ?? ('none' as const);
