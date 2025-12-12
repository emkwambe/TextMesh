import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  ContentItem,
  ContentStatus,
  ContentFlag,
  AdminAction,
} from './types';

export class ContentManagementService {
  private redis: Redis;
  private readonly contentPrefix = 'admin:content:';
  private readonly flaggedPrefix = 'admin:flagged:';
  private readonly actionLogPrefix = 'admin:action_log';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async getContent(contentId: string): Promise<ContentItem | null> {
    const data = await this.redis.get(`${this.contentPrefix}${contentId}`);
    if (!data) return null;
    return this.deserializeContent(data);
  }

  async searchContent(
    options: {
      query?: string;
      type?: 'post' | 'comment' | 'media';
      status?: ContentStatus;
      authorId?: string;
      flagged?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ content: ContentItem[]; total: number }> {
    const items: ContentItem[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.contentPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const content = this.deserializeContent(data);

          const matchesQuery =
            !options.query ||
            content.content.toLowerCase().includes(options.query.toLowerCase());
          const matchesType = !options.type || content.type === options.type;
          const matchesStatus = !options.status || content.status === options.status;
          const matchesAuthor = !options.authorId || content.authorId === options.authorId;
          const matchesFlagged =
            options.flagged === undefined ||
            (options.flagged ? content.flags.length > 0 : content.flags.length === 0);

          if (matchesQuery && matchesType && matchesStatus && matchesAuthor && matchesFlagged) {
            items.push(content);
          }
        }
      }
    } while (cursor !== '0');

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return {
      content: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  async getFlaggedContent(
    options: {
      flagType?: string;
      minReports?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ content: ContentItem[]; total: number }> {
    const flaggedIds = await this.redis.zrevrange(
      this.flaggedPrefix,
      0,
      -1,
      'WITHSCORES'
    );

    const items: ContentItem[] = [];

    for (let i = 0; i < flaggedIds.length; i += 2) {
      const contentId = flaggedIds[i];
      const reportCount = parseInt(flaggedIds[i + 1]);

      if (options.minReports && reportCount < options.minReports) continue;

      const content = await this.getContent(contentId);
      if (!content) continue;

      if (options.flagType && !content.flags.some((f) => f.type === options.flagType)) {
        continue;
      }

      items.push(content);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return {
      content: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  async removeContent(
    contentId: string,
    adminId: string,
    reason: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const content = await this.getContent(contentId);
    if (!content) return false;

    content.status = 'removed';
    content.moderatedAt = new Date();
    content.moderatedBy = adminId;
    await this.saveContent(content);

    await this.logAction({
      adminId,
      action: 'content_remove',
      targetType: 'content',
      targetId: contentId,
      details: {
        contentType: content.type,
        authorId: content.authorId,
        reason,
      },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async restoreContent(
    contentId: string,
    adminId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const content = await this.getContent(contentId);
    if (!content) return false;

    content.status = 'active';
    content.moderatedAt = new Date();
    content.moderatedBy = adminId;
    await this.saveContent(content);

    await this.logAction({
      adminId,
      action: 'content_restore',
      targetType: 'content',
      targetId: contentId,
      details: { contentType: content.type },
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async flagContent(
    contentId: string,
    adminId: string,
    flagType: string,
    reason: string,
    options: {
      confidence?: number;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const content = await this.getContent(contentId);
    if (!content) return false;

    const flag: ContentFlag = {
      type: flagType,
      reason,
      confidence: options.confidence,
      detectedAt: new Date(),
    };

    content.flags.push(flag);
    content.status = 'flagged';
    await this.saveContent(content);

    await this.redis.zincrby(this.flaggedPrefix, 1, contentId);

    await this.logAction({
      adminId,
      action: 'content_flag',
      targetType: 'content',
      targetId: contentId,
      details: { flagType, reason, confidence: options.confidence },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async unflagContent(
    contentId: string,
    adminId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const content = await this.getContent(contentId);
    if (!content) return false;

    content.flags.forEach((flag) => {
      if (!flag.reviewedAt) {
        flag.reviewedAt = new Date();
        flag.reviewedBy = adminId;
      }
    });

    content.status = 'active';
    await this.saveContent(content);

    await this.redis.zrem(this.flaggedPrefix, contentId);

    await this.logAction({
      adminId,
      action: 'content_unflag',
      targetType: 'content',
      targetId: contentId,
      details: {},
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async hideContent(
    contentId: string,
    adminId: string,
    reason: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const content = await this.getContent(contentId);
    if (!content) return false;

    content.status = 'hidden';
    content.moderatedAt = new Date();
    content.moderatedBy = adminId;
    await this.saveContent(content);

    await this.logAction({
      adminId,
      action: 'content_remove',
      targetType: 'content',
      targetId: contentId,
      details: { action: 'hide', reason },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async bulkRemoveContent(
    contentIds: string[],
    adminId: string,
    reason: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const contentId of contentIds) {
      const result = await this.removeContent(contentId, adminId, reason, options);
      if (result) success++;
      else failed++;
    }

    return { success, failed };
  }

  async getContentStats(): Promise<{
    total: number;
    active: number;
    hidden: number;
    removed: number;
    flagged: number;
    byType: Record<string, number>;
  }> {
    const stats = {
      total: 0,
      active: 0,
      hidden: 0,
      removed: 0,
      flagged: 0,
      byType: {} as Record<string, number>,
    };

    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.contentPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const content = this.deserializeContent(data);
          stats.total++;
          stats[content.status as keyof typeof stats]++;
          stats.byType[content.type] = (stats.byType[content.type] || 0) + 1;
        }
      }
    } while (cursor !== '0');

    return stats;
  }

  async getModerationQueue(limit: number = 50): Promise<ContentItem[]> {
    const { content } = await this.getFlaggedContent({ limit });
    return content.filter((c) => c.status === 'flagged');
  }

  private async logAction(
    data: Omit<AdminAction, 'id' | 'adminUsername' | 'createdAt'>
  ): Promise<void> {
    const action: AdminAction = {
      id: uuidv4(),
      adminUsername: data.adminId,
      ...data,
      createdAt: new Date(),
    };

    await this.redis.lpush(this.actionLogPrefix, JSON.stringify(action));
    await this.redis.lpush(
      `${this.actionLogPrefix}:content:${data.targetId}`,
      JSON.stringify(action)
    );
  }

  private async saveContent(content: ContentItem): Promise<void> {
    await this.redis.set(
      `${this.contentPrefix}${content.id}`,
      JSON.stringify(content)
    );
  }

  private deserializeContent(data: string): ContentItem {
    const content = JSON.parse(data);
    content.createdAt = new Date(content.createdAt);
    if (content.moderatedAt) content.moderatedAt = new Date(content.moderatedAt);
    content.flags = content.flags.map((f: ContentFlag) => ({
      ...f,
      detectedAt: new Date(f.detectedAt),
      reviewedAt: f.reviewedAt ? new Date(f.reviewedAt) : undefined,
    }));
    return content;
  }
}
