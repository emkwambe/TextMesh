/**
 * PII Detector
 *
 * Detects Personally Identifiable Information:
 * - Email addresses
 * - Phone numbers
 * - Social Security Numbers
 * - Credit card numbers
 * - Physical addresses
 * - IP addresses
 * - Names (with NER)
 */

import { createLogger } from '@textmesh/logger';
import { PIIMatch, PIIType } from './types';

const logger = createLogger({ service: 'pii-detector', level: 'info' });

// PII detection patterns
const PII_PATTERNS: Record<string, RegExp[]> = {
  email: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /\b[A-Za-z0-9._%+-]+\s*\[at\]\s*[A-Za-z0-9.-]+\s*\[dot\]\s*[A-Z|a-z]{2,}\b/gi,
    /\b[A-Za-z0-9._%+-]+\s*\(at\)\s*[A-Za-z0-9.-]+\s*\(dot\)\s*[A-Z|a-z]{2,}\b/gi,
  ],
  phone: [
    // US formats
    /\b(?:\+1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    // International formats
    /\b\+?[1-9]\d{1,14}\b/g,
    // Formatted with spaces
    /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g,
  ],
  ssn: [
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    /\bssn[:\s]*\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/gi,
  ],
  creditCard: [
    // Visa
    /\b4[0-9]{12}(?:[0-9]{3})?\b/g,
    // Mastercard
    /\b(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}\b/g,
    // Amex
    /\b3[47][0-9]{13}\b/g,
    // Discover
    /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g,
    // Generic 16-digit
    /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  ],
  address: [
    /\b\d{1,5}\s+[\w\s]{1,50}(?:street|st|avenue|ave|road|rd|highway|hwy|square|sq|trail|trl|drive|dr|court|ct|park|pk|lane|ln|boulevard|blvd|way|circle|cir)\b/gi,
  ],
  ipAddress: [
    // IPv4
    /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    // IPv6
    /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
  ],
  dateOfBirth: [
    /\b(?:dob|date\s*of\s*birth|born|birthday)[:\s]*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gi,
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g,
  ],
  passport: [
    /\b[A-Z]{1,2}\d{6,9}\b/g,
    /\bpassport[:\s#]*[A-Z0-9]{6,9}\b/gi,
  ],
  driverLicense: [
    /\b(?:dl|driver'?s?\s*license)[:\s#]*[A-Z0-9]{5,15}\b/gi,
  ],
  bankAccount: [
    /\b(?:account|acct)[:\s#]*\d{8,17}\b/gi,
    /\b(?:routing)[:\s#]*\d{9}\b/gi,
  ],
  name: [], // Handled separately with NER
};

// Common name patterns
const NAME_INDICATORS = [
  /\b(?:my\s+name\s+is|i'?m|call\s+me|known\s+as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
  /\b(?:name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
];

// Severity levels for different PII types
const PII_SEVERITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  email: 'medium',
  phone: 'medium',
  ssn: 'critical',
  creditCard: 'critical',
  address: 'high',
  ipAddress: 'low',
  dateOfBirth: 'medium',
  passport: 'critical',
  driverLicense: 'high',
  bankAccount: 'critical',
  name: 'low',
};

export class PIIDetector {
  private customPatterns: Map<PIIType, RegExp[]> = new Map();
  private whitelist: Set<string> = new Set();

  /**
   * Detect all PII in text
   */
  detect(text: string): PIIMatch[] {
    const matches: PIIMatch[] = [];

    // Check each PII type
    for (const [type, patterns] of Object.entries(PII_PATTERNS) as [PIIType, RegExp[]][]) {
      for (const pattern of patterns) {
        // Reset regex state
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(text)) !== null) {
          const value = match[0];

          // Skip whitelisted values
          if (this.whitelist.has(value.toLowerCase())) {
            continue;
          }

          // Validate the match
          if (this.validatePII(type, value)) {
            matches.push({
              type,
              value,
              start: match.index,
              end: match.index + value.length,
              confidence: this.calculateConfidence(type, value),
              severity: PII_SEVERITY[type],
            });
          }
        }
      }

      // Check custom patterns
      const custom = this.customPatterns.get(type);
      if (custom) {
        for (const pattern of custom) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(text)) !== null) {
            matches.push({
              type,
              value: match[0],
              start: match.index,
              end: match.index + match[0].length,
              confidence: 0.7,
              severity: PII_SEVERITY[type],
            });
          }
        }
      }
    }

    // Detect names
    const nameMatches = this.detectNames(text);
    matches.push(...nameMatches);

    // Remove duplicates and overlapping matches
    return this.deduplicateMatches(matches);
  }

  /**
   * Validate PII match
   */
  private validatePII(type: PIIType, value: string): boolean {
    switch (type) {
      case 'email':
        return this.validateEmail(value);
      case 'phone':
        return this.validatePhone(value);
      case 'ssn':
        return this.validateSSN(value);
      case 'creditCard':
        return this.validateCreditCard(value);
      case 'ipAddress':
        return this.validateIP(value);
      default:
        return true;
    }
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string): boolean {
    // Basic structure check
    const parts = email.split('@');
    if (parts.length !== 2) return false;

    const [local, domain] = parts;
    if (!local || !domain) return false;

    // Domain must have at least one dot
    if (!domain.includes('.')) return false;

    return true;
  }

  /**
   * Validate phone number
   */
  private validatePhone(phone: string): boolean {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');

    // US numbers: 10 or 11 digits
    if (digits.length === 10 || digits.length === 11) {
      return true;
    }

    // International: 7-15 digits
    if (digits.length >= 7 && digits.length <= 15) {
      return true;
    }

    return false;
  }

  /**
   * Validate SSN format
   */
  private validateSSN(ssn: string): boolean {
    const digits = ssn.replace(/\D/g, '');
    if (digits.length !== 9) return false;

    // Can't start with 000, 666, or 900-999
    const area = parseInt(digits.substring(0, 3), 10);
    if (area === 0 || area === 666 || area >= 900) return false;

    // Middle group can't be 00
    const group = parseInt(digits.substring(3, 5), 10);
    if (group === 0) return false;

    // Serial can't be 0000
    const serial = parseInt(digits.substring(5), 10);
    if (serial === 0) return false;

    return true;
  }

  /**
   * Validate credit card using Luhn algorithm
   */
  private validateCreditCard(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    // Luhn algorithm
    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Validate IP address
   */
  private validateIP(ip: string): boolean {
    // IPv4
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length !== 4) return false;

      for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255) return false;
      }
      return true;
    }

    // IPv6 - basic check
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return parts.length === 8;
    }

    return false;
  }

  /**
   * Detect names in text
   */
  private detectNames(text: string): PIIMatch[] {
    const matches: PIIMatch[] = [];

    for (const pattern of NAME_INDICATORS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          matches.push({
            type: 'name',
            value: match[1],
            start: match.index,
            end: match.index + match[0].length,
            confidence: 0.6,
            severity: 'low',
          });
        }
      }
    }

    return matches;
  }

  /**
   * Calculate confidence score for match
   */
  private calculateConfidence(type: PIIType, value: string): number {
    switch (type) {
      case 'email':
        // Higher confidence for common domains
        const domain = value.split('@')[1]?.toLowerCase();
        const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
        return commonDomains.includes(domain) ? 0.95 : 0.85;

      case 'phone':
        const digits = value.replace(/\D/g, '');
        return digits.length === 10 || digits.length === 11 ? 0.9 : 0.7;

      case 'ssn':
        return this.validateSSN(value) ? 0.95 : 0.5;

      case 'creditCard':
        return this.validateCreditCard(value) ? 0.95 : 0.5;

      case 'ipAddress':
        return 0.85;

      case 'address':
        return 0.7;

      default:
        return 0.8;
    }
  }

  /**
   * Remove duplicate and overlapping matches
   */
  private deduplicateMatches(matches: PIIMatch[]): PIIMatch[] {
    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    const result: PIIMatch[] = [];
    let lastEnd = -1;

    for (const match of matches) {
      // Skip if overlapping with previous match
      if (match.start < lastEnd) {
        // Keep the higher confidence match
        const prev = result[result.length - 1];
        if (prev && match.confidence > prev.confidence) {
          result.pop();
          result.push(match);
          lastEnd = match.end;
        }
        continue;
      }

      result.push(match);
      lastEnd = match.end;
    }

    return result;
  }

  /**
   * Redact PII from text
   */
  redact(text: string, options: {
    types?: PIIType[];
    replacement?: string | ((match: PIIMatch) => string);
  } = {}): string {
    const matches = this.detect(text);
    const filteredMatches = options.types
      ? matches.filter((m) => options.types!.includes(m.type))
      : matches;

    // Sort by position descending to replace from end
    filteredMatches.sort((a, b) => b.start - a.start);

    let result = text;
    for (const match of filteredMatches) {
      const replacement =
        typeof options.replacement === 'function'
          ? options.replacement(match)
          : options.replacement || `[${match.type.toUpperCase()}]`;

      result = result.substring(0, match.start) + replacement + result.substring(match.end);
    }

    return result;
  }

  /**
   * Check if text contains any PII
   */
  hasPII(text: string, types?: PIIType[]): boolean {
    const matches = this.detect(text);
    if (!types) return matches.length > 0;
    return matches.some((m) => types.includes(m.type));
  }

  /**
   * Check if text contains critical PII
   */
  hasCriticalPII(text: string): boolean {
    const matches = this.detect(text);
    return matches.some((m) => m.severity === 'critical');
  }

  /**
   * Add custom pattern
   */
  addPattern(type: PIIType, pattern: RegExp): void {
    const existing = this.customPatterns.get(type) || [];
    existing.push(pattern);
    this.customPatterns.set(type, existing);
  }

  /**
   * Add value to whitelist
   */
  addWhitelist(value: string): void {
    this.whitelist.add(value.toLowerCase());
  }

  /**
   * Get summary of PII found
   */
  getSummary(text: string): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    hasHighRisk: boolean;
  } {
    const matches = this.detect(text);

    const byType: Record<string, number> = {
      email: 0,
      phone: 0,
      ssn: 0,
      creditCard: 0,
      address: 0,
      ipAddress: 0,
      dateOfBirth: 0,
      passport: 0,
      driverLicense: 0,
      bankAccount: 0,
      name: 0,
    };

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const match of matches) {
      byType[match.type]++;
      const severity = match.severity || 'low';
      bySeverity[severity]++;
    }

    return {
      total: matches.length,
      byType,
      bySeverity,
      hasHighRisk: bySeverity.critical > 0 || bySeverity.high > 0,
    };
  }
}

export const piiDetector = new PIIDetector();
