import type { ReactNode } from 'react';

interface GameLayoutProps {
  children: ReactNode;
  panelOpen: boolean;
}

export function GameLayout({ children, panelOpen }: GameLayoutProps) {
  return (
    <div className={`game-layout ${panelOpen ? 'game-layout--panel-open' : ''}`}>
      {children}
    </div>
  );
}
