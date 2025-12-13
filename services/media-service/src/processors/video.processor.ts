/**
 * Video Processor
 *
 * Handles video processing operations using FFmpeg:
 * - Transcoding to multiple formats
 * - Thumbnail extraction
 * - Resolution scaling
 * - Audio extraction
 * - GIF conversion
 */

import ffmpeg from 'fluent-ffmpeg';
import { createLogger } from '@textmesh/logger';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

const logger = createLogger({ service: 'video-processor' });

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  codec: string;
  fps: number;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  size: number;
}

export interface TranscodeOptions {
  width?: number;
  height?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  fps?: number;
  format?: 'mp4' | 'webm' | 'hls';
  codec?: 'h264' | 'h265' | 'vp9';
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
}

export interface ThumbnailOptions {
  timestamp?: string | number;
  width?: number;
  height?: number;
  count?: number;
}

// Predefined quality profiles
export const VIDEO_PROFILES = {
  '1080p': { width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
  '720p': { width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '128k' },
  '480p': { width: 854, height: 480, videoBitrate: '1000k', audioBitrate: '128k' },
  '360p': { width: 640, height: 360, videoBitrate: '500k', audioBitrate: '96k' },
  '240p': { width: 426, height: 240, videoBitrate: '300k', audioBitrate: '64k' },
} as const;

export class VideoProcessor {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'textmesh-video');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', { error });
    }
  }

  /**
   * Get video metadata
   */
  async getMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          logger.error('Failed to get video metadata', { error: err });
          return reject(err);
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        if (!videoStream) {
          return reject(new Error('No video stream found'));
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          bitrate: parseInt(String(metadata.format.bit_rate || '0'), 10),
          codec: videoStream.codec_name || 'unknown',
          fps: eval(videoStream.r_frame_rate || '0') || 0,
          audioCodec: audioStream?.codec_name,
          audioChannels: audioStream?.channels,
          audioSampleRate: audioStream?.sample_rate ? parseInt(String(audioStream.sample_rate), 10) : undefined,
          size: metadata.format.size || 0,
        });
      });
    });
  }

  /**
   * Transcode video to a different format/resolution
   */
  async transcode(
    inputPath: string,
    options: TranscodeOptions = {}
  ): Promise<{ outputPath: string; metadata: VideoMetadata }> {
    const {
      width,
      height,
      videoBitrate = '2500k',
      audioBitrate = '128k',
      fps,
      format = 'mp4',
      codec = 'h264',
      preset = 'medium',
    } = options;

    const outputFilename = `${uuid()}.${format}`;
    const outputPath = path.join(this.tempDir, outputFilename);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      // Video codec settings
      switch (codec) {
        case 'h264':
          command = command.videoCodec('libx264').outputOptions([
            `-preset ${preset}`,
            '-profile:v main',
            '-level 4.0',
            '-movflags +faststart',
          ]);
          break;
        case 'h265':
          command = command.videoCodec('libx265').outputOptions([
            `-preset ${preset}`,
            '-tag:v hvc1',
          ]);
          break;
        case 'vp9':
          command = command.videoCodec('libvpx-vp9').outputOptions([
            '-row-mt 1',
          ]);
          break;
      }

      // Resolution
      if (width || height) {
        const scale = width && height
          ? `${width}:${height}`
          : width
            ? `${width}:-2`
            : `-2:${height}`;
        command = command.outputOptions([`-vf scale=${scale}`]);
      }

      // Bitrates
      command = command
        .videoBitrate(videoBitrate)
        .audioBitrate(audioBitrate)
        .audioCodec('aac')
        .audioChannels(2);

      // FPS
      if (fps) {
        command = command.fps(fps);
      }

      // Output format
      command = command.format(format === 'hls' ? 'hls' : format);

      command
        .on('start', (commandLine) => {
          logger.debug('FFmpeg started', { commandLine });
        })
        .on('progress', (progress) => {
          logger.debug('Transcoding progress', { percent: progress.percent });
        })
        .on('error', (err) => {
          logger.error('Transcoding failed', { error: err });
          reject(err);
        })
        .on('end', async () => {
          logger.info('Transcoding complete', { outputPath });
          const metadata = await this.getMetadata(outputPath);
          resolve({ outputPath, metadata });
        })
        .save(outputPath);
    });
  }

  /**
   * Generate thumbnails from video
   */
  async generateThumbnails(
    inputPath: string,
    options: ThumbnailOptions = {}
  ): Promise<string[]> {
    const {
      timestamp = '00:00:01',
      width = 320,
      height,
      count = 1,
    } = options;

    const outputDir = path.join(this.tempDir, uuid());
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      if (count === 1) {
        // Single thumbnail at specific timestamp
        command
          .screenshots({
            timestamps: [timestamp] as string[],
            filename: 'thumb.jpg',
            folder: outputDir,
            size: height ? `${width}x${height}` : `${width}x?`,
          })
          .on('error', reject)
          .on('end', async () => {
            const files = await fs.readdir(outputDir);
            const paths = files.map((f) => path.join(outputDir, f));
            resolve(paths);
          });
      } else {
        // Multiple thumbnails throughout video
        command
          .screenshots({
            count,
            filename: 'thumb-%i.jpg',
            folder: outputDir,
            size: height ? `${width}x${height}` : `${width}x?`,
          })
          .on('error', reject)
          .on('end', async () => {
            const files = await fs.readdir(outputDir);
            const paths = files
              .sort()
              .map((f) => path.join(outputDir, f));
            resolve(paths);
          });
      }
    });
  }

  /**
   * Generate video preview (short clip)
   */
  async generatePreview(
    inputPath: string,
    duration: number = 10,
    startTime: number = 0
  ): Promise<string> {
    const outputPath = path.join(this.tempDir, `${uuid()}-preview.mp4`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .videoCodec('libx264')
        .outputOptions([
          '-preset veryfast',
          '-movflags +faststart',
          '-vf scale=480:-2',
        ])
        .videoBitrate('500k')
        .audioBitrate('64k')
        .audioCodec('aac')
        .on('error', reject)
        .on('end', () => resolve(outputPath))
        .save(outputPath);
    });
  }

  /**
   * Convert video to GIF
   */
  async toGif(
    inputPath: string,
    options: {
      startTime?: number;
      duration?: number;
      width?: number;
      fps?: number;
    } = {}
  ): Promise<string> {
    const {
      startTime = 0,
      duration = 5,
      width = 320,
      fps = 10,
    } = options;

    const outputPath = path.join(this.tempDir, `${uuid()}.gif`);
    const palettePath = path.join(this.tempDir, `${uuid()}-palette.png`);

    // Generate palette for better GIF quality
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions([
          `-vf fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`,
        ])
        .on('error', reject)
        .on('end', () => resolve())
        .save(palettePath);
    });

    // Generate GIF using palette
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .input(palettePath)
        .complexFilter([
          `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
        ])
        .on('error', reject)
        .on('end', async () => {
          await fs.unlink(palettePath).catch(() => {});
          resolve(outputPath);
        })
        .save(outputPath);
    });
  }

  /**
   * Extract audio from video
   */
  async extractAudio(
    inputPath: string,
    format: 'mp3' | 'aac' | 'wav' = 'mp3'
  ): Promise<string> {
    const outputPath = path.join(this.tempDir, `${uuid()}.${format}`);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath).noVideo();

      switch (format) {
        case 'mp3':
          command = command.audioCodec('libmp3lame').audioBitrate('192k');
          break;
        case 'aac':
          command = command.audioCodec('aac').audioBitrate('192k');
          break;
        case 'wav':
          command = command.audioCodec('pcm_s16le');
          break;
      }

      command
        .on('error', reject)
        .on('end', () => resolve(outputPath))
        .save(outputPath);
    });
  }

  /**
   * Transcode to multiple quality levels
   */
  async transcodeMultiQuality(
    inputPath: string,
    qualities: Array<keyof typeof VIDEO_PROFILES> = ['720p', '480p', '360p']
  ): Promise<Map<string, { outputPath: string; metadata: VideoMetadata }>> {
    const results = new Map<string, { outputPath: string; metadata: VideoMetadata }>();

    const metadata = await this.getMetadata(inputPath);

    // Filter out qualities higher than source
    const filteredQualities = qualities.filter((q) => {
      const profile = VIDEO_PROFILES[q];
      return profile.height <= metadata.height;
    });

    await Promise.all(
      filteredQualities.map(async (quality) => {
        const profile = VIDEO_PROFILES[quality];
        const result = await this.transcode(inputPath, {
          width: profile.width,
          height: profile.height,
          videoBitrate: profile.videoBitrate,
          audioBitrate: profile.audioBitrate,
          format: 'mp4',
          codec: 'h264',
          preset: 'medium',
        });
        results.set(quality, result);
      })
    );

    return results;
  }

  /**
   * Generate HLS playlist for adaptive streaming
   */
  async generateHLS(
    inputPath: string,
    outputDir: string
  ): Promise<{ playlistPath: string; variants: string[] }> {
    await fs.mkdir(outputDir, { recursive: true });

    const qualities: Array<keyof typeof VIDEO_PROFILES> = ['1080p', '720p', '480p', '360p'];
    const variants: string[] = [];

    // Generate each quality variant
    for (const quality of qualities) {
      const profile = VIDEO_PROFILES[quality];
      const variantDir = path.join(outputDir, quality);
      await fs.mkdir(variantDir, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions([
            `-vf scale=${profile.width}:${profile.height}`,
            `-b:v ${profile.videoBitrate}`,
            `-b:a ${profile.audioBitrate}`,
            '-preset fast',
            '-hls_time 6',
            '-hls_playlist_type vod',
            '-hls_segment_filename', path.join(variantDir, 'segment_%03d.ts'),
          ])
          .on('error', reject)
          .on('end', () => {
            variants.push(`${quality}/playlist.m3u8`);
            resolve();
          })
          .save(path.join(variantDir, 'playlist.m3u8'));
      });
    }

    // Generate master playlist
    const masterPlaylist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      ...qualities.map((q, i) => {
        const profile = VIDEO_PROFILES[q];
        const bandwidth = parseInt(profile.videoBitrate) * 1000;
        return [
          `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height}`,
          variants[i],
        ].join('\n');
      }),
    ].join('\n');

    const playlistPath = path.join(outputDir, 'master.m3u8');
    await fs.writeFile(playlistPath, masterPlaylist);

    return { playlistPath, variants };
  }

  /**
   * Clean up temporary files
   */
  async cleanup(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map(async (p) => {
        try {
          const stat = await fs.stat(p);
          if (stat.isDirectory()) {
            await fs.rm(p, { recursive: true });
          } else {
            await fs.unlink(p);
          }
        } catch (error) {
          // Ignore errors
        }
      })
    );
  }

  /**
   * Read file as buffer
   */
  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }
}

export const videoProcessor = new VideoProcessor();
