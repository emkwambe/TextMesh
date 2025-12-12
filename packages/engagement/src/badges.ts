import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Badge,
  BadgeCategory,
  BadgeTier,
  BadgeRequirement,
  UserBadge,
} from './types';

const DEFAULT_BADGES: Badge[] = [
  {
    id: 'verified_user',
    name: 'Verified',
    description: 'Account verified by TextMesh',
    icon: '✓',
    category: 'verification',
    tier: 'gold',
    requirements: [{ type: 'manual', value: 'staff_verification', description: 'Manual verification by staff' }],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'founding_member',
    name: 'Founding Member',
    description: 'Joined during the founding period',
    icon: '🌟',
    category: 'community',
    tier: 'platinum',
    requirements: [{ type: 'time', value: '2024-12-31', description: 'Joined before 2025' }],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'content_creator_bronze',
    name: 'Content Creator',
    description: 'Created quality content consistently',
    icon: '📝',
    category: 'creator',
    tier: 'bronze',
    requirements: [
      { type: 'achievement', value: 'prolific_poster', description: 'Unlock Prolific Poster achievement' },
    ],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'content_creator_silver',
    name: 'Content Creator',
    description: 'Established content creator',
    icon: '📝',
    category: 'creator',
    tier: 'silver',
    requirements: [
      { type: 'metric', value: 500, description: 'Create 500 posts' },
      { type: 'metric', value: 1000, description: 'Receive 1000 total likes' },
    ],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'content_creator_gold',
    name: 'Content Creator',
    description: 'Top-tier content creator',
    icon: '📝',
    category: 'creator',
    tier: 'gold',
    requirements: [
      { type: 'metric', value: 1000, description: 'Create 1000 posts' },
      { type: 'metric', value: 10000, description: 'Receive 10000 total likes' },
    ],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'community_helper',
    name: 'Community Helper',
    description: 'Actively helps other community members',
    icon: '🤝',
    category: 'community',
    tier: 'silver',
    requirements: [
      { type: 'metric', value: 100, description: 'Write 100 helpful comments' },
    ],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'supporter_bronze',
    name: 'Supporter',
    description: 'TextMesh supporter',
    icon: '💜',
    category: 'supporter',
    tier: 'bronze',
    requirements: [{ type: 'manual', value: 'supporter_tier_1', description: 'Active supporter subscription' }],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'supporter_gold',
    name: 'Premium Supporter',
    description: 'TextMesh premium supporter',
    icon: '💎',
    category: 'supporter',
    tier: 'gold',
    requirements: [{ type: 'manual', value: 'supporter_tier_3', description: 'Premium supporter subscription' }],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'expert_tech',
    name: 'Tech Expert',
    description: 'Recognized expertise in technology',
    icon: '💻',
    category: 'expertise',
    tier: 'gold',
    requirements: [{ type: 'manual', value: 'expert_verification', description: 'Verified expertise in technology' }],
    isDisplayable: true,
    createdAt: new Date(),
  },
  {
    id: 'event_participant',
    name: 'Event Participant',
    description: 'Participated in a TextMesh event',
    icon: '🎉',
    category: 'event',
    tier: 'bronze',
    requirements: [{ type: 'manual', value: 'event_participation', description: 'Participated in platform event' }],
    isDisplayable: true,
    createdAt: new Date(),
  },
];

export class BadgeSystem {
  private redis: Redis;
  private badges: Map<string, Badge> = new Map();
  private readonly badgePrefix = 'engagement:badge:';
  private readonly userBadgePrefix = 'engagement:user_badge:';

  constructor(redis: Redis) {
    this.redis = redis;
    this.loadDefaultBadges();
  }

  private loadDefaultBadges(): void {
    DEFAULT_BADGES.forEach((badge) => {
      this.badges.set(badge.id, badge);
    });
  }

  registerBadge(badge: Badge): void {
    this.badges.set(badge.id, badge);
  }

  getBadge(badgeId: string): Badge | undefined {
    return this.badges.get(badgeId);
  }

  getAllBadges(): Badge[] {
    return Array.from(this.badges.values());
  }

  getBadgesByCategory(category: BadgeCategory): Badge[] {
    return Array.from(this.badges.values()).filter((b) => b.category === category);
  }

  getBadgesByTier(tier: BadgeTier): Badge[] {
    return Array.from(this.badges.values()).filter((b) => b.tier === tier);
  }

  async awardBadge(
    userId: string,
    badgeId: string,
    options: {
      awardedBy?: string;
      reason?: string;
      featured?: boolean;
    } = {}
  ): Promise<UserBadge | null> {
    const badge = this.badges.get(badgeId);
    if (!badge) return null;

    const existing = await this.redis.hget(
      `${this.userBadgePrefix}${userId}`,
      badgeId
    );
    if (existing) return JSON.parse(existing);

    const userBadge: UserBadge = {
      badgeId,
      awardedAt: new Date(),
      awardedBy: options.awardedBy,
      reason: options.reason,
      featured: options.featured || false,
    };

    await this.redis.hset(
      `${this.userBadgePrefix}${userId}`,
      badgeId,
      JSON.stringify(userBadge)
    );

    await this.redis.lpush(
      'engagement:badge_log',
      JSON.stringify({
        id: uuidv4(),
        userId,
        badgeId,
        awardedBy: options.awardedBy,
        timestamp: new Date(),
      })
    );

    const date = new Date().toISOString().split('T')[0];
    await this.redis.hincrby(`engagement:stats:daily:${date}`, 'badges_awarded', 1);

    return userBadge;
  }

  async revokeBadge(
    userId: string,
    badgeId: string,
    reason?: string
  ): Promise<boolean> {
    const existing = await this.redis.hget(
      `${this.userBadgePrefix}${userId}`,
      badgeId
    );
    if (!existing) return false;

    await this.redis.hdel(`${this.userBadgePrefix}${userId}`, badgeId);

    await this.redis.lpush(
      'engagement:badge_revoke_log',
      JSON.stringify({
        id: uuidv4(),
        userId,
        badgeId,
        reason,
        timestamp: new Date(),
      })
    );

    return true;
  }

  async getUserBadges(userId: string): Promise<UserBadge[]> {
    const data = await this.redis.hgetall(`${this.userBadgePrefix}${userId}`);

    return Object.values(data).map((d) => {
      const ub = JSON.parse(d);
      ub.awardedAt = new Date(ub.awardedAt);
      return ub;
    });
  }

  async getUserBadgesWithDetails(
    userId: string
  ): Promise<Array<Badge & UserBadge>> {
    const userBadges = await this.getUserBadges(userId);

    return userBadges
      .map((ub) => {
        const badge = this.badges.get(ub.badgeId);
        if (!badge) return null;
        return { ...badge, ...ub };
      })
      .filter((b): b is Badge & UserBadge => b !== null);
  }

  async getFeaturedBadges(userId: string): Promise<Array<Badge & UserBadge>> {
    const badges = await this.getUserBadgesWithDetails(userId);
    return badges.filter((b) => b.featured);
  }

  async setFeaturedBadge(
    userId: string,
    badgeId: string,
    featured: boolean
  ): Promise<boolean> {
    const data = await this.redis.hget(
      `${this.userBadgePrefix}${userId}`,
      badgeId
    );
    if (!data) return false;

    const userBadge: UserBadge = JSON.parse(data);
    userBadge.featured = featured;

    await this.redis.hset(
      `${this.userBadgePrefix}${userId}`,
      badgeId,
      JSON.stringify(userBadge)
    );

    return true;
  }

  async hasBadge(userId: string, badgeId: string): Promise<boolean> {
    return (await this.redis.hexists(
      `${this.userBadgePrefix}${userId}`,
      badgeId
    )) === 1;
  }

  async checkBadgeEligibility(
    userId: string,
    badgeId: string,
    metrics: Record<string, number>,
    achievements: string[]
  ): Promise<{ eligible: boolean; missingRequirements: string[] }> {
    const badge = this.badges.get(badgeId);
    if (!badge) {
      return { eligible: false, missingRequirements: ['Badge not found'] };
    }

    const missingRequirements: string[] = [];

    for (const requirement of badge.requirements) {
      switch (requirement.type) {
        case 'achievement':
          if (!achievements.includes(requirement.value as string)) {
            missingRequirements.push(requirement.description || `Achievement: ${requirement.value}`);
          }
          break;

        case 'metric':
          const metricValue = metrics[badge.id] || 0;
          if (metricValue < (requirement.value as number)) {
            missingRequirements.push(requirement.description || `Metric: ${requirement.value}`);
          }
          break;

        case 'time':
          const deadline = new Date(requirement.value as string);
          const userJoinDate = new Date(metrics.joinDate || Date.now());
          if (userJoinDate > deadline) {
            missingRequirements.push(requirement.description || `Joined before: ${requirement.value}`);
          }
          break;

        case 'manual':
          missingRequirements.push(requirement.description || 'Manual verification required');
          break;
      }
    }

    return {
      eligible: missingRequirements.length === 0,
      missingRequirements,
    };
  }

  async getRecentlyAwarded(limit: number = 50): Promise<
    Array<{
      userId: string;
      badgeId: string;
      badge: Badge;
      timestamp: Date;
    }>
  > {
    const logs = await this.redis.lrange('engagement:badge_log', 0, limit - 1);

    return logs
      .map((log) => {
        const data = JSON.parse(log);
        const badge = this.badges.get(data.badgeId);
        if (!badge) return null;

        return {
          userId: data.userId,
          badgeId: data.badgeId,
          badge,
          timestamp: new Date(data.timestamp),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  getTierValue(tier: BadgeTier): number {
    const values: Record<BadgeTier, number> = {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
      diamond: 5,
    };
    return values[tier];
  }
}
