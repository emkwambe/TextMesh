import { Redis } from 'ioredis';
import {
  Amount,
  Currency,
  Wallet,
  WalletTransaction,
  Tip,
  SubscriptionTier,
  Subscription,
  Bounty,
  BountySubmission,
  ReadSession,
  PlatformRevenue,
} from './types';
import { WalletService } from './wallet';
import { MicropaymentService } from './micropayments';
import { TipService } from './tips';
import { SubscriptionService } from './subscriptions';
import { BountyService } from './bounties';

export interface MonetizationConfig {
  platformFeePercent?: number;
  micropayments?: {
    enabled?: boolean;
    ratePerMinute?: Amount;
  };
  tips?: {
    enabled?: boolean;
    minAmount?: Amount;
    maxAmount?: Amount;
  };
}

export class MonetizationService {
  private redis: Redis;
  private wallet: WalletService;
  private micropayments: MicropaymentService;
  private tips: TipService;
  private subscriptions: SubscriptionService;
  private bounties: BountyService;

  constructor(redis: Redis, config?: MonetizationConfig) {
    this.redis = redis;

    this.wallet = new WalletService(redis);
    this.micropayments = new MicropaymentService(redis, this.wallet, config?.micropayments);
    this.tips = new TipService(redis, this.wallet, config?.tips);
    this.subscriptions = new SubscriptionService(redis, this.wallet, config?.platformFeePercent);
    this.bounties = new BountyService(redis, this.wallet, config?.platformFeePercent);
  }

  // ============ WALLET ============

  async getWallet(userId: string): Promise<Wallet | null> {
    return this.wallet.getWallet(userId);
  }

  async getBalance(userId: string, currency?: Currency): Promise<number> {
    return this.wallet.getBalance(userId, currency);
  }

  async deposit(
    userId: string,
    amount: Amount,
    reference?: string
  ): Promise<WalletTransaction> {
    return this.wallet.credit(userId, amount, 'Deposit', reference, 'deposit');
  }

  async getTransactionHistory(
    userId: string,
    options?: { limit?: number; type?: WalletTransaction['type'] }
  ): Promise<WalletTransaction[]> {
    return this.wallet.getTransactionHistory(userId, options);
  }

  async getEarningsSummary(
    userId: string,
    period?: 'day' | 'week' | 'month'
  ): Promise<{ totalEarned: number; totalSpent: number; byType: Record<string, number> }> {
    return this.wallet.getEarningsSummary(userId, period);
  }

  // ============ MICROPAYMENTS ============

  async startReadSession(
    readerId: string,
    contentId: string,
    authorId: string
  ): Promise<ReadSession> {
    return this.micropayments.startReadSession(readerId, contentId, authorId);
  }

  async updateReadSession(sessionId: string, additionalSeconds: number): Promise<ReadSession> {
    return this.micropayments.updateReadSession(sessionId, additionalSeconds);
  }

  async endReadSession(sessionId: string): Promise<ReadSession> {
    return this.micropayments.endReadSession(sessionId);
  }

  async settleMicropayments(authorId: string): Promise<{
    settled: boolean;
    amount: Amount;
    creatorReceived: Amount;
  }> {
    return this.micropayments.settlePendingEarnings(authorId);
  }

  async getPendingMicropayments(authorId: string): Promise<{
    total: number;
    byContent: Record<string, number>;
  }> {
    return this.micropayments.getPendingEarnings(authorId);
  }

  // ============ TIPS ============

  async sendTip(
    senderId: string,
    recipientId: string,
    amount: Amount,
    options?: { contentId?: string; message?: string; isAnonymous?: boolean }
  ): Promise<Tip> {
    return this.tips.sendTip(senderId, recipientId, amount, options);
  }

  async getTipsReceived(userId: string, options?: { limit?: number }): Promise<Tip[]> {
    return this.tips.getTipsReceived(userId, options);
  }

  async getTipsSent(userId: string, options?: { limit?: number }): Promise<Tip[]> {
    return this.tips.getTipsSent(userId, options);
  }

  async getContentTips(contentId: string): Promise<{
    totalAmount: number;
    tipCount: number;
  }> {
    return this.tips.getContentTips(contentId);
  }

  getTipPresets(): Amount[] {
    return this.tips.getPresetAmounts();
  }

  // ============ SUBSCRIPTIONS ============

  async createSubscriptionTier(
    creatorId: string,
    tier: Omit<SubscriptionTier, 'id' | 'creatorId' | 'isActive' | 'createdAt'>
  ): Promise<SubscriptionTier> {
    return this.subscriptions.createTier(creatorId, tier);
  }

  async getCreatorTiers(creatorId: string): Promise<SubscriptionTier[]> {
    return this.subscriptions.getCreatorTiers(creatorId);
  }

  async subscribe(subscriberId: string, tierId: string): Promise<Subscription> {
    const result = await this.subscriptions.subscribe(subscriberId, tierId);
    return result.subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return this.subscriptions.cancelSubscription(subscriptionId);
  }

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return this.subscriptions.getUserSubscriptions(userId);
  }

  async getCreatorSubscribers(creatorId: string): Promise<Subscription[]> {
    return this.subscriptions.getCreatorSubscribers(creatorId, { status: 'active' });
  }

  async isSubscribed(subscriberId: string, creatorId: string): Promise<boolean> {
    return this.subscriptions.isSubscribed(subscriberId, creatorId);
  }

  async getSubscriptionStats(creatorId: string): Promise<{
    totalSubscribers: number;
    activeSubscribers: number;
    monthlyRecurringRevenue: number;
  }> {
    return this.subscriptions.getCreatorStats(creatorId);
  }

  // ============ BOUNTIES ============

  async createBounty(
    creatorId: string,
    bounty: Omit<Bounty, 'id' | 'creatorId' | 'escrowedAmount' | 'status' | 'platformFeePercent' | 'createdAt' | 'updatedAt'>
  ): Promise<Bounty> {
    return this.bounties.createBounty(creatorId, bounty);
  }

  async getBounty(bountyId: string): Promise<Bounty | null> {
    return this.bounties.getBounty(bountyId);
  }

  async submitToBounty(
    bountyId: string,
    submitterId: string,
    content: string,
    attachments?: string[]
  ): Promise<BountySubmission> {
    return this.bounties.submitToBounty(bountyId, submitterId, content, attachments);
  }

  async acceptBountySubmission(
    bountyId: string,
    submissionId: string,
    feedback?: string
  ): Promise<Bounty> {
    const result = await this.bounties.acceptSubmission(bountyId, submissionId, feedback);
    return result.bounty;
  }

  async getOpenBounties(options?: {
    category?: string;
    minAmount?: number;
    skills?: string[];
  }): Promise<Bounty[]> {
    return this.bounties.getOpenBounties(options);
  }

  async getUserBounties(
    userId: string,
    type: 'created' | 'submitted' | 'won'
  ): Promise<Bounty[]> {
    return this.bounties.getUserBounties(userId, type);
  }

  // ============ PLATFORM ANALYTICS ============

  async getPlatformRevenue(date?: string): Promise<PlatformRevenue> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const key = `monetization:platform_revenue:${targetDate}`;

    const data = await this.redis.hgetall(key);

    const micropaymentFees = parseFloat(data.micropaymentFees || '0');
    const tipFees = parseFloat(data.tipFees || '0');
    const subscriptionFees = parseFloat(data.subscriptionFees || '0');
    const bountyFees = parseFloat(data.bountyFees || '0');

    return {
      period: targetDate,
      micropaymentFees: { value: micropaymentFees, currency: 'credits' },
      tipFees: { value: tipFees, currency: 'credits' },
      subscriptionFees: { value: subscriptionFees, currency: 'credits' },
      bountyFees: { value: bountyFees, currency: 'credits' },
      totalRevenue: {
        value: micropaymentFees + tipFees + subscriptionFees + bountyFees,
        currency: 'credits',
      },
    };
  }

  async getRevenueHistory(days: number = 30): Promise<PlatformRevenue[]> {
    const history: PlatformRevenue[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];

      const revenue = await this.getPlatformRevenue(dateKey);
      history.push(revenue);
    }

    return history;
  }

  // ============ USER DASHBOARD ============

  async getUserMonetizationDashboard(userId: string): Promise<{
    wallet: {
      balance: number;
      pendingEarnings: number;
      lifetimeEarnings: number;
    };
    earnings: {
      micropayments: number;
      tips: number;
      subscriptions: number;
      bounties: number;
    };
    stats: {
      subscriberCount: number;
      monthlyRecurring: number;
      activeBounties: number;
    };
  }> {
    const [wallet, pending, tipStats, subStats, bountyStats, earnings] = await Promise.all([
      this.wallet.getOrCreateWallet(userId),
      this.micropayments.getPendingEarnings(userId),
      this.tips.getTipStats(userId),
      this.subscriptions.getCreatorStats(userId),
      this.bounties.getBountyStats(userId),
      this.wallet.getEarningsSummary(userId, 'month'),
    ]);

    return {
      wallet: {
        balance: wallet.balances.credits,
        pendingEarnings: pending.total,
        lifetimeEarnings: wallet.lifetimeEarnings,
      },
      earnings: {
        micropayments: earnings.byType.micropayment || 0,
        tips: earnings.byType.tip || 0,
        subscriptions: earnings.byType.subscription || 0,
        bounties: earnings.byType.bounty || 0,
      },
      stats: {
        subscriberCount: subStats.activeSubscribers,
        monthlyRecurring: subStats.monthlyRecurringRevenue,
        activeBounties: bountyStats.created - bountyStats.completed,
      },
    };
  }

  // Service getters
  getWalletService(): WalletService {
    return this.wallet;
  }

  getMicropaymentService(): MicropaymentService {
    return this.micropayments;
  }

  getTipService(): TipService {
    return this.tips;
  }

  getSubscriptionService(): SubscriptionService {
    return this.subscriptions;
  }

  getBountyService(): BountyService {
    return this.bounties;
  }
}
