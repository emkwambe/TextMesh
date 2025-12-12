import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  Challenge,
  ChallengeType,
  ChallengeCriteria,
  ChallengeReward,
  UserChallenge,
  XPAction,
} from './types';

export class ChallengeManager {
  private redis: Redis;
  private readonly challengePrefix = 'engagement:challenge:';
  private readonly userChallengePrefix = 'engagement:user_challenge:';
  private readonly activePrefix = 'engagement:active_challenges';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async createChallenge(
    name: string,
    description: string,
    type: ChallengeType,
    criteria: ChallengeCriteria,
    rewards: ChallengeReward[],
    startDate: Date,
    endDate: Date,
    options: {
      maxParticipants?: number;
    } = {}
  ): Promise<Challenge> {
    const challenge: Challenge = {
      id: uuidv4(),
      name,
      description,
      type,
      criteria,
      rewards,
      startDate,
      endDate,
      maxParticipants: options.maxParticipants,
      currentParticipants: 0,
      isActive: true,
      createdAt: new Date(),
    };

    await this.redis.set(
      `${this.challengePrefix}${challenge.id}`,
      JSON.stringify(challenge)
    );

    if (startDate <= new Date() && endDate > new Date()) {
      await this.redis.sadd(this.activePrefix, challenge.id);
    }

    await this.redis.zadd(
      `${this.challengePrefix}schedule`,
      startDate.getTime(),
      challenge.id
    );

    return challenge;
  }

  async getChallenge(challengeId: string): Promise<Challenge | null> {
    const data = await this.redis.get(`${this.challengePrefix}${challengeId}`);
    if (!data) return null;
    return this.deserializeChallenge(data);
  }

  async getActiveChallenges(): Promise<Challenge[]> {
    const challengeIds = await this.redis.smembers(this.activePrefix);
    const challenges: Challenge[] = [];

    for (const id of challengeIds) {
      const challenge = await this.getChallenge(id);
      if (challenge && challenge.isActive && challenge.endDate > new Date()) {
        challenges.push(challenge);
      }
    }

    return challenges;
  }

  async getChallengesByType(type: ChallengeType): Promise<Challenge[]> {
    const activeChallenges = await this.getActiveChallenges();
    return activeChallenges.filter((c) => c.type === type);
  }

  async joinChallenge(
    userId: string,
    challengeId: string
  ): Promise<UserChallenge | null> {
    const challenge = await this.getChallenge(challengeId);
    if (!challenge || !challenge.isActive) return null;

    if (challenge.endDate < new Date()) return null;

    if (
      challenge.maxParticipants &&
      challenge.currentParticipants >= challenge.maxParticipants
    ) {
      return null;
    }

    const existing = await this.getUserChallenge(userId, challengeId);
    if (existing) return existing;

    const initialProgress: Record<string, number> = {};
    challenge.criteria.actions.forEach((action) => {
      initialProgress[action.type] = 0;
    });

    const userChallenge: UserChallenge = {
      challengeId,
      userId,
      progress: initialProgress,
      claimed: false,
      joinedAt: new Date(),
    };

    await this.redis.hset(
      `${this.userChallengePrefix}${userId}`,
      challengeId,
      JSON.stringify(userChallenge)
    );

    challenge.currentParticipants++;
    await this.redis.set(
      `${this.challengePrefix}${challengeId}`,
      JSON.stringify(challenge)
    );

    return userChallenge;
  }

  async leaveChallenge(userId: string, challengeId: string): Promise<boolean> {
    const existing = await this.getUserChallenge(userId, challengeId);
    if (!existing || existing.completedAt) return false;

    await this.redis.hdel(`${this.userChallengePrefix}${userId}`, challengeId);

    const challenge = await this.getChallenge(challengeId);
    if (challenge) {
      challenge.currentParticipants = Math.max(0, challenge.currentParticipants - 1);
      await this.redis.set(
        `${this.challengePrefix}${challengeId}`,
        JSON.stringify(challenge)
      );
    }

    return true;
  }

  async getUserChallenge(
    userId: string,
    challengeId: string
  ): Promise<UserChallenge | null> {
    const data = await this.redis.hget(
      `${this.userChallengePrefix}${userId}`,
      challengeId
    );
    if (!data) return null;

    const uc = JSON.parse(data);
    uc.joinedAt = new Date(uc.joinedAt);
    if (uc.completedAt) uc.completedAt = new Date(uc.completedAt);
    return uc;
  }

  async getUserChallenges(userId: string): Promise<UserChallenge[]> {
    const data = await this.redis.hgetall(`${this.userChallengePrefix}${userId}`);

    return Object.values(data).map((d) => {
      const uc = JSON.parse(d);
      uc.joinedAt = new Date(uc.joinedAt);
      if (uc.completedAt) uc.completedAt = new Date(uc.completedAt);
      return uc;
    });
  }

  async updateProgress(
    userId: string,
    action: XPAction,
    increment: number = 1
  ): Promise<Array<{ challenge: Challenge; completed: boolean; userChallenge: UserChallenge }>> {
    const userChallenges = await this.getUserChallenges(userId);
    const results: Array<{
      challenge: Challenge;
      completed: boolean;
      userChallenge: UserChallenge;
    }> = [];

    for (const uc of userChallenges) {
      if (uc.completedAt) continue;

      const challenge = await this.getChallenge(uc.challengeId);
      if (!challenge || !challenge.isActive || challenge.endDate < new Date()) {
        continue;
      }

      const relevantAction = challenge.criteria.actions.find(
        (a) => a.type === action
      );
      if (!relevantAction) continue;

      uc.progress[action] = (uc.progress[action] || 0) + increment;

      const isCompleted = challenge.criteria.actions.every(
        (a) => (uc.progress[a.type] || 0) >= a.count
      );

      if (isCompleted && !uc.completedAt) {
        uc.completedAt = new Date();
      }

      await this.redis.hset(
        `${this.userChallengePrefix}${userId}`,
        uc.challengeId,
        JSON.stringify(uc)
      );

      results.push({
        challenge,
        completed: isCompleted,
        userChallenge: uc,
      });
    }

    return results;
  }

  async claimRewards(
    userId: string,
    challengeId: string
  ): Promise<ChallengeReward[] | null> {
    const userChallenge = await this.getUserChallenge(userId, challengeId);
    if (!userChallenge || !userChallenge.completedAt || userChallenge.claimed) {
      return null;
    }

    const challenge = await this.getChallenge(challengeId);
    if (!challenge) return null;

    userChallenge.claimed = true;
    await this.redis.hset(
      `${this.userChallengePrefix}${userId}`,
      challengeId,
      JSON.stringify(userChallenge)
    );

    await this.redis.lpush(
      'engagement:challenge_completions',
      JSON.stringify({
        userId,
        challengeId,
        completedAt: userChallenge.completedAt,
        claimedAt: new Date(),
      })
    );

    return challenge.rewards;
  }

  async getChallengeProgress(
    userId: string,
    challengeId: string
  ): Promise<{
    progress: Record<string, { current: number; required: number; percentage: number }>;
    overallPercentage: number;
    isCompleted: boolean;
  } | null> {
    const [userChallenge, challenge] = await Promise.all([
      this.getUserChallenge(userId, challengeId),
      this.getChallenge(challengeId),
    ]);

    if (!userChallenge || !challenge) return null;

    const progress: Record<string, { current: number; required: number; percentage: number }> = {};
    let totalPercentage = 0;

    for (const action of challenge.criteria.actions) {
      const current = userChallenge.progress[action.type] || 0;
      const percentage = Math.min(100, (current / action.count) * 100);
      progress[action.type] = {
        current,
        required: action.count,
        percentage,
      };
      totalPercentage += percentage;
    }

    const overallPercentage = totalPercentage / challenge.criteria.actions.length;

    return {
      progress,
      overallPercentage,
      isCompleted: !!userChallenge.completedAt,
    };
  }

  async getChallengeLeaderboard(
    challengeId: string,
    limit: number = 100
  ): Promise<Array<{ userId: string; progress: number; completedAt?: Date }>> {
    const challenge = await this.getChallenge(challengeId);
    if (!challenge) return [];

    const entries: Array<{ userId: string; progress: number; completedAt?: Date }> = [];

    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.userChallengePrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.hget(key, challengeId);
        if (data) {
          const uc: UserChallenge = JSON.parse(data);
          let totalProgress = 0;

          for (const action of challenge.criteria.actions) {
            const current = uc.progress[action.type] || 0;
            totalProgress += Math.min(1, current / action.count);
          }

          entries.push({
            userId: uc.userId,
            progress: (totalProgress / challenge.criteria.actions.length) * 100,
            completedAt: uc.completedAt ? new Date(uc.completedAt) : undefined,
          });
        }
      }
    } while (cursor !== '0');

    entries.sort((a, b) => {
      if (a.completedAt && b.completedAt) {
        return a.completedAt.getTime() - b.completedAt.getTime();
      }
      if (a.completedAt) return -1;
      if (b.completedAt) return 1;
      return b.progress - a.progress;
    });

    return entries.slice(0, limit);
  }

  async endChallenge(challengeId: string): Promise<void> {
    const challenge = await this.getChallenge(challengeId);
    if (!challenge) return;

    challenge.isActive = false;
    await this.redis.set(
      `${this.challengePrefix}${challengeId}`,
      JSON.stringify(challenge)
    );

    await this.redis.srem(this.activePrefix, challengeId);
  }

  async processScheduledChallenges(): Promise<void> {
    const now = Date.now();

    const startingIds = await this.redis.zrangebyscore(
      `${this.challengePrefix}schedule`,
      '-inf',
      now
    );

    for (const id of startingIds) {
      const challenge = await this.getChallenge(id);
      if (challenge && challenge.startDate <= new Date() && challenge.endDate > new Date()) {
        await this.redis.sadd(this.activePrefix, id);
      }
      await this.redis.zrem(`${this.challengePrefix}schedule`, id);
    }

    const activeIds = await this.redis.smembers(this.activePrefix);
    for (const id of activeIds) {
      const challenge = await this.getChallenge(id);
      if (challenge && challenge.endDate <= new Date()) {
        await this.endChallenge(id);
      }
    }
  }

  private deserializeChallenge(data: string): Challenge {
    const challenge = JSON.parse(data);
    challenge.startDate = new Date(challenge.startDate);
    challenge.endDate = new Date(challenge.endDate);
    challenge.createdAt = new Date(challenge.createdAt);
    return challenge;
  }
}
