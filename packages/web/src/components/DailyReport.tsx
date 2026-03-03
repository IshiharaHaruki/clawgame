import { useEffect, useState } from 'react';
import { useWsSend } from '../hooks/WebSocketContext';
import { rpcCall } from '../hooks/useWebSocket';
import { useGameStore } from '../store';
import '../styles/report.css';

interface UsageTotals {
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
}

interface UsageSession {
  sessionKey: string;
  displayName?: string;
  totalTokens?: number;
  totalCost?: number;
}

interface MessagesInfo {
  total: number;
  user: number;
  assistant: number;
  toolCalls: number;
  errors: number;
}

interface ToolsInfo {
  totalCalls: number;
  uniqueTools: number;
}

interface DailyReportProps {
  onClose: () => void;
}

export function DailyReport({ onClose }: DailyReportProps) {
  const send = useWsSend();
  const agentList = useGameStore((s) => s.agentList);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<UsageTotals>({ totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0 });
  const [messages, setMessages] = useState<MessagesInfo>({ total: 0, user: 0, assistant: 0, toolCalls: 0, errors: 0 });
  const [tools, setTools] = useState<ToolsInfo>({ totalCalls: 0, uniqueTools: 0 });
  const [sessions, setSessions] = useState<UsageSession[]>([]);

  useEffect(() => {
    // Fetch today's usage
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    rpcCall(send, 'sessions.usage', { since: since.getTime() })
      .then((result) => {
        const r = result as {
          totals?: UsageTotals;
          messages?: MessagesInfo;
          tools?: ToolsInfo;
          sessions?: UsageSession[];
        };
        if (r?.totals) setTotals(r.totals);
        if (r?.messages) setMessages(r.messages);
        if (r?.tools) setTools(r.tools);
        if (r?.sessions) setSessions(r.sessions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [send]);

  // Aggregate stats from agent data as supplement
  const agentStats = agentList
    .filter((a) => a.stats)
    .map((a) => ({
      id: a.id,
      name: a.displayName,
      errors: a.stats!.errorCount,
      toolCalls: a.stats!.toolCallCount,
      messages: a.stats!.chatMessageCount,
      tokens: a.stats!.totalInputTokens + a.stats!.totalOutputTokens,
      cost: a.stats!.totalCost,
    }));

  const totalErrors = agentStats.reduce((s, a) => s + a.errors, 0);
  const totalToolCalls = tools.totalCalls || agentStats.reduce((s, a) => s + a.toolCalls, 0);
  const totalMessages = messages.total || agentStats.reduce((s, a) => s + a.messages, 0);

  return (
    <div className="daily-report">
      <div className="daily-report__header">
        <button className="panel__close" onClick={onClose}>X</button>
        <h2 className="daily-report__title">Daily Report</h2>
        <span className="daily-report__date">{new Date().toLocaleDateString()}</span>
      </div>
      <div className="daily-report__body">
        {loading ? (
          <div className="daily-report__empty">Loading report...</div>
        ) : (
          <>
            <div className="report-overview">
              <div className="report-card">
                <div className="report-card__value">${totals.totalCost.toFixed(3)}</div>
                <div className="report-card__label">Total Cost</div>
              </div>
              <div className="report-card">
                <div className="report-card__value">{totalMessages}</div>
                <div className="report-card__label">Messages</div>
              </div>
              <div className="report-card">
                <div className="report-card__value">{totalToolCalls}</div>
                <div className="report-card__label">Tool Calls</div>
              </div>
              <div className="report-card">
                <div className="report-card__value">{totalErrors}</div>
                <div className="report-card__label">Errors</div>
              </div>
            </div>

            {agentStats.length > 0 && (
              <div className="report-section">
                <h3 className="report-section__title">By Agent</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Msgs</th>
                      <th>Tools</th>
                      <th>Errors</th>
                      <th>Tokens</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.map((a) => (
                      <tr key={a.id}>
                        <td className="report-table__agent">{a.name}</td>
                        <td>{a.messages}</td>
                        <td>{a.toolCalls}</td>
                        <td className={a.errors > 0 ? 'report-table__error' : ''}>{a.errors}</td>
                        <td>{a.tokens > 1000 ? `${(a.tokens / 1000).toFixed(1)}K` : a.tokens}</td>
                        <td>${a.cost.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="report-section">
                <h3 className="report-section__title">Sessions</h3>
                {sessions.map((s, i) => (
                  <div key={i} className="report-session">
                    <span className="report-session__name">{s.displayName ?? s.sessionKey}</span>
                    <span className="report-session__tokens">{(s.totalTokens ?? 0) > 1000 ? `${((s.totalTokens ?? 0) / 1000).toFixed(1)}K` : s.totalTokens ?? 0} tokens</span>
                    <span className="report-session__cost">${(s.totalCost ?? 0).toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
