// =================================
// TEXTMESH LEADER SUGGESTIONS
// Suggest Group Leaders/Facilitators for New Users
// =================================

import { PrismaClient, UserIntent, GroupType } from '@prisma/client';
import Redis from 'ioredis';

// ============ TYPES ============

export interface SuggestedLeader {
  id: string;
  displayName: string;
  bio: string | null;
  groupsOwned: number;
  primaryGroupPurpose: string;
  primaryGroupName: string;
}

export interface SuggestedLeadersResponse {
  leaders: SuggestedLeader[];
}

// ============ LEADER SUGGESTIONS CLASS ============

export class LeaderSuggestions {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Get suggested group leaders/facilitators based on user's intent
   */
  async getSuggestions(
    userId: string,
    limit: number = 10
  ): Promise<SuggestedLeadersResponse> {
    // Get user's primary intent
    const onboarding = await this.prisma.userOnboarding.findUnique({
      where: { userId },
      select: { primaryIntent: true },
    });

    const primaryIntent = onboarding?.primaryIntent;

    // Get suggested leaders
    const leaders = await this.fetchSuggestedLeaders(primaryIntent, limit);

    return { leaders };
  }

  /**
   * Fetch group owners/facilitators matching user's intent
   */
  private async fetchSuggestedLeaders(
    primaryIntent: UserIntent | undefined,
    limit: number
  ): Promise<SuggestedLeader[]> {
    // Map intent to preferred group type
    const preferredGroupType = this.mapIntentToGroupType(primaryIntent);

    // Find users who own active groups
    const groupOwners = await this.prisma.user.findMany({
      where: {
        // User must own at least one group
        ownedGroups: {
          some: {
            isArchived: false,
            privacy: 'PUBLIC',
            purpose: {
              not: '',
            },
            // Filter by preferred group type if available
            ...(preferredGroupType && { groupType: preferredGroupType }),
          },
        },
        // User must have a bio (shows they're engaged)
        bio: {
          not: null,
        },
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        ownedGroups: {
          where: {
            isArchived: false,
            privacy: 'PUBLIC',
            purpose: {
              not: '',
            },
          },
          select: {
            id: true,
            name: true,
            purpose: true,
            groupType: true,
            memberCount: true,
          },
          orderBy: {
            memberCount: 'desc',
          },
          take: 1, // Get their most popular group
        },
      },
      take: limit * 2, // Get extra to filter
    });

    // Transform and filter
    const leaders: SuggestedLeader[] = groupOwners
      .filter((user) => user.ownedGroups.length > 0) // Ensure they have at least one group
      .map((user) => {
        const primaryGroup = user.ownedGroups[0];
        return {
          id: user.id,
          displayName: user.displayName,
          bio: user.bio,
          groupsOwned: user.ownedGroups.length,
          primaryGroupPurpose: primaryGroup.purpose,
          primaryGroupName: primaryGroup.name,
        };
      })
      .slice(0, limit);

    return leaders;
  }

  /**
   * Map user intent to preferred group type
   */
  private mapIntentToGroupType(intent: UserIntent | undefined): GroupType | null {
    if (!intent) return null;

    switch (intent) {
      case UserIntent.LEARNING:
        return GroupType.STUDY;
      case UserIntent.TEACHING:
        return GroupType.STUDY;
      case UserIntent.COORDINATING:
        return GroupType.COMMUNITY;
      case UserIntent.FOLLOWING_UPDATES:
        return GroupType.UPDATES;
      default:
        return null;
    }
  }
}
