/**
 * Product Listings Manager
 *
 * Handles product listing creation, updates, and queries
 * with safety-first delivery options
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ProductListing,
  ProductType,
  ProductStatus,
  ListingVisibility,
  DeliveryOption,
  DeliveryMethod,
  ProductCategory
} from './types';

// Blocked terms that suggest residential meetups
const BLOCKED_TERMS = [
  'meet at my place',
  'come to my house',
  'pick up from my home',
  'pickup at my apartment',
  'meet at your place',
  'come to your house',
  'deliver to your door personally',
  'hand delivery',
  'in person meetup',
  'meet in person',
  'local pickup at home',
  'cash on meetup',
  'meet halfway',
  'home address pickup'
];

export interface ListingConfig {
  maxImagesPerListing: number;
  maxTitleLength: number;
  maxDescriptionLength: number;
  minPrice: number;
  maxPrice: number;
  listingDurationDays: number;
  allowedCategories: ProductCategory[];
}

const DEFAULT_CONFIG: ListingConfig = {
  maxImagesPerListing: 10,
  maxTitleLength: 150,
  maxDescriptionLength: 5000,
  minPrice: 1,
  maxPrice: 50000,
  listingDurationDays: 30,
  allowedCategories: []
};

export class ListingsManager {
  private redis: any;
  private db: any;
  private config: ListingConfig;

  constructor(redis: any, db: any, config: Partial<ListingConfig> = {}) {
    this.redis = redis;
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new product listing
   */
  async createListing(
    sellerId: string,
    data: {
      title: string;
      description: string;
      type: ProductType;
      category: string;
      subcategory?: string;
      price: number;
      currency?: string;
      quantity: number;
      images: string[];
      tags?: string[];
      visibility?: ListingVisibility;
      deliveryOptions: DeliveryOption[];
      digitalAsset?: ProductListing['digitalAsset'];
      serviceDetails?: ProductListing['serviceDetails'];
    }
  ): Promise<ProductListing> {
    // Validate listing content for safety
    this.validateListingContent(data.title, data.description);

    // Validate delivery options (no residential meetups)
    this.validateDeliveryOptions(data.deliveryOptions, data.type);

    // Validate basic fields
    if (data.title.length > this.config.maxTitleLength) {
      throw new Error(`Title exceeds ${this.config.maxTitleLength} characters`);
    }
    if (data.description.length > this.config.maxDescriptionLength) {
      throw new Error(`Description exceeds ${this.config.maxDescriptionLength} characters`);
    }
    if (data.price < this.config.minPrice || data.price > this.config.maxPrice) {
      throw new Error(`Price must be between ${this.config.minPrice} and ${this.config.maxPrice}`);
    }
    if (data.images.length > this.config.maxImagesPerListing) {
      throw new Error(`Maximum ${this.config.maxImagesPerListing} images allowed`);
    }
    if (data.quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    // Digital products must have asset info
    if (data.type === 'digital' && !data.digitalAsset) {
      throw new Error('Digital products require asset information');
    }

    // Services must have details
    if (data.type === 'service' && !data.serviceDetails) {
      throw new Error('Services require service details');
    }

    const now = new Date();
    const listing: ProductListing = {
      id: uuidv4(),
      sellerId,
      title: data.title.trim(),
      description: data.description.trim(),
      type: data.type,
      category: data.category,
      subcategory: data.subcategory,
      price: data.price,
      currency: data.currency || 'USD',
      quantity: data.quantity,
      quantitySold: 0,
      images: data.images,
      tags: data.tags || [],
      status: 'draft',
      visibility: data.visibility || 'public',
      deliveryOptions: data.deliveryOptions,
      digitalAsset: data.digitalAsset,
      serviceDetails: data.serviceDetails,
      views: 0,
      favorites: 0,
      rating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + this.config.listingDurationDays * 24 * 60 * 60 * 1000)
    };

    // Store listing
    await this.saveListing(listing);

    // Index for search
    await this.indexListing(listing);

    return listing;
  }

  /**
   * Validate listing content for safety policy violations
   */
  private validateListingContent(title: string, description: string): void {
    const content = `${title} ${description}`.toLowerCase();

    for (const term of BLOCKED_TERMS) {
      if (content.includes(term.toLowerCase())) {
        throw new Error(
          `SAFETY VIOLATION: Listing contains prohibited terms suggesting residential meetups. ` +
          `TextMesh Marketplace is delivery-only. Please remove references to in-person meetings.`
        );
      }
    }
  }

  /**
   * Validate delivery options - NO RESIDENTIAL MEETUPS
   */
  private validateDeliveryOptions(options: DeliveryOption[], productType: ProductType): void {
    if (!options || options.length === 0) {
      throw new Error('At least one delivery option is required');
    }

    const ALLOWED_METHODS: DeliveryMethod[] = [
      'shipping',
      'pickup_locker',
      'pickup_store',
      'pickup_postoffice',
      'digital_download'
    ];

    for (const option of options) {
      // Check method is allowed
      if (!ALLOWED_METHODS.includes(option.method)) {
        throw new Error(
          `SAFETY VIOLATION: Delivery method "${option.method}" is not allowed. ` +
          `Only shipping and safe pickup locations are permitted.`
        );
      }

      // Digital products can only use digital delivery
      if (productType === 'digital' && option.method !== 'digital_download') {
        throw new Error('Digital products can only use digital download delivery');
      }

      // Physical products cannot use digital delivery
      if (productType === 'physical' && option.method === 'digital_download') {
        throw new Error('Physical products cannot use digital download delivery');
      }

      // Validate pickup location types
      if (option.method.startsWith('pickup_') && option.pickupLocationTypes) {
        const BLOCKED_LOCATIONS = ['residential', 'home', 'private', 'apartment'];
        for (const locType of option.pickupLocationTypes) {
          if (BLOCKED_LOCATIONS.some(blocked => locType.toLowerCase().includes(blocked))) {
            throw new Error(
              `SAFETY VIOLATION: Pickup at "${locType}" is not allowed. ` +
              `Only commercial and public pickup locations are permitted.`
            );
          }
        }
      }
    }
  }

  /**
   * Publish a draft listing
   */
  async publishListing(listingId: string, sellerId: string): Promise<ProductListing> {
    const listing = await this.getListing(listingId);

    if (!listing) {
      throw new Error('Listing not found');
    }
    if (listing.sellerId !== sellerId) {
      throw new Error('Not authorized to publish this listing');
    }
    if (listing.status !== 'draft') {
      throw new Error('Only draft listings can be published');
    }

    // Re-validate before publishing
    this.validateListingContent(listing.title, listing.description);
    this.validateDeliveryOptions(listing.deliveryOptions, listing.type);

    listing.status = 'active';
    listing.updatedAt = new Date();

    await this.saveListing(listing);
    await this.indexListing(listing);

    return listing;
  }

  /**
   * Update listing
   */
  async updateListing(
    listingId: string,
    sellerId: string,
    updates: Partial<Pick<ProductListing,
      'title' | 'description' | 'price' | 'quantity' | 'images' | 'tags' | 'visibility' | 'deliveryOptions'
    >>
  ): Promise<ProductListing> {
    const listing = await this.getListing(listingId);

    if (!listing) {
      throw new Error('Listing not found');
    }
    if (listing.sellerId !== sellerId) {
      throw new Error('Not authorized to update this listing');
    }
    if (listing.status === 'sold' || listing.status === 'deleted') {
      throw new Error('Cannot update sold or deleted listings');
    }

    // Validate new content if provided
    const newTitle = updates.title || listing.title;
    const newDescription = updates.description || listing.description;
    this.validateListingContent(newTitle, newDescription);

    // Validate new delivery options if provided
    if (updates.deliveryOptions) {
      this.validateDeliveryOptions(updates.deliveryOptions, listing.type);
    }

    // Apply updates
    Object.assign(listing, updates, { updatedAt: new Date() });

    await this.saveListing(listing);
    await this.indexListing(listing);

    return listing;
  }

  /**
   * Deactivate listing
   */
  async deactivateListing(listingId: string, sellerId: string): Promise<void> {
    const listing = await this.getListing(listingId);

    if (!listing) {
      throw new Error('Listing not found');
    }
    if (listing.sellerId !== sellerId) {
      throw new Error('Not authorized to deactivate this listing');
    }

    listing.status = 'deleted';
    listing.updatedAt = new Date();

    await this.saveListing(listing);
    await this.removeFromIndex(listingId);
  }

  /**
   * Get listing by ID
   */
  async getListing(listingId: string): Promise<ProductListing | null> {
    const data = await this.redis.hget('marketplace:listings', listingId);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get seller's listings
   */
  async getSellerListings(
    sellerId: string,
    options: { status?: ProductStatus; limit?: number; offset?: number } = {}
  ): Promise<{ listings: ProductListing[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    const listingIds = await this.redis.smembers(`marketplace:seller:${sellerId}:listings`);

    let listings: ProductListing[] = [];
    for (const id of listingIds) {
      const listing = await this.getListing(id);
      if (listing && (!status || listing.status === status)) {
        listings.push(listing);
      }
    }

    // Sort by newest first
    listings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = listings.length;
    listings = listings.slice(offset, offset + limit);

    return { listings, total };
  }

  /**
   * Search listings
   */
  async searchListings(
    query: string,
    options: {
      category?: string;
      type?: ProductType;
      minPrice?: number;
      maxPrice?: number;
      deliveryMethod?: DeliveryMethod;
      sortBy?: 'relevance' | 'price_low' | 'price_high' | 'newest' | 'rating';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ listings: ProductListing[]; total: number }> {
    const { limit = 20, offset = 0, sortBy = 'relevance' } = options;

    // Get all active listing IDs from search index
    const allIds = await this.redis.smembers('marketplace:listings:active');

    let listings: ProductListing[] = [];
    for (const id of allIds) {
      const listing = await this.getListing(id);
      if (!listing || listing.status !== 'active') continue;

      // Apply filters
      if (options.category && listing.category !== options.category) continue;
      if (options.type && listing.type !== options.type) continue;
      if (options.minPrice && listing.price < options.minPrice) continue;
      if (options.maxPrice && listing.price > options.maxPrice) continue;
      if (options.deliveryMethod &&
          !listing.deliveryOptions.some(d => d.method === options.deliveryMethod)) continue;

      // Text search (simple contains for now)
      if (query) {
        const searchContent = `${listing.title} ${listing.description} ${listing.tags.join(' ')}`.toLowerCase();
        if (!searchContent.includes(query.toLowerCase())) continue;
      }

      listings.push(listing);
    }

    // Sort
    switch (sortBy) {
      case 'price_low':
        listings.sort((a, b) => a.price - b.price);
        break;
      case 'price_high':
        listings.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        listings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'rating':
        listings.sort((a, b) => b.rating - a.rating);
        break;
      // relevance - keep original order for now
    }

    const total = listings.length;
    listings = listings.slice(offset, offset + limit);

    return { listings, total };
  }

  /**
   * Increment view count
   */
  async incrementViews(listingId: string, viewerId?: string): Promise<void> {
    // Dedupe views by viewer
    if (viewerId) {
      const viewKey = `marketplace:listing:${listingId}:viewers`;
      const alreadyViewed = await this.redis.sismember(viewKey, viewerId);
      if (alreadyViewed) return;
      await this.redis.sadd(viewKey, viewerId);
      // Expire viewer set after 24 hours
      await this.redis.expire(viewKey, 86400);
    }

    await this.redis.hincrby('marketplace:listing:views', listingId, 1);

    const listing = await this.getListing(listingId);
    if (listing) {
      listing.views++;
      await this.saveListing(listing);
    }
  }

  /**
   * Toggle favorite
   */
  async toggleFavorite(listingId: string, userId: string): Promise<boolean> {
    const favKey = `marketplace:user:${userId}:favorites`;
    const isFavorited = await this.redis.sismember(favKey, listingId);

    if (isFavorited) {
      await this.redis.srem(favKey, listingId);
      await this.redis.hincrby('marketplace:listing:favorites', listingId, -1);
    } else {
      await this.redis.sadd(favKey, listingId);
      await this.redis.hincrby('marketplace:listing:favorites', listingId, 1);
    }

    // Update listing
    const listing = await this.getListing(listingId);
    if (listing) {
      listing.favorites += isFavorited ? -1 : 1;
      await this.saveListing(listing);
    }

    return !isFavorited;
  }

  /**
   * Get user's favorites
   */
  async getUserFavorites(userId: string): Promise<ProductListing[]> {
    const listingIds = await this.redis.smembers(`marketplace:user:${userId}:favorites`);
    const listings: ProductListing[] = [];

    for (const id of listingIds) {
      const listing = await this.getListing(id);
      if (listing && listing.status === 'active') {
        listings.push(listing);
      }
    }

    return listings;
  }

  // Storage helpers
  private async saveListing(listing: ProductListing): Promise<void> {
    await this.redis.hset('marketplace:listings', listing.id, JSON.stringify(listing));
    await this.redis.sadd(`marketplace:seller:${listing.sellerId}:listings`, listing.id);
  }

  private async indexListing(listing: ProductListing): Promise<void> {
    if (listing.status === 'active') {
      await this.redis.sadd('marketplace:listings:active', listing.id);
      await this.redis.sadd(`marketplace:category:${listing.category}`, listing.id);
      await this.redis.sadd(`marketplace:type:${listing.type}`, listing.id);
    } else {
      await this.removeFromIndex(listing.id);
    }
  }

  private async removeFromIndex(listingId: string): Promise<void> {
    await this.redis.srem('marketplace:listings:active', listingId);
    // Note: Would need listing info to remove from category/type indexes
  }
}
