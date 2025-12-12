import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  AdminUser,
  AdminRole,
  Permission,
  AdminSession,
} from './types';

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    'users:read', 'users:write', 'users:delete', 'users:ban',
    'content:read', 'content:write', 'content:delete', 'content:moderate',
    'reports:read', 'reports:resolve',
    'analytics:read', 'analytics:export',
    'settings:read', 'settings:write',
    'admin:read', 'admin:write', 'admin:delete',
    'audit:read',
    'system:read', 'system:write',
  ],
  admin: [
    'users:read', 'users:write', 'users:ban',
    'content:read', 'content:write', 'content:delete', 'content:moderate',
    'reports:read', 'reports:resolve',
    'analytics:read', 'analytics:export',
    'settings:read', 'settings:write',
    'admin:read',
    'audit:read',
    'system:read',
  ],
  moderator: [
    'users:read', 'users:ban',
    'content:read', 'content:moderate',
    'reports:read', 'reports:resolve',
    'analytics:read',
  ],
  support: [
    'users:read', 'users:write',
    'content:read',
    'reports:read', 'reports:resolve',
  ],
  analyst: [
    'users:read',
    'content:read',
    'analytics:read', 'analytics:export',
    'reports:read',
  ],
  viewer: [
    'users:read',
    'content:read',
    'analytics:read',
    'reports:read',
  ],
};

export class AdminAuth {
  private redis: Redis;
  private jwtSecret: string;
  private sessionTTL: number;
  private readonly adminPrefix = 'admin:user:';
  private readonly sessionPrefix = 'admin:session:';

  constructor(
    redis: Redis,
    options: {
      jwtSecret: string;
      sessionTTL?: number;
    }
  ) {
    this.redis = redis;
    this.jwtSecret = options.jwtSecret;
    this.sessionTTL = options.sessionTTL || 86400;
  }

  async createAdmin(
    email: string,
    username: string,
    password: string,
    role: AdminRole,
    options: {
      displayName?: string;
      permissions?: Permission[];
      createdBy?: string;
    } = {}
  ): Promise<AdminUser> {
    const existingByEmail = await this.findByEmail(email);
    if (existingByEmail) {
      throw new Error('Email already exists');
    }

    const existingByUsername = await this.findByUsername(username);
    if (existingByUsername) {
      throw new Error('Username already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const basePermissions = ROLE_PERMISSIONS[role];
    const permissions = options.permissions
      ? [...new Set([...basePermissions, ...options.permissions])]
      : basePermissions;

    const admin: AdminUser = {
      id: uuidv4(),
      email,
      username,
      displayName: options.displayName || username,
      passwordHash,
      role,
      permissions,
      mfaEnabled: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options.createdBy,
    };

    await this.saveAdmin(admin);

    await this.redis.set(`${this.adminPrefix}email:${email}`, admin.id);
    await this.redis.set(`${this.adminPrefix}username:${username}`, admin.id);

    return admin;
  }

  async authenticate(
    emailOrUsername: string,
    password: string,
    context: {
      ipAddress: string;
      userAgent: string;
    }
  ): Promise<{
    admin: AdminUser;
    session: AdminSession;
    token: string;
  }> {
    const admin =
      (await this.findByEmail(emailOrUsername)) ||
      (await this.findByUsername(emailOrUsername));

    if (!admin) {
      throw new Error('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new Error('Account is disabled');
    }

    const passwordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        role: admin.role,
        permissions: admin.permissions,
      },
      this.jwtSecret,
      { expiresIn: this.sessionTTL }
    );

    const session: AdminSession = {
      id: uuidv4(),
      adminId: admin.id,
      token,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.sessionTTL * 1000),
      lastActivityAt: new Date(),
      isActive: true,
    };

    await this.redis.set(
      `${this.sessionPrefix}${session.id}`,
      JSON.stringify(session),
      'EX',
      this.sessionTTL
    );

    await this.redis.sadd(`${this.sessionPrefix}admin:${admin.id}`, session.id);

    admin.lastLoginAt = new Date();
    admin.lastLoginIp = context.ipAddress;
    await this.saveAdmin(admin);

    return { admin, session, token };
  }

  async validateToken(token: string): Promise<{
    valid: boolean;
    admin?: AdminUser;
    session?: AdminSession;
  }> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as {
        adminId: string;
        role: AdminRole;
        permissions: Permission[];
      };

      const admin = await this.getAdmin(decoded.adminId);
      if (!admin || !admin.isActive) {
        return { valid: false };
      }

      return { valid: true, admin };
    } catch {
      return { valid: false };
    }
  }

  async logout(sessionId: string): Promise<void> {
    const sessionData = await this.redis.get(`${this.sessionPrefix}${sessionId}`);
    if (sessionData) {
      const session: AdminSession = JSON.parse(sessionData);
      await this.redis.del(`${this.sessionPrefix}${sessionId}`);
      await this.redis.srem(`${this.sessionPrefix}admin:${session.adminId}`, sessionId);
    }
  }

  async logoutAllSessions(adminId: string): Promise<number> {
    const sessionIds = await this.redis.smembers(
      `${this.sessionPrefix}admin:${adminId}`
    );

    if (sessionIds.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    sessionIds.forEach((id) => {
      pipeline.del(`${this.sessionPrefix}${id}`);
    });
    await pipeline.exec();

    await this.redis.del(`${this.sessionPrefix}admin:${adminId}`);

    return sessionIds.length;
  }

  async getAdmin(adminId: string): Promise<AdminUser | null> {
    const data = await this.redis.get(`${this.adminPrefix}${adminId}`);
    if (!data) return null;
    return this.deserializeAdmin(data);
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    const id = await this.redis.get(`${this.adminPrefix}email:${email}`);
    if (!id) return null;
    return this.getAdmin(id);
  }

  async findByUsername(username: string): Promise<AdminUser | null> {
    const id = await this.redis.get(`${this.adminPrefix}username:${username}`);
    if (!id) return null;
    return this.getAdmin(id);
  }

  async updateAdmin(
    adminId: string,
    updates: Partial<Pick<AdminUser, 'displayName' | 'role' | 'permissions' | 'isActive' | 'mfaEnabled'>>
  ): Promise<AdminUser | null> {
    const admin = await this.getAdmin(adminId);
    if (!admin) return null;

    if (updates.role) {
      const basePermissions = ROLE_PERMISSIONS[updates.role];
      updates.permissions = [
        ...new Set([...basePermissions, ...(updates.permissions || [])]),
      ];
    }

    Object.assign(admin, updates, { updatedAt: new Date() });
    await this.saveAdmin(admin);

    return admin;
  }

  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const admin = await this.getAdmin(adminId);
    if (!admin) return false;

    const passwordValid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!passwordValid) return false;

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    admin.updatedAt = new Date();
    await this.saveAdmin(admin);

    await this.logoutAllSessions(adminId);

    return true;
  }

  async resetPassword(adminId: string, newPassword: string): Promise<boolean> {
    const admin = await this.getAdmin(adminId);
    if (!admin) return false;

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    admin.updatedAt = new Date();
    await this.saveAdmin(admin);

    await this.logoutAllSessions(adminId);

    return true;
  }

  async deleteAdmin(adminId: string): Promise<boolean> {
    const admin = await this.getAdmin(adminId);
    if (!admin) return false;

    await this.logoutAllSessions(adminId);
    await this.redis.del(`${this.adminPrefix}${adminId}`);
    await this.redis.del(`${this.adminPrefix}email:${admin.email}`);
    await this.redis.del(`${this.adminPrefix}username:${admin.username}`);

    return true;
  }

  async listAdmins(
    options: {
      role?: AdminRole;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AdminUser[]> {
    const admins: AdminUser[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.adminPrefix}????????-????-????-????-????????????`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const admin = this.deserializeAdmin(data);
          if (options.role && admin.role !== options.role) continue;
          if (options.isActive !== undefined && admin.isActive !== options.isActive) continue;
          admins.push(admin);
        }
      }
    } while (cursor !== '0');

    admins.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return admins.slice(offset, offset + limit);
  }

  hasPermission(admin: AdminUser, permission: Permission): boolean {
    return admin.permissions.includes(permission);
  }

  hasAnyPermission(admin: AdminUser, permissions: Permission[]): boolean {
    return permissions.some((p) => admin.permissions.includes(p));
  }

  hasAllPermissions(admin: AdminUser, permissions: Permission[]): boolean {
    return permissions.every((p) => admin.permissions.includes(p));
  }

  private async saveAdmin(admin: AdminUser): Promise<void> {
    await this.redis.set(`${this.adminPrefix}${admin.id}`, JSON.stringify(admin));
  }

  private deserializeAdmin(data: string): AdminUser {
    const admin = JSON.parse(data);
    admin.createdAt = new Date(admin.createdAt);
    admin.updatedAt = new Date(admin.updatedAt);
    if (admin.lastLoginAt) admin.lastLoginAt = new Date(admin.lastLoginAt);
    return admin;
  }
}
