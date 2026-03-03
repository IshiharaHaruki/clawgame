import type Phaser from 'phaser';
import { ToolOverlay } from './ToolOverlay';
import { CronAlarmOverlay } from './CronAlarmOverlay';
import { ChatBubblePool } from './ChatBubble';
import type { LayerManager } from '../layers/LayerManager';
import { GameBridge } from '../GameBridge';

type Listener = (...args: unknown[]) => void;

export class OverlayManager {
  private toolOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private inferredOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private cronOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private agentPositions = new Map<string, { x: number; y: number }>();
  private chatBubblePool: ChatBubblePool;
  private boundOnToolEvent: Listener;
  private boundOnAgentActivity: Listener;
  private boundOnAgentsUpdate: Listener;
  private boundOnChatBubble: Listener;
  private boundOnCronAlarm: Listener;

  constructor(
    private scene: Phaser.Scene,
    private layers: LayerManager,
    private getCharacterPosition?: (agentId: string) => { x: number; y: number } | undefined,
  ) {
    this.chatBubblePool = new ChatBubblePool(scene, layers.overlays);

    this.boundOnToolEvent = (data: unknown) =>
      this.onToolEvent(
        data as { agentId: string; toolName: string; state: 'start' | 'end' },
      );
    this.boundOnAgentActivity = (data: unknown) =>
      this.onAgentActivity(data as { agentId: string });
    this.boundOnAgentsUpdate = (agents: unknown) =>
      this.onAgentsUpdate(agents as Array<{ id: string; status: string }>);
    this.boundOnChatBubble = (data: unknown) =>
      this.onChatBubble(
        data as { agentId: string; text: string; style: 'speak' | 'think' },
      );
    this.boundOnCronAlarm = (data: unknown) =>
      this.onCronAlarm(data as { agentId: string; active: boolean });

    GameBridge.on('tool:event', this.boundOnToolEvent);
    GameBridge.on('agent:activity', this.boundOnAgentActivity);
    GameBridge.on('agents:update', this.boundOnAgentsUpdate);
    GameBridge.on('chat:bubble', this.boundOnChatBubble);
    GameBridge.on('cron:alarm', this.boundOnCronAlarm);
  }

  /** Update tracked agent positions (call from OfficeScene when agents move) */
  updateAgentPosition(agentId: string, x: number, y: number): void {
    this.agentPositions.set(agentId, { x, y });
    // Move existing overlay if any
    const toolOverlay = this.toolOverlays.get(agentId);
    if (toolOverlay) {
      toolOverlay.setPosition(x + 14, y - 20);
    }
    const inferredOverlay = this.inferredOverlays.get(agentId);
    if (inferredOverlay) {
      inferredOverlay.setPosition(x + 14, y - 20);
    }
    const cronOverlay = this.cronOverlays.get(agentId);
    if (cronOverlay) {
      cronOverlay.setPosition(x - 14, y - 20);
    }
  }

  private resolvePosition(agentId: string): { x: number; y: number } | undefined {
    return this.agentPositions.get(agentId) ?? this.getCharacterPosition?.(agentId);
  }

  private onToolEvent({
    agentId,
    toolName,
    state,
  }: {
    agentId: string;
    toolName: string;
    state: 'start' | 'end';
  }): void {
    if (state === 'start') {
      this.dismissOverlay(agentId);
      const pos = this.resolvePosition(agentId);
      if (!pos) return;
      const overlay = ToolOverlay.create(
        this.scene,
        toolName,
        pos.x + 14,
        pos.y - 20,
      );
      this.layers.overlays.add(overlay);
      this.toolOverlays.set(agentId, overlay);
    } else {
      this.dismissOverlay(agentId);
    }
  }

  private onAgentActivity({ agentId }: { agentId: string }): void {
    // If no specific tool overlay, show inferred "thinking" overlay
    if (this.toolOverlays.has(agentId)) return;
    if (this.inferredOverlays.has(agentId)) return;
    const pos = this.resolvePosition(agentId);
    if (!pos) return;
    const overlay = ToolOverlay.createInferred(
      this.scene,
      pos.x + 14,
      pos.y - 20,
    );
    this.layers.overlays.add(overlay);
    this.inferredOverlays.set(agentId, overlay);
  }

  private onAgentsUpdate(
    agents: Array<{ id: string; status: string }>,
  ): void {
    // Clear overlays for agents that are no longer working
    for (const agent of agents) {
      if (agent.status !== 'working') {
        this.dismissOverlay(agent.id);
      }
    }
  }

  private onChatBubble({
    agentId,
    text,
    style,
  }: {
    agentId: string;
    text: string;
    style: 'speak' | 'think';
  }): void {
    const pos = this.resolvePosition(agentId);
    if (!pos) return;
    this.chatBubblePool.show(agentId, text, style, pos.x, pos.y);
  }

  private onCronAlarm({
    agentId,
    active,
  }: {
    agentId: string;
    active: boolean;
  }): void {
    if (active) {
      // Dismiss existing if any
      const existing = this.cronOverlays.get(agentId);
      if (existing) CronAlarmOverlay.dismiss(this.scene, existing);

      const pos = this.resolvePosition(agentId);
      if (!pos) return;
      const overlay = CronAlarmOverlay.create(
        this.scene,
        pos.x - 14,
        pos.y - 20,
      );
      this.layers.overlays.add(overlay);
      this.cronOverlays.set(agentId, overlay);
    } else {
      const existing = this.cronOverlays.get(agentId);
      if (existing) {
        CronAlarmOverlay.dismiss(this.scene, existing);
        this.cronOverlays.delete(agentId);
      }
    }
  }

  private dismissOverlay(agentId: string): void {
    const tool = this.toolOverlays.get(agentId);
    if (tool) {
      ToolOverlay.dismiss(this.scene, tool);
      this.toolOverlays.delete(agentId);
    }
    const inferred = this.inferredOverlays.get(agentId);
    if (inferred) {
      ToolOverlay.dismiss(this.scene, inferred);
      this.inferredOverlays.delete(agentId);
    }
  }

  removeAgent(agentId: string): void {
    this.dismissOverlay(agentId);
    const cronOverlay = this.cronOverlays.get(agentId);
    if (cronOverlay) {
      CronAlarmOverlay.dismiss(this.scene, cronOverlay);
      this.cronOverlays.delete(agentId);
    }
    this.agentPositions.delete(agentId);
  }

  destroy(): void {
    GameBridge.off('tool:event', this.boundOnToolEvent);
    GameBridge.off('agent:activity', this.boundOnAgentActivity);
    GameBridge.off('agents:update', this.boundOnAgentsUpdate);
    GameBridge.off('chat:bubble', this.boundOnChatBubble);
    GameBridge.off('cron:alarm', this.boundOnCronAlarm);
    for (const overlay of this.toolOverlays.values()) overlay.destroy();
    for (const overlay of this.inferredOverlays.values()) overlay.destroy();
    for (const overlay of this.cronOverlays.values()) overlay.destroy();
    this.toolOverlays.clear();
    this.inferredOverlays.clear();
    this.cronOverlays.clear();
    this.chatBubblePool.destroy();
  }
}
