import Phaser from 'phaser';

const MAX_CHARS = 30;
const BUBBLE_PADDING = 4;
const FONT_SIZE = 6;
const AUTO_DISMISS_MS = 4000;
const MAX_POOL_SIZE = 10;

interface BubbleConfig {
  text: string;
  style: 'speak' | 'think';
  x: number;
  y: number;
}

export class ChatBubble {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private onDismiss: (() => void) | null = null;

  constructor(private scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: `${FONT_SIZE}px`,
      color: '#1a1a2e',
      wordWrap: { width: MAX_CHARS * (FONT_SIZE * 0.6) },
    });
    this.container = scene.add.container(0, 0, [this.bg, this.label]);
    this.container.setVisible(false);
    this.container.setDepth(35); // Above overlays
  }

  show(config: BubbleConfig, onDismiss: () => void): void {
    this.onDismiss = onDismiss;
    const truncated =
      config.text.length > MAX_CHARS
        ? config.text.slice(0, MAX_CHARS - 3) + '...'
        : config.text;

    this.label.setText(truncated);
    const textWidth = this.label.width;
    const textHeight = this.label.height;
    const bubbleWidth = textWidth + BUBBLE_PADDING * 2;
    const bubbleHeight = textHeight + BUBBLE_PADDING * 2;

    this.bg.clear();
    const bgColor = config.style === 'speak' ? 0xffffff : 0xd5d8dc;
    const borderColor = config.style === 'speak' ? 0x1a1a2e : 0x7f8c8d;

    // Draw rounded rectangle bubble
    this.bg.fillStyle(bgColor, 1);
    this.bg.lineStyle(1, borderColor, 1);
    this.bg.fillRoundedRect(
      -bubbleWidth / 2,
      -bubbleHeight - 8,
      bubbleWidth,
      bubbleHeight,
      3,
    );
    this.bg.strokeRoundedRect(
      -bubbleWidth / 2,
      -bubbleHeight - 8,
      bubbleWidth,
      bubbleHeight,
      3,
    );

    // Small triangle pointer
    this.bg.fillStyle(bgColor, 1);
    this.bg.fillTriangle(-3, -8, 3, -8, 0, -4);

    this.label.setPosition(
      -textWidth / 2,
      -bubbleHeight - 8 + BUBBLE_PADDING,
    );

    this.container.setPosition(config.x, config.y);
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.container.setScale(0.5);

    // Pop-in animation
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Auto dismiss
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.dismiss(), AUTO_DISMISS_MS);
  }

  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 0.5,
      duration: 150,
      onComplete: () => {
        this.container.setVisible(false);
        this.onDismiss?.();
        this.onDismiss = null;
      },
    });
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.container.destroy();
  }
}

/** Object pool for chat bubbles */
export class ChatBubblePool {
  private available: ChatBubble[] = [];
  private active = new Map<string, ChatBubble>(); // agentId -> active bubble

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
  ) {
    // Pre-allocate a few
    for (let i = 0; i < 3; i++) {
      const bubble = new ChatBubble(scene);
      layer.add(bubble.getContainer());
      this.available.push(bubble);
    }
  }

  show(
    agentId: string,
    text: string,
    style: 'speak' | 'think',
    x: number,
    y: number,
  ): void {
    // Dismiss existing bubble for this agent
    const existing = this.active.get(agentId);
    if (existing) {
      existing.dismiss();
    }

    // Get or create a bubble
    let bubble = this.available.pop();
    if (!bubble) {
      if (this.active.size >= MAX_POOL_SIZE) return; // Cap
      bubble = new ChatBubble(this.scene);
      this.layer.add(bubble.getContainer());
    }

    this.active.set(agentId, bubble);
    bubble.show({ text, style, x, y: y - 24 }, () => {
      this.active.delete(agentId);
      this.available.push(bubble!);
    });
  }

  destroy(): void {
    for (const bubble of this.active.values()) bubble.destroy();
    for (const bubble of this.available) bubble.destroy();
    this.active.clear();
    this.available.length = 0;
  }
}
