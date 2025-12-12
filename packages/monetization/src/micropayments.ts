import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  MicropaymentConfig,
  ReadSession,
  MicropaymentSummary,
  Amount,
} from './types';
import { WalletService } from './wallet';

const DEFAULT_CONFIG: MicropaymentConfig = {
  enabled: true,
  ratePerMinute: { value: 0.1, currency: 'credits' }, // 0.1 credits per minute
  minPayout: { value: 100, currency: 'credits' }, // Min 100 credits to payout
  platformFeePercent: 15,
  creatorSharePercent: 85,
};

export class MicropaymentService {
  private redis: Redis;
  private wallet: WalletService;
  private config: MicropaymentConfig;
  private readonly sessionPrefix = 'monetization:read_session:';
  private readonly summaryPrefix = 'monetization:micropay_summary:';
  private readonly pendingPrefix = 'monetization:micropay_pending:';

  constructor(
    redis: Redis,
    wallet: WalletService,
    config?: Partial<MicropaymentConfig>
  ) {
    this.redis = redis;
    this.wallet = wallet;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startReadSession(
    readerId: string,
    contentId: string,
    authorId: string
  ): Promise<ReadSession> {
    const session: ReadSession = {
      id: uuidv4(),
      readerId,
      contentId,
      authorId,
      startTime: new Date(),
      totalSeconds: 0,
      earnedAmount: { value: 0, currency: this.config.ratePerMinute.currency },
      settled: false,
    };

    await this.redis.set(
      `${this.sessionPrefix}${session.id}`,
      JSON.stringify(session),
      'EX',
      3600 // 1 hour max session
    );

    return session;
  }

  async updateReadSession(
    sessionId: string,
    additionalSeconds: number
  ): Promise<ReadSession> {
    const data = await this.redis.get(`${this.sessionPrefix}${sessionId}`);
    if (!data) throw new Error('Session not found');

    const session: ReadSession = JSON.parse(data);
    session.totalSeconds += additionalSeconds;

    // Calculate earnings
    const minutes = session.totalSeconds / 60;
    const earned = Math.floor(minutes * this.config.ratePerMinute.value);
    session.earnedAmount = {
      value: earned,
      currency: this.config.ratePerMinute.currency,
    };

    await this.redis.set(
      `${this.sessionPrefix}${sessionId}`,
      JSON.stringify(session),
      'EX',
      3600
    );

    return session;
  }

  async endReadSession(sessionId: string): Promise<ReadSession> {
    const data = await this.redis.get(`${this.sessionPrefix}${sessionId}`);
    if (!data) throw new Error('Session not found');

    const session: ReadSession = JSON.parse(data);
    session.endTime = new Date();

    // Add to pending earnings for the author
    if (session.earnedAmount.value > 0) {
      await this.addPendingEarnings(session);
    }

    // Clean up session
    await this.redis.del(`${this.sessionPrefix}${sessionId}`);

    return session;
  }

  private async addPendingEarnings(session: ReadSession): Promise<void> {
    const key = `${this.pendingPrefix}${session.authorId}`;

    // Add to pending balance
    await this.redis.hincrbyfloat(key, 'total', session.earnedAmount.value);

    // Track content-level earnings
    await this.redis.hincrbyfloat(
      key,
      `content:${session.contentId}`,
      session.earnedAmount.value
    );

    // Track read time
    await this.redis.hincrby(key, 'totalSeconds', session.totalSeconds);
  }

  async settlePendingEarnings(authorId: string): Promise<{
    settled: boolean;
    amount: Amount;
    platformFee: Amount;
    creatorReceived: Amount;
  }> {
    const key = `${this.pendingPrefix}${authorId}`;
    const pending = await this.redis.hget(key, 'total');
    const totalPending = pending ? parseFloat(pending) : 0;

    if (totalPending < this.config.minPayout.value) {
      return {
        settled: false,
        amount: { value: totalPending, currency: this.config.ratePerMinute.currency },
        platformFee: { value: 0, currency: this.config.ratePerMinute.currency },
        creatorReceived: { value: 0, currency: this.config.ratePerMinute.currency },
      };
    }

    // Calculate fees
    const platformFee = Math.floor(totalPending * (this.config.platformFeePercent / 100));
    const creatorReceived = totalPending - platformFee;

    // Credit creator's wallet
    await this.wallet.credit(
      authorId,
      { value: creatorReceived, currency: this.config.ratePerMinute.currency },
      'Micropayment earnings settlement',
      undefined,
      'micropayment'
    );

    // Record platform revenue
    await this.recordPlatformRevenue(platformFee);

    // Clear pending
    await this.redis.del(key);

    // Update summary
    await this.updateSummary(authorId, totalPending, creatorReceived);

    return {
      settled: true,
      amount: { value: totalPending, currency: this.config.ratePerMinute.currency },
      platformFee: { value: platformFee, currency: this.config.ratePerMinute.currency },
      creatorReceived: { value: creatorReceived, currency: this.config.ratePerMinute.currency },
    };
  }

  async getPendingEarnings(authorId: string): Promise<{
    total: number;
    byContent: Record<string, number>;
    totalReadTime: number;
  }> {
    const key = `${this.pendingPrefix}${authorId}`;
    const data = await this.redis.hgetall(key);

    const byContent: Record<string, number> = {};
    let total = 0;
    let totalReadTime = 0;

    for (const [field, value] of Object.entries(data)) {
      if (field === 'total') {
        total = parseFloat(value);
      } else if (field === 'totalSeconds') {
        totalReadTime = parseInt(value);
      } else if (field.startsWith('content:')) {
        const contentId = field.replace('content:', '');
        byContent[contentId] = parseFloat(value);
      }
    }

    return { total, byContent, totalReadTime };
  }

  async getSummary(
    userId: string,
    period: 'daily' | 'weekly' | 'monthly' = 'monthly'
  ): Promise<MicropaymentSummary | null> {
    const dateKey = this.getDateKey(period);
    const key = `${this.summaryPrefix}${userId}:${period}:${dateKey}`;
    const data = await this.redis.get(key);

    if (!data) return null;
    return JSON.parse(data);
  }

  async getContentEarnings(
    contentId: string
  ): Promise<{
    totalReadTime: number;
    totalEarned: number;
    uniqueReaders: number;
  }> {
    const statsKey = `monetization:content_stats:${contentId}`;
    const data = await this.redis.hgetall(statsKey);

    return {
      totalReadTime: parseInt(data.readTime || '0'),
      totalEarned: parseFloat(data.earned || '0'),
      uniqueReaders: parseInt(data.readers || '0'),
    };
  }

  private async updateSummary(
    userId: string,
    totalEarned: number,
    creatorReceived: number
  ): Promise<void> {
    const dateKey = this.getDateKey('daily');
    const key = `${this.summaryPrefix}${userId}:daily:${dateKey}`;

    const existing = await this.redis.get(key);
    const summary: MicropaymentSummary = existing
      ? JSON.parse(existing)
      : {
          userId,
          period: 'daily',
          date: dateKey,
          totalReadTime: 0,
          totalEarned: { value: 0, currency: this.config.ratePerMinute.currency },
          totalPaid: { value: 0, currency: this.config.ratePerMinute.currency },
          contentBreakdown: [],
        };

    summary.totalEarned.value += totalEarned;
    summary.totalPaid.value += creatorReceived;

    await this.redis.set(key, JSON.stringify(summary), 'EX', 86400 * 90); // 90 days
  }

  private async recordPlatformRevenue(amount: number): Promise<void> {
    const dateKey = new Date().toISOString().split('T')[0];
    const key = `monetization:platform_revenue:${dateKey}`;
    await this.redis.hincrbyfloat(key, 'micropaymentFees', amount);
  }

  private getDateKey(period: 'daily' | 'weekly' | 'monthly'): string {
    const now = new Date();
    if (period === 'daily') {
      return now.toISOString().split('T')[0];
    } else if (period === 'weekly') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      return `week_${weekStart.toISOString().split('T')[0]}`;
    } else {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }
}
