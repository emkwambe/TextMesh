// =================================
// OAUTH SERVICE
// =================================

import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { ErrorCode, AppError } from '@textmesh/shared-types';

interface OAuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

interface AppleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  is_private_email?: boolean;
  real_user_status?: number;
}

export class OAuthService {
  private googleClient: OAuth2Client | null = null;

  constructor() {
    const googleClientId = process.env['GOOGLE_CLIENT_ID'];
    if (googleClientId) {
      this.googleClient = new OAuth2Client(googleClientId);
    }
  }

  async verifyGoogleToken(idToken: string): Promise<OAuthUser> {
    if (!this.googleClient) {
      throw new AppError(
        ErrorCode.OAUTH_ERROR,
        'Google OAuth not configured',
        500
      );
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env['GOOGLE_CLIENT_ID'],
      });

      const payload = ticket.getPayload();

      if (!payload || !payload.email) {
        throw new AppError(
          ErrorCode.OAUTH_ERROR,
          'Invalid Google token payload',
          400
        );
      }

      if (!payload.email_verified) {
        throw new AppError(
          ErrorCode.OAUTH_ERROR,
          'Email not verified with Google',
          400
        );
      }

      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError(
        ErrorCode.OAUTH_ERROR,
        'Failed to verify Google token',
        400
      );
    }
  }

  async verifyAppleToken(idToken: string): Promise<OAuthUser> {
    try {
      // Fetch Apple's public keys
      const response = await fetch('https://appleid.apple.com/auth/keys');
      const { keys } = await response.json() as { keys: any[] };

      // Decode token header to get the key ID
      const tokenHeader = JSON.parse(
        Buffer.from(idToken.split('.')[0]!, 'base64').toString()
      );

      // Find the matching key
      const key = keys.find((k: any) => k.kid === tokenHeader.kid);

      if (!key) {
        throw new AppError(
          ErrorCode.OAUTH_ERROR,
          'Apple public key not found',
          400
        );
      }

      // Convert JWK to PEM format
      const publicKey = await this.jwkToPem(key);

      // Verify token
      const payload = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: process.env['APPLE_CLIENT_ID'],
      }) as AppleTokenPayload;

      if (!payload.email) {
        throw new AppError(
          ErrorCode.OAUTH_ERROR,
          'Email not provided by Apple',
          400
        );
      }

      return {
        id: payload.sub,
        email: payload.email,
        // Apple doesn't provide name in the token
        // Name is only available during first sign-in
      };
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError(
        ErrorCode.OAUTH_ERROR,
        'Failed to verify Apple token',
        400
      );
    }
  }

  private async jwkToPem(jwk: any): Promise<string> {
    // Simple JWK to PEM conversion for RS256
    const crypto = await import('crypto');

    const key = crypto.createPublicKey({
      key: jwk,
      format: 'jwk',
    });

    return key.export({ type: 'spki', format: 'pem' }) as string;
  }
}
