// =================================
// TEXTMESH RANKING SERVICE
// Complete Ranking & Recommendation Engine
// =================================

import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@textmesh/logger';
import { getRedisClient, getPrismaClient } from '@textmesh/db-client';

const app = express();
const logger = createLogger({ service: 'ranking-service' });
const PORT = process.env['PORT'] || 3009;

app.use(express.json());

// ============ RANKING ALGORITHMS ============

import { RankingEngine } from './engine/RankingEngine';
import { RecommendationEngine } from './engine/RecommendationEngine';
import { TrendingEngine } from './engine/TrendingEngine';
import { ColdStartEngine } from './engine/ColdStartEngine';

let rankingEngine: RankingEngine;
let recommendationEngine: RecommendationEngine;
let trendingEngine: TrendingEngine;
let coldStartEngine: ColdStartEngine;

// ============ API ENDPOINTS ============

// Rank posts for a user's feed
app.post('/api/ranking/feed', async (req: Request, res: Response) => {
  try {
    const { userId, posts, context } = req.body as {
      userId: string;
      posts: RankablePost[];
      context?: RankingContext;
    };

    const rankedPosts = await rankingEngine.rankPosts(userId, posts, context);

    res.json({
      success: true,
      data: rankedPosts,
    });
  } catch (error) {
    logger.error('Failed to rank posts', error);
    res.status(500).json({ success: false, error: 'Failed to rank posts' });
  }
});

// Get personalized recommendations for a user
app.get('/api/ranking/recommendations/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { type = 'users', limit = 20 } = req.query as {
      type?: 'users' | 'posts' | 'groups' | 'topics';
      limit?: number;
    };

    const recommendations = await recommendationEngine.getRecommendations(
      userId,
      type,
      Number(limit)
    );

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    logger.error('Failed to get recommendations', error);
    res.status(500).json({ success: false, error: 'Failed to get recommendations' });
  }
});

// Get trending content
app.get('/api/ranking/trending', async (req: Request, res: Response) => {
  try {
    const { type = 'posts', timeWindow = '24h', limit = 50 } = req.query as {
      type?: 'posts' | 'hashtags' | 'topics';
      timeWindow?: '1h' | '6h' | '24h' | '7d';
      limit?: number;
    };

    const trending = await trendingEngine.getTrending(type, timeWindow, Number(limit));

    res.json({
      success: true,
      data: trending,
    });
  } catch (error) {
    logger.error('Failed to get trending', error);
    res.status(500).json({ success: false, error: 'Failed to get trending' });
  }
});

// Cold start recommendations for new users
app.post('/api/ranking/cold-start', async (req: Request, res: Response) => {
  try {
    const { userId, interests, context } = req.body as {
      userId: string;
      interests?: string[];
      context?: ColdStartContext;
    };

    const recommendations = await coldStartEngine.getInitialRecommendations(
      userId,
      interests,
      context
    );

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    logger.error('Failed to get cold start recommendations', error);
    res.status(500).json({ success: false, error: 'Failed to get cold start recommendations' });
  }
});

// Record user interaction for learning
app.post('/api/ranking/interaction', async (req: Request, res: Response) => {
  try {
    const { userId, itemId, itemType, action, metadata } = req.body as UserInteraction;

    await rankingEngine.recordInteraction({
      userId,
      itemId,
      itemType,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to record interaction', error);
    res.status(500).json({ success: false, error: 'Failed to record interaction' });
  }
});

// Get user affinity scores
app.get('/api/ranking/affinity/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const affinities = await rankingEngine.getUserAffinities(userId);

    res.json({
      success: true,
      data: affinities,
    });
  } catch (error) {
    logger.error('Failed to get user affinities', error);
    res.status(500).json({ success: false, error: 'Failed to get user affinities' });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'ranking-service' });
});

// ============ TYPES ============

export interface RankablePost {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  metrics: PostMetrics;
  hashtags?: string[];
  mentions?: string[];
  groupId?: string;
}

export interface PostMetrics {
  likes: number;
  comments: number;
  reposts: number;
  views: number;
  shares: number;
}

export interface RankingContext {
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  timeOfDay?: number; // 0-23
  dayOfWeek?: number; // 0-6
  sessionDepth?: number;
  lastInteraction?: string;
}

export interface ColdStartContext {
  signupSource?: string;
  deviceType?: string;
  location?: string;
  language?: string;
}

export interface UserInteraction {
  userId: string;
  itemId: string;
  itemType: 'post' | 'user' | 'group' | 'hashtag';
  action: 'view' | 'like' | 'comment' | 'repost' | 'share' | 'follow' | 'hide' | 'report';
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface RankedPost extends RankablePost {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  rank: number;
}

export interface ScoreBreakdown {
  relevanceScore: number;
  recencyScore: number;
  engagementScore: number;
  authorAffinityScore: number;
  diversityScore: number;
  qualityScore: number;
}

// ============ STARTUP ============

async function main() {
  try {
    const redis = getRedisClient();
    const prisma = getPrismaClient();

    // Initialize engines
    rankingEngine = new RankingEngine(redis, prisma);
    recommendationEngine = new RecommendationEngine(redis, prisma);
    trendingEngine = new TrendingEngine(redis, prisma);
    coldStartEngine = new ColdStartEngine(redis, prisma);

    app.listen(PORT, () => {
      logger.info(`Ranking service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start ranking service', error);
    process.exit(1);
  }
}

main();

export { app };
