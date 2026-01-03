// =================================
// NOTIFICATION PREFERENCE SERVICE
// Manages user notification preferences and frequency settings
// =================================

import { PrismaClient, NotificationFrequency } from '@prisma/client';
import { Logger } from '@textmesh/logger';

export interface NotificationPreferenceInput {
  frequency?: NotificationFrequency;
  mutedUntil?: Date;
}

export interface GroupNotificationPreferenceInput {
  groupId: string;
  frequency?: NotificationFrequency;
  mutedUntil?: Date;
}

export class NotificationPreferenceService {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  /**
   * Get user's global notification preference
   */
  async getGlobalPreference(userId: string) {
    let preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_groupId: { userId, groupId: null } }
    });

    if (!preference) {
      // Create default preference
      preference = await this.prisma.notificationPreference.create({
        data: {
          userId,
          groupId: null,
          frequency: 'IMMEDIATE'
        }
      });
    }

    return preference;
  }

  /**
   * Update global notification preference
   */
  async updateGlobalPreference(userId: string, input: NotificationPreferenceInput) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId_groupId: { userId, groupId: null } },
      create: {
        userId,
        groupId: null,
        frequency: input.frequency || 'IMMEDIATE',
        mutedUntil: input.mutedUntil
      },
      update: {
        ...(input.frequency && { frequency: input.frequency }),
        ...(input.mutedUntil !== undefined && { mutedUntil: input.mutedUntil })
      }
    });

    this.logger.info('Updated global notification preference', { userId, frequency: preference.frequency });
    return preference;
  }

  /**
   * Get notification preference for a specific group
   */
  async getGroupPreference(userId: string, groupId: string) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });

    // Fall back to global preference if no group-specific preference
    if (!preference) {
      return this.getGlobalPreference(userId);
    }

    return preference;
  }

  /**
   * Update notification preference for a specific group
   */
  async updateGroupPreference(userId: string, input: GroupNotificationPreferenceInput) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId_groupId: { userId, groupId: input.groupId } },
      create: {
        userId,
        groupId: input.groupId,
        frequency: input.frequency || 'IMMEDIATE',
        mutedUntil: input.mutedUntil
      },
      update: {
        ...(input.frequency && { frequency: input.frequency }),
        ...(input.mutedUntil !== undefined && { mutedUntil: input.mutedUntil })
      }
    });

    this.logger.info('Updated group notification preference', {
      userId,
      groupId: input.groupId,
      frequency: preference.frequency
    });

    return preference;
  }

  /**
   * Get all group-specific preferences for a user
   */
  async getAllGroupPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: {
        userId,
        groupId: { not: null }
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });
  }

  /**
   * Check if user should receive immediate notification
   * Returns true if notification should be sent immediately
   */
  async shouldSendImmediateNotification(userId: string, groupId?: string): Promise<boolean> {
    const preference = groupId
      ? await this.getGroupPreference(userId, groupId)
      : await this.getGlobalPreference(userId);

    // Check if muted
    if (preference.mutedUntil && preference.mutedUntil > new Date()) {
      return false;
    }

    // Only send immediate if frequency is IMMEDIATE
    return preference.frequency === 'IMMEDIATE';
  }

  /**
   * Get users who should receive digest notifications
   * @param frequency - DAILY_DIGEST or WEEKLY_DIGEST
   */
  async getUsersForDigest(frequency: NotificationFrequency): Promise<string[]> {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: {
        frequency,
        OR: [
          { mutedUntil: null },
          { mutedUntil: { lte: new Date() } }
        ]
      },
      select: { userId: true },
      distinct: ['userId']
    });

    return preferences.map(p => p.userId);
  }

  /**
   * Mute notifications for a duration
   */
  async muteNotifications(userId: string, durationHours: number, groupId?: string) {
    const mutedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId_groupId: { userId, groupId: groupId || null } },
      create: {
        userId,
        groupId: groupId || null,
        frequency: 'IMMEDIATE',
        mutedUntil
      },
      update: {
        mutedUntil
      }
    });

    this.logger.info('Muted notifications', {
      userId,
      groupId,
      durationHours,
      mutedUntil
    });

    return preference;
  }

  /**
   * Unmute notifications
   */
  async unmuteNotifications(userId: string, groupId?: string) {
    const preference = await this.prisma.notificationPreference.update({
      where: { userId_groupId: { userId, groupId: groupId || null } },
      data: { mutedUntil: null }
    });

    this.logger.info('Unmuted notifications', { userId, groupId });
    return preference;
  }
}
