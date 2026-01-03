// =================================
// TEXTMESH NOTIFICATION CAMPAIGNS
// Engagement Notification System
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ============ CAMPAIGN TYPES ============

export interface NotificationCampaign {
  id: string;
  name: string;
  type: CampaignType;
  trigger: CampaignTrigger;
  template: NotificationTemplate;
  audience: AudienceFilter;
  schedule: CampaignSchedule;
  status: CampaignStatus;
  metrics: CampaignMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignType =
  | 'onboarding'
  | 'reengagement'
  | 'milestone'
  | 'promotional'
  | 'seasonal'
  | 'behavioral';

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';

export interface CampaignTrigger {
  type: TriggerType;
  condition?: string;
  delay?: number; // minutes
  maxFrequency?: number; // max sends per user per period
  frequencyPeriod?: 'day' | 'week' | 'month';
}

export type TriggerType =
  | 'immediate'
  | 'scheduled'
  | 'event'
  | 'inactivity'
  | 'milestone'
  | 'behavior';

export interface NotificationTemplate {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  action?: NotificationAction;
  variables: string[];
}

export interface NotificationAction {
  type: 'open_app' | 'open_url' | 'deep_link';
  target: string;
}

export interface AudienceFilter {
  segments?: string[];
  minDaysInactive?: number;
  maxDaysInactive?: number;
  hasCompletedOnboarding?: boolean;
  minFollowers?: number;
  maxFollowers?: number;
  interests?: string[];
  excludeUsers?: string[];
}

export interface CampaignSchedule {
  startDate: Date;
  endDate?: Date;
  times?: string[]; // HH:mm format
  days?: number[]; // 0-6 (Sunday-Saturday)
  timezone?: string;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
}

// ============ PREDEFINED CAMPAIGNS ============

const PREDEFINED_CAMPAIGNS: Omit<NotificationCampaign, 'id' | 'metrics' | 'createdAt' | 'updatedAt'>[] = [
  // Onboarding campaigns
  {
    name: 'Welcome to TextMesh',
    type: 'onboarding',
    trigger: { type: 'event', condition: 'signup', delay: 5 },
    template: {
      title: 'Welcome to TextMesh! 🎉',
      body: 'Complete your profile to connect with others.',
      action: { type: 'deep_link', target: '/onboarding/profile' },
      variables: ['username'],
    },
    audience: { hasCompletedOnboarding: false },
    schedule: { startDate: new Date() },
    status: 'active',
  },
  {
    name: 'Complete Your Profile',
    type: 'onboarding',
    trigger: { type: 'inactivity', condition: 'no_profile_photo', delay: 1440 }, // 24 hours
    template: {
      title: 'Add a profile photo 📷',
      body: 'Profiles with photos get 60% more followers!',
      action: { type: 'deep_link', target: '/settings/profile' },
      variables: [],
    },
    audience: { hasCompletedOnboarding: false },
    schedule: { startDate: new Date() },
    status: 'active',
  },
  {
    name: 'First Post Nudge',
    type: 'onboarding',
    trigger: { type: 'inactivity', condition: 'no_posts', delay: 2880 }, // 48 hours
    template: {
      title: 'Share your first thought! ✍️',
      body: "What's on your mind? Your first post is waiting.",
      action: { type: 'deep_link', target: '/compose' },
      variables: [],
    },
    audience: { hasCompletedOnboarding: true },
    schedule: { startDate: new Date() },
    status: 'active',
  },

  // Reengagement campaigns
  {
    name: 'We Miss You - 3 Days',
    type: 'reengagement',
    trigger: { type: 'inactivity', delay: 4320 }, // 3 days
    template: {
      title: "We miss you, {{username}}! 👋",
      body: "See what's happening in your network.",
      action: { type: 'deep_link', target: '/home' },
      variables: ['username'],
    },
    audience: { minDaysInactive: 3, maxDaysInactive: 7 },
    schedule: { startDate: new Date() },
    status: 'active',
  },
  {
    name: 'We Miss You - 7 Days',
    type: 'reengagement',
    trigger: { type: 'inactivity', delay: 10080 }, // 7 days
    template: {
      title: "{{username}}, you're missing out! 🌟",
      body: "{{activity_count}} new posts from people you follow.",
      action: { type: 'deep_link', target: '/home' },
      variables: ['username', 'activity_count'],
    },
    audience: { minDaysInactive: 7, maxDaysInactive: 14 },
    schedule: { startDate: new Date() },
    status: 'active',
  },
  {
    name: 'Win Back - 14 Days',
    type: 'reengagement',
    trigger: { type: 'inactivity', delay: 20160 }, // 14 days
    template: {
      title: "We've been saving your spot! 💫",
      body: 'Come back and see what you missed.',
      action: { type: 'deep_link', target: '/home' },
      variables: [],
    },
    audience: { minDaysInactive: 14, maxDaysInactive: 30 },
    schedule: { startDate: new Date() },
    status: 'active',
  },

  // Milestone campaigns
  {
    name: 'First Follower',
    type: 'milestone',
    trigger: { type: 'event', condition: 'first_follower' },
    template: {
      title: 'You got your first follower! 🎉',
      body: '{{follower_name}} just followed you.',
      action: { type: 'deep_link', target: '/followers' },
      variables: ['follower_name'],
    },
    audience: {},
    schedule: { startDate: new Date() },
    status: 'active',
  },
  {
    name: '10 Followers Milestone',
    type: 'milestone',
    trigger: { type: 'milestone', condition: 'followers_10' },
    template: {
      title: '10 followers! Keep going! 🔥',
      body: "You're building your audience.",
      action: { type: 'deep_link', target: '/profile' },
      variables: [],
    },
    audience: {},
    schedule: { startDate: new Date() },
    status: 'active',
  },
  {
    name: '100 Followers Milestone',
    type: 'milestone',
    trigger: { type: 'milestone', condition: 'followers_100' },
    template: {
      title: '100 followers! 🌟',
      body: "You're officially making waves.",
      action: { type: 'deep_link', target: '/profile' },
      variables: [],
    },
    audience: {},
    schedule: { startDate: new Date() },
    status: 'active',
  },

  // Streak reminders
  {
    name: 'Streak at Risk',
    type: 'behavioral',
    trigger: { type: 'event', condition: 'streak_at_risk', delay: 0 },
    template: {
      title: "Don't lose your {{streak_days}}-day streak! 🔥",
      body: 'Post or engage to keep it going.',
      action: { type: 'deep_link', target: '/compose' },
      variables: ['streak_days'],
    },
    audience: {},
    schedule: { startDate: new Date(), times: ['18:00', '21:00'] },
    status: 'active',
  },
];

// ============ NOTIFICATION CAMPAIGNS CLASS ============

export class NotificationCampaigns {
  private redis: Redis;
  private prisma: PrismaClient;

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
    this.initializePredefinedCampaigns();
  }

  /**
   * Initialize predefined campaigns
   */
  private async initializePredefinedCampaigns(): Promise<void> {
    for (let i = 0; i < PREDEFINED_CAMPAIGNS.length; i++) {
      const campaign = PREDEFINED_CAMPAIGNS[i];
      if (!campaign) continue;

      const id = `campaign_${i + 1}`;
      const exists = await this.redis.exists(`campaign:${id}`);

      if (!exists) {
        const fullCampaign: NotificationCampaign = {
          ...campaign,
          id,
          metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.redis.set(`campaign:${id}`, JSON.stringify(fullCampaign));
        await this.redis.sadd('campaigns:active', id);
      }
    }
  }

  /**
   * Create a new campaign
   */
  async createCampaign(
    campaign: Omit<NotificationCampaign, 'id' | 'metrics' | 'createdAt' | 'updatedAt'>
  ): Promise<NotificationCampaign> {
    const id = `campaign_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const fullCampaign: NotificationCampaign = {
      ...campaign,
      id,
      metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.redis.set(`campaign:${id}`, JSON.stringify(fullCampaign));

    if (campaign.status === 'active') {
      await this.redis.sadd('campaigns:active', id);
    }

    return fullCampaign;
  }

  /**
   * Trigger notification for event
   */
  async triggerEvent(
    userId: string,
    eventType: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const activeCampaigns = await this.getActiveCampaigns();

    for (const campaign of activeCampaigns) {
      if (campaign.trigger.type !== 'event') continue;
      if (campaign.trigger.condition !== eventType) continue;

      // Check if user matches audience
      const matches = await this.matchesAudience(userId, campaign.audience);
      if (!matches) continue;

      // Check frequency limits
      const canSend = await this.checkFrequencyLimit(userId, campaign);
      if (!canSend) continue;

      // Schedule or send notification
      if (campaign.trigger.delay && campaign.trigger.delay > 0) {
        await this.scheduleNotification(userId, campaign, data);
      } else {
        await this.sendNotification(userId, campaign, data);
      }
    }
  }

  /**
   * Process inactivity triggers
   */
  async processInactivityTriggers(): Promise<void> {
    const activeCampaigns = await this.getActiveCampaigns();
    const inactivityCampaigns = activeCampaigns.filter(
      (c) => c.trigger.type === 'inactivity'
    );

    for (const campaign of inactivityCampaigns) {
      const eligibleUsers = await this.getEligibleInactiveUsers(campaign);

      for (const userId of eligibleUsers) {
        const canSend = await this.checkFrequencyLimit(userId, campaign);
        if (canSend) {
          await this.sendNotification(userId, campaign);
        }
      }
    }
  }

  /**
   * Send scheduled notifications
   */
  async processScheduledNotifications(): Promise<void> {
    const now = Date.now();
    const scheduled = await this.redis.zrangebyscore('notifications:scheduled', 0, now);

    for (const entry of scheduled) {
      const data = JSON.parse(entry) as {
        userId: string;
        campaignId: string;
        data?: Record<string, unknown>;
      };

      const campaign = await this.getCampaign(data.campaignId);
      if (campaign && campaign.status === 'active') {
        await this.sendNotification(data.userId, campaign, data.data);
      }

      await this.redis.zrem('notifications:scheduled', entry);
    }
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(id: string): Promise<NotificationCampaign | null> {
    const data = await this.redis.get(`campaign:${id}`);
    return data ? (JSON.parse(data) as NotificationCampaign) : null;
  }

  /**
   * Get all active campaigns
   */
  async getActiveCampaigns(): Promise<NotificationCampaign[]> {
    const ids = await this.redis.smembers('campaigns:active');
    const campaigns: NotificationCampaign[] = [];

    for (const id of ids) {
      const campaign = await this.getCampaign(id);
      if (campaign) {
        campaigns.push(campaign);
      }
    }

    return campaigns;
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
    const campaign = await this.getCampaign(id);
    if (!campaign) return;

    campaign.status = status;
    campaign.updatedAt = new Date();

    await this.redis.set(`campaign:${id}`, JSON.stringify(campaign));

    if (status === 'active') {
      await this.redis.sadd('campaigns:active', id);
    } else {
      await this.redis.srem('campaigns:active', id);
    }
  }

  /**
   * Get campaign metrics
   */
  async getCampaignMetrics(id: string): Promise<CampaignMetrics | null> {
    const campaign = await this.getCampaign(id);
    return campaign?.metrics || null;
  }

  /**
   * Track notification event
   */
  async trackEvent(
    notificationId: string,
    event: 'delivered' | 'opened' | 'clicked' | 'converted'
  ): Promise<void> {
    const data = await this.redis.get(`notification:${notificationId}`);
    if (!data) return;

    const notification = JSON.parse(data) as { campaignId: string };
    const campaign = await this.getCampaign(notification.campaignId);

    if (campaign) {
      campaign.metrics[event] += 1;
      await this.redis.set(`campaign:${campaign.id}`, JSON.stringify(campaign));
    }
  }

  // ============ HELPER METHODS ============

  private async matchesAudience(userId: string, audience: AudienceFilter): Promise<boolean> {
    // Check excluded users
    if (audience.excludeUsers?.includes(userId)) {
      return false;
    }

    // Check onboarding status
    // TODO: Re-enable when onboardingCompleted field is added to User model
    // if (audience.hasCompletedOnboarding !== undefined) {
    //   const user = await this.prisma.user.findUnique({
    //     where: { id: userId },
    //     select: { onboardingCompleted: true },
    //   });
    //   if (user?.onboardingCompleted !== audience.hasCompletedOnboarding) {
    //     return false;
    //   }
    // }

    // Check follower count
    if (audience.minFollowers !== undefined || audience.maxFollowers !== undefined) {
      const followerCount = await this.redis.get(`user:followers:count:${userId}`);
      const count = parseInt(followerCount || '0', 10);

      if (audience.minFollowers && count < audience.minFollowers) return false;
      if (audience.maxFollowers && count > audience.maxFollowers) return false;
    }

    // Check interests
    if (audience.interests?.length) {
      const userInterests = await this.redis.smembers(`user:interests:${userId}`);
      const hasInterest = audience.interests.some((i) => userInterests.includes(i));
      if (!hasInterest) return false;
    }

    return true;
  }

  private async checkFrequencyLimit(
    userId: string,
    campaign: NotificationCampaign
  ): Promise<boolean> {
    const { maxFrequency, frequencyPeriod } = campaign.trigger;

    if (!maxFrequency) return true;

    const key = `notification:frequency:${userId}:${campaign.id}`;
    const current = await this.redis.get(key);
    const count = parseInt(current || '0', 10);

    if (count >= maxFrequency) return false;

    // Get TTL based on period
    let ttl = 86400; // Default 1 day
    if (frequencyPeriod === 'week') ttl = 86400 * 7;
    if (frequencyPeriod === 'month') ttl = 86400 * 30;

    await this.redis.setex(key, ttl, (count + 1).toString());

    return true;
  }

  private async scheduleNotification(
    userId: string,
    campaign: NotificationCampaign,
    data?: Record<string, unknown>
  ): Promise<void> {
    const delay = campaign.trigger.delay || 0;
    const sendAt = Date.now() + delay * 60 * 1000;

    const entry = JSON.stringify({
      userId,
      campaignId: campaign.id,
      data,
    });

    await this.redis.zadd('notifications:scheduled', sendAt, entry);
  }

  private async sendNotification(
    userId: string,
    campaign: NotificationCampaign,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Get user data for variables
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true },
    });

    // Replace variables in template
    let title = campaign.template.title;
    let body = campaign.template.body;

    if (user) {
      title = title.replace('{{username}}', user.displayName || user.username);
      body = body.replace('{{username}}', user.displayName || user.username);
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        title = title.replace(`{{${key}}}`, String(value));
        body = body.replace(`{{${key}}}`, String(value));
      }
    }

    // Create notification
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const notification = {
      id: notificationId,
      userId,
      campaignId: campaign.id,
      title,
      body,
      icon: campaign.template.icon,
      action: campaign.template.action,
      sentAt: new Date().toISOString(),
    };

    // Store notification
    await this.redis.set(`notification:${notificationId}`, JSON.stringify(notification));
    await this.redis.lpush(`user:notifications:${userId}`, JSON.stringify(notification));
    await this.redis.ltrim(`user:notifications:${userId}`, 0, 99);

    // Update campaign metrics
    campaign.metrics.sent += 1;
    await this.redis.set(`campaign:${campaign.id}`, JSON.stringify(campaign));

    // In production, this would also send push notification
  }

  private async getEligibleInactiveUsers(campaign: NotificationCampaign): Promise<string[]> {
    const { minDaysInactive, maxDaysInactive } = campaign.audience;

    // In production, this would query the database for inactive users
    // For now, return empty array
    return [];
  }
}

export default NotificationCampaigns;
