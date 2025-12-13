/**
 * Real-time Analytics
 *
 * Provides real-time metrics and active user tracking
 */

import { createLogger } from '@textmesh/logger';
import { AnalyticsEvent, DashboardMetrics } from './types';

const logger = createLogger({ service: 'realtime-analytics', level: 'info' });

interface ActiveSession {
  userId?: string;
  sessionId: string;
  lastActivity: number;
  pageViews: number;
  events: number;
}

export interface RealtimeMetrics {
  activeUsers: number;
  activeSessions: number;
  eventsPerMinute: number;
  pageViewsPerMinute: number;
  topPages: Array<{ path: string; count: number }>;
  topEvents: Array<{ action: string; count: number }>;
}

export class RealtimeAnalytics {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes
  private recentEvents: Array<{ timestamp: number; action: string }> = [];
  private recentPageViews: Array<{ timestamp: number; path: string }> = [];
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.startCleanup();
  }

  /**
   * Process event for real-time tracking
   */
  processEvent(event: AnalyticsEvent): void {
    const sessionId = event.sessionId || event.deviceId || 'anonymous';

    // Update or create session
    let session = this.activeSessions.get(sessionId);
    if (!session) {
      session = {
        userId: event.userId,
        sessionId,
        lastActivity: Date.now(),
        pageViews: 0,
        events: 0,
      };
      this.activeSessions.set(sessionId, session);
    }

    session.lastActivity = Date.now();
    session.events++;

    if (event.userId) {
      session.userId = event.userId;
    }

    // Track recent events
    this.recentEvents.push({
      timestamp: Date.now(),
      action: event.action,
    });

    // Track page views
    if (event.action === 'page_view') {
      session.pageViews++;
      const path = (event.metadata.url || event.properties.path || '/') as string;
      this.recentPageViews.push({
        timestamp: Date.now(),
        path,
      });
    }

    // Cleanup old data
    this.cleanupRecentData();
  }

  /**
   * Get real-time metrics
   */
  getMetrics(): RealtimeMetrics {
    this.cleanupExpiredSessions();
    this.cleanupRecentData();

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Count events in last minute
    const recentEventsCount = this.recentEvents.filter(
      (e) => e.timestamp > oneMinuteAgo
    ).length;

    // Count page views in last minute
    const recentPageViewsCount = this.recentPageViews.filter(
      (e) => e.timestamp > oneMinuteAgo
    ).length;

    // Get unique active users
    const activeUserIds = new Set<string>();
    for (const session of this.activeSessions.values()) {
      if (session.userId) {
        activeUserIds.add(session.userId);
      }
    }

    // Calculate top pages
    const pageCounts = new Map<string, number>();
    for (const pv of this.recentPageViews) {
      if (pv.timestamp > oneMinuteAgo) {
        pageCounts.set(pv.path, (pageCounts.get(pv.path) || 0) + 1);
      }
    }
    const topPages = Array.from(pageCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate top events
    const eventCounts = new Map<string, number>();
    for (const e of this.recentEvents) {
      if (e.timestamp > oneMinuteAgo) {
        eventCounts.set(e.action, (eventCounts.get(e.action) || 0) + 1);
      }
    }
    const topEvents = Array.from(eventCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      activeUsers: activeUserIds.size,
      activeSessions: this.activeSessions.size,
      eventsPerMinute: recentEventsCount,
      pageViewsPerMinute: recentPageViewsCount,
      topPages,
      topEvents,
    };
  }

  /**
   * Get active user count
   */
  getActiveUserCount(): number {
    this.cleanupExpiredSessions();

    const activeUserIds = new Set<string>();
    for (const session of this.activeSessions.values()) {
      if (session.userId) {
        activeUserIds.add(session.userId);
      }
    }

    return activeUserIds.size;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    this.cleanupExpiredSessions();
    return this.activeSessions.size;
  }

  /**
   * Check if user is currently active
   */
  isUserActive(userId: string): boolean {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get user's current session
   */
  getUserSession(userId: string): ActiveSession | null {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return null;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.activeSessions) {
      if (now - session.lastActivity > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Cleanup old recent data
   */
  private cleanupRecentData(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    this.recentEvents = this.recentEvents.filter(
      (e) => e.timestamp > fiveMinutesAgo
    );

    this.recentPageViews = this.recentPageViews.filter(
      (e) => e.timestamp > fiveMinutesAgo
    );
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupRecentData();
    }, 60000); // Every minute
  }

  /**
   * Stop real-time tracking
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Set session timeout
   */
  setSessionTimeout(timeoutMs: number): void {
    this.sessionTimeout = timeoutMs;
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeSessions: number;
    recentEvents: number;
    recentPageViews: number;
    sessionTimeout: number;
  } {
    return {
      activeSessions: this.activeSessions.size,
      recentEvents: this.recentEvents.length,
      recentPageViews: this.recentPageViews.length,
      sessionTimeout: this.sessionTimeout,
    };
  }
}
