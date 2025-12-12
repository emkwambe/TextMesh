/**
 * Trending Service
 *
 * Tracks and serves trending topics, hashtags, and searches
 */

import { createLogger } from '@textmesh/logger';
import { TrendingItem, SearchConfig } from './types';
import { ElasticsearchClient } from './elasticsearch-client';

const logger = createLogger({ service: 'trending', level: 'info' });

interface TrendingWindow {
  items: Map<string, TrendingItemData>;
  startTime: number;
}

interface TrendingItemData {
  term: string;
  type: 'hashtag' | 'topic' | 'search';
  counts: number[];
  category?: string;
  lastUpdated: number;
}

export class TrendingService {
  private client: ElasticsearchClient;
  private config: SearchConfig;

  // In-memory trending data (would be Redis in production)
  private currentWindow: TrendingWindow;
  private previousWindow: TrendingWindow;
  private windowDuration: number = 3600000; // 1 hour

  private hashtagCounts: Map<string, number> = new Map();
  private topicCounts: Map<string, number> = new Map();
  private searchCounts: Map<string, number> = new Map();

  constructor(client: ElasticsearchClient, config: SearchConfig) {
    this.client = client;
    this.config = config;

    this.currentWindow = {
      items: new Map(),
      startTime: Date.now(),
    };

    this.previousWindow = {
      items: new Map(),
      startTime: Date.now() - this.windowDuration,
    };

    // Start window rotation
    this.startWindowRotation();
  }

  /**
   * Record a hashtag occurrence
   */
  recordHashtag(hashtag: string, category?: string): void {
    const normalized = hashtag.toLowerCase().replace(/^#/, '');
    this.recordItem(normalized, 'hashtag', category);
  }

  /**
   * Record a topic occurrence
   */
  recordTopic(topic: string, category?: string): void {
    const normalized = topic.toLowerCase();
    this.recordItem(normalized, 'topic', category);
  }

  /**
   * Record a search query
   */
  recordSearch(query: string): void {
    const normalized = query.toLowerCase().trim();
    if (normalized.length >= 2) {
      this.recordItem(normalized, 'search');
    }
  }

  /**
   * Record an item
   */
  private recordItem(
    term: string,
    type: 'hashtag' | 'topic' | 'search',
    category?: string
  ): void {
    const key = `${type}:${term}`;
    let item = this.currentWindow.items.get(key);

    if (!item) {
      item = {
        term,
        type,
        counts: [0],
        category,
        lastUpdated: Date.now(),
      };
      this.currentWindow.items.set(key, item);
    }

    item.counts[item.counts.length - 1]++;
    item.lastUpdated = Date.now();

    // Update simple counts
    switch (type) {
      case 'hashtag':
        this.hashtagCounts.set(term, (this.hashtagCounts.get(term) || 0) + 1);
        break;
      case 'topic':
        this.topicCounts.set(term, (this.topicCounts.get(term) || 0) + 1);
        break;
      case 'search':
        this.searchCounts.set(term, (this.searchCounts.get(term) || 0) + 1);
        break;
    }
  }

  /**
   * Get trending items
   */
  getTrending(options: {
    type?: 'hashtag' | 'topic' | 'search';
    category?: string;
    limit?: number;
  } = {}): TrendingItem[] {
    const { type, category, limit = 10 } = options;
    const items: TrendingItem[] = [];

    // Combine current and previous window
    const allItems = new Map<string, TrendingItemData>();

    for (const [key, item] of this.previousWindow.items) {
      if (type && item.type !== type) continue;
      if (category && item.category !== category) continue;
      allItems.set(key, item);
    }

    for (const [key, item] of this.currentWindow.items) {
      if (type && item.type !== type) continue;
      if (category && item.category !== category) continue;

      const existing = allItems.get(key);
      if (existing) {
        existing.counts = [...existing.counts, ...item.counts];
        existing.lastUpdated = item.lastUpdated;
      } else {
        allItems.set(key, item);
      }
    }

    // Calculate trending score and velocity
    for (const [, item] of allItems) {
      const count = item.counts.reduce((a, b) => a + b, 0);
      const velocity = this.calculateVelocity(item.counts);

      items.push({
        term: item.term,
        type: item.type,
        count,
        velocity,
        category: item.category,
      });
    }

    // Sort by velocity (trending) then count
    items.sort((a, b) => {
      const velocityDiff = b.velocity - a.velocity;
      if (Math.abs(velocityDiff) > 0.1) return velocityDiff;
      return b.count - a.count;
    });

    return items.slice(0, limit);
  }

  /**
   * Get trending hashtags
   */
  getTrendingHashtags(limit: number = 10, category?: string): TrendingItem[] {
    return this.getTrending({ type: 'hashtag', category, limit });
  }

  /**
   * Get trending topics
   */
  getTrendingTopics(limit: number = 10, category?: string): TrendingItem[] {
    return this.getTrending({ type: 'topic', category, limit });
  }

  /**
   * Get trending searches
   */
  getTrendingSearches(limit: number = 10): TrendingItem[] {
    return this.getTrending({ type: 'search', limit });
  }

  /**
   * Calculate velocity (rate of change)
   */
  private calculateVelocity(counts: number[]): number {
    if (counts.length < 2) {
      return counts[0] || 0;
    }

    const recent = counts.slice(-3);
    const older = counts.slice(0, -3);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0
      ? older.reduce((a, b) => a + b, 0) / older.length
      : recentAvg / 2;

    if (olderAvg === 0) return recentAvg;

    return (recentAvg - olderAvg) / olderAvg;
  }

  /**
   * Start window rotation
   */
  private startWindowRotation(): void {
    setInterval(() => {
      this.rotateWindow();
    }, this.windowDuration / 4); // Rotate 4 times per window
  }

  /**
   * Rotate trending windows
   */
  private rotateWindow(): void {
    const now = Date.now();

    // Add new count bucket to current items
    for (const [, item] of this.currentWindow.items) {
      item.counts.push(0);
      // Keep max 12 buckets (3 hours of data)
      if (item.counts.length > 12) {
        item.counts.shift();
      }
    }

    // Check if we need to swap windows
    if (now - this.currentWindow.startTime >= this.windowDuration) {
      this.previousWindow = this.currentWindow;
      this.currentWindow = {
        items: new Map(),
        startTime: now,
      };

      logger.debug('Trending window rotated');
    }
  }

  /**
   * Get hashtag from Elasticsearch
   */
  async getHashtagDetails(hashtag: string): Promise<{
    tag: string;
    postCount: number;
    trendingScore: number;
  } | null> {
    const normalized = hashtag.toLowerCase().replace(/^#/, '');

    const result = await this.client.search(this.config.indices.hashtags, {
      query: {
        term: { 'tag.keyword': normalized },
      },
      size: 1,
    });

    if (result.hits.length === 0) return null;

    const source = result.hits[0].source;
    return {
      tag: source.tag as string,
      postCount: source.postCount as number,
      trendingScore: source.trendingScore as number,
    };
  }

  /**
   * Update hashtag trending score in Elasticsearch
   */
  async updateHashtagScore(hashtag: string, score: number): Promise<void> {
    const normalized = hashtag.toLowerCase().replace(/^#/, '');

    await this.client.update(this.config.indices.hashtags, normalized, {
      trendingScore: score,
      updatedAt: new Date(),
    });
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalHashtags: number;
    totalTopics: number;
    totalSearches: number;
    currentWindowSize: number;
    previousWindowSize: number;
  } {
    return {
      totalHashtags: this.hashtagCounts.size,
      totalTopics: this.topicCounts.size,
      totalSearches: this.searchCounts.size,
      currentWindowSize: this.currentWindow.items.size,
      previousWindowSize: this.previousWindow.items.size,
    };
  }

  /**
   * Clear all trending data
   */
  clear(): void {
    this.currentWindow.items.clear();
    this.previousWindow.items.clear();
    this.hashtagCounts.clear();
    this.topicCounts.clear();
    this.searchCounts.clear();
  }
}
