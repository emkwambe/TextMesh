import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { AdminAuth } from './admin-auth';
import { UserManagementService } from './user-management';
import { ContentManagementService } from './content-management';
import { ReportsManagementService } from './reports-management';
import {
  DashboardStats,
  UserStats,
  ContentStats,
  EngagementStats,
  ReportStats,
  SystemStats,
  SystemConfig,
  AnnouncementBanner,
} from './types';

export class DashboardService {
  private redis: Redis;
  private adminAuth: AdminAuth;
  private userManagement: UserManagementService;
  private contentManagement: ContentManagementService;
  private reportsManagement: ReportsManagementService;
  private readonly configPrefix = 'admin:config:';
  private readonly bannerPrefix = 'admin:banner:';
  private readonly statsPrefix = 'admin:stats:';

  constructor(redis: Redis, jwtSecret: string) {
    this.redis = redis;
    this.adminAuth = new AdminAuth(redis, { jwtSecret });
    this.userManagement = new UserManagementService(redis);
    this.contentManagement = new ContentManagementService(redis);
    this.reportsManagement = new ReportsManagementService(redis);
  }

  async getDashboardStats(period: string = 'today'): Promise<DashboardStats> {
    const [userStats, contentStats, engagementStats, reportStats, systemStats] =
      await Promise.all([
        this.getUserStats(period),
        this.getContentStats(period),
        this.getEngagementStats(period),
        this.getReportStats(period),
        this.getSystemStats(),
      ]);

    return {
      users: userStats,
      content: contentStats,
      engagement: engagementStats,
      reports: reportStats,
      system: systemStats,
      period,
      generatedAt: new Date(),
    };
  }

  private async getUserStats(period: string): Promise<UserStats> {
    const statsKey = `${this.statsPrefix}users:${period}`;
    const cached = await this.redis.get(statsKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const stats: UserStats = {
      total: 0,
      active: 0,
      new: 0,
      banned: 0,
      suspended: 0,
      verified: 0,
      growth: 0,
      retention: 0,
      churn: 0,
      byCountry: {},
      byPlatform: {},
    };

    await this.redis.set(statsKey, JSON.stringify(stats), 'EX', 300);

    return stats;
  }

  private async getContentStats(period: string): Promise<ContentStats> {
    const contentStats = await this.contentManagement.getContentStats();

    return {
      totalPosts: contentStats.total,
      newPosts: contentStats.active,
      totalComments: 0,
      newComments: 0,
      totalMedia: contentStats.byType['media'] || 0,
      moderatedContent: contentStats.flagged + contentStats.removed,
      removedContent: contentStats.removed,
      averagePostsPerUser: 0,
      topHashtags: [],
    };
  }

  private async getEngagementStats(period: string): Promise<EngagementStats> {
    return {
      totalLikes: 0,
      totalShares: 0,
      totalFollows: 0,
      averageSessionDuration: 0,
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      engagementRate: 0,
      peakHours: [],
    };
  }

  private async getReportStats(period: string): Promise<ReportStats> {
    const stats = await this.reportsManagement.getReportStats();

    return {
      total: stats.total,
      pending: stats.pending,
      resolved: stats.resolved,
      escalated: stats.escalated,
      byReason: stats.byReason,
      averageResolutionTime: stats.averageResolutionTime,
      falsePositiveRate: 0,
    };
  }

  private async getSystemStats(): Promise<SystemStats> {
    const startTime = await this.redis.get('system:start_time');
    const uptime = startTime
      ? (Date.now() - parseInt(startTime)) / 1000
      : 0;

    return {
      uptime,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      requestsPerSecond: 0,
      averageLatency: 0,
      errorRate: 0,
      activeConnections: 0,
    };
  }

  async getConfig(key: string): Promise<SystemConfig | null> {
    const data = await this.redis.get(`${this.configPrefix}${key}`);
    if (!data) return null;

    const config = JSON.parse(data);
    config.updatedAt = new Date(config.updatedAt);
    return config;
  }

  async setConfig(
    key: string,
    value: unknown,
    options: {
      type?: 'string' | 'number' | 'boolean' | 'json';
      category?: string;
      description?: string;
      isSecret?: boolean;
      adminId?: string;
    } = {}
  ): Promise<SystemConfig> {
    const config: SystemConfig = {
      key,
      value,
      type: options.type || (typeof value as SystemConfig['type']),
      category: options.category || 'general',
      description: options.description || '',
      isSecret: options.isSecret || false,
      updatedAt: new Date(),
      updatedBy: options.adminId,
    };

    await this.redis.set(`${this.configPrefix}${key}`, JSON.stringify(config));

    return config;
  }

  async getAllConfigs(category?: string): Promise<SystemConfig[]> {
    const configs: SystemConfig[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.configPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const config = JSON.parse(data);
          config.updatedAt = new Date(config.updatedAt);

          if (!category || config.category === category) {
            configs.push(config);
          }
        }
      }
    } while (cursor !== '0');

    return configs;
  }

  async createBanner(
    title: string,
    message: string,
    createdBy: string,
    options: {
      type?: 'info' | 'warning' | 'error' | 'success';
      targetAudience?: 'all' | 'new_users' | 'verified' | 'specific';
      targetUserIds?: string[];
      actionUrl?: string;
      actionText?: string;
      startDate?: Date;
      endDate?: Date;
      dismissible?: boolean;
    } = {}
  ): Promise<AnnouncementBanner> {
    const banner: AnnouncementBanner = {
      id: uuidv4(),
      title,
      message,
      type: options.type || 'info',
      targetAudience: options.targetAudience || 'all',
      targetUserIds: options.targetUserIds,
      actionUrl: options.actionUrl,
      actionText: options.actionText,
      startDate: options.startDate || new Date(),
      endDate: options.endDate,
      isActive: true,
      dismissible: options.dismissible !== false,
      createdBy,
      createdAt: new Date(),
    };

    await this.redis.set(`${this.bannerPrefix}${banner.id}`, JSON.stringify(banner));

    if (banner.isActive) {
      await this.redis.zadd(
        `${this.bannerPrefix}active`,
        banner.startDate.getTime(),
        banner.id
      );
    }

    return banner;
  }

  async getBanner(bannerId: string): Promise<AnnouncementBanner | null> {
    const data = await this.redis.get(`${this.bannerPrefix}${bannerId}`);
    if (!data) return null;
    return this.deserializeBanner(data);
  }

  async getActiveBanners(userId?: string): Promise<AnnouncementBanner[]> {
    const now = Date.now();
    const bannerIds = await this.redis.zrangebyscore(
      `${this.bannerPrefix}active`,
      '-inf',
      now
    );

    const banners: AnnouncementBanner[] = [];

    for (const id of bannerIds) {
      const banner = await this.getBanner(id);
      if (!banner || !banner.isActive) continue;

      if (banner.endDate && banner.endDate < new Date()) {
        await this.deactivateBanner(id);
        continue;
      }

      if (userId && banner.targetAudience === 'specific') {
        if (!banner.targetUserIds?.includes(userId)) continue;
      }

      banners.push(banner);
    }

    return banners;
  }

  async updateBanner(
    bannerId: string,
    updates: Partial<Pick<AnnouncementBanner, 'title' | 'message' | 'type' | 'actionUrl' | 'actionText' | 'endDate' | 'isActive' | 'dismissible'>>
  ): Promise<AnnouncementBanner | null> {
    const banner = await this.getBanner(bannerId);
    if (!banner) return null;

    Object.assign(banner, updates);
    await this.redis.set(`${this.bannerPrefix}${bannerId}`, JSON.stringify(banner));

    if (updates.isActive === false) {
      await this.redis.zrem(`${this.bannerPrefix}active`, bannerId);
    } else if (updates.isActive === true) {
      await this.redis.zadd(
        `${this.bannerPrefix}active`,
        banner.startDate.getTime(),
        bannerId
      );
    }

    return banner;
  }

  async deactivateBanner(bannerId: string): Promise<boolean> {
    const result = await this.updateBanner(bannerId, { isActive: false });
    return result !== null;
  }

  async deleteBanner(bannerId: string): Promise<boolean> {
    await this.redis.del(`${this.bannerPrefix}${bannerId}`);
    await this.redis.zrem(`${this.bannerPrefix}active`, bannerId);
    return true;
  }

  getAdminAuth(): AdminAuth {
    return this.adminAuth;
  }

  getUserManagement(): UserManagementService {
    return this.userManagement;
  }

  getContentManagement(): ContentManagementService {
    return this.contentManagement;
  }

  getReportsManagement(): ReportsManagementService {
    return this.reportsManagement;
  }

  private deserializeBanner(data: string): AnnouncementBanner {
    const banner = JSON.parse(data);
    banner.startDate = new Date(banner.startDate);
    if (banner.endDate) banner.endDate = new Date(banner.endDate);
    banner.createdAt = new Date(banner.createdAt);
    return banner;
  }
}
