import { createContext, useContext } from 'react';
import type { ClientMessage } from '../types';

type SendFn = (msg: ClientMessage) => void;

export const WebSocketContext = createContext<SendFn>(() => {});

export function useWsSend(): SendFn {
  return useContext(WebSocketContext);
}
