import { useState } from 'react';
import { useGameStore } from '../store';
import type { AgentInfo, CronJob, AgentStatus } from '../types';
import { PanelTabs, type Tab } from './PanelTabs';
import { ChatPanel } from './ChatPanel';
import { DashboardPanel } from './DashboardPanel';

const TABS: Tab[] = [
  { id: 'info', label: 'Info' },
  { id: 'chat', label: 'Chat' },
  { id: 'activity', label: 'Activity' },
];

const STATUS_COLORS: Record<AgentStatus, string> = {
  working: '#2ecc71',
  cron_running: '#3498db',
  idle: '#f39c12',
  error: '#e74c3c',
  offline: '#95a5a6',
};

function formatSchedule(job: CronJob): string {
  const s = job.schedule;
  switch (s.kind) {
    case 'at':
      return `at ${s.at}`;
    case 'every': {
      const sec = Math.round(s.everyMs / 1000);
      if (sec >= 60) return `every ${Math.round(sec / 60)}m`;
      return `every ${sec}s`;
    }
    case 'cron':
      return s.expr;
  }
}

function formatTime(ms: number | undefined): string {
  if (!ms) return '--';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

interface AgentPanelProps {
  agent: AgentInfo;
  onClose: () => void;
}

export function AgentPanel({ agent, onClose }: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState('info');
  const openConversation = useGameStore((s) => s.openConversation);

  return (
    <div className="panel">
      <button className="panel__close" onClick={onClose}>
        X
      </button>

      <h2 className="panel__title">{agent.displayName}</h2>
      <button className="panel__btn" onClick={() => openConversation(agent.id)}>
        View Conversation
      </button>
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'info' && <AgentInfoTab agent={agent} />}
      {activeTab === 'chat' && <ChatPanel agent={agent} />}
      {activeTab === 'activity' && <DashboardPanel />}
    </div>
  );
}

function AgentInfoTab({ agent }: { agent: AgentInfo }) {
  return (
    <div>
      <div className="status-row">
        <span
          className="status-dot"
          style={{ background: STATUS_COLORS[agent.status] }}
        />
        <span className="status-text">{agent.status}</span>
      </div>

      <div className="panel__field">
        <span className="panel__label">ID</span>
        <span className="panel__value">{agent.id}</span>
      </div>

      {agent.model && (
        <div className="panel__field">
          <span className="panel__label">Model</span>
          <span className="panel__value">{agent.model}</span>
        </div>
      )}

      {agent.cronJobs.length > 0 && (
        <div>
          <h3 className="panel__section-title">Cron Jobs</h3>
          {agent.cronJobs.map((job) => (
            <CronJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function CronJobCard({ job }: { job: CronJob }) {
  const statusColor =
    job.state.lastRunStatus === 'ok'
      ? '#2ecc71'
      : job.state.lastRunStatus === 'error'
        ? '#e74c3c'
        : '#95a5a6';

  return (
    <div className="panel__card">
      <div className="card__title">
        {job.name}
        {!job.enabled && (
          <span className="card__disabled">(disabled)</span>
        )}
      </div>
      <div className="card__subtitle">{formatSchedule(job)}</div>
      <div className="card__detail">Next: {formatTime(job.state.nextRunAtMs)}</div>
      {job.state.lastRunStatus && (
        <div className="card__status" style={{ color: statusColor }}>
          Last: {job.state.lastRunStatus} at {formatTime(job.state.lastRunAtMs)}
        </div>
      )}
    </div>
  );
}
