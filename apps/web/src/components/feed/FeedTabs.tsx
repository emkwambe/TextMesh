'use client';

import clsx from 'clsx';

interface FeedTabsProps {
  activeTab: 'for-you' | 'following';
  onTabChange: (tab: 'for-you' | 'following') => void;
}

export function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  return (
    <div className="flex border-b border-neutral-200 dark:border-neutral-800">
      <button
        onClick={() => onTabChange('for-you')}
        className={clsx(
          'flex-1 py-4 text-sm font-medium relative transition-colors',
          activeTab === 'for-you'
            ? 'text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        )}
      >
        For you
        {activeTab === 'for-you' && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary-500 rounded-full" />
        )}
      </button>
      <button
        onClick={() => onTabChange('following')}
        className={clsx(
          'flex-1 py-4 text-sm font-medium relative transition-colors',
          activeTab === 'following'
            ? 'text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        )}
      >
        Following
        {activeTab === 'following' && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary-500 rounded-full" />
        )}
      </button>
    </div>
  );
}
