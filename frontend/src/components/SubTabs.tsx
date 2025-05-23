import React from 'react';

interface SubTabsProps<T extends string> {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  align?: 'left' | 'center' | 'right';
}

export function SubTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  align = 'center',
}: SubTabsProps<T>) {
  let justify = 'justify-center';
  if (align === 'right') justify = 'justify-end';
  if (align === 'left') justify = 'justify-start';

  return (
    <div className={`mb-4 border-b border-gray-500 flex ${justify}`}>
      <nav className="-mb-px flex space-x-6" aria-label="Sub-Tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`${
              activeTab === tab
                ? 'border-[#c6441a] text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}