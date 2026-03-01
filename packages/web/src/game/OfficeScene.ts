import Phaser from 'phaser';
import type { AgentInfo } from '../types';
import { GameBridge } from './GameBridge';
import { LayerManager } from './layers/LayerManager';
import { OfficeRenderer } from './render/OfficeRenderer';
import { ZoneManager } from './zones/ZoneManager';
import { AgentManager } from './agents/AgentManager';
import { OverlayManager } from './overlays/OverlayManager';

export class OfficeScene extends Phaser.Scene {
  private layers!: LayerManager;
  private zoneManager!: ZoneManager;
  private agentManager!: AgentManager;
  private overlayManager!: OverlayManager;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.layers = new LayerManager(this);
    this.zoneManager = new ZoneManager(this, 0);

    const { width, height } = this.zoneManager.getWorldSize();
    new OfficeRenderer(this, this.layers);

    // Camera bounds
    this.cameras.main.setBounds(0, 0, width, height);

    // Create agent manager and overlay manager
    this.agentManager = new AgentManager(this, this.zoneManager, this.layers);
    this.overlayManager = new OverlayManager(this, this.layers);

    // Listen for agent updates from GameBridge
    const onUpdate = (agents: unknown) => {
      this.agentManager.update(agents as AgentInfo[]);
      this.syncOverlayPositions();
    };
    GameBridge.on('agents:update', onUpdate);

    this.events.on('destroy', () => {
      GameBridge.off('agents:update', onUpdate);
      this.agentManager.destroy();
      this.overlayManager.destroy();
    });
  }

  /** Keep overlay positions in sync with agent character positions */
  private syncOverlayPositions(): void {
    for (const [id, char] of this.agentManager.getAllCharacters()) {
      const pos = char.getPosition();
      this.overlayManager.updateAgentPosition(id, pos.x, pos.y);
    }
  }
}
