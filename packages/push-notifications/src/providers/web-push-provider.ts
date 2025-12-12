import webPush from 'web-push';
import {
  PushSubscription,
  PushNotification,
  DeliveryResult,
  WebPushConfig,
} from '../types';

export class WebPushProvider {
  constructor(config: WebPushConfig) {
    webPush.setVapidDetails(
      `mailto:${config.contactEmail}`,
      config.vapidPublicKey,
      config.vapidPrivateKey
    );
  }

  async send(
    notification: PushNotification,
    subscriptions: PushSubscription[]
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: '/icons/notification-icon.png',
      badge: '/icons/badge-icon.png',
      image: notification.imageUrl,
      data: {
        ...notification.data,
        notificationId: notification.id,
        category: notification.category,
        actionUrl: notification.actionUrl,
        timestamp: Date.now(),
      },
      tag: notification.collapseKey,
      renotify: true,
      requireInteraction: notification.priority === 'high',
      actions: this.getActionsForCategory(notification.category),
    });

    const options: webPush.RequestOptions = {
      TTL: notification.ttl || 86400,
      urgency: this.mapPriority(notification.priority),
      topic: notification.collapseKey,
    };

    const sendPromises = subscriptions.map(async (subscription) => {
      try {
        const response = await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload,
          options
        );

        return {
          notificationId: notification.id,
          userId: subscription.userId,
          deviceTokenId: subscription.id,
          platform: 'web' as const,
          success: true,
          messageId: `web_${Date.now()}_${subscription.id}`,
          deliveredAt: new Date(),
        };
      } catch (error) {
        const webPushError = error as webPush.WebPushError;
        return {
          notificationId: notification.id,
          userId: subscription.userId,
          deviceTokenId: subscription.id,
          platform: 'web' as const,
          success: false,
          error: {
            code: String(webPushError.statusCode || 'UNKNOWN'),
            message: this.getErrorMessage(webPushError),
          },
        };
      }
    });

    const settled = await Promise.all(sendPromises);
    results.push(...settled);

    return results;
  }

  async sendBatch(
    notifications: Array<{
      notification: PushNotification;
      subscription: PushSubscription;
    }>
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    const batchSize = 100;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(({ notification, subscription }) =>
          this.send(notification, [subscription])
        )
      );
      results.push(...batchResults.flat());
    }

    return results;
  }

  async validateSubscription(subscription: PushSubscription): Promise<boolean> {
    try {
      const testPayload = JSON.stringify({ type: 'test' });
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        testPayload,
        { TTL: 0 }
      );
      return true;
    } catch (error) {
      const webPushError = error as webPush.WebPushError;
      return webPushError.statusCode !== 410 && webPushError.statusCode !== 404;
    }
  }

  private mapPriority(priority: string): 'very-low' | 'low' | 'normal' | 'high' {
    switch (priority) {
      case 'high':
        return 'high';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }

  private getActionsForCategory(category: string): Array<{ action: string; title: string }> {
    const actions: Record<string, Array<{ action: string; title: string }>> = {
      message: [
        { action: 'reply', title: 'Reply' },
        { action: 'view', title: 'View' },
      ],
      mention: [
        { action: 'view', title: 'View' },
        { action: 'reply', title: 'Reply' },
      ],
      follow: [
        { action: 'view_profile', title: 'View Profile' },
        { action: 'follow_back', title: 'Follow Back' },
      ],
      like: [{ action: 'view', title: 'View Post' }],
      comment: [
        { action: 'view', title: 'View' },
        { action: 'reply', title: 'Reply' },
      ],
      repost: [{ action: 'view', title: 'View' }],
      social: [{ action: 'view', title: 'View' }],
      system: [{ action: 'view', title: 'Learn More' }],
      marketing: [
        { action: 'view', title: 'Learn More' },
        { action: 'dismiss', title: 'Not Interested' },
      ],
      reminder: [
        { action: 'view', title: 'View' },
        { action: 'snooze', title: 'Snooze' },
      ],
    };
    return actions[category] || [{ action: 'view', title: 'View' }];
  }

  private getErrorMessage(error: webPush.WebPushError): string {
    switch (error.statusCode) {
      case 400:
        return 'Invalid request';
      case 401:
        return 'Unauthorized - invalid VAPID credentials';
      case 403:
        return 'Forbidden - endpoint does not accept notifications';
      case 404:
        return 'Subscription not found';
      case 410:
        return 'Subscription has expired or been unsubscribed';
      case 413:
        return 'Payload too large';
      case 429:
        return 'Too many requests';
      case 500:
        return 'Push service internal error';
      case 503:
        return 'Push service unavailable';
      default:
        return error.message || 'Unknown error';
    }
  }
}
