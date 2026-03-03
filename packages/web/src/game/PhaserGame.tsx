import { useLayoutEffect, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { AgentInfo } from '../types';
import { useGameStore } from '../store';
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

    // No cleanup — Phaser.Game.destroy() in React 18 StrictMode causes
    // the canvas to be removed and recreation fails silently.
    // The game is a singleton and lives for the lifetime of the page.
  }, []);

  // Push agent updates to GameBridge
  useEffect(() => {
    GameBridge.updateAgents(agents);
  }, [agents]);

  // Subscribe to activeTools changes and forward to GameBridge
  useEffect(() => {
    let prevTools = new Map<string, string>();
    const unsub = useGameStore.subscribe((state) => {
      const activeTools = state.activeTools;
      // Detect new tool starts
      for (const [agentId, toolName] of activeTools) {
        if (!prevTools.has(agentId)) {
          GameBridge.emitToolEvent(agentId, toolName, 'start');
        }
      }
      // Detect tool ends
      for (const agentId of prevTools.keys()) {
        if (!activeTools.has(agentId)) {
          GameBridge.emitToolEvent(agentId, prevTools.get(agentId)!, 'end');
        }
      }
      prevTools = new Map(activeTools);
    });
    return unsub;
  }, []);

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
