import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
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

describe('User Service', () => {
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
    await prisma.follow.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: '@usertest.textmesh.com' } }
    });
    await redis.flushdb();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'testuser@usertest.textmesh.com',
        passwordHash: 'hashed',
        username: 'testuser_' + Date.now(),
        displayName: 'Test User',
        bio: 'Test bio',
        location: 'Test City',
        website: 'https://test.com'
      }
    });
    authToken = generateToken(testUser.id);
  });

  describe('GET /users/:username', () => {
    it('should return user profile by username', async () => {
      const response = await request(app)
        .get(`/users/${testUser.username}`)
        .expect(200);

      expect(response.body.username).toBe(testUser.username);
      expect(response.body.displayName).toBe(testUser.displayName);
      expect(response.body.bio).toBe(testUser.bio);
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('email');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/users/nonexistent_user_12345')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should include follower and following counts', async () => {
      // Create followers
      for (let i = 0; i < 5; i++) {
        const follower = await prisma.user.create({
          data: {
            email: `follower${i}@usertest.textmesh.com`,
            passwordHash: 'hashed',
            username: `follower${i}_${Date.now()}`,
            displayName: `Follower ${i}`
          }
        });
        await prisma.follow.create({
          data: {
            followerId: follower.id,
            followingId: testUser.id
          }
        });
      }

      const response = await request(app)
        .get(`/users/${testUser.username}`)
        .expect(200);

      expect(response.body.followersCount).toBe(5);
    });

    it('should indicate if authenticated user follows the profile', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@usertest.textmesh.com',
          passwordHash: 'hashed',
          username: 'otheruser_' + Date.now(),
          displayName: 'Other User'
        }
      });

      await prisma.follow.create({
        data: {
          followerId: testUser.id,
          followingId: otherUser.id
        }
      });

      const response = await request(app)
        .get(`/users/${otherUser.username}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.isFollowing).toBe(true);
    });
  });

  describe('GET /users/:id/profile', () => {
    it('should return user profile by ID', async () => {
      const response = await request(app)
        .get(`/users/${testUser.id}/profile`)
        .expect(200);

      expect(response.body.id).toBe(testUser.id);
      expect(response.body.username).toBe(testUser.username);
    });
  });

  describe('PATCH /users/me', () => {
    it('should update user profile', async () => {
      const updateData = {
        displayName: 'Updated Name',
        bio: 'Updated bio',
        location: 'New City'
      };

      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.displayName).toBe(updateData.displayName);
      expect(response.body.bio).toBe(updateData.bio);
      expect(response.body.location).toBe(updateData.location);
    });

    it('should reject invalid website URL', async () => {
      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ website: 'not-a-valid-url' })
        .expect(400);

      expect(response.body.error).toContain('website');
    });

    it('should reject bio exceeding max length', async () => {
      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ bio: 'a'.repeat(501) })
        .expect(400);

      expect(response.body.error).toContain('bio');
    });

    it('should require authentication', async () => {
      await request(app)
        .patch('/users/me')
        .send({ displayName: 'Should Fail' })
        .expect(401);
    });
  });

  describe('POST /users/:id/follow', () => {
    let targetUser: any;

    beforeEach(async () => {
      targetUser = await prisma.user.create({
        data: {
          email: 'target@usertest.textmesh.com',
          passwordHash: 'hashed',
          username: 'targetuser_' + Date.now(),
          displayName: 'Target User'
        }
      });
    });

    it('should follow a user', async () => {
      const response = await request(app)
        .post(`/users/${targetUser.id}/follow`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.following).toBe(true);

      // Verify follow relationship exists
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser.id,
            followingId: targetUser.id
          }
        }
      });
      expect(follow).toBeDefined();
    });

    it('should unfollow when already following', async () => {
      // First follow
      await prisma.follow.create({
        data: {
          followerId: testUser.id,
          followingId: targetUser.id
        }
      });

      // Unfollow
      const response = await request(app)
        .post(`/users/${targetUser.id}/follow`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.following).toBe(false);
    });

    it('should not allow following yourself', async () => {
      const response = await request(app)
        .post(`/users/${testUser.id}/follow`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('yourself');
    });

    it('should not allow following a blocked user', async () => {
      await prisma.block.create({
        data: {
          blockerId: testUser.id,
          blockedId: targetUser.id
        }
      });

      const response = await request(app)
        .post(`/users/${targetUser.id}/follow`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toContain('blocked');
    });
  });

  describe('GET /users/:id/followers', () => {
    beforeEach(async () => {
      // Create followers
      for (let i = 0; i < 10; i++) {
        const follower = await prisma.user.create({
          data: {
            email: `follower${i}@usertest.textmesh.com`,
            passwordHash: 'hashed',
            username: `follower${i}_${Date.now()}`,
            displayName: `Follower ${i}`
          }
        });
        await prisma.follow.create({
          data: {
            followerId: follower.id,
            followingId: testUser.id
          }
        });
      }
    });

    it('should return paginated followers', async () => {
      const response = await request(app)
        .get(`/users/${testUser.id}/followers`)
        .query({ limit: 5 })
        .expect(200);

      expect(response.body.users).toHaveLength(5);
      expect(response.body.cursor).toBeDefined();
    });

    it('should return all followers with pagination', async () => {
      const response1 = await request(app)
        .get(`/users/${testUser.id}/followers`)
        .query({ limit: 5 })
        .expect(200);

      const response2 = await request(app)
        .get(`/users/${testUser.id}/followers`)
        .query({ limit: 5, cursor: response1.body.cursor })
        .expect(200);

      expect(response2.body.users).toHaveLength(5);
    });
  });

  describe('GET /users/:id/following', () => {
    beforeEach(async () => {
      // Create users that testUser follows
      for (let i = 0; i < 8; i++) {
        const followed = await prisma.user.create({
          data: {
            email: `followed${i}@usertest.textmesh.com`,
            passwordHash: 'hashed',
            username: `followed${i}_${Date.now()}`,
            displayName: `Followed ${i}`
          }
        });
        await prisma.follow.create({
          data: {
            followerId: testUser.id,
            followingId: followed.id
          }
        });
      }
    });

    it('should return users being followed', async () => {
      const response = await request(app)
        .get(`/users/${testUser.id}/following`)
        .expect(200);

      expect(response.body.users).toHaveLength(8);
    });
  });

  describe('POST /users/:id/block', () => {
    let targetUser: any;

    beforeEach(async () => {
      targetUser = await prisma.user.create({
        data: {
          email: 'blockme@usertest.textmesh.com',
          passwordHash: 'hashed',
          username: 'blockme_' + Date.now(),
          displayName: 'Block Me'
        }
      });
    });

    it('should block a user', async () => {
      const response = await request(app)
        .post(`/users/${targetUser.id}/block`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.blocked).toBe(true);
    });

    it('should remove follow relationship when blocking', async () => {
      // First follow the user
      await prisma.follow.create({
        data: {
          followerId: testUser.id,
          followingId: targetUser.id
        }
      });

      await request(app)
        .post(`/users/${targetUser.id}/block`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify follow relationship is removed
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser.id,
            followingId: targetUser.id
          }
        }
      });
      expect(follow).toBeNull();
    });

    it('should unblock when already blocked', async () => {
      await prisma.block.create({
        data: {
          blockerId: testUser.id,
          blockedId: targetUser.id
        }
      });

      const response = await request(app)
        .post(`/users/${targetUser.id}/block`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.blocked).toBe(false);
    });
  });

  describe('POST /users/:id/mute', () => {
    let targetUser: any;

    beforeEach(async () => {
      targetUser = await prisma.user.create({
        data: {
          email: 'muteme@usertest.textmesh.com',
          passwordHash: 'hashed',
          username: 'muteme_' + Date.now(),
          displayName: 'Mute Me'
        }
      });
    });

    it('should mute a user', async () => {
      const response = await request(app)
        .post(`/users/${targetUser.id}/mute`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.muted).toBe(true);
    });

    it('should unmute when already muted', async () => {
      await prisma.mute.create({
        data: {
          muterId: testUser.id,
          mutedId: targetUser.id
        }
      });

      const response = await request(app)
        .post(`/users/${targetUser.id}/mute`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.muted).toBe(false);
    });
  });

  describe('GET /users/search', () => {
    beforeEach(async () => {
      const users = [
        { username: 'alice_dev', displayName: 'Alice Developer' },
        { username: 'bob_design', displayName: 'Bob Designer' },
        { username: 'charlie_dev', displayName: 'Charlie Developer' }
      ];

      for (const user of users) {
        await prisma.user.create({
          data: {
            email: `${user.username}@usertest.textmesh.com`,
            passwordHash: 'hashed',
            username: user.username,
            displayName: user.displayName
          }
        });
      }
    });

    it('should search users by username', async () => {
      const response = await request(app)
        .get('/users/search')
        .query({ q: 'alice' })
        .expect(200);

      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0].username).toBe('alice_dev');
    });

    it('should search users by display name', async () => {
      const response = await request(app)
        .get('/users/search')
        .query({ q: 'Developer' })
        .expect(200);

      expect(response.body.users).toHaveLength(2);
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/users/search')
        .query({ q: 'nonexistent_xyz' })
        .expect(200);

      expect(response.body.users).toHaveLength(0);
    });
  });

  describe('GET /users/me', () => {
    it('should return authenticated user profile', async () => {
      const response = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(testUser.id);
      expect(response.body.email).toBe(testUser.email);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/users/me')
        .expect(401);
    });
  });

  describe('User Settings', () => {
    it('should update notification settings', async () => {
      const response = await request(app)
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notifications: {
            likes: true,
            replies: true,
            follows: false,
            mentions: true
          }
        })
        .expect(200);

      expect(response.body.notifications.follows).toBe(false);
    });

    it('should update privacy settings', async () => {
      const response = await request(app)
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          privacy: {
            profileVisibility: 'public',
            allowDMs: 'followers'
          }
        })
        .expect(200);

      expect(response.body.privacy.allowDMs).toBe('followers');
    });
  });
});
