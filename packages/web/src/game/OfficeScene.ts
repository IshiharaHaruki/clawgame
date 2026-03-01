import Phaser from 'phaser';
import type { AgentInfo } from '../types';
import { GameBridge } from './GameBridge';
import { AgentCharacter } from './AgentCharacter';
import { LayerManager } from './layers/LayerManager';
import { OfficeRenderer, DESK_POSITIONS, COFFEE_AREA } from './render/OfficeRenderer';

const OFFICE_WIDTH = 800;
const OFFICE_HEIGHT = 480;

export class OfficeScene extends Phaser.Scene {
  private characters = new Map<string, AgentCharacter>();
  private layers!: LayerManager;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.layers = new LayerManager(this);
    new OfficeRenderer(this, this.layers);

    // Camera bounds
    this.cameras.main.setBounds(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

    // Listen for agent updates from GameBridge
    const onUpdate = (agents: unknown) => {
      this.updateAgents(agents as AgentInfo[]);
    };
    GameBridge.on('agents:update', onUpdate);

    this.events.on('destroy', () => {
      GameBridge.off('agents:update', onUpdate);
    });
  }

  private updateAgents(agents: AgentInfo[]): void {
    const incomingIds = new Set(agents.map((a) => a.id));

    // Remove stale characters
    for (const [id, char] of this.characters) {
      if (!incomingIds.has(id)) {
        char.destroy();
        this.characters.delete(id);
      }
    }

    // Create or update characters
    let deskIndex = 0;
    for (const agent of agents) {
      let char = this.characters.get(agent.id);
      if (!char) {
        const deskPos = DESK_POSITIONS[deskIndex % DESK_POSITIONS.length];
        // Offset coffee position slightly per agent to avoid overlap
        const coffeeOffset = (deskIndex % 4) * 40;
        const coffeePos = {
          x: COFFEE_AREA.x + coffeeOffset,
          y: COFFEE_AREA.y - 10 + (deskIndex % 2) * 15,
        };
        char = new AgentCharacter(this, agent.id, agent.displayName, deskPos, coffeePos);
        this.characters.set(agent.id, char);
      }
      char.setStatus(agent.status);
      deskIndex++;
    }
  }
}
