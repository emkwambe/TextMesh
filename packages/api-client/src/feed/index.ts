/**
 * TextMesh Feed API Module
 */

import type { HttpClient } from '../client';
import type { Post, FeedParams, FeedResponse, HashtagResult } from '../types';

export class FeedApi {
  constructor(private client: HttpClient) {}

  /**
   * Get personalized "For You" feed
   */
  async forYou(params?: FeedParams): Promise<FeedResponse> {
    const response = await this.client.get<FeedResponse>('/feed/for-you', {
      params,
    });
    return response.data;
  }

  /**
   * Get feed from followed users
   */
  async following(params?: FeedParams): Promise<FeedResponse> {
    const response = await this.client.get<FeedResponse>('/feed/following', {
      params,
    });
    return response.data;
  }

  /**
   * Get trending posts
   */
  async trending(params?: FeedParams & { timeframe?: '1h' | '6h' | '24h' | '7d' }): Promise<FeedResponse> {
    const response = await this.client.get<FeedResponse>('/feed/trending', {
      params,
    });
    return response.data;
  }

  /**
   * Get latest posts
   */
  async latest(params?: FeedParams): Promise<FeedResponse> {
    const response = await this.client.get<FeedResponse>('/feed/latest', {
      params,
    });
    return response.data;
  }

  /**
   * Get posts by hashtag
   */
  async hashtag(tag: string, params?: FeedParams): Promise<FeedResponse> {
    const response = await this.client.get<FeedResponse>(`/feed/hashtag/${tag}`, {
      params,
    });
    return response.data;
  }

  /**
   * Get trending hashtags
   */
  async trendingHashtags(limit?: number): Promise<HashtagResult[]> {
    const response = await this.client.get<HashtagResult[]>('/feed/hashtags/trending', {
      params: { limit },
    });
    return response.data;
  }

  /**
   * Get list feed (posts from users in a list)
   */
  async list(listId: string, params?: FeedParams): Promise<FeedResponse> {
    const response = await this.client.get<FeedResponse>(`/feed/list/${listId}`, {
      params,
    });
    return response.data;
  }

  /**
   * Get explore/discover content
   */
  async explore(params?: FeedParams & { category?: string }): Promise<{
    posts: Post[];
    categories: string[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const response = await this.client.get<{
      posts: Post[];
      categories: string[];
      cursor?: string;
      hasMore: boolean;
    }>('/feed/explore', { params });
    return response.data;
  }

  /**
   * Mark posts as seen (for feed ranking)
   */
  async markSeen(postIds: string[]): Promise<void> {
    await this.client.post('/feed/seen', { postIds });
  }

  /**
   * Hide a post from feed (negative signal)
   */
  async hidePost(postId: string): Promise<void> {
    await this.client.post('/feed/hide', { postId });
  }

  /**
   * Get "Not Interested" topics
   */
  async getNotInterested(): Promise<{ topics: string[]; hashtags: string[] }> {
    const response = await this.client.get<{
      topics: string[];
      hashtags: string[];
    }>('/feed/not-interested');
    return response.data;
  }

  /**
   * Add "Not Interested" topic
   */
  async addNotInterested(
    type: 'topic' | 'hashtag',
    value: string
  ): Promise<void> {
    await this.client.post('/feed/not-interested', { type, value });
  }

  /**
   * Remove "Not Interested" topic
   */
  async removeNotInterested(
    type: 'topic' | 'hashtag',
    value: string
  ): Promise<void> {
    await this.client.delete('/feed/not-interested', {
      data: { type, value },
    });
  }
}
