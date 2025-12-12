/**
 * TextMesh Marketplace Types
 *
 * SAFETY POLICY: Delivery-only marketplace
 * - NO residential address meetups allowed
 * - NO buyer/seller physical meetings at homes
 * - All transactions must use shipping or safe pickup locations
 */

export type ProductType = 'physical' | 'digital' | 'service';
export type ProductStatus = 'draft' | 'active' | 'sold' | 'suspended' | 'deleted';
export type ListingVisibility = 'public' | 'followers' | 'subscribers' | 'private';

export interface ProductListing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  type: ProductType;
  category: string;
  subcategory?: string;
  price: number;
  currency: string;
  quantity: number;
  quantitySold: number;
  images: string[];
  tags: string[];
  status: ProductStatus;
  visibility: ListingVisibility;

  // Delivery options (NO residential meetups)
  deliveryOptions: DeliveryOption[];

  // Digital product specifics
  digitalAsset?: {
    fileId: string;
    fileSize: number;
    fileType: string;
    downloadLimit: number;
  };

  // Service specifics
  serviceDetails?: {
    deliveryTimeframeDays: number;
    revisions: number;
    requirements: string[];
  };

  // Metadata
  views: number;
  favorites: number;
  rating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export type DeliveryMethod =
  | 'shipping'           // Standard shipping to address
  | 'pickup_locker'      // Pickup at secure locker
  | 'pickup_store'       // Pickup at retail partner
  | 'pickup_postoffice'  // Pickup at post office
  | 'digital_download';  // Digital delivery

// SAFETY: Explicitly blocked delivery methods
export type BlockedDeliveryMethod =
  | 'residential_meetup'    // BLOCKED: Meeting at home
  | 'seller_residence'      // BLOCKED: Pickup at seller's home
  | 'buyer_residence'       // BLOCKED: Delivery requiring buyer presence at home
  | 'private_location';     // BLOCKED: Any private/residential location

export interface DeliveryOption {
  method: DeliveryMethod;
  price: number;
  estimatedDays: number;
  carrier?: string;
  description?: string;

  // For pickup options
  pickupLocationTypes?: SafePickupLocationType[];
}

export type SafePickupLocationType =
  | 'post_office'
  | 'parcel_locker'
  | 'retail_partner'
  | 'shipping_center'
  | 'mall_pickup'
  | 'business_address';  // Commercial only, verified

export interface ShippingAddress {
  id: string;
  userId: string;
  label: string;
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;

  // SAFETY: Address type verification
  addressType: AddressType;
  isVerified: boolean;
  verificationMethod?: 'carrier_api' | 'manual_review';

  isDefault: boolean;
  createdAt: Date;
}

export type AddressType =
  | 'commercial'      // Business address - ALLOWED
  | 'po_box'          // PO Box - ALLOWED
  | 'parcel_locker'   // Locker service - ALLOWED
  | 'residential';    // Home address - SHIPPING ONLY, NO MEETUPS

export interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  listingId: string;

  // Product snapshot at time of purchase
  productSnapshot: {
    title: string;
    description: string;
    type: ProductType;
    price: number;
    images: string[];
  };

  quantity: number;
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  currency: string;

  // Delivery info
  deliveryMethod: DeliveryMethod;
  shippingAddress?: ShippingAddress;
  pickupLocation?: SafePickupLocation;

  // Status tracking
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];

  // Payment
  escrowId: string;
  paymentStatus: PaymentStatus;

  // Tracking
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingUrl?: string;

  // Digital delivery
  digitalDownloadUrl?: string;
  downloadCount?: number;

  // Timestamps
  createdAt: Date;
  paidAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  // Safety acknowledgment
  safetyPolicyAccepted: boolean;
  safetyPolicyAcceptedAt: Date;
}

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'disputed';

export type PaymentStatus =
  | 'pending'
  | 'held_in_escrow'
  | 'released_to_seller'
  | 'refunded_to_buyer'
  | 'disputed';

export interface OrderStatusEvent {
  status: OrderStatus;
  timestamp: Date;
  note?: string;
  updatedBy: 'system' | 'seller' | 'buyer' | 'admin';
}

export interface SafePickupLocation {
  id: string;
  type: SafePickupLocationType;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  coordinates?: { lat: number; lng: number };
  operatingHours?: string;
  instructions?: string;
  isVerified: boolean;
}

export interface Escrow {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  currency: string;
  status: EscrowStatus;

  // Timeline
  createdAt: Date;
  fundedAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;

  // Release conditions
  releaseCondition: 'delivery_confirmed' | 'auto_release' | 'dispute_resolved';
  autoReleaseAt?: Date;  // Auto-release X days after delivery

  // Dispute
  disputeId?: string;
}

export type EscrowStatus =
  | 'pending'
  | 'funded'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled';

export interface SellerProfile {
  userId: string;
  displayName: string;
  bio?: string;
  avatar?: string;

  // Verification levels
  verificationLevel: SellerVerificationLevel;
  identityVerified: boolean;
  phoneVerified: boolean;
  emailVerified: boolean;
  addressVerified: boolean;  // Business address only

  // Stats
  totalSales: number;
  totalRevenue: number;
  rating: number;
  reviewCount: number;
  responseRate: number;
  responseTimeHours: number;

  // Trust
  accountAgeDays: number;
  disputeRate: number;
  refundRate: number;

  // Settings
  acceptingOrders: boolean;
  vacationMode: boolean;
  vacationMessage?: string;

  // Safety compliance
  safetyPolicyAccepted: boolean;
  safetyViolations: number;

  createdAt: Date;
  updatedAt: Date;
}

export type SellerVerificationLevel =
  | 'unverified'      // New seller
  | 'basic'           // Email + phone verified
  | 'verified'        // ID verified
  | 'trusted'         // Track record + ID
  | 'premium';        // Business verified

export interface Review {
  id: string;
  orderId: string;
  listingId: string;
  reviewerId: string;
  sellerId: string;

  rating: number;  // 1-5
  title?: string;
  content: string;

  // Specific ratings
  itemAsDescribed: number;
  communication: number;
  deliverySpeed: number;

  // Media
  images?: string[];

  // Response
  sellerResponse?: {
    content: string;
    respondedAt: Date;
  };

  isVerifiedPurchase: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Dispute {
  id: string;
  orderId: string;
  initiatorId: string;
  initiatorRole: 'buyer' | 'seller';
  respondentId: string;

  reason: DisputeReason;
  description: string;
  evidence: DisputeEvidence[];

  status: DisputeStatus;

  // Resolution
  resolution?: {
    outcome: DisputeOutcome;
    refundAmount?: number;
    notes: string;
    resolvedBy: 'auto' | 'mediator' | 'admin';
    resolvedAt: Date;
  };

  // Communication
  messages: DisputeMessage[];

  createdAt: Date;
  updatedAt: Date;
  deadlineAt: Date;
}

export type DisputeReason =
  | 'item_not_received'
  | 'item_not_as_described'
  | 'item_damaged'
  | 'wrong_item'
  | 'seller_unresponsive'
  | 'buyer_unresponsive'
  | 'payment_issue'
  | 'safety_concern'       // Attempted residential meetup
  | 'harassment'
  | 'other';

export type DisputeStatus =
  | 'open'
  | 'awaiting_seller_response'
  | 'awaiting_buyer_response'
  | 'under_review'
  | 'resolved'
  | 'escalated'
  | 'closed';

export type DisputeOutcome =
  | 'full_refund'
  | 'partial_refund'
  | 'no_refund'
  | 'mutual_agreement'
  | 'seller_favor'
  | 'buyer_favor';

export interface DisputeEvidence {
  id: string;
  type: 'image' | 'document' | 'message_screenshot' | 'tracking_info';
  url: string;
  description?: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface DisputeMessage {
  id: string;
  senderId: string;
  senderRole: 'buyer' | 'seller' | 'mediator' | 'system';
  content: string;
  attachments?: string[];
  createdAt: Date;
}

// Safety violation tracking
export interface SafetyViolation {
  id: string;
  userId: string;
  type: SafetyViolationType;
  severity: 'warning' | 'minor' | 'major' | 'critical';
  description: string;
  evidence?: string[];

  // Actions taken
  actionTaken: SafetyAction;

  createdAt: Date;
  expiresAt?: Date;  // Some violations expire
}

export type SafetyViolationType =
  | 'residential_meetup_attempt'     // Tried to arrange home meetup
  | 'shared_home_address'            // Shared residential address for meetup
  | 'requested_home_visit'           // Asked to visit buyer/seller home
  | 'circumvented_platform'          // Tried to avoid platform protections
  | 'harassment'
  | 'scam_attempt'
  | 'prohibited_item'
  | 'fake_listing';

export type SafetyAction =
  | 'warning_issued'
  | 'listing_removed'
  | 'selling_suspended_7d'
  | 'selling_suspended_30d'
  | 'selling_suspended_permanent'
  | 'account_suspended'
  | 'account_banned';

// Platform categories
export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  icon?: string;
  allowedProductTypes: ProductType[];
  platformFeePercent: number;
  isActive: boolean;
}

// Platform fee structure
export interface FeeStructure {
  baseTransactionFeePercent: number;      // 8%
  paymentProcessingFeePercent: number;    // 2.9%
  paymentProcessingFeeFixed: number;      // $0.30

  // Category-specific overrides
  categoryFees: Map<string, number>;

  // Seller tier discounts
  tierDiscounts: {
    trusted: number;    // 1% discount
    premium: number;    // 2% discount
  };
}

// Safety policy that users must accept
export interface SafetyPolicy {
  version: string;
  effectiveDate: Date;

  rules: SafetyRule[];

  acknowledgmentRequired: boolean;
  acknowledgmentText: string;
}

export interface SafetyRule {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';

  // Critical rules (violations = immediate action)
  isCritical: boolean;
}

// Default safety policy
export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  version: '1.0.0',
  effectiveDate: new Date('2024-01-01'),
  acknowledgmentRequired: true,
  acknowledgmentText:
    'I understand and agree that TextMesh Marketplace is DELIVERY-ONLY. ' +
    'I will NOT arrange or attempt to arrange in-person meetings at residential addresses. ' +
    'I will only use approved shipping methods or verified safe pickup locations. ' +
    'Violations may result in immediate account suspension.',

  rules: [
    {
      id: 'no-residential-meetups',
      title: 'No Residential Meetups',
      description:
        'Meeting at residential addresses (homes, apartments) for transactions is STRICTLY PROHIBITED. ' +
        'This protects both buyers and sellers from potential safety risks.',
      severity: 'critical',
      isCritical: true
    },
    {
      id: 'no-home-addresses-for-pickup',
      title: 'No Home Addresses for Pickup',
      description:
        'You may not use your home address as a pickup location. ' +
        'Use shipping, parcel lockers, or verified commercial locations only.',
      severity: 'critical',
      isCritical: true
    },
    {
      id: 'use-platform-payments',
      title: 'Use Platform Payments Only',
      description:
        'All payments must go through TextMesh escrow system. ' +
        'Do not accept or request off-platform payments.',
      severity: 'critical',
      isCritical: true
    },
    {
      id: 'report-unsafe-requests',
      title: 'Report Unsafe Requests',
      description:
        'If another user asks to meet at a residential location or circumvent safety measures, ' +
        'report them immediately. Do not engage.',
      severity: 'warning',
      isCritical: false
    },
    {
      id: 'shipping-addresses-protected',
      title: 'Shipping Addresses Are Protected',
      description:
        'Residential shipping addresses are used for delivery only. ' +
        'Sellers ship via carriers and never visit delivery addresses.',
      severity: 'info',
      isCritical: false
    }
  ]
};
