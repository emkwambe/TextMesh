/**
 * URL Signer
 *
 * Generates signed URLs for protected content:
 * - Time-limited access
 * - IP restrictions
 * - Geographic restrictions
 */

import crypto from 'crypto';
import { createLogger } from '@textmesh/logger';
import { SignedUrlOptions } from './types';

const logger = createLogger({ service: 'url-signer', level: 'info' });

const SECRET_KEY = process.env.CDN_SIGNING_KEY || 'your-secret-signing-key';

export class URLSigner {
  private secretKey: string;

  constructor(secretKey: string = SECRET_KEY) {
    this.secretKey = secretKey;
  }

  /**
   * Generate a signed URL
   */
  sign(url: string, options: SignedUrlOptions): string {
    const { expiresIn, ipRestriction, countryRestriction } = options;

    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    // Build token payload
    const payload: Record<string, string | number | string[]> = {
      url,
      exp: expires,
    };

    if (ipRestriction) {
      payload.ip = ipRestriction;
    }

    if (countryRestriction && countryRestriction.length > 0) {
      payload.countries = countryRestriction;
    }

    // Create signature
    const payloadString = JSON.stringify(payload);
    const signature = this.createSignature(payloadString);

    // Build signed URL
    const urlObj = new URL(url);
    urlObj.searchParams.set('expires', expires.toString());
    urlObj.searchParams.set('signature', signature);

    if (ipRestriction) {
      urlObj.searchParams.set('ip', ipRestriction);
    }

    if (countryRestriction && countryRestriction.length > 0) {
      urlObj.searchParams.set('countries', countryRestriction.join(','));
    }

    return urlObj.toString();
  }

  /**
   * Verify a signed URL
   */
  verify(signedUrl: string, clientIp?: string): {
    valid: boolean;
    reason?: string;
  } {
    try {
      const urlObj = new URL(signedUrl);
      const expires = urlObj.searchParams.get('expires');
      const signature = urlObj.searchParams.get('signature');
      const ipRestriction = urlObj.searchParams.get('ip');
      const countriesParam = urlObj.searchParams.get('countries');

      if (!expires || !signature) {
        return { valid: false, reason: 'Missing signature parameters' };
      }

      // Check expiration
      const expiresNum = parseInt(expires, 10);
      if (Date.now() / 1000 > expiresNum) {
        return { valid: false, reason: 'URL has expired' };
      }

      // Verify IP restriction
      if (ipRestriction && clientIp && ipRestriction !== clientIp) {
        return { valid: false, reason: 'IP address mismatch' };
      }

      // Remove signature params and verify
      urlObj.searchParams.delete('expires');
      urlObj.searchParams.delete('signature');
      urlObj.searchParams.delete('ip');
      urlObj.searchParams.delete('countries');

      const originalUrl = urlObj.toString();
      const countries = countriesParam ? countriesParam.split(',') : undefined;

      const payload: Record<string, string | number | string[]> = {
        url: originalUrl,
        exp: expiresNum,
      };

      if (ipRestriction) {
        payload.ip = ipRestriction;
      }

      if (countries) {
        payload.countries = countries;
      }

      const expectedSignature = this.createSignature(JSON.stringify(payload));

      if (signature !== expectedSignature) {
        return { valid: false, reason: 'Invalid signature' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('URL verification error', { error });
      return { valid: false, reason: 'Verification error' };
    }
  }

  /**
   * Generate signed cookie for streaming
   */
  generateSignedCookie(
    resourcePattern: string,
    expiresIn: number
  ): {
    name: string;
    value: string;
    options: {
      expires: Date;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'strict' | 'lax' | 'none';
      path: string;
    };
  } {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    const policy = {
      Statement: [
        {
          Resource: resourcePattern,
          Condition: {
            DateLessThan: { 'AWS:EpochTime': expires },
          },
        },
      ],
    };

    const policyString = JSON.stringify(policy);
    const signature = this.createSignature(policyString);

    // Base64 URL-safe encoding
    const encodedPolicy = Buffer.from(policyString)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return {
      name: 'CloudFront-Policy',
      value: encodedPolicy,
      options: {
        expires: new Date(expires * 1000),
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
      },
    };
  }

  /**
   * Create HMAC signature
   */
  private createSignature(data: string): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('base64url');
  }

  /**
   * Generate one-time download token
   */
  generateDownloadToken(
    fileId: string,
    userId: string,
    expiresIn: number = 3600
  ): string {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const nonce = crypto.randomBytes(8).toString('hex');

    const payload = {
      fileId,
      userId,
      exp: expires,
      nonce,
    };

    const signature = this.createSignature(JSON.stringify(payload));

    return Buffer.from(
      JSON.stringify({ ...payload, sig: signature })
    ).toString('base64url');
  }

  /**
   * Verify download token
   */
  verifyDownloadToken(
    token: string,
    expectedUserId: string
  ): { valid: boolean; fileId?: string; reason?: string } {
    try {
      const decoded = JSON.parse(
        Buffer.from(token, 'base64url').toString()
      );

      const { fileId, userId, exp, nonce, sig } = decoded;

      // Check expiration
      if (Date.now() / 1000 > exp) {
        return { valid: false, reason: 'Token expired' };
      }

      // Check user
      if (userId !== expectedUserId) {
        return { valid: false, reason: 'User mismatch' };
      }

      // Verify signature
      const payload = { fileId, userId, exp, nonce };
      const expectedSig = this.createSignature(JSON.stringify(payload));

      if (sig !== expectedSig) {
        return { valid: false, reason: 'Invalid signature' };
      }

      return { valid: true, fileId };
    } catch (error) {
      return { valid: false, reason: 'Invalid token format' };
    }
  }
}

export const urlSigner = new URLSigner();
