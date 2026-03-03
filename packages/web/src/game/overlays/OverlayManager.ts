import type Phaser from 'phaser';
import { ToolOverlay } from './ToolOverlay';
import { CronAlarmOverlay } from './CronAlarmOverlay';
import { ChatBubblePool } from './ChatBubble';
import { HoverTooltip } from './HoverTooltip';
import type { LayerManager } from '../layers/LayerManager';
import type { AgentInfo } from '../../types';
import { GameBridge } from '../GameBridge';

type Listener = (...args: unknown[]) => void;

export class OverlayManager {
  private toolOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private inferredOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private cronOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private agentPositions = new Map<string, { x: number; y: number }>();
  private chatBubblePool: ChatBubblePool;
  private toolStartTimes = new Map<string, number>();
  private timerTexts = new Map<string, Phaser.GameObjects.Text>();
  private hoverTooltip: HoverTooltip;
  private agentInfoCache = new Map<string, AgentInfo>();
  private boundOnToolEvent: Listener;
  private boundOnAgentActivity: Listener;
  private boundOnAgentsUpdate: Listener;
  private boundOnChatBubble: Listener;
  private boundOnCronAlarm: Listener;
  private boundOnAgentHover: Listener;

  constructor(
    private scene: Phaser.Scene,
    private layers: LayerManager,
    private getCharacterPosition?: (agentId: string) => { x: number; y: number } | undefined,
  ) {
    this.chatBubblePool = new ChatBubblePool(scene, layers.overlays);
    this.hoverTooltip = new HoverTooltip(scene);

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
    this.boundOnAgentHover = (data: unknown) =>
      this.onAgentHover(data as { agentId: string | null });

    GameBridge.on('tool:event', this.boundOnToolEvent);
    GameBridge.on('agent:activity', this.boundOnAgentActivity);
    GameBridge.on('agents:update', this.boundOnAgentsUpdate);
    GameBridge.on('chat:bubble', this.boundOnChatBubble);
    GameBridge.on('cron:alarm', this.boundOnCronAlarm);
    GameBridge.on('agent:hover', this.boundOnAgentHover);
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
    const timerText = this.timerTexts.get(agentId);
    if (timerText) {
      timerText.setPosition(x + 14, y - 32);
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
      // Start timer
      this.toolStartTimes.set(agentId, Date.now());
      const timerText = this.scene.add.text(pos.x + 14, pos.y - 32, '0s', {
        fontFamily: '"Press Start 2P"',
        fontSize: '6px',
        color: '#ffd700',
        align: 'center',
      });
      timerText.setOrigin(0.5, 0.5);
      this.layers.overlays.add(timerText);
      this.timerTexts.set(agentId, timerText);
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
    // Cache agent info for hover tooltip
    for (const agent of agents) {
      this.agentInfoCache.set(agent.id, agent as AgentInfo);
    }
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

  private onAgentHover({ agentId }: { agentId: string | null }): void {
    if (!agentId) {
      this.hoverTooltip.hide();
      return;
    }
    const agent = this.agentInfoCache.get(agentId);
    const pos = this.resolvePosition(agentId);
    if (!agent || !pos) {
      this.hoverTooltip.hide();
      return;
    }
    this.hoverTooltip.show(agent, pos.x, pos.y, agent.currentTool);
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
    // Clean up timer
    this.toolStartTimes.delete(agentId);
    const timerText = this.timerTexts.get(agentId);
    if (timerText) {
      timerText.destroy();
      this.timerTexts.delete(agentId);
    }
  }

  /** Update tool call timer text — call from OfficeScene's update() */
  updateTimers(): void {
    const now = Date.now();
    for (const [agentId, startTime] of this.toolStartTimes) {
      const text = this.timerTexts.get(agentId);
      if (!text) continue;
      const elapsed = Math.floor((now - startTime) / 1000);
      text.setText(`${elapsed}s`);
      // Update position to follow agent
      const pos = this.resolvePosition(agentId);
      if (pos) text.setPosition(pos.x + 14, pos.y - 32);
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
    GameBridge.off('agent:hover', this.boundOnAgentHover);
    this.hoverTooltip.destroy();
    for (const overlay of this.toolOverlays.values()) overlay.destroy();
    for (const overlay of this.inferredOverlays.values()) overlay.destroy();
    for (const overlay of this.cronOverlays.values()) overlay.destroy();
    for (const text of this.timerTexts.values()) text.destroy();
    this.toolOverlays.clear();
    this.inferredOverlays.clear();
    this.cronOverlays.clear();
    this.toolStartTimes.clear();
    this.timerTexts.clear();
    this.chatBubblePool.destroy();
  }
}
