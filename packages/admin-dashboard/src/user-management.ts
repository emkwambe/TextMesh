import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  UserManagement,
  UserStatus,
  BanRecord,
  AdminAction,
  AdminActionType,
} from './types';

export class UserManagementService {
  private redis: Redis;
  private readonly userPrefix = 'admin:managed_user:';
  private readonly banPrefix = 'admin:ban:';
  private readonly actionLogPrefix = 'admin:action_log';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async getUser(userId: string): Promise<UserManagement | null> {
    const data = await this.redis.get(`${this.userPrefix}${userId}`);
    if (!data) return null;
    return this.deserializeUser(data);
  }

  async searchUsers(
    query: string,
    options: {
      status?: UserStatus;
      verified?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ users: UserManagement[]; total: number }> {
    const users: UserManagement[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.userPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const user = this.deserializeUser(data);

          const matchesQuery =
            !query ||
            user.username.toLowerCase().includes(query.toLowerCase()) ||
            user.email.toLowerCase().includes(query.toLowerCase()) ||
            user.displayName?.toLowerCase().includes(query.toLowerCase());

          const matchesStatus = !options.status || user.status === options.status;
          const matchesVerified =
            options.verified === undefined || user.verified === options.verified;

          if (matchesQuery && matchesStatus && matchesVerified) {
            users.push(user);
          }
        }
      }
    } while (cursor !== '0');

    users.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return {
      users: users.slice(offset, offset + limit),
      total: users.length,
    };
  }

  async banUser(
    userId: string,
    adminId: string,
    reason: string,
    options: {
      duration?: number;
      isPermanent?: boolean;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<BanRecord> {
    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found');

    const banRecord: BanRecord = {
      id: uuidv4(),
      adminId,
      reason,
      duration: options.duration,
      startedAt: new Date(),
      endsAt: options.duration
        ? new Date(Date.now() + options.duration * 1000)
        : undefined,
      isPermanent: options.isPermanent || !options.duration,
    };

    user.status = 'banned';
    user.banHistory.push(banRecord);
    await this.saveUser(user);

    if (options.duration) {
      await this.redis.set(
        `${this.banPrefix}${userId}`,
        JSON.stringify(banRecord),
        'EX',
        options.duration
      );
    } else {
      await this.redis.set(
        `${this.banPrefix}${userId}`,
        JSON.stringify(banRecord)
      );
    }

    await this.logAction({
      adminId,
      action: 'user_ban',
      targetType: 'user',
      targetId: userId,
      details: {
        reason,
        duration: options.duration,
        isPermanent: options.isPermanent,
      },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return banRecord;
  }

  async unbanUser(
    userId: string,
    adminId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    const activeBan = user.banHistory.find(
      (b) => !b.liftedAt && (b.isPermanent || (b.endsAt && b.endsAt > new Date()))
    );

    if (activeBan) {
      activeBan.liftedAt = new Date();
      activeBan.liftedBy = adminId;
    }

    user.status = 'active';
    await this.saveUser(user);

    await this.redis.del(`${this.banPrefix}${userId}`);

    await this.logAction({
      adminId,
      action: 'user_unban',
      targetType: 'user',
      targetId: userId,
      details: {},
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async suspendUser(
    userId: string,
    adminId: string,
    reason: string,
    duration: number,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    user.status = 'suspended';
    await this.saveUser(user);

    await this.redis.set(
      `admin:suspension:${userId}`,
      JSON.stringify({
        adminId,
        reason,
        startedAt: new Date(),
        endsAt: new Date(Date.now() + duration * 1000),
      }),
      'EX',
      duration
    );

    await this.logAction({
      adminId,
      action: 'user_suspend',
      targetType: 'user',
      targetId: userId,
      details: { reason, duration },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async unsuspendUser(
    userId: string,
    adminId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    user.status = 'active';
    await this.saveUser(user);

    await this.redis.del(`admin:suspension:${userId}`);

    await this.logAction({
      adminId,
      action: 'user_unsuspend',
      targetType: 'user',
      targetId: userId,
      details: {},
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async verifyUser(
    userId: string,
    adminId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    user.verified = true;
    await this.saveUser(user);

    await this.logAction({
      adminId,
      action: 'user_verify',
      targetType: 'user',
      targetId: userId,
      details: {},
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async unverifyUser(
    userId: string,
    adminId: string,
    reason: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    user.verified = false;
    await this.saveUser(user);

    await this.logAction({
      adminId,
      action: 'user_unverify',
      targetType: 'user',
      targetId: userId,
      details: { reason },
      reason,
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async updateUserRole(
    userId: string,
    adminId: string,
    newRole: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    const oldRole = user.role;
    user.role = newRole;
    await this.saveUser(user);

    await this.logAction({
      adminId,
      action: 'user_role_change',
      targetType: 'user',
      targetId: userId,
      details: { oldRole, newRole },
      ipAddress: options.ipAddress || '',
      userAgent: options.userAgent || '',
    });

    return true;
  }

  async isUserBanned(userId: string): Promise<{
    banned: boolean;
    banRecord?: BanRecord;
  }> {
    const data = await this.redis.get(`${this.banPrefix}${userId}`);
    if (!data) return { banned: false };

    const banRecord: BanRecord = JSON.parse(data);
    banRecord.startedAt = new Date(banRecord.startedAt);
    if (banRecord.endsAt) banRecord.endsAt = new Date(banRecord.endsAt);

    return { banned: true, banRecord };
  }

  async getBanHistory(userId: string): Promise<BanRecord[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    return user.banHistory;
  }

  async getUserStats(userId: string): Promise<{
    postsCount: number;
    commentsCount: number;
    likesCount: number;
    followersCount: number;
    followingCount: number;
    reportsAgainst: number;
    reportsBy: number;
  }> {
    const user = await this.getUser(userId);
    if (!user) {
      return {
        postsCount: 0,
        commentsCount: 0,
        likesCount: 0,
        followersCount: 0,
        followingCount: 0,
        reportsAgainst: 0,
        reportsBy: 0,
      };
    }

    return {
      postsCount: user.postsCount,
      commentsCount: 0,
      likesCount: 0,
      followersCount: user.followersCount,
      followingCount: 0,
      reportsAgainst: user.reportsAgainst,
      reportsBy: 0,
    };
  }

  async getActionHistory(
    userId: string,
    limit: number = 50
  ): Promise<AdminAction[]> {
    const actions = await this.redis.lrange(
      `${this.actionLogPrefix}:target:${userId}`,
      0,
      limit - 1
    );

    return actions.map((a) => {
      const action = JSON.parse(a);
      action.createdAt = new Date(action.createdAt);
      return action;
    });
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

    const serialized = JSON.stringify(action);

    await Promise.all([
      this.redis.lpush(this.actionLogPrefix, serialized),
      this.redis.lpush(`${this.actionLogPrefix}:target:${data.targetId}`, serialized),
      this.redis.lpush(`${this.actionLogPrefix}:admin:${data.adminId}`, serialized),
    ]);

    await Promise.all([
      this.redis.ltrim(this.actionLogPrefix, 0, 9999),
      this.redis.ltrim(`${this.actionLogPrefix}:target:${data.targetId}`, 0, 999),
      this.redis.ltrim(`${this.actionLogPrefix}:admin:${data.adminId}`, 0, 999),
    ]);
  }

  private async saveUser(user: UserManagement): Promise<void> {
    await this.redis.set(`${this.userPrefix}${user.id}`, JSON.stringify(user));
  }

  private deserializeUser(data: string): UserManagement {
    const user = JSON.parse(data);
    user.createdAt = new Date(user.createdAt);
    if (user.lastActiveAt) user.lastActiveAt = new Date(user.lastActiveAt);
    user.banHistory = user.banHistory.map((b: BanRecord) => ({
      ...b,
      startedAt: new Date(b.startedAt),
      endsAt: b.endsAt ? new Date(b.endsAt) : undefined,
      liftedAt: b.liftedAt ? new Date(b.liftedAt) : undefined,
    }));
    return user;
  }
}
