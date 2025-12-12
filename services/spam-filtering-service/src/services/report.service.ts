/**
 * Report Service
 *
 * Handles spam reports from users:
 * - Submit reports
 * - Process reports
 * - Track report patterns
 * - Auto-action based on report volume
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  SpamReport,
  ContentSource,
  SpamFilterConfig,
  AuthorSpamStats,
} from '../types';

const logger = createLogger({ service: 'report-service', level: 'info' });

export class ReportService {
  private reports: Map<string, SpamReport> = new Map();
  private contentReports: Map<string, string[]> = new Map(); // contentId -> reportIds
  private authorStats: Map<string, AuthorSpamStats> = new Map();
  private config: SpamFilterConfig;

  // Callbacks
  private onAutoBlock?: (contentId: string, authorId: string) => Promise<void>;
  private onAuthorBan?: (authorId: string) => Promise<void>;

  constructor(config: SpamFilterConfig) {
    this.config = config;
  }

  /**
   * Submit a spam report
   */
  async submitReport(
    contentId: string,
    contentType: ContentSource,
    reporterId: string,
    authorId: string,
    reason: string,
    details?: string
  ): Promise<SpamReport> {
    // Check for duplicate report
    const existingReports = this.contentReports.get(contentId) || [];
    const alreadyReported = existingReports.some((reportId) => {
      const report = this.reports.get(reportId);
      return report?.reporterId === reporterId;
    });

    if (alreadyReported) {
      throw new Error('You have already reported this content');
    }

    const report: SpamReport = {
      id: uuidv4(),
      contentId,
      contentType,
      reporterId,
      authorId,
      reason,
      details,
      status: 'pending',
      createdAt: new Date(),
    };

    this.reports.set(report.id, report);

    // Update content reports index
    existingReports.push(report.id);
    this.contentReports.set(contentId, existingReports);

    // Update author stats
    this.updateAuthorStats(authorId, 'report');

    // Check for auto-block threshold
    await this.checkAutoBlock(contentId, authorId);

    logger.info('Spam report submitted', {
      reportId: report.id,
      contentId,
      contentType,
      reporterId,
      authorId,
      totalReports: existingReports.length,
    });

    return report;
  }

  /**
   * Resolve a report
   */
  async resolveReport(
    reportId: string,
    status: 'confirmed' | 'rejected',
    resolvedBy: string
  ): Promise<SpamReport | null> {
    const report = this.reports.get(reportId);
    if (!report) return null;

    report.status = status;
    report.resolvedAt = new Date();
    report.resolvedBy = resolvedBy;

    // Update author stats based on resolution
    if (status === 'confirmed') {
      this.updateAuthorStats(report.authorId, 'spam_confirmed');
    }

    logger.info('Report resolved', {
      reportId,
      status,
      resolvedBy,
      authorId: report.authorId,
    });

    return report;
  }

  /**
   * Bulk resolve reports for content
   */
  async bulkResolve(
    contentId: string,
    status: 'confirmed' | 'rejected',
    resolvedBy: string
  ): Promise<number> {
    const reportIds = this.contentReports.get(contentId) || [];
    let resolved = 0;

    for (const reportId of reportIds) {
      const result = await this.resolveReport(reportId, status, resolvedBy);
      if (result) resolved++;
    }

    return resolved;
  }

  /**
   * Get report by ID
   */
  getById(reportId: string): SpamReport | null {
    return this.reports.get(reportId) || null;
  }

  /**
   * Get reports for content
   */
  getByContent(contentId: string): SpamReport[] {
    const reportIds = this.contentReports.get(contentId) || [];
    return reportIds
      .map((id) => this.reports.get(id))
      .filter((r): r is SpamReport => r !== undefined);
  }

  /**
   * Get report count for content
   */
  getReportCount(contentId: string): number {
    return (this.contentReports.get(contentId) || []).length;
  }

  /**
   * Get pending reports
   */
  getPendingReports(limit: number = 50): SpamReport[] {
    const pending: SpamReport[] = [];

    for (const report of this.reports.values()) {
      if (report.status === 'pending') {
        pending.push(report);
        if (pending.length >= limit) break;
      }
    }

    return pending.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get reports by author
   */
  getByAuthor(authorId: string): SpamReport[] {
    const reports: SpamReport[] = [];

    for (const report of this.reports.values()) {
      if (report.authorId === authorId) {
        reports.push(report);
      }
    }

    return reports;
  }

  /**
   * Get reports submitted by user
   */
  getByReporter(reporterId: string): SpamReport[] {
    const reports: SpamReport[] = [];

    for (const report of this.reports.values()) {
      if (report.reporterId === reporterId) {
        reports.push(report);
      }
    }

    return reports;
  }

  /**
   * Update author spam stats
   */
  private updateAuthorStats(
    authorId: string,
    action: 'report' | 'spam_confirmed' | 'quarantine'
  ): void {
    let stats = this.authorStats.get(authorId);

    if (!stats) {
      stats = {
        authorId,
        totalContent: 0,
        spamCount: 0,
        quarantinedCount: 0,
        reportCount: 0,
        spamRatio: 0,
        isBanned: false,
        trustScore: 1,
      };
    }

    switch (action) {
      case 'report':
        stats.reportCount++;
        break;
      case 'spam_confirmed':
        stats.spamCount++;
        stats.lastSpamAt = new Date();
        stats.trustScore = Math.max(0, stats.trustScore - 0.1);
        break;
      case 'quarantine':
        stats.quarantinedCount++;
        stats.trustScore = Math.max(0, stats.trustScore - 0.05);
        break;
    }

    // Recalculate spam ratio
    if (stats.totalContent > 0) {
      stats.spamRatio = stats.spamCount / stats.totalContent;
    }

    this.authorStats.set(authorId, stats);
  }

  /**
   * Get author stats
   */
  getAuthorStats(authorId: string): AuthorSpamStats | null {
    return this.authorStats.get(authorId) || null;
  }

  /**
   * Increment author content count
   */
  incrementContentCount(authorId: string): void {
    let stats = this.authorStats.get(authorId);

    if (!stats) {
      stats = {
        authorId,
        totalContent: 0,
        spamCount: 0,
        quarantinedCount: 0,
        reportCount: 0,
        spamRatio: 0,
        isBanned: false,
        trustScore: 1,
      };
    }

    stats.totalContent++;
    this.authorStats.set(authorId, stats);
  }

  /**
   * Check if content should be auto-blocked
   */
  private async checkAutoBlock(
    contentId: string,
    authorId: string
  ): Promise<void> {
    const reportCount = this.getReportCount(contentId);

    if (reportCount >= this.config.reportThresholdForAutoBlock) {
      logger.info('Auto-blocking content due to report threshold', {
        contentId,
        authorId,
        reportCount,
      });

      if (this.onAutoBlock) {
        await this.onAutoBlock(contentId, authorId);
      }

      // Check for author ban
      await this.checkAuthorBan(authorId);
    }
  }

  /**
   * Check if author should be banned
   */
  private async checkAuthorBan(authorId: string): Promise<void> {
    const stats = this.authorStats.get(authorId);
    if (!stats) return;

    // Ban if spam ratio is too high and enough content
    if (stats.spamRatio > 0.5 && stats.totalContent >= 10) {
      stats.isBanned = true;
      this.authorStats.set(authorId, stats);

      logger.warn('Author banned for excessive spam', {
        authorId,
        spamRatio: stats.spamRatio,
        spamCount: stats.spamCount,
      });

      if (this.onAuthorBan) {
        await this.onAuthorBan(authorId);
      }
    }
  }

  /**
   * Ban author
   */
  banAuthor(authorId: string): void {
    let stats = this.authorStats.get(authorId);

    if (!stats) {
      stats = {
        authorId,
        totalContent: 0,
        spamCount: 0,
        quarantinedCount: 0,
        reportCount: 0,
        spamRatio: 0,
        isBanned: true,
        trustScore: 0,
      };
    } else {
      stats.isBanned = true;
      stats.trustScore = 0;
    }

    this.authorStats.set(authorId, stats);
  }

  /**
   * Unban author
   */
  unbanAuthor(authorId: string): void {
    const stats = this.authorStats.get(authorId);
    if (stats) {
      stats.isBanned = false;
      stats.trustScore = 0.3; // Start with low trust
      this.authorStats.set(authorId, stats);
    }
  }

  /**
   * Check if author is banned
   */
  isAuthorBanned(authorId: string): boolean {
    const stats = this.authorStats.get(authorId);
    return stats?.isBanned || false;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: {
    onAutoBlock?: (contentId: string, authorId: string) => Promise<void>;
    onAuthorBan?: (authorId: string) => Promise<void>;
  }): void {
    this.onAutoBlock = callbacks.onAutoBlock;
    this.onAuthorBan = callbacks.onAuthorBan;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalReports: number;
    pending: number;
    confirmed: number;
    rejected: number;
    uniqueContent: number;
    uniqueAuthors: number;
    bannedAuthors: number;
  } {
    const stats = {
      totalReports: this.reports.size,
      pending: 0,
      confirmed: 0,
      rejected: 0,
      uniqueContent: this.contentReports.size,
      uniqueAuthors: this.authorStats.size,
      bannedAuthors: 0,
    };

    for (const report of this.reports.values()) {
      switch (report.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'confirmed':
          stats.confirmed++;
          break;
        case 'rejected':
          stats.rejected++;
          break;
      }
    }

    for (const authorStat of this.authorStats.values()) {
      if (authorStat.isBanned) {
        stats.bannedAuthors++;
      }
    }

    return stats;
  }
}
