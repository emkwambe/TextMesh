import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '@textmesh/db-client';
import { redis } from '../lib/redis';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = createApp();

describe('Auth Service', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { contains: '@test.textmesh.com' } }
    });
    await redis.flushdb();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@test.textmesh.com',
        password: 'SecurePass123!',
        username: 'testuser_' + Date.now(),
        displayName: 'Test User'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.username).toBe(userData.username);
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should reject registration with existing email', async () => {
      const userData = {
        email: 'duplicate@test.textmesh.com',
        password: 'SecurePass123!',
        username: 'testuser1_' + Date.now(),
        displayName: 'Test User 1'
      };

      // First registration
      await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Duplicate email registration
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...userData,
          username: 'testuser2_' + Date.now()
        })
        .expect(409);

      expect(response.body.error).toContain('email');
    });

    it('should reject weak passwords', async () => {
      const userData = {
        email: 'weakpass@test.textmesh.com',
        password: '123456',
        username: 'weakuser_' + Date.now(),
        displayName: 'Weak User'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('password');
    });

    it('should reject invalid email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'SecurePass123!',
        username: 'invaliduser_' + Date.now(),
        displayName: 'Invalid User'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('email');
    });

    it('should reject username with special characters', async () => {
      const userData = {
        email: 'special@test.textmesh.com',
        password: 'SecurePass123!',
        username: 'user@name!',
        displayName: 'Special User'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('username');
    });
  });

  describe('POST /auth/login', () => {
    const testUser = {
      email: 'login@test.textmesh.com',
      password: 'SecurePass123!',
      username: 'loginuser',
      displayName: 'Login User'
    };

    beforeEach(async () => {
      const passwordHash = await bcrypt.hash(testUser.password, 12);
      await prisma.user.create({
        data: {
          email: testUser.email,
          passwordHash,
          username: testUser.username,
          displayName: testUser.displayName
        }
      });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.textmesh.com',
          password: 'anypassword'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });

    it('should rate limit after multiple failed attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: 'wrongpassword'
          });
      }

      // Next attempt should be rate limited
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(429);

      expect(response.body.error).toContain('rate');
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: 'refresh@test.textmesh.com',
          passwordHash: await bcrypt.hash('SecurePass123!', 12),
          username: 'refreshuser',
          displayName: 'Refresh User'
        }
      });
      userId = user.id;

      refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '7d' }
      );

      await redis.set(`refresh:${user.id}:${refreshToken}`, 'valid', 'EX', 604800);
    });

    it('should refresh tokens successfully', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });

    it('should reject expired refresh token', async () => {
      const expiredToken = jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '-1s' }
      );

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.error).toContain('expired');
    });
  });

  describe('POST /auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: 'logout@test.textmesh.com',
          passwordHash: await bcrypt.hash('SecurePass123!', 12),
          username: 'logoutuser',
          displayName: 'Logout User'
        }
      });

      accessToken = jwt.sign(
        { userId: user.id, type: 'access' },
        process.env.JWT_ACCESS_SECRET || 'test-access-secret',
        { expiresIn: '15m' }
      );

      refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '7d' }
      );

      await redis.set(`refresh:${user.id}:${refreshToken}`, 'valid', 'EX', 604800);
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(response.body.message).toContain('success');
    });

    it('should invalidate refresh token after logout', async () => {
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Try to use the refresh token
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.error).toContain('Invalid');
    });
  });

  describe('POST /auth/forgot-password', () => {
    beforeEach(async () => {
      await prisma.user.create({
        data: {
          email: 'forgot@test.textmesh.com',
          passwordHash: await bcrypt.hash('SecurePass123!', 12),
          username: 'forgotuser',
          displayName: 'Forgot User'
        }
      });
    });

    it('should send password reset email for valid user', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'forgot@test.textmesh.com' })
        .expect(200);

      expect(response.body.message).toContain('sent');
    });

    it('should return success even for non-existent email (security)', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@test.textmesh.com' })
        .expect(200);

      expect(response.body.message).toContain('sent');
    });
  });

  describe('Token Validation', () => {
    it('should validate a valid access token', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'validate@test.textmesh.com',
          passwordHash: await bcrypt.hash('SecurePass123!', 12),
          username: 'validateuser',
          displayName: 'Validate User'
        }
      });

      const accessToken = jwt.sign(
        { userId: user.id, type: 'access' },
        process.env.JWT_ACCESS_SECRET || 'test-access-secret',
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.userId).toBe(user.id);
    });

    it('should reject an invalid token', async () => {
      const response = await request(app)
        .get('/auth/validate')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.valid).toBe(false);
    });
  });
});

describe('OAuth Integration', () => {
  describe('GET /auth/google', () => {
    it('should redirect to Google OAuth', async () => {
      const response = await request(app)
        .get('/auth/google')
        .expect(302);

      expect(response.headers.location).toContain('accounts.google.com');
    });
  });

  describe('GET /auth/apple', () => {
    it('should redirect to Apple OAuth', async () => {
      const response = await request(app)
        .get('/auth/apple')
        .expect(302);

      expect(response.headers.location).toContain('appleid.apple.com');
    });
  });
});
