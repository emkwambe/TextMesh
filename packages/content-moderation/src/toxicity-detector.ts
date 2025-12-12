/**
 * Toxicity Detector
 *
 * Detects toxic content using ML and rule-based approaches:
 * - Hate speech
 * - Harassment
 * - Threats
 * - Profanity
 * - Identity attacks
 */

import { createLogger } from '@textmesh/logger';
import Filter from 'bad-words';
import { ToxicityScores } from './types';

const logger = createLogger({ service: 'toxicity-detector', level: 'info' });

// Profanity filter
const profanityFilter = new Filter();

// Toxic patterns (regex-based detection)
const TOXIC_PATTERNS = {
  threats: [
    /\b(kill|murder|destroy|hurt|attack|beat)\s+(you|him|her|them|yourself)\b/gi,
    /\bi('ll|'m\s+going\s+to)\s+(kill|murder|hurt|destroy)\b/gi,
    /\byou('re|\s+are)\s+(dead|going\s+to\s+die)\b/gi,
    /\b(death|murder)\s+threat/gi,
  ],
  harassment: [
    /\b(stalk|harass|bully|torment)\s+(you|him|her|them)\b/gi,
    /\bgo\s+(kill|hang|hurt)\s+yourself\b/gi,
    /\bkys\b/gi, // Kill yourself abbreviation
    /\bno\s+one\s+(likes|loves|cares\s+about)\s+you\b/gi,
  ],
  identityAttack: [
    /\b(all|every)\s+\w+\s+(are|is)\s+(trash|garbage|scum|evil)\b/gi,
    /\b(hate|despise)\s+(all|every)\s+\w+\b/gi,
  ],
  sexuallyExplicit: [
    /\b(send|show)\s+(me\s+)?(nudes|pics|photos)\b/gi,
    /\bwant\s+to\s+f\*+k\b/gi,
  ],
};

// Severity weights for different toxic content types
const SEVERITY_WEIGHTS = {
  threats: 0.95,
  harassment: 0.85,
  identityAttack: 0.9,
  sexuallyExplicit: 0.7,
  profanity: 0.4,
  insult: 0.5,
};

export class ToxicityDetector {
  private customBadWords: string[] = [];
  private whitelist: string[] = [];

  constructor(options: {
    customBadWords?: string[];
    whitelist?: string[];
  } = {}) {
    if (options.customBadWords) {
      this.customBadWords = options.customBadWords;
      profanityFilter.addWords(...options.customBadWords);
    }

    if (options.whitelist) {
      this.whitelist = options.whitelist;
      profanityFilter.removeWords(...options.whitelist);
    }
  }

  /**
   * Analyze text for toxicity
   */
  analyze(text: string): ToxicityScores {
    const normalizedText = this.normalizeText(text);
    const scores: ToxicityScores = {
      toxicity: 0,
      severeToxicity: 0,
      identityAttack: 0,
      insult: 0,
      profanity: 0,
      threat: 0,
      sexuallyExplicit: 0,
    };

    // Check profanity
    scores.profanity = this.checkProfanity(normalizedText);

    // Check patterns
    scores.threat = this.checkPatterns(normalizedText, TOXIC_PATTERNS.threats);
    scores.identityAttack = this.checkPatterns(normalizedText, TOXIC_PATTERNS.identityAttack);
    scores.sexuallyExplicit = this.checkPatterns(normalizedText, TOXIC_PATTERNS.sexuallyExplicit);

    // Check harassment (includes insults)
    const harassmentScore = this.checkPatterns(normalizedText, TOXIC_PATTERNS.harassment);
    scores.insult = harassmentScore * 0.7;

    // Calculate overall toxicity
    scores.toxicity = this.calculateOverallToxicity(scores);

    // Severe toxicity is high threat + harassment
    scores.severeToxicity = Math.max(
      scores.threat * 0.9 + harassmentScore * 0.1,
      scores.identityAttack * 0.8
    );

    // Apply sentiment analysis for context
    const sentimentAdjustment = this.analyzeSentiment(normalizedText);
    scores.toxicity = Math.min(1, scores.toxicity * sentimentAdjustment);

    return scores;
  }

  /**
   * Quick check if text is likely toxic
   */
  isToxic(text: string, threshold: number = 0.6): boolean {
    const scores = this.analyze(text);
    return scores.toxicity >= threshold;
  }

  /**
   * Check for profanity
   */
  private checkProfanity(text: string): number {
    if (!profanityFilter.isProfane(text)) {
      return 0;
    }

    // Count profane words
    const words = text.split(/\s+/);
    let profaneCount = 0;

    for (const word of words) {
      if (profanityFilter.isProfane(word)) {
        profaneCount++;
      }
    }

    // Score based on density of profanity
    const density = profaneCount / Math.max(words.length, 1);
    return Math.min(1, density * 3); // Scale up but cap at 1
  }

  /**
   * Check text against patterns
   */
  private checkPatterns(text: string, patterns: RegExp[]): number {
    let matchCount = 0;
    let totalWeight = 0;

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matchCount += matches.length;
        totalWeight += 0.3; // Each pattern match adds weight
      }
    }

    return Math.min(1, totalWeight + (matchCount > 0 ? 0.4 : 0));
  }

  /**
   * Calculate overall toxicity score
   */
  private calculateOverallToxicity(scores: ToxicityScores): number {
    const weightedSum =
      scores.threat * SEVERITY_WEIGHTS.threats +
      scores.identityAttack * SEVERITY_WEIGHTS.identityAttack +
      scores.sexuallyExplicit * SEVERITY_WEIGHTS.sexuallyExplicit +
      scores.profanity * SEVERITY_WEIGHTS.profanity +
      scores.insult * SEVERITY_WEIGHTS.insult;

    // Normalize to 0-1 range
    const maxPossible = Object.values(SEVERITY_WEIGHTS).reduce((a, b) => a + b, 0);
    return Math.min(1, weightedSum / (maxPossible * 0.5));
  }

  /**
   * Basic sentiment analysis for context
   */
  private analyzeSentiment(text: string): number {
    // Negative sentiment indicators boost toxicity score
    const negativeIndicators = [
      /\bhate\b/gi,
      /\bdisgusting\b/gi,
      /\bterrible\b/gi,
      /\bawful\b/gi,
      /\bworst\b/gi,
      /\bstupid\b/gi,
      /\bidiot\b/gi,
      /\bmoron\b/gi,
    ];

    let negativeCount = 0;
    for (const pattern of negativeIndicators) {
      if (pattern.test(text)) {
        negativeCount++;
      }
    }

    // Return multiplier (1.0 - 1.5)
    return 1 + Math.min(0.5, negativeCount * 0.1);
  }

  /**
   * Normalize text for analysis
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      // Replace common obfuscations
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's')
      // Remove excessive spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get explanation for toxicity score
   */
  explain(scores: ToxicityScores): string[] {
    const reasons: string[] = [];

    if (scores.threat > 0.5) {
      reasons.push('Contains threatening language');
    }
    if (scores.identityAttack > 0.5) {
      reasons.push('Contains identity-based attacks');
    }
    if (scores.sexuallyExplicit > 0.5) {
      reasons.push('Contains sexually explicit content');
    }
    if (scores.profanity > 0.5) {
      reasons.push('Contains excessive profanity');
    }
    if (scores.insult > 0.5) {
      reasons.push('Contains insulting language');
    }

    return reasons;
  }

  /**
   * Add custom bad words
   */
  addBadWords(words: string[]): void {
    profanityFilter.addWords(...words);
    this.customBadWords.push(...words);
  }

  /**
   * Add words to whitelist
   */
  addWhitelist(words: string[]): void {
    profanityFilter.removeWords(...words);
    this.whitelist.push(...words);
  }
}

export const toxicityDetector = new ToxicityDetector();
