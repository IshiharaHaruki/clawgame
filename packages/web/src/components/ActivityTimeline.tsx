import { useMemo, useState } from 'react';
import { useGameStore } from '../store';
import type { ActivityEntry } from '../types';

const KIND_ICONS: Record<string, string> = {
  tool: '\u{1F527}',
  chat: '\u{1F4AC}',
  cron: '\u23F0',
  error: '\u26A0\uFE0F',
  status_change: '\u2192',
};

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'tool', label: 'Tool' },
  { value: 'chat', label: 'Chat' },
  { value: 'cron', label: 'Cron' },
  { value: 'error', label: 'Error' },
  { value: 'status_change', label: 'Status' },
];

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

function entryMatchesSearch(entry: ActivityEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (entry.agentId.toLowerCase().includes(q)) return true;
  const desc = entryDescription(entry).toLowerCase();
  return desc.includes(q);
}

export function ActivityTimeline() {
  const activityLog = useGameStore((s) => s.activityLog);
  const agentList = useGameStore((s) => s.agentList);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  const agentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of activityLog) ids.add(entry.agentId);
    for (const a of agentList) ids.add(a.id);
    return Array.from(ids).sort();
  }, [activityLog, agentList]);

  const entries = useMemo(() => {
    let filtered = [...activityLog].reverse();
    if (kindFilter) filtered = filtered.filter((e) => e.kind === kindFilter);
    if (agentFilter) filtered = filtered.filter((e) => e.agentId === agentFilter);
    if (search) filtered = filtered.filter((e) => entryMatchesSearch(e, search));
    return filtered.slice(0, 50);
  }, [activityLog, kindFilter, agentFilter, search]);

  return (
    <div>
      <div className="activity-filters">
        <input
          className="activity-search"
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="activity-filter"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="activity-filter"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
        >
          <option value="">All agents</option>
          {agentIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>
      {entries.length === 0 ? (
        <div className="activity-empty">No matching activity.</div>
      ) : (
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
      )}
    </div>
  );
}
