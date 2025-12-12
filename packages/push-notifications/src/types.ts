export interface PushNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  actionUrl?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  ttl?: number;
  collapseKey?: string;
  createdAt: Date;
  scheduledAt?: Date;
  sentAt?: Date;
  status: NotificationStatus;
}

export type NotificationCategory =
  | 'social'
  | 'message'
  | 'mention'
  | 'follow'
  | 'like'
  | 'comment'
  | 'repost'
  | 'system'
  | 'marketing'
  | 'reminder';

export type NotificationPriority = 'high' | 'normal' | 'low';

export type NotificationStatus =
  | 'pending'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: Platform;
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
  createdAt: Date;
  lastUsedAt: Date;
  isActive: boolean;
}

export type Platform = 'ios' | 'android' | 'web';

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
  lastUsedAt: Date;
  isActive: boolean;
}

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  categories: {
    [K in NotificationCategory]?: {
      enabled: boolean;
      push: boolean;
      email: boolean;
      inApp: boolean;
    };
  };
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  frequency?: 'realtime' | 'hourly' | 'daily';
  updatedAt: Date;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  category: NotificationCategory;
  titleTemplate: string;
  bodyTemplate: string;
  dataTemplate?: Record<string, string>;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchNotification {
  id: string;
  templateId?: string;
  notification: Omit<PushNotification, 'id' | 'userId' | 'createdAt' | 'status'>;
  userIds?: string[];
  segmentId?: string;
  filters?: UserFilter[];
  scheduledAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stats: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
  };
  createdAt: Date;
  completedAt?: Date;
}

export interface UserFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: unknown;
}

export interface DeliveryResult {
  notificationId: string;
  userId: string;
  deviceTokenId: string;
  platform: Platform;
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
  deliveredAt?: Date;
}

export interface NotificationStats {
  period: string;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  byCategory: Record<NotificationCategory, {
    sent: number;
    delivered: number;
    opened: number;
  }>;
  byPlatform: Record<Platform, {
    sent: number;
    delivered: number;
    failed: number;
  }>;
}

export interface FCMConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface APNSConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  production: boolean;
}

export interface WebPushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  contactEmail: string;
}

export interface PushConfig {
  fcm?: FCMConfig;
  apns?: APNSConfig;
  webPush?: WebPushConfig;
  defaultTtl: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}
