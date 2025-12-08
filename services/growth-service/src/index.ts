// =================================
// TEXTMESH GROWTH SERVICE
// Onboarding, Engagement & Growth
// =================================

import express, { Request, Response } from 'express';
import { createLogger } from '@textmesh/logger';
import { getRedisClient, getPrismaClient } from '@textmesh/db-client';

const app = express();
const logger = createLogger({ service: 'growth-service' });
const PORT = process.env['PORT'] || 3011;

app.use(express.json());

// ============ IMPORTS ============

import { OnboardingManager } from './onboarding/OnboardingManager';
import { ProfileWizard } from './onboarding/ProfileWizard';
import { InterestSelector } from './onboarding/InterestSelector';
import { FollowSuggestions } from './onboarding/FollowSuggestions';
import { ReferralSystem } from './engagement/ReferralSystem';
import { AchievementSystem } from './engagement/AchievementSystem';
import { StreakTracker } from './engagement/StreakTracker';
import { NotificationCampaigns } from './campaigns/NotificationCampaigns';
import { RetentionHooks } from './retention/RetentionHooks';

// ============ SERVICE INSTANCES ============

let onboardingManager: OnboardingManager;
let profileWizard: ProfileWizard;
let interestSelector: InterestSelector;
let followSuggestions: FollowSuggestions;
let referralSystem: ReferralSystem;
let achievementSystem: AchievementSystem;
let streakTracker: StreakTracker;
let notificationCampaigns: NotificationCampaigns;
let retentionHooks: RetentionHooks;

// ============ ONBOARDING ENDPOINTS ============

// Get onboarding status
app.get('/api/growth/onboarding/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const status = await onboardingManager.getOnboardingStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get onboarding status', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// Complete onboarding step
app.post('/api/growth/onboarding/:userId/step', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { step, data } = req.body as { step: string; data: Record<string, unknown> };

    const result = await onboardingManager.completeStep(userId, step, data);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to complete step', error);
    res.status(500).json({ success: false, error: 'Failed to complete step' });
  }
});

// Skip onboarding
app.post('/api/growth/onboarding/:userId/skip', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await onboardingManager.skipOnboarding(userId);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to skip onboarding', error);
    res.status(500).json({ success: false, error: 'Failed to skip' });
  }
});

// ============ PROFILE WIZARD ENDPOINTS ============

// Get profile wizard suggestions
app.get('/api/growth/profile-wizard/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const suggestions = await profileWizard.getSuggestions(userId);

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error('Failed to get suggestions', error);
    res.status(500).json({ success: false, error: 'Failed to get suggestions' });
  }
});

// Update profile
app.post('/api/growth/profile-wizard/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const updates = req.body as ProfileUpdates;

    const result = await profileWizard.updateProfile(userId, updates);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to update profile', error);
    res.status(500).json({ success: false, error: 'Failed to update' });
  }
});

// ============ INTEREST ENDPOINTS ============

// Get available interests
app.get('/api/growth/interests', async (_req: Request, res: Response) => {
  try {
    const interests = await interestSelector.getAvailableInterests();

    res.json({
      success: true,
      data: interests,
    });
  } catch (error) {
    logger.error('Failed to get interests', error);
    res.status(500).json({ success: false, error: 'Failed to get interests' });
  }
});

// Set user interests
app.post('/api/growth/interests/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { interests } = req.body as { interests: string[] };

    await interestSelector.setUserInterests(userId, interests);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to set interests', error);
    res.status(500).json({ success: false, error: 'Failed to set interests' });
  }
});

// Get user interests
app.get('/api/growth/interests/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const interests = await interestSelector.getUserInterests(userId);

    res.json({
      success: true,
      data: interests,
    });
  } catch (error) {
    logger.error('Failed to get user interests', error);
    res.status(500).json({ success: false, error: 'Failed to get interests' });
  }
});

// ============ FOLLOW SUGGESTIONS ENDPOINTS ============

// Get follow suggestions
app.get('/api/growth/suggestions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 20, type = 'all' } = req.query;

    const suggestions = await followSuggestions.getSuggestions(userId, {
      limit: Number(limit),
      type: type as SuggestionType,
    });

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error('Failed to get suggestions', error);
    res.status(500).json({ success: false, error: 'Failed to get suggestions' });
  }
});

// Dismiss suggestion
app.post('/api/growth/suggestions/:userId/dismiss', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { targetUserId } = req.body as { targetUserId: string };

    await followSuggestions.dismissSuggestion(userId, targetUserId);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to dismiss suggestion', error);
    res.status(500).json({ success: false, error: 'Failed to dismiss' });
  }
});

// ============ REFERRAL ENDPOINTS ============

// Get referral code
app.get('/api/growth/referral/:userId/code', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const code = await referralSystem.getReferralCode(userId);

    res.json({
      success: true,
      data: { code },
    });
  } catch (error) {
    logger.error('Failed to get referral code', error);
    res.status(500).json({ success: false, error: 'Failed to get code' });
  }
});

// Apply referral code
app.post('/api/growth/referral/:userId/apply', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { code } = req.body as { code: string };

    const result = await referralSystem.applyReferralCode(userId, code);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to apply referral', error);
    res.status(500).json({ success: false, error: 'Failed to apply code' });
  }
});

// Get referral stats
app.get('/api/growth/referral/:userId/stats', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const stats = await referralSystem.getReferralStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get referral stats', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// ============ ACHIEVEMENT ENDPOINTS ============

// Get user achievements
app.get('/api/growth/achievements/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const achievements = await achievementSystem.getUserAchievements(userId);

    res.json({
      success: true,
      data: achievements,
    });
  } catch (error) {
    logger.error('Failed to get achievements', error);
    res.status(500).json({ success: false, error: 'Failed to get achievements' });
  }
});

// Get all available achievements
app.get('/api/growth/achievements', async (_req: Request, res: Response) => {
  try {
    const achievements = achievementSystem.getAllAchievements();

    res.json({
      success: true,
      data: achievements,
    });
  } catch (error) {
    logger.error('Failed to get achievements list', error);
    res.status(500).json({ success: false, error: 'Failed to get list' });
  }
});

// ============ STREAK ENDPOINTS ============

// Get user streak
app.get('/api/growth/streak/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const streak = await streakTracker.getStreak(userId);

    res.json({
      success: true,
      data: streak,
    });
  } catch (error) {
    logger.error('Failed to get streak', error);
    res.status(500).json({ success: false, error: 'Failed to get streak' });
  }
});

// Record activity for streak
app.post('/api/growth/streak/:userId/activity', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { activityType } = req.body as { activityType: string };

    const result = await streakTracker.recordActivity(userId, activityType);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to record activity', error);
    res.status(500).json({ success: false, error: 'Failed to record' });
  }
});

// ============ RETENTION ENDPOINTS ============

// Get retention status
app.get('/api/growth/retention/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const status = await retentionHooks.getRetentionStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get retention status', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'growth-service' });
});

// ============ TYPES ============

interface ProfileUpdates {
  displayName?: string;
  bio?: string;
  avatar?: string;
  website?: string;
  location?: string;
}

type SuggestionType = 'all' | 'interests' | 'contacts' | 'popular' | 'similar';

// ============ STARTUP ============

async function main() {
  try {
    const redis = getRedisClient();
    const prisma = getPrismaClient();

    // Initialize services
    interestSelector = new InterestSelector(redis);
    followSuggestions = new FollowSuggestions(redis, prisma);
    profileWizard = new ProfileWizard(prisma);
    referralSystem = new ReferralSystem(redis, prisma);
    achievementSystem = new AchievementSystem(redis, prisma);
    streakTracker = new StreakTracker(redis, prisma);
    notificationCampaigns = new NotificationCampaigns(redis, prisma);
    retentionHooks = new RetentionHooks(redis, prisma, streakTracker, achievementSystem);
    onboardingManager = new OnboardingManager(
      redis,
      prisma,
      profileWizard,
      interestSelector,
      followSuggestions
    );

    app.listen(PORT, () => {
      logger.info(`Growth service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start growth service', error);
    process.exit(1);
  }
}

main();

export { app };
