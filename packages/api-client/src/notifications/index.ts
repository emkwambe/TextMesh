/**
 * TextMesh Notifications API Module
 */

import type { HttpClient } from '../client';
import type {
  Notification,
  NotificationSettings,
  PaginationParams,
} from '../types';

export class NotificationsApi {
  constructor(private client: HttpClient) {}

  /**
   * Get all notifications
   */
  async list(
    params?: PaginationParams & { filter?: 'all' | 'mentions' | 'unread' }
  ): Promise<{
    notifications: Notification[];
    cursor?: string;
    hasMore: boolean;
    unreadCount: number;
  }> {
    const response = await this.client.get<{
      notifications: Notification[];
      cursor?: string;
      hasMore: boolean;
      unreadCount: number;
    }>('/notifications', { params });
    return response.data;
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<{ count: number }> {
    const response = await this.client.get<{ count: number }>(
      '/notifications/unread/count'
    );
    return response.data;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.client.post(`/notifications/${notificationId}/read`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await this.client.post('/notifications/read-all');
  }

  /**
   * Delete a notification
   */
  async delete(notificationId: string): Promise<void> {
    await this.client.delete(`/notifications/${notificationId}`);
  }

  /**
   * Clear all notifications
   */
  async clearAll(): Promise<void> {
    await this.client.delete('/notifications/all');
  }

  /**
   * Get notification settings
   */
  async getSettings(): Promise<NotificationSettings> {
    const response = await this.client.get<NotificationSettings>(
      '/notifications/settings'
    );
    return response.data;
  }

  /**
   * Update notification settings
   */
  async updateSettings(
    settings: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    const response = await this.client.patch<NotificationSettings>(
      '/notifications/settings',
      settings
    );
    return response.data;
  }

  /**
   * Register push notification token
   */
  async registerPushToken(
    token: string,
    platform: 'ios' | 'android' | 'web'
  ): Promise<void> {
    await this.client.post('/notifications/push/register', {
      token,
      platform,
    });
  }

  /**
   * Unregister push notification token
   */
  async unregisterPushToken(token: string): Promise<void> {
    await this.client.post('/notifications/push/unregister', { token });
  }

  /**
   * Test push notification
   */
  async testPush(): Promise<void> {
    await this.client.post('/notifications/push/test');
  }
}
