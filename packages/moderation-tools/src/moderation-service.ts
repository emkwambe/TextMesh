import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { RuleEngine } from './rule-engine';
import { QueueManager } from './queue-manager';
import { WordFilterService } from './word-filter';
import {
  ModerationItem,
  ModerationDecision,
  ActionType,
  Appeal,
  AppealStatus,
  AppealDecision,
  AutoModConfig,
  BulkAction,
  ModerationStats,
} from './types';

const DEFAULT_AUTOMOD_CONFIG: AutoModConfig = {
  enabled: true,
  sensitivity: 'medium',
  actions: {
    spam: 'flag',
    harassment: 'flag',
    nsfw: 'flag',
    violence: 'quarantine',
    hate_speech: 'quarantine',
  },
  thresholds: {
    spam: 0.7,
    harassment: 0.8,
    nsfw: 0.6,
    violence: 0.7,
    hate_speech: 0.8,
  },
  exemptions: {
    verifiedUsers: true,
    trustedUsers: true,
    minTrustScore: 80,
  },
};

export class ModerationService {
  private redis: Redis;
  private ruleEngine: RuleEngine;
  private queueManager: QueueManager;
  private wordFilter: WordFilterService;
  private autoModConfig: AutoModConfig;
  private readonly appealPrefix = 'moderation:appeal:';
  private readonly bulkActionPrefix = 'moderation:bulk:';
  private readonly statsPrefix = 'moderation:stats:';

  constructor(redis: Redis, autoModConfig?: Partial<AutoModConfig>) {
    this.redis = redis;
    this.ruleEngine = new RuleEngine(redis);
    this.queueManager = new QueueManager(redis);
    this.wordFilter = new WordFilterService(redis);
    this.autoModConfig = { ...DEFAULT_AUTOMOD_CONFIG, ...autoModConfig };
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.ruleEngine.loadRules(),
      this.wordFilter.loadFilters(),
    ]);
  }

  async moderateContent(
    contentType: 'post' | 'comment' | 'media',
    contentId: string,
    userId: string,
    content: {
      text?: string;
      mediaUrls?: string[];
      metadata?: Record<string, unknown>;
    },
    options: {
      userTrustScore?: number;
      isVerified?: boolean;
      mlScores?: Record<string, number>;
    } = {}
  ): Promise<{
    allowed: boolean;
    actions: ActionType[];
    reasons: string[];
    queuedForReview: boolean;
    itemId?: string;
  }> {
    const results = {
      allowed: true,
      actions: [] as ActionType[],
      reasons: [] as string[],
      queuedForReview: false,
      itemId: undefined as string | undefined,
    };

    if (this.shouldExempt(options)) {
      return results;
    }

    if (content.text) {
      const filterResult = this.wordFilter.check(content.text, contentType);

      if (filterResult.blocked) {
        results.allowed = false;
        results.actions.push(...filterResult.actions);
        results.reasons.push('Blocked by word filter');
      } else if (filterResult.flagged) {
        results.actions.push(...filterResult.actions);
        results.reasons.push('Flagged by word filter');
      }
    }

    const ruleResult = this.ruleEngine.evaluate({
      contentType,
      text: content.text,
      mediaUrls: content.mediaUrls,
      userId,
      ...content.metadata,
      ...options,
    });

    if (ruleResult.matched) {
      results.actions.push(...ruleResult.actions.map((a) => a.type));
      results.reasons.push(
        ...ruleResult.rules.map((r) => `Rule: ${r.name}`)
      );
    }

    if (this.autoModConfig.enabled && options.mlScores) {
      const autoModResults = this.applyAutoMod(options.mlScores);
      results.actions.push(...autoModResults.actions);
      results.reasons.push(...autoModResults.reasons);
    }

    const shouldBlock = results.actions.some((a) =>
      ['remove', 'ban_user', 'shadow_ban'].includes(a)
    );
    const shouldQueue = results.actions.some((a) =>
      ['flag', 'quarantine', 'notify_moderator'].includes(a)
    );

    if (shouldBlock) {
      results.allowed = false;
    }

    if (shouldQueue) {
      const item = await this.queueManager.addItem(
        'default',
        contentType,
        contentId,
        userId,
        results.reasons.join('; '),
        'automated',
        {
          flags: results.reasons,
          context: {
            content: content.text,
            mediaUrls: content.mediaUrls,
            mlScores: options.mlScores,
          },
        }
      );

      results.queuedForReview = true;
      results.itemId = item.id;
    }

    await this.recordStats(results.actions, results.reasons);

    return results;
  }

  private shouldExempt(options: {
    userTrustScore?: number;
    isVerified?: boolean;
  }): boolean {
    if (!this.autoModConfig.enabled) return true;

    if (this.autoModConfig.exemptions.verifiedUsers && options.isVerified) {
      return true;
    }

    if (
      this.autoModConfig.exemptions.trustedUsers &&
      options.userTrustScore &&
      options.userTrustScore >= this.autoModConfig.exemptions.minTrustScore
    ) {
      return true;
    }

    return false;
  }

  private applyAutoMod(mlScores: Record<string, number>): {
    actions: ActionType[];
    reasons: string[];
  } {
    const actions: ActionType[] = [];
    const reasons: string[] = [];

    for (const [category, score] of Object.entries(mlScores)) {
      const threshold =
        this.autoModConfig.thresholds[category as keyof typeof this.autoModConfig.thresholds];
      const action =
        this.autoModConfig.actions[category as keyof typeof this.autoModConfig.actions];

      if (threshold && action && score >= threshold) {
        actions.push(action);
        reasons.push(`AutoMod: ${category} (${(score * 100).toFixed(1)}%)`);
      }
    }

    return { actions, reasons };
  }

  async submitAppeal(
    moderationItemId: string,
    userId: string,
    reason: string,
    evidence?: string[]
  ): Promise<Appeal> {
    const item = await this.queueManager.getItem(moderationItemId);
    if (!item) {
      throw new Error('Moderation item not found');
    }

    if (!item.decision?.appealable) {
      throw new Error('This decision cannot be appealed');
    }

    const appeal: Appeal = {
      id: uuidv4(),
      moderationItemId,
      userId,
      reason,
      evidence,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.redis.set(
      `${this.appealPrefix}${appeal.id}`,
      JSON.stringify(appeal)
    );

    await this.redis.zadd(
      `${this.appealPrefix}queue`,
      appeal.createdAt.getTime(),
      appeal.id
    );

    return appeal;
  }

  async getAppeal(appealId: string): Promise<Appeal | null> {
    const data = await this.redis.get(`${this.appealPrefix}${appealId}`);
    if (!data) return null;
    return this.deserializeAppeal(data);
  }

  async getAppealQueue(
    status?: AppealStatus,
    limit: number = 50
  ): Promise<Appeal[]> {
    const appealIds = await this.redis.zrange(`${this.appealPrefix}queue`, 0, -1);
    const appeals: Appeal[] = [];

    for (const id of appealIds) {
      const appeal = await this.getAppeal(id);
      if (appeal && (!status || appeal.status === status)) {
        appeals.push(appeal);
      }
    }

    return appeals.slice(0, limit);
  }

  async resolveAppeal(
    appealId: string,
    moderatorId: string,
    decision: Omit<AppealDecision, 'reviewedBy' | 'reviewedAt'>
  ): Promise<boolean> {
    const appeal = await this.getAppeal(appealId);
    if (!appeal) return false;

    appeal.status = decision.outcome === 'denied' ? 'denied' : 'approved';
    appeal.decision = {
      ...decision,
      reviewedBy: moderatorId,
      reviewedAt: new Date(),
    };
    appeal.resolvedAt = new Date();
    appeal.updatedAt = new Date();

    await this.redis.set(
      `${this.appealPrefix}${appealId}`,
      JSON.stringify(appeal)
    );

    await this.redis.zrem(`${this.appealPrefix}queue`, appealId);

    if (decision.outcome === 'overturned' || decision.outcome === 'modified') {
      const item = await this.queueManager.getItem(appeal.moderationItemId);
      if (item && decision.newAction) {
        item.decision = {
          action: decision.newAction,
          reason: `Appeal ${decision.outcome}: ${decision.reason}`,
          appealable: false,
        };
        await this.queueManager.completeItem(
          item.id,
          moderatorId,
          item.decision
        );
      }
    }

    return true;
  }

  async executeBulkAction(
    type: ActionType,
    targetIds: string[],
    targetType: 'content' | 'user',
    reason: string,
    executedBy: string
  ): Promise<BulkAction> {
    const bulkAction: BulkAction = {
      id: uuidv4(),
      type,
      targetIds,
      targetType,
      reason,
      executedBy,
      status: 'in_progress',
      progress: {
        total: targetIds.length,
        completed: 0,
        failed: 0,
      },
      createdAt: new Date(),
    };

    await this.redis.set(
      `${this.bulkActionPrefix}${bulkAction.id}`,
      JSON.stringify(bulkAction)
    );

    this.processBulkAction(bulkAction).catch(console.error);

    return bulkAction;
  }

  private async processBulkAction(bulkAction: BulkAction): Promise<void> {
    for (const targetId of bulkAction.targetIds) {
      try {
        bulkAction.progress.completed++;
      } catch {
        bulkAction.progress.failed++;
      }

      await this.redis.set(
        `${this.bulkActionPrefix}${bulkAction.id}`,
        JSON.stringify(bulkAction)
      );
    }

    bulkAction.status = 'completed';
    bulkAction.completedAt = new Date();
    await this.redis.set(
      `${this.bulkActionPrefix}${bulkAction.id}`,
      JSON.stringify(bulkAction)
    );
  }

  async getBulkAction(bulkActionId: string): Promise<BulkAction | null> {
    const data = await this.redis.get(`${this.bulkActionPrefix}${bulkActionId}`);
    if (!data) return null;

    const action = JSON.parse(data);
    action.createdAt = new Date(action.createdAt);
    if (action.completedAt) action.completedAt = new Date(action.completedAt);
    return action;
  }

  async getStats(period: string = 'today'): Promise<ModerationStats> {
    const statsKey = `${this.statsPrefix}${period}`;
    const data = await this.redis.hgetall(statsKey);

    return {
      period,
      itemsReviewed: parseInt(data.itemsReviewed || '0'),
      itemsApproved: parseInt(data.itemsApproved || '0'),
      itemsRemoved: parseInt(data.itemsRemoved || '0'),
      itemsEscalated: parseInt(data.itemsEscalated || '0'),
      averageReviewTime: parseFloat(data.averageReviewTime || '0'),
      byModerator: {},
      byReason: JSON.parse(data.byReason || '{}'),
      bySource: JSON.parse(data.bySource || '{}'),
      appealStats: {
        total: parseInt(data.appealsTotal || '0'),
        approved: parseInt(data.appealsApproved || '0'),
        denied: parseInt(data.appealsDenied || '0'),
        pending: parseInt(data.appealsPending || '0'),
      },
    };
  }

  private async recordStats(
    actions: ActionType[],
    reasons: string[]
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const statsKey = `${this.statsPrefix}${today}`;

    await this.redis.hincrby(statsKey, 'itemsReviewed', 1);

    if (actions.includes('remove')) {
      await this.redis.hincrby(statsKey, 'itemsRemoved', 1);
    }

    for (const reason of reasons) {
      const byReason = JSON.parse(
        (await this.redis.hget(statsKey, 'byReason')) || '{}'
      );
      byReason[reason] = (byReason[reason] || 0) + 1;
      await this.redis.hset(statsKey, 'byReason', JSON.stringify(byReason));
    }

    await this.redis.expire(statsKey, 86400 * 90);
  }

  async updateAutoModConfig(
    config: Partial<AutoModConfig>
  ): Promise<AutoModConfig> {
    this.autoModConfig = { ...this.autoModConfig, ...config };
    await this.redis.set(
      'moderation:automod_config',
      JSON.stringify(this.autoModConfig)
    );
    return this.autoModConfig;
  }

  getAutoModConfig(): AutoModConfig {
    return this.autoModConfig;
  }

  getRuleEngine(): RuleEngine {
    return this.ruleEngine;
  }

  getQueueManager(): QueueManager {
    return this.queueManager;
  }

  getWordFilter(): WordFilterService {
    return this.wordFilter;
  }

  private deserializeAppeal(data: string): Appeal {
    const appeal = JSON.parse(data);
    appeal.createdAt = new Date(appeal.createdAt);
    appeal.updatedAt = new Date(appeal.updatedAt);
    if (appeal.resolvedAt) appeal.resolvedAt = new Date(appeal.resolvedAt);
    if (appeal.decision?.reviewedAt) {
      appeal.decision.reviewedAt = new Date(appeal.decision.reviewedAt);
    }
    return appeal;
  }
}
