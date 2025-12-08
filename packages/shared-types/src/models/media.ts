// =================================
// MEDIA MODEL TYPES (FUTURE-READY)
// =================================

import { MediaType } from '../common/enums.js';

export interface Media {
  id: string;
  postId: string | null;
  userId: string;
  type: MediaType;
  url: string;
  thumbnailUrl: string | null;
  metadata: MediaMetadata;
  status: MediaStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface MediaMetadata {
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  blurhash?: string;
  altText?: string;
}

export interface ImageMetadata extends MediaMetadata {
  width: number;
  height: number;
  blurhash: string;
  variants?: ImageVariant[];
}

export interface ImageVariant {
  size: 'thumbnail' | 'small' | 'medium' | 'large' | 'original';
  url: string;
  width: number;
  height: number;
}

export interface VideoMetadata extends MediaMetadata {
  width: number;
  height: number;
  duration: number;
  bitrate?: number;
  codec?: string;
  hlsUrl?: string;
  dashUrl?: string;
  variants?: VideoVariant[];
}

export interface VideoVariant {
  quality: '360p' | '480p' | '720p' | '1080p' | '4k';
  url: string;
  width: number;
  height: number;
  bitrate: number;
}

export interface UploadRequest {
  filename: string;
  mimeType: string;
  size: number;
  type: MediaType;
}

export interface PresignedUpload {
  uploadId: string;
  uploadUrl: string;
  expiresAt: Date;
  fields?: Record<string, string>;
}

export interface UploadComplete {
  mediaId: string;
  status: MediaStatus;
}

export const IMAGE_MAX_SIZE_MB = 10;
export const VIDEO_MAX_SIZE_MB = 100;
export const VIDEO_MAX_DURATION_SECONDS = 300;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
