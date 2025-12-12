/**
 * TextMesh Search Package
 *
 * Full-text search with Elasticsearch including:
 * - Multi-type search (users, posts, hashtags, etc.)
 * - Autocomplete suggestions
 * - Trending topics and hashtags
 * - Search analytics
 */

export * from './types';
export * from './elasticsearch-client';
export * from './indexer';
export * from './query-builder';
export * from './autocomplete';
export * from './trending';
export * from './search-service';
