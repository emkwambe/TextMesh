/**
 * Cache Control
 *
 * Manages cache headers and strategies:
 * - Cache-Control header generation
 * - ETag management
 * - Conditional request handling
 * - Cache key generation
 */

import crypto from 'crypto';
import { CacheControlOptions } from './types';

// Cache profiles for different content types
export const CACHE_PROFILES = {
  // Static assets (CSS, JS, fonts) - long cache with immutable
  static: {
    maxAge: 31536000, // 1 year
    immutable: true,
    sMaxAge: 31536000,
  },

  // Images - long cache, allow revalidation
  images: {
    maxAge: 86400 * 30, // 30 days
    sMaxAge: 86400 * 365, // 1 year on CDN
    staleWhileRevalidate: 86400, // 1 day
  },

  // User-generated content - moderate cache
  ugc: {
    maxAge: 3600, // 1 hour
    sMaxAge: 86400, // 24 hours on CDN
    staleWhileRevalidate: 3600,
    staleIfError: 86400,
  },

  // API responses - short cache
  api: {
    maxAge: 60, // 1 minute
    sMaxAge: 300, // 5 minutes on CDN
    staleWhileRevalidate: 60,
    mustRevalidate: true,
  },

  // Private/personalized content
  private: {
    private: true,
    maxAge: 0,
    noCache: true,
    mustRevalidate: true,
  },

  // Real-time data
  noCache: {
    noStore: true,
    noCache: true,
    maxAge: 0,
  },

  // HTML pages
  html: {
    maxAge: 0,
    sMaxAge: 300,
    staleWhileRevalidate: 60,
    mustRevalidate: true,
  },
} as const;

export class CacheControl {
  /**
   * Build Cache-Control header value
   */
  static buildHeader(options: CacheControlOptions): string {
    const directives: string[] = [];

    if (options.private) {
      directives.push('private');
    } else {
      directives.push('public');
    }

    if (options.noStore) {
      directives.push('no-store');
    }

    if (options.noCache) {
      directives.push('no-cache');
    }

    if (options.maxAge !== undefined) {
      directives.push(`max-age=${options.maxAge}`);
    }

    if (options.sMaxAge !== undefined) {
      directives.push(`s-maxage=${options.sMaxAge}`);
    }

    if (options.staleWhileRevalidate !== undefined) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }

    if (options.staleIfError !== undefined) {
      directives.push(`stale-if-error=${options.staleIfError}`);
    }

    if (options.mustRevalidate) {
      directives.push('must-revalidate');
    }

    if (options.immutable) {
      directives.push('immutable');
    }

    return directives.join(', ');
  }

  /**
   * Get cache headers for a profile
   */
  static getProfileHeaders(
    profile: keyof typeof CACHE_PROFILES
  ): Record<string, string> {
    const options = CACHE_PROFILES[profile];
    return {
      'Cache-Control': this.buildHeader(options),
    };
  }

  /**
   * Generate ETag from content
   */
  static generateETag(content: string | Buffer): string {
    const hash = crypto
      .createHash('md5')
      .update(content)
      .digest('hex');

    return `"${hash}"`;
  }

  /**
   * Generate weak ETag (for semantic equivalence)
   */
  static generateWeakETag(content: string | Buffer): string {
    const hash = crypto
      .createHash('md5')
      .update(content)
      .digest('hex')
      .substring(0, 16);

    return `W/"${hash}"`;
  }

  /**
   * Check if request has valid conditional headers
   */
  static checkConditionalRequest(
    requestHeaders: Record<string, string | undefined>,
    currentETag: string,
    lastModified?: Date
  ): { notModified: boolean; preconditionFailed: boolean } {
    const ifNoneMatch = requestHeaders['if-none-match'];
    const ifModifiedSince = requestHeaders['if-modified-since'];
    const ifMatch = requestHeaders['if-match'];
    const ifUnmodifiedSince = requestHeaders['if-unmodified-since'];

    // Check If-None-Match (for GET/HEAD)
    if (ifNoneMatch) {
      const etags = ifNoneMatch.split(',').map((e) => e.trim());
      if (etags.includes(currentETag) || etags.includes('*')) {
        return { notModified: true, preconditionFailed: false };
      }
    }

    // Check If-Modified-Since
    if (ifModifiedSince && lastModified) {
      const ifModifiedDate = new Date(ifModifiedSince);
      if (lastModified <= ifModifiedDate) {
        return { notModified: true, preconditionFailed: false };
      }
    }

    // Check If-Match (for PUT/PATCH/DELETE)
    if (ifMatch) {
      const etags = ifMatch.split(',').map((e) => e.trim());
      if (!etags.includes(currentETag) && !etags.includes('*')) {
        return { notModified: false, preconditionFailed: true };
      }
    }

    // Check If-Unmodified-Since
    if (ifUnmodifiedSince && lastModified) {
      const ifUnmodifiedDate = new Date(ifUnmodifiedSince);
      if (lastModified > ifUnmodifiedDate) {
        return { notModified: false, preconditionFailed: true };
      }
    }

    return { notModified: false, preconditionFailed: false };
  }

  /**
   * Generate cache key for URL with variants
   */
  static generateCacheKey(
    url: string,
    variants: Record<string, string | undefined> = {}
  ): string {
    const urlObj = new URL(url);

    // Sort query params for consistent keys
    const sortedParams = [...urlObj.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    // Build variant string
    const variantParts = Object.entries(variants)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');

    const keyBase = `${urlObj.origin}${urlObj.pathname}${sortedParams ? `?${sortedParams}` : ''}`;

    if (variantParts) {
      return `${keyBase}#${variantParts}`;
    }

    return keyBase;
  }

  /**
   * Get Vary header for response variants
   */
  static getVaryHeader(variants: string[]): string {
    return variants.join(', ');
  }

  /**
   * Parse Cache-Control header
   */
  static parseHeader(header: string): CacheControlOptions {
    const directives = header.split(',').map((d) => d.trim().toLowerCase());
    const options: CacheControlOptions = {};

    for (const directive of directives) {
      if (directive === 'private') {
        options.private = true;
      } else if (directive === 'no-cache') {
        options.noCache = true;
      } else if (directive === 'no-store') {
        options.noStore = true;
      } else if (directive === 'must-revalidate') {
        options.mustRevalidate = true;
      } else if (directive === 'immutable') {
        options.immutable = true;
      } else if (directive.startsWith('max-age=')) {
        options.maxAge = parseInt(directive.split('=')[1], 10);
      } else if (directive.startsWith('s-maxage=')) {
        options.sMaxAge = parseInt(directive.split('=')[1], 10);
      } else if (directive.startsWith('stale-while-revalidate=')) {
        options.staleWhileRevalidate = parseInt(directive.split('=')[1], 10);
      } else if (directive.startsWith('stale-if-error=')) {
        options.staleIfError = parseInt(directive.split('=')[1], 10);
      }
    }

    return options;
  }

  /**
   * Calculate effective cache TTL
   */
  static getEffectiveTTL(options: CacheControlOptions): number {
    if (options.noStore || options.noCache) {
      return 0;
    }

    // Use s-maxage for shared caches, otherwise max-age
    return options.sMaxAge ?? options.maxAge ?? 0;
  }
}

export const cacheControl = CacheControl;
