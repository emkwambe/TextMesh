/**
 * Geo Location Analysis
 *
 * Analyzes geographic information for fraud detection:
 * - IP geolocation
 * - Impossible travel detection
 * - VPN/Proxy/Tor detection
 * - Location anomaly detection
 */

import { createLogger } from '@textmesh/logger';
import geoip from 'geoip-lite';
import { GeoLocation, FraudSignal } from './types';

const logger = createLogger({ service: 'geo-analyzer', level: 'info' });

// High-risk countries (for demonstration - would be configurable)
const HIGH_RISK_COUNTRIES = new Set([
  'NG', 'RU', 'CN', 'KP', 'IR', 'VN', 'RO', 'UA', 'PH', 'IN',
]);

// Known VPN/Proxy/Datacenter ASNs (sample list)
const DATACENTER_ASNS = new Set([
  'AS14061', // DigitalOcean
  'AS16509', // Amazon
  'AS15169', // Google
  'AS13335', // Cloudflare
  'AS20473', // Vultr
  'AS63949', // Linode
  'AS14618', // Amazon
  'AS16276', // OVH
  'AS24940', // Hetzner
  'AS60781', // LeaseWeb
]);

// Average speed in km/h for travel
const AVERAGE_TRAVEL_SPEED = {
  walking: 5,
  driving: 80,
  train: 150,
  flight: 800,
  maxRealistic: 1000, // Max realistic speed including airport time
};

export interface GeoAnalysis {
  location: GeoLocation | null;
  riskScore: number;
  signals: FraudSignal[];
  reasons: string[];
  impossibleTravel: boolean;
  isHighRiskCountry: boolean;
  isProxy: boolean;
}

export interface LocationHistory {
  timestamp: Date;
  ip: string;
  location: GeoLocation;
}

export class GeoAnalyzer {
  private userLocationHistory: Map<string, LocationHistory[]> = new Map();
  private proxyIPs: Set<string> = new Set();

  /**
   * Analyze IP geolocation
   */
  analyze(ip: string, userId?: string): GeoAnalysis {
    const signals: FraudSignal[] = [];
    const reasons: string[] = [];
    let riskScore = 0;
    let impossibleTravel = false;
    let isProxy = false;

    // Get geolocation
    const location = this.getGeoLocation(ip);

    if (!location) {
      signals.push({
        type: 'unknown_location',
        value: 0.3,
        weight: 0.2,
      });
      reasons.push('Unable to determine location');
      riskScore += 10;

      return {
        location: null,
        riskScore,
        signals,
        reasons,
        impossibleTravel: false,
        isHighRiskCountry: false,
        isProxy: false,
      };
    }

    // Check for high-risk country
    if (HIGH_RISK_COUNTRIES.has(location.countryCode)) {
      signals.push({
        type: 'high_risk_country',
        value: 0.6,
        weight: 0.3,
        details: { country: location.country, code: location.countryCode },
      });
      reasons.push(`High-risk country: ${location.country}`);
      riskScore += 25;
    }

    // Check for VPN/Proxy/Tor
    if (location.isVPN || location.isProxy || location.isTor) {
      isProxy = true;
      signals.push({
        type: 'proxy_detected',
        value: 0.7,
        weight: 0.4,
        details: { isVPN: location.isVPN, isProxy: location.isProxy, isTor: location.isTor },
      });
      reasons.push('VPN, Proxy, or Tor detected');
      riskScore += 30;
    }

    // Check for datacenter IP
    if (location.isDataCenter || this.isDatacenterASN(location.asn)) {
      signals.push({
        type: 'datacenter_ip',
        value: 0.5,
        weight: 0.3,
        details: { asn: location.asn, isp: location.isp },
      });
      reasons.push('Datacenter IP detected');
      riskScore += 20;
    }

    // Check for known proxy IP
    if (this.proxyIPs.has(ip)) {
      isProxy = true;
      signals.push({
        type: 'known_proxy',
        value: 0.8,
        weight: 0.4,
      });
      reasons.push('Known proxy IP');
      riskScore += 35;
    }

    // Check for impossible travel
    if (userId) {
      const travelCheck = this.checkImpossibleTravel(userId, location);
      if (travelCheck.impossible) {
        impossibleTravel = true;
        signals.push({
          type: 'impossible_travel',
          value: 1,
          weight: 0.5,
          details: {
            from: travelCheck.previousLocation,
            to: location,
            distance: travelCheck.distance,
            timeElapsed: travelCheck.timeElapsed,
            requiredSpeed: travelCheck.requiredSpeed,
          },
        });
        reasons.push(
          `Impossible travel: ${travelCheck.distance}km in ${Math.round(travelCheck.timeElapsed / 60000)}min`
        );
        riskScore += 40;
      }

      // Store location history
      this.storeLocation(userId, ip, location);
    }

    // Normalize risk score
    riskScore = Math.min(100, riskScore);

    return {
      location,
      riskScore,
      signals,
      reasons,
      impossibleTravel,
      isHighRiskCountry: HIGH_RISK_COUNTRIES.has(location.countryCode),
      isProxy,
    };
  }

  /**
   * Get geolocation from IP
   */
  private getGeoLocation(ip: string): GeoLocation | null {
    try {
      const geo = geoip.lookup(ip);

      if (!geo) {
        return null;
      }

      return {
        ip,
        country: geo.country || 'Unknown',
        countryCode: geo.country || 'XX',
        region: geo.region || '',
        city: geo.city || '',
        latitude: geo.ll?.[0] || 0,
        longitude: geo.ll?.[1] || 0,
        timezone: geo.timezone || '',
        isp: '',
        asn: '',
        isVPN: false,
        isProxy: false,
        isTor: false,
        isDataCenter: false,
      };
    } catch (error) {
      logger.error('GeoIP lookup failed', { ip, error });
      return null;
    }
  }

  /**
   * Check for impossible travel
   */
  private checkImpossibleTravel(
    userId: string,
    currentLocation: GeoLocation
  ): {
    impossible: boolean;
    previousLocation?: GeoLocation;
    distance?: number;
    timeElapsed?: number;
    requiredSpeed?: number;
  } {
    const history = this.userLocationHistory.get(userId);

    if (!history || history.length === 0) {
      return { impossible: false };
    }

    const lastLocation = history[history.length - 1];
    const timeElapsed = Date.now() - lastLocation.timestamp.getTime();

    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      lastLocation.location.latitude,
      lastLocation.location.longitude,
      currentLocation.latitude,
      currentLocation.longitude
    );

    // Calculate required speed in km/h
    const hoursElapsed = timeElapsed / (1000 * 60 * 60);
    const requiredSpeed = distance / hoursElapsed;

    // If required speed exceeds maximum realistic travel speed
    if (requiredSpeed > AVERAGE_TRAVEL_SPEED.maxRealistic) {
      return {
        impossible: true,
        previousLocation: lastLocation.location,
        distance: Math.round(distance),
        timeElapsed,
        requiredSpeed: Math.round(requiredSpeed),
      };
    }

    return { impossible: false };
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Check if ASN belongs to a datacenter
   */
  private isDatacenterASN(asn: string): boolean {
    return DATACENTER_ASNS.has(asn);
  }

  /**
   * Store location in history
   */
  private storeLocation(userId: string, ip: string, location: GeoLocation): void {
    const history = this.userLocationHistory.get(userId) || [];

    history.push({
      timestamp: new Date(),
      ip,
      location,
    });

    // Keep last 20 locations
    if (history.length > 20) {
      history.shift();
    }

    this.userLocationHistory.set(userId, history);
  }

  /**
   * Get user's typical locations
   */
  getTypicalLocations(userId: string): {
    countries: string[];
    cities: string[];
  } {
    const history = this.userLocationHistory.get(userId) || [];

    const countries = new Set<string>();
    const cities = new Set<string>();

    for (const entry of history) {
      countries.add(entry.location.countryCode);
      if (entry.location.city) {
        cities.add(entry.location.city);
      }
    }

    return {
      countries: Array.from(countries),
      cities: Array.from(cities),
    };
  }

  /**
   * Check if location is typical for user
   */
  isTypicalLocation(userId: string, countryCode: string): boolean {
    const typical = this.getTypicalLocations(userId);
    return typical.countries.includes(countryCode);
  }

  /**
   * Add known proxy IP
   */
  addProxyIP(ip: string): void {
    this.proxyIPs.add(ip);
  }

  /**
   * Clear user location history
   */
  clearHistory(userId: string): void {
    this.userLocationHistory.delete(userId);
  }
}

export const geoAnalyzer = new GeoAnalyzer();
