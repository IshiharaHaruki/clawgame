import type Phaser from 'phaser';
import { ToolOverlay } from './ToolOverlay';
import type { LayerManager } from '../layers/LayerManager';
import { GameBridge } from '../GameBridge';

type Listener = (...args: unknown[]) => void;

export class OverlayManager {
  private toolOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private inferredOverlays = new Map<string, Phaser.GameObjects.Sprite>();
  private agentPositions = new Map<string, { x: number; y: number }>();
  private boundOnToolEvent: Listener;
  private boundOnAgentActivity: Listener;
  private boundOnAgentsUpdate: Listener;

  constructor(
    private scene: Phaser.Scene,
    private layers: LayerManager,
  ) {
    this.boundOnToolEvent = (data: unknown) =>
      this.onToolEvent(
        data as { agentId: string; toolName: string; state: 'start' | 'end' },
      );
    this.boundOnAgentActivity = (data: unknown) =>
      this.onAgentActivity(data as { agentId: string });
    this.boundOnAgentsUpdate = (agents: unknown) =>
      this.onAgentsUpdate(agents as Array<{ id: string; status: string }>);

    GameBridge.on('tool:event', this.boundOnToolEvent);
    GameBridge.on('agent:activity', this.boundOnAgentActivity);
    GameBridge.on('agents:update', this.boundOnAgentsUpdate);
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
      const pos = this.agentPositions.get(agentId);
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
    const pos = this.agentPositions.get(agentId);
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

  destroy(): void {
    GameBridge.off('tool:event', this.boundOnToolEvent);
    GameBridge.off('agent:activity', this.boundOnAgentActivity);
    GameBridge.off('agents:update', this.boundOnAgentsUpdate);
    for (const overlay of this.toolOverlays.values()) overlay.destroy();
    for (const overlay of this.inferredOverlays.values()) overlay.destroy();
    this.toolOverlays.clear();
    this.inferredOverlays.clear();
  }
}
