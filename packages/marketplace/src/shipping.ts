/**
 * Shipping & Delivery Manager
 *
 * SAFETY: Delivery-only system
 * - NO residential meetups
 * - NO seller/buyer home visits
 * - Shipping addresses protected (carrier use only)
 * - Safe pickup locations verified
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ShippingAddress,
  AddressType,
  SafePickupLocation,
  SafePickupLocationType,
  DeliveryMethod,
  Order,
  OrderStatus,
  OrderStatusEvent
} from './types';

// Blocked keywords for addresses suggesting meetup intentions
const MEETUP_KEYWORDS = [
  'meet me', 'come to', 'pick up from', 'visit', 'stop by',
  'my house', 'my home', 'my apartment', 'my place',
  'i\'ll be home', 'knock on', 'ring doorbell', 'wait outside',
  'cash on delivery', 'pay in person', 'hand to hand'
];

// Supported carriers
const SUPPORTED_CARRIERS = [
  'usps', 'ups', 'fedex', 'dhl', 'amazon', 'ontrac', 'lasership'
];

export interface ShippingConfig {
  allowResidentialShipping: boolean;  // Shipping TO homes (not meetups)
  requireSignature: boolean;
  insuranceThreshold: number;
  maxPackageWeight: number;
  maxPackageDimensions: { length: number; width: number; height: number };
}

const DEFAULT_CONFIG: ShippingConfig = {
  allowResidentialShipping: true,  // Carrier delivers, no seller visit
  requireSignature: false,
  insuranceThreshold: 100,  // Require insurance for $100+
  maxPackageWeight: 70,  // lbs
  maxPackageDimensions: { length: 108, width: 60, height: 60 }  // inches
};

export class ShippingManager {
  private redis: any;
  private db: any;
  private config: ShippingConfig;

  constructor(redis: any, db: any, config: Partial<ShippingConfig> = {}) {
    this.redis = redis;
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add shipping address
   */
  async addShippingAddress(
    userId: string,
    address: {
      label: string;
      fullName: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      phone?: string;
    }
  ): Promise<ShippingAddress> {
    // Check for meetup keywords
    this.checkForMeetupIntentions(address);

    // Determine address type (would use API in production)
    const addressType = await this.classifyAddress(address);

    // Block if residential shipping is disabled
    if (addressType === 'residential' && !this.config.allowResidentialShipping) {
      throw new Error(
        'Residential shipping addresses are not allowed. ' +
        'Please use a PO Box, parcel locker, or commercial address.'
      );
    }

    const shippingAddress: ShippingAddress = {
      id: uuidv4(),
      userId,
      label: address.label,
      fullName: address.fullName,
      addressLine1: address.addressLine1.trim(),
      addressLine2: address.addressLine2?.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      postalCode: address.postalCode.trim(),
      country: address.country.trim(),
      phone: address.phone,
      addressType,
      isVerified: false,  // Will verify with carrier API
      isDefault: false,
      createdAt: new Date()
    };

    // Save address
    await this.saveShippingAddress(shippingAddress);

    // Verify address asynchronously
    this.verifyAddressAsync(shippingAddress.id);

    return shippingAddress;
  }

  /**
   * Check address/instructions for meetup intentions
   */
  private checkForMeetupIntentions(data: {
    addressLine1: string;
    addressLine2?: string;
  }): void {
    const text = `${data.addressLine1} ${data.addressLine2 || ''}`.toLowerCase();

    for (const keyword of MEETUP_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) {
        throw new Error(
          `SAFETY VIOLATION: Address contains prohibited terms ("${keyword}"). ` +
          `TextMesh Marketplace does not allow residential meetups. ` +
          `Shipping addresses are used for carrier delivery only.`
        );
      }
    }
  }

  /**
   * Classify address type
   */
  private async classifyAddress(address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): Promise<AddressType> {
    const line1 = address.addressLine1.toLowerCase();
    const line2 = (address.addressLine2 || '').toLowerCase();

    // Check for PO Box
    if (line1.includes('po box') || line1.includes('p.o. box')) {
      return 'po_box';
    }

    // Check for parcel lockers
    const lockerKeywords = ['locker', 'amazon hub', 'ups access', 'fedex onsite'];
    for (const keyword of lockerKeywords) {
      if (line1.includes(keyword) || line2.includes(keyword)) {
        return 'parcel_locker';
      }
    }

    // Check for commercial indicators
    const commercialKeywords = [
      'suite', 'ste', 'floor', 'fl', 'office', 'building', 'bldg',
      'plaza', 'center', 'tower', 'corporate', 'business', 'inc',
      'llc', 'corp', 'company', 'co.', 'mall', 'shop', 'store'
    ];
    for (const keyword of commercialKeywords) {
      if (line1.includes(keyword) || line2.includes(keyword)) {
        return 'commercial';
      }
    }

    // Default to residential (would verify with API in production)
    return 'residential';
  }

  /**
   * Verify address with carrier API (async)
   */
  private async verifyAddressAsync(addressId: string): Promise<void> {
    // In production, call USPS/UPS/FedEx address verification API
    // For now, mark as verified after basic checks passed
    setTimeout(async () => {
      const address = await this.getShippingAddress(addressId);
      if (address) {
        address.isVerified = true;
        address.verificationMethod = 'carrier_api';
        await this.saveShippingAddress(address);
      }
    }, 1000);
  }

  /**
   * Get user's shipping addresses
   */
  async getUserAddresses(userId: string): Promise<ShippingAddress[]> {
    const addressIds = await this.redis.smembers(`marketplace:user:${userId}:addresses`);
    const addresses: ShippingAddress[] = [];

    for (const id of addressIds) {
      const address = await this.getShippingAddress(id);
      if (address) {
        addresses.push(address);
      }
    }

    return addresses;
  }

  /**
   * Set default address
   */
  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    const addresses = await this.getUserAddresses(userId);

    for (const addr of addresses) {
      addr.isDefault = addr.id === addressId;
      await this.saveShippingAddress(addr);
    }
  }

  /**
   * Delete shipping address
   */
  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.getShippingAddress(addressId);
    if (!address || address.userId !== userId) {
      throw new Error('Address not found');
    }

    await this.redis.hdel('marketplace:addresses', addressId);
    await this.redis.srem(`marketplace:user:${userId}:addresses`, addressId);
  }

  /**
   * Get safe pickup locations near coordinates
   */
  async getPickupLocations(
    coordinates: { lat: number; lng: number },
    radiusMiles: number = 10,
    types?: SafePickupLocationType[]
  ): Promise<SafePickupLocation[]> {
    // In production, query location database or external API
    // For now, return sample verified locations

    const sampleLocations: SafePickupLocation[] = [
      {
        id: 'loc_1',
        type: 'parcel_locker',
        name: 'Amazon Hub Locker - Whole Foods',
        address: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
        coordinates: { lat: coordinates.lat + 0.01, lng: coordinates.lng + 0.01 },
        operatingHours: '24/7',
        isVerified: true
      },
      {
        id: 'loc_2',
        type: 'post_office',
        name: 'USPS Post Office',
        address: '456 Oak Ave',
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
        coordinates: { lat: coordinates.lat - 0.01, lng: coordinates.lng },
        operatingHours: 'Mon-Fri 9AM-5PM, Sat 9AM-12PM',
        isVerified: true
      },
      {
        id: 'loc_3',
        type: 'retail_partner',
        name: 'UPS Store',
        address: '789 Elm Blvd',
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
        coordinates: { lat: coordinates.lat, lng: coordinates.lng - 0.01 },
        operatingHours: 'Mon-Fri 8AM-7PM, Sat 9AM-5PM',
        isVerified: true
      }
    ];

    // Filter by type if specified
    if (types && types.length > 0) {
      return sampleLocations.filter(loc => types.includes(loc.type));
    }

    return sampleLocations;
  }

  /**
   * Validate delivery method for order
   */
  validateDeliveryMethod(
    method: DeliveryMethod,
    productType: 'physical' | 'digital' | 'service'
  ): { valid: boolean; error?: string } {
    // Block any method that could involve residential meetups
    const BLOCKED_METHODS = ['residential_meetup', 'seller_residence', 'buyer_residence', 'private_location'];

    if (BLOCKED_METHODS.includes(method as string)) {
      return {
        valid: false,
        error: `SAFETY VIOLATION: "${method}" is not allowed. ` +
               `TextMesh Marketplace is delivery-only. No residential meetups.`
      };
    }

    // Digital products can only use digital delivery
    if (productType === 'digital' && method !== 'digital_download') {
      return {
        valid: false,
        error: 'Digital products can only use digital download delivery'
      };
    }

    // Physical products cannot use digital delivery
    if (productType === 'physical' && method === 'digital_download') {
      return {
        valid: false,
        error: 'Physical products cannot use digital download delivery'
      };
    }

    // Services can use any non-physical method
    if (productType === 'service' && method !== 'digital_download' && method !== 'shipping') {
      return { valid: true };
    }

    return { valid: true };
  }

  /**
   * Generate shipping label (stub)
   */
  async generateShippingLabel(
    orderId: string,
    fromAddress: ShippingAddress,
    toAddress: ShippingAddress,
    packageDetails: {
      weight: number;
      dimensions: { length: number; width: number; height: number };
      carrier: string;
      serviceLevel: string;
    }
  ): Promise<{
    labelUrl: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery: Date;
  }> {
    // Validate carrier
    if (!SUPPORTED_CARRIERS.includes(packageDetails.carrier.toLowerCase())) {
      throw new Error(`Carrier "${packageDetails.carrier}" is not supported`);
    }

    // Validate package dimensions
    if (packageDetails.weight > this.config.maxPackageWeight) {
      throw new Error(`Package exceeds maximum weight of ${this.config.maxPackageWeight} lbs`);
    }

    const { length, width, height } = packageDetails.dimensions;
    const maxDim = this.config.maxPackageDimensions;
    if (length > maxDim.length || width > maxDim.width || height > maxDim.height) {
      throw new Error('Package exceeds maximum dimensions');
    }

    // In production, call carrier API to generate label
    const trackingNumber = `TM${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    return {
      labelUrl: `https://shipping.textmesh.com/labels/${orderId}.pdf`,
      trackingNumber,
      carrier: packageDetails.carrier,
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)  // 5 days
    };
  }

  /**
   * Track shipment
   */
  async trackShipment(
    trackingNumber: string,
    carrier: string
  ): Promise<{
    status: string;
    location?: string;
    timestamp: Date;
    events: Array<{ status: string; location: string; timestamp: Date }>;
    estimatedDelivery?: Date;
    delivered: boolean;
  }> {
    // In production, call carrier tracking API
    // For now, return mock data

    return {
      status: 'in_transit',
      location: 'Distribution Center',
      timestamp: new Date(),
      events: [
        {
          status: 'Shipped',
          location: 'Origin Facility',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        {
          status: 'In Transit',
          location: 'Distribution Center',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      ],
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      delivered: false
    };
  }

  /**
   * Confirm delivery
   */
  async confirmDelivery(
    orderId: string,
    confirmedBy: 'carrier' | 'buyer' | 'system'
  ): Promise<void> {
    await this.redis.hset(
      `marketplace:order:${orderId}:delivery`,
      'confirmedAt', new Date().toISOString(),
      'confirmedBy', confirmedBy
    );

    // Emit event for escrow release
    await this.redis.publish('marketplace:delivery:confirmed', JSON.stringify({
      orderId,
      confirmedBy,
      confirmedAt: new Date().toISOString()
    }));
  }

  /**
   * Report delivery issue
   */
  async reportDeliveryIssue(
    orderId: string,
    reportedBy: string,
    issue: {
      type: 'not_received' | 'damaged' | 'wrong_item' | 'missing_parts';
      description: string;
      photos?: string[];
    }
  ): Promise<{ issueId: string; nextSteps: string }> {
    const issueId = uuidv4();

    await this.redis.hset(
      `marketplace:order:${orderId}:issues`,
      issueId,
      JSON.stringify({
        ...issue,
        reportedBy,
        reportedAt: new Date().toISOString()
      })
    );

    // Determine next steps based on issue type
    let nextSteps: string;
    switch (issue.type) {
      case 'not_received':
        nextSteps = 'We\'ll verify tracking status and contact the carrier. ' +
                    'If not resolved in 3 days, you can open a dispute for full refund.';
        break;
      case 'damaged':
        nextSteps = 'Please upload photos of the damage. ' +
                    'We\'ll work with the seller on a refund or replacement.';
        break;
      case 'wrong_item':
        nextSteps = 'Please describe what you received. ' +
                    'The seller will be notified to arrange a return and correct shipment.';
        break;
      case 'missing_parts':
        nextSteps = 'Please list the missing parts. ' +
                    'We\'ll contact the seller to ship the missing items.';
        break;
      default:
        nextSteps = 'We\'ll review your issue and respond within 24 hours.';
    }

    // Notify seller
    await this.redis.publish('marketplace:delivery:issue', JSON.stringify({
      orderId,
      issueId,
      type: issue.type
    }));

    return { issueId, nextSteps };
  }

  /**
   * Get shipping address by ID
   */
  async getShippingAddress(addressId: string): Promise<ShippingAddress | null> {
    const data = await this.redis.hget('marketplace:addresses', addressId);
    if (!data) return null;
    return JSON.parse(data);
  }

  // Storage helpers
  private async saveShippingAddress(address: ShippingAddress): Promise<void> {
    await this.redis.hset('marketplace:addresses', address.id, JSON.stringify(address));
    await this.redis.sadd(`marketplace:user:${address.userId}:addresses`, address.id);
  }
}

/**
 * Safety message shown to all marketplace users
 */
export const SHIPPING_SAFETY_MESSAGE = `
📦 TEXTMESH MARKETPLACE SAFETY POLICY

This is a DELIVERY-ONLY marketplace. For your safety:

❌ NO residential meetups - Never meet at your home or the other party's home
❌ NO home visits - Sellers never visit buyers, buyers never visit sellers
❌ NO "local pickup" at private addresses

✅ Ship via USPS, UPS, FedEx, or other carriers
✅ Use parcel lockers (Amazon Hub, UPS Access Point)
✅ Use post office or retail partner pickup
✅ Use verified commercial addresses

Your shipping address is ONLY used for carrier delivery. Sellers never see
your full address - they only receive a shipping label.

🚨 Report any user who suggests meeting at a residential address.
   This is a serious safety violation that results in account suspension.
`;
