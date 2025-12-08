// =================================
// TEXTMESH ONBOARDING MANAGER
// User Onboarding Flow Controller
// =================================

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ProfileWizard } from './ProfileWizard';
import { InterestSelector } from './InterestSelector';
import { FollowSuggestions } from './FollowSuggestions';

// ============ ONBOARDING TYPES ============

export interface OnboardingStatus {
  userId: string;
  isComplete: boolean;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  progress: number;
  startedAt: Date;
  completedAt?: Date;
}

export type OnboardingStep =
  | 'welcome'
  | 'profile_photo'
  | 'display_name'
  | 'bio'
  | 'interests'
  | 'follow_suggestions'
  | 'notifications'
  | 'first_post'
  | 'complete';

export interface StepResult {
  success: boolean;
  nextStep?: OnboardingStep;
  progress: number;
  rewards?: StepReward[];
}

export interface StepReward {
  type: 'badge' | 'points' | 'feature';
  value: string | number;
  description: string;
}

// ============ ONBOARDING FLOW ============

const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome',
  'profile_photo',
  'display_name',
  'bio',
  'interests',
  'follow_suggestions',
  'notifications',
  'first_post',
  'complete',
];

const STEP_PROGRESS: Record<OnboardingStep, number> = {
  welcome: 0,
  profile_photo: 12.5,
  display_name: 25,
  bio: 37.5,
  interests: 50,
  follow_suggestions: 62.5,
  notifications: 75,
  first_post: 87.5,
  complete: 100,
};

const SKIPPABLE_STEPS: OnboardingStep[] = [
  'profile_photo',
  'bio',
  'notifications',
  'first_post',
];

// ============ ONBOARDING MANAGER CLASS ============

export class OnboardingManager {
  private redis: Redis;
  private prisma: PrismaClient;
  private profileWizard: ProfileWizard;
  private interestSelector: InterestSelector;
  private followSuggestions: FollowSuggestions;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    profileWizard: ProfileWizard,
    interestSelector: InterestSelector,
    followSuggestions: FollowSuggestions
  ) {
    this.redis = redis;
    this.prisma = prisma;
    this.profileWizard = profileWizard;
    this.interestSelector = interestSelector;
    this.followSuggestions = followSuggestions;
  }

  /**
   * Get current onboarding status for user
   */
  async getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    const key = `onboarding:${userId}`;
    const cached = await this.redis.get(key);

    if (cached) {
      return JSON.parse(cached) as OnboardingStatus;
    }

    // Check if user has already completed onboarding
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true, createdAt: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.onboardingCompleted) {
      return {
        userId,
        isComplete: true,
        currentStep: 'complete',
        completedSteps: ONBOARDING_STEPS,
        skippedSteps: [],
        progress: 100,
        startedAt: user.createdAt,
        completedAt: user.createdAt,
      };
    }

    // Initialize new onboarding status
    const status: OnboardingStatus = {
      userId,
      isComplete: false,
      currentStep: 'welcome',
      completedSteps: [],
      skippedSteps: [],
      progress: 0,
      startedAt: new Date(),
    };

    await this.saveStatus(status);
    return status;
  }

  /**
   * Complete an onboarding step
   */
  async completeStep(
    userId: string,
    step: string,
    data: Record<string, unknown>
  ): Promise<StepResult> {
    const status = await this.getOnboardingStatus(userId);
    const typedStep = step as OnboardingStep;

    // Validate step
    if (!ONBOARDING_STEPS.includes(typedStep)) {
      throw new Error('Invalid step');
    }

    // Check if step is already completed
    if (status.completedSteps.includes(typedStep)) {
      return {
        success: true,
        nextStep: this.getNextStep(status),
        progress: status.progress,
      };
    }

    // Process step
    const rewards: StepReward[] = [];

    switch (typedStep) {
      case 'welcome':
        // Just mark as complete
        break;

      case 'profile_photo':
        if (data['avatarUrl']) {
          await this.profileWizard.updateProfile(userId, {
            avatar: data['avatarUrl'] as string,
          });
          rewards.push({
            type: 'badge',
            value: 'first_photo',
            description: 'Added profile photo',
          });
        }
        break;

      case 'display_name':
        if (data['displayName']) {
          await this.profileWizard.updateProfile(userId, {
            displayName: data['displayName'] as string,
          });
        }
        break;

      case 'bio':
        if (data['bio']) {
          await this.profileWizard.updateProfile(userId, {
            bio: data['bio'] as string,
          });
          rewards.push({
            type: 'points',
            value: 10,
            description: 'Profile bio added',
          });
        }
        break;

      case 'interests':
        if (data['interests'] && Array.isArray(data['interests'])) {
          await this.interestSelector.setUserInterests(userId, data['interests'] as string[]);
          rewards.push({
            type: 'feature',
            value: 'personalized_feed',
            description: 'Personalized feed unlocked',
          });
        }
        break;

      case 'follow_suggestions':
        if (data['followedUsers'] && Array.isArray(data['followedUsers'])) {
          const followedCount = (data['followedUsers'] as string[]).length;
          if (followedCount >= 5) {
            rewards.push({
              type: 'badge',
              value: 'social_butterfly',
              description: 'Followed 5+ users',
            });
          }
        }
        break;

      case 'notifications':
        if (data['enabledNotifications']) {
          await this.updateNotificationPreferences(userId, data['notificationSettings'] as Record<string, boolean>);
        }
        break;

      case 'first_post':
        if (data['postCreated']) {
          rewards.push({
            type: 'badge',
            value: 'first_post',
            description: 'Created your first post!',
          });
          rewards.push({
            type: 'points',
            value: 25,
            description: 'First post bonus',
          });
        }
        break;

      case 'complete':
        await this.markOnboardingComplete(userId);
        rewards.push({
          type: 'badge',
          value: 'onboarding_complete',
          description: 'Welcome to TextMesh!',
        });
        rewards.push({
          type: 'points',
          value: 100,
          description: 'Onboarding completion bonus',
        });
        break;
    }

    // Update status
    status.completedSteps.push(typedStep);
    const nextStep = this.getNextStep(status);
    status.currentStep = nextStep;
    status.progress = STEP_PROGRESS[nextStep];

    if (nextStep === 'complete') {
      status.isComplete = true;
      status.completedAt = new Date();
      await this.markOnboardingComplete(userId);
    }

    await this.saveStatus(status);

    // Award rewards
    if (rewards.length > 0) {
      await this.grantRewards(userId, rewards);
    }

    return {
      success: true,
      nextStep,
      progress: status.progress,
      rewards,
    };
  }

  /**
   * Skip an onboarding step
   */
  async skipStep(userId: string, step: OnboardingStep): Promise<StepResult> {
    if (!SKIPPABLE_STEPS.includes(step)) {
      throw new Error('This step cannot be skipped');
    }

    const status = await this.getOnboardingStatus(userId);

    status.skippedSteps.push(step);
    const nextStep = this.getNextStep(status);
    status.currentStep = nextStep;
    status.progress = STEP_PROGRESS[nextStep];

    if (nextStep === 'complete') {
      status.isComplete = true;
      status.completedAt = new Date();
      await this.markOnboardingComplete(userId);
    }

    await this.saveStatus(status);

    return {
      success: true,
      nextStep,
      progress: status.progress,
    };
  }

  /**
   * Skip entire onboarding
   */
  async skipOnboarding(userId: string): Promise<void> {
    const status = await this.getOnboardingStatus(userId);

    status.isComplete = true;
    status.currentStep = 'complete';
    status.completedAt = new Date();
    status.progress = 100;

    // Mark remaining steps as skipped
    for (const step of ONBOARDING_STEPS) {
      if (!status.completedSteps.includes(step) && !status.skippedSteps.includes(step)) {
        if (SKIPPABLE_STEPS.includes(step)) {
          status.skippedSteps.push(step);
        }
      }
    }

    await this.saveStatus(status);
    await this.markOnboardingComplete(userId);
  }

  /**
   * Get data for current step
   */
  async getStepData(userId: string, step: OnboardingStep): Promise<Record<string, unknown>> {
    switch (step) {
      case 'profile_photo':
      case 'display_name':
      case 'bio':
        return this.profileWizard.getSuggestions(userId);

      case 'interests':
        const interests = await this.interestSelector.getAvailableInterests();
        const userInterests = await this.interestSelector.getUserInterests(userId);
        return { available: interests, selected: userInterests };

      case 'follow_suggestions':
        const suggestions = await this.followSuggestions.getSuggestions(userId, {
          limit: 30,
          type: 'all',
        });
        return { suggestions };

      default:
        return {};
    }
  }

  // ============ HELPER METHODS ============

  private getNextStep(status: OnboardingStatus): OnboardingStep {
    const completedOrSkipped = [...status.completedSteps, ...status.skippedSteps];

    for (const step of ONBOARDING_STEPS) {
      if (!completedOrSkipped.includes(step)) {
        return step;
      }
    }

    return 'complete';
  }

  private async saveStatus(status: OnboardingStatus): Promise<void> {
    const key = `onboarding:${status.userId}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(status));
  }

  private async markOnboardingComplete(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
  }

  private async updateNotificationPreferences(
    userId: string,
    _settings: Record<string, boolean>
  ): Promise<void> {
    // Update notification preferences in database
    // Implementation depends on notification service
  }

  private async grantRewards(userId: string, rewards: StepReward[]): Promise<void> {
    for (const reward of rewards) {
      if (reward.type === 'badge') {
        await this.redis.sadd(`user:badges:${userId}`, reward.value as string);
      } else if (reward.type === 'points') {
        await this.redis.incrby(`user:points:${userId}`, reward.value as number);
      }
    }
  }

  /**
   * Get onboarding analytics
   */
  async getOnboardingAnalytics(
    timeframe?: { start: Date; end: Date }
  ): Promise<Record<string, unknown>> {
    // This would aggregate onboarding completion rates, drop-off points, etc.
    return {
      totalStarted: 0,
      totalCompleted: 0,
      completionRate: 0,
      averageTimeToComplete: 0,
      dropOffByStep: {},
    };
  }
}

export default OnboardingManager;
