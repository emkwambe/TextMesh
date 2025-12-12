import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  SubscriptionTier,
  Subscription,
  SubscriptionPayment,
  Amount,
} from './types';
import { WalletService } from './wallet';

const DEFAULT_PLATFORM_FEE = 15; // 15%

export class SubscriptionService {
  private redis: Redis;
  private wallet: WalletService;
  private platformFeePercent: number;
  private readonly tierPrefix = 'monetization:tier:';
  private readonly subPrefix = 'monetization:subscription:';
  private readonly creatorTiersPrefix = 'monetization:creator_tiers:';
  private readonly creatorSubsPrefix = 'monetization:creator_subs:';
  private readonly userSubsPrefix = 'monetization:user_subs:';

  constructor(
    redis: Redis,
    wallet: WalletService,
    platformFeePercent?: number
  ) {
    this.redis = redis;
    this.wallet = wallet;
    this.platformFeePercent = platformFeePercent || DEFAULT_PLATFORM_FEE;
  }

  // Tier management
  async createTier(
    creatorId: string,
    tier: Omit<SubscriptionTier, 'id' | 'creatorId' | 'isActive' | 'createdAt'>
  ): Promise<SubscriptionTier> {
    const newTier: SubscriptionTier = {
      id: uuidv4(),
      creatorId,
      ...tier,
      isActive: true,
      createdAt: new Date(),
    };

    await this.redis.set(
      `${this.tierPrefix}${newTier.id}`,
      JSON.stringify(newTier)
    );

    await this.redis.sadd(`${this.creatorTiersPrefix}${creatorId}`, newTier.id);

    return newTier;
  }

  async updateTier(
    tierId: string,
    updates: Partial<Pick<SubscriptionTier, 'name' | 'description' | 'benefits' | 'maxSubscribers' | 'isActive'>>
  ): Promise<SubscriptionTier | null> {
    const tier = await this.getTier(tierId);
    if (!tier) return null;

    Object.assign(tier, updates);

    await this.redis.set(`${this.tierPrefix}${tierId}`, JSON.stringify(tier));

    return tier;
  }

  async getTier(tierId: string): Promise<SubscriptionTier | null> {
    const data = await this.redis.get(`${this.tierPrefix}${tierId}`);
    if (!data) return null;

    const tier = JSON.parse(data);
    tier.createdAt = new Date(tier.createdAt);
    return tier;
  }

  async getCreatorTiers(creatorId: string): Promise<SubscriptionTier[]> {
    const tierIds = await this.redis.smembers(`${this.creatorTiersPrefix}${creatorId}`);

    const tiers: SubscriptionTier[] = [];
    for (const id of tierIds) {
      const tier = await this.getTier(id);
      if (tier && tier.isActive) {
        tiers.push(tier);
      }
    }

    return tiers.sort((a, b) => a.price.value - b.price.value);
  }

  // Subscription management
  async subscribe(
    subscriberId: string,
    tierId: string
  ): Promise<{ subscription: Subscription; payment: SubscriptionPayment }> {
    const tier = await this.getTier(tierId);
    if (!tier || !tier.isActive) {
      throw new Error('Subscription tier not found or inactive');
    }

    // Check if already subscribed
    const existing = await this.getActiveSubscription(subscriberId, tier.creatorId);
    if (existing) {
      throw new Error('Already subscribed to this creator');
    }

    // Check max subscribers
    if (tier.maxSubscribers) {
      const count = await this.getTierSubscriberCount(tierId);
      if (count >= tier.maxSubscribers) {
        throw new Error('This tier has reached maximum subscribers');
      }
    }

    // Calculate period
    const now = new Date();
    const periodEnd = new Date(now);
    if (tier.billingPeriod === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // Process payment
    const payment = await this.processPayment(
      subscriberId,
      tier.creatorId,
      tier.price,
      now,
      periodEnd
    );

    // Create subscription
    const subscription: Subscription = {
      id: uuidv4(),
      subscriberId,
      creatorId: tier.creatorId,
      tierId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      platformFeePercent: this.platformFeePercent,
      createdAt: now,
    };

    await this.saveSubscription(subscription);

    // Link payment to subscription
    payment.subscriptionId = subscription.id;
    await this.savePayment(payment);

    return { subscription, payment };
  }

  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.cancelledAt = new Date();

    if (immediate) {
      subscription.status = 'cancelled';
    } else {
      // Let it expire at end of period
      subscription.status = 'cancelled';
    }

    await this.saveSubscription(subscription);

    return subscription;
  }

  async renewSubscription(subscriptionId: string): Promise<SubscriptionPayment | null> {
    const subscription = await this.getSubscription(subscriptionId);
    if (!subscription || subscription.status !== 'active') {
      return null;
    }

    const tier = await this.getTier(subscription.tierId);
    if (!tier) return null;

    // Check if renewal is due
    const now = new Date();
    if (now < subscription.currentPeriodEnd) {
      return null; // Not due yet
    }

    // Calculate new period
    const newPeriodStart = subscription.currentPeriodEnd;
    const newPeriodEnd = new Date(newPeriodStart);
    if (tier.billingPeriod === 'monthly') {
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    } else {
      newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
    }

    try {
      const payment = await this.processPayment(
        subscription.subscriberId,
        subscription.creatorId,
        tier.price,
        newPeriodStart,
        newPeriodEnd
      );

      payment.subscriptionId = subscriptionId;
      await this.savePayment(payment);

      // Update subscription period
      subscription.currentPeriodStart = newPeriodStart;
      subscription.currentPeriodEnd = newPeriodEnd;
      await this.saveSubscription(subscription);

      return payment;
    } catch (error) {
      // Payment failed - mark subscription as expired
      subscription.status = 'expired';
      await this.saveSubscription(subscription);
      return null;
    }
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const data = await this.redis.get(`${this.subPrefix}${subscriptionId}`);
    if (!data) return null;

    const sub = JSON.parse(data);
    sub.currentPeriodStart = new Date(sub.currentPeriodStart);
    sub.currentPeriodEnd = new Date(sub.currentPeriodEnd);
    sub.createdAt = new Date(sub.createdAt);
    if (sub.cancelledAt) sub.cancelledAt = new Date(sub.cancelledAt);
    return sub;
  }

  async getActiveSubscription(
    subscriberId: string,
    creatorId: string
  ): Promise<Subscription | null> {
    const subIds = await this.redis.smembers(`${this.userSubsPrefix}${subscriberId}`);

    for (const id of subIds) {
      const sub = await this.getSubscription(id);
      if (sub && sub.creatorId === creatorId && sub.status === 'active') {
        return sub;
      }
    }

    return null;
  }

  async getUserSubscriptions(subscriberId: string): Promise<Subscription[]> {
    const subIds = await this.redis.smembers(`${this.userSubsPrefix}${subscriberId}`);

    const subs: Subscription[] = [];
    for (const id of subIds) {
      const sub = await this.getSubscription(id);
      if (sub) subs.push(sub);
    }

    return subs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCreatorSubscribers(
    creatorId: string,
    options: { status?: Subscription['status']; tierId?: string } = {}
  ): Promise<Subscription[]> {
    const subIds = await this.redis.smembers(`${this.creatorSubsPrefix}${creatorId}`);

    const subs: Subscription[] = [];
    for (const id of subIds) {
      const sub = await this.getSubscription(id);
      if (sub) {
        if (options.status && sub.status !== options.status) continue;
        if (options.tierId && sub.tierId !== options.tierId) continue;
        subs.push(sub);
      }
    }

    return subs;
  }

  async getTierSubscriberCount(tierId: string): Promise<number> {
    const tier = await this.getTier(tierId);
    if (!tier) return 0;

    const subs = await this.getCreatorSubscribers(tier.creatorId, {
      status: 'active',
      tierId,
    });

    return subs.length;
  }

  async isSubscribed(subscriberId: string, creatorId: string): Promise<boolean> {
    const sub = await this.getActiveSubscription(subscriberId, creatorId);
    return sub !== null;
  }

  async getCreatorStats(creatorId: string): Promise<{
    totalSubscribers: number;
    activeSubscribers: number;
    monthlyRecurringRevenue: number;
    tierBreakdown: Array<{ tierId: string; name: string; subscribers: number; mrr: number }>;
  }> {
    const tiers = await this.getCreatorTiers(creatorId);
    const allSubs = await this.getCreatorSubscribers(creatorId);

    let totalSubscribers = allSubs.length;
    let activeSubscribers = 0;
    let monthlyRecurringRevenue = 0;

    const tierBreakdown: Array<{ tierId: string; name: string; subscribers: number; mrr: number }> = [];

    for (const tier of tiers) {
      const tierSubs = allSubs.filter(s => s.tierId === tier.id && s.status === 'active');
      const subCount = tierSubs.length;
      activeSubscribers += subCount;

      let tierMrr = tier.price.value * subCount;
      if (tier.billingPeriod === 'yearly') {
        tierMrr = tierMrr / 12;
      }

      monthlyRecurringRevenue += tierMrr;

      tierBreakdown.push({
        tierId: tier.id,
        name: tier.name,
        subscribers: subCount,
        mrr: tierMrr,
      });
    }

    return {
      totalSubscribers,
      activeSubscribers,
      monthlyRecurringRevenue,
      tierBreakdown,
    };
  }

  private async processPayment(
    subscriberId: string,
    creatorId: string,
    amount: Amount,
    periodStart: Date,
    periodEnd: Date
  ): Promise<SubscriptionPayment> {
    const platformFee = Math.floor(amount.value * (this.platformFeePercent / 100));
    const creatorReceived = amount.value - platformFee;

    // Debit subscriber
    await this.wallet.debit(
      subscriberId,
      amount,
      `Subscription payment`,
      undefined,
      'subscription'
    );

    // Credit creator
    await this.wallet.credit(
      creatorId,
      { value: creatorReceived, currency: amount.currency },
      `Subscription revenue`,
      undefined,
      'subscription'
    );

    // Record platform revenue
    await this.recordPlatformRevenue(platformFee);

    const payment: SubscriptionPayment = {
      id: uuidv4(),
      subscriptionId: '', // Will be set by caller
      amount,
      platformFee: { value: platformFee, currency: amount.currency },
      creatorReceived: { value: creatorReceived, currency: amount.currency },
      periodStart,
      periodEnd,
      status: 'completed',
      createdAt: new Date(),
    };

    return payment;
  }

  private async saveSubscription(subscription: Subscription): Promise<void> {
    await this.redis.set(
      `${this.subPrefix}${subscription.id}`,
      JSON.stringify(subscription)
    );

    await this.redis.sadd(
      `${this.userSubsPrefix}${subscription.subscriberId}`,
      subscription.id
    );

    await this.redis.sadd(
      `${this.creatorSubsPrefix}${subscription.creatorId}`,
      subscription.id
    );
  }

  private async savePayment(payment: SubscriptionPayment): Promise<void> {
    await this.redis.set(
      `monetization:sub_payment:${payment.id}`,
      JSON.stringify(payment),
      'EX',
      86400 * 365
    );
  }

  private async recordPlatformRevenue(amount: number): Promise<void> {
    const dateKey = new Date().toISOString().split('T')[0];
    const key = `monetization:platform_revenue:${dateKey}`;
    await this.redis.hincrbyfloat(key, 'subscriptionFees', amount);
  }
}
