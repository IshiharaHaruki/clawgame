import Phaser from 'phaser';
import type { AgentInfo } from '../../types';

// Render at 2x resolution then scale down for crisp text
const SCALE = 0.5;
const INNER_WIDTH = 360; // 180 * 2
const INNER_PADDING = 12; // 6 * 2
const INNER_LINE_HEIGHT = 22; // ~11 * 2
const FONT_SIZE = '11px'; // rendered at 2x, displayed at 5.5px equivalent
const BG_COLOR = 0x1a1a2e;
const BG_ALPHA = 0.92;
const BORDER_COLOR = 0x4a4a6a;

export class HoverTooltip {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private lines: Phaser.GameObjects.Text[] = [];
  private visible = false;

  constructor(private scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.bg]);
    this.container.setDepth(35);
    this.container.setScale(SCALE);
    this.container.setVisible(false);
  }

  show(agent: AgentInfo, x: number, y: number, currentTool?: string, streamingText?: string): void {
    // Clear previous text lines
    for (const line of this.lines) line.destroy();
    this.lines = [];

    const statusEmoji = agent.status === 'working' ? '\u{1F7E2}' : agent.status === 'error' ? '\u{1F534}' : agent.status === 'idle' ? '\u26AA' : '\u{1F7E1}';
    const textLines: string[] = [
      `${agent.displayName}  ${statusEmoji} ${agent.status}`,
      agent.model ?? '',
    ];

    if (currentTool) {
      textLines.push(`\u{1F527} ${currentTool}`);
    }

    if (streamingText) {
      const snippet = streamingText.slice(0, 40);
      textLines.push(`\u{1F4AC} "${snippet}${streamingText.length > 40 ? '...' : ''}"`);
    }

    // Stats line if available
    if (agent.stats) {
      const { totalInputTokens, totalOutputTokens, totalCost, errorCount, toolCallCount } = agent.stats;
      const totalTokens = totalInputTokens + totalOutputTokens;
      const tokensStr = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : `${totalTokens}`;
      const costStr = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0';
      textLines.push('');
      textLines.push(`Tokens: ${tokensStr} / ${costStr}`);
      textLines.push(`Errors: ${errorCount}  Tools: ${toolCallCount}`);
    }

    // Filter empty lines
    const filtered = textLines.filter((l) => l !== '');

    // Create text objects at 2x resolution
    let yOff = INNER_PADDING;
    for (const text of filtered) {
      const t = this.scene.add.text(INNER_PADDING, yOff, text, {
        fontFamily: '"Press Start 2P"',
        fontSize: FONT_SIZE,
        color: '#e0e0e0',
        wordWrap: { width: INNER_WIDTH - INNER_PADDING * 2 },
        resolution: 2,
      });
      this.container.add(t);
      this.lines.push(t);
      yOff += INNER_LINE_HEIGHT;
    }

    const totalHeight = yOff + INNER_PADDING;

    // Draw background at 2x
    this.bg.clear();
    this.bg.fillStyle(BG_COLOR, BG_ALPHA);
    this.bg.fillRoundedRect(0, 0, INNER_WIDTH, totalHeight, 8);
    this.bg.lineStyle(2, BORDER_COLOR, 0.8);
    this.bg.strokeRoundedRect(0, 0, INNER_WIDTH, totalHeight, 8);

    // Position in world coords (container is scaled 0.5x, so visual size = inner / 2)
    const visualWidth = INNER_WIDTH * SCALE;
    const visualHeight = totalHeight * SCALE;
    let posY = y - visualHeight - 30;
    if (posY < 0) posY = y + 30;
    let posX = x - visualWidth / 2;
    if (posX < 0) posX = 4;
    if (posX + visualWidth > 800) posX = 800 - visualWidth - 4;

    this.container.setPosition(posX, posY);
    this.container.setVisible(true);
    this.visible = true;
  }

  hide(): void {
    if (!this.visible) return;
    this.container.setVisible(false);
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    for (const line of this.lines) line.destroy();
    this.bg.destroy();
    this.container.destroy();
  }
}
