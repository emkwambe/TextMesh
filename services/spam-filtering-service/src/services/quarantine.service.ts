/**
 * Quarantine Service
 *
 * Manages quarantined content:
 * - Store quarantined content
 * - Release or delete content
 * - Automatic expiration
 * - Review workflow
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  QuarantinedContent,
  ContentSource,
  SpamFilterConfig,
} from '../types';

const logger = createLogger({ service: 'quarantine-service', level: 'info' });

export class QuarantineService {
  private quarantine: Map<string, QuarantinedContent> = new Map();
  private contentIndex: Map<string, string> = new Map(); // contentId -> quarantineId
  private config: SpamFilterConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: SpamFilterConfig) {
    this.config = config;
    this.startCleanupJob();
  }

  /**
   * Quarantine content
   */
  async quarantine(
    contentId: string,
    contentType: ContentSource,
    content: string,
    authorId: string,
    spamScore: number,
    reasons: string[]
  ): Promise<QuarantinedContent> {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.quarantineDuration * 60 * 60 * 1000
    );

    const quarantined: QuarantinedContent = {
      id,
      contentId,
      contentType,
      content,
      authorId,
      spamScore,
      reasons,
      quarantinedAt: now,
      expiresAt,
      status: 'quarantined',
    };

    this.quarantine.set(id, quarantined);
    this.contentIndex.set(contentId, id);

    logger.info('Content quarantined', {
      quarantineId: id,
      contentId,
      contentType,
      authorId,
      spamScore,
    });

    return quarantined;
  }

  /**
   * Release content from quarantine
   */
  async release(
    quarantineId: string,
    reviewerId: string
  ): Promise<QuarantinedContent | null> {
    const item = this.quarantine.get(quarantineId);
    if (!item) return null;

    item.status = 'released';
    item.reviewedBy = reviewerId;
    item.reviewedAt = new Date();

    this.contentIndex.delete(item.contentId);

    logger.info('Content released from quarantine', {
      quarantineId,
      contentId: item.contentId,
      reviewerId,
    });

    return item;
  }

  /**
   * Delete quarantined content
   */
  async delete(
    quarantineId: string,
    reviewerId: string
  ): Promise<QuarantinedContent | null> {
    const item = this.quarantine.get(quarantineId);
    if (!item) return null;

    item.status = 'deleted';
    item.reviewedBy = reviewerId;
    item.reviewedAt = new Date();

    this.contentIndex.delete(item.contentId);

    logger.info('Quarantined content deleted', {
      quarantineId,
      contentId: item.contentId,
      reviewerId,
    });

    return item;
  }

  /**
   * Get quarantined content by ID
   */
  getById(quarantineId: string): QuarantinedContent | null {
    return this.quarantine.get(quarantineId) || null;
  }

  /**
   * Get quarantined content by content ID
   */
  getByContentId(contentId: string): QuarantinedContent | null {
    const quarantineId = this.contentIndex.get(contentId);
    if (!quarantineId) return null;
    return this.quarantine.get(quarantineId) || null;
  }

  /**
   * Check if content is quarantined
   */
  isQuarantined(contentId: string): boolean {
    const quarantineId = this.contentIndex.get(contentId);
    if (!quarantineId) return false;

    const item = this.quarantine.get(quarantineId);
    return item?.status === 'quarantined';
  }

  /**
   * Get all quarantined content for author
   */
  getByAuthor(authorId: string): QuarantinedContent[] {
    const items: QuarantinedContent[] = [];

    for (const item of this.quarantine.values()) {
      if (item.authorId === authorId && item.status === 'quarantined') {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Get pending review queue
   */
  getPendingReview(limit: number = 50): QuarantinedContent[] {
    const items: QuarantinedContent[] = [];

    for (const item of this.quarantine.values()) {
      if (item.status === 'quarantined') {
        items.push(item);
        if (items.length >= limit) break;
      }
    }

    return items.sort((a, b) => b.spamScore - a.spamScore);
  }

  /**
   * Get expired items
   */
  getExpired(): QuarantinedContent[] {
    const now = new Date();
    const expired: QuarantinedContent[] = [];

    for (const item of this.quarantine.values()) {
      if (item.status === 'quarantined' && item.expiresAt <= now) {
        expired.push(item);
      }
    }

    return expired;
  }

  /**
   * Process expired items
   */
  async processExpired(): Promise<number> {
    const expired = this.getExpired();
    let processed = 0;

    for (const item of expired) {
      // Auto-delete high confidence spam
      if (item.spamScore >= this.config.autoDeleteThreshold) {
        await this.delete(item.id, 'system');
      } else {
        // Release low confidence spam after expiration
        await this.release(item.id, 'system');
      }
      processed++;
    }

    if (processed > 0) {
      logger.info('Processed expired quarantined items', { count: processed });
    }

    return processed;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    quarantined: number;
    released: number;
    deleted: number;
    expired: number;
    byContentType: Record<ContentSource, number>;
  } {
    const stats = {
      total: this.quarantine.size,
      quarantined: 0,
      released: 0,
      deleted: 0,
      expired: 0,
      byContentType: {} as Record<ContentSource, number>,
    };

    const now = new Date();

    for (const item of this.quarantine.values()) {
      switch (item.status) {
        case 'quarantined':
          stats.quarantined++;
          if (item.expiresAt <= now) stats.expired++;
          break;
        case 'released':
          stats.released++;
          break;
        case 'deleted':
          stats.deleted++;
          break;
      }

      stats.byContentType[item.contentType] =
        (stats.byContentType[item.contentType] || 0) + 1;
    }

    return stats;
  }

  /**
   * Start cleanup job
   */
  private startCleanupJob(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(
      () => this.processExpired(),
      60 * 60 * 1000
    );
  }

  /**
   * Stop cleanup job
   */
  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Cleanup old records
   */
  async cleanup(daysOld: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    let cleaned = 0;

    for (const [id, item] of this.quarantine) {
      if (
        item.status !== 'quarantined' &&
        item.quarantinedAt < cutoff
      ) {
        this.quarantine.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up old quarantine records', { count: cleaned });
    }

    return cleaned;
  }
}
