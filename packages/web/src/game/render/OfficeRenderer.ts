import Phaser from 'phaser';
import { LayerManager } from '../layers/LayerManager';

const OFFICE_WIDTH = 800;
const OFFICE_HEIGHT = 480;

export const DESK_POSITIONS = [
  // Row 1
  { x: 160, y: 140 },
  { x: 320, y: 140 },
  { x: 480, y: 140 },
  { x: 640, y: 140 },
  // Row 2
  { x: 160, y: 280 },
  { x: 320, y: 280 },
  { x: 480, y: 280 },
  { x: 640, y: 280 },
];

export const COFFEE_AREA = { x: 120, y: 420 };

export class OfficeRenderer {
  constructor(scene: Phaser.Scene, layers: LayerManager) {
    this.drawBackground(scene, layers);
    this.drawFurniture(scene, layers);
  }

  private drawBackground(scene: Phaser.Scene, layers: LayerManager): void {
    const g = scene.add.graphics();

    // Floor
    g.fillStyle(0xd2b48c);
    g.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

    // Walls
    g.fillStyle(0x4a4a4a);
    g.fillRect(0, 0, OFFICE_WIDTH, 10); // top
    g.fillRect(0, 0, 10, OFFICE_HEIGHT); // left
    g.fillRect(OFFICE_WIDTH - 10, 0, 10, OFFICE_HEIGHT); // right
    g.fillRect(0, OFFICE_HEIGHT - 10, OFFICE_WIDTH, 10); // bottom

    layers.background.add(g);

    // Title
    const title = scene.add
      .text(OFFICE_WIDTH / 2, 24, 'ClawGame Office', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#ecf0f1',
      })
      .setOrigin(0.5, 0);

    layers.background.add(title);
  }

  private drawFurniture(scene: Phaser.Scene, layers: LayerManager): void {
    const g = scene.add.graphics();

    // Desks
    for (const pos of DESK_POSITIONS) {
      g.fillStyle(0x8b4513);
      g.fillRect(pos.x - 30, pos.y - 10, 60, 20);
      // Desk legs
      g.fillStyle(0x654321);
      g.fillRect(pos.x - 28, pos.y + 10, 4, 6);
      g.fillRect(pos.x + 24, pos.y + 10, 4, 6);
    }

    // Coffee bar (bottom-left)
    g.fillStyle(0x3e2723);
    g.fillRect(30, 380, 180, 60);
    g.fillStyle(0x5d4037);
    g.fillRect(35, 385, 170, 50);

    // Schedule board (bottom-right)
    g.fillStyle(0x2c3e50);
    g.fillRect(580, 380, 190, 60);
    g.fillStyle(0x34495e);
    g.fillRect(585, 385, 180, 50);

    layers.furniture.add(g);

    // Coffee label
    const coffeeLabel = scene.add.text(70, 395, 'COFFEE', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#d2b48c',
    });
    layers.furniture.add(coffeeLabel);

    // Schedule label
    const scheduleLabel = scene.add.text(610, 395, 'SCHEDULES', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#95a5a6',
    });
    layers.furniture.add(scheduleLabel);
  }
}
