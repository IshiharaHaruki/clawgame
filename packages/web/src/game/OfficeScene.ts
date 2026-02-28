import Phaser from 'phaser';
import type { AgentInfo } from '../types';
import { GameBridge } from './GameBridge';
import { AgentCharacter } from './AgentCharacter';

const OFFICE_WIDTH = 800;
const OFFICE_HEIGHT = 480;

const DESK_POSITIONS = [
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

const COFFEE_AREA = { x: 120, y: 420 };

export class OfficeScene extends Phaser.Scene {
  private characters = new Map<string, AgentCharacter>();

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    const g = this.add.graphics();

    // Floor
    g.fillStyle(0xd2b48c);
    g.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

    // Walls
    g.fillStyle(0x4a4a4a);
    g.fillRect(0, 0, OFFICE_WIDTH, 10); // top
    g.fillRect(0, 0, 10, OFFICE_HEIGHT); // left
    g.fillRect(OFFICE_WIDTH - 10, 0, 10, OFFICE_HEIGHT); // right
    g.fillRect(0, OFFICE_HEIGHT - 10, OFFICE_WIDTH, 10); // bottom

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

    this.add.text(70, 395, 'COFFEE', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#d2b48c',
    });

    // Schedule board (bottom-right)
    g.fillStyle(0x2c3e50);
    g.fillRect(580, 380, 190, 60);
    g.fillStyle(0x34495e);
    g.fillRect(585, 385, 180, 50);

    this.add.text(610, 395, 'SCHEDULES', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#95a5a6',
    });

    // Title
    this.add.text(OFFICE_WIDTH / 2, 24, 'ClawGame Office', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#ecf0f1',
    }).setOrigin(0.5, 0);

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
