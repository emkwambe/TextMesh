/**
 * TextMesh API Client
 *
 * TypeScript SDK for interacting with the TextMesh social media platform.
 *
 * @example
 * ```typescript
 * import { TextMeshClient } from '@textmesh/api-client';
 *
 * const client = new TextMeshClient({
 *   baseUrl: 'https://api.textmesh.com',
 * });
 *
 * // Login
 * await client.auth.login({ email: 'user@example.com', password: 'password' });
 *
 * // Get feed
 * const feed = await client.feed.forYou({ limit: 20 });
 *
 * // Create post
 * const post = await client.posts.create({ content: 'Hello, TextMesh!' });
 * ```
 */

import { HttpClient } from './client';
import { AuthApi } from './auth';
import { UsersApi } from './users';
import { PostsApi } from './posts';
import { FeedApi } from './feed';
import { NotificationsApi } from './notifications';
import { SearchApi } from './search';
import type { TextMeshConfig, AuthTokens } from './types';

export class TextMeshClient {
  private httpClient: HttpClient;

  public readonly auth: AuthApi;
  public readonly users: UsersApi;
  public readonly posts: PostsApi;
  public readonly feed: FeedApi;
  public readonly notifications: NotificationsApi;
  public readonly search: SearchApi;

  constructor(config: TextMeshConfig) {
    this.httpClient = new HttpClient(config);

    // Initialize API modules
    this.auth = new AuthApi(this.httpClient);
    this.users = new UsersApi(this.httpClient);
    this.posts = new PostsApi(this.httpClient);
    this.feed = new FeedApi(this.httpClient);
    this.notifications = new NotificationsApi(this.httpClient);
    this.search = new SearchApi(this.httpClient);
  }

  /**
   * Set authentication tokens manually
   * Useful when restoring session from storage
   */
  setTokens(tokens: AuthTokens): void {
    this.httpClient.setTokens(tokens);
  }

  /**
   * Get current authentication tokens
   */
  getTokens(): AuthTokens | null {
    return this.httpClient.getTokens();
  }

  /**
   * Clear authentication tokens
   */
  clearTokens(): void {
    this.httpClient.clearTokens();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const tokens = this.httpClient.getTokens();
    if (!tokens) return false;
    return tokens.expiresAt > Date.now();
  }
}

// Export types
export * from './types';

// Export individual API classes for advanced usage
export { HttpClient } from './client';
export { AuthApi } from './auth';
export { UsersApi } from './users';
export { PostsApi } from './posts';
export { FeedApi } from './feed';
export { NotificationsApi } from './notifications';
export { SearchApi } from './search';

// Default export
export default TextMeshClient;
