import type { AgentInfo, CronJob, AgentStatus } from '../types';

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

interface Props {
  agent: AgentInfo;
  onClose: () => void;
}

export function AgentPanel({ agent, onClose }: Props) {
  return (
    <div style={panelStyle}>
      <button onClick={onClose} style={closeButtonStyle}>
        X
      </button>

      <h2 style={{ fontSize: '10px', marginBottom: 12, color: '#ecf0f1' }}>
        {agent.displayName}
      </h2>

      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: STATUS_COLORS[agent.status],
          }}
        />
        <span style={{ fontSize: '8px', color: '#bdc3c7' }}>{agent.status}</span>
      </div>

      <div style={fieldStyle}>
        <span style={labelStyle}>ID</span>
        <span style={valueStyle}>{agent.id}</span>
      </div>

      {agent.model && (
        <div style={fieldStyle}>
          <span style={labelStyle}>Model</span>
          <span style={valueStyle}>{agent.model}</span>
        </div>
      )}

      {agent.cronJobs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: '8px', color: '#ecf0f1', marginBottom: 8 }}>
            Cron Jobs
          </h3>
          {agent.cronJobs.map((job) => (
            <CronJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function CronJobCard({ job }: { job: CronJob }) {
  const statusColor = job.state.lastRunStatus === 'ok' ? '#2ecc71' : job.state.lastRunStatus === 'error' ? '#e74c3c' : '#95a5a6';

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '8px', color: '#ecf0f1', marginBottom: 4 }}>
        {job.name}
        {!job.enabled && (
          <span style={{ color: '#95a5a6', marginLeft: 6 }}>(disabled)</span>
        )}
      </div>
      <div style={{ fontSize: '7px', color: '#bdc3c7', marginBottom: 4 }}>
        {formatSchedule(job)}
      </div>
      <div style={{ fontSize: '7px', color: '#bdc3c7' }}>
        Next: {formatTime(job.state.nextRunAtMs)}
      </div>
      {job.state.lastRunStatus && (
        <div style={{ fontSize: '7px', color: statusColor, marginTop: 2 }}>
          Last: {job.state.lastRunStatus} at {formatTime(job.state.lastRunAtMs)}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 320,
  height: '100%',
  background: 'rgba(26, 26, 46, 0.95)',
  padding: 20,
  fontFamily: '"Press Start 2P", monospace',
  overflowY: 'auto',
  zIndex: 50,
  borderLeft: '2px solid #34495e',
};

const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  background: 'none',
  border: 'none',
  color: '#ecf0f1',
  fontFamily: '"Press Start 2P", monospace',
  fontSize: '10px',
  cursor: 'pointer',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 6,
  fontSize: '7px',
};

const labelStyle: React.CSSProperties = {
  color: '#95a5a6',
  marginRight: 8,
};

const valueStyle: React.CSSProperties = {
  color: '#ecf0f1',
  wordBreak: 'break-all',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(52, 73, 94, 0.5)',
  borderRadius: 4,
  padding: 8,
  marginBottom: 6,
};
