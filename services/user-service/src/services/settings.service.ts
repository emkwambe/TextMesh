// =================================
// SETTINGS SERVICE
// =================================

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from '@textmesh/logger';
import { ErrorCode, AppError, UserSettings } from '@textmesh/shared-types';
import { CacheKeys, CacheManager } from '@textmesh/db-client';

export class SettingsService {
  private cache: CacheManager;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {
    this.cache = new CacheManager(redis, 300);
  }

  async getSettings(userId: string): Promise<UserSettings> {
    const cached = await this.cache.get<UserSettings>(CacheKeys.userSettings(userId));
    if (cached) return cached;

    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }

    const result = this.toUserSettings(settings);
    await this.cache.set(CacheKeys.userSettings(userId), result);

    return result;
  }

  async updateSettings(
    userId: string,
    data: Partial<{
      emailNotifications: boolean;
      pushNotifications: boolean;
      smsNotifications: boolean;
      privateAccount: boolean;
      showOnlineStatus: boolean;
      allowMentions: string;
      allowDirectMessages: string;
      language: string;
      timezone: string;
      theme: string;
      doNotSellData: boolean;
    }>
  ): Promise<UserSettings> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data, updatedAt: new Date() },
    });

    // If privacy setting changed, update user record too
    if (data.privateAccount !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPrivate: data.privateAccount },
      });
      await this.cache.delete(CacheKeys.userProfile(userId));
    }

    await this.cache.delete(CacheKeys.userSettings(userId));

    this.logger.info('Settings updated', { userId });

    return this.toUserSettings(settings);
  }

  async requestDataExport(userId: string): Promise<{
    exportId: string;
    status: string;
    message: string;
  }> {
    // Check for existing pending export
    const existingExport = await this.prisma.dataExport.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingExport) {
      throw new AppError(
        ErrorCode.EXPORT_IN_PROGRESS,
        'A data export is already in progress',
        409
      );
    }

    const dataExport = await this.prisma.dataExport.create({
      data: {
        userId,
        format: 'JSON',
        status: 'PENDING',
      },
    });

    // Mark in settings
    await this.prisma.userSettings.update({
      where: { userId },
      data: { dataExportRequested: true },
    });

    this.logger.info('Data export requested', { userId, exportId: dataExport.id });

    // TODO: Trigger async job to generate export

    return {
      exportId: dataExport.id,
      status: 'PENDING',
      message: 'Your data export has been requested. You will be notified when it is ready.',
    };
  }

  async getExportStatus(userId: string, exportId: string): Promise<{
    status: string;
    downloadUrl?: string;
    expiresAt?: Date;
  }> {
    const dataExport = await this.prisma.dataExport.findFirst({
      where: { id: exportId, userId },
    });

    if (!dataExport) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Export not found', 404);
    }

    return {
      status: dataExport.status,
      downloadUrl: dataExport.downloadUrl || undefined,
      expiresAt: dataExport.expiresAt || undefined,
    };
  }

  async requestAccountDeletion(userId: string, reason?: string): Promise<{
    success: boolean;
    scheduledDeletionDate: Date;
    message: string;
  }> {
    // Check if already scheduled
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (settings?.deletionRequested) {
      throw new AppError(
        ErrorCode.DELETION_IN_PROGRESS,
        'Account deletion is already scheduled',
        409
      );
    }

    // Schedule deletion 30 days from now (GDPR grace period)
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 30);

    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        deletionRequested: true,
        deletionScheduledAt: scheduledDate,
      },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DATA_DELETION_REQUESTED',
        resource: 'user',
        resourceId: userId,
        metadata: { reason, scheduledDate },
      },
    });

    this.logger.info('Account deletion requested', { userId, scheduledDate });

    return {
      success: true,
      scheduledDeletionDate: scheduledDate,
      message: `Your account is scheduled for deletion on ${scheduledDate.toDateString()}. You can cancel this within the next 30 days.`,
    };
  }

  async cancelAccountDeletion(userId: string): Promise<void> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings?.deletionRequested) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        'No account deletion is scheduled',
        400
      );
    }

    await this.prisma.userSettings.update({
      where: { userId },
      data: {
        deletionRequested: false,
        deletionScheduledAt: null,
      },
    });

    // Log audit entry
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DATA_DELETION_CANCELLED',
        resource: 'user',
        resourceId: userId,
      },
    });

    this.logger.info('Account deletion cancelled', { userId });
  }

  private toUserSettings(settings: any): UserSettings {
    return {
      userId: settings.userId,
      emailNotifications: settings.emailNotifications,
      pushNotifications: settings.pushNotifications,
      smsNotifications: settings.smsNotifications,
      privateAccount: settings.privateAccount,
      showOnlineStatus: settings.showOnlineStatus,
      allowMentions: settings.allowMentions.toLowerCase(),
      allowDirectMessages: settings.allowDirectMessages.toLowerCase(),
      language: settings.language,
      timezone: settings.timezone,
      theme: settings.theme.toLowerCase(),
      doNotSellData: settings.doNotSellData,
      dataExportRequested: settings.dataExportRequested,
      deletionRequested: settings.deletionRequested,
      updatedAt: settings.updatedAt,
    };
  }
}
