/**
 * Search Indexer
 *
 * Manages indexing of searchable content
 */

import { createLogger } from '@textmesh/logger';
import {
  SearchDocument,
  SearchableType,
  SearchConfig,
  IndexMapping,
} from './types';
import { ElasticsearchClient } from './elasticsearch-client';

const logger = createLogger({ service: 'search-indexer', level: 'info' });

// Index mappings for each type
const INDEX_MAPPINGS: Record<SearchableType, IndexMapping> = {
  user: {
    properties: {
      id: { type: 'keyword' },
      type: { type: 'keyword' },
      username: {
        type: 'text',
        analyzer: 'text_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: { type: 'text', analyzer: 'autocomplete_analyzer' },
        },
      },
      displayName: {
        type: 'text',
        analyzer: 'text_analyzer',
        fields: {
          autocomplete: { type: 'text', analyzer: 'autocomplete_analyzer' },
        },
      },
      bio: { type: 'text', analyzer: 'text_analyzer' },
      followerCount: { type: 'integer' },
      verified: { type: 'boolean' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  post: {
    properties: {
      id: { type: 'keyword' },
      type: { type: 'keyword' },
      content: {
        type: 'text',
        analyzer: 'text_analyzer',
        fields: {
          autocomplete: { type: 'text', analyzer: 'autocomplete_analyzer' },
        },
      },
      authorId: { type: 'keyword' },
      authorName: { type: 'text' },
      hashtags: { type: 'keyword' },
      mentions: { type: 'keyword' },
      likeCount: { type: 'integer' },
      commentCount: { type: 'integer' },
      shareCount: { type: 'integer' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  comment: {
    properties: {
      id: { type: 'keyword' },
      type: { type: 'keyword' },
      content: { type: 'text', analyzer: 'text_analyzer' },
      postId: { type: 'keyword' },
      authorId: { type: 'keyword' },
      authorName: { type: 'text' },
      likeCount: { type: 'integer' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  hashtag: {
    properties: {
      id: { type: 'keyword' },
      type: { type: 'keyword' },
      tag: {
        type: 'text',
        analyzer: 'hashtag_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: { type: 'text', analyzer: 'autocomplete_analyzer' },
        },
      },
      postCount: { type: 'integer' },
      trendingScore: { type: 'float' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  community: {
    properties: {
      id: { type: 'keyword' },
      type: { type: 'keyword' },
      name: {
        type: 'text',
        analyzer: 'text_analyzer',
        fields: {
          keyword: { type: 'keyword' },
          autocomplete: { type: 'text', analyzer: 'autocomplete_analyzer' },
        },
      },
      description: { type: 'text', analyzer: 'text_analyzer' },
      category: { type: 'keyword' },
      memberCount: { type: 'integer' },
      isPrivate: { type: 'boolean' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  message: {
    properties: {
      id: { type: 'keyword' },
      type: { type: 'keyword' },
      content: { type: 'text', analyzer: 'text_analyzer' },
      conversationId: { type: 'keyword' },
      senderId: { type: 'keyword' },
      recipientId: { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
};

export class SearchIndexer {
  private client: ElasticsearchClient;
  private config: SearchConfig;
  private indexQueue: Map<string, SearchDocument[]> = new Map();
  private flushInterval?: NodeJS.Timeout;

  constructor(client: ElasticsearchClient, config: SearchConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Initialize all indices
   */
  async initializeIndices(): Promise<void> {
    const types: SearchableType[] = ['user', 'post', 'comment', 'hashtag', 'community', 'message'];

    for (const type of types) {
      const indexName = this.getIndexName(type);
      const mapping = INDEX_MAPPINGS[type];

      await this.client.createIndex(indexName, mapping);
    }

    logger.info('All indices initialized');
  }

  /**
   * Get index name for type
   */
  private getIndexName(type: SearchableType): string {
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
        return `textmesh_${type}`;
    }
  }

  /**
   * Index a document
   */
  async index(document: SearchDocument): Promise<boolean> {
    const indexName = this.getIndexName(document.type);

    const doc = this.transformDocument(document);

    const result = await this.client.index(indexName, document.id, doc);

    if (result) {
      logger.debug('Document indexed', { type: document.type, id: document.id });
    }

    return result;
  }

  /**
   * Queue document for bulk indexing
   */
  queueForIndex(document: SearchDocument): void {
    const indexName = this.getIndexName(document.type);
    const queue = this.indexQueue.get(indexName) || [];
    queue.push(document);
    this.indexQueue.set(indexName, queue);

    // Auto-flush if queue is large
    if (queue.length >= 100) {
      this.flushQueue(indexName);
    }
  }

  /**
   * Flush index queue
   */
  async flushQueue(indexName?: string): Promise<void> {
    const indices = indexName ? [indexName] : Array.from(this.indexQueue.keys());

    for (const idx of indices) {
      const queue = this.indexQueue.get(idx);
      if (!queue || queue.length === 0) continue;

      const documents = queue.map((doc) => ({
        id: doc.id,
        document: this.transformDocument(doc),
      }));

      const result = await this.client.bulkIndex(idx, documents);
      logger.info('Queue flushed', { index: idx, ...result });

      this.indexQueue.set(idx, []);
    }
  }

  /**
   * Start periodic queue flushing
   */
  startPeriodicFlush(intervalMs: number = 5000): void {
    this.flushInterval = setInterval(() => {
      this.flushQueue();
    }, intervalMs);
  }

  /**
   * Stop periodic flushing
   */
  stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }

  /**
   * Update a document
   */
  async update(
    type: SearchableType,
    id: string,
    updates: Partial<SearchDocument>
  ): Promise<boolean> {
    const indexName = this.getIndexName(type);
    return this.client.update(indexName, id, updates);
  }

  /**
   * Delete a document
   */
  async delete(type: SearchableType, id: string): Promise<boolean> {
    const indexName = this.getIndexName(type);
    return this.client.delete(indexName, id);
  }

  /**
   * Bulk delete documents
   */
  async bulkDelete(type: SearchableType, ids: string[]): Promise<number> {
    let deleted = 0;

    for (const id of ids) {
      if (await this.delete(type, id)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Reindex all documents of a type
   */
  async reindex(
    type: SearchableType,
    documents: SearchDocument[],
    options: { deleteFirst?: boolean } = {}
  ): Promise<{ success: number; failed: number }> {
    const indexName = this.getIndexName(type);

    if (options.deleteFirst) {
      await this.client.deleteIndex(indexName);
      await this.client.createIndex(indexName, INDEX_MAPPINGS[type]);
    }

    const docs = documents.map((doc) => ({
      id: doc.id,
      document: this.transformDocument(doc),
    }));

    return this.client.bulkIndex(indexName, docs);
  }

  /**
   * Transform document for indexing
   */
  private transformDocument(document: SearchDocument): Record<string, unknown> {
    const doc: Record<string, unknown> = {
      id: document.id,
      type: document.type,
      content: document.content,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      ...document.metadata,
    };

    if (document.title) {
      doc.title = document.title;
    }

    if (document.authorId) {
      doc.authorId = document.authorId;
    }

    if (document.authorName) {
      doc.authorName = document.authorName;
    }

    if (document.boost) {
      doc._boost = document.boost;
    }

    return doc;
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<Record<SearchableType, { docCount: number; sizeBytes: number }>> {
    const types: SearchableType[] = ['user', 'post', 'comment', 'hashtag', 'community', 'message'];
    const stats: Record<string, { docCount: number; sizeBytes: number }> = {};

    for (const type of types) {
      const indexName = this.getIndexName(type);
      stats[type] = await this.client.getStats(indexName);
    }

    return stats as Record<SearchableType, { docCount: number; sizeBytes: number }>;
  }
}
