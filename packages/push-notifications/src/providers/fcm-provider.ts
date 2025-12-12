import * as admin from 'firebase-admin';
import {
  DeviceToken,
  PushNotification,
  DeliveryResult,
  FCMConfig,
} from '../types';

export class FCMProvider {
  private app: admin.app.App;
  private messaging: admin.messaging.Messaging;

  constructor(config: FCMConfig) {
    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
    });
    this.messaging = this.app.messaging();
  }

  async send(
    notification: PushNotification,
    tokens: DeviceToken[]
  ): Promise<DeliveryResult[]> {
    const androidTokens = tokens.filter((t) => t.platform === 'android');
    if (androidTokens.length === 0) return [];

    const results: DeliveryResult[] = [];

    const message: admin.messaging.MulticastMessage = {
      tokens: androidTokens.map((t) => t.token),
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: notification.data,
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        ttl: (notification.ttl || 86400) * 1000,
        collapseKey: notification.collapseKey,
        notification: {
          channelId: this.getCategoryChannel(notification.category),
          icon: 'ic_notification',
          color: '#1DA1F2',
          clickAction: 'OPEN_ACTIVITY',
          tag: notification.collapseKey,
        },
      },
      webpush: {
        headers: {
          TTL: String(notification.ttl || 86400),
          Urgency: notification.priority === 'high' ? 'high' : 'normal',
        },
        notification: {
          icon: '/icons/notification-icon.png',
          badge: '/icons/badge-icon.png',
          tag: notification.collapseKey,
          renotify: true,
        },
        fcmOptions: {
          link: notification.actionUrl,
        },
      },
    };

    try {
      const response = await this.messaging.sendEachForMulticast(message);

      response.responses.forEach((resp, index) => {
        const token = androidTokens[index];
        results.push({
          notificationId: notification.id,
          userId: token.userId,
          deviceTokenId: token.id,
          platform: token.platform,
          success: resp.success,
          messageId: resp.messageId,
          error: resp.error
            ? {
                code: resp.error.code,
                message: resp.error.message,
              }
            : undefined,
          deliveredAt: resp.success ? new Date() : undefined,
        });
      });
    } catch (error) {
      androidTokens.forEach((token) => {
        results.push({
          notificationId: notification.id,
          userId: token.userId,
          deviceTokenId: token.id,
          platform: token.platform,
          success: false,
          error: {
            code: 'SEND_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      });
    }

    return results;
  }

  async sendToTopic(
    topic: string,
    notification: PushNotification
  ): Promise<string> {
    const message: admin.messaging.Message = {
      topic,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
      },
      data: notification.data,
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        ttl: (notification.ttl || 86400) * 1000,
      },
    };

    return this.messaging.send(message);
  }

  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    await this.messaging.subscribeToTopic(tokens, topic);
  }

  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    await this.messaging.unsubscribeFromTopic(tokens, topic);
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      const dryRunMessage: admin.messaging.Message = {
        token,
        notification: { title: 'test' },
      };
      await this.messaging.send(dryRunMessage, true);
      return true;
    } catch {
      return false;
    }
  }

  private getCategoryChannel(category: string): string {
    const channels: Record<string, string> = {
      message: 'messages',
      social: 'social',
      mention: 'mentions',
      follow: 'social',
      like: 'engagement',
      comment: 'engagement',
      repost: 'engagement',
      system: 'system',
      marketing: 'marketing',
      reminder: 'reminders',
    };
    return channels[category] || 'default';
  }

  async shutdown(): Promise<void> {
    await this.app.delete();
  }
}
