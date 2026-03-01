export interface Tab {
  id: string;
  label: string;
}

interface PanelTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function PanelTabs({ tabs, activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="panel-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`panel-tabs__tab ${activeTab === tab.id ? 'panel-tabs__tab--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
