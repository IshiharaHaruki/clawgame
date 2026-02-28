import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, ServerMessage } from '../types';

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'snapshot') {
          setGameState(msg.data);
        } else if (msg.type === 'agent:update') {
          setGameState((prev) => {
            if (!prev) return prev;
            const agents = prev.agents.map((a) =>
              a.id === msg.data.id ? msg.data : a,
            );
            // Add agent if not found
            if (!agents.find((a) => a.id === msg.data.id)) {
              agents.push(msg.data);
            }
            return { ...prev, agents, seq: prev.seq + 1 };
          });
        } else if (msg.type === 'connection:status') {
          setGameState((prev) =>
            prev
              ? { ...prev, connectedToGateway: msg.data.connectedToGateway }
              : prev,
          );
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { gameState, connected };
}
