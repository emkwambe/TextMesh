'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchIcon, TrendingIcon, HashIcon, UserIcon } from '@/components/icons';
import { PostCard } from '@/components/post/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Post } from '@/stores/feedStore';
import clsx from 'clsx';
import Link from 'next/link';

type ExploreTab = 'trending' | 'people' | 'topics';

interface TrendingTopic {
  name: string;
  category: string;
  postsCount: number;
}

interface SuggestedUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  followersCount: number;
  isVerified: boolean;
}

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<ExploreTab>('trending');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);

  useEffect(() => {
    // Mock data
    setTrendingTopics([
      { name: '#TextMesh', category: 'Technology', postsCount: 125000 },
      { name: '#TechNews', category: 'Technology', postsCount: 89000 },
      { name: '#ThoughtLeaders', category: 'Business', postsCount: 67000 },
      { name: '#DailyThoughts', category: 'Lifestyle', postsCount: 54000 },
      { name: '#Innovation', category: 'Technology', postsCount: 48000 },
      { name: '#Community', category: 'Social', postsCount: 42000 },
      { name: '#Ideas', category: 'General', postsCount: 38000 },
      { name: '#Creativity', category: 'Art', postsCount: 35000 },
    ]);

    setSuggestedUsers([
      { id: '1', username: 'sarahc', displayName: 'Sarah Chen', bio: 'Tech enthusiast & startup founder', followersCount: 125000, isVerified: true },
      { id: '2', username: 'alexr', displayName: 'Alex Rivera', bio: 'Software engineer sharing daily insights', followersCount: 89000, isVerified: false },
      { id: '3', username: 'jlee', displayName: 'Jordan Lee', bio: 'Product designer at a top tech company', followersCount: 67000, isVerified: true },
      { id: '4', username: 'mikechen', displayName: 'Mike Chen', bio: 'Investor & advisor', followersCount: 54000, isVerified: true },
    ]);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    // Simulated search
    await new Promise((r) => setTimeout(r, 500));
    setSearchResults([]);
    setIsLoading(false);
  };

  const formatCount = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const tabs: { key: ExploreTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'trending', label: 'Trending', icon: TrendingIcon },
    { key: 'people', label: 'People', icon: UserIcon },
    { key: 'topics', label: 'Topics', icon: HashIcon },
  ];

  return (
    <div>
      {/* Header with search */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800 p-4">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts, people, and topics"
              className="w-full pl-12 pr-4 py-3 rounded-full bg-neutral-100 dark:bg-neutral-800 border-0 focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </form>

        {/* Tabs */}
        <div className="flex mt-4 -mx-4 px-4 border-b border-neutral-200 dark:border-neutral-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium relative transition-colors',
                  activeTab === tab.key
                    ? 'text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <div>
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : query && searchResults.length > 0 ? (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {searchResults.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : activeTab === 'trending' ? (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {trendingTopics.map((topic, index) => (
              <Link
                key={topic.name}
                href={`/explore?q=${encodeURIComponent(topic.name)}`}
                className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <span className="text-neutral-400 text-sm w-4">{index + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm text-neutral-500">{topic.category}</p>
                    <p className="font-bold">{topic.name}</p>
                    <p className="text-sm text-neutral-500">{formatCount(topic.postsCount)} posts</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : activeTab === 'people' ? (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {suggestedUsers.map((user) => (
              <div key={user.id} className="px-4 py-3 flex items-center gap-3">
                <Link href={`/${user.username}`}>
                  <Avatar src={user.avatar} alt={user.displayName} size="lg" />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/${user.username}`} className="block">
                    <p className="font-bold truncate flex items-center gap-1">
                      {user.displayName}
                      {user.isVerified && (
                        <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </p>
                    <p className="text-sm text-neutral-500 truncate">@{user.username}</p>
                  </Link>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-2">
                    {user.bio}
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
                    {formatCount(user.followersCount)} followers
                  </p>
                </div>
                <Button variant="primary" size="sm">
                  Follow
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4">
            {trendingTopics.map((topic) => (
              <Link
                key={topic.name}
                href={`/explore?q=${encodeURIComponent(topic.name)}`}
                className="card-hover p-4"
              >
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mb-3">
                  <HashIcon className="w-5 h-5 text-primary-500" />
                </div>
                <p className="font-bold">{topic.name}</p>
                <p className="text-sm text-neutral-500">{formatCount(topic.postsCount)} posts</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
