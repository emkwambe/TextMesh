import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Bounty, BountySubmission, Amount } from './types';
import { WalletService } from './wallet';

const DEFAULT_PLATFORM_FEE = 10; // 10% on bounty completion

export class BountyService {
  private redis: Redis;
  private wallet: WalletService;
  private platformFeePercent: number;
  private readonly bountyPrefix = 'monetization:bounty:';
  private readonly submissionPrefix = 'monetization:bounty_submission:';
  private readonly userBountiesPrefix = 'monetization:user_bounties:';
  private readonly categoryPrefix = 'monetization:bounty_category:';

  constructor(
    redis: Redis,
    wallet: WalletService,
    platformFeePercent?: number
  ) {
    this.redis = redis;
    this.wallet = wallet;
    this.platformFeePercent = platformFeePercent || DEFAULT_PLATFORM_FEE;
  }

  async createBounty(
    creatorId: string,
    bounty: Omit<Bounty, 'id' | 'creatorId' | 'escrowedAmount' | 'status' | 'platformFeePercent' | 'createdAt' | 'updatedAt'>
  ): Promise<Bounty> {
    // Escrow the bounty amount
    const holdTx = await this.wallet.hold(
      creatorId,
      bounty.amount,
      `Bounty escrow: ${bounty.title}`
    );

    const newBounty: Bounty = {
      id: uuidv4(),
      creatorId,
      ...bounty,
      escrowedAmount: bounty.amount,
      status: 'open',
      platformFeePercent: this.platformFeePercent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveBounty(newBounty);

    // Index by category
    await this.redis.sadd(`${this.categoryPrefix}${bounty.category}`, newBounty.id);

    // Track user's bounties
    await this.redis.sadd(`${this.userBountiesPrefix}${creatorId}:created`, newBounty.id);

    return newBounty;
  }

  async getBounty(bountyId: string): Promise<Bounty | null> {
    const data = await this.redis.get(`${this.bountyPrefix}${bountyId}`);
    if (!data) return null;

    const bounty = JSON.parse(data);
    bounty.createdAt = new Date(bounty.createdAt);
    bounty.updatedAt = new Date(bounty.updatedAt);
    if (bounty.deadline) bounty.deadline = new Date(bounty.deadline);
    return bounty;
  }

  async submitToBounty(
    bountyId: string,
    submitterId: string,
    content: string,
    attachments?: string[]
  ): Promise<BountySubmission> {
    const bounty = await this.getBounty(bountyId);
    if (!bounty) {
      throw new Error('Bounty not found');
    }

    if (bounty.status !== 'open' && bounty.status !== 'in_progress') {
      throw new Error('Bounty is not accepting submissions');
    }

    if (bounty.creatorId === submitterId) {
      throw new Error('Cannot submit to your own bounty');
    }

    // Check max submissions
    if (bounty.maxSubmissions) {
      const count = await this.getSubmissionCount(bountyId);
      if (count >= bounty.maxSubmissions) {
        throw new Error('Maximum submissions reached');
      }
    }

    // Check deadline
    if (bounty.deadline && new Date() > bounty.deadline) {
      throw new Error('Bounty deadline has passed');
    }

    const submission: BountySubmission = {
      id: uuidv4(),
      bountyId,
      submitterId,
      content,
      attachments,
      status: 'pending',
      createdAt: new Date(),
    };

    await this.saveSubmission(submission);

    // Update bounty status
    if (bounty.status === 'open') {
      bounty.status = 'in_progress';
      bounty.updatedAt = new Date();
      await this.saveBounty(bounty);
    }

    // Track user's submissions
    await this.redis.sadd(`${this.userBountiesPrefix}${submitterId}:submitted`, bountyId);

    return submission;
  }

  async acceptSubmission(
    bountyId: string,
    submissionId: string,
    feedback?: string
  ): Promise<{ bounty: Bounty; submission: BountySubmission }> {
    const bounty = await this.getBounty(bountyId);
    if (!bounty) {
      throw new Error('Bounty not found');
    }

    const submission = await this.getSubmission(submissionId);
    if (!submission || submission.bountyId !== bountyId) {
      throw new Error('Submission not found');
    }

    // Calculate payout
    const platformFee = Math.floor(bounty.amount.value * (this.platformFeePercent / 100));
    const winnerReceived = bounty.amount.value - platformFee;

    // Release escrow and pay winner
    await this.wallet.releaseHold(
      `${this.bountyPrefix}hold:${bountyId}`,
      false // Don't return to creator
    );

    // Credit winner
    await this.wallet.credit(
      submission.submitterId,
      { value: winnerReceived, currency: bounty.amount.currency },
      `Bounty won: ${bounty.title}`,
      bountyId,
      'bounty'
    );

    // Record platform revenue
    await this.recordPlatformRevenue(platformFee);

    // Update submission
    submission.status = 'accepted';
    submission.feedback = feedback;
    submission.reviewedAt = new Date();
    await this.saveSubmission(submission);

    // Update bounty
    bounty.status = 'completed';
    bounty.winnerId = submission.submitterId;
    bounty.updatedAt = new Date();
    await this.saveBounty(bounty);

    // Reject other submissions
    await this.rejectOtherSubmissions(bountyId, submissionId);

    return { bounty, submission };
  }

  async rejectSubmission(
    submissionId: string,
    feedback?: string
  ): Promise<BountySubmission> {
    const submission = await this.getSubmission(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    submission.status = 'rejected';
    submission.feedback = feedback;
    submission.reviewedAt = new Date();

    await this.saveSubmission(submission);

    return submission;
  }

  async cancelBounty(bountyId: string): Promise<Bounty> {
    const bounty = await this.getBounty(bountyId);
    if (!bounty) {
      throw new Error('Bounty not found');
    }

    if (bounty.status === 'completed') {
      throw new Error('Cannot cancel completed bounty');
    }

    // Return escrowed funds
    await this.wallet.credit(
      bounty.creatorId,
      bounty.escrowedAmount,
      `Bounty cancelled: ${bounty.title}`,
      bountyId,
      'bounty'
    );

    bounty.status = 'cancelled';
    bounty.updatedAt = new Date();
    await this.saveBounty(bounty);

    return bounty;
  }

  async getSubmission(submissionId: string): Promise<BountySubmission | null> {
    const data = await this.redis.get(`${this.submissionPrefix}${submissionId}`);
    if (!data) return null;

    const submission = JSON.parse(data);
    submission.createdAt = new Date(submission.createdAt);
    if (submission.reviewedAt) submission.reviewedAt = new Date(submission.reviewedAt);
    return submission;
  }

  async getBountySubmissions(bountyId: string): Promise<BountySubmission[]> {
    const submissionIds = await this.redis.smembers(`${this.bountyPrefix}${bountyId}:submissions`);

    const submissions: BountySubmission[] = [];
    for (const id of submissionIds) {
      const submission = await this.getSubmission(id);
      if (submission) submissions.push(submission);
    }

    return submissions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getOpenBounties(
    options: {
      category?: string;
      minAmount?: number;
      skills?: string[];
      limit?: number;
    } = {}
  ): Promise<Bounty[]> {
    const { category, minAmount, skills, limit = 50 } = options;

    let bountyIds: string[];

    if (category) {
      bountyIds = await this.redis.smembers(`${this.categoryPrefix}${category}`);
    } else {
      bountyIds = await this.redis.smembers('monetization:all_bounties');
    }

    const bounties: Bounty[] = [];

    for (const id of bountyIds) {
      const bounty = await this.getBounty(id);
      if (!bounty) continue;

      if (bounty.status !== 'open' && bounty.status !== 'in_progress') continue;
      if (minAmount && bounty.amount.value < minAmount) continue;
      if (skills && skills.length > 0) {
        const hasSkill = skills.some(s => bounty.skills.includes(s));
        if (!hasSkill) continue;
      }

      bounties.push(bounty);

      if (bounties.length >= limit) break;
    }

    return bounties.sort((a, b) => b.amount.value - a.amount.value);
  }

  async getUserBounties(
    userId: string,
    type: 'created' | 'submitted' | 'won'
  ): Promise<Bounty[]> {
    let bountyIds: string[];

    if (type === 'won') {
      // Find bounties where user is the winner
      const allSubmitted = await this.redis.smembers(
        `${this.userBountiesPrefix}${userId}:submitted`
      );
      bountyIds = [];
      for (const id of allSubmitted) {
        const bounty = await this.getBounty(id);
        if (bounty && bounty.winnerId === userId) {
          bountyIds.push(id);
        }
      }
    } else {
      bountyIds = await this.redis.smembers(
        `${this.userBountiesPrefix}${userId}:${type}`
      );
    }

    const bounties: Bounty[] = [];
    for (const id of bountyIds) {
      const bounty = await this.getBounty(id);
      if (bounty) bounties.push(bounty);
    }

    return bounties.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getBountyStats(userId: string): Promise<{
    created: number;
    completed: number;
    totalPosted: number;
    totalWon: number;
    submissionCount: number;
    acceptanceRate: number;
  }> {
    const created = await this.getUserBounties(userId, 'created');
    const submitted = await this.redis.smembers(`${this.userBountiesPrefix}${userId}:submitted`);
    const won = await this.getUserBounties(userId, 'won');

    const completedBounties = created.filter(b => b.status === 'completed');

    let totalPosted = 0;
    for (const bounty of created) {
      totalPosted += bounty.amount.value;
    }

    let totalWon = 0;
    for (const bounty of won) {
      const fee = bounty.amount.value * (bounty.platformFeePercent / 100);
      totalWon += bounty.amount.value - fee;
    }

    return {
      created: created.length,
      completed: completedBounties.length,
      totalPosted,
      totalWon,
      submissionCount: submitted.length,
      acceptanceRate: submitted.length > 0 ? (won.length / submitted.length) * 100 : 0,
    };
  }

  private async getSubmissionCount(bountyId: string): Promise<number> {
    return this.redis.scard(`${this.bountyPrefix}${bountyId}:submissions`);
  }

  private async rejectOtherSubmissions(
    bountyId: string,
    acceptedSubmissionId: string
  ): Promise<void> {
    const submissions = await this.getBountySubmissions(bountyId);

    for (const submission of submissions) {
      if (submission.id !== acceptedSubmissionId && submission.status === 'pending') {
        submission.status = 'rejected';
        submission.feedback = 'Another submission was selected';
        submission.reviewedAt = new Date();
        await this.saveSubmission(submission);
      }
    }
  }

  private async saveBounty(bounty: Bounty): Promise<void> {
    await this.redis.set(
      `${this.bountyPrefix}${bounty.id}`,
      JSON.stringify(bounty)
    );

    await this.redis.sadd('monetization:all_bounties', bounty.id);
  }

  private async saveSubmission(submission: BountySubmission): Promise<void> {
    await this.redis.set(
      `${this.submissionPrefix}${submission.id}`,
      JSON.stringify(submission)
    );

    await this.redis.sadd(
      `${this.bountyPrefix}${submission.bountyId}:submissions`,
      submission.id
    );
  }

  private async recordPlatformRevenue(amount: number): Promise<void> {
    const dateKey = new Date().toISOString().split('T')[0];
    const key = `monetization:platform_revenue:${dateKey}`;
    await this.redis.hincrbyfloat(key, 'bountyFees', amount);
  }
}
