/**
 * Feed Handler
 *
 * Handles real-time feed updates for:
 * - New posts from followed users
 * - Post engagement (likes, comments)
 * - Trending updates
 */

import { Server } from 'socket.io';
import { createLogger } from '@textmesh/logger';
import { redis } from '@textmesh/db-client';
import { emitToUser, emitToRoom } from '../socket/server';

const logger = createLogger({ service: 'feed-handler' });

export interface PostEvent {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  content: string;
  mediaUrls?: string[];
  replyToId?: string;
  quotePostId?: string;
  createdAt: string;
}

export interface LikeEvent {
  postId: string;
  userId: string;
  username?: string;
  displayName?: string;
  authorId: string;
  likesCount: number;
}

export interface CommentEvent {
  postId: string;
  commentId: string;
  userId: string;
  username?: string;
  displayName?: string;
  content: string;
  authorId: string;
  commentsCount: number;
  createdAt: string;
}

export class FeedHandler {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Handle new post from a user
   */
  async handleNewPost(event: PostEvent): Promise<void> {
    const {
      id,
      authorId,
      authorUsername,
      authorDisplayName,
      authorAvatarUrl,
      content,
      mediaUrls,
      replyToId,
      quotePostId,
      createdAt,
    } = event;

    logger.debug('Processing new post', { postId: id, authorId });

    // Get followers who should see this in their feed
    const followerIds = await this.getFollowerIds(authorId);

    // Prepare post data
    const postData = {
      id,
      author: {
        id: authorId,
        username: authorUsername,
        displayName: authorDisplayName,
        avatarUrl: authorAvatarUrl,
      },
      content,
      mediaUrls,
      replyToId,
      quotePostId,
      createdAt,
      stats: {
        likes: 0,
        comments: 0,
        reposts: 0,
      },
    };

    // Emit to each follower's feed room
    for (const followerId of followerIds) {
      emitToUser(followerId, 'feed:new-post', postData);
    }

    // Also emit to author's feed
    emitToUser(authorId, 'feed:new-post', postData);

    logger.debug('Post distributed to feeds', { postId: id, followerCount: followerIds.length });
  }

  /**
   * Handle post like
   */
  handlePostLike(event: LikeEvent): void {
    const { postId, userId, username, displayName, authorId, likesCount } = event;

    // Emit to post room (for live engagement view)
    emitToRoom(`post:${postId}`, 'post:liked', {
      postId,
      user: {
        id: userId,
        username,
        displayName,
      },
      likesCount,
      timestamp: new Date().toISOString(),
    });

    // Notify post author (if different from liker)
    if (authorId !== userId) {
      emitToUser(authorId, 'notification:new', {
        type: 'like',
        message: `${displayName || username} liked your post`,
        data: {
          postId,
          userId,
          username,
        },
        createdAt: new Date().toISOString(),
        read: false,
      });
    }

    logger.debug('Like event delivered', { postId, userId });
  }

  /**
   * Handle post comment
   */
  handlePostComment(event: CommentEvent): void {
    const {
      postId,
      commentId,
      userId,
      username,
      displayName,
      content,
      authorId,
      commentsCount,
      createdAt,
    } = event;

    // Emit to post room
    emitToRoom(`post:${postId}`, 'post:commented', {
      postId,
      comment: {
        id: commentId,
        user: {
          id: userId,
          username,
          displayName,
        },
        content,
        createdAt,
      },
      commentsCount,
    });

    // Notify post author
    if (authorId !== userId) {
      emitToUser(authorId, 'notification:new', {
        type: 'comment',
        message: `${displayName || username} commented on your post`,
        data: {
          postId,
          commentId,
          preview: content.substring(0, 100),
        },
        createdAt,
        read: false,
      });
    }

    logger.debug('Comment event delivered', { postId, commentId });
  }

  /**
   * Handle post repost
   */
  handlePostRepost(event: {
    postId: string;
    userId: string;
    username?: string;
    authorId: string;
    repostsCount: number;
  }): void {
    const { postId, userId, username, authorId, repostsCount } = event;

    // Emit to post room
    emitToRoom(`post:${postId}`, 'post:reposted', {
      postId,
      user: { id: userId, username },
      repostsCount,
      timestamp: new Date().toISOString(),
    });

    // Notify author
    if (authorId !== userId) {
      emitToUser(authorId, 'notification:new', {
        type: 'repost',
        message: `${username} reposted your post`,
        data: { postId, userId },
        createdAt: new Date().toISOString(),
        read: false,
      });
    }
  }

  /**
   * Handle bookmark event
   */
  handlePostBookmark(event: {
    postId: string;
    userId: string;
    action: 'add' | 'remove';
  }): void {
    const { postId, userId, action } = event;

    // Just emit to the user who bookmarked
    emitToUser(userId, 'post:bookmarked', {
      postId,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Push trending update to interested users
   */
  pushTrendingUpdate(topics: Array<{ tag: string; count: number; trend: string }>): void {
    this.io.emit('trending:update', {
      topics,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get follower IDs for a user (cached)
   */
  private async getFollowerIds(userId: string): Promise<string[]> {
    const cacheKey = `user:followers:${userId}`;

    // Try cache first
    const cached = await redis.smembers(cacheKey);
    if (cached.length > 0) {
      return cached;
    }

    // Would normally query database here
    // For now, return empty - the actual implementation would be in the user/follow service
    return [];
  }
}
