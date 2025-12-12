/**
 * Order Management System
 *
 * Handles the complete order lifecycle:
 * - Order creation with safety policy acceptance
 * - Status tracking
 * - Delivery confirmation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Order,
  OrderStatus,
  OrderStatusEvent,
  PaymentStatus,
  ProductListing,
  ShippingAddress,
  SafePickupLocation,
  DeliveryMethod,
  DEFAULT_SAFETY_POLICY
} from './types';

// Order number format: TM-YYYYMMDD-XXXXX
function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `TM-${dateStr}-${random}`;
}

export interface OrderConfig {
  platformFeePercent: number;
  autoCompleteAfterDeliveryDays: number;
  cancellationWindowHours: number;
}

const DEFAULT_CONFIG: OrderConfig = {
  platformFeePercent: 8,
  autoCompleteAfterDeliveryDays: 3,
  cancellationWindowHours: 1
};

export class OrderManager {
  private redis: any;
  private db: any;
  private config: OrderConfig;

  constructor(redis: any, db: any, config: Partial<OrderConfig> = {}) {
    this.redis = redis;
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new order
   */
  async createOrder(
    buyerId: string,
    listing: ProductListing,
    quantity: number,
    deliveryMethod: DeliveryMethod,
    shippingAddress?: ShippingAddress,
    pickupLocation?: SafePickupLocation,
    safetyPolicyAccepted: boolean = false
  ): Promise<Order> {
    // CRITICAL: Must accept safety policy
    if (!safetyPolicyAccepted) {
      throw new Error(
        'SAFETY REQUIREMENT: You must accept the TextMesh Marketplace Safety Policy before placing an order. ' +
        'Key points: This is a DELIVERY-ONLY marketplace. NO residential meetups allowed.'
      );
    }

    // Validate listing
    if (listing.status !== 'active') {
      throw new Error('This listing is no longer available');
    }
    if (listing.quantity < quantity) {
      throw new Error(`Only ${listing.quantity} items available`);
    }

    // Cannot buy own listing
    if (listing.sellerId === buyerId) {
      throw new Error('You cannot purchase your own listing');
    }

    // Validate delivery method
    const validDeliveryOption = listing.deliveryOptions.find(d => d.method === deliveryMethod);
    if (!validDeliveryOption) {
      throw new Error(`Delivery method "${deliveryMethod}" is not available for this listing`);
    }

    // Require shipping address for physical goods
    if (listing.type === 'physical' && deliveryMethod === 'shipping' && !shippingAddress) {
      throw new Error('Shipping address is required for physical products');
    }

    // Require pickup location for pickup methods
    if (deliveryMethod.startsWith('pickup_') && !pickupLocation) {
      throw new Error('Pickup location is required');
    }

    // Calculate totals
    const subtotal = listing.price * quantity;
    const deliveryFee = validDeliveryOption.price * quantity;
    const platformFee = subtotal * (this.config.platformFeePercent / 100);
    const total = subtotal + deliveryFee;

    const now = new Date();
    const order: Order = {
      id: uuidv4(),
      orderNumber: generateOrderNumber(),
      buyerId,
      sellerId: listing.sellerId,
      listingId: listing.id,
      productSnapshot: {
        title: listing.title,
        description: listing.description,
        type: listing.type,
        price: listing.price,
        images: listing.images.slice(0, 3)  // Keep first 3 images
      },
      quantity,
      subtotal,
      deliveryFee,
      platformFee,
      total,
      currency: listing.currency,
      deliveryMethod,
      shippingAddress,
      pickupLocation,
      status: 'pending_payment',
      statusHistory: [
        {
          status: 'pending_payment',
          timestamp: now,
          note: 'Order created',
          updatedBy: 'system'
        }
      ],
      escrowId: '',  // Will be set when escrow is created
      paymentStatus: 'pending',
      createdAt: now,
      safetyPolicyAccepted: true,
      safetyPolicyAcceptedAt: now
    };

    await this.saveOrder(order);

    // Emit event for escrow creation
    await this.redis.publish('marketplace:order:created', JSON.stringify({
      orderId: order.id,
      buyerId,
      sellerId: listing.sellerId,
      total
    }));

    return order;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    updatedBy: 'system' | 'seller' | 'buyer' | 'admin',
    note?: string
  ): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Validate status transition
    this.validateStatusTransition(order.status, newStatus);

    const now = new Date();

    // Update status
    order.status = newStatus;
    order.statusHistory.push({
      status: newStatus,
      timestamp: now,
      note,
      updatedBy
    });

    // Set timestamp fields
    switch (newStatus) {
      case 'paid':
        order.paidAt = now;
        order.paymentStatus = 'held_in_escrow';
        break;
      case 'shipped':
        order.shippedAt = now;
        break;
      case 'delivered':
        order.deliveredAt = now;
        break;
      case 'completed':
        order.completedAt = now;
        order.paymentStatus = 'released_to_seller';
        break;
      case 'cancelled':
        order.cancelledAt = now;
        break;
      case 'refunded':
        order.paymentStatus = 'refunded_to_buyer';
        break;
      case 'disputed':
        order.paymentStatus = 'disputed';
        break;
    }

    await this.saveOrder(order);

    // Emit status change event
    await this.redis.publish('marketplace:order:status_changed', JSON.stringify({
      orderId,
      oldStatus: order.statusHistory[order.statusHistory.length - 2]?.status,
      newStatus,
      updatedBy
    }));

    return order;
  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending_payment: ['paid', 'cancelled'],
      paid: ['processing', 'cancelled', 'refunded'],
      processing: ['shipped', 'cancelled', 'refunded'],
      shipped: ['out_for_delivery', 'delivered', 'disputed'],
      out_for_delivery: ['delivered', 'disputed'],
      delivered: ['completed', 'disputed'],
      completed: [],  // Terminal state
      cancelled: [],  // Terminal state
      refunded: [],   // Terminal state
      disputed: ['completed', 'refunded']  // Can be resolved either way
    };

    if (!allowedTransitions[currentStatus].includes(newStatus)) {
      throw new Error(`Cannot transition from "${currentStatus}" to "${newStatus}"`);
    }
  }

  /**
   * Add tracking information
   */
  async addTracking(
    orderId: string,
    sellerId: string,
    tracking: {
      trackingNumber: string;
      carrier: string;
      trackingUrl?: string;
    }
  ): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    if (order.sellerId !== sellerId) {
      throw new Error('Not authorized to update this order');
    }
    if (order.status !== 'processing' && order.status !== 'paid') {
      throw new Error('Cannot add tracking to order in current status');
    }

    order.trackingNumber = tracking.trackingNumber;
    order.trackingCarrier = tracking.carrier;
    order.trackingUrl = tracking.trackingUrl;

    // Auto-update status to shipped
    await this.updateOrderStatus(orderId, 'shipped', 'seller', 'Tracking added');

    return order;
  }

  /**
   * Confirm delivery (by buyer)
   */
  async confirmDelivery(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    if (order.buyerId !== buyerId) {
      throw new Error('Not authorized to confirm this order');
    }
    if (order.status !== 'shipped' && order.status !== 'out_for_delivery') {
      throw new Error('Order must be shipped before confirming delivery');
    }

    await this.updateOrderStatus(orderId, 'delivered', 'buyer', 'Buyer confirmed delivery');

    // Emit event for escrow auto-release scheduling
    await this.redis.publish('marketplace:delivery:confirmed', JSON.stringify({
      orderId,
      confirmedBy: 'buyer',
      deliveredAt: new Date().toISOString()
    }));

    return order;
  }

  /**
   * Complete order (release funds to seller)
   */
  async completeOrder(orderId: string, completedBy: 'buyer' | 'system'): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    if (order.status !== 'delivered') {
      throw new Error('Order must be delivered before completing');
    }

    await this.updateOrderStatus(orderId, 'completed', completedBy === 'buyer' ? 'buyer' : 'system',
      completedBy === 'buyer' ? 'Buyer completed order' : 'Auto-completed after delivery window'
    );

    // Emit event for escrow release
    await this.redis.publish('marketplace:order:completed', JSON.stringify({
      orderId,
      sellerId: order.sellerId,
      completedBy
    }));

    return order;
  }

  /**
   * Cancel order
   */
  async cancelOrder(
    orderId: string,
    cancelledBy: string,
    reason: string
  ): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Check if user is authorized
    const isBuyer = order.buyerId === cancelledBy;
    const isSeller = order.sellerId === cancelledBy;
    if (!isBuyer && !isSeller) {
      throw new Error('Not authorized to cancel this order');
    }

    // Check if cancellation is allowed
    const canCancel = ['pending_payment', 'paid', 'processing'].includes(order.status);
    if (!canCancel) {
      throw new Error('Order cannot be cancelled in current status');
    }

    // Check cancellation window for buyers
    if (isBuyer && order.status === 'processing') {
      const hoursSinceOrder = (Date.now() - new Date(order.createdAt).getTime()) / (60 * 60 * 1000);
      if (hoursSinceOrder > this.config.cancellationWindowHours) {
        throw new Error(
          `Cancellation window has passed (${this.config.cancellationWindowHours} hours). ` +
          'Please contact seller or open a dispute.'
        );
      }
    }

    await this.updateOrderStatus(orderId, 'cancelled', isBuyer ? 'buyer' : 'seller', reason);

    // Emit event for escrow cancellation/refund
    if (order.paymentStatus === 'held_in_escrow') {
      await this.redis.publish('marketplace:order:cancelled', JSON.stringify({
        orderId,
        escrowId: order.escrowId,
        refundTo: 'buyer',
        reason
      }));
    }

    return order;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const data = await this.redis.hget('marketplace:orders', orderId);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    const orderId = await this.redis.hget('marketplace:order_numbers', orderNumber);
    if (!orderId) return null;
    return this.getOrder(orderId);
  }

  /**
   * Get buyer's orders
   */
  async getBuyerOrders(
    buyerId: string,
    options: { status?: OrderStatus; limit?: number; offset?: number } = {}
  ): Promise<{ orders: Order[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    const orderIds = await this.redis.smembers(`marketplace:buyer:${buyerId}:orders`);

    let orders: Order[] = [];
    for (const id of orderIds) {
      const order = await this.getOrder(id);
      if (order && (!status || order.status === status)) {
        orders.push(order);
      }
    }

    // Sort by newest first
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = orders.length;
    orders = orders.slice(offset, offset + limit);

    return { orders, total };
  }

  /**
   * Get seller's orders
   */
  async getSellerOrders(
    sellerId: string,
    options: { status?: OrderStatus; limit?: number; offset?: number } = {}
  ): Promise<{ orders: Order[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    const orderIds = await this.redis.smembers(`marketplace:seller:${sellerId}:orders`);

    let orders: Order[] = [];
    for (const id of orderIds) {
      const order = await this.getOrder(id);
      if (order && (!status || order.status === status)) {
        orders.push(order);
      }
    }

    // Sort by newest first
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = orders.length;
    orders = orders.slice(offset, offset + limit);

    return { orders, total };
  }

  /**
   * Process auto-completion of delivered orders (called by scheduler)
   */
  async processAutoCompletion(): Promise<number> {
    const completionThreshold = Date.now() -
      this.config.autoCompleteAfterDeliveryDays * 24 * 60 * 60 * 1000;

    // Get all delivered orders
    const orderIds = await this.redis.smembers('marketplace:orders:delivered');

    let completed = 0;
    for (const id of orderIds) {
      const order = await this.getOrder(id);
      if (!order || order.status !== 'delivered') continue;

      if (order.deliveredAt &&
          new Date(order.deliveredAt).getTime() < completionThreshold) {
        try {
          await this.completeOrder(id, 'system');
          completed++;
        } catch (error) {
          console.error(`Failed to auto-complete order ${id}:`, error);
        }
      }
    }

    return completed;
  }

  /**
   * Get safety policy for order creation
   */
  getSafetyPolicy(): typeof DEFAULT_SAFETY_POLICY {
    return DEFAULT_SAFETY_POLICY;
  }

  // Storage helpers
  private async saveOrder(order: Order): Promise<void> {
    await this.redis.hset('marketplace:orders', order.id, JSON.stringify(order));
    await this.redis.hset('marketplace:order_numbers', order.orderNumber, order.id);
    await this.redis.sadd(`marketplace:buyer:${order.buyerId}:orders`, order.id);
    await this.redis.sadd(`marketplace:seller:${order.sellerId}:orders`, order.id);

    // Index by status
    await this.redis.sadd(`marketplace:orders:${order.status}`, order.id);

    // Remove from previous status index
    const allStatuses: OrderStatus[] = [
      'pending_payment', 'paid', 'processing', 'shipped',
      'out_for_delivery', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'
    ];
    for (const status of allStatuses) {
      if (status !== order.status) {
        await this.redis.srem(`marketplace:orders:${status}`, order.id);
      }
    }
  }
}
