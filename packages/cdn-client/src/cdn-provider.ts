/**
 * CDN Provider
 *
 * Unified interface for multiple CDN providers:
 * - Cloudflare
 * - CloudFront
 * - Fastly
 * - Bunny CDN
 */

import { createLogger } from '@textmesh/logger';
import {
  CDNConfig,
  ImageTransformOptions,
  VideoStreamOptions,
  PurgeOptions,
  AssetMetadata,
} from './types';

const logger = createLogger({ service: 'cdn-provider', level: 'info' });

// Default configuration
const defaultConfig: CDNConfig = {
  provider: (process.env.CDN_PROVIDER as CDNConfig['provider']) || 'cloudflare',
  baseUrl: process.env.CDN_BASE_URL || '',
  zoneId: process.env.CDN_ZONE_ID,
  apiKey: process.env.CDN_API_KEY,
  apiSecret: process.env.CDN_API_SECRET,
  accountId: process.env.CDN_ACCOUNT_ID,
  imageOptimization: process.env.CDN_IMAGE_OPTIMIZATION === 'true',
  videoStreaming: process.env.CDN_VIDEO_STREAMING === 'true',
};

export class CDNProvider {
  private config: CDNConfig;

  constructor(config: Partial<CDNConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Get CDN URL for an asset
   */
  getAssetUrl(path: string): string {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${this.config.baseUrl}/${cleanPath}`;
  }

  /**
   * Get optimized image URL with transformations
   */
  getImageUrl(path: string, options: ImageTransformOptions = {}): string {
    if (!this.config.imageOptimization) {
      return this.getAssetUrl(path);
    }

    const transforms = this.buildImageTransforms(options);

    switch (this.config.provider) {
      case 'cloudflare':
        return this.getCloudflareImageUrl(path, transforms);
      case 'cloudfront':
        return this.getCloudFrontImageUrl(path, transforms);
      case 'fastly':
        return this.getFastlyImageUrl(path, transforms);
      case 'bunny':
        return this.getBunnyImageUrl(path, transforms);
      default:
        return this.getAssetUrl(path);
    }
  }

  /**
   * Get video streaming URL
   */
  getVideoUrl(path: string, options: VideoStreamOptions = {}): string {
    if (!this.config.videoStreaming) {
      return this.getAssetUrl(path);
    }

    const { quality = 'auto', format = 'hls' } = options;

    switch (this.config.provider) {
      case 'cloudflare':
        return `${this.config.baseUrl}/stream/${path}?quality=${quality}&format=${format}`;
      case 'cloudfront':
        return `${this.config.baseUrl}/videos/${path}/playlist.m3u8`;
      default:
        return this.getAssetUrl(path);
    }
  }

  /**
   * Get video thumbnail URL
   */
  getVideoThumbnailUrl(path: string, time: number = 1): string {
    switch (this.config.provider) {
      case 'cloudflare':
        return `${this.config.baseUrl}/stream/${path}/thumbnails/thumbnail.jpg?time=${time}s`;
      default:
        return this.getAssetUrl(`${path}/thumb.jpg`);
    }
  }

  /**
   * Purge cache for URLs/tags
   */
  async purge(options: PurgeOptions): Promise<{ success: boolean; purgedCount: number }> {
    try {
      switch (this.config.provider) {
        case 'cloudflare':
          return await this.purgeCloudflare(options);
        case 'cloudfront':
          return await this.purgeCloudFront(options);
        case 'fastly':
          return await this.purgeFastly(options);
        case 'bunny':
          return await this.purgeBunny(options);
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error) {
      logger.error('Cache purge failed', { error, options });
      return { success: false, purgedCount: 0 };
    }
  }

  /**
   * Prefetch assets to edge
   */
  async prefetch(urls: string[]): Promise<void> {
    logger.info('Prefetching assets', { count: urls.length });

    // Prefetch by making HEAD requests to warm cache
    await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (!response.ok) {
            logger.warn('Prefetch failed', { url, status: response.status });
          }
        } catch (error) {
          logger.warn('Prefetch error', { url, error });
        }
      })
    );
  }

  /**
   * Build image transformation parameters
   */
  private buildImageTransforms(options: ImageTransformOptions): Record<string, string> {
    const transforms: Record<string, string> = {};

    if (options.width) transforms.w = options.width.toString();
    if (options.height) transforms.h = options.height.toString();
    if (options.quality) transforms.q = options.quality.toString();
    if (options.format) transforms.f = options.format;
    if (options.fit) transforms.fit = options.fit;
    if (options.gravity) transforms.g = options.gravity;
    if (options.blur) transforms.blur = options.blur.toString();
    if (options.sharpen) transforms.sharpen = options.sharpen.toString();
    if (options.dpr) transforms.dpr = options.dpr.toString();

    return transforms;
  }

  /**
   * Cloudflare Image Resizing URL format
   */
  private getCloudflareImageUrl(path: string, transforms: Record<string, string>): string {
    const params = Object.entries(transforms)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return `${this.config.baseUrl}/cdn-cgi/image/${params}/${path}`;
  }

  /**
   * CloudFront + Lambda@Edge URL format
   */
  private getCloudFrontImageUrl(path: string, transforms: Record<string, string>): string {
    const query = new URLSearchParams(transforms).toString();
    return `${this.config.baseUrl}/${path}${query ? `?${query}` : ''}`;
  }

  /**
   * Fastly Image Optimizer URL format
   */
  private getFastlyImageUrl(path: string, transforms: Record<string, string>): string {
    const params = Object.entries(transforms)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return `${this.config.baseUrl}/${path}?${params}`;
  }

  /**
   * Bunny CDN URL format
   */
  private getBunnyImageUrl(path: string, transforms: Record<string, string>): string {
    const params = Object.entries(transforms)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return `${this.config.baseUrl}/${path}?${params}`;
  }

  /**
   * Purge Cloudflare cache
   */
  private async purgeCloudflare(options: PurgeOptions): Promise<{ success: boolean; purgedCount: number }> {
    const { zoneId, apiKey } = this.config;

    if (!zoneId || !apiKey) {
      throw new Error('Cloudflare credentials not configured');
    }

    const body: Record<string, unknown> = {};
    if (options.all) {
      body.purge_everything = true;
    } else if (options.urls) {
      body.files = options.urls;
    } else if (options.tags) {
      body.tags = options.tags;
    } else if (options.prefixes) {
      body.prefixes = options.prefixes;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const result = await response.json() as { success: boolean; errors?: Array<{ message: string }> };

    if (result.success) {
      logger.info('Cloudflare cache purged', { options });
      return { success: true, purgedCount: options.urls?.length || 1 };
    }

    throw new Error(result.errors?.[0]?.message || 'Purge failed');
  }

  /**
   * Purge CloudFront cache
   */
  private async purgeCloudFront(options: PurgeOptions): Promise<{ success: boolean; purgedCount: number }> {
    // Would use AWS SDK in production
    logger.info('CloudFront cache purge requested', { options });
    return { success: true, purgedCount: options.urls?.length || 0 };
  }

  /**
   * Purge Fastly cache
   */
  private async purgeFastly(options: PurgeOptions): Promise<{ success: boolean; purgedCount: number }> {
    const { apiKey } = this.config;

    if (!apiKey) {
      throw new Error('Fastly API key not configured');
    }

    if (options.urls) {
      await Promise.all(
        options.urls.map((url) =>
          fetch(url, {
            method: 'PURGE',
            headers: { 'Fastly-Key': apiKey },
          })
        )
      );
    }

    logger.info('Fastly cache purged', { options });
    return { success: true, purgedCount: options.urls?.length || 0 };
  }

  /**
   * Purge Bunny CDN cache
   */
  private async purgeBunny(options: PurgeOptions): Promise<{ success: boolean; purgedCount: number }> {
    const { apiKey, zoneId } = this.config;

    if (!apiKey || !zoneId) {
      throw new Error('Bunny CDN credentials not configured');
    }

    if (options.urls) {
      await Promise.all(
        options.urls.map((url) =>
          fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}`, {
            method: 'POST',
            headers: { 'AccessKey': apiKey },
          })
        )
      );
    }

    logger.info('Bunny CDN cache purged', { options });
    return { success: true, purgedCount: options.urls?.length || 0 };
  }
}

// Export singleton instance
export const cdnProvider = new CDNProvider();
