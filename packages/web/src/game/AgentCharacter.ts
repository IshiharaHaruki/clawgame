import Phaser from 'phaser';
import type { AgentInfo, AgentStatus } from '../types';
import { GameBridge } from './GameBridge';
import { generateSpriteSheet, getPoseIndex } from './sprites/SpriteSheet';
import { registerAnimations } from './sprites/AnimationDefs';
import { AgentStateMachine } from './agents/AgentStateMachine';

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
  private container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Text;
  private currentStatus: AgentStatus = 'idle';
  private scene: Phaser.Scene;
  private agentId: string;
  private deskPos: Position;
  private coffeePos: Position;
  private sheetKey: string;
  private stateMachine: AgentStateMachine;
  private currentTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    agent: AgentInfo,
    deskPos: Position,
    coffeePos: Position,
  ) {
    this.scene = scene;
    this.agentId = agent.id;
    this.deskPos = deskPos;
    this.coffeePos = coffeePos;

    // Generate sprite sheet atlas and register animations
    this.sheetKey = generateSpriteSheet(scene, agent.id);
    registerAnimations(scene, agent.id);

    // Create sprite using the sheet texture with the first stand frame
    this.sprite = scene.add.sprite(
      0,
      0,
      this.sheetKey,
      getPoseIndex('STAND_1'),
    );
    this.sprite.setScale(2);

    this.nameLabel = scene.add.text(0, 20, agent.displayName, {
      fontFamily: '"Press Start 2P"',
      fontSize: '6px',
      color: '#ffffff',
      align: 'center',
    });
    this.nameLabel.setOrigin(0.5, 0);

    this.statusIcon = scene.add.text(14, -16, '', {
      fontSize: '12px',
      align: 'center',
    });
    this.statusIcon.setOrigin(0.5, 0.5);

    // Wrap everything in a container positioned at coffee area
    this.container = scene.add.container(coffeePos.x, coffeePos.y, [
      this.sprite,
      this.nameLabel,
      this.statusIcon,
    ]);

    // Make sprite interactive within the container
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => {
      GameBridge.notifyAgentClick(this.agentId);
    });
    this.sprite.on('pointerover', () => {
      GameBridge.emitAgentHover(this.agentId);
    });
    this.sprite.on('pointerout', () => {
      GameBridge.emitAgentHover(null);
    });

    // Initialize state machine and start idle animation
    this.stateMachine = new AgentStateMachine(this);
    this.playAnimation('idle');
  }

  /** Return the container so it can be added to a layer */
  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  /** Get the assigned desk position */
  getDeskPos(): Position {
    return { ...this.deskPos };
  }

  /** Get the assigned coffee position */
  getCoffeePos(): Position {
    return { ...this.coffeePos };
  }

  /** Play a named animation on this agent's sprite */
  playAnimation(name: string): void {
    const animKey = `${this.agentId}-${name}`;
    if (this.scene.anims.exists(animKey)) {
      this.sprite.play(animKey, true);
    }
  }

  /** Set the alpha (transparency) for the whole container */
  setAlpha(alpha: number): void {
    this.container.setAlpha(alpha);
  }

  /** Walk the character to a world position, playing the appropriate walk animation */
  walkTo(x: number, y: number, onComplete: () => void): void {
    // Stop any existing movement tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    const dx = x - this.container.x;
    const dy = y - this.container.y;
    const needsMove = Math.abs(dx) > 2 || Math.abs(dy) > 2;

    if (!needsMove) {
      onComplete();
      return;
    }

    // Pick a walk animation based on dominant direction
    let walkAnim: string;
    if (Math.abs(dx) > Math.abs(dy)) {
      walkAnim = dx < 0 ? 'walk-left' : 'walk-right';
    } else {
      walkAnim = dy < 0 ? 'walk-up' : 'walk-down';
    }
    this.playAnimation(walkAnim);

    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      x,
      y,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        this.currentTween = null;
        onComplete();
      },
    });
  }

  /** Register a click callback */
  onClick(callback: () => void): void {
    this.sprite.on('pointerdown', callback);
  }

  /** Update the agent status, delegating to the state machine */
  setStatus(status: AgentStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;

    // Update the status icon
    const icon = STATUS_ICONS[status];
    this.statusIcon.setText(icon);

    // Delegate movement and animation to the state machine
    this.stateMachine.transition(status);
  }

  /** Return the container's current world position */
  getPosition(): Position {
    return { x: this.container.x, y: this.container.y };
  }

  destroy(): void {
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }
    this.container.destroy();
  }
}
