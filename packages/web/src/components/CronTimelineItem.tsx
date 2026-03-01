import { useState, useEffect } from 'react';
import { useGameStore } from '../store';
import type { CronJob } from '../types';

interface CronTimelineItemProps {
  job: CronJob;
  agentName: string;
  agentId: string;
}

export function CronTimelineItem({ job, agentName, agentId }: CronTimelineItemProps) {
  const selectAgent = useGameStore((s) => s.selectAgent);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const update = () => {
      if (job.state.nextRunAtMs) {
        const diff = job.state.nextRunAtMs - Date.now();
        if (diff <= 0) {
          setCountdown('now');
        } else {
          const mins = Math.floor(diff / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setCountdown(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
        }
      } else {
        setCountdown('--');
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [job.state.nextRunAtMs]);

  const isRunning = !!job.state.runningAtMs;
  const lastStatus = job.state.lastRunStatus ?? 'idle';

  return (
    <button
      className={`cron-item ${isRunning ? 'cron-item--running' : ''}`}
      onClick={() => selectAgent(agentId)}
    >
      <div className="cron-item__name">{job.name || job.id}</div>
      <div className="cron-item__agent">{agentName}</div>
      <div className="cron-item__meta">
        <span className={`cron-item__status cron-item__status--${lastStatus}`}>
          {lastStatus === 'ok' ? '\u2713' : lastStatus === 'error' ? '\u2717' : '\u25CB'}
        </span>
        <span className="cron-item__countdown">{countdown}</span>
      </div>
    </button>
  );
}
