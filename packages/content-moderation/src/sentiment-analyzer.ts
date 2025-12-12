/**
 * Sentiment Analyzer
 *
 * Analyzes text sentiment using multiple approaches:
 * - Lexicon-based analysis
 * - Pattern matching for emotional content
 * - Context-aware adjustments
 */

import { createLogger } from '@textmesh/logger';
import Sentiment from 'sentiment';

const logger = createLogger({ service: 'sentiment-analyzer', level: 'info' });

// Sentiment analyzer instance
const sentimentAnalyzer = new Sentiment();

export interface SentimentResult {
  score: number; // -5 to 5 normalized
  comparative: number; // Score per word
  positive: string[];
  negative: string[];
  tokens: string[];
  label: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  confidence: number;
}

// Custom sentiment words for social media context
const CUSTOM_WORDS = {
  // Positive
  fire: 3,
  goat: 3,
  lit: 2,
  slaps: 2,
  bussin: 3,
  based: 2,
  poggers: 2,
  pog: 2,
  w: 2,
  dub: 2,
  banger: 3,
  valid: 1,
  slay: 2,
  iconic: 2,
  stan: 1,

  // Negative
  mid: -2,
  cringe: -2,
  ratio: -1,
  cap: -1,
  sus: -1,
  l: -2,
  oof: -1,
  yikes: -2,
  toxic: -3,
  cope: -2,
  seethe: -2,
  mald: -2,
  clown: -2,
  karen: -2,
  boomer: -1,
};

// Emotional patterns
const EMOTIONAL_PATTERNS = {
  excitement: [
    /!{2,}/g,
    /\b(omg|wow|amazing|incredible|awesome)\b/gi,
    /🎉|🔥|💯|🙌|✨/g,
  ],
  sadness: [
    /😢|😭|💔|😞|😔/g,
    /\b(sad|depressed|heartbroken|crying|miss you)\b/gi,
  ],
  anger: [
    /😡|🤬|💢/g,
    /\b(angry|furious|pissed|hate|disgusting)\b/gi,
    /[A-Z]{3,}/g, // All caps words
  ],
  fear: [
    /😱|😰|😨/g,
    /\b(scared|terrified|worried|anxious|nervous)\b/gi,
  ],
  love: [
    /❤️|💕|💗|😍|🥰/g,
    /\b(love|adore|cherish|devoted)\b/gi,
  ],
};

// Register custom words
sentimentAnalyzer.registerLanguage('en', {
  labels: CUSTOM_WORDS,
});

export class SentimentAnalyzerService {
  private contextHistory: Map<string, SentimentResult[]> = new Map();

  /**
   * Analyze sentiment of text
   */
  analyze(text: string, authorId?: string): SentimentResult {
    // Get base sentiment
    const result = sentimentAnalyzer.analyze(text);

    // Adjust for emotional patterns
    const emotionalBoost = this.analyzeEmotionalPatterns(text);

    // Calculate adjusted score
    let adjustedScore = result.score + emotionalBoost;

    // Normalize to -5 to 5 range
    adjustedScore = Math.max(-5, Math.min(5, adjustedScore));

    // Consider context from author's history
    if (authorId) {
      adjustedScore = this.applyContextAdjustment(adjustedScore, authorId);
    }

    // Calculate confidence based on token count and word matches
    const matchedWords = result.positive.length + result.negative.length;
    const confidence = Math.min(1, (matchedWords / Math.max(result.tokens.length, 1)) * 2);

    const sentimentResult: SentimentResult = {
      score: adjustedScore,
      comparative: result.comparative,
      positive: result.positive,
      negative: result.negative,
      tokens: result.tokens,
      label: this.getLabel(adjustedScore),
      confidence,
    };

    // Store in context history
    if (authorId) {
      this.updateContextHistory(authorId, sentimentResult);
    }

    return sentimentResult;
  }

  /**
   * Analyze emotional patterns in text
   */
  private analyzeEmotionalPatterns(text: string): number {
    let boost = 0;

    // Excitement increases positive sentiment
    for (const pattern of EMOTIONAL_PATTERNS.excitement) {
      const matches = text.match(pattern);
      if (matches) {
        boost += matches.length * 0.3;
      }
    }

    // Sadness decreases sentiment
    for (const pattern of EMOTIONAL_PATTERNS.sadness) {
      const matches = text.match(pattern);
      if (matches) {
        boost -= matches.length * 0.4;
      }
    }

    // Anger decreases sentiment significantly
    for (const pattern of EMOTIONAL_PATTERNS.anger) {
      const matches = text.match(pattern);
      if (matches) {
        boost -= matches.length * 0.5;
      }
    }

    // Love increases sentiment
    for (const pattern of EMOTIONAL_PATTERNS.love) {
      const matches = text.match(pattern);
      if (matches) {
        boost += matches.length * 0.4;
      }
    }

    return boost;
  }

  /**
   * Apply context adjustment based on author history
   */
  private applyContextAdjustment(score: number, authorId: string): number {
    const history = this.contextHistory.get(authorId);

    if (!history || history.length < 3) {
      return score;
    }

    // Calculate average sentiment
    const avgScore = history.reduce((sum, r) => sum + r.score, 0) / history.length;

    // If current score deviates significantly, moderate it slightly
    const deviation = Math.abs(score - avgScore);
    if (deviation > 3) {
      // Pull towards average slightly (20%)
      return score * 0.8 + avgScore * 0.2;
    }

    return score;
  }

  /**
   * Update context history for author
   */
  private updateContextHistory(authorId: string, result: SentimentResult): void {
    const history = this.contextHistory.get(authorId) || [];
    history.push(result);

    // Keep only last 20 entries
    if (history.length > 20) {
      history.shift();
    }

    this.contextHistory.set(authorId, history);
  }

  /**
   * Get sentiment label from score
   */
  private getLabel(score: number): SentimentResult['label'] {
    if (score <= -3) return 'very_negative';
    if (score < -1) return 'negative';
    if (score <= 1) return 'neutral';
    if (score < 3) return 'positive';
    return 'very_positive';
  }

  /**
   * Batch analyze multiple texts
   */
  batchAnalyze(texts: string[]): SentimentResult[] {
    return texts.map((text) => this.analyze(text));
  }

  /**
   * Get aggregate sentiment for a conversation/thread
   */
  aggregateSentiment(texts: string[]): {
    overall: SentimentResult['label'];
    averageScore: number;
    distribution: Record<SentimentResult['label'], number>;
    trend: 'improving' | 'declining' | 'stable';
  } {
    const results = this.batchAnalyze(texts);

    // Calculate distribution
    const distribution = {
      very_negative: 0,
      negative: 0,
      neutral: 0,
      positive: 0,
      very_positive: 0,
    };

    for (const result of results) {
      distribution[result.label]++;
    }

    // Calculate average
    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // Calculate trend (compare first half to second half)
    const midpoint = Math.floor(results.length / 2);
    const firstHalfAvg =
      results.slice(0, midpoint).reduce((sum, r) => sum + r.score, 0) / midpoint || 0;
    const secondHalfAvg =
      results.slice(midpoint).reduce((sum, r) => sum + r.score, 0) / (results.length - midpoint) ||
      0;

    let trend: 'improving' | 'declining' | 'stable';
    if (secondHalfAvg - firstHalfAvg > 0.5) {
      trend = 'improving';
    } else if (firstHalfAvg - secondHalfAvg > 0.5) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return {
      overall: this.getLabel(averageScore),
      averageScore,
      distribution,
      trend,
    };
  }

  /**
   * Check if text is predominantly negative
   */
  isNegative(text: string, threshold: number = -1): boolean {
    const result = this.analyze(text);
    return result.score < threshold;
  }

  /**
   * Get emotional context of text
   */
  getEmotionalContext(text: string): {
    primary: string;
    secondary: string | null;
    intensity: 'low' | 'medium' | 'high';
  } {
    const emotions: Record<string, number> = {
      excitement: 0,
      sadness: 0,
      anger: 0,
      fear: 0,
      love: 0,
      neutral: 1, // Default
    };

    // Count emotional pattern matches
    for (const [emotion, patterns] of Object.entries(EMOTIONAL_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          emotions[emotion] += matches.length;
        }
      }
    }

    // Sort by intensity
    const sorted = Object.entries(emotions).sort(([, a], [, b]) => b - a);

    const primary = sorted[0][0];
    const secondary = sorted[1][1] > 0 ? sorted[1][0] : null;
    const intensity =
      sorted[0][1] > 3 ? 'high' : sorted[0][1] > 1 ? 'medium' : 'low';

    return { primary, secondary, intensity };
  }

  /**
   * Clear context history for an author
   */
  clearHistory(authorId: string): void {
    this.contextHistory.delete(authorId);
  }
}

export const sentimentAnalyzerService = new SentimentAnalyzerService();
