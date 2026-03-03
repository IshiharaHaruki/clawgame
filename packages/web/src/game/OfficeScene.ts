import Phaser from 'phaser';
import type { AgentInfo } from '../types';
import { GameBridge } from './GameBridge';
import { LayerManager } from './layers/LayerManager';
import { OfficeRenderer } from './render/OfficeRenderer';
import { ZoneManager } from './zones/ZoneManager';
import { AgentManager } from './agents/AgentManager';
import { OverlayManager } from './overlays/OverlayManager';
import { ConnectionManager } from './overlays/ConnectionManager';

export class OfficeScene extends Phaser.Scene {
  private layers!: LayerManager;
  private zoneManager!: ZoneManager;
  private agentManager!: AgentManager;
  private overlayManager!: OverlayManager;
  private connectionManager!: ConnectionManager;
  private groupLabels: Phaser.GameObjects.Text[] = [];

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
    this.connectionManager = new ConnectionManager(this, (agentId) => {
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
      this.updateGroupLabels(agents as AgentInfo[]);
    };
    GameBridge.on('agents:update', onUpdate);

    this.events.on('destroy', () => {
      GameBridge.off('agents:update', onUpdate);
      this.agentManager.destroy();
      this.overlayManager.destroy();
      this.connectionManager.destroy();
    });
  }

  update(): void {
    this.overlayManager.updateTimers();
    this.connectionManager.update();
  }

  /** Render group labels when agents have shared name prefixes */
  private updateGroupLabels(agents: AgentInfo[]): void {
    // Clear existing
    for (const label of this.groupLabels) label.destroy();
    this.groupLabels = [];

    const groups = ZoneManager.computeGroups(agents);
    if (groups.size <= 1) return; // No meaningful groups

    let deskIdx = 0;
    for (const [groupName, agentIds] of groups) {
      if (agentIds.length === 0) continue;
      const firstPos = this.zoneManager.getDeskPosition(deskIdx);
      const lastPos = this.zoneManager.getDeskPosition(deskIdx + agentIds.length - 1);
      const midX = (firstPos.x + lastPos.x) / 2;
      const topY = firstPos.y - 30;

      const label = this.add.text(midX, topY, groupName.toUpperCase(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '6px',
        color: '#8e8ea0',
        resolution: 2,
      });
      label.setOrigin(0.5, 0.5);
      label.setDepth(5);
      this.groupLabels.push(label);
      deskIdx += agentIds.length;
    }
  }

  /** Keep overlay positions in sync with agent character positions */
  private syncOverlayPositions(): void {
    for (const [id, char] of this.agentManager.getAllCharacters()) {
      const pos = char.getPosition();
      this.overlayManager.updateAgentPosition(id, pos.x, pos.y);
    }
  }
}
