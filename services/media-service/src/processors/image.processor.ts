/**
 * Image Processor
 *
 * Handles image processing operations using Sharp:
 * - Resizing and optimization
 * - Thumbnail generation
 * - Format conversion
 * - EXIF stripping
 * - Watermarking
 */

import sharp from 'sharp';
import { createLogger } from '@textmesh/logger';

const logger = createLogger('image-processor');

export interface ImageSize {
  width: number;
  height: number;
}

export interface ProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  stripMetadata?: boolean;
  progressive?: boolean;
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill';
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

// Default sizes for different use cases
export const IMAGE_SIZES = {
  thumbnail: { width: 150, height: 150 },
  small: { width: 320, height: 320 },
  medium: { width: 640, height: 640 },
  large: { width: 1280, height: 1280 },
  xlarge: { width: 1920, height: 1920 },
  avatar: { width: 256, height: 256 },
  avatarSmall: { width: 64, height: 64 },
  banner: { width: 1500, height: 500 },
  post: { width: 1200, height: 1200 },
} as const;

export class ImageProcessor {
  /**
   * Get image metadata
   */
  async getMetadata(input: Buffer | string): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
    hasAlpha: boolean;
    orientation?: number;
  }> {
    const image = sharp(input);
    const metadata = await image.metadata();
    const stats = await image.stats();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: metadata.size || 0,
      hasAlpha: metadata.hasAlpha || false,
      orientation: metadata.orientation,
    };
  }

  /**
   * Process and optimize an image
   */
  async process(
    input: Buffer | string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedImage> {
    const {
      maxWidth = 1920,
      maxHeight = 1920,
      quality = 80,
      format = 'webp',
      fit = 'inside',
      stripMetadata = true,
      progressive = true,
    } = options;

    try {
      let pipeline = sharp(input);

      // Auto-rotate based on EXIF
      pipeline = pipeline.rotate();

      // Resize if needed
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit,
        withoutEnlargement: true,
      });

      // Strip metadata if requested
      if (stripMetadata) {
        pipeline = pipeline.withMetadata({
          orientation: undefined,
        });
      }

      // Convert to target format
      switch (format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality, progressive });
          break;
        case 'png':
          pipeline = pipeline.png({ compressionLevel: 9, progressive });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality });
          break;
        case 'avif':
          pipeline = pipeline.avif({ quality });
          break;
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      logger.debug('Image processed', {
        width: info.width,
        height: info.height,
        format: info.format,
        size: info.size,
      });

      return {
        buffer: data,
        width: info.width,
        height: info.height,
        format: info.format,
        size: info.size,
      };
    } catch (error) {
      logger.error('Failed to process image', { error });
      throw error;
    }
  }

  /**
   * Generate a thumbnail
   */
  async generateThumbnail(
    input: Buffer | string,
    options: ThumbnailOptions = IMAGE_SIZES.thumbnail
  ): Promise<ProcessedImage> {
    const {
      width,
      height,
      fit = 'cover',
      format = 'webp',
      quality = 75,
    } = options;

    try {
      let pipeline = sharp(input)
        .rotate()
        .resize(width, height, {
          fit,
          position: 'attention', // Smart crop focusing on important parts
        });

      switch (format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality });
          break;
        case 'png':
          pipeline = pipeline.png({ compressionLevel: 9 });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality });
          break;
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      logger.debug('Thumbnail generated', {
        width: info.width,
        height: info.height,
        size: info.size,
      });

      return {
        buffer: data,
        width: info.width,
        height: info.height,
        format: info.format,
        size: info.size,
      };
    } catch (error) {
      logger.error('Failed to generate thumbnail', { error });
      throw error;
    }
  }

  /**
   * Generate multiple sizes of an image
   */
  async generateVariants(
    input: Buffer | string,
    sizes: Record<string, ImageSize> = IMAGE_SIZES
  ): Promise<Record<string, ProcessedImage>> {
    const results: Record<string, ProcessedImage> = {};

    await Promise.all(
      Object.entries(sizes).map(async ([name, size]) => {
        results[name] = await this.process(input, {
          maxWidth: size.width,
          maxHeight: size.height,
          format: 'webp',
          quality: 80,
        });
      })
    );

    return results;
  }

  /**
   * Process avatar image
   */
  async processAvatar(input: Buffer | string): Promise<{
    original: ProcessedImage;
    small: ProcessedImage;
  }> {
    const original = await this.generateThumbnail(input, {
      ...IMAGE_SIZES.avatar,
      fit: 'cover',
      format: 'webp',
      quality: 85,
    });

    const small = await this.generateThumbnail(input, {
      ...IMAGE_SIZES.avatarSmall,
      fit: 'cover',
      format: 'webp',
      quality: 80,
    });

    return { original, small };
  }

  /**
   * Process post image with optimized sizes
   */
  async processPostImage(input: Buffer | string): Promise<{
    original: ProcessedImage;
    medium: ProcessedImage;
    thumbnail: ProcessedImage;
  }> {
    const [original, medium, thumbnail] = await Promise.all([
      this.process(input, {
        maxWidth: IMAGE_SIZES.post.width,
        maxHeight: IMAGE_SIZES.post.height,
        format: 'webp',
        quality: 85,
      }),
      this.process(input, {
        maxWidth: IMAGE_SIZES.medium.width,
        maxHeight: IMAGE_SIZES.medium.height,
        format: 'webp',
        quality: 80,
      }),
      this.generateThumbnail(input, {
        ...IMAGE_SIZES.thumbnail,
        format: 'webp',
        quality: 75,
      }),
    ]);

    return { original, medium, thumbnail };
  }

  /**
   * Process banner/cover image
   */
  async processBanner(input: Buffer | string): Promise<ProcessedImage> {
    return this.process(input, {
      maxWidth: IMAGE_SIZES.banner.width,
      maxHeight: IMAGE_SIZES.banner.height,
      format: 'webp',
      quality: 85,
      fit: 'cover',
    });
  }

  /**
   * Extract dominant colors from image
   */
  async extractColors(input: Buffer | string, count: number = 5): Promise<string[]> {
    try {
      const { dominant } = await sharp(input)
        .resize(100, 100, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(async ({ data, info }) => {
          const colors: Map<string, number> = new Map();

          for (let i = 0; i < data.length; i += info.channels) {
            const r = Math.round(data[i] / 32) * 32;
            const g = Math.round(data[i + 1] / 32) * 32;
            const b = Math.round(data[i + 2] / 32) * 32;
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

            colors.set(hex, (colors.get(hex) || 0) + 1);
          }

          const sorted = [...colors.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([color]) => color);

          return { dominant: sorted };
        });

      return dominant;
    } catch (error) {
      logger.error('Failed to extract colors', { error });
      return [];
    }
  }

  /**
   * Check if image contains transparency
   */
  async hasTransparency(input: Buffer | string): Promise<boolean> {
    const metadata = await sharp(input).metadata();
    return metadata.hasAlpha || false;
  }

  /**
   * Convert image format
   */
  async convert(
    input: Buffer | string,
    format: 'jpeg' | 'png' | 'webp' | 'avif',
    quality: number = 80
  ): Promise<ProcessedImage> {
    let pipeline = sharp(input);

    switch (format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality });
        break;
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality });
        break;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      format: info.format,
      size: info.size,
    };
  }

  /**
   * Blur an image (for NSFW placeholders)
   */
  async blur(input: Buffer | string, sigma: number = 20): Promise<ProcessedImage> {
    const { data, info } = await sharp(input)
      .blur(sigma)
      .webp({ quality: 60 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      format: info.format,
      size: info.size,
    };
  }
}

export const imageProcessor = new ImageProcessor();
