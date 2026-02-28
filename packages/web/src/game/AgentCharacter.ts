import Phaser from 'phaser';
import type { AgentStatus } from '../types';
import { GameBridge } from './GameBridge';
import { generateCharacterTextures } from './SpriteGenerator';

interface Position {
  x: number;
  y: number;
}

const STATUS_ICONS: Record<AgentStatus, string> = {
  working: '',
  cron_running: '\u23F0',
  idle: '\u2615',
  error: '\u26A0\uFE0F',
  offline: 'zzz',
};

export class AgentCharacter {
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Text;
  private currentStatus: AgentStatus = 'idle';
  private scene: Phaser.Scene;
  private agentId: string;
  private deskPos: Position;
  private coffeePos: Position;

  constructor(
    scene: Phaser.Scene,
    agentId: string,
    displayName: string,
    deskPos: Position,
    coffeePos: Position,
  ) {
    this.scene = scene;
    this.agentId = agentId;
    this.deskPos = deskPos;
    this.coffeePos = coffeePos;

    generateCharacterTextures(scene, agentId);

    this.sprite = scene.add.sprite(coffeePos.x, coffeePos.y, `agent-${agentId}-stand`);
    this.sprite.setScale(2);
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => {
      GameBridge.notifyAgentClick(agentId);
    });

    this.nameLabel = scene.add.text(coffeePos.x, coffeePos.y + 20, displayName, {
      fontFamily: '"Press Start 2P"',
      fontSize: '6px',
      color: '#ffffff',
      align: 'center',
    });
    this.nameLabel.setOrigin(0.5, 0);

    this.statusIcon = scene.add.text(coffeePos.x + 14, coffeePos.y - 16, '', {
      fontSize: '12px',
      align: 'center',
    });
    this.statusIcon.setOrigin(0.5, 0.5);
  }

  setStatus(status: AgentStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;

    this.sprite.setAlpha(1);
    const icon = STATUS_ICONS[status];
    this.statusIcon.setText(icon);

    let targetPos: Position;
    let textureKey: string;

    switch (status) {
      case 'working':
      case 'cron_running':
      case 'error':
        targetPos = this.deskPos;
        textureKey = `agent-${this.agentId}-sit`;
        break;
      case 'idle':
        targetPos = this.coffeePos;
        textureKey = `agent-${this.agentId}-stand`;
        break;
      case 'offline':
        targetPos = this.coffeePos;
        textureKey = `agent-${this.agentId}-stand`;
        this.sprite.setAlpha(0.3);
        break;
    }

    this.scene.tweens.add({
      targets: [this.sprite, this.nameLabel, this.statusIcon],
      duration: 600,
      ease: 'Power2',
      onUpdate: () => {
        this.nameLabel.setPosition(this.sprite.x, this.sprite.y + 20);
        this.statusIcon.setPosition(this.sprite.x + 14, this.sprite.y - 16);
      },
    });

    this.scene.tweens.add({
      targets: this.sprite,
      x: targetPos!.x,
      y: targetPos!.y,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        this.sprite.setTexture(textureKey!);
        this.nameLabel.setPosition(this.sprite.x, this.sprite.y + 20);
        this.statusIcon.setPosition(this.sprite.x + 14, this.sprite.y - 16);
      },
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.statusIcon.destroy();
  }
}
