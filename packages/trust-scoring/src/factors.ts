/**
 * Trust Factor Calculators
 *
 * Individual factor calculation logic for trust scoring
 */

import {
  TrustFactor,
  UserActivityMetrics,
  ContentQualityMetrics,
  ModerationMetrics,
  VerificationStatus,
  SocialMetrics,
  TrustConfig,
} from './types';

/**
 * Calculate account age factor
 */
export function calculateAccountAgeFactor(
  accountCreatedAt: Date,
  config: TrustConfig
): TrustFactor {
  const now = new Date();
  const ageMs = now.getTime() - accountCreatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  let value: number;

  if (ageDays < 1) {
    value = 5;
  } else if (ageDays < 7) {
    value = 15;
  } else if (ageDays < 30) {
    value = 30;
  } else if (ageDays < 90) {
    value = 50;
  } else if (ageDays < 180) {
    value = 65;
  } else if (ageDays < 365) {
    value = 80;
  } else if (ageDays < 730) {
    value = 90;
  } else {
    value = 100;
  }

  return {
    name: 'accountAge',
    value,
    weight: config.weights.accountAge,
    details: {
      createdAt: accountCreatedAt,
      ageDays: Math.floor(ageDays),
    },
  };
}

/**
 * Calculate verification factor
 */
export function calculateVerificationFactor(
  status: VerificationStatus,
  config: TrustConfig
): TrustFactor {
  let value = 0;

  if (status.emailVerified) {
    value += config.bonuses.emailVerified;
  }

  if (status.phoneVerified) {
    value += config.bonuses.phoneVerified;
  }

  if (status.identityVerified) {
    value += config.bonuses.identityVerified;
  }

  if (status.twoFactorEnabled) {
    value += config.bonuses.twoFactorEnabled;
  }

  // Bonus for trusted devices
  if (status.trustedDevices > 0) {
    value += Math.min(10, status.trustedDevices * 2);
  }

  value = Math.min(100, value);

  return {
    name: 'verification',
    value,
    weight: config.weights.verification,
    details: {
      ...status,
    },
  };
}

/**
 * Calculate activity factor
 */
export function calculateActivityFactor(
  metrics: UserActivityMetrics,
  config: TrustConfig
): TrustFactor {
  let value = 0;

  // Total posts contribution
  if (metrics.totalPosts > 0) {
    value += Math.min(25, Math.log10(metrics.totalPosts + 1) * 10);
  }

  // Total comments contribution
  if (metrics.totalComments > 0) {
    value += Math.min(20, Math.log10(metrics.totalComments + 1) * 8);
  }

  // Recent activity bonus
  if (metrics.postsLast30Days > 0) {
    value += Math.min(15, metrics.postsLast30Days);
  }

  if (metrics.commentsLast30Days > 0) {
    value += Math.min(15, metrics.commentsLast30Days * 0.5);
  }

  // Active streak bonus
  if (metrics.activeStreak > 0) {
    value += Math.min(15, metrics.activeStreak);
  }

  // Engagement rate bonus
  value += Math.min(10, metrics.avgEngagementRate * 20);

  value = Math.min(100, value);

  return {
    name: 'activity',
    value,
    weight: config.weights.activity,
    details: {
      ...metrics,
    },
  };
}

/**
 * Calculate content quality factor
 */
export function calculateContentQualityFactor(
  metrics: ContentQualityMetrics,
  config: TrustConfig
): TrustFactor {
  let value = 50; // Start at baseline

  // Positive contributions
  if (metrics.avgLikesPerPost > 0) {
    value += Math.min(15, Math.log10(metrics.avgLikesPerPost + 1) * 10);
  }

  if (metrics.avgCommentsPerPost > 0) {
    value += Math.min(10, Math.log10(metrics.avgCommentsPerPost + 1) * 8);
  }

  if (metrics.avgSharesPerPost > 0) {
    value += Math.min(15, Math.log10(metrics.avgSharesPerPost + 1) * 12);
  }

  // Base quality score contribution
  value += metrics.qualityScore * 0.1;

  // Negative contributions
  if (metrics.reportedContentCount > 0) {
    value -= metrics.reportedContentCount * 2;
  }

  if (metrics.removedContentCount > 0) {
    value -= metrics.removedContentCount * 5;
  }

  if (metrics.flaggedContentCount > 0) {
    value -= metrics.flaggedContentCount * 3;
  }

  value = Math.max(0, Math.min(100, value));

  return {
    name: 'contentQuality',
    value,
    weight: config.weights.contentQuality,
    details: {
      ...metrics,
    },
  };
}

/**
 * Calculate social connections factor
 */
export function calculateSocialFactor(
  metrics: SocialMetrics,
  config: TrustConfig
): TrustFactor {
  let value = 0;

  // Followers contribution (logarithmic)
  if (metrics.followers > 0) {
    value += Math.min(30, Math.log10(metrics.followers + 1) * 12);
  }

  // Mutual followers are valuable
  if (metrics.mutualFollowers > 0) {
    value += Math.min(25, Math.log10(metrics.mutualFollowers + 1) * 15);
  }

  // Following/follower ratio
  const ratio = metrics.followers > 0
    ? metrics.following / metrics.followers
    : metrics.following > 0 ? 2 : 1;

  if (ratio < 0.5) {
    value += 10; // Good ratio - more followers than following
  } else if (ratio > 3) {
    value -= 10; // Suspicious - following way more than followers
  }

  // Community participation
  if (metrics.groupMemberships > 0) {
    value += Math.min(15, metrics.groupMemberships * 2);
  }

  if (metrics.communities > 0) {
    value += Math.min(10, metrics.communities * 3);
  }

  // Penalty for being blocked
  if (metrics.accountsBlockedBy > 5) {
    value -= Math.min(20, metrics.accountsBlockedBy * 2);
  }

  value = Math.max(0, Math.min(100, value));

  return {
    name: 'socialConnections',
    value,
    weight: config.weights.socialConnections,
    details: {
      ...metrics,
    },
  };
}

/**
 * Calculate moderation factor
 */
export function calculateModerationFactor(
  metrics: ModerationMetrics,
  config: TrustConfig
): TrustFactor {
  let value = 100; // Start at perfect

  // Apply penalties
  value -= metrics.warningsReceived * config.penalties.warning;
  value -= metrics.contentRemoved * config.penalties.contentRemoved;
  value -= metrics.temporaryBans * config.penalties.temporaryBan;
  value -= metrics.spamReportsConfirmed * config.penalties.spamConfirmed;
  value -= metrics.fraudSignals * config.penalties.fraudSignal;

  // Unconfirmed spam reports have less impact
  const unconfirmedReports = metrics.spamReportsReceived - metrics.spamReportsConfirmed;
  if (unconfirmedReports > 0) {
    value -= unconfirmedReports * 1; // Small penalty for being reported
  }

  value = Math.max(0, value);

  return {
    name: 'moderation',
    value,
    weight: config.weights.moderation,
    details: {
      ...metrics,
    },
  };
}

/**
 * Calculate engagement factor
 */
export function calculateEngagementFactor(
  receivedLikes: number,
  receivedComments: number,
  receivedShares: number,
  givenLikes: number,
  givenComments: number,
  config: TrustConfig
): TrustFactor {
  let value = 0;

  // Received engagement
  value += Math.min(30, Math.log10(receivedLikes + 1) * 10);
  value += Math.min(25, Math.log10(receivedComments + 1) * 12);
  value += Math.min(25, Math.log10(receivedShares + 1) * 15);

  // Given engagement shows active participation
  value += Math.min(10, Math.log10(givenLikes + 1) * 5);
  value += Math.min(10, Math.log10(givenComments + 1) * 8);

  value = Math.min(100, value);

  return {
    name: 'engagement',
    value,
    weight: config.weights.engagement,
    details: {
      receivedLikes,
      receivedComments,
      receivedShares,
      givenLikes,
      givenComments,
    },
  };
}
