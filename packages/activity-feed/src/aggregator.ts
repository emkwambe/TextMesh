import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Activity,
  AggregatedActivity,
  FeedConfig,
} from './types';

const DEFAULT_CONFIG: Partial<FeedConfig> = {
  maxAggregationWindow: 3600000,
  maxAggregationSize: 50,
  enableAggregation: true,
};

export class ActivityAggregator {
  private redis: Redis;
  private config: FeedConfig;
  private readonly aggregationPrefix = 'feed:aggregation:';

  constructor(redis: Redis, config?: Partial<FeedConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config } as FeedConfig;
  }

  async aggregateActivity(
    userId: string,
    activity: Activity
  ): Promise<AggregatedActivity | null> {
    if (!this.config.enableAggregation || !activity.aggregationKey) {
      return null;
    }

    const aggregationKey = `${this.aggregationPrefix}${userId}:${activity.aggregationKey}`;

    const existingData = await this.redis.get(aggregationKey);
    let aggregated: AggregatedActivity;

    if (existingData) {
      aggregated = this.deserializeAggregation(existingData);

      const windowStart = new Date(
        aggregated.createdAt.getTime() + this.config.maxAggregationWindow
      );

      if (activity.createdAt > windowStart) {
        aggregated = this.createNewAggregation(activity);
      } else if (aggregated.activities.length < this.config.maxAggregationSize) {
        if (!aggregated.actorIds.includes(activity.actorId)) {
          aggregated.actorIds.push(activity.actorId);
          aggregated.actorCount = aggregated.actorIds.length;
        }
        aggregated.activities.push(activity);
        aggregated.lastActivityAt = activity.createdAt;
      }
    } else {
      aggregated = this.createNewAggregation(activity);
    }

    await this.redis.set(
      aggregationKey,
      JSON.stringify(aggregated),
      'EX',
      Math.ceil(this.config.maxAggregationWindow / 1000) * 2
    );

    return aggregated;
  }

  async getAggregation(
    userId: string,
    aggregationKey: string
  ): Promise<AggregatedActivity | null> {
    const key = `${this.aggregationPrefix}${userId}:${aggregationKey}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    return this.deserializeAggregation(data);
  }

  async getAggregationsForUser(userId: string): Promise<AggregatedActivity[]> {
    const pattern = `${this.aggregationPrefix}${userId}:*`;
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const pipeline = this.redis.pipeline();
    keys.forEach((key) => pipeline.get(key));
    const results = await pipeline.exec();

    const aggregations: AggregatedActivity[] = [];
    results?.forEach(([err, data]) => {
      if (!err && data) {
        aggregations.push(this.deserializeAggregation(data as string));
      }
    });

    return aggregations.sort(
      (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
    );
  }

  async clearAggregation(
    userId: string,
    aggregationKey: string
  ): Promise<boolean> {
    const key = `${this.aggregationPrefix}${userId}:${aggregationKey}`;
    const deleted = await this.redis.del(key);
    return deleted > 0;
  }

  async clearAllAggregations(userId: string): Promise<number> {
    const pattern = `${this.aggregationPrefix}${userId}:*`;
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length === 0) return 0;

    return this.redis.del(...keys);
  }

  aggregateActivities(activities: Activity[]): (Activity | AggregatedActivity)[] {
    const aggregationMap = new Map<string, Activity[]>();

    for (const activity of activities) {
      if (activity.aggregationKey) {
        const existing = aggregationMap.get(activity.aggregationKey) || [];
        existing.push(activity);
        aggregationMap.set(activity.aggregationKey, existing);
      }
    }

    const result: (Activity | AggregatedActivity)[] = [];
    const processedKeys = new Set<string>();

    for (const activity of activities) {
      if (activity.aggregationKey) {
        if (processedKeys.has(activity.aggregationKey)) continue;

        const group = aggregationMap.get(activity.aggregationKey)!;
        processedKeys.add(activity.aggregationKey);

        if (group.length > 1) {
          result.push(this.createAggregationFromGroup(group));
        } else {
          result.push(activity);
        }
      } else {
        result.push(activity);
      }
    }

    return result;
  }

  shouldAggregate(activity: Activity): boolean {
    const aggregatableVerbs = ['like', 'follow', 'comment', 'share', 'repost'];
    return (
      this.config.enableAggregation &&
      aggregatableVerbs.includes(activity.verb) &&
      !!activity.aggregationKey
    );
  }

  formatAggregationText(aggregation: AggregatedActivity): string {
    const { actorCount, verb, objectType } = aggregation;

    const verbTexts: Record<string, string> = {
      like: 'liked',
      follow: 'followed',
      comment: 'commented on',
      share: 'shared',
      repost: 'reposted',
    };

    const verbText = verbTexts[verb] || verb;

    if (actorCount === 1) {
      return `Someone ${verbText} your ${objectType}`;
    } else if (actorCount === 2) {
      return `2 people ${verbText} your ${objectType}`;
    } else {
      return `${actorCount} people ${verbText} your ${objectType}`;
    }
  }

  private createNewAggregation(activity: Activity): AggregatedActivity {
    return {
      id: uuidv4(),
      key: activity.aggregationKey!,
      activities: [activity],
      actorIds: [activity.actorId],
      actorCount: 1,
      verb: activity.verb,
      objectId: activity.objectId,
      objectType: activity.objectType,
      lastActivityAt: activity.createdAt,
      createdAt: activity.createdAt,
    };
  }

  private createAggregationFromGroup(activities: Activity[]): AggregatedActivity {
    const sorted = activities.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const first = sorted[sorted.length - 1];
    const last = sorted[0];

    const actorIds = [...new Set(activities.map((a) => a.actorId))];

    return {
      id: uuidv4(),
      key: first.aggregationKey!,
      activities: sorted,
      actorIds,
      actorCount: actorIds.length,
      verb: first.verb,
      objectId: first.objectId,
      objectType: first.objectType,
      lastActivityAt: last.createdAt,
      createdAt: first.createdAt,
    };
  }

  private deserializeAggregation(data: string): AggregatedActivity {
    const aggregation = JSON.parse(data);
    aggregation.createdAt = new Date(aggregation.createdAt);
    aggregation.lastActivityAt = new Date(aggregation.lastActivityAt);
    aggregation.activities = aggregation.activities.map((a: Activity) => ({
      ...a,
      createdAt: new Date(a.createdAt),
      expiresAt: a.expiresAt ? new Date(a.expiresAt) : undefined,
    }));
    return aggregation;
  }
}
