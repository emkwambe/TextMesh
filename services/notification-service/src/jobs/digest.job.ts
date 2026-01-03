// =================================
// NOTIFICATION DIGEST JOB
// Sends daily/weekly digest emails for batched notifications
// =================================

import { PrismaClient, NotificationFrequency } from '@prisma/client';
import { Logger } from '@textmesh/logger';
import { NotificationPreferenceService } from '../services/notification-preference.service.js';

export class DigestJob {
  private preferenceService: NotificationPreferenceService;
  private dailyJobInterval: NodeJS.Timeout | null = null;
  private weeklyJobInterval: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {
    this.preferenceService = new NotificationPreferenceService(prisma, logger);
  }

  /**
   * Start the digest jobs
   */
  start() {
    // Run daily digest at 9 AM every day
    this.scheduleDailyDigest();

    // Run weekly digest on Monday at 9 AM every week
    this.scheduleWeeklyDigest();

    this.logger.info('Digest jobs started');
  }

  /**
   * Stop the digest jobs
   */
  stop() {
    if (this.dailyJobInterval) {
      clearInterval(this.dailyJobInterval);
      this.dailyJobInterval = null;
    }

    if (this.weeklyJobInterval) {
      clearInterval(this.weeklyJobInterval);
      this.weeklyJobInterval = null;
    }

    this.logger.info('Digest jobs stopped');
  }

  /**
   * Schedule daily digest job
   */
  private scheduleDailyDigest() {
    const scheduleTime = this.getNextScheduleTime(9, 0); // 9:00 AM
    const delay = scheduleTime.getTime() - Date.now();

    setTimeout(() => {
      this.runDailyDigest();
      // Run every 24 hours
      this.dailyJobInterval = setInterval(() => {
        this.runDailyDigest();
      }, 24 * 60 * 60 * 1000);
    }, delay);

    this.logger.info('Daily digest scheduled', { nextRun: scheduleTime });
  }

  /**
   * Schedule weekly digest job
   */
  private scheduleWeeklyDigest() {
    const scheduleTime = this.getNextMondayAt(9, 0); // Monday 9:00 AM
    const delay = scheduleTime.getTime() - Date.now();

    setTimeout(() => {
      this.runWeeklyDigest();
      // Run every 7 days
      this.weeklyJobInterval = setInterval(() => {
        this.runWeeklyDigest();
      }, 7 * 24 * 60 * 60 * 1000);
    }, delay);

    this.logger.info('Weekly digest scheduled', { nextRun: scheduleTime });
  }

  /**
   * Run daily digest
   */
  private async runDailyDigest() {
    this.logger.info('Running daily digest job');

    try {
      const userIds = await this.preferenceService.getUsersForDigest('DAILY_DIGEST');

      for (const userId of userIds) {
        await this.sendDigest(userId, 'DAILY_DIGEST');
      }

      this.logger.info('Daily digest job completed', { userCount: userIds.length });
    } catch (error) {
      this.logger.error('Daily digest job failed', { error });
    }
  }

  /**
   * Run weekly digest
   */
  private async runWeeklyDigest() {
    this.logger.info('Running weekly digest job');

    try {
      const userIds = await this.preferenceService.getUsersForDigest('WEEKLY_DIGEST');

      for (const userId of userIds) {
        await this.sendDigest(userId, 'WEEKLY_DIGEST');
      }

      this.logger.info('Weekly digest job completed', { userCount: userIds.length });
    } catch (error) {
      this.logger.error('Weekly digest job failed', { error });
    }
  }

  /**
   * Send digest notification to a user
   */
  private async sendDigest(userId: string, frequency: NotificationFrequency) {
    const now = new Date();
    const cutoffDate = frequency === 'DAILY_DIGEST'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000) // Last 24 hours
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    // Get unread notifications since cutoff
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        read: false,
        createdAt: { gte: cutoffDate }
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to 50 notifications per digest
    });

    if (notifications.length === 0) {
      this.logger.debug('No notifications for digest', { userId, frequency });
      return;
    }

    // Group notifications by type
    const grouped = this.groupNotifications(notifications);

    // Get user email
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, username: true }
    });

    if (!user || !user.email) {
      this.logger.warn('User not found or has no email', { userId });
      return;
    }

    // Send digest email
    await this.sendDigestEmail(user, grouped, frequency);

    this.logger.info('Digest sent', {
      userId,
      frequency,
      notificationCount: notifications.length
    });
  }

  /**
   * Group notifications by type for digest
   */
  private groupNotifications(notifications: any[]) {
    const grouped: Record<string, any[]> = {};

    for (const notification of notifications) {
      if (!grouped[notification.type]) {
        grouped[notification.type] = [];
      }
      grouped[notification.type]!.push(notification);
    }

    return grouped;
  }

  /**
   * Send digest email
   */
  private async sendDigestEmail(
    user: { email: string; displayName: string | null; username: string },
    groupedNotifications: Record<string, any[]>,
    frequency: NotificationFrequency
  ) {
    // TODO: Integrate with email service to send actual digest email
    // For now, just log
    this.logger.info('Would send digest email', {
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      frequency,
      types: Object.keys(groupedNotifications),
      totalCount: Object.values(groupedNotifications).reduce((sum, arr) => sum + arr.length, 0)
    });

    // Example email content structure:
    // Subject: Your daily/weekly digest from TextMesh
    // Body:
    // - X new followers
    // - Y likes on your posts
    // - Z replies to your posts
    // - A group invites
    // etc.
  }

  /**
   * Get next schedule time for a specific hour and minute
   */
  private getNextScheduleTime(hour: number, minute: number): Date {
    const now = new Date();
    const scheduled = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );

    // If time has passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled;
  }

  /**
   * Get next Monday at specific time
   */
  private getNextMondayAt(hour: number, minute: number): Date {
    const now = new Date();
    const scheduled = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );

    // Get days until next Monday (1 = Monday)
    const currentDay = now.getDay();
    const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay) % 7;

    scheduled.setDate(scheduled.getDate() + daysUntilMonday);

    // If it's Monday but time has passed, schedule for next Monday
    if (daysUntilMonday === 0 && scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 7);
    }

    return scheduled;
  }
}
