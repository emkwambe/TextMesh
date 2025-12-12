/**
 * @textmesh/marketplace
 *
 * SAFETY-FIRST MARKETPLACE
 * ========================
 * TextMesh Marketplace is DELIVERY-ONLY.
 *
 * ❌ NO residential meetups
 * ❌ NO buyer/seller home visits
 * ❌ NO "local pickup" at private addresses
 *
 * ✅ Ship via carriers (USPS, UPS, FedEx)
 * ✅ Use parcel lockers
 * ✅ Use verified commercial pickup points
 *
 * All transactions protected by escrow.
 */

export {
  MarketplaceService,
  ListingsManager,
  OrderManager,
  EscrowManager,
  SellerVerificationManager,
  ShippingManager,
  DisputeManager,
  SHIPPING_SAFETY_MESSAGE
} from './marketplace-service';

export * from './types';
export { ListingConfig } from './listings';
export { OrderConfig } from './orders';
export { ShippingConfig } from './shipping';
