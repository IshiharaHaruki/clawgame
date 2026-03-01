import { create } from 'zustand';
import type { AgentInfo, GameState, ChatMessage, ActivityEntry, ToolVisibility } from '../types';

export type PanelId = 'agent' | 'chat' | 'dashboard' | 'conversation';

export interface GameStore {
  // Connection
  connected: boolean;
  connectedToGateway: boolean;
  setConnected(c: boolean): void;
  setConnectedToGateway(c: boolean): void;

  // Agents
  agents: Map<string, AgentInfo>;
  applySnapshot(state: GameState): void;
  updateAgent(agent: AgentInfo): void;

  // UI
  selectedAgentId: string | null;
  activePanel: PanelId | null;
  selectAgent(id: string | null): void;
  setPanel(panel: PanelId | null): void;

  // Tools (P0)
  activeTools: Map<string, string>;
  toolVisibility: Map<string, ToolVisibility>;
  setToolEvent(agentId: string, toolName: string, state: 'start' | 'end'): void;
  setToolVisibility(agentId: string, level: ToolVisibility): void;

  // Chat (P1)
  chatMessages: Map<string, ChatMessage[]>;
  chatStreaming: Map<string, string>;
  appendChatMessage(agentId: string, msg: ChatMessage): void;
  updateChatStream(sessionKey: string, text: string): void;
  clearChatStream(sessionKey: string): void;

  // Activity (P2)
  activityLog: ActivityEntry[];
  appendActivity(entry: ActivityEntry): void;

  // Conversation viewer
  conversationAgentId: string | null;
  openConversation(agentId: string): void;
  closeConversation(): void;
}

export const useGameStore = create<GameStore>((set) => ({
  connected: false,
  connectedToGateway: false,
  agents: new Map(),
  selectedAgentId: null,
  activePanel: null,
  activeTools: new Map(),
  toolVisibility: new Map(),
  chatMessages: new Map(),
  chatStreaming: new Map(),
  activityLog: [],
  conversationAgentId: null,

  setConnected: (c) => set({ connected: c }),
  setConnectedToGateway: (c) => set({ connectedToGateway: c }),

  applySnapshot: (state) =>
    set({
      agents: new Map(state.agents.map((a) => [a.id, a])),
      connectedToGateway: state.connectedToGateway,
    }),

  updateAgent: (agent) =>
    set((s) => {
      const agents = new Map(s.agents);
      agents.set(agent.id, agent);
      return { agents };
    }),

  selectAgent: (id) => set({ selectedAgentId: id, activePanel: id ? 'agent' : null }),
  setPanel: (panel) => set({ activePanel: panel }),

  setToolEvent: (agentId, toolName, state) =>
    set((s) => {
      const activeTools = new Map(s.activeTools);
      const toolVisibility = new Map(s.toolVisibility);
      if (state === 'start') {
        activeTools.set(agentId, toolName);
        toolVisibility.set(agentId, 'full');
      } else {
        activeTools.delete(agentId);
      }
      return { activeTools, toolVisibility };
    }),

  setToolVisibility: (agentId, level) =>
    set((s) => {
      const toolVisibility = new Map(s.toolVisibility);
      toolVisibility.set(agentId, level);
      return { toolVisibility };
    }),

  appendChatMessage: (_agentId, msg) =>
    set((s) => {
      const chatMessages = new Map(s.chatMessages);
      const existing = chatMessages.get(msg.sessionKey) ?? [];
      chatMessages.set(msg.sessionKey, [...existing, msg]);
      return { chatMessages };
    }),

  updateChatStream: (sessionKey, text) =>
    set((s) => {
      const chatStreaming = new Map(s.chatStreaming);
      chatStreaming.set(sessionKey, (chatStreaming.get(sessionKey) ?? '') + text);
      return { chatStreaming };
    }),

  clearChatStream: (sessionKey) =>
    set((s) => {
      const chatStreaming = new Map(s.chatStreaming);
      chatStreaming.delete(sessionKey);
      return { chatStreaming };
    }),

  appendActivity: (entry) =>
    set((s) => ({
      activityLog: [...s.activityLog.slice(-499), entry],
    })),

  openConversation: (agentId) => set({ conversationAgentId: agentId }),
  closeConversation: () => set({ conversationAgentId: null }),
}));
