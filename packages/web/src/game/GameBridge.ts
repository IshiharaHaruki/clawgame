import type { AgentInfo } from '../types';

type Listener = (...args: unknown[]) => void;

class GameBridgeEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  updateAgents(agents: AgentInfo[]): void {
    this.emit('agents:update', agents);
  }

  notifyAgentClick(agentId: string): void {
    this.emit('agent:click', agentId);
  }

  emitToolEvent(agentId: string, toolName: string, state: 'start' | 'end'): void {
    this.emit('tool:event', { agentId, toolName, state });
  }

  emitChatBubble(agentId: string, text: string, style: 'speak' | 'think'): void {
    this.emit('chat:bubble', { agentId, text, style });
  }

  emitCronAlarm(agentId: string, active: boolean): void {
    this.emit('cron:alarm', { agentId, active });
  }

  emitAgentActivity(agentId: string): void {
    this.emit('agent:activity', { agentId });
  }
}

export const GameBridge = new GameBridgeEmitter();
