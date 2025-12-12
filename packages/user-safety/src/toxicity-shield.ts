import { Redis } from 'ioredis';
import {
  ToxicityConfig,
  ToxicitySensitivity,
  ToxicityCategory,
  ToxicityScore,
  UserShieldSettings,
  ShieldedContent,
} from './types';

const DEFAULT_CONFIG: ToxicityConfig = {
  enabled: true,
  defaultSensitivity: 'medium',
  categories: [
    'harassment',
    'hate_speech',
    'threats',
    'profanity',
    'spam',
  ],
  autoHideThreshold: 80,
  warnThreshold: 50,
};

const SENSITIVITY_THRESHOLDS: Record<ToxicitySensitivity, number> = {
  low: 70,
  medium: 50,
  high: 30,
  maximum: 10,
};

export class ToxicityShield {
  private redis: Redis;
  private config: ToxicityConfig;
  private readonly settingsPrefix = 'safety:shield_settings:';
  private readonly scorePrefix = 'safety:toxicity_score:';
  private readonly mutedWordsPrefix = 'safety:muted_words:';

  constructor(redis: Redis, config?: Partial<ToxicityConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getUserSettings(userId: string): Promise<UserShieldSettings> {
    const data = await this.redis.get(`${this.settingsPrefix}${userId}`);

    if (data) {
      const settings = JSON.parse(data);
      settings.createdAt = new Date(settings.createdAt);
      settings.updatedAt = new Date(settings.updatedAt);
      if (settings.vulnerableModeExpires) {
        settings.vulnerableModeExpires = new Date(settings.vulnerableModeExpires);
      }
      return settings;
    }

    // Return default settings
    return {
      userId,
      enabled: true,
      sensitivity: this.config.defaultSensitivity,
      blockedCategories: [],
      allowFromFollowing: true,
      allowFromVerified: true,
      vulnerableMode: false,
      mutedWords: [],
      mutedUsers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateUserSettings(
    userId: string,
    updates: Partial<Omit<UserShieldSettings, 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<UserShieldSettings> {
    const current = await this.getUserSettings(userId);
    const updated: UserShieldSettings = {
      ...current,
      ...updates,
      updatedAt: new Date(),
    };

    await this.redis.set(`${this.settingsPrefix}${userId}`, JSON.stringify(updated));

    return updated;
  }

  async enableVulnerableMode(
    userId: string,
    durationHours: number = 24
  ): Promise<UserShieldSettings> {
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);

    return this.updateUserSettings(userId, {
      vulnerableMode: true,
      vulnerableModeExpires: expiresAt,
      sensitivity: 'maximum',
    });
  }

  async disableVulnerableMode(userId: string): Promise<UserShieldSettings> {
    return this.updateUserSettings(userId, {
      vulnerableMode: false,
      vulnerableModeExpires: undefined,
      sensitivity: this.config.defaultSensitivity,
    });
  }

  async addMutedWords(userId: string, words: string[]): Promise<void> {
    const settings = await this.getUserSettings(userId);
    const uniqueWords = [...new Set([...settings.mutedWords, ...words.map(w => w.toLowerCase())])];

    await this.updateUserSettings(userId, { mutedWords: uniqueWords });
  }

  async removeMutedWords(userId: string, words: string[]): Promise<void> {
    const settings = await this.getUserSettings(userId);
    const lowercaseWords = words.map(w => w.toLowerCase());
    const filtered = settings.mutedWords.filter(w => !lowercaseWords.includes(w));

    await this.updateUserSettings(userId, { mutedWords: filtered });
  }

  async muteUser(userId: string, mutedUserId: string): Promise<void> {
    const settings = await this.getUserSettings(userId);
    if (!settings.mutedUsers.includes(mutedUserId)) {
      settings.mutedUsers.push(mutedUserId);
      await this.updateUserSettings(userId, { mutedUsers: settings.mutedUsers });
    }
  }

  async unmuteUser(userId: string, mutedUserId: string): Promise<void> {
    const settings = await this.getUserSettings(userId);
    const filtered = settings.mutedUsers.filter(id => id !== mutedUserId);
    await this.updateUserSettings(userId, { mutedUsers: filtered });
  }

  async analyzeContent(
    contentId: string,
    text: string,
    authorId: string
  ): Promise<ToxicityScore> {
    // In production, this would call an ML model (Perspective API, etc.)
    // For now, use simple heuristic analysis
    const scores = this.performBasicAnalysis(text);

    const toxicityScore: ToxicityScore = {
      overall: scores.overall,
      categories: scores.categories,
      flagged: scores.overall >= this.config.warnThreshold,
      hidden: scores.overall >= this.config.autoHideThreshold,
      reviewRequired: scores.overall >= 60,
    };

    // Cache the score
    await this.redis.set(
      `${this.scorePrefix}${contentId}`,
      JSON.stringify(toxicityScore),
      'EX',
      86400 * 7 // 7 days
    );

    return toxicityScore;
  }

  async shouldShieldContent(
    viewerId: string,
    contentId: string,
    authorId: string,
    toxicityScore: ToxicityScore,
    options: {
      isFollowing?: boolean;
      isAuthorVerified?: boolean;
    } = {}
  ): Promise<ShieldedContent> {
    const settings = await this.getUserSettings(viewerId);

    // Check if shield is enabled
    if (!settings.enabled) {
      return {
        contentId,
        authorId,
        toxicityScore,
        shieldAction: 'passed',
        userCanReveal: false,
      };
    }

    // Check if author is muted
    if (settings.mutedUsers.includes(authorId)) {
      return {
        contentId,
        authorId,
        toxicityScore,
        shieldAction: 'hidden',
        reason: 'Author is muted',
        userCanReveal: true,
      };
    }

    // Allow from following if enabled
    if (settings.allowFromFollowing && options.isFollowing) {
      return {
        contentId,
        authorId,
        toxicityScore,
        shieldAction: 'passed',
        userCanReveal: false,
      };
    }

    // Allow from verified if enabled
    if (settings.allowFromVerified && options.isAuthorVerified) {
      return {
        contentId,
        authorId,
        toxicityScore,
        shieldAction: 'passed',
        userCanReveal: false,
      };
    }

    // Get threshold based on sensitivity
    const threshold = SENSITIVITY_THRESHOLDS[settings.sensitivity];

    // In vulnerable mode, use maximum protection
    const effectiveThreshold = settings.vulnerableMode
      ? SENSITIVITY_THRESHOLDS.maximum
      : threshold;

    // Check blocked categories
    for (const category of settings.blockedCategories) {
      const categoryScore = toxicityScore.categories[category];
      if (categoryScore && categoryScore >= effectiveThreshold) {
        return {
          contentId,
          authorId,
          toxicityScore,
          shieldAction: 'hidden',
          reason: `Contains ${category.replace('_', ' ')}`,
          userCanReveal: !settings.vulnerableMode,
        };
      }
    }

    // Check overall toxicity
    if (toxicityScore.overall >= effectiveThreshold) {
      const action = toxicityScore.hidden ? 'hidden' : 'warning';
      return {
        contentId,
        authorId,
        toxicityScore,
        shieldAction: action,
        reason: 'Potentially harmful content detected',
        userCanReveal: !settings.vulnerableMode,
      };
    }

    return {
      contentId,
      authorId,
      toxicityScore,
      shieldAction: 'passed',
      userCanReveal: false,
    };
  }

  async checkMutedWords(
    viewerId: string,
    text: string
  ): Promise<{ blocked: boolean; matchedWords: string[] }> {
    const settings = await this.getUserSettings(viewerId);
    const textLower = text.toLowerCase();
    const matchedWords: string[] = [];

    for (const word of settings.mutedWords) {
      if (textLower.includes(word)) {
        matchedWords.push(word);
      }
    }

    return {
      blocked: matchedWords.length > 0,
      matchedWords,
    };
  }

  async getContentToxicityScore(contentId: string): Promise<ToxicityScore | null> {
    const data = await this.redis.get(`${this.scorePrefix}${contentId}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  private performBasicAnalysis(text: string): {
    overall: number;
    categories: Partial<Record<ToxicityCategory, number>>;
  } {
    const textLower = text.toLowerCase();
    const categories: Partial<Record<ToxicityCategory, number>> = {};

    // Simple keyword-based analysis (would be ML in production)
    const patterns = {
      harassment: /\b(idiot|stupid|dumb|loser|moron)\b/gi,
      hate_speech: /\b(hate|disgusting)\b/gi,
      threats: /\b(kill|die|hurt|destroy)\b/gi,
      profanity: /\b(damn|hell|crap)\b/gi,
      spam: /(http|www|click here|buy now|free money)/gi,
    };

    let maxScore = 0;

    for (const [category, pattern] of Object.entries(patterns)) {
      const matches = textLower.match(pattern);
      if (matches) {
        const score = Math.min(100, matches.length * 25);
        categories[category as ToxicityCategory] = score;
        maxScore = Math.max(maxScore, score);
      }
    }

    // Check for ALL CAPS (shouting)
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.5 && text.length > 20) {
      categories.harassment = Math.max(categories.harassment || 0, 30);
      maxScore = Math.max(maxScore, 30);
    }

    // Check for excessive punctuation
    const exclamations = (text.match(/!/g) || []).length;
    if (exclamations > 3) {
      maxScore = Math.max(maxScore, Math.min(50, exclamations * 10));
    }

    return {
      overall: maxScore,
      categories,
    };
  }
}
