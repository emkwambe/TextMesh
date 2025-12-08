import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '@textmesh/db-client';
import { redis } from '../lib/redis';
import jwt from 'jsonwebtoken';

const app = createApp();

// Helper to generate auth token
const generateToken = (userId: string) => {
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_ACCESS_SECRET || 'test-access-secret',
    { expiresIn: '15m' }
  );
};

describe('Post Service', () => {
  let testUser: any;
  let authToken: string;

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
      where: { content: { contains: '[TEST]' } }
    });
    await prisma.user.deleteMany({
      where: { email: { contains: '@posttest.textmesh.com' } }
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'postuser@posttest.textmesh.com',
        passwordHash: 'hashed',
        username: 'postuser_' + Date.now(),
        displayName: 'Post Test User'
      }
    });
    authToken = generateToken(testUser.id);
  });

  describe('POST /posts', () => {
    it('should create a new post successfully', async () => {
      const postData = {
        content: '[TEST] This is a test post',
        visibility: 'public'
      };

      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.content).toBe(postData.content);
      expect(response.body.authorId).toBe(testUser.id);
      expect(response.body.visibility).toBe('public');
    });

    it('should reject posts exceeding character limit', async () => {
      const postData = {
        content: '[TEST] ' + 'a'.repeat(2001),
        visibility: 'public'
      };

      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(400);

      expect(response.body.error).toContain('character');
    });

    it('should reject empty posts', async () => {
      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '', visibility: 'public' })
        .expect(400);

      expect(response.body.error).toContain('empty');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/posts')
        .send({ content: '[TEST] No auth', visibility: 'public' })
        .expect(401);

      expect(response.body.error).toContain('auth');
    });

    it('should create a post with styling', async () => {
      const postData = {
        content: '[TEST] Styled post',
        visibility: 'public',
        styling: {
          template: 'gradient',
          colors: ['#FF6B6B', '#4ECDC4'],
          fontSize: 'large'
        }
      };

      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.styling).toBeDefined();
      expect(response.body.styling.template).toBe('gradient');
    });

    it('should parse mentions correctly', async () => {
      const mentionedUser = await prisma.user.create({
        data: {
          email: 'mentioned@posttest.textmesh.com',
          passwordHash: 'hashed',
          username: 'mentioneduser',
          displayName: 'Mentioned User'
        }
      });

      const postData = {
        content: '[TEST] Hello @mentioneduser how are you?',
        visibility: 'public'
      };

      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.mentions).toContain(mentionedUser.id);
    });

    it('should parse hashtags correctly', async () => {
      const postData = {
        content: '[TEST] Check out #textmesh #launch today!',
        visibility: 'public'
      };

      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.hashtags).toContain('textmesh');
      expect(response.body.hashtags).toContain('launch');
    });
  });

  describe('GET /posts/:id', () => {
    let testPost: any;

    beforeEach(async () => {
      testPost = await prisma.post.create({
        data: {
          content: '[TEST] Existing post',
          authorId: testUser.id,
          visibility: 'public'
        }
      });
    });

    it('should retrieve a public post', async () => {
      const response = await request(app)
        .get(`/posts/${testPost.id}`)
        .expect(200);

      expect(response.body.id).toBe(testPost.id);
      expect(response.body.content).toBe(testPost.content);
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .get('/posts/nonexistent-id')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should include author info in response', async () => {
      const response = await request(app)
        .get(`/posts/${testPost.id}`)
        .expect(200);

      expect(response.body.author).toBeDefined();
      expect(response.body.author.username).toBe(testUser.username);
    });

    it('should include engagement stats', async () => {
      const response = await request(app)
        .get(`/posts/${testPost.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('likesCount');
      expect(response.body).toHaveProperty('repliesCount');
      expect(response.body).toHaveProperty('repostsCount');
    });
  });

  describe('DELETE /posts/:id', () => {
    let testPost: any;

    beforeEach(async () => {
      testPost = await prisma.post.create({
        data: {
          content: '[TEST] Post to delete',
          authorId: testUser.id,
          visibility: 'public'
        }
      });
    });

    it('should delete own post', async () => {
      await request(app)
        .delete(`/posts/${testPost.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const deletedPost = await prisma.post.findUnique({
        where: { id: testPost.id }
      });
      expect(deletedPost).toBeNull();
    });

    it('should not allow deleting other users posts', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@posttest.textmesh.com',
          passwordHash: 'hashed',
          username: 'otheruser_' + Date.now(),
          displayName: 'Other User'
        }
      });
      const otherToken = generateToken(otherUser.id);

      const response = await request(app)
        .delete(`/posts/${testPost.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.error).toContain('permission');
    });
  });

  describe('POST /posts/:id/like', () => {
    let testPost: any;

    beforeEach(async () => {
      testPost = await prisma.post.create({
        data: {
          content: '[TEST] Post to like',
          authorId: testUser.id,
          visibility: 'public'
        }
      });
    });

    it('should like a post', async () => {
      const response = await request(app)
        .post(`/posts/${testPost.id}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.liked).toBe(true);
      expect(response.body.likesCount).toBe(1);
    });

    it('should unlike a post when liked again', async () => {
      // First like
      await request(app)
        .post(`/posts/${testPost.id}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Unlike
      const response = await request(app)
        .post(`/posts/${testPost.id}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.liked).toBe(false);
      expect(response.body.likesCount).toBe(0);
    });
  });

  describe('POST /posts/:id/reply', () => {
    let parentPost: any;

    beforeEach(async () => {
      parentPost = await prisma.post.create({
        data: {
          content: '[TEST] Parent post',
          authorId: testUser.id,
          visibility: 'public'
        }
      });
    });

    it('should create a reply', async () => {
      const replyData = {
        content: '[TEST] This is a reply'
      };

      const response = await request(app)
        .post(`/posts/${parentPost.id}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(replyData)
        .expect(201);

      expect(response.body.parentId).toBe(parentPost.id);
      expect(response.body.content).toBe(replyData.content);
    });

    it('should increment reply count on parent', async () => {
      await request(app)
        .post(`/posts/${parentPost.id}/reply`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '[TEST] Reply 1' })
        .expect(201);

      const parent = await prisma.post.findUnique({
        where: { id: parentPost.id }
      });
      expect(parent?.repliesCount).toBe(1);
    });
  });

  describe('POST /posts/:id/repost', () => {
    let originalPost: any;

    beforeEach(async () => {
      originalPost = await prisma.post.create({
        data: {
          content: '[TEST] Original post',
          authorId: testUser.id,
          visibility: 'public'
        }
      });
    });

    it('should create a repost', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'reposter@posttest.textmesh.com',
          passwordHash: 'hashed',
          username: 'reposter_' + Date.now(),
          displayName: 'Reposter'
        }
      });
      const otherToken = generateToken(otherUser.id);

      const response = await request(app)
        .post(`/posts/${originalPost.id}/repost`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(201);

      expect(response.body.repostedPostId).toBe(originalPost.id);
    });

    it('should create a quote repost with content', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'quoter@posttest.textmesh.com',
          passwordHash: 'hashed',
          username: 'quoter_' + Date.now(),
          displayName: 'Quoter'
        }
      });
      const otherToken = generateToken(otherUser.id);

      const response = await request(app)
        .post(`/posts/${originalPost.id}/repost`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ content: '[TEST] My thoughts on this' })
        .expect(201);

      expect(response.body.content).toBe('[TEST] My thoughts on this');
      expect(response.body.repostedPostId).toBe(originalPost.id);
    });
  });

  describe('GET /posts/:id/replies', () => {
    let parentPost: any;

    beforeEach(async () => {
      parentPost = await prisma.post.create({
        data: {
          content: '[TEST] Parent for replies',
          authorId: testUser.id,
          visibility: 'public'
        }
      });

      // Create replies
      for (let i = 0; i < 5; i++) {
        await prisma.post.create({
          data: {
            content: `[TEST] Reply ${i}`,
            authorId: testUser.id,
            parentId: parentPost.id,
            visibility: 'public'
          }
        });
      }
    });

    it('should return replies with pagination', async () => {
      const response = await request(app)
        .get(`/posts/${parentPost.id}/replies`)
        .query({ limit: 3 })
        .expect(200);

      expect(response.body.replies).toHaveLength(3);
      expect(response.body).toHaveProperty('cursor');
    });

    it('should sort replies by engagement', async () => {
      const response = await request(app)
        .get(`/posts/${parentPost.id}/replies`)
        .query({ sort: 'top' })
        .expect(200);

      expect(response.body.replies).toBeDefined();
    });
  });

  describe('Visibility Rules', () => {
    it('should not expose private posts to unauthorized users', async () => {
      const privatePost = await prisma.post.create({
        data: {
          content: '[TEST] Private post',
          authorId: testUser.id,
          visibility: 'private'
        }
      });

      const otherUser = await prisma.user.create({
        data: {
          email: 'voyeur@posttest.textmesh.com',
          passwordHash: 'hashed',
          username: 'voyeur_' + Date.now(),
          displayName: 'Voyeur'
        }
      });
      const otherToken = generateToken(otherUser.id);

      const response = await request(app)
        .get(`/posts/${privatePost.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should allow followers to see followers-only posts', async () => {
      const followerOnlyPost = await prisma.post.create({
        data: {
          content: '[TEST] Followers only post',
          authorId: testUser.id,
          visibility: 'followers'
        }
      });

      const follower = await prisma.user.create({
        data: {
          email: 'follower@posttest.textmesh.com',
          passwordHash: 'hashed',
          username: 'follower_' + Date.now(),
          displayName: 'Follower'
        }
      });

      // Create follow relationship
      await prisma.follow.create({
        data: {
          followerId: follower.id,
          followingId: testUser.id
        }
      });

      const followerToken = generateToken(follower.id);

      const response = await request(app)
        .get(`/posts/${followerOnlyPost.id}`)
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(200);

      expect(response.body.id).toBe(followerOnlyPost.id);
    });
  });

  describe('Content Moderation', () => {
    it('should flag posts with prohibited content', async () => {
      const postData = {
        content: '[TEST] This contains spam spam spam buy now!!!',
        visibility: 'public'
      };

      const response = await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(postData)
        .expect(201);

      expect(response.body.moderationStatus).toBe('pending');
    });
  });
});
