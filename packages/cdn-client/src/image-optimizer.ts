/**
 * Image Optimizer
 *
 * Provides intelligent image optimization:
 * - Responsive image srcsets
 * - Format selection based on browser
 * - Lazy loading placeholders
 * - Art direction for different viewports
 */

import { ImageTransformOptions } from './types';
import { cdnProvider, CDNProvider } from './cdn-provider';

// Standard breakpoints
export const BREAKPOINTS = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// Image size presets
export const IMAGE_PRESETS = {
  avatar: { width: 128, height: 128, fit: 'cover' as const },
  avatarSmall: { width: 48, height: 48, fit: 'cover' as const },
  avatarLarge: { width: 256, height: 256, fit: 'cover' as const },
  thumbnail: { width: 150, height: 150, fit: 'cover' as const },
  card: { width: 400, height: 300, fit: 'cover' as const },
  post: { width: 600, height: 600, fit: 'contain' as const },
  postWide: { width: 800, height: 450, fit: 'cover' as const },
  banner: { width: 1200, height: 400, fit: 'cover' as const },
  hero: { width: 1920, height: 1080, fit: 'cover' as const },
  og: { width: 1200, height: 630, fit: 'cover' as const },
};

export interface ResponsiveImageSet {
  src: string;
  srcset: string;
  sizes: string;
  placeholder?: string;
  width: number;
  height: number;
}

export interface PictureSource {
  srcset: string;
  type: string;
  media?: string;
}

export interface PictureSet {
  sources: PictureSource[];
  fallback: ResponsiveImageSet;
}

export class ImageOptimizer {
  private cdn: CDNProvider;

  constructor(cdn: CDNProvider = cdnProvider) {
    this.cdn = cdn;
  }

  /**
   * Get optimized image URL with preset
   */
  getPresetUrl(
    path: string,
    preset: keyof typeof IMAGE_PRESETS,
    options: Partial<ImageTransformOptions> = {}
  ): string {
    const presetOptions = IMAGE_PRESETS[preset];
    return this.cdn.getImageUrl(path, { ...presetOptions, ...options });
  }

  /**
   * Generate responsive image srcset
   */
  getResponsiveSet(
    path: string,
    options: {
      widths?: number[];
      aspectRatio?: number;
      sizes?: string;
      format?: 'auto' | 'webp' | 'avif';
      quality?: number;
    } = {}
  ): ResponsiveImageSet {
    const {
      widths = [320, 640, 768, 1024, 1280, 1536],
      aspectRatio,
      sizes = '100vw',
      format = 'auto',
      quality = 80,
    } = options;

    // Generate srcset
    const srcsetParts = widths.map((width) => {
      const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
      const url = this.cdn.getImageUrl(path, {
        width,
        height,
        format,
        quality,
        fit: 'cover',
      });
      return `${url} ${width}w`;
    });

    // Default src (middle size)
    const defaultWidth = widths[Math.floor(widths.length / 2)];
    const defaultHeight = aspectRatio ? Math.round(defaultWidth / aspectRatio) : undefined;
    const src = this.cdn.getImageUrl(path, {
      width: defaultWidth,
      height: defaultHeight,
      format,
      quality,
    });

    // Generate low-quality placeholder
    const placeholder = this.cdn.getImageUrl(path, {
      width: 20,
      height: aspectRatio ? Math.round(20 / aspectRatio) : undefined,
      quality: 20,
      blur: 10,
    });

    return {
      src,
      srcset: srcsetParts.join(', '),
      sizes,
      placeholder,
      width: defaultWidth,
      height: defaultHeight || defaultWidth,
    };
  }

  /**
   * Generate picture element sources for modern formats
   */
  getPictureSet(
    path: string,
    options: {
      widths?: number[];
      aspectRatio?: number;
      sizes?: string;
    } = {}
  ): PictureSet {
    const { widths = [640, 1024, 1536], aspectRatio, sizes = '100vw' } = options;

    const sources: PictureSource[] = [];

    // AVIF (best compression, limited support)
    const avifSrcset = widths
      .map((width) => {
        const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
        const url = this.cdn.getImageUrl(path, {
          width,
          height,
          format: 'avif',
          quality: 75,
        });
        return `${url} ${width}w`;
      })
      .join(', ');

    sources.push({
      srcset: avifSrcset,
      type: 'image/avif',
    });

    // WebP (good compression, wide support)
    const webpSrcset = widths
      .map((width) => {
        const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
        const url = this.cdn.getImageUrl(path, {
          width,
          height,
          format: 'webp',
          quality: 80,
        });
        return `${url} ${width}w`;
      })
      .join(', ');

    sources.push({
      srcset: webpSrcset,
      type: 'image/webp',
    });

    // Fallback (JPEG)
    const fallback = this.getResponsiveSet(path, {
      widths,
      aspectRatio,
      sizes,
      format: 'jpeg' as any,
    });

    return { sources, fallback };
  }

  /**
   * Get art-directed images for different viewports
   */
  getArtDirectedSet(
    images: Array<{
      path: string;
      media: string;
      aspectRatio?: number;
    }>,
    options: { format?: 'auto' | 'webp' | 'avif' } = {}
  ): PictureSource[] {
    const { format = 'webp' } = options;

    return images.map(({ path, media, aspectRatio }) => {
      const widths = [640, 1024, 1536];
      const srcset = widths
        .map((width) => {
          const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
          const url = this.cdn.getImageUrl(path, {
            width,
            height,
            format,
            quality: 80,
          });
          return `${url} ${width}w`;
        })
        .join(', ');

      return {
        srcset,
        type: `image/${format}`,
        media,
      };
    });
  }

  /**
   * Generate blur hash placeholder data URL
   */
  getPlaceholderUrl(path: string, width: number = 16): string {
    return this.cdn.getImageUrl(path, {
      width,
      quality: 20,
      blur: 20,
      format: 'jpeg',
    });
  }

  /**
   * Get social media optimized image
   */
  getSocialImage(
    path: string,
    platform: 'og' | 'twitter' | 'linkedin' = 'og'
  ): string {
    const dimensions = {
      og: { width: 1200, height: 630 },
      twitter: { width: 1200, height: 600 },
      linkedin: { width: 1200, height: 627 },
    };

    const { width, height } = dimensions[platform];

    return this.cdn.getImageUrl(path, {
      width,
      height,
      fit: 'cover',
      format: 'jpeg',
      quality: 85,
    });
  }

  /**
   * Get avatar image URL
   */
  getAvatarUrl(
    path: string,
    size: 'small' | 'medium' | 'large' = 'medium'
  ): string {
    const sizes = {
      small: 48,
      medium: 128,
      large: 256,
    };

    const dimension = sizes[size];

    return this.cdn.getImageUrl(path, {
      width: dimension,
      height: dimension,
      fit: 'cover',
      gravity: 'face',
      format: 'webp',
      quality: 85,
    });
  }
}

// Export singleton
export const imageOptimizer = new ImageOptimizer();
