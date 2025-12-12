import { Redis } from 'ioredis';
import { ActivityManager } from './activity-manager';
import { ActivityAggregator } from './aggregator';
import { NotificationManager } from './notification-manager';
import {
  Activity,
  ActivityVerb,
  ObjectType,
  ActivityContext,
  ActivityImportance,
  ActivityVisibility,
  AggregatedActivity,
  Feed,
  FeedType,
  FeedItem,
  FeedSubscription,
  FeedConfig,
  FeedStats,
  ActivityFilter,
  PaginationOptions,
  EnrichedData,
  UserSummary,
  ContentSummary,
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

export class FeedService {
  private redis: Redis;
  private activityManager: ActivityManager;
  private aggregator: ActivityAggregator;
  private notificationManager: NotificationManager;
  private config: FeedConfig;
  private readonly subscriptionPrefix = 'feed:subscription:';
  private readonly homeFeedPrefix = 'feed:home:';
  private readonly enricherCallbacks: Map<string, EnricherCallback> = new Map();

  constructor(redis: Redis, config?: Partial<FeedConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activityManager = new ActivityManager(redis, this.config);
    this.aggregator = new ActivityAggregator(redis, this.config);
    this.notificationManager = new NotificationManager(redis, this.config);
  }

  async publishActivity(
    actorId: string,
    verb: ActivityVerb,
    objectId: string,
    objectType: ObjectType,
    options: {
      targetId?: string;
      targetType?: ObjectType;
      data?: Record<string, unknown>;
      context?: ActivityContext;
      importance?: ActivityImportance;
      visibility?: ActivityVisibility;
      notifyTarget?: boolean;
      fanoutToFollowers?: boolean;
      followerIds?: string[];
    } = {}
  ): Promise<Activity> {
    const activity = await this.activityManager.createActivity(
      actorId,
      verb,
      objectId,
      objectType,
      options
    );

    if (options.notifyTarget && options.targetId && options.targetId !== actorId) {
      await this.notificationManager.createFromActivity(activity, options.targetId);
    }

    if (options.fanoutToFollowers && options.followerIds) {
      await this.fanoutToFollowers(activity, options.followerIds);
    }

    if (this.config.enableAggregation && options.targetId) {
      await this.aggregator.aggregateActivity(options.targetId, activity);
    }

    return activity;
  }

  async getHomeFeed(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<Feed> {
    const { limit = 50, cursor } = options;

    const maxScore = cursor ? parseInt(cursor) - 1 : '+inf';
    const activityIds = await this.redis.zrevrangebyscore(
      `${this.homeFeedPrefix}${userId}`,
      maxScore,
      '-inf',
      'LIMIT',
      0,
      limit + 1
    );

    const hasMore = activityIds.length > limit;
    if (hasMore) activityIds.pop();

    const activities = await this.activityManager.getActivities(activityIds);

    const nextCursor =
      activities.length > 0
        ? activities[activities.length - 1].createdAt.getTime().toString()
        : undefined;

    return {
      id: `home:${userId}`,
      userId,
      type: 'home',
      activities,
      cursor: nextCursor,
      hasMore,
    };
  }

  async getUserFeed(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<Feed> {
    const { activities, cursor, hasMore } =
      await this.activityManager.getUserActivities(userId, options);

    return {
      id: `user:${userId}`,
      userId,
      type: 'user',
      activities,
      cursor,
      hasMore,
    };
  }

  async getNotificationsFeed(
    userId: string,
    options: PaginationOptions & { unreadOnly?: boolean } = {}
  ): Promise<Feed> {
    const { notifications, cursor, hasMore } =
      await this.notificationManager.getUserNotifications(userId, options);

    const activities: Activity[] = notifications.map((n) => ({
      id: n.id,
      type: 'system',
      actorId: 'system',
      actorType: 'system',
      verb: n.type as ActivityVerb,
      objectId: n.id,
      objectType: 'post',
      data: n.data,
      importance: 'normal',
      visibility: 'private',
      createdAt: n.createdAt,
    }));

    return {
      id: `notifications:${userId}`,
      userId,
      type: 'notifications',
      activities,
      cursor,
      hasMore,
    };
  }

  async getFeedWithAggregation(
    userId: string,
    feedType: FeedType,
    options: PaginationOptions = {}
  ): Promise<FeedItem[]> {
    let feed: Feed;

    switch (feedType) {
      case 'home':
        feed = await this.getHomeFeed(userId, options);
        break;
      case 'user':
        feed = await this.getUserFeed(userId, options);
        break;
      case 'notifications':
        feed = await this.getNotificationsFeed(userId, options);
        break;
      default:
        feed = await this.getHomeFeed(userId, options);
    }

    const aggregatedItems = this.aggregator.aggregateActivities(feed.activities);

    const feedItems: FeedItem[] = await Promise.all(
      aggregatedItems.map(async (item) => {
        const isAggregated = 'actorCount' in item;
        const enrichedData = await this.enrichItem(item);

        return {
          activity: item,
          isAggregated,
          seen: true,
          read: true,
          enrichedData,
        };
      })
    );

    return feedItems;
  }

  async subscribe(
    subscriberId: string,
    targetId: string,
    targetType: 'user' | 'hashtag' | 'group'
  ): Promise<FeedSubscription> {
    const subscription: FeedSubscription = {
      id: `${subscriberId}:${targetType}:${targetId}`,
      subscriberId,
      targetId,
      targetType,
      feedType: 'following',
      createdAt: new Date(),
    };

    await this.redis.hset(
      `${this.subscriptionPrefix}${subscriberId}`,
      subscription.id,
      JSON.stringify(subscription)
    );

    await this.redis.sadd(
      `${this.subscriptionPrefix}followers:${targetId}`,
      subscriberId
    );

    return subscription;
  }

  async unsubscribe(
    subscriberId: string,
    targetId: string,
    targetType: 'user' | 'hashtag' | 'group'
  ): Promise<boolean> {
    const subscriptionId = `${subscriberId}:${targetType}:${targetId}`;

    await this.redis.hdel(
      `${this.subscriptionPrefix}${subscriberId}`,
      subscriptionId
    );

    await this.redis.srem(
      `${this.subscriptionPrefix}followers:${targetId}`,
      subscriberId
    );

    return true;
  }

  async getSubscriptions(subscriberId: string): Promise<FeedSubscription[]> {
    const data = await this.redis.hgetall(
      `${this.subscriptionPrefix}${subscriberId}`
    );

    return Object.values(data).map((d) => {
      const sub = JSON.parse(d);
      sub.createdAt = new Date(sub.createdAt);
      return sub;
    });
  }

  async getFollowerIds(userId: string): Promise<string[]> {
    return this.redis.smembers(`${this.subscriptionPrefix}followers:${userId}`);
  }

  async getFeedStats(userId: string): Promise<FeedStats> {
    const [activityCount, notificationCounts, lastActivity] = await Promise.all([
      this.activityManager.getActivityCount(userId),
      this.notificationManager.getCounts(userId),
      this.getLastActivity(userId),
    ]);

    return {
      userId,
      totalActivities: activityCount,
      unreadNotifications: notificationCounts.unread,
      unseenNotifications: notificationCounts.unseen,
      lastActivityAt: lastActivity?.createdAt,
    };
  }

  async markNotificationsSeen(userId: string): Promise<void> {
    await this.notificationManager.markAsSeen(userId);
  }

  async markNotificationsRead(
    userId: string,
    notificationIds: string[]
  ): Promise<void> {
    await this.notificationManager.markAsRead(userId, notificationIds);
  }

  registerEnricher(
    type: string,
    callback: EnricherCallback
  ): void {
    this.enricherCallbacks.set(type, callback);
  }

  getActivityManager(): ActivityManager {
    return this.activityManager;
  }

  getNotificationManager(): NotificationManager {
    return this.notificationManager;
  }

  getAggregator(): ActivityAggregator {
    return this.aggregator;
  }

  private async fanoutToFollowers(
    activity: Activity,
    followerIds: string[]
  ): Promise<void> {
    if (activity.visibility === 'private') return;

    const pipeline = this.redis.pipeline();

    for (const followerId of followerIds) {
      pipeline.zadd(
        `${this.homeFeedPrefix}${followerId}`,
        activity.createdAt.getTime(),
        activity.id
      );
    }

    await pipeline.exec();

    for (const followerId of followerIds) {
      const feedSize = await this.redis.zcard(`${this.homeFeedPrefix}${followerId}`);
      if (feedSize > this.config.maxFeedSize) {
        await this.redis.zremrangebyrank(
          `${this.homeFeedPrefix}${followerId}`,
          0,
          feedSize - this.config.maxFeedSize - 1
        );
      }
    }
  }

  private async getLastActivity(userId: string): Promise<Activity | null> {
    const { activities } = await this.activityManager.getUserActivities(userId, {
      limit: 1,
    });
    return activities[0] || null;
  }

  private async enrichItem(
    item: Activity | AggregatedActivity
  ): Promise<EnrichedData | undefined> {
    const enrichedData: EnrichedData = {};

    if ('actorCount' in item) {
      const actorEnricher = this.enricherCallbacks.get('user');
      if (actorEnricher) {
        const actors: UserSummary[] = [];
        for (const actorId of item.actorIds.slice(0, 3)) {
          const actorData = await actorEnricher(actorId);
          if (actorData) actors.push(actorData as UserSummary);
        }
        enrichedData.actors = actors;
      }
    } else {
      const actorEnricher = this.enricherCallbacks.get('user');
      if (actorEnricher) {
        enrichedData.actor = await actorEnricher(item.actorId) as UserSummary;
      }
    }

    const activity = 'actorCount' in item ? item.activities[0] : item;
    const objectEnricher = this.enricherCallbacks.get(activity.objectType);
    if (objectEnricher) {
      enrichedData.object = await objectEnricher(activity.objectId) as ContentSummary;
    }

    if (activity.targetId && activity.targetType) {
      const targetEnricher = this.enricherCallbacks.get(activity.targetType);
      if (targetEnricher) {
        enrichedData.target = await targetEnricher(activity.targetId) as ContentSummary | UserSummary;
      }
    }

    return Object.keys(enrichedData).length > 0 ? enrichedData : undefined;
  }
}

type EnricherCallback = (id: string) => Promise<UserSummary | ContentSummary | null>;
