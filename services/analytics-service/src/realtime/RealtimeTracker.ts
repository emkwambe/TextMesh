// =================================
// TEXTMESH REALTIME TRACKER
// Real-time Analytics Processing
// =================================

import Redis from 'ioredis';

// ============ REALTIME TYPES ============

export interface RealtimeStats {
  timestamp: Date;
  activeUsers: number;
  currentSessions: number;
  postsPerMinute: number;
  likesPerMinute: number;
  commentsPerMinute: number;
  topHashtags: Array<{ tag: string; count: number }>;
  topPosts: Array<{ postId: string; engagement: number }>;
  geographicDistribution: Record<string, number>;
}

export interface AnalyticsEvent {
  type: EventType;
  userId?: string;
  properties: Record<string, unknown>;
  timestamp?: string;
}

export type EventType =
  | 'page_view'
  | 'session_start'
  | 'session_end'
  | 'post_create'
  | 'post_view'
  | 'like'
  | 'unlike'
  | 'comment'
  | 'share'
  | 'follow'
  | 'unfollow'
  | 'search'
  | 'notification_click'
  | 'signup'
  | 'login'
  | 'logout';

export interface ActiveSession {
  userId: string;
  sessionId: string;
  startedAt: Date;
  lastActivity: Date;
  pageViews: number;
  device?: string;
  location?: string;
}

// ============ REALTIME TRACKER CLASS ============

export class RealtimeTracker {
  private redis: Redis;
  private readonly SESSION_TTL = 1800; // 30 minutes
  private readonly METRIC_TTL = 3600; // 1 hour

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get current real-time stats
   */
  async getCurrentStats(): Promise<RealtimeStats> {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60000);

    const [
      activeUsers,
      currentSessions,
      postsPerMinute,
      likesPerMinute,
      commentsPerMinute,
      topHashtags,
      topPosts,
      geographicDistribution,
    ] = await Promise.all([
      this.getActiveUserCount(),
      this.getSessionCount(),
      this.getEventRate('post_create', minuteAgo),
      this.getEventRate('like', minuteAgo),
      this.getEventRate('comment', minuteAgo),
      this.getTopHashtags(10),
      this.getTopPosts(10),
      this.getGeographicDistribution(),
    ]);

    return {
      timestamp: now,
      activeUsers,
      currentSessions,
      postsPerMinute,
      likesPerMinute,
      commentsPerMinute,
      topHashtags,
      topPosts,
      geographicDistribution,
    };
  }

  /**
   * Track an analytics event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
    const minuteKey = this.getMinuteKey(timestamp);

    // Increment event counter
    await this.redis.hincrby(`events:${minuteKey}`, event.type, 1);
    await this.redis.expire(`events:${minuteKey}`, this.METRIC_TTL);

    // Track user activity
    if (event.userId) {
      await this.trackUserActivity(event.userId, event.type, timestamp);
    }

    // Handle specific event types
    switch (event.type) {
      case 'session_start':
        await this.handleSessionStart(event);
        break;
      case 'session_end':
        await this.handleSessionEnd(event);
        break;
      case 'page_view':
        await this.handlePageView(event);
        break;
      case 'post_create':
        await this.handlePostCreate(event);
        break;
      case 'search':
        await this.handleSearch(event);
        break;
    }

    // Store in event stream
    await this.redis.lpush('events:stream', JSON.stringify({
      ...event,
      timestamp: timestamp.toISOString(),
    }));
    await this.redis.ltrim('events:stream', 0, 9999);
  }

  /**
   * Track user activity
   */
  private async trackUserActivity(
    userId: string,
    eventType: string,
    timestamp: Date
  ): Promise<void> {
    const key = `user:activity:${userId}`;
    const today = timestamp.toISOString().split('T')[0];

    // Update last activity
    await this.redis.hset(key, 'lastActivity', timestamp.toISOString());
    await this.redis.hset(key, 'lastEvent', eventType);
    await this.redis.expire(key, this.SESSION_TTL);

    // Add to active users set
    await this.redis.sadd(`active:users:realtime`, userId);
    await this.redis.expire('active:users:realtime', 300);

    // Add to daily active users
    await this.redis.sadd(`active:users:${today}`, userId);
    await this.redis.expire(`active:users:${today}`, 86400 * 7);
  }

  /**
   * Handle session start
   */
  private async handleSessionStart(event: AnalyticsEvent): Promise<void> {
    if (!event.userId) return;

    const sessionId = event.properties['sessionId'] as string;
    const sessionKey = `session:${sessionId}`;

    await this.redis.hset(sessionKey, {
      userId: event.userId,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      pageViews: 0,
      device: event.properties['device'] as string || 'unknown',
      location: event.properties['location'] as string || 'unknown',
    });

    await this.redis.expire(sessionKey, this.SESSION_TTL);
    await this.redis.sadd('sessions:active', sessionId);
    await this.redis.incr('metrics:sessions:today');
  }

  /**
   * Handle session end
   */
  private async handleSessionEnd(event: AnalyticsEvent): Promise<void> {
    const sessionId = event.properties['sessionId'] as string;
    if (!sessionId) return;

    const sessionKey = `session:${sessionId}`;
    const session = await this.redis.hgetall(sessionKey);

    if (session['startedAt']) {
      // Calculate session duration
      const startTime = new Date(session['startedAt']).getTime();
      const duration = Date.now() - startTime;

      // Update average session duration
      await this.redis.lpush('metrics:session_durations', duration.toString());
      await this.redis.ltrim('metrics:session_durations', 0, 999);
    }

    await this.redis.del(sessionKey);
    await this.redis.srem('sessions:active', sessionId);
  }

  /**
   * Handle page view
   */
  private async handlePageView(event: AnalyticsEvent): Promise<void> {
    const sessionId = event.properties['sessionId'] as string;
    if (sessionId) {
      await this.redis.hincrby(`session:${sessionId}`, 'pageViews', 1);
      await this.redis.expire(`session:${sessionId}`, this.SESSION_TTL);
    }

    const page = event.properties['page'] as string;
    if (page) {
      const hourKey = this.getHourKey(new Date());
      await this.redis.hincrby(`pageviews:${hourKey}`, page, 1);
      await this.redis.expire(`pageviews:${hourKey}`, this.METRIC_TTL);
    }
  }

  /**
   * Handle post creation
   */
  private async handlePostCreate(event: AnalyticsEvent): Promise<void> {
    const hashtags = event.properties['hashtags'] as string[];
    if (hashtags?.length) {
      for (const tag of hashtags) {
        await this.redis.zincrby('hashtags:trending', 1, tag.toLowerCase());
      }
    }
  }

  /**
   * Handle search
   */
  private async handleSearch(event: AnalyticsEvent): Promise<void> {
    const query = event.properties['query'] as string;
    if (query) {
      await this.redis.zincrby('searches:trending', 1, query.toLowerCase());
      await this.redis.zremrangebyrank('searches:trending', 0, -101);
    }
  }

  /**
   * Get active user count
   */
  async getActiveUserCount(): Promise<number> {
    return this.redis.scard('active:users:realtime');
  }

  /**
   * Get session count
   */
  async getSessionCount(): Promise<number> {
    return this.redis.scard('sessions:active');
  }

  /**
   * Get event rate (events per minute)
   */
  async getEventRate(eventType: string, since: Date): Promise<number> {
    const minuteKey = this.getMinuteKey(since);
    const count = await this.redis.hget(`events:${minuteKey}`, eventType);
    return parseInt(count || '0', 10);
  }

  /**
   * Get top hashtags
   */
  async getTopHashtags(limit: number): Promise<Array<{ tag: string; count: number }>> {
    const tags = await this.redis.zrevrange('hashtags:trending', 0, limit - 1, 'WITHSCORES');
    const results: Array<{ tag: string; count: number }> = [];

    for (let i = 0; i < tags.length; i += 2) {
      const tag = tags[i];
      const count = tags[i + 1];
      if (tag && count) {
        results.push({ tag, count: parseInt(count, 10) });
      }
    }

    return results;
  }

  /**
   * Get top posts by engagement
   */
  async getTopPosts(limit: number): Promise<Array<{ postId: string; engagement: number }>> {
    const posts = await this.redis.zrevrange('posts:trending', 0, limit - 1, 'WITHSCORES');
    const results: Array<{ postId: string; engagement: number }> = [];

    for (let i = 0; i < posts.length; i += 2) {
      const postId = posts[i];
      const engagement = posts[i + 1];
      if (postId && engagement) {
        results.push({ postId, engagement: parseInt(engagement, 10) });
      }
    }

    return results;
  }

  /**
   * Get geographic distribution
   */
  async getGeographicDistribution(): Promise<Record<string, number>> {
    const data = await this.redis.hgetall('metrics:geo:distribution');
    const result: Record<string, number> = {};

    for (const [country, count] of Object.entries(data)) {
      result[country] = parseInt(count, 10);
    }

    return result;
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(limit: number = 100): Promise<ActiveSession[]> {
    const sessionIds = await this.redis.smembers('sessions:active');
    const sessions: ActiveSession[] = [];

    for (const sessionId of sessionIds.slice(0, limit)) {
      const data = await this.redis.hgetall(`session:${sessionId}`);

      if (data['userId']) {
        sessions.push({
          userId: data['userId'],
          sessionId,
          startedAt: new Date(data['startedAt'] || Date.now()),
          lastActivity: new Date(data['lastActivity'] || Date.now()),
          pageViews: parseInt(data['pageViews'] || '0', 10),
          device: data['device'],
          location: data['location'],
        });
      }
    }

    return sessions;
  }

  /**
   * Get event stream
   */
  async getEventStream(limit: number = 100): Promise<AnalyticsEvent[]> {
    const events = await this.redis.lrange('events:stream', 0, limit - 1);
    return events.map((e) => JSON.parse(e) as AnalyticsEvent);
  }

  /**
   * Update geographic distribution
   */
  async updateGeoDistribution(country: string): Promise<void> {
    await this.redis.hincrby('metrics:geo:distribution', country, 1);
  }

  /**
   * Update trending post
   */
  async updateTrendingPost(postId: string, engagement: number): Promise<void> {
    await this.redis.zadd('posts:trending', engagement, postId);
    await this.redis.zremrangebyrank('posts:trending', 0, -101);
  }

  // ============ HELPER METHODS ============

  private getMinuteKey(date: Date): string {
    const minutes = Math.floor(date.getTime() / 60000);
    return `min:${minutes}`;
  }

  private getHourKey(date: Date): string {
    const hours = Math.floor(date.getTime() / 3600000);
    return `hour:${hours}`;
  }
}

export default RealtimeTracker;
