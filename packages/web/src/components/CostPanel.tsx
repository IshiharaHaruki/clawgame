import { useEffect, useState } from 'react';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';

interface UsageTotals {
  input: number;
  output: number;
  totalTokens: number;
  totalCost: number;
}

interface SessionUsage {
  sessionKey: string;
  displayName?: string;
  totalTokens: number;
  totalCost: number;
}

type TimeRange = '1d' | '7d' | '30d';

const RANGE_DAYS: Record<TimeRange, number> = { '1d': 1, '7d': 7, '30d': 30 };

export function CostPanel() {
  const send = useWsSend();
  const [range, setRange] = useState<TimeRange>('7d');
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [sessions, setSessions] = useState<SessionUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    rpcCall(send, 'sessions.usage', { days: RANGE_DAYS[range] })
      .then((result) => {
        const r = result as {
          totals?: UsageTotals;
          sessions?: Array<{ sessionKey?: string; displayName?: string; totalTokens?: number; totalCost?: number }>;
        };
        if (r?.totals) setTotals(r.totals);
        if (r?.sessions) {
          setSessions(
            r.sessions
              .map((s) => ({
                sessionKey: s.sessionKey ?? '',
                displayName: s.displayName ?? s.sessionKey ?? 'Unknown',
                totalTokens: s.totalTokens ?? 0,
                totalCost: s.totalCost ?? 0,
              }))
              .filter((s) => s.totalTokens > 0)
              .sort((a, b) => b.totalCost - a.totalCost)
              .slice(0, 10),
          );
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [send, range]);

  const formatCost = (c: number) => (c > 0 ? `$${c.toFixed(4)}` : '$0.00');
  const formatTokens = (t: number) => (t > 1000 ? `${(t / 1000).toFixed(1)}K` : `${t}`);

  return (
    <div className="cost-panel">
      <div className="cost-panel__header">
        <h3 className="dashboard__section-title">Cost Tracking</h3>
        <div className="cost-panel__range">
          {(['1d', '7d', '30d'] as TimeRange[]).map((r) => (
            <button
              key={r}
              className={`cost-range-btn ${range === r ? 'cost-range-btn--active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="activity-empty">Loading...</div>
      ) : error ? (
        <div className="dashboard__error">Failed to load: {error}</div>
      ) : (
        <>
          {totals && (
            <div className="cost-panel__totals">
              <div className="cost-stat">
                <div className="cost-stat__value">{formatCost(totals.totalCost)}</div>
                <div className="cost-stat__label">Total Cost</div>
              </div>
              <div className="cost-stat">
                <div className="cost-stat__value">{formatTokens(totals.totalTokens)}</div>
                <div className="cost-stat__label">Tokens</div>
              </div>
              <div className="cost-stat">
                <div className="cost-stat__value">{formatTokens(totals.input)}</div>
                <div className="cost-stat__label">Input</div>
              </div>
              <div className="cost-stat">
                <div className="cost-stat__value">{formatTokens(totals.output)}</div>
                <div className="cost-stat__label">Output</div>
              </div>
            </div>
          )}

          {sessions.length > 0 && (
            <div className="cost-panel__agents">
              <div className="cost-panel__agents-title">By Session</div>
              {sessions.map((s) => {
                const pct = totals && totals.totalCost > 0 ? (s.totalCost / totals.totalCost) * 100 : 0;
                return (
                  <div key={s.sessionKey} className="cost-agent-row">
                    <div className="cost-agent-row__name">{s.displayName}</div>
                    <div className="cost-agent-row__bar-wrapper">
                      <div className="cost-agent-row__bar" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <div className="cost-agent-row__value">{formatCost(s.totalCost)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
