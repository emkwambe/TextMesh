/**
 * Spam Filter Service
 *
 * Main spam filtering logic:
 * - Real-time spam detection
 * - ML and rule-based classification
 * - Integration with quarantine and reports
 * - Author reputation
 */

import { createLogger } from '@textmesh/logger';
import { spamClassifier, SpamClassifier } from '@textmesh/content-moderation';
import { v4 as uuidv4 } from 'uuid';
import {
  SpamFilterRequest,
  SpamFilterResult,
  SpamFilterConfig,
  SpamPattern,
  SpamStatus,
  ContentSource,
} from '../types';
import { QuarantineService } from './quarantine.service';
import { ReportService } from './report.service';

const logger = createLogger({ service: 'spam-filter', level: 'info' });

const DEFAULT_CONFIG: SpamFilterConfig = {
  enabled: true,
  threshold: 0.6,
  quarantineEnabled: true,
  quarantineDuration: 24, // hours
  autoDeleteThreshold: 0.95,
  reportThresholdForAutoBlock: 5,
  enableMachineLearning: true,
  enableRuleBasedDetection: true,
  customPatterns: [],
};

export class SpamFilterService {
  private config: SpamFilterConfig;
  private classifier: SpamClassifier;
  private quarantineService: QuarantineService;
  private reportService: ReportService;
  private customPatterns: Map<string, SpamPattern> = new Map();
  private processedCount: number = 0;
  private spamCount: number = 0;

  constructor(config: Partial<SpamFilterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.classifier = spamClassifier;
    this.quarantineService = new QuarantineService(this.config);
    this.reportService = new ReportService(this.config);

    // Load custom patterns
    for (const pattern of this.config.customPatterns) {
      this.customPatterns.set(pattern.id, pattern);
    }

    // Set up report callbacks
    this.reportService.setCallbacks({
      onAutoBlock: async (contentId, authorId) => {
        await this.handleAutoBlock(contentId, authorId);
      },
      onAuthorBan: async (authorId) => {
        await this.handleAuthorBan(authorId);
      },
    });
  }

  /**
   * Filter content for spam
   */
  async filter(request: SpamFilterRequest): Promise<SpamFilterResult> {
    const startTime = Date.now();
    const reasons: string[] = [];
    let isSpam = false;
    let confidence = 0;
    let status: SpamStatus = 'clean';

    if (!this.config.enabled) {
      return this.createResult(request, false, 0, 'clean', [], startTime);
    }

    // Check if author is banned
    if (this.reportService.isAuthorBanned(request.authorId)) {
      return this.createResult(
        request,
        true,
        1,
        'spam',
        ['Author is banned'],
        startTime
      );
    }

    // Increment author content count
    this.reportService.incrementContentCount(request.authorId);

    // 1. ML-based classification
    if (this.config.enableMachineLearning) {
      const mlResult = this.classifier.classify(
        request.content,
        request.authorId,
        request.urls
      );

      if (mlResult.isSpam) {
        isSpam = true;
        confidence = Math.max(confidence, mlResult.confidence);
        reasons.push(...mlResult.reasons);
      }
    }

    // 2. Rule-based detection with custom patterns
    if (this.config.enableRuleBasedDetection) {
      const ruleResult = this.checkCustomPatterns(request.content);
      if (ruleResult.isSpam) {
        isSpam = true;
        confidence = Math.max(confidence, ruleResult.confidence);
        reasons.push(...ruleResult.reasons);
      }
    }

    // 3. Check author reputation
    const authorStats = this.reportService.getAuthorStats(request.authorId);
    if (authorStats && authorStats.trustScore < 0.3) {
      confidence += 0.2;
      reasons.push('Low author trust score');
    }

    // Determine final status
    if (isSpam && confidence >= this.config.threshold) {
      status = 'spam';
      this.spamCount++;

      // Quarantine if enabled
      if (this.config.quarantineEnabled && confidence < this.config.autoDeleteThreshold) {
        await this.quarantineService.quarantineContent(
          request.contentId,
          request.contentType,
          request.content,
          request.authorId,
          confidence,
          reasons
        );
        status = 'quarantined';
      }
    }

    this.processedCount++;

    const result = this.createResult(request, isSpam, confidence, status, reasons, startTime);

    logger.info('Content filtered', {
      requestId: request.id,
      contentId: request.contentId,
      isSpam,
      confidence,
      status,
      processingTime: result.processingTime,
    });

    return result;
  }

  /**
   * Batch filter multiple contents
   */
  async batchFilter(requests: SpamFilterRequest[]): Promise<SpamFilterResult[]> {
    return Promise.all(requests.map((req) => this.filter(req)));
  }

  /**
   * Check custom patterns
   */
  private checkCustomPatterns(content: string): {
    isSpam: boolean;
    confidence: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let maxSeverityScore = 0;

    for (const pattern of this.customPatterns.values()) {
      if (!pattern.enabled) continue;

      let matches = false;

      switch (pattern.type) {
        case 'regex':
          matches = new RegExp(pattern.pattern, 'gi').test(content);
          break;
        case 'keyword':
          matches = content.toLowerCase().includes(pattern.pattern.toLowerCase());
          break;
        case 'domain':
          matches = content.toLowerCase().includes(pattern.pattern.toLowerCase());
          break;
      }

      if (matches) {
        pattern.hitCount++;
        reasons.push(`Matched pattern: ${pattern.category}`);

        const severityScore =
          pattern.severity === 'high' ? 0.9 :
          pattern.severity === 'medium' ? 0.6 : 0.3;

        maxSeverityScore = Math.max(maxSeverityScore, severityScore);
      }
    }

    return {
      isSpam: maxSeverityScore >= 0.6,
      confidence: maxSeverityScore,
      reasons,
    };
  }

  /**
   * Create filter result
   */
  private createResult(
    request: SpamFilterRequest,
    isSpam: boolean,
    confidence: number,
    status: SpamStatus,
    reasons: string[],
    startTime: number
  ): SpamFilterResult {
    return {
      requestId: request.id,
      contentId: request.contentId,
      isSpam,
      confidence,
      status,
      reasons,
      processedAt: new Date(),
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Handle auto-block from reports
   */
  private async handleAutoBlock(contentId: string, authorId: string): Promise<void> {
    logger.info('Auto-blocking content', { contentId, authorId });
    // In production, this would trigger content removal
  }

  /**
   * Handle author ban
   */
  private async handleAuthorBan(authorId: string): Promise<void> {
    logger.warn('Author banned', { authorId });
    // In production, this would trigger account suspension
  }

  /**
   * Submit spam report
   */
  async submitReport(
    contentId: string,
    contentType: ContentSource,
    reporterId: string,
    authorId: string,
    reason: string,
    details?: string
  ) {
    return this.reportService.submitReport(
      contentId,
      contentType,
      reporterId,
      authorId,
      reason,
      details
    );
  }

  /**
   * Resolve report
   */
  async resolveReport(
    reportId: string,
    status: 'confirmed' | 'rejected',
    resolvedBy: string
  ) {
    return this.reportService.resolveReport(reportId, status, resolvedBy);
  }

  /**
   * Get quarantine service
   */
  getQuarantineService(): QuarantineService {
    return this.quarantineService;
  }

  /**
   * Get report service
   */
  getReportService(): ReportService {
    return this.reportService;
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: SpamPattern): void {
    this.customPatterns.set(pattern.id, pattern);
  }

  /**
   * Remove pattern
   */
  removePattern(patternId: string): void {
    this.customPatterns.delete(patternId);
  }

  /**
   * Enable/disable pattern
   */
  setPatternEnabled(patternId: string, enabled: boolean): void {
    const pattern = this.customPatterns.get(patternId);
    if (pattern) {
      pattern.enabled = enabled;
    }
  }

  /**
   * Get all patterns
   */
  getPatterns(): SpamPattern[] {
    return Array.from(this.customPatterns.values());
  }

  /**
   * Train classifier with example
   */
  train(text: string, isSpam: boolean): void {
    this.classifier.train(text, isSpam);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SpamFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): SpamFilterConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    processedCount: number;
    spamCount: number;
    spamRate: number;
    quarantine: ReturnType<QuarantineService['getStats']>;
    reports: ReturnType<ReportService['getStats']>;
    patterns: {
      total: number;
      enabled: number;
      topHits: Array<{ id: string; category: string; hitCount: number }>;
    };
  } {
    const patternStats = {
      total: this.customPatterns.size,
      enabled: 0,
      topHits: [] as Array<{ id: string; category: string; hitCount: number }>,
    };

    const patternHits: Array<{ id: string; category: string; hitCount: number }> = [];

    for (const pattern of this.customPatterns.values()) {
      if (pattern.enabled) patternStats.enabled++;
      patternHits.push({
        id: pattern.id,
        category: pattern.category,
        hitCount: pattern.hitCount,
      });
    }

    patternStats.topHits = patternHits
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);

    return {
      processedCount: this.processedCount,
      spamCount: this.spamCount,
      spamRate: this.processedCount > 0 ? this.spamCount / this.processedCount : 0,
      quarantine: this.quarantineService.getStats(),
      reports: this.reportService.getStats(),
      patterns: patternStats,
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.quarantineService.stopCleanupJob();
    await this.quarantineService.cleanup();
  }
}

// Export singleton
export const spamFilterService = new SpamFilterService();
