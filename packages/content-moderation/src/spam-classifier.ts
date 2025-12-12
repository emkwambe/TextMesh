/**
 * Spam Classifier
 *
 * ML-based spam detection using:
 * - Text analysis (repetition, caps, special chars)
 * - Link analysis
 * - Behavioral signals
 * - Naive Bayes classification
 */

import { createLogger } from '@textmesh/logger';
import natural from 'natural';
import { SpamSignals } from './types';

const logger = createLogger({ service: 'spam-classifier', level: 'info' });

// Naive Bayes classifier
const classifier = new natural.BayesClassifier();

// Pre-train with common patterns
const SPAM_TRAINING_DATA = [
  { text: 'buy now limited offer click here', label: 'spam' },
  { text: 'free money make cash fast', label: 'spam' },
  { text: 'congratulations you won lottery', label: 'spam' },
  { text: 'click this link for free', label: 'spam' },
  { text: 'earn money from home easy', label: 'spam' },
  { text: 'check out my profile follow me', label: 'spam' },
  { text: 'dating site meet singles now', label: 'spam' },
  { text: 'crypto bitcoin investment returns', label: 'spam' },
  { text: 'hello how are you today', label: 'ham' },
  { text: 'great post I really enjoyed it', label: 'ham' },
  { text: 'thanks for sharing this information', label: 'ham' },
  { text: 'I agree with your perspective', label: 'ham' },
  { text: 'this is a helpful article', label: 'ham' },
  { text: 'interesting discussion on this topic', label: 'ham' },
];

// Initialize classifier with training data
SPAM_TRAINING_DATA.forEach(({ text, label }) => {
  classifier.addDocument(text, label);
});
classifier.train();

// Suspicious URL patterns
const SUSPICIOUS_PATTERNS = {
  urlShorteners: [
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
    'adf.ly', 'j.mp', 'su.pr', 'tr.im', 'tiny.cc', 'short.to',
  ],
  suspiciousTLDs: [
    '.xyz', '.top', '.win', '.click', '.loan', '.work', '.party', '.gq',
    '.tk', '.ml', '.ga', '.cf', '.racing', '.download',
  ],
  scamPatterns: [
    /free[_-]?gift/i,
    /winner/i,
    /casino/i,
    /lottery/i,
    /prize/i,
    /claim[_-]?now/i,
    /limited[_-]?time/i,
    /act[_-]?now/i,
  ],
};

// Spam phrase patterns
const SPAM_PHRASES = [
  'follow me', 'check out my', 'click here', 'buy now', 'limited time',
  'free trial', 'no credit card', 'make money', 'work from home',
  'earn cash', 'get rich', 'double your', 'investment opportunity',
  'dm me', 'link in bio', 'promo code', 'discount code', 'giveaway',
  'subscribe to my', 'follow for follow', 'f4f', 'l4l', 'sub4sub',
];

export class SpamClassifier {
  private userTrustScores: Map<string, number> = new Map();
  private recentMessages: Map<string, string[]> = new Map();

  /**
   * Classify text as spam or not
   */
  classify(text: string, authorId?: string, urls?: string[]): {
    isSpam: boolean;
    confidence: number;
    signals: SpamSignals;
    reasons: string[];
  } {
    const signals = this.analyzeSignals(text, authorId, urls);
    const mlScore = this.getMLScore(text);
    const ruleScore = this.getRuleBasedScore(signals);

    // Combine ML and rule-based scores
    const combinedScore = mlScore * 0.4 + ruleScore * 0.6;

    const reasons: string[] = [];
    if (signals.repetition > 0.5) reasons.push('High text repetition');
    if (signals.linkDensity > 0.3) reasons.push('Too many links');
    if (signals.capsRatio > 0.5) reasons.push('Excessive caps');
    if (signals.shortenerLinks > 0) reasons.push('URL shorteners detected');
    if (signals.suspiciousPhrases > 2) reasons.push('Spam phrases detected');
    if (signals.authorTrustScore < 0.3) reasons.push('Low author trust score');

    return {
      isSpam: combinedScore > 0.6,
      confidence: combinedScore,
      signals,
      reasons,
    };
  }

  /**
   * Analyze spam signals in text
   */
  private analyzeSignals(text: string, authorId?: string, urls?: string[]): SpamSignals {
    const words = text.split(/\s+/);
    const chars = text.replace(/\s/g, '');

    return {
      repetition: this.calculateRepetition(text, authorId),
      linkDensity: this.calculateLinkDensity(text, urls),
      capsRatio: this.calculateCapsRatio(chars),
      specialCharRatio: this.calculateSpecialCharRatio(chars),
      shortenerLinks: this.countShortenerLinks(urls || this.extractUrls(text)),
      suspiciousPhrases: this.countSuspiciousPhrases(text),
      authorTrustScore: authorId ? this.getAuthorTrustScore(authorId) : 0.5,
    };
  }

  /**
   * Get ML classification score
   */
  private getMLScore(text: string): number {
    const classifications = classifier.getClassifications(text.toLowerCase());
    const spamClassification = classifications.find((c) => c.label === 'spam');
    return spamClassification ? spamClassification.value : 0;
  }

  /**
   * Calculate rule-based spam score
   */
  private getRuleBasedScore(signals: SpamSignals): number {
    let score = 0;

    // Weight each signal
    score += signals.repetition * 0.3;
    score += signals.linkDensity * 0.25;
    score += signals.capsRatio * 0.15;
    score += signals.specialCharRatio * 0.1;
    score += Math.min(signals.shortenerLinks * 0.2, 0.4);
    score += Math.min(signals.suspiciousPhrases * 0.1, 0.3);
    score += (1 - signals.authorTrustScore) * 0.2;

    return Math.min(1, score);
  }

  /**
   * Calculate text repetition
   */
  private calculateRepetition(text: string, authorId?: string): number {
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();

    // Count word frequency
    for (const word of words) {
      if (word.length > 2) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Calculate repetition ratio
    const maxCount = Math.max(...wordCounts.values(), 1);
    const repetitionRatio = maxCount > 3 ? maxCount / words.length : 0;

    // Check for duplicate messages from same author
    if (authorId) {
      const recent = this.recentMessages.get(authorId) || [];
      const isDuplicate = recent.some((msg) => msg === text);

      // Update recent messages
      recent.push(text);
      if (recent.length > 10) recent.shift();
      this.recentMessages.set(authorId, recent);

      if (isDuplicate) return 0.9;
    }

    return Math.min(1, repetitionRatio * 2);
  }

  /**
   * Calculate link density
   */
  private calculateLinkDensity(text: string, urls?: string[]): number {
    const extractedUrls = urls || this.extractUrls(text);
    const words = text.split(/\s+/);

    if (words.length < 5 && extractedUrls.length > 0) {
      return 0.8; // Short message with link = high spam signal
    }

    return Math.min(1, extractedUrls.length / Math.max(words.length / 10, 1));
  }

  /**
   * Calculate caps ratio
   */
  private calculateCapsRatio(text: string): number {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 10) return 0;

    const caps = letters.replace(/[^A-Z]/g, '');
    return caps.length / letters.length;
  }

  /**
   * Calculate special character ratio
   */
  private calculateSpecialCharRatio(text: string): number {
    const specialChars = text.replace(/[a-zA-Z0-9\s]/g, '');
    return specialChars.length / Math.max(text.length, 1);
  }

  /**
   * Count URL shortener links
   */
  private countShortenerLinks(urls: string[]): number {
    let count = 0;

    for (const url of urls) {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (SUSPICIOUS_PATTERNS.urlShorteners.some((s) => hostname.includes(s))) {
          count++;
        }
      } catch {
        // Invalid URL
      }
    }

    return count;
  }

  /**
   * Count suspicious phrases
   */
  private countSuspiciousPhrases(text: string): number {
    const lowerText = text.toLowerCase();
    return SPAM_PHRASES.filter((phrase) => lowerText.includes(phrase)).length;
  }

  /**
   * Extract URLs from text
   */
  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    return text.match(urlRegex) || [];
  }

  /**
   * Get author trust score
   */
  private getAuthorTrustScore(authorId: string): number {
    return this.userTrustScores.get(authorId) || 0.5;
  }

  /**
   * Update author trust score
   */
  updateTrustScore(authorId: string, delta: number): void {
    const current = this.userTrustScores.get(authorId) || 0.5;
    const newScore = Math.max(0, Math.min(1, current + delta));
    this.userTrustScores.set(authorId, newScore);
  }

  /**
   * Set author trust score
   */
  setTrustScore(authorId: string, score: number): void {
    this.userTrustScores.set(authorId, Math.max(0, Math.min(1, score)));
  }

  /**
   * Train classifier with new example
   */
  train(text: string, isSpam: boolean): void {
    classifier.addDocument(text.toLowerCase(), isSpam ? 'spam' : 'ham');
    classifier.train();
    logger.debug('Classifier trained with new example', { isSpam });
  }

  /**
   * Check if URL is suspicious
   */
  isUrlSuspicious(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Check for URL shorteners
      if (SUSPICIOUS_PATTERNS.urlShorteners.some((s) => hostname.includes(s))) {
        return true;
      }

      // Check for suspicious TLDs
      if (SUSPICIOUS_PATTERNS.suspiciousTLDs.some((tld) => hostname.endsWith(tld))) {
        return true;
      }

      // Check for scam patterns in URL
      const fullUrl = url.toLowerCase();
      if (SUSPICIOUS_PATTERNS.scamPatterns.some((pattern) => pattern.test(fullUrl))) {
        return true;
      }

      return false;
    } catch {
      return true; // Invalid URLs are suspicious
    }
  }
}

export const spamClassifier = new SpamClassifier();
