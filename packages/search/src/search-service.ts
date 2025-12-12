/**
 * Search Service
 *
 * Main search API that combines all search functionality
 */

import { createLogger } from '@textmesh/logger';
import {
  SearchQuery,
  SearchResult,
  SearchHit,
  SearchDocument,
  SearchableType,
  AutocompleteResult,
  TrendingItem,
  SearchConfig,
  SearchAnalytics,
} from './types';
import { ElasticsearchClient } from './elasticsearch-client';
import { SearchIndexer } from './indexer';
import { SearchQueryBuilder } from './query-builder';
import { AutocompleteService } from './autocomplete';
import { TrendingService } from './trending';

const logger = createLogger({ service: 'search-service', level: 'info' });

const DEFAULT_CONFIG: SearchConfig = {
  elasticsearch: {
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  },
  indices: {
    users: 'textmesh_users',
    posts: 'textmesh_posts',
    comments: 'textmesh_comments',
    hashtags: 'textmesh_hashtags',
    communities: 'textmesh_communities',
    messages: 'textmesh_messages',
  },
  defaults: {
    size: 20,
    maxSize: 100,
    highlightFragmentSize: 150,
    suggestSize: 5,
  },
};

export class SearchService {
  private config: SearchConfig;
  private client: ElasticsearchClient;
  private indexer: SearchIndexer;
  private queryBuilder: SearchQueryBuilder;
  private autocomplete: AutocompleteService;
  private trending: TrendingService;
  private analytics: SearchAnalytics[] = [];

  constructor(config: Partial<SearchConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.client = new ElasticsearchClient(this.config);
    this.indexer = new SearchIndexer(this.client, this.config);
    this.queryBuilder = new SearchQueryBuilder(this.config);
    this.autocomplete = new AutocompleteService(
      this.client,
      this.queryBuilder,
      this.config
    );
    this.trending = new TrendingService(this.client, this.config);
  }

  /**
   * Initialize search service
   */
  async initialize(): Promise<void> {
    // Check Elasticsearch health
    const health = await this.client.healthCheck();
    if (!health.available) {
      throw new Error('Elasticsearch is not available');
    }

    // Initialize indices
    await this.indexer.initializeIndices();

    // Start periodic indexing
    this.indexer.startPeriodicFlush();

    logger.info('Search service initialized');
  }

  /**
   * Perform search
   */
  async search(query: SearchQuery, userId?: string): Promise<SearchResult> {
    const startTime = Date.now();

    // Get indices to search
    const indices = this.getIndices(query.types);

    // Build Elasticsearch query
    const esQuery = this.queryBuilder.build(query);

    // Execute search
    const result = await this.client.search(indices, esQuery);

    // Transform results
    const hits: SearchHit[] = result.hits.map((hit) => ({
      id: hit.id,
      type: hit.source.type as SearchableType,
      score: hit.score,
      document: this.sourceToDocument(hit.source),
      highlights: hit.highlight,
    }));

    // Process aggregations
    const aggregations = result.aggregations
      ? this.processAggregations(result.aggregations)
      : undefined;

    // Record search for analytics
    this.recordSearchAnalytics(query, userId, hits.length);

    // Record for trending
    if (query.query) {
      this.trending.recordSearch(query.query);

      // Extract and record hashtags from query
      const hashtags = query.query.match(/#\w+/g);
      if (hashtags) {
        for (const tag of hashtags) {
          this.trending.recordHashtag(tag);
        }
      }
    }

    const searchResult: SearchResult = {
      total: result.total,
      hits,
      aggregations,
      took: Date.now() - startTime,
    };

    logger.debug('Search completed', {
      query: query.query,
      total: result.total,
      took: searchResult.took,
    });

    return searchResult;
  }

  /**
   * Get autocomplete suggestions
   */
  async getAutocomplete(
    prefix: string,
    options: {
      types?: SearchableType[];
      size?: number;
      userId?: string;
    } = {}
  ): Promise<AutocompleteResult> {
    return this.autocomplete.getSuggestions(prefix, options);
  }

  /**
   * Get trending items
   */
  getTrending(options: {
    type?: 'hashtag' | 'topic' | 'search';
    category?: string;
    limit?: number;
  } = {}): TrendingItem[] {
    return this.trending.getTrending(options);
  }

  /**
   * Get trending hashtags
   */
  getTrendingHashtags(limit: number = 10): TrendingItem[] {
    return this.trending.getTrendingHashtags(limit);
  }

  /**
   * Get trending searches
   */
  getTrendingSearches(limit: number = 10): TrendingItem[] {
    return this.trending.getTrendingSearches(limit);
  }

  /**
   * Index a document
   */
  async index(document: SearchDocument): Promise<boolean> {
    return this.indexer.index(document);
  }

  /**
   * Queue document for bulk indexing
   */
  queueForIndex(document: SearchDocument): void {
    this.indexer.queueForIndex(document);
  }

  /**
   * Update a document
   */
  async updateDocument(
    type: SearchableType,
    id: string,
    updates: Partial<SearchDocument>
  ): Promise<boolean> {
    return this.indexer.update(type, id, updates);
  }

  /**
   * Delete a document
   */
  async deleteDocument(type: SearchableType, id: string): Promise<boolean> {
    return this.indexer.delete(type, id);
  }

  /**
   * Reindex all documents of a type
   */
  async reindex(
    type: SearchableType,
    documents: SearchDocument[]
  ): Promise<{ success: number; failed: number }> {
    return this.indexer.reindex(type, documents);
  }

  /**
   * Search users
   */
  async searchUsers(
    query: string,
    options: { size?: number; verified?: boolean } = {}
  ): Promise<SearchResult> {
    const searchQuery: SearchQuery = {
      query,
      types: ['user'],
      size: options.size,
    };

    if (options.verified !== undefined) {
      searchQuery.filters = [
        { field: 'verified', operator: 'eq', value: options.verified },
      ];
    }

    return this.search(searchQuery);
  }

  /**
   * Search posts
   */
  async searchPosts(
    query: string,
    options: {
      size?: number;
      authorId?: string;
      hashtags?: string[];
      fromDate?: Date;
      toDate?: Date;
    } = {}
  ): Promise<SearchResult> {
    const searchQuery: SearchQuery = {
      query,
      types: ['post'],
      size: options.size,
      filters: [],
    };

    if (options.authorId) {
      searchQuery.filters!.push({
        field: 'authorId',
        operator: 'eq',
        value: options.authorId,
      });
    }

    if (options.hashtags && options.hashtags.length > 0) {
      searchQuery.filters!.push({
        field: 'hashtags',
        operator: 'in',
        value: options.hashtags,
      });
    }

    if (options.fromDate || options.toDate) {
      searchQuery.filters!.push({
        field: 'createdAt',
        operator: 'range',
        value: {
          min: options.fromDate?.toISOString(),
          max: options.toDate?.toISOString(),
        },
      });
    }

    return this.search(searchQuery);
  }

  /**
   * Search hashtags
   */
  async searchHashtags(
    query: string,
    options: { size?: number } = {}
  ): Promise<SearchResult> {
    return this.search({
      query,
      types: ['hashtag'],
      size: options.size,
      sort: { field: 'postCount', order: 'desc' },
    });
  }

  /**
   * Search communities
   */
  async searchCommunities(
    query: string,
    options: { size?: number; category?: string; isPrivate?: boolean } = {}
  ): Promise<SearchResult> {
    const searchQuery: SearchQuery = {
      query,
      types: ['community'],
      size: options.size,
      filters: [],
    };

    if (options.category) {
      searchQuery.filters!.push({
        field: 'category',
        operator: 'eq',
        value: options.category,
      });
    }

    if (options.isPrivate !== undefined) {
      searchQuery.filters!.push({
        field: 'isPrivate',
        operator: 'eq',
        value: options.isPrivate,
      });
    }

    return this.search(searchQuery);
  }

  /**
   * Search messages (for user's own messages)
   */
  async searchMessages(
    query: string,
    userId: string,
    options: { size?: number; conversationId?: string } = {}
  ): Promise<SearchResult> {
    const searchQuery: SearchQuery = {
      query,
      types: ['message'],
      size: options.size,
      filters: [
        {
          field: 'senderId',
          operator: 'in',
          value: [userId],
        },
      ],
    };

    if (options.conversationId) {
      searchQuery.filters!.push({
        field: 'conversationId',
        operator: 'eq',
        value: options.conversationId,
      });
    }

    return this.search(searchQuery, userId);
  }

  /**
   * Record search analytics
   */
  private recordSearchAnalytics(
    query: SearchQuery,
    userId: string | undefined,
    resultCount: number
  ): void {
    const analytics: SearchAnalytics = {
      query: query.query,
      userId,
      timestamp: new Date(),
      resultCount,
      clickedResults: [],
      filters: query.filters || [],
    };

    this.analytics.push(analytics);

    // Keep last 10000 searches
    if (this.analytics.length > 10000) {
      this.analytics.shift();
    }
  }

  /**
   * Record search result click
   */
  recordClick(query: string, resultId: string, userId?: string): void {
    // Find recent search
    const recentSearch = [...this.analytics]
      .reverse()
      .find((a) => a.query === query && a.userId === userId);

    if (recentSearch) {
      recentSearch.clickedResults.push(resultId);
    }
  }

  /**
   * Get search analytics
   */
  getSearchAnalytics(limit: number = 100): SearchAnalytics[] {
    return this.analytics.slice(-limit);
  }

  /**
   * Get indices for types
   */
  private getIndices(types?: SearchableType[]): string[] {
    if (!types || types.length === 0) {
      return Object.values(this.config.indices);
    }

    return types.map((type) => {
      switch (type) {
        case 'user':
          return this.config.indices.users;
        case 'post':
          return this.config.indices.posts;
        case 'comment':
          return this.config.indices.comments;
        case 'hashtag':
          return this.config.indices.hashtags;
        case 'community':
          return this.config.indices.communities;
        case 'message':
          return this.config.indices.messages;
        default:
          return this.config.indices.posts;
      }
    });
  }

  /**
   * Convert Elasticsearch source to SearchDocument
   */
  private sourceToDocument(source: Record<string, unknown>): SearchDocument {
    return {
      id: source.id as string,
      type: source.type as SearchableType,
      content: source.content as string || '',
      title: source.title as string,
      authorId: source.authorId as string,
      authorName: source.authorName as string,
      createdAt: new Date(source.createdAt as string),
      updatedAt: new Date(source.updatedAt as string),
      metadata: source,
    };
  }

  /**
   * Process aggregations
   */
  private processAggregations(
    aggs: Record<string, unknown>
  ): Record<string, { buckets: Array<{ key: string; count: number }> }> {
    const result: Record<string, { buckets: Array<{ key: string; count: number }> }> = {};

    for (const [key, value] of Object.entries(aggs)) {
      const aggValue = value as { buckets?: Array<{ key: string; doc_count: number }> };
      if (aggValue.buckets) {
        result[key] = {
          buckets: aggValue.buckets.map((b) => ({
            key: b.key,
            count: b.doc_count,
          })),
        };
      }
    }

    return result;
  }

  /**
   * Merge configuration
   */
  private mergeConfig(base: SearchConfig, override: Partial<SearchConfig>): SearchConfig {
    return {
      elasticsearch: { ...base.elasticsearch, ...override.elasticsearch },
      indices: { ...base.indices, ...override.indices },
      defaults: { ...base.defaults, ...override.defaults },
    };
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    indices: Record<SearchableType, { docCount: number; sizeBytes: number }>;
    trending: ReturnType<TrendingService['getStats']>;
    analyticsCount: number;
  }> {
    return {
      indices: await this.indexer.getStats(),
      trending: this.trending.getStats(),
      analyticsCount: this.analytics.length,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; available: boolean }> {
    return this.client.healthCheck();
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    this.indexer.stopPeriodicFlush();
    await this.indexer.flushQueue();
    await this.client.close();
    logger.info('Search service shutdown complete');
  }
}

// Export singleton factory
export function createSearchService(config?: Partial<SearchConfig>): SearchService {
  return new SearchService(config);
}
