'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PostCard } from '@/components/post/PostCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SettingsIcon } from '@/components/icons';
import { Post } from '@/stores/feedStore';
import clsx from 'clsx';

type ProfileTab = 'posts' | 'replies' | 'likes' | 'bookmarks';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulated fetch - would call API in production
    setIsLoading(true);
    const timer = setTimeout(() => {
      setPosts([]);
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [activeTab]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'posts', label: 'Posts' },
    { key: 'replies', label: 'Replies' },
    { key: 'likes', label: 'Likes' },
    { key: 'bookmarks', label: 'Bookmarks' },
  ];

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-4">
        <div>
          <h1 className="font-display font-bold text-xl">{user.displayName}</h1>
          <p className="text-sm text-neutral-500">{user.postsCount} posts</p>
        </div>
      </header>

      {/* Cover area */}
      <div className="h-32 bg-gradient-to-r from-primary-500 to-secondary-500" />

      {/* Profile info */}
      <div className="px-4 pb-4">
        <div className="flex justify-between items-start -mt-16 mb-4">
          <Avatar
            src={user.avatar}
            alt={user.displayName}
            size="2xl"
            className="border-4 border-white dark:border-neutral-950"
          />
          <div className="mt-20 flex gap-2">
            <Link href="/settings" className="btn-secondary btn-sm">
              <SettingsIcon className="w-4 h-4" />
            </Link>
            <Link href="/settings/profile" className="btn-secondary btn-sm">
              Edit profile
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-1">
              {user.displayName}
              {user.isVerified && (
                <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </h2>
            <p className="text-neutral-500">@{user.username}</p>
          </div>

          {user.bio && (
            <p className="text-neutral-900 dark:text-neutral-100">{user.bio}</p>
          )}

          <div className="flex gap-4 text-sm">
            <Link href={`/${user.username}/following`} className="hover:underline">
              <span className="font-bold">{user.followingCount.toLocaleString()}</span>
              <span className="text-neutral-500"> Following</span>
            </Link>
            <Link href={`/${user.username}/followers`} className="hover:underline">
              <span className="font-bold">{user.followersCount.toLocaleString()}</span>
              <span className="text-neutral-500"> Followers</span>
            </Link>
          </div>

          <p className="text-sm text-neutral-500">
            Joined {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'flex-1 py-4 text-sm font-medium relative transition-colors',
              activeTab === tab.key
                ? 'text-neutral-900 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-neutral-500 text-lg mb-2">No {activeTab} yet</p>
            <p className="text-neutral-400">
              {activeTab === 'posts' && "You haven't posted anything yet."}
              {activeTab === 'replies' && "You haven't replied to any posts."}
              {activeTab === 'likes' && "You haven't liked any posts."}
              {activeTab === 'bookmarks' && "You haven't bookmarked any posts."}
            </p>
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </div>
  );
}
