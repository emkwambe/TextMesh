// =================================
// TEXTMESH GROUP SUGGESTIONS
// Suggest Groups for New Users
// =================================

import { PrismaClient, UserIntent, GroupType } from '@prisma/client';
import Redis from 'ioredis';

// ============ TYPES ============

export interface SuggestedGroup {
  id: string;
  name: string;
  purpose: string;
  groupType: GroupType;
  memberCount: number;
  lastActivityAt: Date | null;
}

export interface SuggestedGroupsResponse {
  groups: SuggestedGroup[];
}

// ============ GROUP SUGGESTIONS CLASS ============

export class GroupSuggestions {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Get suggested groups for a user based on their intent
   */
  async getSuggestions(
    userId: string,
    limit: number = 10
  ): Promise<SuggestedGroupsResponse> {
    // Get user's primary intent
    const onboarding = await this.prisma.userOnboarding.findUnique({
      where: { userId },
      select: { primaryIntent: true },
    });

    const primaryIntent = onboarding?.primaryIntent;

    // Get suggested groups
    const groups = await this.fetchSuggestedGroups(primaryIntent, limit);

    return {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        purpose: g.purpose,
        groupType: g.groupType,
        memberCount: g.memberCount,
        lastActivityAt: g.updatedAt,
      })),
    };
  }

  /**
   * Fetch groups matching user's intent
   */
  private async fetchSuggestedGroups(
    primaryIntent: UserIntent | undefined,
    limit: number
  ) {
    // Map intent to group type
    const preferredGroupType = this.mapIntentToGroupType(primaryIntent);

    // Query for groups with required filters
    const groups = await this.prisma.group.findMany({
      where: {
        // CRITICAL: Only return groups WITH purpose field populated
        purpose: {
          not: '',
        },
        // Bias toward small groups (< 50 members)
        memberCount: {
          lt: 50,
        },
        privacy: 'PUBLIC',
        isArchived: false,
        // If we have a preferred type, prioritize it
        ...(preferredGroupType && { groupType: preferredGroupType }),
      },
      orderBy: [
        // Bias toward recently active groups
        { updatedAt: 'desc' },
        // Secondary sort by member count (smaller first)
        { memberCount: 'asc' },
      ],
      take: limit,
      select: {
        id: true,
        name: true,
        purpose: true,
        groupType: true,
        memberCount: true,
        updatedAt: true,
      },
    });

    // If we didn't get enough groups with preferred type, get more without type filter
    if (groups.length < limit && preferredGroupType) {
      const additionalGroups = await this.prisma.group.findMany({
        where: {
          purpose: {
            not: '',
          },
          memberCount: {
            lt: 50,
          },
          privacy: 'PUBLIC',
          isArchived: false,
          // Exclude already fetched groups
          id: {
            notIn: groups.map((g) => g.id),
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { memberCount: 'asc' }],
        take: limit - groups.length,
        select: {
          id: true,
          name: true,
          purpose: true,
          groupType: true,
          memberCount: true,
          updatedAt: true,
        },
      });

      groups.push(...additionalGroups);
    }

    return groups;
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
