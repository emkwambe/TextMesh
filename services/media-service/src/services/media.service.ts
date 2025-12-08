/**
 * Media Service
 *
 * Core business logic for media operations:
 * - Upload handling
 * - Processing orchestration
 * - Database records management
 * - CDN URL generation
 */

import { prisma, redis } from '@textmesh/db-client';
import { publishEvent } from '@textmesh/event-bus';
import { createLogger } from '@textmesh/logger';
import { s3Provider } from '../storage/s3.provider';
import { imageProcessor, IMAGE_SIZES } from '../processors/image.processor';
import { videoProcessor, VIDEO_PROFILES } from '../processors/video.processor';
import { v4 as uuid } from 'uuid';
import { promises as fs } from 'fs';

const logger = createLogger('media-service');

export interface UploadInput {
  userId: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  type: 'avatar' | 'banner' | 'post' | 'message' | 'video';
  metadata?: Record<string, any>;
}

export interface MediaRecord {
  id: string;
  userId: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  variants?: Record<string, string>;
  width?: number;
  height?: number;
  duration?: number;
  size: number;
  mimeType: string;
  status: 'processing' | 'ready' | 'failed';
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface PresignedUploadResponse {
  uploadId: string;
  uploadUrl: string;
  fields?: Record<string, string>;
  expiresAt: Date;
}

const CACHE_TTL = 3600; // 1 hour
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

export class MediaService {
  /**
   * Process and upload an image
   */
  async uploadImage(input: UploadInput): Promise<MediaRecord> {
    const { userId, file, type, metadata } = input;

    // Validate
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new Error(`Invalid image type: ${file.mimetype}`);
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large. Max size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }

    const mediaId = uuid();

    try {
      // Create pending record
      const media = await prisma.media.create({
        data: {
          id: mediaId,
          userId,
          type,
          status: 'processing',
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          metadata: metadata || {},
        },
      });

      // Process based on type
      let processed;
      let variants: Record<string, string> = {};

      switch (type) {
        case 'avatar':
          const avatarResult = await imageProcessor.processAvatar(file.buffer);

          // Upload original and small
          const [avatarOriginal, avatarSmall] = await Promise.all([
            s3Provider.upload(
              s3Provider.generateKey('avatars', userId, `${mediaId}-original.webp`),
              avatarResult.original.buffer,
              { contentType: 'image/webp' }
            ),
            s3Provider.upload(
              s3Provider.generateKey('avatars', userId, `${mediaId}-small.webp`),
              avatarResult.small.buffer,
              { contentType: 'image/webp' }
            ),
          ]);

          processed = avatarResult.original;
          variants = {
            original: avatarOriginal.url,
            small: avatarSmall.url,
          };
          break;

        case 'banner':
          const bannerResult = await imageProcessor.processBanner(file.buffer);
          const bannerUpload = await s3Provider.upload(
            s3Provider.generateKey('images', userId, `${mediaId}-banner.webp`),
            bannerResult.buffer,
            { contentType: 'image/webp' }
          );

          processed = bannerResult;
          variants = { original: bannerUpload.url };
          break;

        case 'post':
        case 'message':
          const postResult = await imageProcessor.processPostImage(file.buffer);

          const [postOriginal, postMedium, postThumb] = await Promise.all([
            s3Provider.upload(
              s3Provider.generateKey('images', userId, `${mediaId}-original.webp`),
              postResult.original.buffer,
              { contentType: 'image/webp' }
            ),
            s3Provider.upload(
              s3Provider.generateKey('images', userId, `${mediaId}-medium.webp`),
              postResult.medium.buffer,
              { contentType: 'image/webp' }
            ),
            s3Provider.upload(
              s3Provider.generateKey('thumbnails', userId, `${mediaId}-thumb.webp`),
              postResult.thumbnail.buffer,
              { contentType: 'image/webp' }
            ),
          ]);

          processed = postResult.original;
          variants = {
            original: postOriginal.url,
            medium: postMedium.url,
            thumbnail: postThumb.url,
          };
          break;

        default:
          const defaultResult = await imageProcessor.process(file.buffer);
          const defaultUpload = await s3Provider.upload(
            s3Provider.generateKey('images', userId, `${mediaId}.webp`),
            defaultResult.buffer,
            { contentType: 'image/webp' }
          );

          processed = defaultResult;
          variants = { original: defaultUpload.url };
      }

      // Update record
      const updatedMedia = await prisma.media.update({
        where: { id: mediaId },
        data: {
          status: 'ready',
          url: variants.original || variants[Object.keys(variants)[0]],
          thumbnailUrl: variants.thumbnail,
          variants,
          width: processed.width,
          height: processed.height,
          size: processed.size,
        },
      });

      // Publish event
      await publishEvent('media.uploaded', {
        mediaId,
        userId,
        type,
        url: updatedMedia.url,
      });

      logger.info('Image uploaded successfully', { mediaId, userId, type });

      return this.toMediaRecord(updatedMedia);
    } catch (error) {
      // Mark as failed
      await prisma.media.update({
        where: { id: mediaId },
        data: { status: 'failed' },
      }).catch(() => {});

      logger.error('Failed to upload image', { mediaId, error });
      throw error;
    }
  }

  /**
   * Process and upload a video
   */
  async uploadVideo(input: UploadInput): Promise<MediaRecord> {
    const { userId, file, type, metadata } = input;

    // Validate
    if (!ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      throw new Error(`Invalid video type: ${file.mimetype}`);
    }
    if (file.size > MAX_VIDEO_SIZE) {
      throw new Error(`Video too large. Max size: ${MAX_VIDEO_SIZE / 1024 / 1024}MB`);
    }

    const mediaId = uuid();
    const tempPath = `/tmp/${mediaId}-${file.originalname}`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, file.buffer);

      // Create pending record
      const media = await prisma.media.create({
        data: {
          id: mediaId,
          userId,
          type: 'video',
          status: 'processing',
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          metadata: metadata || {},
        },
      });

      // Get video metadata
      const videoMeta = await videoProcessor.getMetadata(tempPath);

      // Generate thumbnails
      const thumbnailPaths = await videoProcessor.generateThumbnails(tempPath, {
        count: 3,
        width: 320,
      });

      // Upload first thumbnail
      const thumbBuffer = await fs.readFile(thumbnailPaths[0]);
      const thumbUpload = await s3Provider.upload(
        s3Provider.generateKey('thumbnails', userId, `${mediaId}-thumb.jpg`),
        thumbBuffer,
        { contentType: 'image/jpeg' }
      );

      // Transcode to multiple qualities
      const variants: Record<string, string> = {};
      const qualitiesToGenerate = this.getQualitiesToGenerate(videoMeta.height);

      for (const quality of qualitiesToGenerate) {
        const profile = VIDEO_PROFILES[quality];
        const transcoded = await videoProcessor.transcode(tempPath, {
          width: profile.width,
          height: profile.height,
          videoBitrate: profile.videoBitrate,
          audioBitrate: profile.audioBitrate,
          format: 'mp4',
          codec: 'h264',
        });

        const videoBuffer = await fs.readFile(transcoded.outputPath);
        const upload = await s3Provider.upload(
          s3Provider.generateKey('videos', userId, `${mediaId}-${quality}.mp4`),
          videoBuffer,
          { contentType: 'video/mp4' }
        );

        variants[quality] = upload.url;

        // Cleanup
        await fs.unlink(transcoded.outputPath).catch(() => {});
      }

      // Update record
      const updatedMedia = await prisma.media.update({
        where: { id: mediaId },
        data: {
          status: 'ready',
          url: variants['720p'] || variants[Object.keys(variants)[0]],
          thumbnailUrl: thumbUpload.url,
          variants,
          width: videoMeta.width,
          height: videoMeta.height,
          duration: Math.round(videoMeta.duration),
        },
      });

      // Cleanup
      await fs.unlink(tempPath).catch(() => {});
      await videoProcessor.cleanup(thumbnailPaths);

      // Publish event
      await publishEvent('media.uploaded', {
        mediaId,
        userId,
        type: 'video',
        url: updatedMedia.url,
        duration: videoMeta.duration,
      });

      logger.info('Video uploaded successfully', { mediaId, userId, duration: videoMeta.duration });

      return this.toMediaRecord(updatedMedia);
    } catch (error) {
      // Cleanup
      await fs.unlink(tempPath).catch(() => {});

      // Mark as failed
      await prisma.media.update({
        where: { id: mediaId },
        data: { status: 'failed' },
      }).catch(() => {});

      logger.error('Failed to upload video', { mediaId, error });
      throw error;
    }
  }

  /**
   * Generate presigned URL for client-side upload
   */
  async getPresignedUploadUrl(
    userId: string,
    filename: string,
    contentType: string,
    contentLength: number
  ): Promise<PresignedUploadResponse> {
    const uploadId = uuid();
    const key = s3Provider.generateKey('uploads', userId, `${uploadId}-${filename}`);

    const { url, fields } = await s3Provider.getPresignedUploadUrl(key, {
      contentType,
      expiresIn: 3600,
    });

    // Store upload metadata for later processing
    await redis.setex(
      `upload:pending:${uploadId}`,
      3600,
      JSON.stringify({
        userId,
        key,
        filename,
        contentType,
        contentLength,
      })
    );

    logger.info('Generated presigned upload URL', { uploadId, userId });

    return {
      uploadId,
      uploadUrl: url,
      fields,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  /**
   * Confirm and process a presigned upload
   */
  async confirmUpload(
    uploadId: string,
    type: 'avatar' | 'banner' | 'post' | 'message' | 'video'
  ): Promise<MediaRecord> {
    const pendingData = await redis.get(`upload:pending:${uploadId}`);
    if (!pendingData) {
      throw new Error('Upload not found or expired');
    }

    const { userId, key, filename, contentType } = JSON.parse(pendingData);

    // Check if file exists in S3
    const exists = await s3Provider.exists(key);
    if (!exists) {
      throw new Error('Upload not complete');
    }

    // Get file metadata
    const metadata = await s3Provider.getMetadata(key);
    if (!metadata) {
      throw new Error('Failed to get file metadata');
    }

    // Download for processing
    const downloadUrl = await s3Provider.getPresignedDownloadUrl(key, 300);

    // TODO: Download and process file
    // For now, just create a record pointing to the original
    const mediaId = uuid();

    const media = await prisma.media.create({
      data: {
        id: mediaId,
        userId,
        type,
        status: 'ready',
        url: s3Provider.getPublicUrl(key),
        originalFilename: filename,
        mimeType: contentType,
        size: metadata.contentLength || 0,
      },
    });

    // Clean up pending
    await redis.del(`upload:pending:${uploadId}`);

    return this.toMediaRecord(media);
  }

  /**
   * Get media by ID
   */
  async getMedia(mediaId: string): Promise<MediaRecord | null> {
    // Check cache
    const cached = await redis.get(`media:${mediaId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      return null;
    }

    const record = this.toMediaRecord(media);

    // Cache
    await redis.setex(`media:${mediaId}`, CACHE_TTL, JSON.stringify(record));

    return record;
  }

  /**
   * Get user's media
   */
  async getUserMedia(
    userId: string,
    options: {
      type?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ media: MediaRecord[]; cursor?: string; hasMore: boolean }> {
    const { type, limit = 20, cursor } = options;

    const media = await prisma.media.findMany({
      where: {
        userId,
        ...(type && { type }),
        status: 'ready',
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    const hasMore = media.length > limit;
    const items = hasMore ? media.slice(0, -1) : media;

    return {
      media: items.map((m) => this.toMediaRecord(m)),
      cursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
    };
  }

  /**
   * Delete media
   */
  async deleteMedia(mediaId: string, userId: string): Promise<void> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    if (media.userId !== userId) {
      throw new Error('Not authorized to delete this media');
    }

    // Delete from S3
    const keysToDelete: string[] = [];

    if (media.url) {
      keysToDelete.push(this.extractKeyFromUrl(media.url));
    }
    if (media.thumbnailUrl) {
      keysToDelete.push(this.extractKeyFromUrl(media.thumbnailUrl));
    }
    if (media.variants) {
      const variants = media.variants as Record<string, string>;
      Object.values(variants).forEach((url) => {
        keysToDelete.push(this.extractKeyFromUrl(url));
      });
    }

    await s3Provider.deleteMany(keysToDelete.filter(Boolean));

    // Delete from database
    await prisma.media.delete({
      where: { id: mediaId },
    });

    // Clear cache
    await redis.del(`media:${mediaId}`);

    // Publish event
    await publishEvent('media.deleted', { mediaId, userId });

    logger.info('Media deleted', { mediaId, userId });
  }

  /**
   * Update media metadata
   */
  async updateMetadata(
    mediaId: string,
    userId: string,
    metadata: Record<string, any>
  ): Promise<MediaRecord> {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    if (media.userId !== userId) {
      throw new Error('Not authorized to update this media');
    }

    const updated = await prisma.media.update({
      where: { id: mediaId },
      data: {
        metadata: {
          ...(media.metadata as object || {}),
          ...metadata,
        },
      },
    });

    // Clear cache
    await redis.del(`media:${mediaId}`);

    return this.toMediaRecord(updated);
  }

  /**
   * Get video qualities to generate based on source height
   */
  private getQualitiesToGenerate(sourceHeight: number): Array<keyof typeof VIDEO_PROFILES> {
    const qualities: Array<keyof typeof VIDEO_PROFILES> = [];

    if (sourceHeight >= 1080) qualities.push('1080p');
    if (sourceHeight >= 720) qualities.push('720p');
    if (sourceHeight >= 480) qualities.push('480p');
    if (sourceHeight >= 360) qualities.push('360p');

    // Always include at least one quality
    if (qualities.length === 0) {
      qualities.push('360p');
    }

    return qualities;
  }

  /**
   * Extract S3 key from URL
   */
  private extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.slice(1); // Remove leading slash
    } catch {
      return url;
    }
  }

  /**
   * Convert database record to API response
   */
  private toMediaRecord(media: any): MediaRecord {
    return {
      id: media.id,
      userId: media.userId,
      type: media.type,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      variants: media.variants as Record<string, string>,
      width: media.width,
      height: media.height,
      duration: media.duration,
      size: media.size,
      mimeType: media.mimeType,
      status: media.status,
      metadata: media.metadata as Record<string, any>,
      createdAt: media.createdAt,
    };
  }
}

export const mediaService = new MediaService();
