// =================================
// AUTH VALIDATION SCHEMAS
// =================================

import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    phone: z.string().min(10).max(15).optional(),
  }).refine(
    (data) => data.email || data.phone,
    { message: 'Either email or phone is required' }
  ),
});

export const verifyOTPSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Identifier is required'),
    code: z.string().length(6, 'Code must be 6 digits'),
    deviceInfo: z.object({
      deviceId: z.string(),
      deviceType: z.string(),
      deviceName: z.string().optional(),
      osVersion: z.string().optional(),
      appVersion: z.string().optional(),
    }).optional(),
  }),
});

export const signupSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username can only contain letters, numbers, and underscores'
      ),
    displayName: z
      .string()
      .min(1, 'Display name is required')
      .max(50, 'Display name must be at most 50 characters'),
    email: z.string().email().optional(),
    phone: z.string().min(10).max(15).optional(),
    dateOfBirth: z.string().optional(),
    deviceInfo: z.object({
      deviceId: z.string(),
      deviceType: z.string(),
      deviceName: z.string().optional(),
      osVersion: z.string().optional(),
      appVersion: z.string().optional(),
    }).optional(),
  }).refine(
    (data) => data.email || data.phone,
    { message: 'Either email or phone is required' }
  ),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const oauthLoginSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'ID token is required'),
    deviceInfo: z.object({
      deviceId: z.string(),
      deviceType: z.string(),
      deviceName: z.string().optional(),
      osVersion: z.string().optional(),
      appVersion: z.string().optional(),
    }).optional(),
  }),
  params: z.object({
    provider: z.enum(['google', 'apple']),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string(),
  }).refine(
    (data) => data.newPassword === data.confirmPassword,
    { message: 'Passwords do not match', path: ['confirmPassword'] }
  ),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Valid email is required'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string(),
  }).refine(
    (data) => data.newPassword === data.confirmPassword,
    { message: 'Passwords do not match', path: ['confirmPassword'] }
  ),
});
