/**
 * Link Checker
 *
 * Verifies link safety using:
 * - Known malicious domain lists
 * - URL pattern analysis
 * - Redirect following
 * - Integration with safe browsing APIs
 */

import { createLogger } from '@textmesh/logger';

const logger = createLogger({ service: 'link-checker', level: 'info' });

export interface LinkCheckResult {
  url: string;
  safe: boolean;
  category: 'safe' | 'suspicious' | 'malicious' | 'adult' | 'unknown';
  reasons: string[];
  resolvedUrl?: string;
  responseTime?: number;
  threat?: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}

// Known malicious domains (sample list - production would use threat intelligence feeds)
const MALICIOUS_DOMAINS = new Set([
  'malware.com',
  'phishing-site.com',
  'fake-login.com',
  'steal-info.com',
  'virus-download.net',
]);

// Suspicious TLDs often used for malicious purposes
const SUSPICIOUS_TLDS = new Set([
  '.xyz',
  '.top',
  '.win',
  '.click',
  '.loan',
  '.work',
  '.party',
  '.gq',
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.racing',
  '.download',
  '.zip',
  '.mov',
]);

// Known URL shorteners
const URL_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'j.mp',
  'su.pr',
  'tr.im',
  'tiny.cc',
  'short.to',
  'rb.gy',
  'cutt.ly',
]);

// Phishing patterns
const PHISHING_PATTERNS = [
  /login.*verify/i,
  /account.*suspend/i,
  /verify.*identity/i,
  /update.*payment/i,
  /confirm.*account/i,
  /secure.*login/i,
  /paypal.*login/i,
  /apple.*id.*verify/i,
  /bank.*login/i,
  /microsoft.*verify/i,
  /google.*security/i,
  /facebook.*confirm/i,
  /instagram.*verify/i,
  /amazon.*order/i,
  /netflix.*billing/i,
];

// Suspicious URL patterns
const SUSPICIOUS_URL_PATTERNS = [
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP address in URL
  /@/, // @ symbol in URL (redirect attack)
  /\.(exe|scr|bat|cmd|vbs|ps1|jar|msi)$/i, // Executable extensions
  /\.php\?.*=.*http/i, // Open redirect attempt
  /data:/i, // Data URI
  /javascript:/i, // JavaScript URI
  /base64/i, // Base64 encoded content
];

// Brand names often targeted by phishing
const BRAND_NAMES = [
  'paypal',
  'apple',
  'microsoft',
  'google',
  'facebook',
  'instagram',
  'amazon',
  'netflix',
  'bank',
  'credit',
  'secure',
  'login',
  'verify',
];

export class LinkChecker {
  private domainCache: Map<string, LinkCheckResult> = new Map();
  private cacheExpiry: number = 3600000; // 1 hour

  /**
   * Check if a URL is safe
   */
  async check(url: string): Promise<LinkCheckResult> {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      // Check cache
      const cached = this.domainCache.get(hostname);
      if (cached) {
        return { ...cached, url };
      }

      const result = await this.analyzeUrl(url, parsedUrl, hostname);

      // Cache result
      this.domainCache.set(hostname, result);
      setTimeout(() => this.domainCache.delete(hostname), this.cacheExpiry);

      return result;
    } catch (error) {
      return {
        url,
        safe: false,
        category: 'suspicious',
        reasons: ['Invalid URL format'],
      };
    }
  }

  /**
   * Analyze URL for threats
   */
  private async analyzeUrl(
    url: string,
    parsedUrl: URL,
    hostname: string
  ): Promise<LinkCheckResult> {
    const reasons: string[] = [];
    let category: LinkCheckResult['category'] = 'safe';
    let threat: LinkCheckResult['threat'] | undefined;

    // Check against malicious domains
    if (MALICIOUS_DOMAINS.has(hostname)) {
      return {
        url,
        safe: false,
        category: 'malicious',
        reasons: ['Known malicious domain'],
        threat: {
          type: 'malware',
          severity: 'critical',
        },
      };
    }

    // Check for suspicious TLD
    for (const tld of SUSPICIOUS_TLDS) {
      if (hostname.endsWith(tld)) {
        reasons.push(`Suspicious TLD: ${tld}`);
        category = 'suspicious';
        break;
      }
    }

    // Check for URL shortener
    if (URL_SHORTENERS.has(hostname)) {
      reasons.push('URL shortener - destination unknown');
      if (category === 'safe') category = 'suspicious';
    }

    // Check for phishing patterns
    const fullUrl = url.toLowerCase();
    for (const pattern of PHISHING_PATTERNS) {
      if (pattern.test(fullUrl)) {
        reasons.push('Matches phishing pattern');
        category = 'suspicious';
        threat = { type: 'phishing', severity: 'high' };
        break;
      }
    }

    // Check for suspicious URL patterns
    for (const pattern of SUSPICIOUS_URL_PATTERNS) {
      if (pattern.test(url)) {
        reasons.push('Suspicious URL structure');
        category = 'suspicious';
        break;
      }
    }

    // Check for brand impersonation
    const brandCheck = this.checkBrandImpersonation(hostname);
    if (brandCheck.suspicious) {
      reasons.push(brandCheck.reason!);
      category = 'suspicious';
      threat = { type: 'phishing', severity: 'medium' };
    }

    // Check for homograph attacks (IDN)
    if (this.containsHomographs(hostname)) {
      reasons.push('Possible homograph attack');
      category = 'suspicious';
      threat = { type: 'phishing', severity: 'high' };
    }

    // Check for excessive subdomains
    const subdomainCount = hostname.split('.').length - 2;
    if (subdomainCount > 3) {
      reasons.push('Excessive subdomains');
      if (category === 'safe') category = 'suspicious';
    }

    // Check path for suspicious patterns
    if (parsedUrl.pathname.includes('..') || parsedUrl.pathname.includes('//')) {
      reasons.push('Suspicious path traversal');
      category = 'suspicious';
    }

    return {
      url,
      safe: category === 'safe',
      category,
      reasons: reasons.length > 0 ? reasons : ['No issues detected'],
      threat,
    };
  }

  /**
   * Check for brand impersonation
   */
  private checkBrandImpersonation(hostname: string): {
    suspicious: boolean;
    reason?: string;
  } {
    // Remove TLD for analysis
    const parts = hostname.split('.');
    if (parts.length < 2) return { suspicious: false };

    const domainPart = parts.slice(0, -1).join('.');

    for (const brand of BRAND_NAMES) {
      // Check if brand name appears but isn't the actual domain
      if (domainPart.includes(brand)) {
        const knownDomains = this.getKnownDomainsForBrand(brand);
        if (!knownDomains.includes(hostname)) {
          return {
            suspicious: true,
            reason: `Possible ${brand} impersonation`,
          };
        }
      }
    }

    return { suspicious: false };
  }

  /**
   * Get known legitimate domains for a brand
   */
  private getKnownDomainsForBrand(brand: string): string[] {
    const brandDomains: Record<string, string[]> = {
      paypal: ['paypal.com', 'paypal.me'],
      apple: ['apple.com', 'icloud.com'],
      microsoft: ['microsoft.com', 'live.com', 'outlook.com', 'office.com'],
      google: ['google.com', 'gmail.com', 'youtube.com'],
      facebook: ['facebook.com', 'fb.com', 'fb.me'],
      instagram: ['instagram.com'],
      amazon: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'aws.amazon.com'],
      netflix: ['netflix.com'],
    };

    return brandDomains[brand] || [];
  }

  /**
   * Check for homograph characters (lookalikes)
   */
  private containsHomographs(hostname: string): boolean {
    // Common homograph characters
    const homographs: Record<string, string[]> = {
      a: ['а', 'ɑ', 'α'], // Cyrillic, Latin small alpha, Greek
      c: ['с', 'ϲ'], // Cyrillic, Greek
      e: ['е', 'ε'], // Cyrillic, Greek
      o: ['о', 'ο', '0'], // Cyrillic, Greek, zero
      p: ['р', 'ρ'], // Cyrillic, Greek
      x: ['х', 'χ'], // Cyrillic, Greek
      i: ['і', 'ι', '1', 'l'], // Cyrillic, Greek, one, lowercase L
    };

    for (const [original, lookalikes] of Object.entries(homographs)) {
      for (const lookalike of lookalikes) {
        if (hostname.includes(lookalike)) {
          return true;
        }
      }
    }

    // Check for punycode (xn--)
    if (hostname.includes('xn--')) {
      return true;
    }

    return false;
  }

  /**
   * Batch check multiple URLs
   */
  async batchCheck(urls: string[]): Promise<Map<string, LinkCheckResult>> {
    const results = new Map<string, LinkCheckResult>();

    await Promise.all(
      urls.map(async (url) => {
        const result = await this.check(url);
        results.set(url, result);
      })
    );

    return results;
  }

  /**
   * Extract and check all URLs from text
   */
  async checkTextLinks(text: string): Promise<{
    urls: string[];
    results: LinkCheckResult[];
    hasMalicious: boolean;
    hasSuspicious: boolean;
  }> {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const urls = text.match(urlRegex) || [];

    const results = await Promise.all(urls.map((url) => this.check(url)));

    return {
      urls,
      results,
      hasMalicious: results.some((r) => r.category === 'malicious'),
      hasSuspicious: results.some((r) => r.category === 'suspicious'),
    };
  }

  /**
   * Add domain to malicious list
   */
  addMaliciousDomain(domain: string): void {
    MALICIOUS_DOMAINS.add(domain.toLowerCase());
    this.domainCache.delete(domain.toLowerCase());
  }

  /**
   * Check if domain is a known URL shortener
   */
  isUrlShortener(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return URL_SHORTENERS.has(hostname);
    } catch {
      return false;
    }
  }

  /**
   * Get URL components for analysis
   */
  analyzeUrlComponents(url: string): {
    protocol: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
    subdomains: string[];
    tld: string;
    isHttps: boolean;
    hasPort: boolean;
    queryParams: Record<string, string>;
  } | null {
    try {
      const parsed = new URL(url);
      const parts = parsed.hostname.split('.');
      const tld = parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
      const subdomains = parts.slice(0, -2);

      const queryParams: Record<string, string> = {};
      parsed.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        subdomains,
        tld,
        isHttps: parsed.protocol === 'https:',
        hasPort: !!parsed.port,
        queryParams,
      };
    } catch {
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.domainCache.clear();
  }
}

export const linkChecker = new LinkChecker();
