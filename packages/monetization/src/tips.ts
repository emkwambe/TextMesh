import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { TipConfig, Tip, Amount } from './types';
import { WalletService } from './wallet';

const DEFAULT_CONFIG: TipConfig = {
  enabled: true,
  presetAmounts: [
    { value: 100, currency: 'credits' },
    { value: 500, currency: 'credits' },
    { value: 1000, currency: 'credits' },
    { value: 5000, currency: 'credits' },
  ],
  customAmountEnabled: true,
  minAmount: { value: 50, currency: 'credits' },
  maxAmount: { value: 100000, currency: 'credits' },
  platformFeePercent: 10,
};

export class TipService {
  private redis: Redis;
  private wallet: WalletService;
  private config: TipConfig;
  private readonly tipPrefix = 'monetization:tip:';
  private readonly sentPrefix = 'monetization:tips_sent:';
  private readonly receivedPrefix = 'monetization:tips_received:';

  constructor(
    redis: Redis,
    wallet: WalletService,
    config?: Partial<TipConfig>
  ) {
    this.redis = redis;
    this.wallet = wallet;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async sendTip(
    senderId: string,
    recipientId: string,
    amount: Amount,
    options: {
      contentId?: string;
      message?: string;
      isAnonymous?: boolean;
    } = {}
  ): Promise<Tip> {
    if (!this.config.enabled) {
      throw new Error('Tips are currently disabled');
    }

    // Validate amount
    if (amount.value < this.config.minAmount.value) {
      throw new Error(`Minimum tip amount is ${this.config.minAmount.value} ${this.config.minAmount.currency}`);
    }

    if (amount.value > this.config.maxAmount.value) {
      throw new Error(`Maximum tip amount is ${this.config.maxAmount.value} ${this.config.maxAmount.currency}`);
    }

    if (senderId === recipientId) {
      throw new Error('Cannot tip yourself');
    }

    // Calculate fees
    const platformFee = Math.floor(amount.value * (this.config.platformFeePercent / 100));
    const creatorReceived = amount.value - platformFee;

    // Debit sender
    await this.wallet.debit(
      senderId,
      amount,
      `Tip to ${options.isAnonymous ? 'creator' : recipientId}`,
      undefined,
      'tip'
    );

    // Credit recipient
    await this.wallet.credit(
      recipientId,
      { value: creatorReceived, currency: amount.currency },
      `Tip from ${options.isAnonymous ? 'anonymous' : senderId}`,
      undefined,
      'tip'
    );

    const tip: Tip = {
      id: uuidv4(),
      senderId,
      recipientId,
      contentId: options.contentId,
      amount,
      message: options.message,
      isAnonymous: options.isAnonymous || false,
      platformFee: { value: platformFee, currency: amount.currency },
      creatorReceived: { value: creatorReceived, currency: amount.currency },
      status: 'completed',
      createdAt: new Date(),
    };

    // Save tip
    await this.saveTip(tip);

    // Record platform revenue
    await this.recordPlatformRevenue(platformFee);

    return tip;
  }

  async getTip(tipId: string): Promise<Tip | null> {
    const data = await this.redis.get(`${this.tipPrefix}${tipId}`);
    if (!data) return null;

    const tip = JSON.parse(data);
    tip.createdAt = new Date(tip.createdAt);
    return tip;
  }

  async getTipsSent(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Tip[]> {
    const { limit = 50, offset = 0 } = options;

    const tipIds = await this.redis.lrange(
      `${this.sentPrefix}${userId}`,
      offset,
      offset + limit - 1
    );

    const tips: Tip[] = [];
    for (const id of tipIds) {
      const tip = await this.getTip(id);
      if (tip) tips.push(tip);
    }

    return tips;
  }

  async getTipsReceived(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Tip[]> {
    const { limit = 50, offset = 0 } = options;

    const tipIds = await this.redis.lrange(
      `${this.receivedPrefix}${userId}`,
      offset,
      offset + limit - 1
    );

    const tips: Tip[] = [];
    for (const id of tipIds) {
      const tip = await this.getTip(id);
      if (tip) {
        // Mask sender if anonymous
        if (tip.isAnonymous) {
          tip.senderId = 'anonymous';
        }
        tips.push(tip);
      }
    }

    return tips;
  }

  async getContentTips(contentId: string): Promise<{
    totalAmount: number;
    tipCount: number;
    topTippers: Array<{ userId: string; amount: number }>;
  }> {
    const statsKey = `monetization:content_tips:${contentId}`;
    const data = await this.redis.hgetall(statsKey);

    const topTippers: Array<{ userId: string; amount: number }> = [];

    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith('tipper:')) {
        const userId = field.replace('tipper:', '');
        topTippers.push({ userId, amount: parseFloat(value) });
      }
    }

    topTippers.sort((a, b) => b.amount - a.amount);

    return {
      totalAmount: parseFloat(data.total || '0'),
      tipCount: parseInt(data.count || '0'),
      topTippers: topTippers.slice(0, 10),
    };
  }

  async getTipStats(userId: string): Promise<{
    totalSent: number;
    totalReceived: number;
    tipsSentCount: number;
    tipsReceivedCount: number;
    topRecipients: Array<{ userId: string; amount: number }>;
    topSenders: Array<{ userId: string; amount: number }>;
  }> {
    const sentStats = await this.redis.hgetall(`monetization:tip_stats_sent:${userId}`);
    const receivedStats = await this.redis.hgetall(`monetization:tip_stats_received:${userId}`);

    const topRecipients: Array<{ userId: string; amount: number }> = [];
    const topSenders: Array<{ userId: string; amount: number }> = [];

    for (const [field, value] of Object.entries(sentStats)) {
      if (field.startsWith('to:')) {
        topRecipients.push({
          userId: field.replace('to:', ''),
          amount: parseFloat(value),
        });
      }
    }

    for (const [field, value] of Object.entries(receivedStats)) {
      if (field.startsWith('from:') && field !== 'from:anonymous') {
        topSenders.push({
          userId: field.replace('from:', ''),
          amount: parseFloat(value),
        });
      }
    }

    topRecipients.sort((a, b) => b.amount - a.amount);
    topSenders.sort((a, b) => b.amount - a.amount);

    return {
      totalSent: parseFloat(sentStats.total || '0'),
      totalReceived: parseFloat(receivedStats.total || '0'),
      tipsSentCount: parseInt(sentStats.count || '0'),
      tipsReceivedCount: parseInt(receivedStats.count || '0'),
      topRecipients: topRecipients.slice(0, 5),
      topSenders: topSenders.slice(0, 5),
    };
  }

  getPresetAmounts(): Amount[] {
    return this.config.presetAmounts;
  }

  private async saveTip(tip: Tip): Promise<void> {
    // Save tip
    await this.redis.set(
      `${this.tipPrefix}${tip.id}`,
      JSON.stringify(tip),
      'EX',
      86400 * 365 // 1 year
    );

    // Add to sent list
    await this.redis.lpush(`${this.sentPrefix}${tip.senderId}`, tip.id);
    await this.redis.ltrim(`${this.sentPrefix}${tip.senderId}`, 0, 999);

    // Add to received list
    await this.redis.lpush(`${this.receivedPrefix}${tip.recipientId}`, tip.id);
    await this.redis.ltrim(`${this.receivedPrefix}${tip.recipientId}`, 0, 999);

    // Update content tips if applicable
    if (tip.contentId) {
      const contentKey = `monetization:content_tips:${tip.contentId}`;
      await this.redis.hincrbyfloat(contentKey, 'total', tip.amount.value);
      await this.redis.hincrby(contentKey, 'count', 1);
      if (!tip.isAnonymous) {
        await this.redis.hincrbyfloat(contentKey, `tipper:${tip.senderId}`, tip.amount.value);
      }
    }

    // Update user stats
    await this.redis.hincrbyfloat(`monetization:tip_stats_sent:${tip.senderId}`, 'total', tip.amount.value);
    await this.redis.hincrby(`monetization:tip_stats_sent:${tip.senderId}`, 'count', 1);
    await this.redis.hincrbyfloat(`monetization:tip_stats_sent:${tip.senderId}`, `to:${tip.recipientId}`, tip.amount.value);

    await this.redis.hincrbyfloat(`monetization:tip_stats_received:${tip.recipientId}`, 'total', tip.creatorReceived.value);
    await this.redis.hincrby(`monetization:tip_stats_received:${tip.recipientId}`, 'count', 1);
    const senderKey = tip.isAnonymous ? 'anonymous' : tip.senderId;
    await this.redis.hincrbyfloat(`monetization:tip_stats_received:${tip.recipientId}`, `from:${senderKey}`, tip.creatorReceived.value);
  }

  private async recordPlatformRevenue(amount: number): Promise<void> {
    const dateKey = new Date().toISOString().split('T')[0];
    const key = `monetization:platform_revenue:${dateKey}`;
    await this.redis.hincrbyfloat(key, 'tipFees', amount);
  }
}
