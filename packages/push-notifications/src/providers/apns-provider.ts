import apn from 'apn';
import {
  DeviceToken,
  PushNotification,
  DeliveryResult,
  APNSConfig,
} from '../types';

export class APNSProvider {
  private provider: apn.Provider;
  private bundleId: string;

  constructor(config: APNSConfig, bundleId: string = 'com.textmesh.app') {
    this.bundleId = bundleId;
    this.provider = new apn.Provider({
      token: {
        key: config.privateKey,
        keyId: config.keyId,
        teamId: config.teamId,
      },
      production: config.production,
    });
  }

  async send(
    notification: PushNotification,
    tokens: DeviceToken[]
  ): Promise<DeliveryResult[]> {
    const iosTokens = tokens.filter((t) => t.platform === 'ios');
    if (iosTokens.length === 0) return [];

    const results: DeliveryResult[] = [];

    const apnsNotification = new apn.Notification();
    apnsNotification.alert = {
      title: notification.title,
      body: notification.body,
    };
    apnsNotification.badge = 1;
    apnsNotification.sound = 'default';
    apnsNotification.topic = this.bundleId;
    apnsNotification.payload = notification.data || {};
    apnsNotification.category = notification.category;
    apnsNotification.threadId = notification.collapseKey;
    apnsNotification.expiry = Math.floor(Date.now() / 1000) + (notification.ttl || 86400);
    apnsNotification.priority = notification.priority === 'high' ? 10 : 5;

    if (notification.imageUrl) {
      apnsNotification.mutableContent = true;
      apnsNotification.payload['media-url'] = notification.imageUrl;
    }

    if (notification.actionUrl) {
      apnsNotification.payload['action-url'] = notification.actionUrl;
    }

    const tokenStrings = iosTokens.map((t) => t.token);

    try {
      const response = await this.provider.send(apnsNotification, tokenStrings);

      response.sent.forEach((sent) => {
        const token = iosTokens.find((t) => t.token === sent.device);
        if (token) {
          results.push({
            notificationId: notification.id,
            userId: token.userId,
            deviceTokenId: token.id,
            platform: 'ios',
            success: true,
            messageId: `apns_${Date.now()}_${token.id}`,
            deliveredAt: new Date(),
          });
        }
      });

      response.failed.forEach((failed) => {
        const token = iosTokens.find((t) => t.token === failed.device);
        if (token) {
          results.push({
            notificationId: notification.id,
            userId: token.userId,
            deviceTokenId: token.id,
            platform: 'ios',
            success: false,
            error: {
              code: failed.response?.reason || 'UNKNOWN',
              message: this.getErrorMessage(failed.response?.reason),
            },
          });
        }
      });
    } catch (error) {
      iosTokens.forEach((token) => {
        results.push({
          notificationId: notification.id,
          userId: token.userId,
          deviceTokenId: token.id,
          platform: 'ios',
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

  async sendSilent(
    tokens: DeviceToken[],
    data: Record<string, unknown>
  ): Promise<DeliveryResult[]> {
    const iosTokens = tokens.filter((t) => t.platform === 'ios');
    if (iosTokens.length === 0) return [];

    const notification = new apn.Notification();
    notification.contentAvailable = true;
    notification.topic = this.bundleId;
    notification.payload = data;
    notification.priority = 5;

    const response = await this.provider.send(
      notification,
      iosTokens.map((t) => t.token)
    );

    const results: DeliveryResult[] = [];

    response.sent.forEach((sent) => {
      const token = iosTokens.find((t) => t.token === sent.device);
      if (token) {
        results.push({
          notificationId: 'silent',
          userId: token.userId,
          deviceTokenId: token.id,
          platform: 'ios',
          success: true,
          deliveredAt: new Date(),
        });
      }
    });

    return results;
  }

  async validateToken(token: string): Promise<boolean> {
    const notification = new apn.Notification();
    notification.contentAvailable = true;
    notification.topic = this.bundleId;
    notification.priority = 5;

    try {
      const response = await this.provider.send(notification, [token]);
      return response.sent.length > 0;
    } catch {
      return false;
    }
  }

  private getErrorMessage(reason?: string): string {
    const messages: Record<string, string> = {
      BadDeviceToken: 'Invalid device token',
      Unregistered: 'Device is no longer registered',
      PayloadTooLarge: 'Notification payload exceeds size limit',
      BadTopic: 'Invalid topic',
      TopicDisallowed: 'Topic is not allowed',
      BadMessageId: 'Invalid message ID',
      BadExpirationDate: 'Invalid expiration date',
      BadPriority: 'Invalid priority',
      MissingDeviceToken: 'Device token is missing',
      BadCertificate: 'Invalid certificate',
      BadCertificateEnvironment: 'Certificate environment mismatch',
      ExpiredProviderToken: 'Provider token has expired',
      Forbidden: 'Request forbidden',
      InvalidProviderToken: 'Invalid provider token',
      MissingProviderToken: 'Provider token is missing',
      BadPath: 'Invalid path',
      MethodNotAllowed: 'Method not allowed',
      TooManyRequests: 'Too many requests',
      IdleTimeout: 'Connection timed out',
      Shutdown: 'Server is shutting down',
      InternalServerError: 'APNs internal error',
      ServiceUnavailable: 'APNs service unavailable',
    };
    return messages[reason || ''] || 'Unknown error';
  }

  shutdown(): void {
    this.provider.shutdown();
  }
}
