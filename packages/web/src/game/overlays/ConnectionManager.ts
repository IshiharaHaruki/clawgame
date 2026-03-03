import type Phaser from 'phaser';
import { ConnectionLine } from './ConnectionLine';
import { GameBridge } from '../GameBridge';

type Listener = (...args: unknown[]) => void;

const MAX_LINES = 5;

export class ConnectionManager {
  private lines: ConnectionLine[] = [];
  private boundOnConnection: Listener;

  constructor(
    private scene: Phaser.Scene,
    private getPosition: (agentId: string) => { x: number; y: number } | undefined,
  ) {
    this.boundOnConnection = (data: unknown) => {
      const { fromAgentId, toAgentId } = data as { fromAgentId: string; toAgentId: string };
      this.addConnection(fromAgentId, toAgentId);
    };
    GameBridge.on('agent:connection', this.boundOnConnection);
  }

  private addConnection(fromId: string, toId: string): void {
    const from = this.getPosition(fromId);
    const to = this.getPosition(toId);
    if (!from || !to) return;

    // Limit active lines
    while (this.lines.length >= MAX_LINES) {
      const oldest = this.lines.shift();
      oldest?.destroy();
    }

    this.lines.push(new ConnectionLine(this.scene, from, to));
  }

  update(): void {
    this.lines = this.lines.filter((line) => line.update());
  }

  destroy(): void {
    GameBridge.off('agent:connection', this.boundOnConnection);
    for (const line of this.lines) line.destroy();
    this.lines = [];
  }
}
