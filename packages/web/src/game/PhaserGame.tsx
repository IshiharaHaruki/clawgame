import { useLayoutEffect, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { AgentInfo } from '../types';
import { GameBridge } from './GameBridge';
import { OfficeScene } from './OfficeScene';

interface Props {
  agents: AgentInfo[];
  onAgentClick: (agentId: string) => void;
}

export function PhaserGame({ agents, onAgentClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    if (gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current!,
      width: 800,
      height: 480,
      pixelArt: true,
      backgroundColor: '#1a1a2e',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [OfficeScene],
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Push agent updates to GameBridge
  useEffect(() => {
    GameBridge.updateAgents(agents);
  }, [agents]);

  // Listen for agent clicks from GameBridge
  useEffect(() => {
    const handler = (agentId: unknown) => {
      onAgentClick(agentId as string);
    };
    GameBridge.on('agent:click', handler);
    return () => {
      GameBridge.off('agent:click', handler);
    };
  }, [onAgentClick]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
