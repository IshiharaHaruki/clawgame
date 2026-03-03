import type { AgentInfo } from '../../types';

/**
 * HTML DOM-based hover tooltip.
 * Renders text using the browser's native text engine at full screen resolution
 * instead of inside the Phaser canvas (which scales 800x480 → screen size and blurs text).
 */
export class HoverTooltip {
  private el: HTMLDivElement;
  private visible = false;
  private gameWidth: number;
  private gameHeight: number;

  constructor(
    private parentEl: HTMLElement,
    gameWidth: number,
    gameHeight: number,
  ) {
    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;
    this.el = document.createElement('div');
    this.el.className = 'game-tooltip';
    this.el.style.display = 'none';
    parentEl.appendChild(this.el);
  }

  show(agent: AgentInfo, worldX: number, worldY: number, currentTool?: string): void {
    const lines: string[] = [];

    const statusDot = agent.status === 'working' ? '🟢' : agent.status === 'error' ? '🔴' : agent.status === 'idle' ? '⚪' : '🟡';
    lines.push(`<div class="game-tooltip__name">${esc(agent.displayName)} ${statusDot} ${esc(agent.status)}</div>`);

    if (agent.model) {
      lines.push(`<div class="game-tooltip__model">${esc(agent.model)}</div>`);
    }

    if (currentTool) {
      lines.push(`<div class="game-tooltip__tool">🔧 ${esc(currentTool)}</div>`);
    }

    if (agent.stats) {
      const { totalInputTokens, totalOutputTokens, totalCost, errorCount, toolCallCount } = agent.stats;
      const totalTokens = totalInputTokens + totalOutputTokens;
      const tokensStr = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : `${totalTokens}`;
      const costStr = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0';
      lines.push(`<div class="game-tooltip__sep"></div>`);
      lines.push(`<div class="game-tooltip__stat">Tokens: ${tokensStr} / ${costStr}</div>`);
      lines.push(`<div class="game-tooltip__stat">Errors: ${errorCount}  Tools: ${toolCallCount}</div>`);
    }

    this.el.innerHTML = lines.join('');

    // Convert game world coords to screen coords
    const canvas = this.parentEl.querySelector('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.gameWidth;
    const scaleY = rect.height / this.gameHeight;
    const screenX = rect.left + worldX * scaleX;
    const screenY = rect.top + worldY * scaleY;

    // Position above agent, flip if too high
    this.el.style.display = 'block';
    const tooltipRect = this.el.getBoundingClientRect();
    let top = screenY - tooltipRect.height - 40 * scaleY;
    if (top < rect.top) top = screenY + 30 * scaleY;
    let left = screenX - tooltipRect.width / 2;
    if (left < rect.left) left = rect.left + 4;
    if (left + tooltipRect.width > rect.right) left = rect.right - tooltipRect.width - 4;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.visible = true;
  }

  hide(): void {
    if (!this.visible) return;
    this.el.style.display = 'none';
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.el.remove();
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
