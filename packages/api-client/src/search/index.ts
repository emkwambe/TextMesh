/**
 * TextMesh Search API Module
 */

import type { HttpClient } from '../client';
import type { SearchParams, SearchResults, Post, User, HashtagResult } from '../types';

export class SearchApi {
  constructor(private client: HttpClient) {}

  /**
   * Search across all content types
   */
  async all(params: SearchParams): Promise<SearchResults> {
    const response = await this.client.get<SearchResults>('/search', {
      params: { ...params, type: 'all' },
    });
    return response.data;
  }

  /**
   * Search posts
   */
  async posts(
    params: SearchParams
  ): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>('/search/posts', { params });
    return response.data;
  }

  /**
   * Search users
   */
  async users(
    params: SearchParams
  ): Promise<{ users: User[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      users: User[];
      cursor?: string;
      hasMore: boolean;
    }>('/search/users', { params });
    return response.data;
  }

  /**
   * Search hashtags
   */
  async hashtags(
    params: SearchParams
  ): Promise<{ hashtags: HashtagResult[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      hashtags: HashtagResult[];
      cursor?: string;
      hasMore: boolean;
    }>('/search/hashtags', { params });
    return response.data;
  }

  /**
   * Get search suggestions (autocomplete)
   */
  async suggestions(
    query: string,
    types?: ('users' | 'hashtags' | 'posts')[]
  ): Promise<{
    users: { id: string; username: string; displayName: string }[];
    hashtags: { name: string; postsCount: number }[];
    posts: { id: string; content: string }[];
  }> {
    const response = await this.client.get<{
      users: { id: string; username: string; displayName: string }[];
      hashtags: { name: string; postsCount: number }[];
      posts: { id: string; content: string }[];
    }>('/search/suggestions', {
      params: { q: query, types: types?.join(',') },
    });
    return response.data;
  }

  /**
   * Get recent searches
   */
  async getHistory(): Promise<{
    queries: string[];
    users: User[];
  }> {
    const response = await this.client.get<{
      queries: string[];
      users: User[];
    }>('/search/history');
    return response.data;
  }

  /**
   * Clear search history
   */
  async clearHistory(): Promise<void> {
    await this.client.delete('/search/history');
  }

  /**
   * Remove item from search history
   */
  async removeFromHistory(
    type: 'query' | 'user',
    value: string
  ): Promise<void> {
    await this.client.delete('/search/history/item', {
      data: { type, value },
    });
  }

  /**
   * Advanced search with filters
   */
  async advanced(params: {
    query: string;
    from?: string; // username
    to?: string; // username
    minLikes?: number;
    minReplies?: number;
    hasMedia?: boolean;
    hasLinks?: boolean;
    dateFrom?: string;
    dateTo?: string;
    language?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>('/search/advanced', { params });
    return response.data;
  }
}
