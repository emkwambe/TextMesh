'use client';

import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { useFeedStore } from '@/stores/feedStore';
import { PostCard } from '@/components/post/PostCard';
import { ComposeBox } from '@/components/post/ComposeBox';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function FeedPage() {
  const { posts, isLoading, hasMore, feedType, setFeedType, fetchPosts, fetchMorePosts } = useFeedStore();
  const { ref, inView } = useInView();

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      fetchMorePosts();
    }
  }, [inView, hasMore, isLoading, fetchMorePosts]);

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3">
          <h1 className="font-display font-bold text-xl">Home</h1>
        </div>
        <FeedTabs activeTab={feedType} onTabChange={setFeedType} />
      </header>

      {/* Compose */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <ComposeBox />
      </div>

      {/* Posts */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {posts.length === 0 && !isLoading && (
          <div className="py-16 text-center">
            <p className="text-neutral-500 text-lg mb-2">No posts yet</p>
            <p className="text-neutral-400">
              {feedType === 'following'
                ? 'Follow people to see their posts here'
                : 'Be the first to share something'}
            </p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}

        {/* Load more trigger */}
        {hasMore && (
          <div ref={ref} className="py-8 flex justify-center">
            {isLoading && <LoadingSpinner size="lg" />}
          </div>
        )}

        {!hasMore && posts.length > 0 && (
          <div className="py-8 text-center text-neutral-400">
            You&apos;ve reached the end
          </div>
        )}
      </div>
    </div>
  );
}
