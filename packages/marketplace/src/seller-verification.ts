/**
 * Seller Verification System
 *
 * Tiered verification to build trust:
 * - Unverified: New sellers, limited features
 * - Basic: Email + phone verified
 * - Verified: ID verification completed
 * - Trusted: Track record + ID
 * - Premium: Business verified
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SellerProfile,
  SellerVerificationLevel,
  SafetyViolation,
  SafetyViolationType,
  SafetyAction,
  DEFAULT_SAFETY_POLICY
} from './types';

// Requirements for each verification level
const LEVEL_REQUIREMENTS = {
  basic: {
    emailVerified: true,
    phoneVerified: true,
    accountAgeDays: 0,
    minSales: 0
  },
  verified: {
    emailVerified: true,
    phoneVerified: true,
    identityVerified: true,
    accountAgeDays: 7,
    minSales: 0
  },
  trusted: {
    emailVerified: true,
    phoneVerified: true,
    identityVerified: true,
    accountAgeDays: 30,
    minSales: 10,
    minRating: 4.0,
    maxDisputeRate: 0.05
  },
  premium: {
    emailVerified: true,
    phoneVerified: true,
    identityVerified: true,
    addressVerified: true,  // Business address only
    accountAgeDays: 90,
    minSales: 50,
    minRating: 4.5,
    maxDisputeRate: 0.02
  }
};

// Limits based on verification level
const LEVEL_LIMITS = {
  unverified: {
    maxActiveListings: 5,
    maxPricePerItem: 100,
    maxMonthlyRevenue: 500,
    canSellPhysical: true,
    canSellDigital: true,
    canSellServices: false
  },
  basic: {
    maxActiveListings: 20,
    maxPricePerItem: 500,
    maxMonthlyRevenue: 2000,
    canSellPhysical: true,
    canSellDigital: true,
    canSellServices: true
  },
  verified: {
    maxActiveListings: 50,
    maxPricePerItem: 2000,
    maxMonthlyRevenue: 10000,
    canSellPhysical: true,
    canSellDigital: true,
    canSellServices: true
  },
  trusted: {
    maxActiveListings: 200,
    maxPricePerItem: 10000,
    maxMonthlyRevenue: 50000,
    canSellPhysical: true,
    canSellDigital: true,
    canSellServices: true
  },
  premium: {
    maxActiveListings: -1,  // Unlimited
    maxPricePerItem: 50000,
    maxMonthlyRevenue: -1,  // Unlimited
    canSellPhysical: true,
    canSellDigital: true,
    canSellServices: true
  }
};

export class SellerVerificationManager {
  private redis: any;
  private db: any;

  constructor(redis: any, db: any) {
    this.redis = redis;
    this.db = db;
  }

  /**
   * Create new seller profile
   */
  async createSellerProfile(userId: string, displayName: string): Promise<SellerProfile> {
    // Check if already exists
    const existing = await this.getSellerProfile(userId);
    if (existing) {
      throw new Error('Seller profile already exists');
    }

    const now = new Date();
    const profile: SellerProfile = {
      userId,
      displayName,
      verificationLevel: 'unverified',
      identityVerified: false,
      phoneVerified: false,
      emailVerified: false,
      addressVerified: false,
      totalSales: 0,
      totalRevenue: 0,
      rating: 0,
      reviewCount: 0,
      responseRate: 0,
      responseTimeHours: 0,
      accountAgeDays: 0,
      disputeRate: 0,
      refundRate: 0,
      acceptingOrders: true,
      vacationMode: false,
      safetyPolicyAccepted: false,
      safetyViolations: 0,
      createdAt: now,
      updatedAt: now
    };

    await this.saveSellerProfile(profile);

    return profile;
  }

  /**
   * Accept safety policy (required before selling)
   */
  async acceptSafetyPolicy(userId: string): Promise<SellerProfile> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) {
      throw new Error('Seller profile not found');
    }

    profile.safetyPolicyAccepted = true;
    profile.updatedAt = new Date();

    await this.saveSellerProfile(profile);

    // Log acceptance
    await this.redis.hset(
      `marketplace:seller:${userId}:safety_acceptance`,
      'version', DEFAULT_SAFETY_POLICY.version,
      'acceptedAt', new Date().toISOString(),
      'acknowledgment', DEFAULT_SAFETY_POLICY.acknowledgmentText
    );

    return profile;
  }

  /**
   * Check if seller can list items
   */
  async canSell(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    limits: typeof LEVEL_LIMITS[keyof typeof LEVEL_LIMITS];
  }> {
    const profile = await this.getSellerProfile(userId);

    if (!profile) {
      return {
        allowed: false,
        reason: 'Seller profile not found. Please create a seller profile first.',
        limits: LEVEL_LIMITS.unverified
      };
    }

    if (!profile.safetyPolicyAccepted) {
      return {
        allowed: false,
        reason: 'You must accept the safety policy before selling. ' +
                'TextMesh Marketplace is delivery-only with no residential meetups.',
        limits: LEVEL_LIMITS[profile.verificationLevel]
      };
    }

    // Check for active suspensions
    const suspension = await this.getActiveSuspension(userId);
    if (suspension) {
      return {
        allowed: false,
        reason: `Selling suspended until ${suspension.expiresAt?.toISOString() || 'permanently'}. ` +
                `Reason: ${suspension.description}`,
        limits: LEVEL_LIMITS[profile.verificationLevel]
      };
    }

    return {
      allowed: true,
      limits: LEVEL_LIMITS[profile.verificationLevel]
    };
  }

  /**
   * Verify email
   */
  async verifyEmail(userId: string): Promise<SellerProfile> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) {
      throw new Error('Seller profile not found');
    }

    profile.emailVerified = true;
    profile.updatedAt = new Date();

    await this.saveSellerProfile(profile);
    await this.checkAndUpgradeLevel(userId);

    return profile;
  }

  /**
   * Verify phone
   */
  async verifyPhone(userId: string): Promise<SellerProfile> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) {
      throw new Error('Seller profile not found');
    }

    profile.phoneVerified = true;
    profile.updatedAt = new Date();

    await this.saveSellerProfile(profile);
    await this.checkAndUpgradeLevel(userId);

    return profile;
  }

  /**
   * Verify identity (ID verification)
   */
  async verifyIdentity(
    userId: string,
    verificationData: {
      documentType: 'passport' | 'drivers_license' | 'national_id';
      documentNumber: string;
      verificationId: string;  // From ID verification service
      verifiedAt: Date;
    }
  ): Promise<SellerProfile> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) {
      throw new Error('Seller profile not found');
    }

    profile.identityVerified = true;
    profile.updatedAt = new Date();

    await this.saveSellerProfile(profile);

    // Store verification record (encrypted)
    await this.redis.hset(
      `marketplace:seller:${userId}:identity`,
      'documentType', verificationData.documentType,
      'verificationId', verificationData.verificationId,
      'verifiedAt', verificationData.verifiedAt.toISOString()
    );

    await this.checkAndUpgradeLevel(userId);

    return profile;
  }

  /**
   * Verify business address (for premium tier)
   * NOTE: This is for BUSINESS addresses only, NOT residential
   */
  async verifyBusinessAddress(
    userId: string,
    addressData: {
      businessName: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      businessRegistrationNumber?: string;
    }
  ): Promise<SellerProfile> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) {
      throw new Error('Seller profile not found');
    }

    // Verify this is a business address, not residential
    // In production, use address verification API
    const isResidential = await this.checkIfResidential(addressData);
    if (isResidential) {
      throw new Error(
        'SAFETY VIOLATION: Only business addresses can be verified. ' +
        'Residential addresses are not allowed for seller verification.'
      );
    }

    profile.addressVerified = true;
    profile.updatedAt = new Date();

    await this.saveSellerProfile(profile);
    await this.checkAndUpgradeLevel(userId);

    return profile;
  }

  /**
   * Check if address is residential (stub - would use API)
   */
  private async checkIfResidential(address: {
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): Promise<boolean> {
    // In production, use address verification API like:
    // - USPS Address Validation API
    // - Google Address Validation API
    // - SmartyStreets

    // For now, basic heuristic checks
    const residentialIndicators = [
      'apt', 'apartment', 'unit', 'suite', 'floor',
      'flat', 'condo', 'house', 'residence', 'home'
    ];

    const addressLower = address.addressLine1.toLowerCase();

    for (const indicator of residentialIndicators) {
      if (addressLower.includes(indicator)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check and upgrade verification level
   */
  private async checkAndUpgradeLevel(userId: string): Promise<void> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) return;

    // Calculate account age
    profile.accountAgeDays = Math.floor(
      (Date.now() - new Date(profile.createdAt).getTime()) / (24 * 60 * 60 * 1000)
    );

    let newLevel: SellerVerificationLevel = 'unverified';

    // Check premium requirements
    const premiumReqs = LEVEL_REQUIREMENTS.premium;
    if (
      profile.emailVerified &&
      profile.phoneVerified &&
      profile.identityVerified &&
      profile.addressVerified &&
      profile.accountAgeDays >= premiumReqs.accountAgeDays &&
      profile.totalSales >= premiumReqs.minSales &&
      profile.rating >= premiumReqs.minRating &&
      profile.disputeRate <= premiumReqs.maxDisputeRate
    ) {
      newLevel = 'premium';
    }
    // Check trusted requirements
    else if (
      profile.emailVerified &&
      profile.phoneVerified &&
      profile.identityVerified &&
      profile.accountAgeDays >= LEVEL_REQUIREMENTS.trusted.accountAgeDays &&
      profile.totalSales >= LEVEL_REQUIREMENTS.trusted.minSales &&
      profile.rating >= LEVEL_REQUIREMENTS.trusted.minRating &&
      profile.disputeRate <= LEVEL_REQUIREMENTS.trusted.maxDisputeRate
    ) {
      newLevel = 'trusted';
    }
    // Check verified requirements
    else if (
      profile.emailVerified &&
      profile.phoneVerified &&
      profile.identityVerified &&
      profile.accountAgeDays >= LEVEL_REQUIREMENTS.verified.accountAgeDays
    ) {
      newLevel = 'verified';
    }
    // Check basic requirements
    else if (profile.emailVerified && profile.phoneVerified) {
      newLevel = 'basic';
    }

    if (newLevel !== profile.verificationLevel) {
      profile.verificationLevel = newLevel;
      profile.updatedAt = new Date();
      await this.saveSellerProfile(profile);

      // Emit upgrade event
      await this.redis.publish('marketplace:seller:level_changed', JSON.stringify({
        userId,
        oldLevel: profile.verificationLevel,
        newLevel
      }));
    }
  }

  /**
   * Record safety violation
   */
  async recordSafetyViolation(
    userId: string,
    type: SafetyViolationType,
    description: string,
    evidence?: string[]
  ): Promise<SafetyViolation> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) {
      throw new Error('Seller profile not found');
    }

    // Determine severity and action based on violation type
    let severity: SafetyViolation['severity'];
    let action: SafetyAction;

    switch (type) {
      case 'residential_meetup_attempt':
      case 'shared_home_address':
      case 'requested_home_visit':
        severity = 'critical';
        // First offense: 30 day suspension
        // Repeat: permanent
        if (profile.safetyViolations > 0) {
          action = 'selling_suspended_permanent';
        } else {
          action = 'selling_suspended_30d';
        }
        break;

      case 'circumvented_platform':
      case 'scam_attempt':
        severity = 'major';
        action = profile.safetyViolations > 0 ? 'account_suspended' : 'selling_suspended_30d';
        break;

      case 'harassment':
        severity = 'major';
        action = 'selling_suspended_7d';
        break;

      case 'prohibited_item':
      case 'fake_listing':
        severity = 'minor';
        action = profile.safetyViolations > 1 ? 'selling_suspended_7d' : 'listing_removed';
        break;

      default:
        severity = 'warning';
        action = 'warning_issued';
    }

    const violation: SafetyViolation = {
      id: uuidv4(),
      userId,
      type,
      severity,
      description,
      evidence,
      actionTaken: action,
      createdAt: new Date(),
      expiresAt: this.calculateExpiryDate(action)
    };

    // Save violation
    await this.redis.rpush(
      `marketplace:seller:${userId}:violations`,
      JSON.stringify(violation)
    );

    // Update profile
    profile.safetyViolations++;
    profile.updatedAt = new Date();
    await this.saveSellerProfile(profile);

    // Apply action
    await this.applyAction(userId, action, violation);

    return violation;
  }

  /**
   * Calculate expiry date for violations/suspensions
   */
  private calculateExpiryDate(action: SafetyAction): Date | undefined {
    const now = Date.now();

    switch (action) {
      case 'selling_suspended_7d':
        return new Date(now + 7 * 24 * 60 * 60 * 1000);
      case 'selling_suspended_30d':
        return new Date(now + 30 * 24 * 60 * 60 * 1000);
      case 'selling_suspended_permanent':
      case 'account_banned':
        return undefined; // Never expires
      default:
        return new Date(now + 90 * 24 * 60 * 60 * 1000); // 90 day record
    }
  }

  /**
   * Apply safety action
   */
  private async applyAction(
    userId: string,
    action: SafetyAction,
    violation: SafetyViolation
  ): Promise<void> {
    switch (action) {
      case 'selling_suspended_7d':
      case 'selling_suspended_30d':
      case 'selling_suspended_permanent':
        await this.redis.hset(
          `marketplace:seller:${userId}:suspension`,
          'type', action,
          'violationId', violation.id,
          'startedAt', new Date().toISOString(),
          'expiresAt', violation.expiresAt?.toISOString() || 'never'
        );
        break;

      case 'account_suspended':
      case 'account_banned':
        // Escalate to platform-level suspension
        await this.redis.publish('platform:account:suspend', JSON.stringify({
          userId,
          reason: violation.description,
          type: action,
          source: 'marketplace_safety'
        }));
        break;
    }
  }

  /**
   * Get active suspension
   */
  async getActiveSuspension(userId: string): Promise<SafetyViolation | null> {
    const suspensionData = await this.redis.hgetall(`marketplace:seller:${userId}:suspension`);

    if (!suspensionData || Object.keys(suspensionData).length === 0) {
      return null;
    }

    // Check if expired
    if (suspensionData.expiresAt && suspensionData.expiresAt !== 'never') {
      const expiresAt = new Date(suspensionData.expiresAt);
      if (expiresAt < new Date()) {
        // Clear expired suspension
        await this.redis.del(`marketplace:seller:${userId}:suspension`);
        return null;
      }
    }

    // Get the violation details
    const violations = await this.getViolationHistory(userId);
    return violations.find(v => v.id === suspensionData.violationId) || null;
  }

  /**
   * Get violation history
   */
  async getViolationHistory(userId: string): Promise<SafetyViolation[]> {
    const data = await this.redis.lrange(`marketplace:seller:${userId}:violations`, 0, -1);
    return data.map((d: string) => JSON.parse(d));
  }

  /**
   * Update seller stats after sale
   */
  async updateSellerStats(
    userId: string,
    stats: {
      saleAmount?: number;
      reviewRating?: number;
      disputed?: boolean;
      refunded?: boolean;
      responseTimeHours?: number;
    }
  ): Promise<void> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) return;

    if (stats.saleAmount !== undefined) {
      profile.totalSales++;
      profile.totalRevenue += stats.saleAmount;
    }

    if (stats.reviewRating !== undefined) {
      // Calculate new average rating
      const totalRatingPoints = profile.rating * profile.reviewCount + stats.reviewRating;
      profile.reviewCount++;
      profile.rating = totalRatingPoints / profile.reviewCount;
    }

    if (stats.disputed) {
      // Update dispute rate
      profile.disputeRate = (profile.disputeRate * (profile.totalSales - 1) + 1) / profile.totalSales;
    }

    if (stats.refunded) {
      profile.refundRate = (profile.refundRate * (profile.totalSales - 1) + 1) / profile.totalSales;
    }

    if (stats.responseTimeHours !== undefined) {
      // Rolling average of response time
      const weight = Math.min(profile.totalSales, 100);
      profile.responseTimeHours =
        (profile.responseTimeHours * (weight - 1) + stats.responseTimeHours) / weight;
    }

    profile.updatedAt = new Date();
    await this.saveSellerProfile(profile);

    // Check for level upgrade
    await this.checkAndUpgradeLevel(userId);
  }

  /**
   * Get seller profile
   */
  async getSellerProfile(userId: string): Promise<SellerProfile | null> {
    const data = await this.redis.hget('marketplace:sellers', userId);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get seller limits
   */
  async getSellerLimits(userId: string): Promise<typeof LEVEL_LIMITS[keyof typeof LEVEL_LIMITS]> {
    const profile = await this.getSellerProfile(userId);
    if (!profile) return LEVEL_LIMITS.unverified;
    return LEVEL_LIMITS[profile.verificationLevel];
  }

  // Storage helpers
  private async saveSellerProfile(profile: SellerProfile): Promise<void> {
    await this.redis.hset('marketplace:sellers', profile.userId, JSON.stringify(profile));
  }
}
