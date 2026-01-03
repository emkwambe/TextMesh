// =================================
// TEXTMESH INTENT SELECTION
// User Intent Capture for Onboarding
// =================================

import { PrismaClient, UserIntent } from '@prisma/client';
import Redis from 'ioredis';

// ============ TYPES ============

export interface IntentSelectionRequest {
  primaryIntent: UserIntent;
  secondaryIntent?: UserIntent;
  topics?: string[];
}

export interface IntentSelectionResponse {
  success: boolean;
  nextStep: 'CREATE_GROUP' | 'JOIN_GROUP';
}

// ============ INTENT SELECTION CLASS ============

export class IntentSelection {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Save user intent and determine next onboarding step
   */
  async saveIntent(
    userId: string,
    request: IntentSelectionRequest
  ): Promise<IntentSelectionResponse> {
    const { primaryIntent, secondaryIntent, topics } = request;

    // Create or update UserOnboarding record
    await this.prisma.userOnboarding.upsert({
      where: { userId },
      create: {
        userId,
        primaryIntent,
        secondaryIntent,
        topics: topics || [],
        completedSteps: ['intent_selected'],
      },
      update: {
        primaryIntent,
        secondaryIntent,
        topics: topics || [],
        completedSteps: {
          push: 'intent_selected',
        },
      },
    });

    // Determine next step based on intent
    const nextStep = this.determineNextStep(primaryIntent);

    return {
      success: true,
      nextStep,
    };
  }

  /**
   * Determine next onboarding step based on primary intent
   */
  private determineNextStep(primaryIntent: UserIntent): 'CREATE_GROUP' | 'JOIN_GROUP' {
    // Teachers and coordinators should create groups
    if (
      primaryIntent === UserIntent.TEACHING ||
      primaryIntent === UserIntent.COORDINATING
    ) {
      return 'CREATE_GROUP';
    }

    // Learners and followers should join groups
    if (
      primaryIntent === UserIntent.LEARNING ||
      primaryIntent === UserIntent.FOLLOWING_UPDATES
    ) {
      return 'JOIN_GROUP';
    }

    // Default to joining
    return 'JOIN_GROUP';
  }

  /**
   * Get user's saved intent
   */
  async getIntent(userId: string): Promise<IntentSelectionRequest | null> {
    const onboarding = await this.prisma.userOnboarding.findUnique({
      where: { userId },
      select: {
        primaryIntent: true,
        secondaryIntent: true,
        topics: true,
      },
    });

    if (!onboarding) {
      return null;
    }

    return {
      primaryIntent: onboarding.primaryIntent,
      secondaryIntent: onboarding.secondaryIntent || undefined,
      topics: onboarding.topics,
    };
  }
}
