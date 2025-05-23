import React, { useState } from 'react';
import { SubTabs } from './SubTabs';
import EbpfRuleManager from './EbpfRuleManager';
import ELineServiceManager from './ELineServiceManager'; 

const SUB_TABS = ['E-Line Service Manager', 'eBPF Rule Manager'] as const;
type SubTab = typeof SUB_TABS[number];

interface EthernetDeploySuiteProps {
  nodes: any[]; // Consider using a more specific Node type if available globally
  apiBaseUrl: string;
}

export default function EthernetDeploySuite({ nodes, apiBaseUrl }: EthernetDeploySuiteProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(SUB_TABS[0]);

  return (
    <div>
      <SubTabs
        tabs={SUB_TABS}
        activeTab={activeSubTab}
        onTabChange={setActiveSubTab}
        align="left"
      />
      <div className="mt-10">
      {activeSubTab === 'E-Line Service Manager' && (
        <ELineServiceManager nodes={nodes} apiBaseUrl={apiBaseUrl} />
      )}
      {activeSubTab === 'eBPF Rule Manager' && (
        <EbpfRuleManager nodes={nodes} apiBaseUrl={apiBaseUrl} />
      )}
      </div>
    </div>
  );
}