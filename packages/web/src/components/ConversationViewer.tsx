import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';
import { StreamingText } from './StreamingText';
import type { AgentInfo, ChatMessage } from '../types';

interface ConversationViewerProps {
  agent: AgentInfo;
  onClose: () => void;
}

export function ConversationViewer({ agent, onClose }: ConversationViewerProps) {
  const send = useWsSend();
  const sessionKey = agent.sessionKey ?? `agent:${agent.id}`;
  const messages = useGameStore((s) => s.chatMessages.get(sessionKey) ?? []);
  const streamingText = useGameStore((s) => s.chatStreaming.get(sessionKey));
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Subscribe and load history
  useEffect(() => {
    send({ type: 'subscribe:chat', data: { sessionKey } });

    rpcCall(send, 'chat.history', { sessionKey, limit: 100 })
      .then((result) => {
        const r = result as { messages?: Array<{ role: string; content: Array<{ type: string; text: string }>; timestamp: number }> };
        if (r?.messages) {
          const store = useGameStore.getState();
          for (const msg of r.messages) {
            const text = msg.content
              ?.filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('') ?? '';
            store.appendChatMessage(agent.id, {
              runId: '',
              sessionKey,
              role: msg.role as 'user' | 'assistant',
              content: text,
              state: 'final',
              timestamp: msg.timestamp,
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => {
      send({ type: 'unsubscribe:chat', data: { sessionKey } });
    };
  }, [sessionKey, send, agent.id]);

  // Scroll handling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atBottom = scrollHeight - scrollTop - clientHeight < 40;
      autoScrollRef.current = atBottom;
      setShowScrollDown(!atBottom);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      autoScrollRef.current = true;
      setShowScrollDown(false);
    }
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group consecutive messages by role
  const groupedMessages = groupMessages(messages);

  return (
    <div className="conversation-viewer">
      <div className="conversation-viewer__header">
        <button className="panel__close" onClick={onClose}>X</button>
        <h2 className="conversation-viewer__title">
          Conversation: {agent.displayName}
        </h2>
      </div>

      <div className="conversation-viewer__body" ref={scrollRef}>
        {loading && <div className="chat-empty">Loading conversation...</div>}

        {!loading && groupedMessages.length === 0 && !streamingText && (
          <div className="chat-empty">No messages in this conversation yet.</div>
        )}

        {groupedMessages.map((group, gi) => (
          <div key={gi} className={`conv-group conv-group--${group.role}`}>
            <div className="conv-group__label">
              {group.role === 'user' ? 'You' : 'Agent'}
              {group.messages[0]?.timestamp > 0 && (
                <span className="conv-group__time">{formatTime(group.messages[0].timestamp)}</span>
              )}
            </div>
            {group.messages.map((msg, mi) => (
              <div key={mi} className="conv-message">
                <div className="conv-message__text">{msg.content}</div>
              </div>
            ))}
          </div>
        ))}

        {streamingText && (
          <div className="conv-group conv-group--assistant">
            <div className="conv-group__label">Agent</div>
            <div className="conv-message">
              <div className="conv-message__text">
                <StreamingText text={streamingText} isStreaming={true} />
              </div>
            </div>
          </div>
        )}
      </div>

      {showScrollDown && (
        <button className="conversation-viewer__scroll-down" onClick={scrollToBottom}>
          ↓
        </button>
      )}
    </div>
  );
}

interface MessageGroup {
  role: 'user' | 'assistant';
  messages: ChatMessage[];
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === msg.role) {
      last.messages.push(msg);
    } else {
      groups.push({ role: msg.role, messages: [msg] });
    }
  }
  return groups;
}
