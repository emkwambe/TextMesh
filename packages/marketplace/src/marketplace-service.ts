/**
 * TextMesh Marketplace Service
 *
 * SAFETY-FIRST MARKETPLACE
 * ========================
 * - DELIVERY ONLY: No residential meetups allowed
 * - Escrow protection for all transactions
 * - Verified sellers and safe pickup locations
 * - Fair dispute resolution
 *
 * This service orchestrates all marketplace components.
 */

import { ListingsManager } from './listings';
import { OrderManager } from './orders';
import { EscrowManager } from './escrow';
import { SellerVerificationManager } from './seller-verification';
import { ShippingManager, SHIPPING_SAFETY_MESSAGE } from './shipping';
import { DisputeManager } from './disputes';
import {
  ProductListing,
  ProductType,
  Order,
  Escrow,
  SellerProfile,
  ShippingAddress,
  SafePickupLocation,
  DeliveryMethod,
  Dispute,
  Review,
  DEFAULT_SAFETY_POLICY,
  SafetyViolationType
} from './types';

export interface MarketplaceConfig {
  platformFeePercent: number;
  minSellerVerificationLevel: 'unverified' | 'basic' | 'verified';
  requireSafetyPolicyAcceptance: boolean;
  autoReleaseEscrowDays: number;
  disputeWindowDays: number;
}

const DEFAULT_CONFIG: MarketplaceConfig = {
  platformFeePercent: 8,
  minSellerVerificationLevel: 'basic',
  requireSafetyPolicyAcceptance: true,
  autoReleaseEscrowDays: 3,
  disputeWindowDays: 14
};

export class MarketplaceService {
  private redis: any;
  private db: any;
  private config: MarketplaceConfig;

  // Sub-services
  public listings: ListingsManager;
  public orders: OrderManager;
  public escrow: EscrowManager;
  public sellers: SellerVerificationManager;
  public shipping: ShippingManager;
  public disputes: DisputeManager;

  constructor(redis: any, db: any, config: Partial<MarketplaceConfig> = {}) {
    this.redis = redis;
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize sub-services
    this.listings = new ListingsManager(redis, db);
    this.orders = new OrderManager(redis, db, {
      platformFeePercent: this.config.platformFeePercent,
      autoCompleteAfterDeliveryDays: this.config.autoReleaseEscrowDays
    });
    this.escrow = new EscrowManager(redis, db, {
      baseTransactionFeePercent: this.config.platformFeePercent
    });
    this.sellers = new SellerVerificationManager(redis, db);
    this.shipping = new ShippingManager(redis, db);
    this.disputes = new DisputeManager(redis, db);
  }

  // ========================================
  // SAFETY POLICY
  // ========================================

  /**
   * Get the safety policy that users must accept
   */
  getSafetyPolicy(): typeof DEFAULT_SAFETY_POLICY {
    return DEFAULT_SAFETY_POLICY;
  }

  /**
   * Get the safety message for display
   */
  getSafetyMessage(): string {
    return SHIPPING_SAFETY_MESSAGE;
  }

  /**
   * Check if user has accepted safety policy
   */
  async hasAcceptedSafetyPolicy(userId: string): Promise<boolean> {
    const profile = await this.sellers.getSellerProfile(userId);
    return profile?.safetyPolicyAccepted ?? false;
  }

  /**
   * Report a safety violation
   */
  async reportSafetyViolation(
    reporterId: string,
    reportedUserId: string,
    violationType: SafetyViolationType,
    description: string,
    evidence?: string[]
  ): Promise<void> {
    // Log the report
    await this.redis.rpush('marketplace:safety:reports', JSON.stringify({
      reporterId,
      reportedUserId,
      violationType,
      description,
      evidence,
      reportedAt: new Date().toISOString()
    }));

    // If it's a critical violation (residential meetup attempt), take immediate action
    const criticalViolations: SafetyViolationType[] = [
      'residential_meetup_attempt',
      'shared_home_address',
      'requested_home_visit'
    ];

    if (criticalViolations.includes(violationType)) {
      await this.sellers.recordSafetyViolation(
        reportedUserId,
        violationType,
        description,
        evidence
      );
    }
  }

  // ========================================
  // SELLER OPERATIONS
  // ========================================

  /**
   * Register as a seller
   */
  async registerAsSeller(userId: string, displayName: string): Promise<SellerProfile> {
    return this.sellers.createSellerProfile(userId, displayName);
  }

  /**
   * Accept seller safety policy
   */
  async acceptSellerSafetyPolicy(userId: string): Promise<SellerProfile> {
    return this.sellers.acceptSafetyPolicy(userId);
  }

  /**
   * Get seller profile
   */
  async getSellerProfile(userId: string): Promise<SellerProfile | null> {
    return this.sellers.getSellerProfile(userId);
  }

  /**
   * Check if user can sell
   */
  async canUserSell(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    limits: any;
  }> {
    return this.sellers.canSell(userId);
  }

  // ========================================
  // LISTING OPERATIONS
  // ========================================

  /**
   * Create a product listing
   */
  async createListing(
    sellerId: string,
    listingData: Parameters<ListingsManager['createListing']>[1]
  ): Promise<ProductListing> {
    // Verify seller can sell
    const canSell = await this.sellers.canSell(sellerId);
    if (!canSell.allowed) {
      throw new Error(canSell.reason || 'Seller cannot create listings');
    }

    // Check limits
    const limits = canSell.limits;
    if (listingData.price > limits.maxPricePerItem) {
      throw new Error(`Price exceeds your limit of $${limits.maxPricePerItem}`);
    }

    // Check product type allowed
    if (listingData.type === 'service' && !limits.canSellServices) {
      throw new Error('Your verification level does not allow selling services');
    }

    return this.listings.createListing(sellerId, listingData);
  }

  /**
   * Publish a listing
   */
  async publishListing(listingId: string, sellerId: string): Promise<ProductListing> {
    return this.listings.publishListing(listingId, sellerId);
  }

  /**
   * Search listings
   */
  async searchListings(
    query: string,
    options?: Parameters<ListingsManager['searchListings']>[1]
  ): Promise<{ listings: ProductListing[]; total: number }> {
    return this.listings.searchListings(query, options);
  }

  /**
   * Get listing by ID
   */
  async getListing(listingId: string): Promise<ProductListing | null> {
    return this.listings.getListing(listingId);
  }

  // ========================================
  // ORDER OPERATIONS
  // ========================================

  /**
   * Place an order
   *
   * IMPORTANT: Requires safety policy acceptance
   */
  async placeOrder(
    buyerId: string,
    listingId: string,
    quantity: number,
    deliveryMethod: DeliveryMethod,
    deliveryAddress?: {
      shippingAddress?: ShippingAddress;
      pickupLocation?: SafePickupLocation;
    },
    safetyPolicyAccepted: boolean = false
  ): Promise<{ order: Order; escrow: Escrow }> {
    // Get listing
    const listing = await this.listings.getListing(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Validate delivery method
    const validation = this.shipping.validateDeliveryMethod(
      deliveryMethod,
      listing.type
    );
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Create order
    const order = await this.orders.createOrder(
      buyerId,
      listing,
      quantity,
      deliveryMethod,
      deliveryAddress?.shippingAddress,
      deliveryAddress?.pickupLocation,
      safetyPolicyAccepted
    );

    // Create escrow
    const sellerProfile = await this.sellers.getSellerProfile(listing.sellerId);
    const escrowRecord = await this.escrow.createEscrow(
      order,
      sellerProfile?.verificationLevel
    );

    // Link escrow to order
    order.escrowId = escrowRecord.id;
    await this.redis.hset('marketplace:orders', order.id, JSON.stringify(order));

    return { order, escrow: escrowRecord };
  }

  /**
   * Pay for order (triggers escrow funding)
   */
  async payForOrder(
    orderId: string,
    buyerId: string,
    paymentReference: string
  ): Promise<Order> {
    const order = await this.orders.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    if (order.buyerId !== buyerId) {
      throw new Error('Not authorized to pay for this order');
    }

    // Fund escrow
    await this.escrow.fundEscrow(order.escrowId, paymentReference);

    // Update order status
    return this.orders.updateOrderStatus(orderId, 'paid', 'system', 'Payment received');
  }

  /**
   * Confirm delivery
   */
  async confirmDelivery(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.orders.confirmDelivery(orderId, buyerId);

    // Set escrow auto-release
    await this.escrow.setAutoRelease(order.escrowId, new Date());

    return order;
  }

  /**
   * Complete order (release escrow)
   */
  async completeOrder(orderId: string, completedBy: 'buyer' | 'system'): Promise<Order> {
    const order = await this.orders.completeOrder(orderId, completedBy);

    // Release escrow
    await this.escrow.releaseEscrow(
      order.escrowId,
      completedBy === 'buyer' ? 'delivery_confirmed' : 'auto_release'
    );

    // Update seller stats
    await this.sellers.updateSellerStats(order.sellerId, {
      saleAmount: order.subtotal
    });

    return order;
  }

  /**
   * Get order
   */
  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.getOrder(orderId);
  }

  /**
   * Get buyer orders
   */
  async getBuyerOrders(
    buyerId: string,
    options?: Parameters<OrderManager['getBuyerOrders']>[1]
  ): Promise<{ orders: Order[]; total: number }> {
    return this.orders.getBuyerOrders(buyerId, options);
  }

  /**
   * Get seller orders
   */
  async getSellerOrders(
    sellerId: string,
    options?: Parameters<OrderManager['getSellerOrders']>[1]
  ): Promise<{ orders: Order[]; total: number }> {
    return this.orders.getSellerOrders(sellerId, options);
  }

  // ========================================
  // SHIPPING OPERATIONS
  // ========================================

  /**
   * Add shipping address
   */
  async addShippingAddress(
    userId: string,
    address: Parameters<ShippingManager['addShippingAddress']>[1]
  ): Promise<ShippingAddress> {
    return this.shipping.addShippingAddress(userId, address);
  }

  /**
   * Get user addresses
   */
  async getUserAddresses(userId: string): Promise<ShippingAddress[]> {
    return this.shipping.getUserAddresses(userId);
  }

  /**
   * Get safe pickup locations
   */
  async getPickupLocations(
    coordinates: { lat: number; lng: number },
    radiusMiles?: number,
    types?: Parameters<ShippingManager['getPickupLocations']>[2]
  ): Promise<SafePickupLocation[]> {
    return this.shipping.getPickupLocations(coordinates, radiusMiles, types);
  }

  /**
   * Add tracking
   */
  async addTracking(
    orderId: string,
    sellerId: string,
    tracking: Parameters<OrderManager['addTracking']>[2]
  ): Promise<Order> {
    return this.orders.addTracking(orderId, sellerId, tracking);
  }

  // ========================================
  // DISPUTE OPERATIONS
  // ========================================

  /**
   * Open a dispute
   */
  async openDispute(
    orderId: string,
    initiatorId: string,
    reason: Parameters<DisputeManager['openDispute']>[2],
    description: string
  ): Promise<Dispute> {
    const order = await this.orders.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Update order status
    await this.orders.updateOrderStatus(orderId, 'disputed', 'system', 'Dispute opened');

    // Put escrow in dispute
    await this.escrow.disputeEscrow(order.escrowId, '');  // Dispute ID will be set

    return this.disputes.openDispute(order, initiatorId, reason, description);
  }

  /**
   * Get dispute
   */
  async getDispute(disputeId: string): Promise<Dispute | null> {
    return this.disputes.getDispute(disputeId);
  }

  /**
   * Add message to dispute
   */
  async addDisputeMessage(
    disputeId: string,
    senderId: string,
    content: string
  ): Promise<Dispute> {
    return this.disputes.addMessage(disputeId, senderId, content);
  }

  // ========================================
  // REVIEW OPERATIONS
  // ========================================

  /**
   * Leave a review
   */
  async leaveReview(
    orderId: string,
    reviewerId: string,
    review: {
      rating: number;
      title?: string;
      content: string;
      itemAsDescribed: number;
      communication: number;
      deliverySpeed: number;
      images?: string[];
    }
  ): Promise<Review> {
    const order = await this.orders.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    if (order.buyerId !== reviewerId) {
      throw new Error('Only buyers can leave reviews');
    }
    if (order.status !== 'completed') {
      throw new Error('Order must be completed before leaving a review');
    }

    // Check if already reviewed
    const existingReview = await this.redis.hget('marketplace:order_reviews', orderId);
    if (existingReview) {
      throw new Error('You have already reviewed this order');
    }

    // Validate ratings
    for (const rating of [review.rating, review.itemAsDescribed, review.communication, review.deliverySpeed]) {
      if (rating < 1 || rating > 5) {
        throw new Error('Ratings must be between 1 and 5');
      }
    }

    const reviewRecord: Review = {
      id: `rev_${Date.now()}`,
      orderId,
      listingId: order.listingId,
      reviewerId,
      sellerId: order.sellerId,
      rating: review.rating,
      title: review.title,
      content: review.content,
      itemAsDescribed: review.itemAsDescribed,
      communication: review.communication,
      deliverySpeed: review.deliverySpeed,
      images: review.images,
      isVerifiedPurchase: true,
      createdAt: new Date()
    };

    // Save review
    await this.redis.hset('marketplace:reviews', reviewRecord.id, JSON.stringify(reviewRecord));
    await this.redis.hset('marketplace:order_reviews', orderId, reviewRecord.id);
    await this.redis.rpush(`marketplace:seller:${order.sellerId}:reviews`, reviewRecord.id);
    await this.redis.rpush(`marketplace:listing:${order.listingId}:reviews`, reviewRecord.id);

    // Update seller stats
    await this.sellers.updateSellerStats(order.sellerId, {
      reviewRating: review.rating
    });

    return reviewRecord;
  }

  /**
   * Get seller reviews
   */
  async getSellerReviews(
    sellerId: string,
    limit: number = 20
  ): Promise<Review[]> {
    const reviewIds = await this.redis.lrange(
      `marketplace:seller:${sellerId}:reviews`,
      -limit,
      -1
    );

    const reviews: Review[] = [];
    for (const id of reviewIds) {
      const data = await this.redis.hget('marketplace:reviews', id);
      if (data) {
        reviews.push(JSON.parse(data));
      }
    }

    return reviews.reverse();  // Newest first
  }

  // ========================================
  // SCHEDULER TASKS
  // ========================================

  /**
   * Run scheduled tasks (should be called periodically)
   */
  async runScheduledTasks(): Promise<{
    autoReleasedEscrows: number;
    autoCompletedOrders: number;
    processedDisputes: number;
  }> {
    const [autoReleasedEscrows, autoCompletedOrders, processedDisputes] = await Promise.all([
      this.escrow.processAutoReleases(),
      this.orders.processAutoCompletion(),
      this.disputes.processExpiredDisputes()
    ]);

    return {
      autoReleasedEscrows,
      autoCompletedOrders,
      processedDisputes
    };
  }

  // ========================================
  // ANALYTICS
  // ========================================

  /**
   * Get marketplace stats
   */
  async getMarketplaceStats(): Promise<{
    totalListings: number;
    activeListings: number;
    totalOrders: number;
    totalVolume: number;
    totalSellers: number;
    verifiedSellers: number;
  }> {
    const [
      totalListings,
      activeListings,
      completedOrders,
      sellers
    ] = await Promise.all([
      this.redis.hlen('marketplace:listings'),
      this.redis.scard('marketplace:listings:active'),
      this.redis.scard('marketplace:orders:completed'),
      this.redis.hlen('marketplace:sellers')
    ]);

    // Would calculate total volume from orders in production

    return {
      totalListings,
      activeListings,
      totalOrders: completedOrders,
      totalVolume: 0,  // Would aggregate from orders
      totalSellers: sellers,
      verifiedSellers: 0  // Would count verified sellers
    };
  }
}

// Export everything
export {
  ListingsManager,
  OrderManager,
  EscrowManager,
  SellerVerificationManager,
  ShippingManager,
  DisputeManager,
  SHIPPING_SAFETY_MESSAGE
};

export * from './types';
