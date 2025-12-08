/**
 * TextMesh Auth API Module
 */

import type { HttpClient } from '../client';
import type {
  AuthResponse,
  LoginInput,
  SignupInput,
  User,
  PasswordResetInput,
  PasswordUpdateInput,
} from '../types';

export class AuthApi {
  constructor(private client: HttpClient) {}

  /**
   * Login with email and password
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', input);

    // Store tokens in client
    this.client.setTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      expiresAt: response.data.expiresAt,
    });

    return response.data;
  }

  /**
   * Register a new user
   */
  async signup(input: SignupInput): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/register', input);

    // Store tokens in client
    this.client.setTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      expiresAt: response.data.expiresAt,
    });

    return response.data;
  }

  /**
   * Logout and invalidate tokens
   */
  async logout(): Promise<void> {
    const tokens = this.client.getTokens();

    if (tokens?.refreshToken) {
      await this.client.post('/auth/logout', {
        refreshToken: tokens.refreshToken,
      });
    }

    this.client.clearTokens();
  }

  /**
   * Refresh access token
   */
  async refresh(): Promise<AuthResponse> {
    const tokens = this.client.getTokens();

    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await this.client.post<AuthResponse>('/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });

    this.client.setTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      expiresAt: response.data.expiresAt,
    });

    return response.data;
  }

  /**
   * Get current authenticated user
   */
  async me(): Promise<User> {
    const response = await this.client.get<User>('/auth/me');
    return response.data;
  }

  /**
   * Request password reset email
   */
  async forgotPassword(input: PasswordResetInput): Promise<void> {
    await this.client.post('/auth/forgot-password', input);
  }

  /**
   * Reset password with token
   */
  async resetPassword(input: PasswordUpdateInput): Promise<void> {
    await this.client.post('/auth/reset-password', input);
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    await this.client.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    await this.client.post('/auth/verify-email', { token });
  }

  /**
   * Resend verification email
   */
  async resendVerification(): Promise<void> {
    await this.client.post('/auth/resend-verification');
  }

  /**
   * Check if username is available
   */
  async checkUsername(username: string): Promise<boolean> {
    const response = await this.client.get<{ available: boolean }>(
      `/auth/check-username/${username}`
    );
    return response.data.available;
  }

  /**
   * Check if email is available
   */
  async checkEmail(email: string): Promise<boolean> {
    const response = await this.client.post<{ available: boolean }>(
      '/auth/check-email',
      { email }
    );
    return response.data.available;
  }

  /**
   * Get OAuth URL for social login
   */
  getOAuthUrl(
    provider: 'google' | 'apple' | 'twitter',
    redirectUri?: string
  ): string {
    const params = new URLSearchParams();
    if (redirectUri) {
      params.set('redirect_uri', redirectUri);
    }
    return `/auth/${provider}?${params.toString()}`;
  }

  /**
   * Complete OAuth login with authorization code
   */
  async completeOAuth(
    provider: 'google' | 'apple' | 'twitter',
    code: string
  ): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>(
      `/auth/${provider}/callback`,
      { code }
    );

    this.client.setTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      expiresAt: response.data.expiresAt,
    });

    return response.data;
  }

  /**
   * Setup two-factor authentication
   */
  async setup2FA(): Promise<{ secret: string; qrCode: string }> {
    const response = await this.client.post<{ secret: string; qrCode: string }>(
      '/auth/2fa/setup'
    );
    return response.data;
  }

  /**
   * Enable two-factor authentication
   */
  async enable2FA(code: string): Promise<{ backupCodes: string[] }> {
    const response = await this.client.post<{ backupCodes: string[] }>(
      '/auth/2fa/enable',
      { code }
    );
    return response.data;
  }

  /**
   * Disable two-factor authentication
   */
  async disable2FA(code: string): Promise<void> {
    await this.client.post('/auth/2fa/disable', { code });
  }

  /**
   * Verify 2FA code during login
   */
  async verify2FA(
    sessionToken: string,
    code: string
  ): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/2fa/verify', {
      sessionToken,
      code,
    });

    this.client.setTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      expiresAt: response.data.expiresAt,
    });

    return response.data;
  }
}
