/**
 * TextMesh Posts API Module
 */

import type { HttpClient } from '../client';
import type {
  Post,
  CreatePostInput,
  PaginationParams,
} from '../types';

export class PostsApi {
  constructor(private client: HttpClient) {}

  /**
   * Create a new post
   */
  async create(input: CreatePostInput): Promise<Post> {
    const response = await this.client.post<Post>('/posts', input);
    return response.data;
  }

  /**
   * Get a post by ID
   */
  async get(postId: string): Promise<Post> {
    const response = await this.client.get<Post>(`/posts/${postId}`);
    return response.data;
  }

  /**
   * Delete a post
   */
  async delete(postId: string): Promise<void> {
    await this.client.delete(`/posts/${postId}`);
  }

  /**
   * Like or unlike a post
   */
  async toggleLike(postId: string): Promise<{ liked: boolean; likesCount: number }> {
    const response = await this.client.post<{ liked: boolean; likesCount: number }>(
      `/posts/${postId}/like`
    );
    return response.data;
  }

  /**
   * Repost a post
   */
  async repost(postId: string, content?: string): Promise<Post> {
    const response = await this.client.post<Post>(`/posts/${postId}/repost`, {
      content,
    });
    return response.data;
  }

  /**
   * Remove a repost
   */
  async unrepost(postId: string): Promise<void> {
    await this.client.delete(`/posts/${postId}/repost`);
  }

  /**
   * Bookmark or unbookmark a post
   */
  async toggleBookmark(postId: string): Promise<{ bookmarked: boolean }> {
    const response = await this.client.post<{ bookmarked: boolean }>(
      `/posts/${postId}/bookmark`
    );
    return response.data;
  }

  /**
   * Reply to a post
   */
  async reply(postId: string, input: CreatePostInput): Promise<Post> {
    const response = await this.client.post<Post>(`/posts/${postId}/reply`, input);
    return response.data;
  }

  /**
   * Get replies to a post
   */
  async getReplies(
    postId: string,
    params?: PaginationParams & { sort?: 'recent' | 'top' }
  ): Promise<{ replies: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      replies: Post[];
      cursor?: string;
      hasMore: boolean;
    }>(`/posts/${postId}/replies`, { params });
    return response.data;
  }

  /**
   * Get users who liked a post
   */
  async getLikes(
    postId: string,
    params?: PaginationParams
  ): Promise<{ users: { id: string; username: string; displayName: string }[]; cursor?: string }> {
    const response = await this.client.get<{
      users: { id: string; username: string; displayName: string }[];
      cursor?: string;
    }>(`/posts/${postId}/likes`, { params });
    return response.data;
  }

  /**
   * Get users who reposted a post
   */
  async getReposts(
    postId: string,
    params?: PaginationParams
  ): Promise<{ users: { id: string; username: string; displayName: string }[]; cursor?: string }> {
    const response = await this.client.get<{
      users: { id: string; username: string; displayName: string }[];
      cursor?: string;
    }>(`/posts/${postId}/reposts`, { params });
    return response.data;
  }

  /**
   * Get quote posts
   */
  async getQuotes(
    postId: string,
    params?: PaginationParams
  ): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>(`/posts/${postId}/quotes`, { params });
    return response.data;
  }

  /**
   * Report a post
   */
  async report(
    postId: string,
    reason: 'spam' | 'abuse' | 'harassment' | 'violence' | 'misinformation' | 'other',
    details?: string
  ): Promise<void> {
    await this.client.post(`/posts/${postId}/report`, { reason, details });
  }

  /**
   * Pin a post to profile
   */
  async pin(postId: string): Promise<void> {
    await this.client.post(`/posts/${postId}/pin`);
  }

  /**
   * Unpin a post from profile
   */
  async unpin(postId: string): Promise<void> {
    await this.client.delete(`/posts/${postId}/pin`);
  }

  /**
   * Vote on a poll
   */
  async votePoll(postId: string, optionId: string): Promise<Post> {
    const response = await this.client.post<Post>(`/posts/${postId}/poll/vote`, {
      optionId,
    });
    return response.data;
  }

  /**
   * Get post thread (parent posts and replies)
   */
  async getThread(postId: string): Promise<{
    ancestors: Post[];
    post: Post;
    replies: Post[];
  }> {
    const response = await this.client.get<{
      ancestors: Post[];
      post: Post;
      replies: Post[];
    }>(`/posts/${postId}/thread`);
    return response.data;
  }

  /**
   * Get user's bookmarked posts
   */
  async getBookmarks(
    params?: PaginationParams
  ): Promise<{ posts: Post[]; cursor?: string; hasMore: boolean }> {
    const response = await this.client.get<{
      posts: Post[];
      cursor?: string;
      hasMore: boolean;
    }>('/posts/bookmarks', { params });
    return response.data;
  }
}
