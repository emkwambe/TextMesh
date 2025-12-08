/**
 * S3 Storage Provider
 *
 * Handles all S3 operations for media storage including:
 * - Presigned URL generation
 * - Direct uploads
 * - File deletion
 * - CDN URL generation
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createLogger } from '@textmesh/logger';
import { Readable } from 'stream';

const logger = createLogger('s3-provider');

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  cdnDomain?: string;
}

export interface UploadOptions {
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  cacheControl?: string;
  acl?: 'private' | 'public-read';
}

export interface PresignedUrlOptions {
  expiresIn?: number;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

const config: S3Config = {
  bucket: process.env.S3_BUCKET || 'textmesh-media',
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.S3_ENDPOINT,
  cdnDomain: process.env.CDN_DOMAIN,
};

const s3Client = new S3Client({
  region: config.region,
  ...(config.endpoint && { endpoint: config.endpoint }),
  ...(config.accessKeyId && config.secretAccessKey && {
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }),
});

export class S3Provider {
  private bucket: string;
  private cdnDomain?: string;

  constructor() {
    this.bucket = config.bucket;
    this.cdnDomain = config.cdnDomain;
  }

  /**
   * Generate a presigned URL for direct upload from client
   */
  async getPresignedUploadUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    const { expiresIn = 3600, contentType, metadata } = options;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    logger.debug('Generated presigned upload URL', { key, expiresIn });

    return { url };
  }

  /**
   * Generate a presigned URL for downloading/viewing
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    return url;
  }

  /**
   * Upload a file buffer directly to S3
   */
  async upload(
    key: string,
    body: Buffer | Readable,
    options: UploadOptions
  ): Promise<{ key: string; url: string; size: number }> {
    const { contentType, contentLength, metadata, cacheControl, acl } = options;

    try {
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: contentLength,
          Metadata: metadata,
          CacheControl: cacheControl || 'max-age=31536000',
          ACL: acl || 'public-read',
        },
      });

      await upload.done();

      const url = this.getPublicUrl(key);
      const size = contentLength || (Buffer.isBuffer(body) ? body.length : 0);

      logger.info('File uploaded to S3', { key, size, contentType });

      return { key, url, size };
    } catch (error) {
      logger.error('Failed to upload to S3', { key, error });
      throw error;
    }
  }

  /**
   * Upload a stream to S3 (for large files)
   */
  async uploadStream(
    key: string,
    stream: Readable,
    options: UploadOptions
  ): Promise<{ key: string; url: string }> {
    const { contentType, metadata, cacheControl, acl } = options;

    try {
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: contentType,
          Metadata: metadata,
          CacheControl: cacheControl || 'max-age=31536000',
          ACL: acl || 'public-read',
        },
        queueSize: 4,
        partSize: 1024 * 1024 * 5, // 5MB parts
      });

      upload.on('httpUploadProgress', (progress) => {
        logger.debug('Upload progress', { key, loaded: progress.loaded, total: progress.total });
      });

      await upload.done();

      const url = this.getPublicUrl(key);

      logger.info('Stream uploaded to S3', { key, contentType });

      return { key, url };
    } catch (error) {
      logger.error('Failed to upload stream to S3', { key, error });
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await s3Client.send(command);

      logger.info('File deleted from S3', { key });
    } catch (error) {
      logger.error('Failed to delete from S3', { key, error });
      throw error;
    }
  }

  /**
   * Delete multiple files from S3
   */
  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<{
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    metadata?: Record<string, string>;
  } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await s3Client.send(command);

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Copy a file within S3
   */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      });

      await s3Client.send(command);

      logger.info('File copied in S3', { sourceKey, destinationKey });
    } catch (error) {
      logger.error('Failed to copy in S3', { sourceKey, destinationKey, error });
      throw error;
    }
  }

  /**
   * Get public URL for a file (via CDN if configured)
   */
  getPublicUrl(key: string): string {
    if (this.cdnDomain) {
      return `https://${this.cdnDomain}/${key}`;
    }

    if (config.endpoint) {
      return `${config.endpoint}/${this.bucket}/${key}`;
    }

    return `https://${this.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  }

  /**
   * Generate a unique key for a file
   */
  generateKey(
    type: 'images' | 'videos' | 'thumbnails' | 'avatars' | 'attachments',
    userId: string,
    filename: string
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

    return `${type}/${userId}/${timestamp}-${random}-${sanitizedFilename}`;
  }
}

export const s3Provider = new S3Provider();
