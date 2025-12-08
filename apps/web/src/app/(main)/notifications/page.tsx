'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  HeartFilledIcon,
  CommentIcon,
  UserIcon,
  RepeatIcon,
  BellIcon,
} from '@/components/icons';
import clsx from 'clsx';

type NotificationType = 'like' | 'comment' | 'follow' | 'repost' | 'mention' | 'system';
type NotificationFilter = 'all' | 'mentions' | 'verified';

interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor?: {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    isVerified: boolean;
  };
  post?: {
    id: string;
    content: string;
  };
  message?: string;
}

const notificationIcons: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  like: HeartFilledIcon,
  comment: CommentIcon,
  follow: UserIcon,
  repost: RepeatIcon,
  mention: CommentIcon,
  system: BellIcon,
};

const notificationColors: Record<NotificationType, string> = {
  like: 'text-error-500 bg-error-100 dark:bg-error-900/30',
  comment: 'text-primary-500 bg-primary-100 dark:bg-primary-900/30',
  follow: 'text-secondary-500 bg-secondary-100 dark:bg-secondary-900/30',
  repost: 'text-success-500 bg-success-100 dark:bg-success-900/30',
  mention: 'text-primary-500 bg-primary-100 dark:bg-primary-900/30',
  system: 'text-neutral-500 bg-neutral-100 dark:bg-neutral-800',
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Mock notifications
    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'like',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        actor: { id: '1', username: 'sarahc', displayName: 'Sarah Chen', isVerified: true },
        post: { id: '1', content: 'Just launched my new project! Check it out...' },
      },
      {
        id: '2',
        type: 'follow',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        actor: { id: '2', username: 'alexr', displayName: 'Alex Rivera', isVerified: false },
      },
      {
        id: '3',
        type: 'comment',
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        actor: { id: '3', username: 'jlee', displayName: 'Jordan Lee', isVerified: true },
        post: { id: '2', content: 'What are your thoughts on the new tech trends?' },
      },
      {
        id: '4',
        type: 'repost',
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        actor: { id: '4', username: 'mikechen', displayName: 'Mike Chen', isVerified: true },
        post: { id: '3', content: 'The future of social media is text-first...' },
      },
      {
        id: '5',
        type: 'mention',
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        actor: { id: '5', username: 'emma', displayName: 'Emma Wilson', isVerified: false },
        post: { id: '4', content: 'Great insights from @you on this topic!' },
      },
    ];

    setTimeout(() => {
      setNotifications(mockNotifications);
      setIsLoading(false);
    }, 500);
  }, []);

  const filters: { key: NotificationFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
    { key: 'verified', label: 'Verified' },
  ];

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'mentions') return n.type === 'mention';
    if (filter === 'verified') return n.actor?.isVerified;
    return true;
  });

  const getNotificationText = (notification: Notification): string => {
    switch (notification.type) {
      case 'like':
        return 'liked your post';
      case 'comment':
        return 'commented on your post';
      case 'follow':
        return 'followed you';
      case 'repost':
        return 'reposted your post';
      case 'mention':
        return 'mentioned you';
      case 'system':
        return notification.message || 'System notification';
      default:
        return '';
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="font-display font-bold text-xl">Notifications</h1>
          <button className="text-sm text-primary-500 hover:underline">
            Mark all as read
          </button>
        </div>

        {/* Filters */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'flex-1 py-3 text-sm font-medium relative transition-colors',
                filter === f.key
                  ? 'text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              )}
            >
              {f.label}
              {filter === f.key && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Notifications */}
      <div>
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BellIcon className="w-8 h-8 text-neutral-400" />
            </div>
            <p className="text-neutral-500 text-lg mb-2">No notifications yet</p>
            <p className="text-neutral-400">
              When someone interacts with you, you&apos;ll see it here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {filteredNotifications.map((notification) => {
              const Icon = notificationIcons[notification.type];
              const colorClass = notificationColors[notification.type];

              return (
                <Link
                  key={notification.id}
                  href={notification.post ? `/post/${notification.post.id}` : notification.actor ? `/${notification.actor.username}` : '#'}
                  className={clsx(
                    'block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors',
                    !notification.read && 'bg-primary-50/50 dark:bg-primary-900/10'
                  )}
                >
                  <div className="flex gap-3">
                    <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', colorClass)}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {notification.actor && (
                          <Avatar
                            src={notification.actor.avatar}
                            alt={notification.actor.displayName}
                            size="sm"
                          />
                        )}
                      </div>

                      <p className="mt-1">
                        {notification.actor && (
                          <>
                            <span className="font-semibold">{notification.actor.displayName}</span>
                            {notification.actor.isVerified && (
                              <svg className="inline w-4 h-4 text-primary-500 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                            {' '}
                          </>
                        )}
                        <span className="text-neutral-600 dark:text-neutral-400">
                          {getNotificationText(notification)}
                        </span>
                      </p>

                      {notification.post && (
                        <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                          {notification.post.content}
                        </p>
                      )}

                      <p className="mt-1 text-sm text-neutral-400">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {!notification.read && (
                      <div className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-2" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
