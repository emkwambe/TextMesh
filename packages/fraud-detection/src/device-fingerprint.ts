/**
 * Device Fingerprint Analysis
 *
 * Analyzes device fingerprints for:
 * - Device identification
 * - Bot detection
 * - Device trust scoring
 */

import { createLogger } from '@textmesh/logger';
import { v4 as uuidv4 } from 'uuid';
import { DeviceFingerprint, FraudSignal } from './types';

const logger = createLogger({ service: 'device-fingerprint', level: 'info' });

// Known bot user agent patterns
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python/i,
  /java\//i,
  /go-http/i,
  /headless/i,
  /phantom/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /node-fetch/i,
  /axios/i,
];

// Suspicious fingerprint indicators
const SUSPICIOUS_INDICATORS = {
  // Headless browser indicators
  headless: [
    'HeadlessChrome',
    'PhantomJS',
    'Selenium',
    'webdriver',
  ],
  // Automation tools
  automation: [
    'Puppeteer',
    'Playwright',
    'WebDriver',
  ],
  // Missing browser features that real browsers have
  missingFeatures: [
    'notification',
    'push',
    'plugins',
  ],
};

export interface DeviceAnalysis {
  fingerprintId: string;
  trustScore: number;
  isBot: boolean;
  isSuspicious: boolean;
  signals: FraudSignal[];
  reasons: string[];
}

export class DeviceFingerprintAnalyzer {
  private knownDevices: Map<string, {
    userId: string;
    lastSeen: Date;
    trustScore: number;
    occurrences: number;
  }> = new Map();

  private fingerprintHistory: Map<string, DeviceFingerprint[]> = new Map();

  /**
   * Analyze device fingerprint
   */
  analyze(fingerprint: Partial<DeviceFingerprint>, userId?: string): DeviceAnalysis {
    const signals: FraudSignal[] = [];
    const reasons: string[] = [];
    let trustScore = 100;

    // Generate fingerprint ID from components
    const fingerprintId = this.generateFingerprintId(fingerprint);

    // Check if device is known
    const knownDevice = this.knownDevices.get(fingerprintId);
    if (knownDevice) {
      if (userId && knownDevice.userId !== userId) {
        signals.push({
          type: 'device_user_mismatch',
          value: 0.8,
          weight: 0.3,
          details: { expectedUser: knownDevice.userId, actualUser: userId },
        });
        reasons.push('Device previously used by different user');
        trustScore -= 30;
      } else {
        // Known trusted device
        trustScore += Math.min(10, knownDevice.occurrences);
      }
    }

    // Check for bot patterns
    const botCheck = this.checkForBot(fingerprint);
    if (botCheck.isBot) {
      signals.push({
        type: 'bot_detected',
        value: 1,
        weight: 0.5,
        details: { patterns: botCheck.patterns },
      });
      reasons.push('Bot patterns detected');
      trustScore -= 50;
    }

    // Check for suspicious indicators
    const suspiciousCheck = this.checkSuspiciousIndicators(fingerprint);
    if (suspiciousCheck.isSuspicious) {
      signals.push({
        type: 'suspicious_fingerprint',
        value: 0.7,
        weight: 0.3,
        details: { indicators: suspiciousCheck.indicators },
      });
      reasons.push(...suspiciousCheck.reasons);
      trustScore -= 20;
    }

    // Check fingerprint consistency
    if (userId) {
      const consistencyCheck = this.checkConsistency(userId, fingerprint);
      if (!consistencyCheck.isConsistent) {
        signals.push({
          type: 'fingerprint_inconsistency',
          value: 0.6,
          weight: 0.2,
          details: consistencyCheck.changes,
        });
        reasons.push('Fingerprint changed unexpectedly');
        trustScore -= 15;
      }
    }

    // Check for missing expected features
    const featureCheck = this.checkExpectedFeatures(fingerprint);
    if (!featureCheck.pass) {
      signals.push({
        type: 'missing_features',
        value: 0.5,
        weight: 0.2,
        details: { missing: featureCheck.missing },
      });
      reasons.push('Missing expected browser features');
      trustScore -= 10;
    }

    // Normalize trust score
    trustScore = Math.max(0, Math.min(100, trustScore));

    // Update known devices
    if (userId && fingerprintId) {
      this.updateKnownDevice(fingerprintId, userId, trustScore);
    }

    // Store fingerprint history
    if (userId) {
      this.storeFingerprint(userId, fingerprint as DeviceFingerprint);
    }

    return {
      fingerprintId,
      trustScore,
      isBot: botCheck.isBot,
      isSuspicious: suspiciousCheck.isSuspicious || trustScore < 50,
      signals,
      reasons,
    };
  }

  /**
   * Generate unique fingerprint ID
   */
  private generateFingerprintId(fingerprint: Partial<DeviceFingerprint>): string {
    if (fingerprint.id) return fingerprint.id;

    // Create hash from key components
    const components = [
      fingerprint.userAgent,
      fingerprint.platform,
      fingerprint.language,
      fingerprint.timezone,
      fingerprint.screenResolution,
      fingerprint.colorDepth,
      fingerprint.canvas,
      fingerprint.webgl,
    ].filter(Boolean);

    if (components.length < 3) {
      return uuidv4(); // Not enough data for reliable fingerprint
    }

    // Simple hash function
    const hash = components.join('|');
    let hashValue = 0;
    for (let i = 0; i < hash.length; i++) {
      const char = hash.charCodeAt(i);
      hashValue = ((hashValue << 5) - hashValue) + char;
      hashValue = hashValue & hashValue;
    }

    return `fp_${Math.abs(hashValue).toString(36)}`;
  }

  /**
   * Check for bot patterns
   */
  private checkForBot(fingerprint: Partial<DeviceFingerprint>): {
    isBot: boolean;
    patterns: string[];
  } {
    const patterns: string[] = [];

    // Check user agent
    if (fingerprint.userAgent) {
      for (const pattern of BOT_PATTERNS) {
        if (pattern.test(fingerprint.userAgent)) {
          patterns.push(pattern.source);
        }
      }
    }

    // Check for headless indicators
    for (const indicator of SUSPICIOUS_INDICATORS.headless) {
      if (fingerprint.userAgent?.includes(indicator)) {
        patterns.push(`headless:${indicator}`);
      }
    }

    // Bots often have 0 plugins
    if (fingerprint.plugins && fingerprint.plugins.length === 0) {
      patterns.push('no_plugins');
    }

    // Bots often don't have fonts
    if (fingerprint.fonts && fingerprint.fonts.length === 0) {
      patterns.push('no_fonts');
    }

    // Hardware concurrency is often missing or 0 in bots
    if (fingerprint.hardwareConcurrency === 0) {
      patterns.push('no_hardware_concurrency');
    }

    return {
      isBot: patterns.length >= 2,
      patterns,
    };
  }

  /**
   * Check for suspicious indicators
   */
  private checkSuspiciousIndicators(fingerprint: Partial<DeviceFingerprint>): {
    isSuspicious: boolean;
    indicators: string[];
    reasons: string[];
  } {
    const indicators: string[] = [];
    const reasons: string[] = [];

    // Check for automation tools
    for (const tool of SUSPICIOUS_INDICATORS.automation) {
      if (fingerprint.userAgent?.includes(tool)) {
        indicators.push(tool);
        reasons.push(`Automation tool detected: ${tool}`);
      }
    }

    // Inconsistent platform and user agent
    if (fingerprint.platform && fingerprint.userAgent) {
      const platform = fingerprint.platform.toLowerCase();
      const ua = fingerprint.userAgent.toLowerCase();

      if (platform.includes('win') && !ua.includes('windows')) {
        indicators.push('platform_ua_mismatch');
        reasons.push('Platform does not match user agent');
      }
      if (platform.includes('mac') && !ua.includes('mac')) {
        indicators.push('platform_ua_mismatch');
        reasons.push('Platform does not match user agent');
      }
    }

    // Very high hardware concurrency (likely spoofed)
    if (fingerprint.hardwareConcurrency && fingerprint.hardwareConcurrency > 64) {
      indicators.push('unusual_hardware');
      reasons.push('Unusual hardware configuration');
    }

    // Very large device memory (likely spoofed)
    if (fingerprint.deviceMemory && fingerprint.deviceMemory > 256) {
      indicators.push('spoofed_memory');
      reasons.push('Spoofed device memory');
    }

    return {
      isSuspicious: indicators.length > 0,
      indicators,
      reasons,
    };
  }

  /**
   * Check fingerprint consistency with history
   */
  private checkConsistency(
    userId: string,
    fingerprint: Partial<DeviceFingerprint>
  ): {
    isConsistent: boolean;
    changes: Record<string, { old: unknown; new: unknown }>;
  } {
    const history = this.fingerprintHistory.get(userId);
    if (!history || history.length === 0) {
      return { isConsistent: true, changes: {} };
    }

    const lastFingerprint = history[history.length - 1];
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    // Check for significant changes
    const fieldsToCheck: (keyof DeviceFingerprint)[] = [
      'platform',
      'language',
      'timezone',
      'screenResolution',
      'colorDepth',
    ];

    for (const field of fieldsToCheck) {
      if (lastFingerprint[field] !== fingerprint[field] && fingerprint[field]) {
        changes[field] = {
          old: lastFingerprint[field],
          new: fingerprint[field],
        };
      }
    }

    // More than 2 changes is suspicious
    return {
      isConsistent: Object.keys(changes).length <= 2,
      changes,
    };
  }

  /**
   * Check for expected browser features
   */
  private checkExpectedFeatures(fingerprint: Partial<DeviceFingerprint>): {
    pass: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    // Real browsers have these features
    if (!fingerprint.cookiesEnabled) {
      missing.push('cookies');
    }

    // Real browsers support touch or have plugins
    if (!fingerprint.touchSupport && (!fingerprint.plugins || fingerprint.plugins.length === 0)) {
      missing.push('touch_or_plugins');
    }

    // Real browsers have canvas fingerprint
    if (!fingerprint.canvas) {
      missing.push('canvas');
    }

    return {
      pass: missing.length === 0,
      missing,
    };
  }

  /**
   * Update known device record
   */
  private updateKnownDevice(fingerprintId: string, userId: string, trustScore: number): void {
    const existing = this.knownDevices.get(fingerprintId);

    if (existing) {
      existing.lastSeen = new Date();
      existing.occurrences++;
      existing.trustScore = (existing.trustScore + trustScore) / 2;
    } else {
      this.knownDevices.set(fingerprintId, {
        userId,
        lastSeen: new Date(),
        trustScore,
        occurrences: 1,
      });
    }
  }

  /**
   * Store fingerprint in history
   */
  private storeFingerprint(userId: string, fingerprint: DeviceFingerprint): void {
    const history = this.fingerprintHistory.get(userId) || [];
    history.push(fingerprint);

    // Keep last 10 fingerprints
    if (history.length > 10) {
      history.shift();
    }

    this.fingerprintHistory.set(userId, history);
  }

  /**
   * Check if device is trusted for user
   */
  isTrustedDevice(fingerprintId: string, userId: string): boolean {
    const device = this.knownDevices.get(fingerprintId);
    return device?.userId === userId && device.trustScore > 70 && device.occurrences > 5;
  }

  /**
   * Get user's trusted devices
   */
  getTrustedDevices(userId: string): string[] {
    const trusted: string[] = [];

    for (const [fingerprintId, device] of this.knownDevices) {
      if (device.userId === userId && device.trustScore > 70) {
        trusted.push(fingerprintId);
      }
    }

    return trusted;
  }

  /**
   * Revoke device trust
   */
  revokeDeviceTrust(fingerprintId: string): void {
    this.knownDevices.delete(fingerprintId);
  }
}

export const deviceFingerprintAnalyzer = new DeviceFingerprintAnalyzer();
