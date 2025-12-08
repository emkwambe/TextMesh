// =================================
// TEXTMESH SPAM DETECTOR
// Spam Detection & Prevention
// =================================

import Redis from 'ioredis';

// ============ SPAM RESULT TYPE ============

export interface SpamResult {
  score: number;
  confidence: number;
  isSpam: boolean;
  reasons: string[];
  signals: SpamSignal[];
}

interface SpamSignal {
  type: SpamSignalType;
  weight: number;
  description: string;
}

type SpamSignalType =
  | 'repetitive_content'
  | 'high_frequency'
  | 'suspicious_links'
  | 'keyword_stuffing'
  | 'duplicate_content'
  | 'bot_pattern'
  | 'promotional_content'
  | 'low_quality';

// ============ SPAM PATTERNS ============

const SPAM_URL_PATTERNS = [
  /bit\.ly/gi,
  /tinyurl\.com/gi,
  /goo\.gl/gi,
  /t\.co(?!ntent)/gi, // Exclude "content"
  /click\s*here/gi,
  /free\s+(money|gift|prize)/gi,
];

const PROMOTIONAL_PATTERNS = [
  /\b(buy|sale|discount|offer|deal|limited\s+time)\b/gi,
  /\b(click|tap|visit|check\s+out)\s+(here|now|link)/gi,
  /\b(follow|subscribe|like)\s+(for|to)\s+(more|win|get)/gi,
  /\b(dm|message)\s+(me|us)\s+(for|to)/gi,
];

const BOT_PATTERNS = [
  /(.)\1{5,}/gi, // Repeated characters (aaaaaaa)
  /(.{3,})\1{3,}/gi, // Repeated phrases
  /\d{10,}/g, // Long numbers
];

// ============ SPAM DETECTOR CLASS ============

export class SpamDetector {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Analyze content for spam
   */
  async analyze(content: string, userId: string): Promise<SpamResult> {
    const signals: SpamSignal[] = [];
    const reasons: string[] = [];

    // Run all spam checks
    await Promise.all([
      this.checkRepetitiveContent(content, userId, signals, reasons),
      this.checkPostingFrequency(userId, signals, reasons),
      this.checkSuspiciousLinks(content, signals, reasons),
      this.checkKeywordStuffing(content, signals, reasons),
      this.checkDuplicateContent(content, userId, signals, reasons),
      this.checkBotPatterns(content, signals, reasons),
      this.checkPromotionalContent(content, signals, reasons),
      this.checkContentQuality(content, signals, reasons),
    ]);

    // Calculate total score
    const score = this.calculateScore(signals);
    const isSpam = score >= 0.7;

    // Calculate confidence
    const confidence = this.calculateConfidence(signals, content);

    return {
      score,
      confidence,
      isSpam,
      reasons,
      signals,
    };
  }

  /**
   * Quick spam check for rate limiting
   */
  async quickCheck(userId: string): Promise<{ blocked: boolean; reason?: string }> {
    // Check rate limits
    const recentPosts = await this.getRecentPostCount(userId, 60); // Last minute
    if (recentPosts > 10) {
      return { blocked: true, reason: 'Rate limit exceeded' };
    }

    const hourlyPosts = await this.getRecentPostCount(userId, 3600); // Last hour
    if (hourlyPosts > 60) {
      return { blocked: true, reason: 'Hourly limit exceeded' };
    }

    // Check spam score
    const spamScore = await this.getUserSpamScore(userId);
    if (spamScore > 0.9) {
      return { blocked: true, reason: 'High spam score' };
    }

    return { blocked: false };
  }

  /**
   * Check for repetitive content from user
   */
  private async checkRepetitiveContent(
    content: string,
    userId: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    const recentContent = await this.getUserRecentContent(userId, 10);
    const contentHash = this.hashContent(content);

    let similarCount = 0;
    for (const recent of recentContent) {
      const similarity = this.calculateSimilarity(content, recent);
      if (similarity > 0.8) {
        similarCount++;
      }
    }

    if (similarCount >= 3) {
      signals.push({
        type: 'repetitive_content',
        weight: 0.4,
        description: `Content similar to ${similarCount} recent posts`,
      });
      reasons.push('Repetitive content detected');
    }
  }

  /**
   * Check posting frequency
   */
  private async checkPostingFrequency(
    userId: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    const recentCount = await this.getRecentPostCount(userId, 300); // 5 minutes

    if (recentCount > 5) {
      signals.push({
        type: 'high_frequency',
        weight: 0.3,
        description: `${recentCount} posts in last 5 minutes`,
      });
      reasons.push('High posting frequency');
    }
  }

  /**
   * Check for suspicious links
   */
  private async checkSuspiciousLinks(
    content: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    // Check for URL shorteners and suspicious patterns
    for (const pattern of SPAM_URL_PATTERNS) {
      if (pattern.test(content)) {
        signals.push({
          type: 'suspicious_links',
          weight: 0.25,
          description: 'Suspicious URL pattern detected',
        });
        reasons.push('Suspicious link detected');
        break;
      }
    }

    // Count total links
    const urlCount = (content.match(/https?:\/\/[^\s]+/gi) || []).length;
    if (urlCount > 3) {
      signals.push({
        type: 'suspicious_links',
        weight: 0.2,
        description: `Too many links (${urlCount})`,
      });
      reasons.push('Excessive links');
    }
  }

  /**
   * Check for keyword stuffing
   */
  private async checkKeywordStuffing(
    content: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    // Check hashtag count
    const hashtagCount = (content.match(/#\w+/g) || []).length;
    if (hashtagCount > 10) {
      signals.push({
        type: 'keyword_stuffing',
        weight: 0.25,
        description: `Too many hashtags (${hashtagCount})`,
      });
      reasons.push('Hashtag stuffing');
    }

    // Check mention count
    const mentionCount = (content.match(/@\w+/g) || []).length;
    if (mentionCount > 10) {
      signals.push({
        type: 'keyword_stuffing',
        weight: 0.2,
        description: `Too many mentions (${mentionCount})`,
      });
      reasons.push('Mention stuffing');
    }

    // Check for repeated words
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = new Map<string, number>();
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    for (const [word, count] of wordCount) {
      if (count > 5 && word.length > 3) {
        signals.push({
          type: 'keyword_stuffing',
          weight: 0.15,
          description: `Word "${word}" repeated ${count} times`,
        });
        reasons.push('Word repetition');
        break;
      }
    }
  }

  /**
   * Check for duplicate content
   */
  private async checkDuplicateContent(
    content: string,
    userId: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    const contentHash = this.hashContent(content);
    const isDuplicate = await this.checkGlobalDuplicate(contentHash);

    if (isDuplicate) {
      signals.push({
        type: 'duplicate_content',
        weight: 0.35,
        description: 'Content matches existing post',
      });
      reasons.push('Duplicate content');
    }
  }

  /**
   * Check for bot-like patterns
   */
  private async checkBotPatterns(
    content: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    for (const pattern of BOT_PATTERNS) {
      if (pattern.test(content)) {
        signals.push({
          type: 'bot_pattern',
          weight: 0.3,
          description: 'Bot-like content pattern',
        });
        reasons.push('Bot-like behavior');
        break;
      }
    }
  }

  /**
   * Check for promotional content
   */
  private async checkPromotionalContent(
    content: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    let promotionalMatches = 0;
    for (const pattern of PROMOTIONAL_PATTERNS) {
      if (pattern.test(content)) {
        promotionalMatches++;
      }
    }

    if (promotionalMatches >= 2) {
      signals.push({
        type: 'promotional_content',
        weight: 0.25,
        description: `${promotionalMatches} promotional patterns`,
      });
      reasons.push('Promotional content');
    }
  }

  /**
   * Check content quality
   */
  private async checkContentQuality(
    content: string,
    signals: SpamSignal[],
    reasons: string[]
  ): Promise<void> {
    // Very short content
    if (content.length < 10) {
      signals.push({
        type: 'low_quality',
        weight: 0.1,
        description: 'Very short content',
      });
    }

    // All caps
    const upperRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (upperRatio > 0.7 && content.length > 10) {
      signals.push({
        type: 'low_quality',
        weight: 0.15,
        description: 'Excessive caps',
      });
      reasons.push('Excessive capitalization');
    }

    // Too many emojis
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    if (emojiCount > 10) {
      signals.push({
        type: 'low_quality',
        weight: 0.1,
        description: 'Too many emojis',
      });
    }
  }

  /**
   * Calculate overall spam score
   */
  private calculateScore(signals: SpamSignal[]): number {
    let totalWeight = 0;
    for (const signal of signals) {
      totalWeight += signal.weight;
    }
    return Math.min(1.0, totalWeight);
  }

  /**
   * Calculate confidence
   */
  private calculateConfidence(signals: SpamSignal[], content: string): number {
    let confidence = 0.7;

    // More signals = higher confidence
    confidence += Math.min(0.2, signals.length * 0.05);

    // Longer content = more data = higher confidence
    if (content.length > 100) {
      confidence += 0.05;
    }

    return Math.min(1.0, confidence);
  }

  // ============ HELPER METHODS ============

  private hashContent(content: string): string {
    // Simple hash for content deduplication
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private calculateSimilarity(a: string, b: string): number {
    // Simple Jaccard similarity
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  private async getUserRecentContent(userId: string, limit: number): Promise<string[]> {
    const key = `user:content:${userId}`;
    const content = await this.redis.lrange(key, 0, limit - 1);
    return content;
  }

  private async getRecentPostCount(userId: string, seconds: number): Promise<number> {
    const key = `user:posts:${userId}`;
    const now = Date.now();
    const cutoff = now - seconds * 1000;
    return this.redis.zcount(key, cutoff, now);
  }

  private async getUserSpamScore(userId: string): Promise<number> {
    const score = await this.redis.get(`user:spam_score:${userId}`);
    return score ? parseFloat(score) : 0;
  }

  private async checkGlobalDuplicate(hash: string): Promise<boolean> {
    const exists = await this.redis.sismember('content:hashes', hash);
    return exists === 1;
  }

  /**
   * Record content for future spam detection
   */
  async recordContent(userId: string, content: string): Promise<void> {
    const hash = this.hashContent(content);

    // Add to user's recent content
    const userKey = `user:content:${userId}`;
    await this.redis.lpush(userKey, content);
    await this.redis.ltrim(userKey, 0, 99);
    await this.redis.expire(userKey, 86400);

    // Add to global hashes
    await this.redis.sadd('content:hashes', hash);

    // Record post timestamp
    const postKey = `user:posts:${userId}`;
    await this.redis.zadd(postKey, Date.now(), hash);
    await this.redis.expire(postKey, 86400);
  }

  /**
   * Update user spam score
   */
  async updateSpamScore(userId: string, delta: number): Promise<void> {
    const key = `user:spam_score:${userId}`;
    await this.redis.incrbyfloat(key, delta);
    await this.redis.expire(key, 86400 * 30);
  }
}

export default SpamDetector;
