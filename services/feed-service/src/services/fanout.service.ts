/**
 * Feed Fan-Out Service
 *
 * Implements the fan-out on write strategy for efficient feed delivery:
 * - When a user posts, push to all followers' feeds
 * - Uses Redis sorted sets for timeline storage
 * - Hybrid approach for high-follower accounts (celebrities)
 * - Background processing via job queue
 */

import { redis, prisma } from '@textmesh/db-client';
import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'fanout-service' });

// Configuration
const FEED_MAX_SIZE = 1000; // Max posts in a user's feed
const CELEBRITY_THRESHOLD = 10000; // Followers above this use pull model
const BATCH_SIZE = 500; // Followers to process per batch
const FEED_TTL = 86400 * 7; // 7 days

export interface PostData {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
  replyToId?: string;
  quotePostId?: string;
  mediaUrls?: string[];
  type: 'post' | 'reply' | 'repost';
}

export interface FeedEntry {
  postId: string;
  authorId: string;
  score: number; // timestamp for sorting
  type: 'original' | 'repost' | 'reply';
  repostedBy?: string;
}

export class FanoutService {
  /**
   * Fan out a new post to followers
   */
  async fanoutPost(post: PostData): Promise<void> {
    const { id: postId, authorId } = post;

    logger.info('Starting fanout', { postId, authorId });

    // Get follower count
    const followerCount = await this.getFollowerCount(authorId);

    // Check if author is a celebrity (high follower count)
    if (followerCount > CELEBRITY_THRESHOLD) {
      // Use hybrid approach - don't fan out, followers will pull
      logger.info('Celebrity account, using pull model', { authorId, followerCount });
      await this.markCelebrityPost(post);
      return;
    }

    // Fan out to all followers in batches
    let cursor = 0;
    let processedCount = 0;

    while (true) {
      const followers = await this.getFollowersBatch(authorId, cursor, BATCH_SIZE);

      if (followers.length === 0) {
        break;
      }

      // Process batch in parallel
      await Promise.all(
        followers.map((followerId) => this.addToFeed(followerId, post))
      );

      processedCount += followers.length;
      cursor += BATCH_SIZE;

      // Log progress for large fan-outs
      if (processedCount % 1000 === 0) {
        logger.debug('Fanout progress', { postId, processedCount, total: followerCount });
      }
    }

    // Also add to author's own feed
    await this.addToFeed(authorId, post);

    logger.info('Fanout complete', { postId, authorId, followerCount: processedCount });
  }

  /**
   * Add a post to a user's feed
   */
  async addToFeed(
    userId: string,
    post: PostData,
    type: 'original' | 'repost' | 'reply' = 'original',
    repostedBy?: string
  ): Promise<void> {
    const feedKey = `feed:${userId}`;
    const score = post.createdAt.getTime();

    const entry: FeedEntry = {
      postId: post.id,
      authorId: post.authorId,
      score,
      type,
      ...(repostedBy && { repostedBy }),
    };

    // Add to sorted set
    await redis.zadd(feedKey, score, JSON.stringify(entry));

    // Trim feed to max size
    await redis.zremrangebyrank(feedKey, 0, -FEED_MAX_SIZE - 1);

    // Set TTL
    await redis.expire(feedKey, FEED_TTL);
  }

  /**
   * Remove a post from all followers' feeds (on delete)
   */
  async removeFanout(post: PostData): Promise<void> {
    const { id: postId, authorId } = post;

    logger.info('Removing fanout', { postId, authorId });

    const followerCount = await this.getFollowerCount(authorId);

    // For celebrities, just mark the post as deleted
    if (followerCount > CELEBRITY_THRESHOLD) {
      await redis.sadd('posts:deleted', postId);
      return;
    }

    // Remove from all followers' feeds
    let cursor = 0;

    while (true) {
      const followers = await this.getFollowersBatch(authorId, cursor, BATCH_SIZE);

      if (followers.length === 0) {
        break;
      }

      await Promise.all(
        followers.map(async (followerId) => {
          const feedKey = `feed:${followerId}`;
          const entries = await redis.zrange(feedKey, 0, -1);

          for (const entry of entries) {
            try {
              const parsed = JSON.parse(entry) as FeedEntry;
              if (parsed.postId === postId) {
                await redis.zrem(feedKey, entry);
                break;
              }
            } catch {
              // Ignore invalid entries
            }
          }
        })
      );

      cursor += BATCH_SIZE;
    }

    // Remove from author's feed
    await this.removeFromFeed(authorId, postId);

    logger.info('Fanout removal complete', { postId });
  }

  /**
   * Remove a specific post from a user's feed
   */
  async removeFromFeed(userId: string, postId: string): Promise<void> {
    const feedKey = `feed:${userId}`;
    const entries = await redis.zrange(feedKey, 0, -1);

    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry) as FeedEntry;
        if (parsed.postId === postId) {
          await redis.zrem(feedKey, entry);
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Handle repost - fan out to reposting user's followers
   */
  async fanoutRepost(
    originalPost: PostData,
    reposterId: string,
    repostId: string
  ): Promise<void> {
    const repost: PostData = {
      ...originalPost,
      id: repostId,
      createdAt: new Date(),
    };

    const followerCount = await this.getFollowerCount(reposterId);

    if (followerCount > CELEBRITY_THRESHOLD) {
      await this.markCelebrityPost(repost);
      return;
    }

    let cursor = 0;

    while (true) {
      const followers = await this.getFollowersBatch(reposterId, cursor, BATCH_SIZE);

      if (followers.length === 0) {
        break;
      }

      await Promise.all(
        followers.map((followerId) =>
          this.addToFeed(followerId, originalPost, 'repost', reposterId)
        )
      );

      cursor += BATCH_SIZE;
    }

    logger.info('Repost fanout complete', { originalPostId: originalPost.id, reposterId });
  }

  /**
   * Get user's feed from Redis
   */
  async getFeed(
    userId: string,
    limit: number = 20,
    before?: number
  ): Promise<{ entries: FeedEntry[]; hasMore: boolean }> {
    const feedKey = `feed:${userId}`;

    let entries: string[];

    if (before) {
      // Get posts before the given timestamp
      entries = await redis.zrevrangebyscore(
        feedKey,
        before - 1,
        '-inf',
        'LIMIT',
        0,
        limit + 1
      );
    } else {
      // Get latest posts
      entries = await redis.zrevrange(feedKey, 0, limit);
    }

    const hasMore = entries.length > limit;
    const feedEntries = entries
      .slice(0, limit)
      .map((entry) => {
        try {
          return JSON.parse(entry) as FeedEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is FeedEntry => e !== null);

    // Merge with celebrity posts if needed
    const mergedFeed = await this.mergeCelebrityPosts(userId, feedEntries, limit);

    return {
      entries: mergedFeed,
      hasMore,
    };
  }

  /**
   * Rebuild a user's feed (on follow or cache miss)
   */
  async rebuildFeed(userId: string): Promise<void> {
    logger.info('Rebuilding feed', { userId });

    const feedKey = `feed:${userId}`;

    // Clear existing feed
    await redis.del(feedKey);

    // Get users this person follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    // Get recent posts from followed users
    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: followingIds },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: FEED_MAX_SIZE,
      select: {
        id: true,
        authorId: true,
        createdAt: true,
        replyToId: true,
        quotePostId: true,
      },
    });

    // Add all posts to feed
    const pipeline = redis.pipeline();

    for (const post of posts) {
      const entry: FeedEntry = {
        postId: post.id,
        authorId: post.authorId,
        score: post.createdAt.getTime(),
        type: post.replyToId ? 'reply' : 'original',
      };

      pipeline.zadd(feedKey, post.createdAt.getTime(), JSON.stringify(entry));
    }

    pipeline.expire(feedKey, FEED_TTL);
    await pipeline.exec();

    logger.info('Feed rebuilt', { userId, postCount: posts.length });
  }

  /**
   * Mark a post from celebrity for pull model
   */
  private async markCelebrityPost(post: PostData): Promise<void> {
    const key = `celebrity:posts:${post.authorId}`;
    const score = post.createdAt.getTime();

    const entry: FeedEntry = {
      postId: post.id,
      authorId: post.authorId,
      score,
      type: post.replyToId ? 'reply' : 'original',
    };

    await redis.zadd(key, score, JSON.stringify(entry));
    await redis.zremrangebyrank(key, 0, -FEED_MAX_SIZE - 1);
    await redis.expire(key, FEED_TTL);
  }

  /**
   * Merge celebrity posts into feed at read time
   */
  private async mergeCelebrityPosts(
    userId: string,
    feedEntries: FeedEntry[],
    limit: number
  ): Promise<FeedEntry[]> {
    // Get celebrities this user follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: {
            id: true,
            _count: { select: { followers: true } },
          },
        },
      },
    });

    const celebrities = following
      .filter((f) => f.following._count.followers > CELEBRITY_THRESHOLD)
      .map((f) => f.followingId);

    if (celebrities.length === 0) {
      return feedEntries;
    }

    // Get recent posts from celebrities
    const pipeline = redis.pipeline();
    for (const celebId of celebrities) {
      pipeline.zrevrange(`celebrity:posts:${celebId}`, 0, limit - 1);
    }

    const results = await pipeline.exec();

    // Parse celebrity posts
    const celebrityEntries: FeedEntry[] = [];
    for (const [err, entries] of results || []) {
      if (err || !entries) continue;

      for (const entry of entries as string[]) {
        try {
          celebrityEntries.push(JSON.parse(entry) as FeedEntry);
        } catch {
          // Ignore
        }
      }
    }

    // Merge and sort
    const merged = [...feedEntries, ...celebrityEntries]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Deduplicate
    const seen = new Set<string>();
    return merged.filter((entry) => {
      if (seen.has(entry.postId)) {
        return false;
      }
      seen.add(entry.postId);
      return true;
    });
  }

  /**
   * Get follower count for a user
   */
  private async getFollowerCount(userId: string): Promise<number> {
    const cacheKey = `user:follower_count:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return parseInt(cached, 10);
    }

    const count = await prisma.follow.count({
      where: { followingId: userId },
    });

    await redis.setex(cacheKey, 300, count.toString());

    return count;
  }

  /**
   * Get a batch of followers
   */
  private async getFollowersBatch(
    userId: string,
    offset: number,
    limit: number
  ): Promise<string[]> {
    const followers = await prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    return followers.map((f) => f.followerId);
  }
}

export const fanoutService = new FanoutService();

/**
 * Initialize fanout event handlers with event bus
 */
export async function initializeFanoutHandlers(eventBus?: { on: (eventType: string, handler: (data: any) => Promise<void>) => void }): Promise<void> {
  if (!eventBus) {
    logger.info('No event bus provided, fanout handlers not initialized');
    return;
  }

  eventBus.on('post.created', async (event: any) => {
    const data = event.payload || event;
    const post: PostData = {
      id: data.postId,
      authorId: data.authorId,
      content: data.content,
      createdAt: new Date(data.createdAt),
      replyToId: data.replyToId,
      quotePostId: data.quotePostId,
      mediaUrls: data.mediaUrls,
      type: data.replyToId ? 'reply' : 'post',
    };

    await fanoutService.fanoutPost(post);
  });

  eventBus.on('post.deleted', async (event: any) => {
    const data = event.payload || event;
    const post: PostData = {
      id: data.postId,
      authorId: data.authorId,
      content: '',
      createdAt: new Date(),
      type: 'post',
    };

    await fanoutService.removeFanout(post);
  });

  eventBus.on('user.followed', async (event: any) => {
    const data = event.payload || event;
    // When user follows someone, rebuild their feed to include new content
    await fanoutService.rebuildFeed(data.followerId);
  });

  logger.info('Fanout event handlers initialized');
}
