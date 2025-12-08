// =================================
// TEXTMESH REFERRAL SYSTEM
// User Referral & Rewards
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ REFERRAL TYPES ============

export interface ReferralCode {
  code: string;
  userId: string;
  createdAt: Date;
  expiresAt?: Date;
  maxUses?: number;
  currentUses: number;
  rewards: ReferralReward;
}

export interface ReferralReward {
  referrer: RewardItem[];
  referee: RewardItem[];
}

export interface RewardItem {
  type: 'points' | 'badge' | 'premium_days' | 'feature';
  value: number | string;
  description: string;
}

export interface ReferralStats {
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  referralCode: string;
  recentReferrals: ReferralEntry[];
  tier: ReferralTier;
}

export interface ReferralEntry {
  refereeId: string;
  refereeUsername: string;
  refereeAvatar?: string;
  status: 'pending' | 'completed' | 'expired';
  joinedAt: Date;
  completedAt?: Date;
  rewardEarned?: number;
}

export interface ReferralTier {
  name: string;
  level: number;
  minReferrals: number;
  bonusMultiplier: number;
  perks: string[];
}

// ============ REFERRAL CONFIGURATION ============

const DEFAULT_REWARDS: ReferralReward = {
  referrer: [
    { type: 'points', value: 100, description: '100 bonus points' },
    { type: 'badge', value: 'referral_star', description: 'Referral Star badge' },
  ],
  referee: [
    { type: 'points', value: 50, description: '50 welcome points' },
    { type: 'feature', value: 'verified_badge_trial', description: '7-day verified badge trial' },
  ],
};

const REFERRAL_TIERS: ReferralTier[] = [
  {
    name: 'Starter',
    level: 1,
    minReferrals: 0,
    bonusMultiplier: 1.0,
    perks: ['Basic referral rewards'],
  },
  {
    name: 'Advocate',
    level: 2,
    minReferrals: 5,
    bonusMultiplier: 1.25,
    perks: ['25% bonus rewards', 'Custom referral page'],
  },
  {
    name: 'Ambassador',
    level: 3,
    minReferrals: 20,
    bonusMultiplier: 1.5,
    perks: ['50% bonus rewards', 'Priority support', 'Ambassador badge'],
  },
  {
    name: 'Champion',
    level: 4,
    minReferrals: 50,
    bonusMultiplier: 2.0,
    perks: ['Double rewards', 'Exclusive features', 'Champion badge', 'Early access'],
  },
  {
    name: 'Legend',
    level: 5,
    minReferrals: 100,
    bonusMultiplier: 3.0,
    perks: ['Triple rewards', 'VIP support', 'Legend badge', 'All premium features'],
  },
];

// ============ REFERRAL SYSTEM CLASS ============

export class ReferralSystem {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Get or create referral code for user
   */
  async getReferralCode(userId: string): Promise<string> {
    // Check if user already has a code
    const existingCode = await this.redis.get(`user:referral_code:${userId}`);
    if (existingCode) {
      return existingCode;
    }

    // Generate new code
    const code = await this.generateUniqueCode(userId);

    // Store the code
    await this.redis.set(`user:referral_code:${userId}`, code);
    await this.redis.set(`referral_code:${code}`, userId);

    // Initialize referral stats
    await this.redis.hset(`referral:stats:${userId}`, {
      total: 0,
      successful: 0,
      pending: 0,
      points_earned: 0,
    });

    return code;
  }

  /**
   * Apply referral code during signup
   */
  async applyReferralCode(
    newUserId: string,
    code: string
  ): Promise<{ success: boolean; error?: string; rewards?: RewardItem[] }> {
    // Validate code
    const referrerId = await this.redis.get(`referral_code:${code}`);
    if (!referrerId) {
      return { success: false, error: 'Invalid referral code' };
    }

    // Check if new user is the referrer
    if (referrerId === newUserId) {
      return { success: false, error: 'Cannot use your own referral code' };
    }

    // Check if new user has already used a referral code
    const existingReferrer = await this.redis.get(`user:referred_by:${newUserId}`);
    if (existingReferrer) {
      return { success: false, error: 'You have already used a referral code' };
    }

    // Create referral entry
    await this.createReferralEntry(referrerId, newUserId);

    // Grant immediate rewards to referee
    const refereeRewards = await this.grantRefereeRewards(newUserId);

    return {
      success: true,
      rewards: refereeRewards,
    };
  }

  /**
   * Complete a referral (when referee reaches activation criteria)
   */
  async completeReferral(refereeId: string): Promise<void> {
    const referrerId = await this.redis.get(`user:referred_by:${refereeId}`);
    if (!referrerId) return;

    // Check if already completed
    const status = await this.redis.hget(`referral:entry:${referrerId}:${refereeId}`, 'status');
    if (status === 'completed') return;

    // Update referral entry
    await this.redis.hset(`referral:entry:${referrerId}:${refereeId}`, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    // Update stats
    await this.redis.hincrby(`referral:stats:${referrerId}`, 'successful', 1);
    await this.redis.hincrby(`referral:stats:${referrerId}`, 'pending', -1);

    // Grant rewards to referrer
    await this.grantReferrerRewards(referrerId);

    // Check for tier upgrade
    await this.checkTierUpgrade(referrerId);
  }

  /**
   * Get referral statistics for user
   */
  async getReferralStats(userId: string): Promise<ReferralStats> {
    const code = await this.getReferralCode(userId);
    const stats = await this.redis.hgetall(`referral:stats:${userId}`);
    const recentEntries = await this.getRecentReferrals(userId);
    const tier = await this.getUserTier(userId);

    return {
      totalReferrals: parseInt(stats['total'] || '0', 10),
      successfulReferrals: parseInt(stats['successful'] || '0', 10),
      pendingReferrals: parseInt(stats['pending'] || '0', 10),
      totalRewardsEarned: parseInt(stats['points_earned'] || '0', 10),
      referralCode: code,
      recentReferrals: recentEntries,
      tier,
    };
  }

  /**
   * Get referral leaderboard
   */
  async getLeaderboard(limit: number = 100): Promise<Array<{
    userId: string;
    username: string;
    avatar?: string;
    referralCount: number;
    tier: ReferralTier;
  }>> {
    const leaderboard = await this.redis.zrevrange(
      'referral:leaderboard',
      0,
      limit - 1,
      'WITHSCORES'
    );

    const results: Array<{
      userId: string;
      username: string;
      avatar?: string;
      referralCount: number;
      tier: ReferralTier;
    }> = [];

    for (let i = 0; i < leaderboard.length; i += 2) {
      const odUserId = leaderboard[i];
      const count = parseInt(leaderboard[i + 1] || '0', 10);

      if (!odUserId) continue;

      const user = await this.prisma.user.findUnique({
        where: { id: odUserId },
        select: { username: true, avatar: true },
      });

      if (user) {
        results.push({
          userId: odUserId,
          username: user.username,
          avatar: user.avatar || undefined,
          referralCount: count,
          tier: this.getTierForCount(count),
        });
      }
    }

    return results;
  }

  /**
   * Generate shareable referral link
   */
  async getShareableLink(userId: string): Promise<string> {
    const code = await this.getReferralCode(userId);
    return `https://textmesh.com/join?ref=${code}`;
  }

  /**
   * Get referral campaign info
   */
  async getCampaignInfo(): Promise<{
    rewards: ReferralReward;
    tiers: ReferralTier[];
    activeCampaign?: {
      name: string;
      bonusMultiplier: number;
      endsAt: Date;
    };
  }> {
    // Check for active campaign
    const campaignData = await this.redis.get('referral:active_campaign');
    let activeCampaign: { name: string; bonusMultiplier: number; endsAt: Date } | undefined;

    if (campaignData) {
      activeCampaign = JSON.parse(campaignData);
    }

    return {
      rewards: DEFAULT_REWARDS,
      tiers: REFERRAL_TIERS,
      activeCampaign,
    };
  }

  // ============ HELPER METHODS ============

  private async generateUniqueCode(userId: string): Promise<string> {
    // Get username for personalized code
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const base = user?.username.slice(0, 6).toUpperCase() || 'TM';
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    let code = `${base}${random}`;

    // Ensure uniqueness
    let attempts = 0;
    while (await this.redis.exists(`referral_code:${code}`)) {
      code = `${base}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      attempts++;
      if (attempts > 10) {
        // Use fully random code
        code = Math.random().toString(36).substring(2, 10).toUpperCase();
      }
    }

    return code;
  }

  private async createReferralEntry(
    referrerId: string,
    refereeId: string
  ): Promise<void> {
    const key = `referral:entry:${referrerId}:${refereeId}`;

    await this.redis.hset(key, {
      referee_id: refereeId,
      status: 'pending',
      joined_at: new Date().toISOString(),
    });

    // Store reverse lookup
    await this.redis.set(`user:referred_by:${refereeId}`, referrerId);

    // Update stats
    await this.redis.hincrby(`referral:stats:${referrerId}`, 'total', 1);
    await this.redis.hincrby(`referral:stats:${referrerId}`, 'pending', 1);

    // Add to referrer's referral list
    await this.redis.lpush(`user:referrals:${referrerId}`, refereeId);
    await this.redis.ltrim(`user:referrals:${referrerId}`, 0, 99);
  }

  private async grantRefereeRewards(refereeId: string): Promise<RewardItem[]> {
    const rewards = DEFAULT_REWARDS.referee;

    for (const reward of rewards) {
      if (reward.type === 'points') {
        await this.redis.incrby(`user:points:${refereeId}`, reward.value as number);
      } else if (reward.type === 'badge') {
        await this.redis.sadd(`user:badges:${refereeId}`, reward.value as string);
      }
    }

    return rewards;
  }

  private async grantReferrerRewards(referrerId: string): Promise<void> {
    const tier = await this.getUserTier(referrerId);
    const baseRewards = DEFAULT_REWARDS.referrer;

    for (const reward of baseRewards) {
      if (reward.type === 'points') {
        const adjustedPoints = Math.round((reward.value as number) * tier.bonusMultiplier);
        await this.redis.incrby(`user:points:${referrerId}`, adjustedPoints);
        await this.redis.hincrby(`referral:stats:${referrerId}`, 'points_earned', adjustedPoints);
      } else if (reward.type === 'badge') {
        await this.redis.sadd(`user:badges:${referrerId}`, reward.value as string);
      }
    }

    // Update leaderboard
    await this.redis.zincrby('referral:leaderboard', 1, referrerId);
  }

  private async getUserTier(userId: string): Promise<ReferralTier> {
    const stats = await this.redis.hget(`referral:stats:${userId}`, 'successful');
    const count = parseInt(stats || '0', 10);

    return this.getTierForCount(count);
  }

  private getTierForCount(count: number): ReferralTier {
    let currentTier = REFERRAL_TIERS[0]!;

    for (const tier of REFERRAL_TIERS) {
      if (count >= tier.minReferrals) {
        currentTier = tier;
      }
    }

    return currentTier;
  }

  private async checkTierUpgrade(userId: string): Promise<void> {
    const stats = await this.redis.hget(`referral:stats:${userId}`, 'successful');
    const count = parseInt(stats || '0', 10);
    const newTier = this.getTierForCount(count);
    const oldTierLevel = await this.redis.get(`user:referral_tier:${userId}`);
    const oldLevel = oldTierLevel ? parseInt(oldTierLevel, 10) : 1;

    if (newTier.level > oldLevel) {
      // Tier upgraded!
      await this.redis.set(`user:referral_tier:${userId}`, newTier.level.toString());

      // Grant tier badge
      await this.redis.sadd(`user:badges:${userId}`, `referral_tier_${newTier.level}`);

      // Notify user (implementation depends on notification service)
      await this.redis.lpush(
        `notifications:${userId}`,
        JSON.stringify({
          type: 'tier_upgrade',
          tier: newTier,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  private async getRecentReferrals(userId: string): Promise<ReferralEntry[]> {
    const refereeIds = await this.redis.lrange(`user:referrals:${userId}`, 0, 9);
    const entries: ReferralEntry[] = [];

    for (const refereeId of refereeIds) {
      const entryData = await this.redis.hgetall(`referral:entry:${userId}:${refereeId}`);
      const referee = await this.prisma.user.findUnique({
        where: { id: refereeId },
        select: { username: true, avatar: true },
      });

      if (referee && entryData) {
        entries.push({
          refereeId,
          refereeUsername: referee.username,
          refereeAvatar: referee.avatar || undefined,
          status: (entryData['status'] as 'pending' | 'completed' | 'expired') || 'pending',
          joinedAt: new Date(entryData['joined_at'] || Date.now()),
          completedAt: entryData['completed_at'] ? new Date(entryData['completed_at']) : undefined,
        });
      }
    }

    return entries;
  }
}

export default ReferralSystem;
