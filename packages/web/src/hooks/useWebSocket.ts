import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store';
import type { ServerMessage, ClientMessage } from '../types';
import { NotificationService } from '../services/NotificationService';
import { SoundService } from '../services/SoundService';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelay = useRef(2000);
  const store = useGameStore;

  const connect = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      store.getState().setConnected(true);
      reconnectDelay.current = 2000;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        const s = store.getState();
        switch (msg.type) {
          case 'snapshot': s.applySnapshot(msg.data); break;
          case 'agent:update': s.updateAgent(msg.data); break;
          case 'connection:status': s.setConnectedToGateway(msg.data.connectedToGateway); break;
          case 'agent:tool':
            s.setToolEvent(msg.data.agentId, msg.data.toolName, msg.data.state);
            if (msg.data.state === 'start') SoundService.playKeyclick();
            break;
          case 'agent:chat': {
            const { agentId, message } = msg.data;
            // Resolve to the agent's main sessionKey for consistent map keying
            const chatAgent = s.agents.get(agentId);
            const resolvedKey = chatAgent?.sessionKey ?? `agent:${agentId}`;
            if (message.state === 'delta') {
              s.updateChatStream(resolvedKey, message.content);
            } else if (message.state === 'final') {
              s.clearChatStream(resolvedKey);
              s.appendChatMessage(agentId, { ...message, sessionKey: resolvedKey });
            } else {
              // error/aborted
              s.clearChatStream(resolvedKey);
              s.appendChatMessage(agentId, { ...message, sessionKey: resolvedKey });
            }
            break;
          }
          case 'agent:status': {
            const agent = s.agents.get(msg.data.agentId);
            if (agent && msg.data.status === 'working' && !s.activeTools.has(msg.data.agentId)) {
              s.setToolVisibility(msg.data.agentId, 'inferred');
            }
            if (msg.data.status === 'error') {
              const name = agent?.displayName ?? msg.data.agentId;
              NotificationService.notify('Agent Error', `${name} encountered an error`);
              SoundService.playError();
            }
            break;
          }
          case 'activity': s.appendActivity(msg.data); break;
          case 'rpc:response': {
            const cb = pendingRpcs.get(msg.data.requestId);
            if (cb) {
              pendingRpcs.delete(msg.data.requestId);
              cb(msg.data);
            }
            break;
          }
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      store.getState().setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}

// RPC promise support
const pendingRpcs = new Map<string, (result: { ok: boolean; payload?: unknown; error?: { code: string; message: string } }) => void>();

export function rpcCall(send: (msg: ClientMessage) => void, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pendingRpcs.set(requestId, (result) => {
      if (result.ok) resolve(result.payload);
      else reject(new Error(result.error?.message ?? 'RPC error'));
    });
    send({ type: 'rpc:request', data: { requestId, method, params } });
    setTimeout(() => {
      if (pendingRpcs.has(requestId)) {
        pendingRpcs.delete(requestId);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 15000);
  });
}
