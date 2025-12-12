/**
 * Autocomplete Service
 *
 * Provides real-time search suggestions
 */

import { createLogger } from '@textmesh/logger';
import { AutocompleteResult, SearchableType, SearchConfig } from './types';
import { ElasticsearchClient } from './elasticsearch-client';
import { SearchQueryBuilder } from './query-builder';

const logger = createLogger({ service: 'autocomplete', level: 'info' });

interface CacheEntry {
  result: AutocompleteResult;
  timestamp: number;
}

export class AutocompleteService {
  private client: ElasticsearchClient;
  private queryBuilder: SearchQueryBuilder;
  private config: SearchConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number = 60000; // 1 minute

  constructor(
    client: ElasticsearchClient,
    queryBuilder: SearchQueryBuilder,
    config: SearchConfig
  ) {
    this.client = client;
    this.queryBuilder = queryBuilder;
    this.config = config;
  }

  /**
   * Get autocomplete suggestions
   */
  async getSuggestions(
    prefix: string,
    options: {
      types?: SearchableType[];
      size?: number;
      userId?: string;
    } = {}
  ): Promise<AutocompleteResult> {
    const normalizedPrefix = prefix.toLowerCase().trim();

    if (normalizedPrefix.length < 1) {
      return { suggestions: [] };
    }

    // Check cache
    const cacheKey = this.getCacheKey(normalizedPrefix, options.types);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const size = options.size || 10;
    const types = options.types;

    // Get indices to search
    const indices = this.getIndices(types);

    // Build autocomplete query
    const query = this.queryBuilder.buildAutocomplete(normalizedPrefix, types, size);

    // Execute search
    const result = await this.client.search(indices, query);

    // Transform results
    const suggestions = result.hits.map((hit) => ({
      text: this.extractSuggestionText(hit.source),
      type: hit.source.type as SearchableType,
      id: hit.id,
      score: hit.score,
    }));

    // Deduplicate by text
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions);

    const autocompleteResult: AutocompleteResult = {
      suggestions: uniqueSuggestions.slice(0, size),
    };

    // Cache result
    this.setInCache(cacheKey, autocompleteResult);

    return autocompleteResult;
  }

  /**
   * Get popular searches (for empty input)
   */
  async getPopularSearches(size: number = 10): Promise<string[]> {
    // This would typically come from search analytics
    // For now, return trending hashtags
    const query = {
      size,
      query: {
        bool: {
          filter: [{ term: { type: 'hashtag' } }],
        },
      },
      sort: [{ trendingScore: { order: 'desc' } }],
      _source: ['tag'],
    };

    const result = await this.client.search(this.config.indices.hashtags, query);

    return result.hits.map((hit) => `#${hit.source.tag}`);
  }

  /**
   * Get recent searches for user
   */
  async getRecentSearches(userId: string, size: number = 10): Promise<string[]> {
    // This would come from user's search history
    // Placeholder implementation
    return [];
  }

  /**
   * Extract suggestion text from document
   */
  private extractSuggestionText(source: Record<string, unknown>): string {
    const type = source.type as SearchableType;

    switch (type) {
      case 'user':
        return `@${source.username || source.displayName}`;
      case 'hashtag':
        return `#${source.tag}`;
      case 'community':
        return source.name as string;
      case 'post':
        const content = source.content as string;
        return content.length > 50 ? content.substring(0, 50) + '...' : content;
      default:
        return source.content as string || source.name as string || '';
    }
  }

  /**
   * Deduplicate suggestions by text
   */
  private deduplicateSuggestions(
    suggestions: AutocompleteResult['suggestions']
  ): AutocompleteResult['suggestions'] {
    const seen = new Set<string>();
    const unique: AutocompleteResult['suggestions'] = [];

    for (const suggestion of suggestions) {
      const key = suggestion.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }

    return unique;
  }

  /**
   * Get indices based on types
   */
  private getIndices(types?: SearchableType[]): string[] {
    if (!types || types.length === 0) {
      return [
        this.config.indices.users,
        this.config.indices.posts,
        this.config.indices.hashtags,
        this.config.indices.communities,
      ];
    }

    const indices: string[] = [];

    for (const type of types) {
      switch (type) {
        case 'user':
          indices.push(this.config.indices.users);
          break;
        case 'post':
          indices.push(this.config.indices.posts);
          break;
        case 'comment':
          indices.push(this.config.indices.comments);
          break;
        case 'hashtag':
          indices.push(this.config.indices.hashtags);
          break;
        case 'community':
          indices.push(this.config.indices.communities);
          break;
        case 'message':
          indices.push(this.config.indices.messages);
          break;
      }
    }

    return indices;
  }

  /**
   * Get cache key
   */
  private getCacheKey(prefix: string, types?: SearchableType[]): string {
    const typeKey = types ? types.sort().join(',') : 'all';
    return `${prefix}:${typeKey}`;
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): AutocompleteResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Set in cache
   */
  private setInCache(key: string, result: AutocompleteResult): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Cleanup old entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
