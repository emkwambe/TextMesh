'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { Post } from '@/stores/feedStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PostCard } from '@/components/post/PostCard';
import { ComposeBox } from '@/components/post/ComposeBox';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  HeartIcon,
  HeartFilledIcon,
  CommentIcon,
  RepeatIcon,
  ShareIcon,
  BookmarkIcon,
  BookmarkFilledIcon,
  MoreHorizontalIcon,
} from '@/components/icons';
import clsx from 'clsx';

interface PostDetail extends Post {
  replies: Post[];
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;

  const [post, setPost] = useState<PostDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Mock fetch
    setTimeout(() => {
      setPost({
        id: postId,
        content: 'This is a sample post to demonstrate the post detail page. It includes all the engagement metrics and reply functionality. #TextMesh #Demo',
        author: {
          id: '1',
          username: 'demo',
          displayName: 'Demo User',
          isVerified: true,
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        likesCount: 42,
        commentsCount: 5,
        repostsCount: 3,
        isLiked: false,
        isBookmarked: false,
        isReposted: false,
        replies: [
          {
            id: 'reply-1',
            content: 'Great post! Really insightful thoughts.',
            author: {
              id: '2',
              username: 'responder',
              displayName: 'Responder',
              isVerified: false,
            },
            createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
            likesCount: 5,
            commentsCount: 0,
            repostsCount: 0,
            isLiked: false,
            isBookmarked: false,
            isReposted: false,
            replyTo: {
              id: postId,
              author: { username: 'demo' },
            },
          },
        ],
      });
      setIsLoading(false);
    }, 500);
  }, [postId]);

  const handleLike = () => {
    if (!post) return;
    setPost({
      ...post,
      isLiked: !post.isLiked,
      likesCount: post.isLiked ? post.likesCount - 1 : post.likesCount + 1,
    });
  };

  const handleBookmark = () => {
    if (!post) return;
    setPost({ ...post, isBookmarked: !post.isBookmarked });
  };

  const handleRepost = () => {
    if (!post) return;
    setPost({
      ...post,
      isReposted: !post.isReposted,
      repostsCount: post.isReposted ? post.repostsCount - 1 : post.repostsCount + 1,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-500 text-lg mb-4">Post not found</p>
        <Button onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-10 glass border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-display font-bold text-xl">Post</h1>
        </div>
      </header>

      {/* Post */}
      <article className="px-4 py-4 border-b border-neutral-200 dark:border-neutral-800">
        {/* Author */}
        <div className="flex items-center gap-3 mb-4">
          <Link href={`/${post.author.username}`}>
            <Avatar src={post.author.avatar} alt={post.author.displayName} size="lg" />
          </Link>
          <div className="flex-1">
            <Link href={`/${post.author.username}`} className="block">
              <p className="font-bold flex items-center gap-1">
                {post.author.displayName}
                {post.author.isVerified && (
                  <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </p>
              <p className="text-neutral-500">@{post.author.username}</p>
            </Link>
          </div>
          <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400">
            <MoreHorizontalIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <p className="text-xl whitespace-pre-wrap break-words mb-4">{post.content}</p>

        {/* Timestamp */}
        <p className="text-neutral-500 text-sm mb-4">
          {format(new Date(post.createdAt), 'h:mm a · MMM d, yyyy')}
        </p>

        {/* Stats */}
        {(post.likesCount > 0 || post.repostsCount > 0) && (
          <div className="flex gap-6 py-4 border-t border-neutral-200 dark:border-neutral-800 text-sm">
            {post.repostsCount > 0 && (
              <div>
                <span className="font-bold">{post.repostsCount}</span>
                <span className="text-neutral-500"> Reposts</span>
              </div>
            )}
            {post.likesCount > 0 && (
              <div>
                <span className="font-bold">{post.likesCount}</span>
                <span className="text-neutral-500"> Likes</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-around py-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={handleLike}
            className={clsx(
              'flex items-center gap-2 p-2 rounded-full transition-colors',
              post.isLiked
                ? 'text-error-500'
                : 'text-neutral-500 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20'
            )}
          >
            {post.isLiked ? (
              <HeartFilledIcon className="w-6 h-6" />
            ) : (
              <HeartIcon className="w-6 h-6" />
            )}
          </button>

          <button className="flex items-center gap-2 p-2 rounded-full text-neutral-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <CommentIcon className="w-6 h-6" />
          </button>

          <button
            onClick={handleRepost}
            className={clsx(
              'flex items-center gap-2 p-2 rounded-full transition-colors',
              post.isReposted
                ? 'text-success-500'
                : 'text-neutral-500 hover:text-success-500 hover:bg-success-50 dark:hover:bg-success-900/20'
            )}
          >
            <RepeatIcon className="w-6 h-6" />
          </button>

          <button className="flex items-center gap-2 p-2 rounded-full text-neutral-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <ShareIcon className="w-6 h-6" />
          </button>

          <button
            onClick={handleBookmark}
            className={clsx(
              'flex items-center gap-2 p-2 rounded-full transition-colors',
              post.isBookmarked
                ? 'text-primary-500'
                : 'text-neutral-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20'
            )}
          >
            {post.isBookmarked ? (
              <BookmarkFilledIcon className="w-6 h-6" />
            ) : (
              <BookmarkIcon className="w-6 h-6" />
            )}
          </button>
        </div>
      </article>

      {/* Reply composer */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <ComposeBox
          replyTo={{ id: post.id, author: { username: post.author.username } }}
        />
      </div>

      {/* Replies */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {post.replies.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-neutral-500">No replies yet</p>
            <p className="text-neutral-400 text-sm mt-1">Be the first to reply!</p>
          </div>
        ) : (
          post.replies.map((reply) => (
            <PostCard key={reply.id} post={reply} />
          ))
        )}
      </div>
    </div>
  );
}
