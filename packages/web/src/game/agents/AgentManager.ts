import type Phaser from 'phaser';
import { AgentCharacter } from '../AgentCharacter';
import type { ZoneManager } from '../zones/ZoneManager';
import type { LayerManager } from '../layers/LayerManager';
import type { AgentInfo } from '../../types';

export class AgentManager {
  private characters = new Map<string, AgentCharacter>();

  constructor(
    private scene: Phaser.Scene,
    private zoneManager: ZoneManager,
    private layers: LayerManager,
    private onAgentRemoved?: (agentId: string) => void,
  ) {}

  getCharacter(id: string): AgentCharacter | undefined {
    return this.characters.get(id);
  }

  getAllCharacters(): Map<string, AgentCharacter> {
    return this.characters;
  }

  update(agents: AgentInfo[]): void {
    const currentIds = new Set(agents.map((a) => a.id));

    // Remove agents that no longer exist
    for (const [id, char] of this.characters) {
      if (!currentIds.has(id)) {
        char.destroy();
        this.characters.delete(id);
        this.onAgentRemoved?.(id);
      }
    }

    // Recalculate layout when agent count changes
    this.zoneManager.recalculate(agents.length);

    // Create or update agents
    let deskIndex = 0;
    for (const agent of agents) {
      let char = this.characters.get(agent.id);
      if (!char) {
        const deskPos = this.zoneManager.getDeskPosition(deskIndex);
        const coffeePos = this.zoneManager.getCoffeePosition(deskIndex);
        char = new AgentCharacter(this.scene, agent, deskPos, coffeePos);
        // Add container to agents layer
        this.layers.agents.add(char.getContainer());
        this.characters.set(agent.id, char);
      }
      char.setStatus(agent.status);
      deskIndex++;
    }
  }

  destroy(): void {
    for (const char of this.characters.values()) {
      char.destroy();
    }
    this.characters.clear();
  }
}
