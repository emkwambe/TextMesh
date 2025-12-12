/**
 * Trust Manager
 *
 * High-level trust management:
 * - Trust-based permissions
 * - Rate limit adjustments
 * - Feature access control
 * - Trust recovery
 */

import { createLogger } from '@textmesh/logger';
import { TrustScore, TrustTier, TrustConfig, TrustUpdateEvent } from './types';
import { trustScorer, TrustScorer, TrustScoreInput } from './trust-scorer';

const logger = createLogger({ service: 'trust-manager', level: 'info' });

export interface TierPermissions {
  canPost: boolean;
  canComment: boolean;
  canMessage: boolean;
  canUploadMedia: boolean;
  canCreateGroups: boolean;
  canGoLive: boolean;
  canMonetize: boolean;
  maxDailyPosts: number;
  maxDailyComments: number;
  maxDailyMessages: number;
  maxMediaSizeMB: number;
  requiresModeration: boolean;
  verificationRequired: boolean;
}

// Default permissions by tier
const TIER_PERMISSIONS: Record<TrustTier, TierPermissions> = {
  new: {
    canPost: true,
    canComment: true,
    canMessage: false,
    canUploadMedia: false,
    canCreateGroups: false,
    canGoLive: false,
    canMonetize: false,
    maxDailyPosts: 5,
    maxDailyComments: 20,
    maxDailyMessages: 0,
    maxMediaSizeMB: 0,
    requiresModeration: true,
    verificationRequired: true,
  },
  low: {
    canPost: true,
    canComment: true,
    canMessage: true,
    canUploadMedia: true,
    canCreateGroups: false,
    canGoLive: false,
    canMonetize: false,
    maxDailyPosts: 10,
    maxDailyComments: 50,
    maxDailyMessages: 20,
    maxMediaSizeMB: 5,
    requiresModeration: true,
    verificationRequired: false,
  },
  medium: {
    canPost: true,
    canComment: true,
    canMessage: true,
    canUploadMedia: true,
    canCreateGroups: true,
    canGoLive: false,
    canMonetize: false,
    maxDailyPosts: 25,
    maxDailyComments: 100,
    maxDailyMessages: 50,
    maxMediaSizeMB: 25,
    requiresModeration: false,
    verificationRequired: false,
  },
  high: {
    canPost: true,
    canComment: true,
    canMessage: true,
    canUploadMedia: true,
    canCreateGroups: true,
    canGoLive: true,
    canMonetize: false,
    maxDailyPosts: 50,
    maxDailyComments: 200,
    maxDailyMessages: 100,
    maxMediaSizeMB: 50,
    requiresModeration: false,
    verificationRequired: false,
  },
  verified: {
    canPost: true,
    canComment: true,
    canMessage: true,
    canUploadMedia: true,
    canCreateGroups: true,
    canGoLive: true,
    canMonetize: true,
    maxDailyPosts: 100,
    maxDailyComments: 500,
    maxDailyMessages: 200,
    maxMediaSizeMB: 100,
    requiresModeration: false,
    verificationRequired: false,
  },
  trusted: {
    canPost: true,
    canComment: true,
    canMessage: true,
    canUploadMedia: true,
    canCreateGroups: true,
    canGoLive: true,
    canMonetize: true,
    maxDailyPosts: -1, // Unlimited
    maxDailyComments: -1,
    maxDailyMessages: -1,
    maxMediaSizeMB: 500,
    requiresModeration: false,
    verificationRequired: false,
  },
};

export interface TrustRecoveryPlan {
  userId: string;
  currentTier: TrustTier;
  targetTier: TrustTier;
  requirements: TrustRequirement[];
  estimatedTimeToRecover: number; // days
  startedAt: Date;
}

export interface TrustRequirement {
  type: string;
  description: string;
  current: number;
  target: number;
  completed: boolean;
}

export class TrustManager {
  private scorer: TrustScorer;
  private recoveryPlans: Map<string, TrustRecoveryPlan> = new Map();
  private customPermissions: Map<string, Partial<TierPermissions>> = new Map();

  constructor(scorer?: TrustScorer) {
    this.scorer = scorer || trustScorer;
  }

  /**
   * Get permissions for user
   */
  getPermissions(userId: string): TierPermissions {
    const trustScore = this.scorer.getScore(userId);
    const tier = trustScore?.tier || 'new';

    const basePermissions = TIER_PERMISSIONS[tier];
    const customPermissions = this.customPermissions.get(userId);

    if (customPermissions) {
      return { ...basePermissions, ...customPermissions };
    }

    return basePermissions;
  }

  /**
   * Check if user can perform action
   */
  canPerform(userId: string, action: string): boolean {
    const permissions = this.getPermissions(userId);

    switch (action) {
      case 'post':
        return permissions.canPost;
      case 'comment':
        return permissions.canComment;
      case 'message':
        return permissions.canMessage;
      case 'upload_media':
        return permissions.canUploadMedia;
      case 'create_group':
        return permissions.canCreateGroups;
      case 'go_live':
        return permissions.canGoLive;
      case 'monetize':
        return permissions.canMonetize;
      default:
        return false;
    }
  }

  /**
   * Get rate limit for action
   */
  getRateLimit(userId: string, action: string): number {
    const permissions = this.getPermissions(userId);

    switch (action) {
      case 'post':
        return permissions.maxDailyPosts;
      case 'comment':
        return permissions.maxDailyComments;
      case 'message':
        return permissions.maxDailyMessages;
      default:
        return 0;
    }
  }

  /**
   * Check if content requires moderation
   */
  requiresModeration(userId: string): boolean {
    const permissions = this.getPermissions(userId);
    return permissions.requiresModeration;
  }

  /**
   * Set custom permissions for user
   */
  setCustomPermissions(userId: string, permissions: Partial<TierPermissions>): void {
    this.customPermissions.set(userId, permissions);
  }

  /**
   * Remove custom permissions
   */
  removeCustomPermissions(userId: string): void {
    this.customPermissions.delete(userId);
  }

  /**
   * Apply trust event
   */
  applyTrustEvent(userId: string, event: TrustUpdateEvent): TrustScore | null {
    const result = this.scorer.applyUpdate(userId, event);

    if (result) {
      logger.info('Trust event applied', {
        userId,
        eventType: event.type,
        newScore: result.score,
        newTier: result.tier,
      });
    }

    return result;
  }

  /**
   * Create trust recovery plan
   */
  createRecoveryPlan(userId: string, targetTier: TrustTier): TrustRecoveryPlan | null {
    const currentScore = this.scorer.getScore(userId);
    if (!currentScore) return null;

    const requirements = this.calculateRequirements(currentScore, targetTier);
    const estimatedTime = this.estimateRecoveryTime(requirements);

    const plan: TrustRecoveryPlan = {
      userId,
      currentTier: currentScore.tier,
      targetTier,
      requirements,
      estimatedTimeToRecover: estimatedTime,
      startedAt: new Date(),
    };

    this.recoveryPlans.set(userId, plan);

    logger.info('Recovery plan created', {
      userId,
      currentTier: currentScore.tier,
      targetTier,
      estimatedDays: estimatedTime,
    });

    return plan;
  }

  /**
   * Calculate requirements for tier upgrade
   */
  private calculateRequirements(
    currentScore: TrustScore,
    targetTier: TrustTier
  ): TrustRequirement[] {
    const requirements: TrustRequirement[] = [];

    // Verification requirements
    if (!currentScore.factors.verification.details.emailVerified) {
      requirements.push({
        type: 'verification',
        description: 'Verify email address',
        current: 0,
        target: 1,
        completed: false,
      });
    }

    // Activity requirements
    const activityDetails = currentScore.factors.activity.details as {
      postsLast30Days: number;
      activeStreak: number;
    };

    if (activityDetails.postsLast30Days < 10) {
      requirements.push({
        type: 'activity',
        description: 'Post at least 10 times in 30 days',
        current: activityDetails.postsLast30Days,
        target: 10,
        completed: false,
      });
    }

    if (activityDetails.activeStreak < 7) {
      requirements.push({
        type: 'streak',
        description: 'Maintain a 7-day active streak',
        current: activityDetails.activeStreak,
        target: 7,
        completed: false,
      });
    }

    // Clean record requirement
    const moderationDetails = currentScore.factors.moderation.details as {
      warningsReceived: number;
    };

    if (moderationDetails.warningsReceived > 0) {
      requirements.push({
        type: 'clean_record',
        description: 'Maintain clean record for 30 days',
        current: 0,
        target: 30,
        completed: false,
      });
    }

    return requirements;
  }

  /**
   * Estimate recovery time in days
   */
  private estimateRecoveryTime(requirements: TrustRequirement[]): number {
    let maxDays = 0;

    for (const req of requirements) {
      let days = 0;

      switch (req.type) {
        case 'verification':
          days = 1; // Can be done immediately
          break;
        case 'activity':
          days = Math.ceil((req.target - req.current) / 0.5); // ~0.5 posts per day
          break;
        case 'streak':
          days = req.target - req.current;
          break;
        case 'clean_record':
          days = req.target;
          break;
        default:
          days = 7;
      }

      maxDays = Math.max(maxDays, days);
    }

    return maxDays;
  }

  /**
   * Get recovery plan
   */
  getRecoveryPlan(userId: string): TrustRecoveryPlan | null {
    return this.recoveryPlans.get(userId) || null;
  }

  /**
   * Update recovery progress
   */
  updateRecoveryProgress(userId: string): TrustRecoveryPlan | null {
    const plan = this.recoveryPlans.get(userId);
    if (!plan) return null;

    const currentScore = this.scorer.getScore(userId);
    if (!currentScore) return null;

    // Check if target tier reached
    const tierOrder: TrustTier[] = ['new', 'low', 'medium', 'high', 'verified', 'trusted'];
    const currentTierIndex = tierOrder.indexOf(currentScore.tier);
    const targetTierIndex = tierOrder.indexOf(plan.targetTier);

    if (currentTierIndex >= targetTierIndex) {
      this.recoveryPlans.delete(userId);
      logger.info('Recovery plan completed', {
        userId,
        achievedTier: currentScore.tier,
      });
      return null;
    }

    // Update current tier
    plan.currentTier = currentScore.tier;

    return plan;
  }

  /**
   * Get trust score
   */
  getScore(userId: string): TrustScore | null {
    return this.scorer.getScore(userId);
  }

  /**
   * Calculate trust score
   */
  calculateScore(input: TrustScoreInput): TrustScore {
    return this.scorer.calculate(input);
  }

  /**
   * Get tier permissions definition
   */
  getTierPermissions(): Record<TrustTier, TierPermissions> {
    return { ...TIER_PERMISSIONS };
  }

  /**
   * Check trust level for interaction
   */
  canInteract(userId: string, targetUserId: string): {
    allowed: boolean;
    reason?: string;
  } {
    const userScore = this.scorer.getScore(userId);
    const targetScore = this.scorer.getScore(targetUserId);

    if (!userScore) {
      return { allowed: false, reason: 'User trust score not found' };
    }

    // New users can only interact with verified+ users
    if (userScore.tier === 'new' && targetScore && targetScore.score < 60) {
      return {
        allowed: false,
        reason: 'New users can only interact with high-trust accounts',
      };
    }

    return { allowed: true };
  }

  /**
   * Get trust statistics
   */
  getStats() {
    return this.scorer.getStats();
  }
}

// Export singleton
export const trustManager = new TrustManager();
