import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { PhaserGame } from './game/PhaserGame';
import { AgentPanel } from './components/AgentPanel';

export function App() {
  const { gameState, connected } = useGameState();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const agents = gameState?.agents ?? [];
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  return (
    <div className="app">
      {!connected && <div className="reconnecting-banner">Reconnecting...</div>}
      <PhaserGame
        agents={agents}
        onAgentClick={(agentId) => setSelectedAgentId(agentId)}
      />
      {selectedAgent && (
        <AgentPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  );
}
