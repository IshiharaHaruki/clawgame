import { useGameStore } from '../store';
import { selectAgentList } from '../store/selectors';
import { CronTimelineItem } from './CronTimelineItem';

export function CronTimeline() {
  const agents = useGameStore(selectAgentList);

  // Collect all cron jobs across all agents
  const cronJobs = agents.flatMap((agent) =>
    agent.cronJobs.map((job) => ({
      ...job,
      agentId: agent.id,
      agentName: agent.displayName,
    }))
  );

  if (cronJobs.length === 0) return null;

  return (
    <div className="cron-timeline">
      <div className="cron-timeline__header">
        <span className="cron-timeline__title">Cron Jobs</span>
        <span className="cron-timeline__count">{cronJobs.length}</span>
      </div>
      <div className="cron-timeline__scroll">
        {cronJobs.map((job) => (
          <CronTimelineItem
            key={job.id}
            job={job}
            agentName={job.agentName}
            agentId={job.agentId}
          />
        ))}
      </div>
    </div>
  );
}
