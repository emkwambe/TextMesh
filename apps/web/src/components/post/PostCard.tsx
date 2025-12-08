'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Post, useFeedStore } from '@/stores/feedStore';
import { Avatar } from '@/components/ui/Avatar';
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

interface PostCardProps {
  post: Post;
  showReplyLine?: boolean;
}

export function PostCard({ post, showReplyLine }: PostCardProps) {
  const { toggleLike, toggleBookmark, toggleRepost } = useFeedStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleLike(post.id);
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleBookmark(post.id);
  };

  const handleRepost = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleRepost(post.id);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigator.share) {
      await navigator.share({
        title: `Post by @${post.author.username}`,
        text: post.content.slice(0, 100),
        url: `${window.location.origin}/post/${post.id}`,
      });
    }
  };

  const formatContent = (content: string) => {
    // Parse hashtags, mentions, and URLs
    const parts = content.split(/(\s+)/);
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
        return (
          <Link
            key={i}
            href={`/explore?q=${encodeURIComponent(part)}`}
            className="text-primary-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </Link>
        );
      }
      if (part.startsWith('@')) {
        return (
          <Link
            key={i}
            href={`/${part.slice(1)}`}
            className="text-primary-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </Link>
        );
      }
      if (part.match(/^https?:\/\//)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {new URL(part).hostname}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <article className="relative">
      <Link
        href={`/post/${post.id}`}
        className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
      >
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 relative">
            <Link href={`/${post.author.username}`} onClick={(e) => e.stopPropagation()}>
              <Avatar
                src={post.author.avatar}
                alt={post.author.displayName}
                size="md"
              />
            </Link>
            {showReplyLine && (
              <div className="absolute left-1/2 top-12 bottom-0 w-0.5 -translate-x-1/2 bg-neutral-200 dark:bg-neutral-700" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Reply indicator */}
            {post.replyTo && (
              <p className="text-sm text-neutral-500 mb-1">
                Replying to{' '}
                <Link
                  href={`/${post.replyTo.author.username}`}
                  className="text-primary-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{post.replyTo.author.username}
                </Link>
              </p>
            )}

            {/* Author info */}
            <div className="flex items-center gap-1 text-sm">
              <Link
                href={`/${post.author.username}`}
                className="font-semibold hover:underline flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {post.author.displayName}
                {post.author.isVerified && (
                  <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </Link>
              <Link
                href={`/${post.author.username}`}
                className="text-neutral-500"
                onClick={(e) => e.stopPropagation()}
              >
                @{post.author.username}
              </Link>
              <span className="text-neutral-400">·</span>
              <time className="text-neutral-500" dateTime={post.createdAt}>
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: false })}
              </time>
            </div>

            {/* Post content */}
            <p className="mt-1 text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap break-words">
              {formatContent(post.content)}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between mt-3 max-w-md">
              <button
                onClick={handleLike}
                className={clsx(
                  'flex items-center gap-1.5 text-sm transition-colors group',
                  post.isLiked
                    ? 'text-error-500'
                    : 'text-neutral-500 hover:text-error-500'
                )}
              >
                {post.isLiked ? (
                  <HeartFilledIcon className="w-5 h-5" />
                ) : (
                  <HeartIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                )}
                {post.likesCount > 0 && <span>{post.likesCount}</span>}
              </button>

              <Link
                href={`/post/${post.id}`}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary-500 transition-colors group"
                onClick={(e) => e.stopPropagation()}
              >
                <CommentIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                {post.commentsCount > 0 && <span>{post.commentsCount}</span>}
              </Link>

              <button
                onClick={handleRepost}
                className={clsx(
                  'flex items-center gap-1.5 text-sm transition-colors group',
                  post.isReposted
                    ? 'text-success-500'
                    : 'text-neutral-500 hover:text-success-500'
                )}
              >
                <RepeatIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                {post.repostsCount > 0 && <span>{post.repostsCount}</span>}
              </button>

              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary-500 transition-colors group"
              >
                <ShareIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>

              <button
                onClick={handleBookmark}
                className={clsx(
                  'flex items-center gap-1.5 text-sm transition-colors group',
                  post.isBookmarked
                    ? 'text-primary-500'
                    : 'text-neutral-500 hover:text-primary-500'
                )}
              >
                {post.isBookmarked ? (
                  <BookmarkFilledIcon className="w-5 h-5" />
                ) : (
                  <BookmarkIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                )}
              </button>
            </div>
          </div>

          {/* More menu */}
          <button
            onClick={(e) => {
              e.preventDefault();
              setShowMenu(!showMenu);
            }}
            className="flex-shrink-0 p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <MoreHorizontalIcon className="w-5 h-5" />
          </button>
        </div>
      </Link>
    </article>
  );
}
