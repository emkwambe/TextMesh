import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  ModerationQueue,
  QueueType,
  QueueFilter,
  ModerationItem,
  ModerationSource,
  ItemPriority,
  ItemStatus,
  ModerationContext,
  ModerationDecision,
  ActionType,
} from './types';

export class QueueManager {
  private redis: Redis;
  private readonly queuePrefix = 'moderation:queue:';
  private readonly itemPrefix = 'moderation:item:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async createQueue(
    name: string,
    type: QueueType,
    options: {
      filters?: QueueFilter[];
      assignees?: string[];
      priority?: number;
    } = {}
  ): Promise<ModerationQueue> {
    const queue: ModerationQueue = {
      id: uuidv4(),
      name,
      type,
      filters: options.filters || [],
      assignees: options.assignees || [],
      priority: options.priority || 0,
      createdAt: new Date(),
    };

    await this.redis.set(`${this.queuePrefix}${queue.id}`, JSON.stringify(queue));

    return queue;
  }

  async getQueue(queueId: string): Promise<ModerationQueue | null> {
    const data = await this.redis.get(`${this.queuePrefix}${queueId}`);
    if (!data) return null;
    const queue = JSON.parse(data);
    queue.createdAt = new Date(queue.createdAt);
    return queue;
  }

  async listQueues(): Promise<ModerationQueue[]> {
    const queues: ModerationQueue[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.queuePrefix}????????-????-????-????-????????????`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const queue = JSON.parse(data);
          queue.createdAt = new Date(queue.createdAt);
          queues.push(queue);
        }
      }
    } while (cursor !== '0');

    return queues.sort((a, b) => b.priority - a.priority);
  }

  async addItem(
    queueId: string,
    contentType: 'post' | 'comment' | 'user' | 'media',
    contentId: string,
    userId: string,
    reason: string,
    source: ModerationSource,
    options: {
      priority?: ItemPriority;
      flags?: string[];
      context?: ModerationContext;
    } = {}
  ): Promise<ModerationItem> {
    const item: ModerationItem = {
      id: uuidv4(),
      queueId,
      contentType,
      contentId,
      userId,
      reason,
      source,
      priority: options.priority || this.calculatePriority(reason, source),
      status: 'pending',
      flags: options.flags || [],
      context: options.context || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveItem(item);

    const priorityScore = this.getPriorityScore(item.priority, item.createdAt);
    await this.redis.zadd(
      `${this.queuePrefix}${queueId}:items`,
      priorityScore,
      item.id
    );

    return item;
  }

  async getItem(itemId: string): Promise<ModerationItem | null> {
    const data = await this.redis.get(`${this.itemPrefix}${itemId}`);
    if (!data) return null;
    return this.deserializeItem(data);
  }

  async getQueueItems(
    queueId: string,
    options: {
      status?: ItemStatus;
      priority?: ItemPriority;
      assignedTo?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: ModerationItem[]; total: number }> {
    const itemIds = await this.redis.zrevrange(
      `${this.queuePrefix}${queueId}:items`,
      0,
      -1
    );

    const items: ModerationItem[] = [];

    for (const id of itemIds) {
      const item = await this.getItem(id);
      if (!item) continue;

      if (options.status && item.status !== options.status) continue;
      if (options.priority && item.priority !== options.priority) continue;
      if (options.assignedTo && item.assignedTo !== options.assignedTo) continue;

      items.push(item);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  async assignItem(itemId: string, moderatorId: string): Promise<boolean> {
    const item = await this.getItem(itemId);
    if (!item) return false;

    item.assignedTo = moderatorId;
    item.status = 'in_review';
    item.updatedAt = new Date();
    await this.saveItem(item);

    return true;
  }

  async unassignItem(itemId: string): Promise<boolean> {
    const item = await this.getItem(itemId);
    if (!item) return false;

    item.assignedTo = undefined;
    item.status = 'pending';
    item.updatedAt = new Date();
    await this.saveItem(item);

    return true;
  }

  async completeItem(
    itemId: string,
    moderatorId: string,
    decision: ModerationDecision
  ): Promise<boolean> {
    const item = await this.getItem(itemId);
    if (!item) return false;

    item.status = 'completed';
    item.reviewedBy = moderatorId;
    item.decision = decision;
    item.reviewedAt = new Date();
    item.updatedAt = new Date();
    await this.saveItem(item);

    await this.redis.zrem(`${this.queuePrefix}${item.queueId}:items`, itemId);

    await this.redis.lpush(
      `moderation:completed:${item.queueId}`,
      JSON.stringify({
        itemId,
        moderatorId,
        decision,
        completedAt: new Date(),
      })
    );

    return true;
  }

  async escalateItem(
    itemId: string,
    moderatorId: string,
    reason: string,
    targetQueueId?: string
  ): Promise<boolean> {
    const item = await this.getItem(itemId);
    if (!item) return false;

    await this.redis.zrem(`${this.queuePrefix}${item.queueId}:items`, itemId);

    item.status = 'escalated';
    item.priority = 'critical';
    item.flags.push(`escalated:${reason}`);
    item.updatedAt = new Date();

    if (targetQueueId) {
      item.queueId = targetQueueId;
    }

    await this.saveItem(item);

    const priorityScore = this.getPriorityScore(item.priority, item.createdAt);
    await this.redis.zadd(
      `${this.queuePrefix}${item.queueId}:items`,
      priorityScore,
      item.id
    );

    return true;
  }

  async getQueueStats(queueId: string): Promise<{
    total: number;
    pending: number;
    inReview: number;
    completed: number;
    escalated: number;
    byPriority: Record<string, number>;
    averageWaitTime: number;
  }> {
    const { items } = await this.getQueueItems(queueId, { limit: 10000 });

    const stats = {
      total: items.length,
      pending: 0,
      inReview: 0,
      completed: 0,
      escalated: 0,
      byPriority: {} as Record<string, number>,
      averageWaitTime: 0,
    };

    let totalWaitTime = 0;
    let waitCount = 0;

    for (const item of items) {
      switch (item.status) {
        case 'pending':
          stats.pending++;
          totalWaitTime += Date.now() - item.createdAt.getTime();
          waitCount++;
          break;
        case 'in_review':
          stats.inReview++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'escalated':
          stats.escalated++;
          break;
      }

      stats.byPriority[item.priority] =
        (stats.byPriority[item.priority] || 0) + 1;
    }

    if (waitCount > 0) {
      stats.averageWaitTime = totalWaitTime / waitCount / 1000 / 60;
    }

    return stats;
  }

  async getModeratorItems(
    moderatorId: string,
    status?: ItemStatus
  ): Promise<ModerationItem[]> {
    const items: ModerationItem[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.itemPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const item = this.deserializeItem(data);
          if (
            item.assignedTo === moderatorId &&
            (!status || item.status === status)
          ) {
            items.push(item);
          }
        }
      }
    } while (cursor !== '0');

    return items;
  }

  private calculatePriority(reason: string, source: ModerationSource): ItemPriority {
    const criticalReasons = ['violence', 'self_harm', 'illegal', 'csam'];
    const highReasons = ['harassment', 'hate_speech', 'nudity'];

    if (criticalReasons.some((r) => reason.includes(r))) return 'critical';
    if (highReasons.some((r) => reason.includes(r))) return 'high';
    if (source === 'user_report') return 'medium';
    return 'low';
  }

  private getPriorityScore(priority: ItemPriority, createdAt: Date): number {
    const priorityWeights: Record<ItemPriority, number> = {
      critical: 4000000000000,
      high: 3000000000000,
      medium: 2000000000000,
      low: 1000000000000,
    };

    return priorityWeights[priority] + (Date.now() - createdAt.getTime());
  }

  private async saveItem(item: ModerationItem): Promise<void> {
    await this.redis.set(`${this.itemPrefix}${item.id}`, JSON.stringify(item));
  }

  private deserializeItem(data: string): ModerationItem {
    const item = JSON.parse(data);
    item.createdAt = new Date(item.createdAt);
    item.updatedAt = new Date(item.updatedAt);
    if (item.reviewedAt) item.reviewedAt = new Date(item.reviewedAt);
    return item;
  }
}
