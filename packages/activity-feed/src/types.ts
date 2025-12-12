export interface Activity {
  id: string;
  type: ActivityType;
  actorId: string;
  actorType: ActorType;
  verb: ActivityVerb;
  objectId: string;
  objectType: ObjectType;
  targetId?: string;
  targetType?: ObjectType;
  data?: Record<string, unknown>;
  context?: ActivityContext;
  aggregationKey?: string;
  importance: ActivityImportance;
  visibility: ActivityVisibility;
  createdAt: Date;
  expiresAt?: Date;
}

export type ActivityType =
  | 'social'
  | 'content'
  | 'engagement'
  | 'system'
  | 'achievement'
  | 'mention';

export type ActorType = 'user' | 'system' | 'bot';

export type ActivityVerb =
  | 'post'
  | 'comment'
  | 'like'
  | 'share'
  | 'follow'
  | 'unfollow'
  | 'mention'
  | 'reply'
  | 'repost'
  | 'quote'
  | 'bookmark'
  | 'report'
  | 'block'
  | 'mute'
  | 'join'
  | 'leave'
  | 'create'
  | 'update'
  | 'delete'
  | 'achieve'
  | 'level_up'
  | 'badge'
  | 'streak';

export type ObjectType =
  | 'post'
  | 'comment'
  | 'user'
  | 'group'
  | 'hashtag'
  | 'media'
  | 'achievement'
  | 'badge'
  | 'challenge';

export interface ActivityContext {
  ipAddress?: string;
  userAgent?: string;
  platform?: 'web' | 'ios' | 'android';
  referrer?: string;
  sessionId?: string;
}

export type ActivityImportance = 'low' | 'normal' | 'high' | 'critical';
export type ActivityVisibility = 'public' | 'followers' | 'private';

export interface AggregatedActivity {
  id: string;
  key: string;
  activities: Activity[];
  actorIds: string[];
  actorCount: number;
  verb: ActivityVerb;
  objectId: string;
  objectType: ObjectType;
  lastActivityAt: Date;
  createdAt: Date;
}

export interface Feed {
  id: string;
  userId: string;
  type: FeedType;
  activities: Activity[];
  cursor?: string;
  hasMore: boolean;
}

export type FeedType =
  | 'home'
  | 'user'
  | 'notifications'
  | 'mentions'
  | 'following'
  | 'trending'
  | 'discover';

export interface FeedItem {
  activity: Activity | AggregatedActivity;
  isAggregated: boolean;
  seen: boolean;
  read: boolean;
  enrichedData?: EnrichedData;
}

export interface EnrichedData {
  actor?: UserSummary;
  actors?: UserSummary[];
  object?: ContentSummary;
  target?: ContentSummary | UserSummary;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

export interface ContentSummary {
  id: string;
  type: ObjectType;
  title?: string;
  preview?: string;
  imageUrl?: string;
  url?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  activityId?: string;
  data?: Record<string, unknown>;
  seen: boolean;
  read: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'follow'
  | 'repost'
  | 'quote'
  | 'achievement'
  | 'badge'
  | 'streak'
  | 'challenge'
  | 'system'
  | 'marketing';

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  types: {
    [K in NotificationType]?: {
      enabled: boolean;
      push: boolean;
      email: boolean;
      inApp: boolean;
    };
  };
  aggregation: {
    enabled: boolean;
    windowMinutes: number;
    maxItems: number;
  };
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
}

export interface FeedSubscription {
  id: string;
  subscriberId: string;
  targetId: string;
  targetType: 'user' | 'hashtag' | 'group';
  feedType: FeedType;
  createdAt: Date;
}

export interface FeedConfig {
  maxFeedSize: number;
  maxAggregationWindow: number;
  maxAggregationSize: number;
  activityTTL: number;
  notificationTTL: number;
  enableAggregation: boolean;
  enableRealtime: boolean;
}

export interface FeedStats {
  userId: string;
  totalActivities: number;
  unreadNotifications: number;
  unseenNotifications: number;
  lastActivityAt?: Date;
  lastSeenAt?: Date;
}

export interface ActivityFilter {
  types?: ActivityType[];
  verbs?: ActivityVerb[];
  actorIds?: string[];
  objectTypes?: ObjectType[];
  importance?: ActivityImportance[];
  since?: Date;
  until?: Date;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
  direction?: 'forward' | 'backward';
}
