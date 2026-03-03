import { useEffect, useCallback, useState } from 'react';
import { useGameStore } from '../store';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';
import { ChatHistory } from './ChatHistory';
import { ChatInput } from './ChatInput';
import type { AgentInfo, ChatMessage } from '../types';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface ChatPanelProps {
  agent: AgentInfo;
}

export function ChatPanel({ agent }: ChatPanelProps) {
  const send = useWsSend();
  const sessionKey = agent.sessionKey ?? `agent:${agent.id}`;
  const messages = useGameStore((s) => s.chatMessages.get(sessionKey) ?? EMPTY_MESSAGES);
  const streamingText = useGameStore((s) => s.chatStreaming.get(sessionKey));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to chat events for this session
  useEffect(() => {
    send({ type: 'subscribe:chat', data: { sessionKey } });

    // Load chat history
    rpcCall(send, 'chat.history', { sessionKey, limit: 50 })
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
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    return () => {
      send({ type: 'unsubscribe:chat', data: { sessionKey } });
    };
  }, [sessionKey, send, agent.id]);

  const handleSend = useCallback((message: string) => {
    // Add user message to local state immediately
    const store = useGameStore.getState();
    store.appendChatMessage(agent.id, {
      runId: '',
      sessionKey,
      role: 'user',
      content: message,
      state: 'final',
      timestamp: Date.now(),
    });

    // Send via RPC
    rpcCall(send, 'chat.send', {
      sessionKey,
      message,
      idempotencyKey: crypto.randomUUID(),
    }).catch((err: Error) => {
      setError(`Send failed: ${err.message}`);
    });
  }, [send, sessionKey, agent.id]);

  return (
    <div className="chat-panel">
      {loading && <div className="chat-loading">Loading history...</div>}
      {error && <div className="chat-error">{error}</div>}
      <ChatHistory messages={messages} streamingText={streamingText} />
      <ChatInput onSend={handleSend} />
    </div>
  );
}
