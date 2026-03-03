import Phaser from 'phaser';

const LINE_COLOR = 0x3498db;
const DOT_COLOR = 0xffffff;
const FADE_DURATION = 500;
const LIFE_MS = 2000;

export class ConnectionLine {
  private graphics: Phaser.GameObjects.Graphics;
  private dot: Phaser.GameObjects.Arc;
  private progress = 0;
  private alive = true;
  private startTime: number;
  private from: { x: number; y: number };
  private to: { x: number; y: number };
  private cp1: { x: number; y: number };
  private cp2: { x: number; y: number };

  constructor(
    private scene: Phaser.Scene,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    this.from = { ...from };
    this.to = { ...to };

    // Control points for bezier curve (arc upward)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    const bulge = Math.min(dist * 0.3, 60);
    this.cp1 = { x: midX - bulge * 0.5, y: midY - bulge };
    this.cp2 = { x: midX + bulge * 0.5, y: midY - bulge };

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(25);

    this.dot = scene.add.circle(from.x, from.y, 3, DOT_COLOR);
    this.dot.setDepth(26);

    this.startTime = Date.now();

    // Animate draw progress
    scene.tweens.add({
      targets: this,
      progress: 1,
      duration: 600,
      ease: 'Power2',
    });
  }

  update(): boolean {
    if (!this.alive) return false;

    const elapsed = Date.now() - this.startTime;

    // Draw curve up to current progress
    this.graphics.clear();
    this.graphics.lineStyle(2, LINE_COLOR, elapsed > LIFE_MS ? Math.max(0, 1 - (elapsed - LIFE_MS) / FADE_DURATION) : 0.7);

    const steps = Math.floor(this.progress * 20);
    if (steps > 0) {
      this.graphics.beginPath();
      this.graphics.moveTo(this.from.x, this.from.y);
      for (let i = 1; i <= steps; i++) {
        const t = i / 20;
        const pos = this.bezierPoint(t);
        this.graphics.lineTo(pos.x, pos.y);
      }
      this.graphics.strokePath();
    }

    // Animate dot along curve
    const dotT = (elapsed % 1500) / 1500;
    const dotPos = this.bezierPoint(dotT * this.progress);
    this.dot.setPosition(dotPos.x, dotPos.y);
    this.dot.setAlpha(elapsed > LIFE_MS ? Math.max(0, 1 - (elapsed - LIFE_MS) / FADE_DURATION) : 0.9);

    // Remove after fade
    if (elapsed > LIFE_MS + FADE_DURATION) {
      this.destroy();
      return false;
    }

    return true;
  }

  private bezierPoint(t: number): { x: number; y: number } {
    const u = 1 - t;
    return {
      x: u * u * u * this.from.x + 3 * u * u * t * this.cp1.x + 3 * u * t * t * this.cp2.x + t * t * t * this.to.x,
      y: u * u * u * this.from.y + 3 * u * u * t * this.cp1.y + 3 * u * t * t * this.cp2.y + t * t * t * this.to.y,
    };
  }

  destroy(): void {
    this.alive = false;
    this.graphics.destroy();
    this.dot.destroy();
  }
}
