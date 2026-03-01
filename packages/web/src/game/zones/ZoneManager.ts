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

  private computeLayout(count: number): ZoneLayout {
    const cols = 4;
    const rows = Math.max(1, Math.ceil(Math.max(count, 1) / cols));
    const worldWidth = 800;
    const worldHeight = Math.max(480, 100 + rows * 140 + 100);
    const desks: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        desks.push({ x: 160 + c * 160, y: 140 + r * 140 });
      }
    }
    // Coffee spots spread along bottom
    const coffeeY = worldHeight - 60;
    const coffeeSpots = Array.from({ length: Math.max(count, 4) }, (_, i) => ({
      x: 40 + (i % 6) * 40,
      y: coffeeY - 10 + (i % 2) * 15,
    }));
    return { desks, coffeeSpots, worldWidth, worldHeight };
  }
}
