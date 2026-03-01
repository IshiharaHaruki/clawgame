import { useEffect, useState } from 'react';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';
import { TokenChart } from './TokenChart';
import { ActivityTimeline } from './ActivityTimeline';

interface TokenData {
  agentId: string;
  agentName: string;
  inputTokens: number;
  outputTokens: number;
}

export function DashboardPanel() {
  const send = useWsSend();
  const [tokenData, setTokenData] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch usage data
    rpcCall(send, 'usage.cost', { days: 7 })
      .then((result) => {
        const r = result as { totals?: { totalTokens?: number; inputCost?: number; outputCost?: number }; daily?: unknown[] };
        // Usage data is aggregated, not per-agent. Show totals.
        if (r?.totals) {
          setTokenData([{
            agentId: 'all',
            agentName: 'Total',
            inputTokens: (r.totals as Record<string, number>).input ?? 0,
            outputTokens: (r.totals as Record<string, number>).output ?? 0,
          }]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [send]);

  return (
    <div className="dashboard">
      <div className="dashboard__section">
        <h3 className="dashboard__section-title">Token Usage (7 days)</h3>
        {loading ? (
          <div className="activity-empty">Loading...</div>
        ) : (
          <TokenChart data={tokenData} />
        )}
      </div>

      <div className="dashboard__section">
        <h3 className="dashboard__section-title">Recent Activity</h3>
        <ActivityTimeline />
      </div>
    </div>
  );
}
