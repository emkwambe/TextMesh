/**
 * Moderation Pipeline
 *
 * Unified content moderation workflow that combines:
 * - Toxicity detection
 * - Spam classification
 * - NSFW detection
 * - Sentiment analysis
 * - PII detection
 * - Link checking
 */

import { createLogger } from '@textmesh/logger';
import { toxicityDetector, ToxicityDetector } from './toxicity-detector';
import { spamClassifier, SpamClassifier } from './spam-classifier';
import { nsfwDetector, NSFWDetector } from './nsfw-detector';
import { sentimentAnalyzerService, SentimentAnalyzerService } from './sentiment-analyzer';
import { piiDetector, PIIDetector } from './pii-detector';
import { linkChecker, LinkChecker, LinkCheckResult } from './link-checker';
import {
  ModerationResult,
  ModerationAction,
  ModerationCategory,
  ModerationConfig,
  ContentType,
} from './types';

const logger = createLogger({ service: 'moderation-pipeline', level: 'info' });

// Default configuration
const DEFAULT_CONFIG: ModerationConfig = {
  toxicity: {
    enabled: true,
    threshold: 0.6,
    action: 'flag',
  },
  spam: {
    enabled: true,
    threshold: 0.6,
    action: 'flag',
  },
  nsfw: {
    enabled: true,
    threshold: 0.5,
    action: 'block',
  },
  pii: {
    enabled: true,
    threshold: 0.8,
    action: 'redact',
    types: ['ssn', 'creditCard', 'bankAccount'],
  },
  links: {
    enabled: true,
    blockMalicious: true,
    warnSuspicious: true,
  },
  autoModeration: {
    enabled: true,
    escalateToHuman: true,
    escalationThreshold: 0.9,
  },
};

export interface ModerationContext {
  contentType: ContentType;
  authorId?: string;
  channelId?: string;
  communityId?: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}

export interface ModerationPipelineResult extends ModerationResult {
  processedContent: string;
  escalated: boolean;
  moderationTime: number;
  detailedScores: {
    toxicity: number;
    spam: number;
    nsfw: number;
    sentiment: number;
    piiRisk: number;
    linkRisk: number;
  };
}

export class ModerationPipeline {
  private config: ModerationConfig;
  private toxicityDetector: ToxicityDetector;
  private spamClassifier: SpamClassifier;
  private nsfwDetector: NSFWDetector;
  private sentimentAnalyzer: SentimentAnalyzerService;
  private piiDetector: PIIDetector;
  private linkChecker: LinkChecker;

  // Callback hooks
  private onEscalation?: (result: ModerationPipelineResult, context: ModerationContext) => void;
  private onBlock?: (result: ModerationPipelineResult, context: ModerationContext) => void;
  private onFlag?: (result: ModerationPipelineResult, context: ModerationContext) => void;

  constructor(config: Partial<ModerationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.toxicityDetector = toxicityDetector;
    this.spamClassifier = spamClassifier;
    this.nsfwDetector = nsfwDetector;
    this.sentimentAnalyzer = sentimentAnalyzerService;
    this.piiDetector = piiDetector;
    this.linkChecker = linkChecker;
  }

  /**
   * Run full moderation pipeline
   */
  async moderate(
    content: string,
    context: ModerationContext
  ): Promise<ModerationPipelineResult> {
    const startTime = Date.now();
    const reasons: string[] = [];
    const categories: ModerationCategory[] = [];
    let action: ModerationAction = 'allow';
    let processedContent = content;

    const detailedScores = {
      toxicity: 0,
      spam: 0,
      nsfw: 0,
      sentiment: 0,
      piiRisk: 0,
      linkRisk: 0,
    };

    // 1. Toxicity check
    if (this.config.toxicity?.enabled) {
      const toxicityResult = this.toxicityDetector.analyze(content);
      detailedScores.toxicity = toxicityResult.toxicity;

      if (toxicityResult.toxicity >= (this.config.toxicity.threshold || 0.6)) {
        categories.push('toxicity');
        reasons.push(...this.toxicityDetector.explain(toxicityResult));
        action = this.escalateAction(action, this.config.toxicity.action || 'flag');
      }
    }

    // 2. Spam check
    if (this.config.spam?.enabled) {
      const urls = this.extractUrls(content);
      const spamResult = this.spamClassifier.classify(content, context.authorId, urls);
      detailedScores.spam = spamResult.confidence;

      if (spamResult.isSpam) {
        categories.push('spam');
        reasons.push(...spamResult.reasons);
        action = this.escalateAction(action, this.config.spam.action || 'flag');
      }
    }

    // 3. NSFW check
    if (this.config.nsfw?.enabled) {
      const nsfwResult = this.nsfwDetector.analyzeText(content);
      const urlResult = this.nsfwDetector.analyzeUrls(this.extractUrls(content));
      detailedScores.nsfw = nsfwResult.confidence;

      if (nsfwResult.isNSFW || urlResult.hasNSFW) {
        categories.push('nsfw');
        if (nsfwResult.reason) reasons.push(nsfwResult.reason);
        if (urlResult.hasNSFW) reasons.push('NSFW URL detected');
        action = this.escalateAction(action, this.config.nsfw.action || 'block');
      }
    }

    // 4. Sentiment analysis
    const sentimentResult = this.sentimentAnalyzer.analyze(content, context.authorId);
    detailedScores.sentiment = (sentimentResult.score + 5) / 10; // Normalize to 0-1

    // Very negative sentiment may indicate problematic content
    if (sentimentResult.score <= -3) {
      categories.push('hate_speech');
      reasons.push('Very negative sentiment detected');
    }

    // 5. PII detection
    if (this.config.pii?.enabled) {
      const piiMatches = this.piiDetector.detect(content);
      const criticalPII = piiMatches.filter((m) => m.severity === 'critical');
      detailedScores.piiRisk = criticalPII.length > 0 ? 1 : piiMatches.length > 0 ? 0.5 : 0;

      if (criticalPII.length > 0) {
        categories.push('pii');
        reasons.push(`Critical PII detected: ${criticalPII.map((m) => m.type).join(', ')}`);

        if (this.config.pii.action === 'redact') {
          processedContent = this.piiDetector.redact(content, {
            types: this.config.pii.types,
          });
        } else {
          action = this.escalateAction(action, this.config.pii.action || 'flag');
        }
      }
    }

    // 6. Link checking
    if (this.config.links?.enabled) {
      const linkResults = await this.linkChecker.checkTextLinks(content);
      const maliciousLinks = linkResults.results.filter((r) => r.category === 'malicious');
      const suspiciousLinks = linkResults.results.filter((r) => r.category === 'suspicious');

      detailedScores.linkRisk = maliciousLinks.length > 0 ? 1 : suspiciousLinks.length > 0 ? 0.5 : 0;

      if (maliciousLinks.length > 0 && this.config.links.blockMalicious) {
        categories.push('scam');
        reasons.push('Malicious link detected');
        action = 'block';
      } else if (suspiciousLinks.length > 0 && this.config.links.warnSuspicious) {
        reasons.push('Suspicious link detected');
        if (action === 'allow') action = 'flag';
      }
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(detailedScores, categories);

    // Check if escalation is needed
    let escalated = false;
    if (
      this.config.autoModeration?.enabled &&
      this.config.autoModeration.escalateToHuman &&
      confidence >= (this.config.autoModeration.escalationThreshold || 0.9)
    ) {
      escalated = true;
    }

    const result: ModerationPipelineResult = {
      approved: action === 'allow',
      action,
      categories,
      reasons,
      confidence,
      scores: {},
      processingTime: Date.now() - startTime,
      processedContent,
      escalated,
      moderationTime: Date.now() - startTime,
      detailedScores,
    };

    // Trigger callbacks
    this.triggerCallbacks(result, context);

    // Log moderation result
    logger.info('Content moderated', {
      contentType: context.contentType,
      authorId: context.authorId,
      action,
      categories,
      confidence,
      escalated,
      moderationTime: result.moderationTime,
    });

    return result;
  }

  /**
   * Quick check for obvious violations
   */
  async quickCheck(content: string): Promise<{
    pass: boolean;
    reason?: string;
  }> {
    // Check toxicity
    if (this.config.toxicity?.enabled) {
      const toxicity = this.toxicityDetector.analyze(content);
      if (toxicity.severeToxicity > 0.8) {
        return { pass: false, reason: 'Severe toxicity detected' };
      }
    }

    // Check NSFW
    if (this.config.nsfw?.enabled) {
      const nsfw = this.nsfwDetector.analyzeText(content);
      if (nsfw.isNSFW && nsfw.confidence > 0.9) {
        return { pass: false, reason: 'NSFW content detected' };
      }
    }

    // Check for malicious links
    if (this.config.links?.enabled) {
      const linkCheck = await this.linkChecker.checkTextLinks(content);
      if (linkCheck.hasMalicious) {
        return { pass: false, reason: 'Malicious link detected' };
      }
    }

    return { pass: true };
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    scores: ModerationPipelineResult['detailedScores'],
    categories: ModerationCategory[]
  ): number {
    if (categories.length === 0) return 0;

    // Weight the relevant scores
    const weights: Record<string, number> = {
      toxicity: 0.3,
      spam: 0.2,
      nsfw: 0.25,
      piiRisk: 0.15,
      linkRisk: 0.1,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      const score = scores[key as keyof typeof scores];
      if (score > 0) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Escalate action (block > flag > allow)
   */
  private escalateAction(current: ModerationAction, newAction: ModerationAction): ModerationAction {
    const priority: Record<ModerationAction, number> = {
      ban: 5,
      remove: 4,
      block: 3,
      hide: 2,
      redact: 2,
      flag: 1,
      allow: 0,
    };

    return priority[newAction] > priority[current] ? newAction : current;
  }

  /**
   * Extract URLs from text
   */
  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    return text.match(urlRegex) || [];
  }

  /**
   * Trigger appropriate callbacks
   */
  private triggerCallbacks(
    result: ModerationPipelineResult,
    context: ModerationContext
  ): void {
    if (result.escalated && this.onEscalation) {
      this.onEscalation(result, context);
    }

    if (result.action === 'block' && this.onBlock) {
      this.onBlock(result, context);
    }

    if (result.action === 'flag' && this.onFlag) {
      this.onFlag(result, context);
    }
  }

  /**
   * Set escalation callback
   */
  setEscalationHandler(
    handler: (result: ModerationPipelineResult, context: ModerationContext) => void
  ): void {
    this.onEscalation = handler;
  }

  /**
   * Set block callback
   */
  setBlockHandler(
    handler: (result: ModerationPipelineResult, context: ModerationContext) => void
  ): void {
    this.onBlock = handler;
  }

  /**
   * Set flag callback
   */
  setFlagHandler(
    handler: (result: ModerationPipelineResult, context: ModerationContext) => void
  ): void {
    this.onFlag = handler;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ModerationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ModerationConfig {
    return { ...this.config };
  }

  /**
   * Batch moderate multiple contents
   */
  async batchModerate(
    items: Array<{ content: string; context: ModerationContext }>
  ): Promise<ModerationPipelineResult[]> {
    return Promise.all(
      items.map(({ content, context }) => this.moderate(content, context))
    );
  }

  /**
   * Get moderation statistics
   */
  getStats(): {
    configuredChecks: string[];
    thresholds: Record<string, number>;
  } {
    const configuredChecks: string[] = [];

    if (this.config.toxicity?.enabled) configuredChecks.push('toxicity');
    if (this.config.spam?.enabled) configuredChecks.push('spam');
    if (this.config.nsfw?.enabled) configuredChecks.push('nsfw');
    if (this.config.pii?.enabled) configuredChecks.push('pii');
    if (this.config.links?.enabled) configuredChecks.push('links');

    return {
      configuredChecks,
      thresholds: {
        toxicity: this.config.toxicity?.threshold || 0.6,
        spam: this.config.spam?.threshold || 0.6,
        nsfw: this.config.nsfw?.threshold || 0.5,
        pii: this.config.pii?.threshold || 0.8,
        escalation: this.config.autoModeration?.escalationThreshold || 0.9,
      },
    };
  }
}

// Export singleton instance
export const moderationPipeline = new ModerationPipeline();

// Export factory function for custom configurations
export function createModerationPipeline(config?: Partial<ModerationConfig>): ModerationPipeline {
  return new ModerationPipeline(config);
}
