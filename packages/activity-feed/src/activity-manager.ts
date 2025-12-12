import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Activity,
  ActivityType,
  ActorType,
  ActivityVerb,
  ObjectType,
  ActivityContext,
  ActivityImportance,
  ActivityVisibility,
  ActivityFilter,
  PaginationOptions,
  FeedConfig,
} from './types';

const DEFAULT_CONFIG: FeedConfig = {
  maxFeedSize: 1000,
  maxAggregationWindow: 3600000,
  maxAggregationSize: 50,
  activityTTL: 86400 * 30,
  notificationTTL: 86400 * 7,
  enableAggregation: true,
  enableRealtime: true,
};

export class ActivityManager {
  private redis: Redis;
  private config: FeedConfig;
  private readonly activityPrefix = 'feed:activity:';
  private readonly userFeedPrefix = 'feed:user:';
  private readonly globalFeedPrefix = 'feed:global';

  constructor(redis: Redis, config?: Partial<FeedConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async createActivity(
    actorId: string,
    verb: ActivityVerb,
    objectId: string,
    objectType: ObjectType,
    options: {
      type?: ActivityType;
      actorType?: ActorType;
      targetId?: string;
      targetType?: ObjectType;
      data?: Record<string, unknown>;
      context?: ActivityContext;
      aggregationKey?: string;
      importance?: ActivityImportance;
      visibility?: ActivityVisibility;
      expiresAt?: Date;
    } = {}
  ): Promise<Activity> {
    const activity: Activity = {
      id: uuidv4(),
      type: options.type || this.inferActivityType(verb),
      actorId,
      actorType: options.actorType || 'user',
      verb,
      objectId,
      objectType,
      targetId: options.targetId,
      targetType: options.targetType,
      data: options.data,
      context: options.context,
      aggregationKey: options.aggregationKey || this.generateAggregationKey(verb, objectId),
      importance: options.importance || 'normal',
      visibility: options.visibility || 'public',
      createdAt: new Date(),
      expiresAt: options.expiresAt,
    };

    await this.redis.set(
      `${this.activityPrefix}${activity.id}`,
      JSON.stringify(activity),
      'EX',
      this.config.activityTTL
    );

    await this.redis.zadd(
      this.globalFeedPrefix,
      activity.createdAt.getTime(),
      activity.id
    );

    await this.redis.zadd(
      `${this.userFeedPrefix}${actorId}:activities`,
      activity.createdAt.getTime(),
      activity.id
    );

    await this.trimFeed(this.globalFeedPrefix);
    await this.trimFeed(`${this.userFeedPrefix}${actorId}:activities`);

    return activity;
  }

  async getActivity(activityId: string): Promise<Activity | null> {
    const data = await this.redis.get(`${this.activityPrefix}${activityId}`);
    if (!data) return null;
    return this.deserializeActivity(data);
  }

  async getActivities(activityIds: string[]): Promise<Activity[]> {
    if (activityIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    activityIds.forEach((id) => pipeline.get(`${this.activityPrefix}${id}`));
    const results = await pipeline.exec();

    const activities: Activity[] = [];
    results?.forEach(([err, data]) => {
      if (!err && data) {
        activities.push(this.deserializeActivity(data as string));
      }
    });

    return activities;
  }

  async getUserActivities(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<{ activities: Activity[]; cursor?: string; hasMore: boolean }> {
    const { cursor, limit = 50, direction = 'backward' } = options;

    const feedKey = `${this.userFeedPrefix}${userId}:activities`;

    let activityIds: string[];
    if (direction === 'backward') {
      const maxScore = cursor ? parseInt(cursor) - 1 : '+inf';
      activityIds = await this.redis.zrevrangebyscore(
        feedKey,
        maxScore,
        '-inf',
        'LIMIT',
        0,
        limit + 1
      );
    } else {
      const minScore = cursor ? parseInt(cursor) + 1 : '-inf';
      activityIds = await this.redis.zrangebyscore(
        feedKey,
        minScore,
        '+inf',
        'LIMIT',
        0,
        limit + 1
      );
    }

    const hasMore = activityIds.length > limit;
    if (hasMore) activityIds.pop();

    const activities = await this.getActivities(activityIds);

    const nextCursor =
      activities.length > 0
        ? activities[activities.length - 1].createdAt.getTime().toString()
        : undefined;

    return { activities, cursor: nextCursor, hasMore };
  }

  async getGlobalFeed(
    options: PaginationOptions = {}
  ): Promise<{ activities: Activity[]; cursor?: string; hasMore: boolean }> {
    const { cursor, limit = 50 } = options;

    const maxScore = cursor ? parseInt(cursor) - 1 : '+inf';
    const activityIds = await this.redis.zrevrangebyscore(
      this.globalFeedPrefix,
      maxScore,
      '-inf',
      'LIMIT',
      0,
      limit + 1
    );

    const hasMore = activityIds.length > limit;
    if (hasMore) activityIds.pop();

    const activities = await this.getActivities(activityIds);

    const nextCursor =
      activities.length > 0
        ? activities[activities.length - 1].createdAt.getTime().toString()
        : undefined;

    return { activities, cursor: nextCursor, hasMore };
  }

  async filterActivities(
    userId: string,
    filter: ActivityFilter,
    options: PaginationOptions = {}
  ): Promise<{ activities: Activity[]; cursor?: string; hasMore: boolean }> {
    const { activities, cursor, hasMore } = await this.getUserActivities(
      userId,
      { ...options, limit: (options.limit || 50) * 2 }
    );

    const filtered = activities.filter((activity) => {
      if (filter.types && !filter.types.includes(activity.type)) return false;
      if (filter.verbs && !filter.verbs.includes(activity.verb)) return false;
      if (filter.actorIds && !filter.actorIds.includes(activity.actorId)) return false;
      if (filter.objectTypes && !filter.objectTypes.includes(activity.objectType)) return false;
      if (filter.importance && !filter.importance.includes(activity.importance)) return false;
      if (filter.since && activity.createdAt < filter.since) return false;
      if (filter.until && activity.createdAt > filter.until) return false;
      return true;
    });

    const limit = options.limit || 50;
    const result = filtered.slice(0, limit);
    const filteredHasMore = filtered.length > limit || hasMore;

    return {
      activities: result,
      cursor,
      hasMore: filteredHasMore,
    };
  }

  async deleteActivity(activityId: string): Promise<boolean> {
    const activity = await this.getActivity(activityId);
    if (!activity) return false;

    await this.redis.del(`${this.activityPrefix}${activityId}`);
    await this.redis.zrem(this.globalFeedPrefix, activityId);
    await this.redis.zrem(
      `${this.userFeedPrefix}${activity.actorId}:activities`,
      activityId
    );

    return true;
  }

  async deleteUserActivities(
    userId: string,
    verb?: ActivityVerb
  ): Promise<number> {
    const { activities } = await this.getUserActivities(userId, { limit: 1000 });

    let deleted = 0;
    for (const activity of activities) {
      if (!verb || activity.verb === verb) {
        await this.deleteActivity(activity.id);
        deleted++;
      }
    }

    return deleted;
  }

  async getActivityCount(userId: string): Promise<number> {
    return this.redis.zcard(`${this.userFeedPrefix}${userId}:activities`);
  }

  async getActivitiesByObject(
    objectId: string,
    objectType: ObjectType,
    limit: number = 50
  ): Promise<Activity[]> {
    const { activities } = await this.getGlobalFeed({ limit: limit * 10 });

    return activities
      .filter((a) => a.objectId === objectId && a.objectType === objectType)
      .slice(0, limit);
  }

  private async trimFeed(feedKey: string): Promise<void> {
    const size = await this.redis.zcard(feedKey);
    if (size > this.config.maxFeedSize) {
      await this.redis.zremrangebyrank(
        feedKey,
        0,
        size - this.config.maxFeedSize - 1
      );
    }
  }

  private inferActivityType(verb: ActivityVerb): ActivityType {
    const socialVerbs: ActivityVerb[] = ['follow', 'unfollow', 'block', 'mute'];
    const contentVerbs: ActivityVerb[] = ['post', 'comment', 'reply', 'repost', 'quote'];
    const engagementVerbs: ActivityVerb[] = ['like', 'share', 'bookmark'];
    const achievementVerbs: ActivityVerb[] = ['achieve', 'level_up', 'badge', 'streak'];

    if (socialVerbs.includes(verb)) return 'social';
    if (contentVerbs.includes(verb)) return 'content';
    if (engagementVerbs.includes(verb)) return 'engagement';
    if (achievementVerbs.includes(verb)) return 'achievement';
    if (verb === 'mention') return 'mention';
    return 'system';
  }

  private generateAggregationKey(verb: ActivityVerb, objectId: string): string {
    return `${verb}:${objectId}`;
  }

  private deserializeActivity(data: string): Activity {
    const activity = JSON.parse(data);
    activity.createdAt = new Date(activity.createdAt);
    if (activity.expiresAt) {
      activity.expiresAt = new Date(activity.expiresAt);
    }
    return activity;
  }

  getConfig(): FeedConfig {
    return this.config;
  }
}
