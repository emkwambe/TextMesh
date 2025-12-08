// =================================
// OTP SERVICE
// =================================

import Redis from 'ioredis';
import { ErrorCode, AppError } from '@textmesh/shared-types';

const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 3;

interface OTPData {
  code: string;
  type: 'email' | 'phone';
  attempts: number;
  createdAt: string;
}

export class OTPService {
  constructor(private redis: Redis) {}

  async generateOTP(
    identifier: string,
    type: 'email' | 'phone'
  ): Promise<{ code: string; expiresAt: Date }> {
    // Generate 6-digit code
    const code = this.generateCode();

    const otpData: OTPData = {
      code,
      type,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    const key = this.getOTPKey(identifier);

    // Store OTP with expiry
    await this.redis.setex(key, OTP_EXPIRY_SECONDS, JSON.stringify(otpData));

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + OTP_EXPIRY_SECONDS);

    return { code, expiresAt };
  }

  async verifyOTP(identifier: string, code: string): Promise<boolean> {
    const key = this.getOTPKey(identifier);
    const data = await this.redis.get(key);

    if (!data) {
      throw new AppError(ErrorCode.OTP_EXPIRED, 'Verification code has expired', 400);
    }

    const otpData: OTPData = JSON.parse(data);

    // Check attempts
    if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new AppError(
        ErrorCode.OTP_MAX_ATTEMPTS,
        'Maximum verification attempts exceeded',
        429
      );
    }

    // Increment attempts
    otpData.attempts++;
    await this.redis.setex(
      key,
      await this.redis.ttl(key),
      JSON.stringify(otpData)
    );

    // Verify code (timing-safe comparison)
    if (!this.safeCompare(otpData.code, code)) {
      if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
        await this.redis.del(key);
        throw new AppError(
          ErrorCode.OTP_MAX_ATTEMPTS,
          'Maximum verification attempts exceeded',
          429
        );
      }
      throw new AppError(ErrorCode.OTP_INVALID, 'Invalid verification code', 400);
    }

    // Delete OTP after successful verification
    await this.redis.del(key);

    return true;
  }

  async invalidateOTP(identifier: string): Promise<void> {
    const key = this.getOTPKey(identifier);
    await this.redis.del(key);
  }

  async getOTPStatus(identifier: string): Promise<{
    exists: boolean;
    attemptsRemaining: number;
    expiresIn: number;
  }> {
    const key = this.getOTPKey(identifier);
    const [data, ttl] = await Promise.all([
      this.redis.get(key),
      this.redis.ttl(key),
    ]);

    if (!data || ttl <= 0) {
      return { exists: false, attemptsRemaining: 0, expiresIn: 0 };
    }

    const otpData: OTPData = JSON.parse(data);

    return {
      exists: true,
      attemptsRemaining: OTP_MAX_ATTEMPTS - otpData.attempts,
      expiresIn: ttl,
    };
  }

  private generateCode(): string {
    // Generate cryptographically secure 6-digit code
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const code = (array[0]! % 900000 + 100000).toString();
    return code;
  }

  private getOTPKey(identifier: string): string {
    return `otp:${identifier}`;
  }

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
