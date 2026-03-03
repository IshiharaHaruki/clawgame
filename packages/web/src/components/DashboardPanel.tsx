import { CostPanel } from './CostPanel';
import { ActivityTimeline } from './ActivityTimeline';

export function DashboardPanel() {
  return (
    <div className="dashboard">
      <div className="dashboard__section">
        <CostPanel />
      </div>

      <div className="dashboard__section">
        <h3 className="dashboard__section-title">Recent Activity</h3>
        <ActivityTimeline />
      </div>
    </div>
  );
}
