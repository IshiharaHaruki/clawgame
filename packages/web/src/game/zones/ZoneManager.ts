import type Phaser from 'phaser';

interface ZoneLayout {
  desks: Array<{ x: number; y: number }>;
  coffeeSpots: Array<{ x: number; y: number }>;
  worldWidth: number;
  worldHeight: number;
}

export class ZoneManager {
  private layout: ZoneLayout;

  constructor(
    private scene: Phaser.Scene,
    agentCount: number,
  ) {
    this.layout = this.computeLayout(agentCount);
  }

  getDeskPosition(index: number): { x: number; y: number } {
    return this.layout.desks[index % this.layout.desks.length];
  }

  getCoffeePosition(index: number): { x: number; y: number } {
    return this.layout.coffeeSpots[index % this.layout.coffeeSpots.length];
  }

  getWorldSize(): { width: number; height: number } {
    return { width: this.layout.worldWidth, height: this.layout.worldHeight };
  }

  getDeskCount(): number {
    return this.layout.desks.length;
  }

  recalculate(agentCount: number): void {
    this.layout = this.computeLayout(agentCount);
  }

  /** Group agents by shared name prefix (e.g. "team-a-worker1" and "team-a-worker2" → group "team-a") */
  static computeGroups(agents: Array<{ id: string; displayName: string }>): Map<string, string[]> {
    if (agents.length <= 1) return new Map([['all', agents.map(a => a.id)]]);

    // Try to find common prefixes by splitting on common separators
    const groups = new Map<string, string[]>();
    for (const agent of agents) {
      // Use first word or first part before separator as group key
      const parts = agent.displayName.split(/[\s\-_:]/);
      const groupKey = parts.length > 1 ? parts[0] : 'all';
      const list = groups.get(groupKey) ?? [];
      list.push(agent.id);
      groups.set(groupKey, list);
    }

    // If all ended up in one group, or each is its own group, just use 'all'
    if (groups.size === agents.length || groups.size <= 1) {
      return new Map([['all', agents.map(a => a.id)]]);
    }

    return groups;
  }

  private computeLayout(count: number): ZoneLayout {
    const cols = 4;
    const rows = Math.max(1, Math.ceil(Math.max(count, 1) / cols));
    const worldWidth = 800;

    // Adaptive row spacing: try to fit desks + coffee within 480px
    const deskStartY = 100;
    const coffeeMargin = 80;
    const availableHeight = 480 - deskStartY - coffeeMargin;
    const rowSpacing = rows <= 1 ? 120 : Math.min(120, Math.floor(availableHeight / rows));
    const deskEndY = deskStartY + (rows - 1) * rowSpacing;
    const worldHeight = Math.max(480, deskEndY + coffeeMargin + 60);

    const desks: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        desks.push({ x: 160 + c * 160, y: deskStartY + r * rowSpacing });
      }
    }
    // Coffee spots spread along bottom
    const coffeeY = worldHeight - 60;
    const coffeeColCount = Math.min(Math.max(count, 4), 10);
    const coffeeSpacing = Math.max(30, Math.floor((worldWidth - 80) / Math.max(coffeeColCount, 1)));
    const coffeeSpots = Array.from({ length: Math.max(count, 4) }, (_, i) => ({
      x: 40 + (i % coffeeColCount) * coffeeSpacing,
      y: coffeeY - 10 + (Math.floor(i / coffeeColCount) % 2) * 20,
    }));
    return { desks, coffeeSpots, worldWidth, worldHeight };
  }
}
