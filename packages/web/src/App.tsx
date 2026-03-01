import { useWebSocket } from './hooks/useWebSocket';
import { useGameStore } from './store';
import { selectAgentList, selectSelectedAgent } from './store/selectors';
import { PhaserGame } from './game/PhaserGame';
import { AgentPanel } from './components/AgentPanel';
import './App.css';

export function App() {
  const { send } = useWebSocket();
  const connected = useGameStore((s) => s.connected);
  const agents = useGameStore(selectAgentList);
  const selectedAgent = useGameStore(selectSelectedAgent);
  const selectAgent = useGameStore((s) => s.selectAgent);

  // send is currently unused but will be needed for chat features
  void send;

  return (
    <div className="app">
      {!connected && <div className="reconnecting-banner">Reconnecting...</div>}
      <PhaserGame agents={agents} onAgentClick={(id) => selectAgent(id)} />
      {selectedAgent && (
        <AgentPanel agent={selectedAgent} onClose={() => selectAgent(null)} />
      )}
    </div>
  );
}
