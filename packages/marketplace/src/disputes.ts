/**
 * Dispute Resolution System
 *
 * Fair mediation between buyers and sellers:
 * - Evidence-based decisions
 * - Tiered escalation process
 * - Safety violation priority handling
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Dispute,
  DisputeReason,
  DisputeStatus,
  DisputeOutcome,
  DisputeEvidence,
  DisputeMessage,
  Order,
  SafetyViolationType
} from './types';

// Dispute resolution timeframes
const RESPONSE_DEADLINE_HOURS = 48;
const RESOLUTION_DEADLINE_DAYS = 14;
const AUTO_RESOLVE_NO_RESPONSE_DAYS = 7;

// Safety-related disputes get priority handling
const SAFETY_REASONS: DisputeReason[] = ['safety_concern', 'harassment'];

export class DisputeManager {
  private redis: any;
  private db: any;

  constructor(redis: any, db: any) {
    this.redis = redis;
    this.db = db;
  }

  /**
   * Open a dispute
   */
  async openDispute(
    order: Order,
    initiatorId: string,
    reason: DisputeReason,
    description: string
  ): Promise<Dispute> {
    // Validate initiator is part of the order
    const initiatorRole = this.getRole(order, initiatorId);
    if (!initiatorRole) {
      throw new Error('You are not part of this order');
    }

    // Check if dispute already exists
    const existingDispute = await this.getDisputeByOrder(order.id);
    if (existingDispute && existingDispute.status !== 'closed') {
      throw new Error('A dispute is already open for this order');
    }

    // Check dispute window
    if (order.deliveredAt) {
      const daysSinceDelivery = (Date.now() - new Date(order.deliveredAt).getTime()) /
                                 (24 * 60 * 60 * 1000);
      if (daysSinceDelivery > RESOLUTION_DEADLINE_DAYS) {
        throw new Error(`Dispute window has closed (${RESOLUTION_DEADLINE_DAYS} days after delivery)`);
      }
    }

    const now = new Date();
    const respondentId = initiatorRole === 'buyer' ? order.sellerId : order.buyerId;

    const dispute: Dispute = {
      id: uuidv4(),
      orderId: order.id,
      initiatorId,
      initiatorRole,
      respondentId,
      reason,
      description,
      evidence: [],
      status: SAFETY_REASONS.includes(reason) ? 'escalated' : 'open',
      messages: [
        {
          id: uuidv4(),
          senderId: 'system',
          senderRole: 'system',
          content: `Dispute opened: ${this.getReasonLabel(reason)}. ` +
                   `${initiatorRole === 'buyer' ? 'Seller' : 'Buyer'} has ${RESPONSE_DEADLINE_HOURS} hours to respond.`,
          createdAt: now
        }
      ],
      createdAt: now,
      updatedAt: now,
      deadlineAt: new Date(now.getTime() + RESPONSE_DEADLINE_HOURS * 60 * 60 * 1000)
    };

    await this.saveDispute(dispute);

    // Notify respondent
    await this.notifyParty(respondentId, 'dispute_opened', {
      disputeId: dispute.id,
      orderId: order.id,
      reason
    });

    // Safety concerns get immediate escalation
    if (SAFETY_REASONS.includes(reason)) {
      await this.escalateToSafetyTeam(dispute);
    }

    return dispute;
  }

  /**
   * Get role of user in order
   */
  private getRole(order: Order, userId: string): 'buyer' | 'seller' | null {
    if (order.buyerId === userId) return 'buyer';
    if (order.sellerId === userId) return 'seller';
    return null;
  }

  /**
   * Get human-readable reason label
   */
  private getReasonLabel(reason: DisputeReason): string {
    const labels: Record<DisputeReason, string> = {
      item_not_received: 'Item not received',
      item_not_as_described: 'Item not as described',
      item_damaged: 'Item arrived damaged',
      wrong_item: 'Received wrong item',
      seller_unresponsive: 'Seller unresponsive',
      buyer_unresponsive: 'Buyer unresponsive',
      payment_issue: 'Payment issue',
      safety_concern: 'Safety concern',
      harassment: 'Harassment',
      other: 'Other issue'
    };
    return labels[reason] || reason;
  }

  /**
   * Respond to dispute
   */
  async respondToDispute(
    disputeId: string,
    responderId: string,
    response: string
  ): Promise<Dispute> {
    const dispute = await this.getDispute(disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.respondentId !== responderId) {
      throw new Error('You are not the respondent for this dispute');
    }

    if (dispute.status === 'closed' || dispute.status === 'resolved') {
      throw new Error('This dispute is already closed');
    }

    // Add response message
    dispute.messages.push({
      id: uuidv4(),
      senderId: responderId,
      senderRole: dispute.initiatorRole === 'buyer' ? 'seller' : 'buyer',
      content: response,
      createdAt: new Date()
    });

    // Update status
    dispute.status = 'under_review';
    dispute.updatedAt = new Date();

    // Extend deadline for review
    dispute.deadlineAt = new Date(Date.now() + RESOLUTION_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

    await this.saveDispute(dispute);

    // Notify initiator
    await this.notifyParty(dispute.initiatorId, 'dispute_response', {
      disputeId,
      message: 'The other party has responded to your dispute'
    });

    return dispute;
  }

  /**
   * Add evidence to dispute
   */
  async addEvidence(
    disputeId: string,
    userId: string,
    evidence: {
      type: DisputeEvidence['type'];
      url: string;
      description?: string;
    }
  ): Promise<Dispute> {
    const dispute = await this.getDispute(disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.initiatorId !== userId && dispute.respondentId !== userId) {
      throw new Error('You are not part of this dispute');
    }

    if (dispute.status === 'closed' || dispute.status === 'resolved') {
      throw new Error('Cannot add evidence to closed dispute');
    }

    // Limit evidence
    const userEvidence = dispute.evidence.filter(e => e.uploadedBy === userId);
    if (userEvidence.length >= 10) {
      throw new Error('Maximum 10 evidence items per party');
    }

    dispute.evidence.push({
      id: uuidv4(),
      type: evidence.type,
      url: evidence.url,
      description: evidence.description,
      uploadedBy: userId,
      uploadedAt: new Date()
    });

    dispute.updatedAt = new Date();

    await this.saveDispute(dispute);

    return dispute;
  }

  /**
   * Add message to dispute
   */
  async addMessage(
    disputeId: string,
    senderId: string,
    content: string,
    attachments?: string[]
  ): Promise<Dispute> {
    const dispute = await this.getDispute(disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.initiatorId !== senderId && dispute.respondentId !== senderId) {
      throw new Error('You are not part of this dispute');
    }

    if (dispute.status === 'closed' || dispute.status === 'resolved') {
      throw new Error('Cannot send messages in closed dispute');
    }

    const role = senderId === dispute.initiatorId ? dispute.initiatorRole :
                 (dispute.initiatorRole === 'buyer' ? 'seller' : 'buyer');

    dispute.messages.push({
      id: uuidv4(),
      senderId,
      senderRole: role,
      content,
      attachments,
      createdAt: new Date()
    });

    dispute.updatedAt = new Date();

    await this.saveDispute(dispute);

    // Notify other party
    const recipientId = senderId === dispute.initiatorId ? dispute.respondentId : dispute.initiatorId;
    await this.notifyParty(recipientId, 'dispute_message', {
      disputeId,
      preview: content.substring(0, 100)
    });

    return dispute;
  }

  /**
   * Resolve dispute (by mediator or auto)
   */
  async resolveDispute(
    disputeId: string,
    resolution: {
      outcome: DisputeOutcome;
      refundAmount?: number;
      notes: string;
      resolvedBy: 'auto' | 'mediator' | 'admin';
    }
  ): Promise<Dispute> {
    const dispute = await this.getDispute(disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status === 'closed' || dispute.status === 'resolved') {
      throw new Error('Dispute is already resolved');
    }

    dispute.resolution = {
      outcome: resolution.outcome,
      refundAmount: resolution.refundAmount,
      notes: resolution.notes,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: new Date()
    };

    dispute.status = 'resolved';
    dispute.updatedAt = new Date();

    // Add system message
    dispute.messages.push({
      id: uuidv4(),
      senderId: 'system',
      senderRole: 'system',
      content: `Dispute resolved: ${this.getOutcomeLabel(resolution.outcome)}. ${resolution.notes}`,
      createdAt: new Date()
    });

    await this.saveDispute(dispute);

    // Process resolution (refunds, escrow release, etc.)
    await this.processResolution(dispute);

    // Notify both parties
    await this.notifyParty(dispute.initiatorId, 'dispute_resolved', {
      disputeId,
      outcome: resolution.outcome
    });
    await this.notifyParty(dispute.respondentId, 'dispute_resolved', {
      disputeId,
      outcome: resolution.outcome
    });

    return dispute;
  }

  /**
   * Get outcome label
   */
  private getOutcomeLabel(outcome: DisputeOutcome): string {
    const labels: Record<DisputeOutcome, string> = {
      full_refund: 'Full refund to buyer',
      partial_refund: 'Partial refund to buyer',
      no_refund: 'No refund - order stands',
      mutual_agreement: 'Resolved by mutual agreement',
      seller_favor: 'Resolved in favor of seller',
      buyer_favor: 'Resolved in favor of buyer'
    };
    return labels[outcome] || outcome;
  }

  /**
   * Process dispute resolution
   */
  private async processResolution(dispute: Dispute): Promise<void> {
    if (!dispute.resolution) return;

    const { outcome, refundAmount } = dispute.resolution;

    // Emit events for escrow processing
    if (outcome === 'full_refund' || outcome === 'buyer_favor') {
      await this.redis.publish('marketplace:dispute:refund', JSON.stringify({
        disputeId: dispute.id,
        orderId: dispute.orderId,
        buyerId: dispute.initiatorRole === 'buyer' ? dispute.initiatorId : dispute.respondentId,
        amount: 'full'
      }));
    } else if (outcome === 'partial_refund' && refundAmount) {
      await this.redis.publish('marketplace:dispute:refund', JSON.stringify({
        disputeId: dispute.id,
        orderId: dispute.orderId,
        buyerId: dispute.initiatorRole === 'buyer' ? dispute.initiatorId : dispute.respondentId,
        amount: refundAmount
      }));
    } else if (outcome === 'no_refund' || outcome === 'seller_favor') {
      await this.redis.publish('marketplace:dispute:release', JSON.stringify({
        disputeId: dispute.id,
        orderId: dispute.orderId,
        sellerId: dispute.initiatorRole === 'seller' ? dispute.initiatorId : dispute.respondentId
      }));
    }
  }

  /**
   * Escalate to safety team
   */
  private async escalateToSafetyTeam(dispute: Dispute): Promise<void> {
    await this.redis.rpush('marketplace:safety:escalations', JSON.stringify({
      disputeId: dispute.id,
      orderId: dispute.orderId,
      reason: dispute.reason,
      initiatorId: dispute.initiatorId,
      respondentId: dispute.respondentId,
      description: dispute.description,
      escalatedAt: new Date().toISOString()
    }));

    dispute.messages.push({
      id: uuidv4(),
      senderId: 'system',
      senderRole: 'system',
      content: '⚠️ This dispute has been escalated to our Safety Team due to the nature of the concern. ' +
               'A specialist will review within 24 hours.',
      createdAt: new Date()
    });

    await this.saveDispute(dispute);
  }

  /**
   * Report safety violation from dispute
   */
  async reportSafetyViolation(
    disputeId: string,
    reporterId: string,
    violationType: SafetyViolationType,
    description: string,
    evidence?: string[]
  ): Promise<void> {
    const dispute = await this.getDispute(disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    // Determine who is being reported
    const reportedUserId = reporterId === dispute.initiatorId ?
                           dispute.respondentId : dispute.initiatorId;

    await this.redis.rpush('marketplace:safety:reports', JSON.stringify({
      disputeId,
      reporterId,
      reportedUserId,
      violationType,
      description,
      evidence,
      reportedAt: new Date().toISOString()
    }));

    // Add to dispute messages
    dispute.messages.push({
      id: uuidv4(),
      senderId: 'system',
      senderRole: 'system',
      content: '🚨 A safety concern has been reported and will be reviewed by our Safety Team.',
      createdAt: new Date()
    });

    dispute.status = 'escalated';
    await this.saveDispute(dispute);
  }

  /**
   * Process expired disputes (called by scheduler)
   */
  async processExpiredDisputes(): Promise<number> {
    const now = Date.now();

    // Get all open disputes
    const disputeIds = await this.redis.smembers('marketplace:disputes:open');

    let processed = 0;
    for (const id of disputeIds) {
      const dispute = await this.getDispute(id);
      if (!dispute) continue;

      // Skip already resolved/closed
      if (dispute.status === 'resolved' || dispute.status === 'closed') continue;

      const deadlineTime = new Date(dispute.deadlineAt).getTime();

      // No response from seller - auto-resolve in buyer's favor
      if (dispute.status === 'awaiting_seller_response' && now > deadlineTime) {
        await this.resolveDispute(id, {
          outcome: 'buyer_favor',
          refundAmount: undefined,
          notes: 'Auto-resolved: Seller did not respond within deadline',
          resolvedBy: 'auto'
        });
        processed++;
      }
      // Under review for too long - escalate
      else if (dispute.status === 'under_review' &&
               now > deadlineTime + 7 * 24 * 60 * 60 * 1000) {
        dispute.status = 'escalated';
        dispute.messages.push({
          id: uuidv4(),
          senderId: 'system',
          senderRole: 'system',
          content: 'This dispute has been escalated for priority review.',
          createdAt: new Date()
        });
        await this.saveDispute(dispute);
        processed++;
      }
    }

    return processed;
  }

  /**
   * Get dispute by ID
   */
  async getDispute(disputeId: string): Promise<Dispute | null> {
    const data = await this.redis.hget('marketplace:disputes', disputeId);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get dispute by order ID
   */
  async getDisputeByOrder(orderId: string): Promise<Dispute | null> {
    const disputeId = await this.redis.hget('marketplace:order_disputes', orderId);
    if (!disputeId) return null;
    return this.getDispute(disputeId);
  }

  /**
   * Get user's disputes
   */
  async getUserDisputes(
    userId: string,
    options: { role?: 'initiator' | 'respondent'; status?: DisputeStatus } = {}
  ): Promise<Dispute[]> {
    const disputeIds = await this.redis.smembers(`marketplace:user:${userId}:disputes`);

    const disputes: Dispute[] = [];
    for (const id of disputeIds) {
      const dispute = await this.getDispute(id);
      if (!dispute) continue;

      // Filter by role
      if (options.role === 'initiator' && dispute.initiatorId !== userId) continue;
      if (options.role === 'respondent' && dispute.respondentId !== userId) continue;

      // Filter by status
      if (options.status && dispute.status !== options.status) continue;

      disputes.push(dispute);
    }

    // Sort by newest first
    disputes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return disputes;
  }

  /**
   * Notify party (stub - would integrate with notification service)
   */
  private async notifyParty(userId: string, type: string, data: Record<string, any>): Promise<void> {
    await this.redis.publish('marketplace:notifications', JSON.stringify({
      userId,
      type,
      data,
      timestamp: new Date().toISOString()
    }));
  }

  // Storage helpers
  private async saveDispute(dispute: Dispute): Promise<void> {
    await this.redis.hset('marketplace:disputes', dispute.id, JSON.stringify(dispute));
    await this.redis.hset('marketplace:order_disputes', dispute.orderId, dispute.id);
    await this.redis.sadd(`marketplace:user:${dispute.initiatorId}:disputes`, dispute.id);
    await this.redis.sadd(`marketplace:user:${dispute.respondentId}:disputes`, dispute.id);

    if (dispute.status !== 'resolved' && dispute.status !== 'closed') {
      await this.redis.sadd('marketplace:disputes:open', dispute.id);
    } else {
      await this.redis.srem('marketplace:disputes:open', dispute.id);
    }
  }
}
