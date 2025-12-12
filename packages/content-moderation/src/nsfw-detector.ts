/**
 * NSFW Detector
 *
 * Detects Not Safe For Work content:
 * - Adult/sexual content
 * - Violence/gore
 * - Drugs/substances
 *
 * Note: For images, this would integrate with external ML services
 * like Google Cloud Vision, AWS Rekognition, or self-hosted models
 */

import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'nsfw-detector', level: 'info' });

export interface NSFWResult {
  isNSFW: boolean;
  categories: {
    adult: number;
    violence: number;
    drugs: number;
    medical: number;
    racy: number;
  };
  confidence: number;
  reason?: string;
}

// NSFW text patterns
const NSFW_PATTERNS = {
  adult: [
    /\bporn\b/gi,
    /\bxxx\b/gi,
    /\bnude\b/gi,
    /\bnaked\b/gi,
    /\bsex\s*tape\b/gi,
    /\bonlyfans\b/gi,
    /\bfansly\b/gi,
    /\bnsfw\b/gi,
    /\blewd\b/gi,
  ],
  violence: [
    /\bgore\b/gi,
    /\bmutilat/gi,
    /\btortur/gi,
    /\bbeheading\b/gi,
    /\bexecution\b/gi,
    /\bbrutal\s*(kill|murder|death)/gi,
    /\bsnuff\b/gi,
  ],
  drugs: [
    /\b(buy|sell|order)\s*(drugs|meth|cocaine|heroin|fentanyl)\b/gi,
    /\bdrug\s*dealer\b/gi,
    /\bcocaine\b/gi,
    /\bheroin\b/gi,
    /\bfentanyl\b/gi,
    /\bmethamphetamine\b/gi,
  ],
  selfHarm: [
    /\bsuicide\s*(method|how|way)\b/gi,
    /\bself[_-]?harm\b/gi,
    /\bcut\s*(myself|yourself|my\s*wrist)/gi,
    /\bpro[_-]?ana\b/gi,
    /\bpro[_-]?mia\b/gi,
  ],
};

// Known NSFW domains
const NSFW_DOMAINS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'redtube.com', 'youporn.com',
  'xhamster.com', 'spankbang.com', 'eporner.com', 'tube8.com', 'beeg.com',
  'onlyfans.com', 'fansly.com', 'manyvids.com', 'chaturbate.com',
];

export class NSFWDetector {
  private customPatterns: Map<string, RegExp[]> = new Map();

  /**
   * Analyze text for NSFW content
   */
  analyzeText(text: string): NSFWResult {
    const scores = {
      adult: 0,
      violence: 0,
      drugs: 0,
      medical: 0,
      racy: 0,
    };

    const reasons: string[] = [];

    // Check each category
    for (const [category, patterns] of Object.entries(NSFW_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          const key = category === 'selfHarm' ? 'violence' : category;
          scores[key as keyof typeof scores] += 0.3;
          reasons.push(`Matched ${category} pattern`);
        }
      }
    }

    // Check custom patterns
    for (const [category, patterns] of this.customPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          const key = category as keyof typeof scores;
          if (key in scores) {
            scores[key] += 0.3;
          }
        }
      }
    }

    // Normalize scores
    for (const key of Object.keys(scores) as Array<keyof typeof scores>) {
      scores[key] = Math.min(1, scores[key]);
    }

    // Calculate overall NSFW score
    const maxScore = Math.max(...Object.values(scores));
    const isNSFW = maxScore > 0.5;

    return {
      isNSFW,
      categories: scores,
      confidence: maxScore,
      reason: reasons.length > 0 ? reasons[0] : undefined,
    };
  }

  /**
   * Check if URL points to NSFW domain
   */
  isNSFWUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return NSFW_DOMAINS.some((domain) => hostname.includes(domain));
    } catch {
      return false;
    }
  }

  /**
   * Analyze URLs in content
   */
  analyzeUrls(urls: string[]): {
    hasNSFW: boolean;
    nsfwUrls: string[];
  } {
    const nsfwUrls = urls.filter((url) => this.isNSFWUrl(url));
    return {
      hasNSFW: nsfwUrls.length > 0,
      nsfwUrls,
    };
  }

  /**
   * Analyze image using external service
   * This is a placeholder for integration with ML services
   */
  async analyzeImage(imageUrl: string): Promise<NSFWResult> {
    // In production, this would call:
    // - Google Cloud Vision SafeSearch
    // - AWS Rekognition Content Moderation
    // - Azure Content Moderator
    // - Self-hosted NSFW detection model

    logger.debug('Image NSFW analysis requested', { imageUrl });

    // Return placeholder - would be actual ML result
    return {
      isNSFW: false,
      categories: {
        adult: 0,
        violence: 0,
        drugs: 0,
        medical: 0,
        racy: 0,
      },
      confidence: 0,
    };
  }

  /**
   * Analyze video using external service
   */
  async analyzeVideo(videoUrl: string): Promise<NSFWResult> {
    // Would sample frames and analyze each
    logger.debug('Video NSFW analysis requested', { videoUrl });

    return {
      isNSFW: false,
      categories: {
        adult: 0,
        violence: 0,
        drugs: 0,
        medical: 0,
        racy: 0,
      },
      confidence: 0,
    };
  }

  /**
   * Add custom NSFW patterns
   */
  addPatterns(category: string, patterns: RegExp[]): void {
    const existing = this.customPatterns.get(category) || [];
    this.customPatterns.set(category, [...existing, ...patterns]);
  }

  /**
   * Check if content needs age restriction
   */
  needsAgeRestriction(result: NSFWResult): boolean {
    return (
      result.categories.adult > 0.3 ||
      result.categories.violence > 0.5 ||
      result.categories.drugs > 0.3
    );
  }

  /**
   * Get content rating based on NSFW scores
   */
  getContentRating(result: NSFWResult): 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17' {
    const { adult, violence, racy } = result.categories;

    if (adult > 0.7 || violence > 0.8) {
      return 'NC-17';
    }
    if (adult > 0.4 || violence > 0.5 || racy > 0.6) {
      return 'R';
    }
    if (adult > 0.2 || violence > 0.3 || racy > 0.4) {
      return 'PG-13';
    }
    if (racy > 0.2 || violence > 0.1) {
      return 'PG';
    }
    return 'G';
  }
}

export const nsfwDetector = new NSFWDetector();
