import { useEffect, useCallback } from 'react';
import { useGameStore } from '../store';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';
import { ChatHistory } from './ChatHistory';
import { ChatInput } from './ChatInput';
import type { AgentInfo } from '../types';

interface ChatPanelProps {
  agent: AgentInfo;
}

export function ChatPanel({ agent }: ChatPanelProps) {
  const send = useWsSend();
  const sessionKey = agent.sessionKey ?? `agent:${agent.id}`;
  const messages = useGameStore((s) => s.chatMessages.get(sessionKey) ?? []);
  const streamingText = useGameStore((s) => s.chatStreaming.get(sessionKey));

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
      .catch(() => {
        // Ignore history load failures
      });

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
    }).catch(() => {
      // Could show error in UI
    });
  }, [send, sessionKey, agent.id]);

  return (
    <div className="chat-panel">
      <ChatHistory messages={messages} streamingText={streamingText} />
      <ChatInput onSend={handleSend} />
    </div>
  );
}
