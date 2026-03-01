import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';

interface ChatHistoryProps {
  messages: ChatMessage[];
  streamingText?: string;
}

export function ChatHistory({ messages, streamingText }: ChatHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  return (
    <div className="chat-history" ref={scrollRef}>
      {messages.map((msg, i) => (
        <div key={`${msg.runId}-${i}`} className={`chat-msg chat-msg--${msg.role}`}>
          <div className="chat-msg__role">{msg.role === 'user' ? 'You' : 'Agent'}</div>
          <div className="chat-msg__text">{msg.content}</div>
        </div>
      ))}
      {streamingText && (
        <div className="chat-msg chat-msg--assistant chat-msg--streaming">
          <div className="chat-msg__role">Agent</div>
          <div className="chat-msg__text">{streamingText}<span className="chat-cursor">&#x2588;</span></div>
        </div>
      )}
      {messages.length === 0 && !streamingText && (
        <div className="chat-empty">Send a message to start chatting with this agent.</div>
      )}
    </div>
  );
}
