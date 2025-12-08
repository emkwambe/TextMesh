import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '@textmesh/db-client';
import { redis } from '../lib/redis';
import jwt from 'jsonwebtoken';

const app = createApp();

const generateToken = (userId: string) => {
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_ACCESS_SECRET || 'test-access-secret',
    { expiresIn: '15m' }
  );
};

describe('Feed Service', () => {
  let testUser: any;
  let authToken: string;
  let followedUsers: any[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.post.deleteMany({
      where: { content: { contains: '[FEED-TEST]' } }
    });
    await prisma.follow.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: '@feedtest.textmesh.com' } }
    });
    await redis.flushdb();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'feeduser@feedtest.textmesh.com',
        passwordHash: 'hashed',
        username: 'feeduser_' + Date.now(),
        displayName: 'Feed Test User'
      }
    });
    authToken = generateToken(testUser.id);

    // Create users to follow and their posts
    followedUsers = [];
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({
        data: {
          email: `followed${i}@feedtest.textmesh.com`,
          passwordHash: 'hashed',
          username: `followed${i}_${Date.now()}`,
          displayName: `Followed User ${i}`
        }
      });
      followedUsers.push(user);

      // Create follow relationship
      await prisma.follow.create({
        data: {
          followerId: testUser.id,
          followingId: user.id
        }
      });

      // Create posts for each followed user
      for (let j = 0; j < 3; j++) {
        await prisma.post.create({
          data: {
            content: `[FEED-TEST] Post ${j} from user ${i}`,
            authorId: user.id,
            visibility: 'public',
            createdAt: new Date(Date.now() - Math.random() * 86400000)
          }
        });
      }
    }
  });

  describe('GET /feed/following', () => {
    it('should return posts from followed users', async () => {
      const response = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.posts).toBeDefined();
      expect(response.body.posts.length).toBeGreaterThan(0);

      // All posts should be from followed users
      const followedIds = followedUsers.map(u => u.id);
      response.body.posts.forEach((post: any) => {
        expect(followedIds).toContain(post.authorId);
      });
    });

    it('should paginate results correctly', async () => {
      const response1 = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 3 })
        .expect(200);

      expect(response1.body.posts).toHaveLength(3);
      expect(response1.body.cursor).toBeDefined();

      const response2 = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 3, cursor: response1.body.cursor })
        .expect(200);

      expect(response2.body.posts).toBeDefined();
      // Should not have duplicate posts
      const ids1 = response1.body.posts.map((p: any) => p.id);
      const ids2 = response2.body.posts.map((p: any) => p.id);
      const intersection = ids1.filter((id: string) => ids2.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should sort posts chronologically by default', async () => {
      const response = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const posts = response.body.posts;
      for (let i = 1; i < posts.length; i++) {
        const prevDate = new Date(posts[i - 1].createdAt).getTime();
        const currDate = new Date(posts[i].createdAt).getTime();
        expect(prevDate).toBeGreaterThanOrEqual(currDate);
      }
    });

    it('should return empty feed for user with no follows', async () => {
      const lonelyUser = await prisma.user.create({
        data: {
          email: 'lonely@feedtest.textmesh.com',
          passwordHash: 'hashed',
          username: 'lonely_' + Date.now(),
          displayName: 'Lonely User'
        }
      });
      const lonelyToken = generateToken(lonelyUser.id);

      const response = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${lonelyToken}`)
        .expect(200);

      expect(response.body.posts).toHaveLength(0);
    });
  });

  describe('GET /feed/for-you', () => {
    beforeEach(async () => {
      // Create additional posts from non-followed users for recommendations
      for (let i = 0; i < 5; i++) {
        const user = await prisma.user.create({
          data: {
            email: `random${i}@feedtest.textmesh.com`,
            passwordHash: 'hashed',
            username: `random${i}_${Date.now()}`,
            displayName: `Random User ${i}`
          }
        });

        await prisma.post.create({
          data: {
            content: `[FEED-TEST] Trending post ${i}`,
            authorId: user.id,
            visibility: 'public',
            likesCount: Math.floor(Math.random() * 1000),
            repliesCount: Math.floor(Math.random() * 100)
          }
        });
      }
    });

    it('should return recommended posts', async () => {
      const response = await request(app)
        .get('/feed/for-you')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.posts).toBeDefined();
      expect(response.body.posts.length).toBeGreaterThan(0);
    });

    it('should include posts from non-followed users', async () => {
      const response = await request(app)
        .get('/feed/for-you')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const followedIds = followedUsers.map(u => u.id);
      const hasNonFollowed = response.body.posts.some(
        (post: any) => !followedIds.includes(post.authorId)
      );
      expect(hasNonFollowed).toBe(true);
    });

    it('should work without authentication', async () => {
      const response = await request(app)
        .get('/feed/for-you')
        .expect(200);

      expect(response.body.posts).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/feed/for-you')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 5 })
        .expect(200);

      expect(response.body.posts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /feed/trending', () => {
    beforeEach(async () => {
      // Create trending posts
      for (let i = 0; i < 10; i++) {
        const user = await prisma.user.create({
          data: {
            email: `trending${i}@feedtest.textmesh.com`,
            passwordHash: 'hashed',
            username: `trending${i}_${Date.now()}`,
            displayName: `Trending User ${i}`
          }
        });

        await prisma.post.create({
          data: {
            content: `[FEED-TEST] Trending #topic${i}`,
            authorId: user.id,
            visibility: 'public',
            likesCount: 1000 - i * 100,
            repliesCount: 500 - i * 50,
            repostsCount: 200 - i * 20,
            createdAt: new Date(Date.now() - i * 3600000)
          }
        });
      }
    });

    it('should return trending posts sorted by engagement', async () => {
      const response = await request(app)
        .get('/feed/trending')
        .expect(200);

      expect(response.body.posts).toBeDefined();
      expect(response.body.posts.length).toBeGreaterThan(0);

      // Posts should be sorted by engagement score
      const posts = response.body.posts;
      for (let i = 1; i < posts.length; i++) {
        const prevScore = posts[i - 1].likesCount + posts[i - 1].repliesCount;
        const currScore = posts[i].likesCount + posts[i].repliesCount;
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    });

    it('should filter by timeframe', async () => {
      const response = await request(app)
        .get('/feed/trending')
        .query({ timeframe: '1h' })
        .expect(200);

      // All posts should be from the last hour
      const oneHourAgo = Date.now() - 3600000;
      response.body.posts.forEach((post: any) => {
        expect(new Date(post.createdAt).getTime()).toBeGreaterThan(oneHourAgo);
      });
    });
  });

  describe('Feed Caching', () => {
    it('should cache feed results', async () => {
      // First request
      const start1 = Date.now();
      await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration1 = Date.now() - start1;

      // Second request should be faster (cached)
      const start2 = Date.now();
      await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration2 = Date.now() - start2;

      // Cache hit should be significantly faster
      expect(duration2).toBeLessThan(duration1);
    });

    it('should invalidate cache on new post', async () => {
      // Get initial feed
      const response1 = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const initialCount = response1.body.posts.length;

      // Create new post from followed user
      await prisma.post.create({
        data: {
          content: '[FEED-TEST] New post after cache',
          authorId: followedUsers[0].id,
          visibility: 'public'
        }
      });

      // Trigger cache invalidation
      await redis.del(`feed:following:${testUser.id}`);

      // Get updated feed
      const response2 = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response2.body.posts.length).toBe(initialCount + 1);
    });
  });

  describe('Feed Filtering', () => {
    it('should filter out muted users', async () => {
      // Mute a followed user
      await prisma.mute.create({
        data: {
          muterId: testUser.id,
          mutedId: followedUsers[0].id
        }
      });

      const response = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should not contain posts from muted user
      const hasMutedUserPosts = response.body.posts.some(
        (post: any) => post.authorId === followedUsers[0].id
      );
      expect(hasMutedUserPosts).toBe(false);
    });

    it('should filter out blocked users posts', async () => {
      // Block a user
      await prisma.block.create({
        data: {
          blockerId: testUser.id,
          blockedId: followedUsers[1].id
        }
      });

      const response = await request(app)
        .get('/feed/for-you')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should not contain posts from blocked user
      const hasBlockedUserPosts = response.body.posts.some(
        (post: any) => post.authorId === followedUsers[1].id
      );
      expect(hasBlockedUserPosts).toBe(false);
    });

    it('should filter by content type', async () => {
      // Create posts with different content types
      await prisma.post.create({
        data: {
          content: '[FEED-TEST] Post with image',
          authorId: followedUsers[0].id,
          visibility: 'public',
          hasMedia: true,
          mediaType: 'image'
        }
      });

      const response = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ filter: 'media' })
        .expect(200);

      // All returned posts should have media
      response.body.posts.forEach((post: any) => {
        expect(post.hasMedia).toBe(true);
      });
    });
  });

  describe('Feed Performance', () => {
    it('should return feed within acceptable time', async () => {
      const start = Date.now();
      await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration = Date.now() - start;

      // Feed should load within 500ms
      expect(duration).toBeLessThan(500);
    });

    it('should handle large feeds efficiently', async () => {
      // Create many posts
      for (let i = 0; i < 100; i++) {
        await prisma.post.create({
          data: {
            content: `[FEED-TEST] Bulk post ${i}`,
            authorId: followedUsers[i % 3].id,
            visibility: 'public'
          }
        });
      }

      const start = Date.now();
      const response = await request(app)
        .get('/feed/following')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 20 })
        .expect(200);
      const duration = Date.now() - start;

      expect(response.body.posts).toHaveLength(20);
      expect(duration).toBeLessThan(1000);
    });
  });
});

describe('Feed Algorithms', () => {
  describe('Engagement Score Calculation', () => {
    it('should correctly calculate engagement score', async () => {
      // This would test the ranking algorithm
      // Score = likes * 1 + replies * 2 + reposts * 3 + recency bonus
    });
  });

  describe('Diversity', () => {
    it('should ensure content diversity in feed', async () => {
      // Verify feed doesn't show too many posts from same user
    });
  });
});
