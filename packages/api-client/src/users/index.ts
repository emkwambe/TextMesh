/**
 * TextMesh Users API Module
 */

import type { HttpClient } from '../client';
import type {
  User,
  UserProfile,
  UserSettings,
  UpdateUserInput,
  Post,
  PaginationParams,
} from '../types';

export class UsersApi {
  constructor(private client: HttpClient) {}

  /**
   * Get user profile by username
   */
  async getByUsername(username: string): Promise<UserProfile> {
    const response = await this.client.get<UserProfile>(`/users/${username}`);
    return response.data;
  }

  /**
   * Get user profile by ID
   */
  async getById(userId: string): Promise<UserProfile> {
    const response = await this.client.get<UserProfile>(`/users/${userId}/profile`);
    return response.data;
  }

  /**
   * Get current user profile
   */
  async me(): Promise<User> {
    const response = await this.client.get<User>('/users/me');
    return response.data;
  }

  /**
   * Update current user profile
   */
  async update(input: UpdateUserInput): Promise<User> {
    const response = await this.client.patch<User>('/users/me', input);
    return response.data;
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(
    file: File | Blob,
    onProgress?: (progress: number) => void
  ): Promise<{ url: string }> {
    const response = await this.client.upload<{ url: string }>(
      '/users/me/avatar',
      file,
      onProgress
    );
    return response.data;
  }

  /**
   * Upload cover image
   */
  async uploadCover(
    file: File | Blob,
    onProgress?: (progress: number) => void
  ): Promise<{ url: string }> {
    const response = await this.client.upload<{ url: string }>(
      '/users/me/cover',
      file,
      onProgress
    );
    return response.data;
  }

  /**
   * Get user settings
   */
  async getSettings(): Promise<UserSettings> {
    const response = await this.client.get<UserSettings>('/users/me/settings');
    return response.data;
  }

  /**
   * Update user settings
   */
  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await this.client.patch<UserSettings>(
      '/users/me/settings',
      settings
    );
    return response.data;
  }

  /**
   * Follow a user
   */
  async follow(userId: string): Promise<{ following: boolean }> {
    const response = await this.client.post<{ following: boolean }>(
      `/users/${userId}/follow`
    );
    return response.data;
  }

  /**
   * Unfollow a user
   */
  async unfollow(userId: string): Promise<{ following: boolean }> {
    const response = await this.client.delete<{ following: boolean }>(
      `/users/${userId}/follow`
    );
    return response.data;
  }

  /**
   * Get user's followers
   */
  async getFollowers(
    userId: string,
    params?: PaginationParams
  ): Promise<{ users: User[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      users: User[];
      cursor?: string;
      hasMore: boolean;
    }>(`/users/${userId}/followers`, { params });
    return response.data;
  }

  /**
   * Get users that user is following
   */
  async getFollowing(
    userId: string,
    params?: PaginationParams
  ): Promise<{ users: User[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      users: User[];
      cursor?: string;
      hasMore: boolean;
    }>(`/users/${userId}/following`, { params });
    return response.data;
  }

  /**
   * Get user's posts
   */
  async getPosts(
    userId: string,
    params?: PaginationParams & { includeReplies?: boolean }
  ): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>(`/users/${userId}/posts`, { params });
    return response.data;
  }

  /**
   * Get user's liked posts
   */
  async getLikes(
    userId: string,
    params?: PaginationParams
  ): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>(`/users/${userId}/likes`, { params });
    return response.data;
  }

  /**
   * Get user's media posts
   */
  async getMedia(
    userId: string,
    params?: PaginationParams
  ): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>(`/users/${userId}/media`, { params });
    return response.data;
  }

  /**
   * Block a user
   */
  async block(userId: string): Promise<{ blocked: boolean }> {
    const response = await this.client.post<{ blocked: boolean }>(
      `/users/${userId}/block`
    );
    return response.data;
  }

  /**
   * Unblock a user
   */
  async unblock(userId: string): Promise<{ blocked: boolean }> {
    const response = await this.client.delete<{ blocked: boolean }>(
      `/users/${userId}/block`
    );
    return response.data;
  }

  /**
   * Get blocked users
   */
  async getBlocked(
    params?: PaginationParams
  ): Promise<{ users: User[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      users: User[];
      cursor?: string;
      hasMore: boolean;
    }>('/users/me/blocked', { params });
    return response.data;
  }

  /**
   * Mute a user
   */
  async mute(userId: string): Promise<{ muted: boolean }> {
    const response = await this.client.post<{ muted: boolean }>(
      `/users/${userId}/mute`
    );
    return response.data;
  }

  /**
   * Unmute a user
   */
  async unmute(userId: string): Promise<{ muted: boolean }> {
    const response = await this.client.delete<{ muted: boolean }>(
      `/users/${userId}/mute`
    );
    return response.data;
  }

  /**
   * Get muted users
   */
  async getMuted(
    params?: PaginationParams
  ): Promise<{ users: User[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      users: User[];
      cursor?: string;
      hasMore: boolean;
    }>('/users/me/muted', { params });
    return response.data;
  }

  /**
   * Report a user
   */
  async report(
    userId: string,
    reason: 'spam' | 'abuse' | 'harassment' | 'impersonation' | 'other',
    details?: string
  ): Promise<void> {
    await this.client.post(`/users/${userId}/report`, { reason, details });
  }

  /**
   * Search users
   */
  async search(
    query: string,
    params?: PaginationParams
  ): Promise<{ users: User[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      users: User[];
      cursor?: string;
      hasMore: boolean;
    }>('/users/search', { params: { q: query, ...params } });
    return response.data;
  }

  /**
   * Get suggested users to follow
   */
  async getSuggestions(limit?: number): Promise<User[]> {
    const response = await this.client.get<User[]>('/users/suggestions', {
      params: { limit },
    });
    return response.data;
  }

  /**
   * Delete account
   */
  async deleteAccount(password: string): Promise<void> {
    await this.client.post('/users/me/delete', { password });
  }

  /**
   * Export user data (GDPR)
   */
  async exportData(): Promise<{ downloadUrl: string; expiresAt: string }> {
    const response = await this.client.post<{
      downloadUrl: string;
      expiresAt: string;
    }>('/users/me/export');
    return response.data;
  }
}
