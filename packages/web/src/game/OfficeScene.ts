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
    this.agentManager = new AgentManager(this, this.zoneManager, this.layers, (agentId) => {
      this.overlayManager.removeAgent(agentId);
    });
    this.overlayManager = new OverlayManager(this, this.layers, (agentId) => {
      const char = this.agentManager.getCharacter(agentId);
      return char?.getPosition();
    });

    // Listen for agent updates from GameBridge
    const onUpdate = (agents: unknown) => {
      this.agentManager.update(agents as AgentInfo[]);

      // Sync camera bounds to match potentially resized world
      const newSize = this.zoneManager.getWorldSize();
      this.cameras.main.setBounds(0, 0, newSize.width, newSize.height);
      if (newSize.height > this.scale.height) {
        const zoom = this.scale.height / newSize.height;
        this.cameras.main.setZoom(zoom);
        this.cameras.main.centerOn(newSize.width / 2, newSize.height / 2);
      } else {
        this.cameras.main.setZoom(1);
        this.cameras.main.scrollY = 0;
      }

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
