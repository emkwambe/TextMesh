/**
 * CDN Client Types
 */

export interface CDNConfig {
  provider: 'cloudflare' | 'cloudfront' | 'fastly' | 'bunny';
  baseUrl: string;
  zoneId?: string;
  apiKey?: string;
  apiSecret?: string;
  accountId?: string;
  imageOptimization: boolean;
  videoStreaming: boolean;
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'scale-down';
  gravity?: 'auto' | 'center' | 'north' | 'south' | 'east' | 'west' | 'face';
  blur?: number;
  sharpen?: number;
  brightness?: number;
  contrast?: number;
  dpr?: number;
}

export interface VideoStreamOptions {
  quality?: 'auto' | '1080p' | '720p' | '480p' | '360p';
  format?: 'hls' | 'dash' | 'mp4';
  startTime?: number;
  thumbnail?: boolean;
  thumbnailTime?: number;
}

export interface CacheControlOptions {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  private?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
  immutable?: boolean;
}

export interface PurgeOptions {
  urls?: string[];
  tags?: string[];
  prefixes?: string[];
  all?: boolean;
}

export interface AssetMetadata {
  url: string;
  cdnUrl: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  hash: string;
  cached: boolean;
  edgeLocation?: string;
}

export interface SignedUrlOptions {
  expiresIn: number;
  ipRestriction?: string;
  countryRestriction?: string[];
}
