import { useMemo } from 'react';
import { useGameStore } from '../store';
import type { ActivityEntry } from '../types';

const KIND_ICONS: Record<string, string> = {
  tool: '\u{1F527}',
  chat: '\u{1F4AC}',
  cron: '\u23F0',
  error: '\u26A0\uFE0F',
  status_change: '\u2192',
};

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function entryDescription(entry: ActivityEntry): string {
  switch (entry.kind) {
    case 'tool': return `Used ${entry.toolName}`;
    case 'chat': return entry.snippet;
    case 'cron': return `Cron ${entry.jobName} ${entry.event}`;
    case 'error': return entry.message;
    case 'status_change': return `${entry.from} \u2192 ${entry.to}`;
  }
}

export function ActivityTimeline() {
  const activityLog = useGameStore((s) => s.activityLog);

  // Show most recent first
  const entries = useMemo(() => [...activityLog].reverse().slice(0, 50), [activityLog]);

  if (entries.length === 0) {
    return <div className="activity-empty">No activity yet.</div>;
  }

  return (
    <div className="activity-timeline">
      {entries.map((entry) => (
        <div key={`${entry.kind}-${entry.timestamp}-${entry.agentId}`} className={`activity-item activity-item--${entry.kind}`}>
          <span className="activity-item__icon">{KIND_ICONS[entry.kind] ?? '\u2022'}</span>
          <span className="activity-item__agent">{entry.agentId}</span>
          <span className="activity-item__desc">{entryDescription(entry)}</span>
          <span className="activity-item__time">{formatRelativeTime(entry.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}
