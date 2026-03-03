import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useGameStore } from './store';
import { NotificationService } from './services/NotificationService';
import { SoundService } from './services/SoundService';
import { selectAgentList, selectSelectedAgent } from './store/selectors';
import { PhaserGame } from './game/PhaserGame';
import { AgentPanel } from './components/AgentPanel';
import { ConversationViewer } from './components/ConversationViewer';
import { CronTimeline } from './components/CronTimeline';
import { SessionBrowser } from './components/SessionBrowser';
import { DailyReport } from './components/DailyReport';
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
  const openConversation = useGameStore((s) => s.openConversation);
  const closeConversation = useGameStore((s) => s.closeConversation);
  const conversationAgent = conversationAgentId
    ? agents.find((a) => a.id === conversationAgentId)
    : undefined;

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSessionBrowser, setShowSessionBrowser] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const showSessionBrowserRef = useRef(false);
  const showDailyReportRef = useRef(false);
  showSessionBrowserRef.current = showSessionBrowser;
  showDailyReportRef.current = showDailyReport;

  // Request notification permission on mount
  useEffect(() => {
    NotificationService.requestPermission();
  }, []);

  // Keyboard shortcuts
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const store = useGameStore.getState();
    const list = store.agentList;

    // 1-9: select agent by index
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < list.length) {
        store.selectAgent(list[idx].id);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if (showSessionBrowserRef.current) setShowSessionBrowser(false);
        else if (showDailyReportRef.current) setShowDailyReport(false);
        else if (store.conversationAgentId) store.closeConversation();
        else if (store.selectedAgentId) store.selectAgent(null);
        break;
      case 'c':
        if (store.selectedAgentId) store.openConversation(store.selectedAgentId);
        break;
      case 'h':
        setShowSessionBrowser((prev) => !prev);
        break;
      case 'r':
        setShowDailyReport((prev) => !prev);
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleKeydown]);

  return (
    <WebSocketContext.Provider value={send}>
      <div className="app">
        {!connected && <div className="reconnecting-banner">Reconnecting...</div>}
        <button
          className="sound-toggle"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) SoundService.enable();
            else SoundService.disable();
          }}
          title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
        >
          {soundEnabled ? '\u{1F50A}' : '\u{1F507}'}
        </button>
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
        {showSessionBrowser && (
          <ErrorBoundary>
            <SessionBrowser onClose={() => setShowSessionBrowser(false)} />
          </ErrorBoundary>
        )}
        {showDailyReport && (
          <ErrorBoundary>
            <DailyReport onClose={() => setShowDailyReport(false)} />
          </ErrorBoundary>
        )}
      </div>
    </WebSocketContext.Provider>
  );
}
