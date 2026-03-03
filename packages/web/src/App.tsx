import { useWebSocket } from './hooks/useWebSocket';
import { useGameStore } from './store';
import { selectAgentList, selectSelectedAgent } from './store/selectors';
import { PhaserGame } from './game/PhaserGame';
import { AgentPanel } from './components/AgentPanel';
import { ConversationViewer } from './components/ConversationViewer';
import { CronTimeline } from './components/CronTimeline';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WebSocketContext } from './hooks/WebSocketContext';
import './App.css';

export function App() {
  const { send } = useWebSocket();
  const connected = useGameStore((s) => s.connected);
  const agents = useGameStore(selectAgentList);
  const selectedAgent = useGameStore(selectSelectedAgent);
  const selectAgent = useGameStore((s) => s.selectAgent);
  const conversationAgentId = useGameStore((s) => s.conversationAgentId);
  const closeConversation = useGameStore((s) => s.closeConversation);
  const conversationAgent = conversationAgentId
    ? agents.find((a) => a.id === conversationAgentId)
    : undefined;

  return (
    <WebSocketContext.Provider value={send}>
      <div className="app">
        {!connected && <div className="reconnecting-banner">Reconnecting...</div>}
        <PhaserGame agents={agents} onAgentClick={(id) => selectAgent(id)} />
        {selectedAgent && (
          <ErrorBoundary>
            <AgentPanel agent={selectedAgent} onClose={() => selectAgent(null)} />
          </ErrorBoundary>
        )}
        <ErrorBoundary>
          <CronTimeline />
        </ErrorBoundary>
        {conversationAgent && (
          <ErrorBoundary>
            <ConversationViewer agent={conversationAgent} onClose={closeConversation} />
          </ErrorBoundary>
        )}
      </div>
    </WebSocketContext.Provider>
  );
}
