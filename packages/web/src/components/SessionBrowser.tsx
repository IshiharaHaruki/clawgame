import { useEffect, useState, useCallback } from 'react';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';
import '../styles/session-browser.css';

interface SessionEntry {
  key: string;
  displayName?: string;
  model?: string;
  updatedAt?: number;
  derivedTitle?: string;
  lastMessage?: string;
}

interface HistoryMessage {
  role: string;
  content: Array<{ type: string; text: string }>;
  timestamp: number;
}

interface SessionBrowserProps {
  onClose: () => void;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SessionBrowser({ onClose }: SessionBrowserProps) {
  const send = useWsSend();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<HistoryMessage[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  useEffect(() => {
    rpcCall(send, 'sessions.list', { includeDerivedTitles: true, includeLastMessage: true })
      .then((result) => {
        const r = result as { sessions?: SessionEntry[] };
        if (r?.sessions) setSessions(r.sessions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [send]);

  const loadTranscript = useCallback((sessionKey: string) => {
    setSelectedKey(sessionKey);
    setTranscript([]);
    setTranscriptLoading(true);
    rpcCall(send, 'chat.history', { sessionKey, limit: 100 })
      .then((result) => {
        const r = result as { messages?: HistoryMessage[] };
        if (r?.messages) setTranscript(r.messages);
      })
      .catch(() => {})
      .finally(() => setTranscriptLoading(false));
  }, [send]);

  return (
    <div className="session-browser">
      <div className="session-browser__header">
        <button className="panel__close" onClick={onClose}>X</button>
        <h2 className="session-browser__title">Sessions</h2>
      </div>
      <div className="session-browser__body">
        <div className="session-browser__list">
          {loading && <div className="session-browser__empty">Loading sessions...</div>}
          {!loading && sessions.length === 0 && (
            <div className="session-browser__empty">No sessions found.</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.key}
              className={`session-item ${selectedKey === s.key ? 'session-item--active' : ''}`}
              onClick={() => loadTranscript(s.key)}
            >
              <div className="session-item__name">{s.displayName ?? s.key}</div>
              {s.derivedTitle && (
                <div className="session-item__title">{s.derivedTitle}</div>
              )}
              <div className="session-item__meta">
                {s.model && <span className="session-item__model">{s.model}</span>}
                {s.updatedAt && <span className="session-item__time">{formatTime(s.updatedAt)}</span>}
              </div>
              {s.lastMessage && (
                <div className="session-item__preview">{s.lastMessage}</div>
              )}
            </button>
          ))}
        </div>
        <div className="session-browser__transcript">
          {!selectedKey && (
            <div className="session-browser__empty">Select a session to view transcript.</div>
          )}
          {selectedKey && transcriptLoading && (
            <div className="session-browser__empty">Loading transcript...</div>
          )}
          {selectedKey && !transcriptLoading && transcript.length === 0 && (
            <div className="session-browser__empty">No messages in this session.</div>
          )}
          {transcript.map((msg, i) => {
            const text = msg.content
              ?.filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('') ?? '';
            return (
              <div key={i} className={`transcript-msg transcript-msg--${msg.role}`}>
                <div className="transcript-msg__role">
                  {msg.role === 'user' ? 'You' : 'Agent'}
                  {msg.timestamp > 0 && (
                    <span className="transcript-msg__time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="transcript-msg__text">{text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
