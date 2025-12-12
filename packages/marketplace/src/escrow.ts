/**
 * Escrow Payment System
 *
 * Protects both buyers and sellers:
 * - Buyer funds held until delivery confirmed
 * - Seller gets paid after successful delivery
 * - Auto-release after X days if no dispute
 */

import { v4 as uuidv4 } from 'uuid';
import { Escrow, EscrowStatus, Order, FeeStructure } from './types';

const DEFAULT_FEES: FeeStructure = {
  baseTransactionFeePercent: 8,       // 8% platform fee
  paymentProcessingFeePercent: 2.9,   // Payment processor
  paymentProcessingFeeFixed: 0.30,    // Fixed fee per transaction
  categoryFees: new Map(),
  tierDiscounts: {
    trusted: 1,   // 1% discount for trusted sellers
    premium: 2    // 2% discount for premium sellers
  }
};

// Auto-release escrow X days after delivery
const AUTO_RELEASE_DAYS = 3;

// Dispute window after delivery
const DISPUTE_WINDOW_DAYS = 14;

export class EscrowManager {
  private redis: any;
  private db: any;
  private fees: FeeStructure;

  constructor(redis: any, db: any, fees: Partial<FeeStructure> = {}) {
    this.redis = redis;
    this.db = db;
    this.fees = { ...DEFAULT_FEES, ...fees };
  }

  /**
   * Create escrow for an order
   */
  async createEscrow(order: Order, sellerTier?: string): Promise<Escrow> {
    // Calculate fees
    const { platformFee, processingFee, sellerPayout } = this.calculateFees(
      order.subtotal,
      order.productSnapshot.type === 'digital' ? 'digital' : 'physical',
      sellerTier
    );

    const now = new Date();
    const escrow: Escrow = {
      id: uuidv4(),
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      amount: order.subtotal + order.deliveryFee,
      platformFee: platformFee + processingFee,
      currency: order.currency,
      status: 'pending',
      createdAt: now,
      releaseCondition: 'delivery_confirmed'
    };

    await this.saveEscrow(escrow);

    return escrow;
  }

  /**
   * Calculate platform fees
   */
  calculateFees(
    amount: number,
    category: string,
    sellerTier?: string
  ): {
    platformFee: number;
    processingFee: number;
    sellerPayout: number;
    totalFees: number;
  } {
    // Base platform fee
    let platformFeePercent = this.fees.baseTransactionFeePercent;

    // Category-specific fee override
    const categoryFee = this.fees.categoryFees.get(category);
    if (categoryFee !== undefined) {
      platformFeePercent = categoryFee;
    }

    // Seller tier discount
    if (sellerTier === 'trusted') {
      platformFeePercent -= this.fees.tierDiscounts.trusted;
    } else if (sellerTier === 'premium') {
      platformFeePercent -= this.fees.tierDiscounts.premium;
    }

    // Ensure minimum fee
    platformFeePercent = Math.max(platformFeePercent, 3);

    const platformFee = amount * (platformFeePercent / 100);
    const processingFee = amount * (this.fees.paymentProcessingFeePercent / 100) +
                          this.fees.paymentProcessingFeeFixed;

    const totalFees = platformFee + processingFee;
    const sellerPayout = amount - totalFees;

    return {
      platformFee: Math.round(platformFee * 100) / 100,
      processingFee: Math.round(processingFee * 100) / 100,
      sellerPayout: Math.round(sellerPayout * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100
    };
  }

  /**
   * Fund escrow (buyer payment received)
   */
  async fundEscrow(escrowId: string, paymentReference: string): Promise<Escrow> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    if (escrow.status !== 'pending') {
      throw new Error('Escrow is not in pending state');
    }

    escrow.status = 'funded';
    escrow.fundedAt = new Date();

    await this.saveEscrow(escrow);

    // Emit event for order processing
    await this.redis.publish('marketplace:escrow:funded', JSON.stringify({
      escrowId,
      orderId: escrow.orderId,
      amount: escrow.amount
    }));

    return escrow;
  }

  /**
   * Set auto-release timer after delivery
   */
  async setAutoRelease(escrowId: string, deliveryDate: Date): Promise<Escrow> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    if (escrow.status !== 'funded') {
      throw new Error('Escrow must be funded to set auto-release');
    }

    // Auto-release X days after delivery
    escrow.autoReleaseAt = new Date(
      deliveryDate.getTime() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000
    );
    escrow.releaseCondition = 'auto_release';

    await this.saveEscrow(escrow);

    // Schedule auto-release job
    await this.redis.zadd(
      'marketplace:escrow:auto_release',
      escrow.autoReleaseAt.getTime(),
      escrowId
    );

    return escrow;
  }

  /**
   * Release escrow to seller
   */
  async releaseEscrow(
    escrowId: string,
    reason: 'delivery_confirmed' | 'auto_release' | 'dispute_resolved'
  ): Promise<Escrow> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    if (escrow.status !== 'funded') {
      throw new Error('Escrow must be funded to release');
    }

    escrow.status = 'released';
    escrow.releasedAt = new Date();
    escrow.releaseCondition = reason;

    await this.saveEscrow(escrow);

    // Remove from auto-release queue
    await this.redis.zrem('marketplace:escrow:auto_release', escrowId);

    // Calculate seller payout
    const sellerPayout = escrow.amount - escrow.platformFee;

    // Emit event for payment processing
    await this.redis.publish('marketplace:escrow:released', JSON.stringify({
      escrowId,
      orderId: escrow.orderId,
      sellerId: escrow.sellerId,
      amount: sellerPayout,
      platformFee: escrow.platformFee
    }));

    return escrow;
  }

  /**
   * Refund escrow to buyer
   */
  async refundEscrow(
    escrowId: string,
    reason: string,
    partialAmount?: number
  ): Promise<Escrow> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    if (escrow.status !== 'funded') {
      throw new Error('Escrow must be funded to refund');
    }

    const refundAmount = partialAmount || escrow.amount;
    if (refundAmount > escrow.amount) {
      throw new Error('Refund amount exceeds escrow amount');
    }

    escrow.status = 'refunded';
    escrow.refundedAt = new Date();

    await this.saveEscrow(escrow);

    // Remove from auto-release queue
    await this.redis.zrem('marketplace:escrow:auto_release', escrowId);

    // Emit event for refund processing
    await this.redis.publish('marketplace:escrow:refunded', JSON.stringify({
      escrowId,
      orderId: escrow.orderId,
      buyerId: escrow.buyerId,
      amount: refundAmount,
      reason
    }));

    return escrow;
  }

  /**
   * Put escrow in dispute
   */
  async disputeEscrow(escrowId: string, disputeId: string): Promise<Escrow> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    if (escrow.status !== 'funded') {
      throw new Error('Escrow must be funded to dispute');
    }

    escrow.status = 'disputed';
    escrow.disputeId = disputeId;

    await this.saveEscrow(escrow);

    // Remove from auto-release queue (hold funds during dispute)
    await this.redis.zrem('marketplace:escrow:auto_release', escrowId);

    return escrow;
  }

  /**
   * Cancel escrow (before funding)
   */
  async cancelEscrow(escrowId: string): Promise<Escrow> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }
    if (escrow.status !== 'pending') {
      throw new Error('Can only cancel pending escrows');
    }

    escrow.status = 'cancelled';

    await this.saveEscrow(escrow);

    return escrow;
  }

  /**
   * Process auto-releases (called by scheduler)
   */
  async processAutoReleases(): Promise<number> {
    const now = Date.now();

    // Get all escrows due for auto-release
    const escrowIds = await this.redis.zrangebyscore(
      'marketplace:escrow:auto_release',
      0,
      now
    );

    let released = 0;
    for (const escrowId of escrowIds) {
      try {
        const escrow = await this.getEscrow(escrowId);
        if (escrow && escrow.status === 'funded') {
          await this.releaseEscrow(escrowId, 'auto_release');
          released++;
        }
      } catch (error) {
        console.error(`Failed to auto-release escrow ${escrowId}:`, error);
      }
    }

    return released;
  }

  /**
   * Get escrow by ID
   */
  async getEscrow(escrowId: string): Promise<Escrow | null> {
    const data = await this.redis.hget('marketplace:escrows', escrowId);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get escrow by order ID
   */
  async getEscrowByOrder(orderId: string): Promise<Escrow | null> {
    const escrowId = await this.redis.hget('marketplace:order_escrows', orderId);
    if (!escrowId) return null;
    return this.getEscrow(escrowId);
  }

  /**
   * Get escrow stats for seller
   */
  async getSellerEscrowStats(sellerId: string): Promise<{
    pendingAmount: number;
    fundedAmount: number;
    releasedTotal: number;
    disputedAmount: number;
  }> {
    const escrowIds = await this.redis.smembers(`marketplace:seller:${sellerId}:escrows`);

    let pendingAmount = 0;
    let fundedAmount = 0;
    let releasedTotal = 0;
    let disputedAmount = 0;

    for (const id of escrowIds) {
      const escrow = await this.getEscrow(id);
      if (!escrow) continue;

      switch (escrow.status) {
        case 'pending':
          pendingAmount += escrow.amount;
          break;
        case 'funded':
          fundedAmount += escrow.amount;
          break;
        case 'released':
          releasedTotal += escrow.amount - escrow.platformFee;
          break;
        case 'disputed':
          disputedAmount += escrow.amount;
          break;
      }
    }

    return { pendingAmount, fundedAmount, releasedTotal, disputedAmount };
  }

  // Storage helpers
  private async saveEscrow(escrow: Escrow): Promise<void> {
    await this.redis.hset('marketplace:escrows', escrow.id, JSON.stringify(escrow));
    await this.redis.hset('marketplace:order_escrows', escrow.orderId, escrow.id);
    await this.redis.sadd(`marketplace:seller:${escrow.sellerId}:escrows`, escrow.id);
    await this.redis.sadd(`marketplace:buyer:${escrow.buyerId}:escrows`, escrow.id);
  }
}
