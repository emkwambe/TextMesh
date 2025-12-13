/**
 * Elasticsearch Client Wrapper
 *
 * Manages Elasticsearch connection and operations
 */

import { Client } from '@elastic/elasticsearch';
import { createLogger } from '@textmesh/logger';
import { SearchConfig, IndexMapping } from './types';

const logger = createLogger({ service: 'elasticsearch-client', level: 'info' });

export class ElasticsearchClient {
  private client: Client;
  private config: SearchConfig;

  constructor(config: SearchConfig) {
    this.config = config;
    this.client = new Client({
      node: config.elasticsearch.node,
      auth: config.elasticsearch.auth,
      tls: config.elasticsearch.tls,
    });
  }

  /**
   * Get the raw Elasticsearch client
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Check cluster health
   */
  async healthCheck(): Promise<{ status: string; available: boolean }> {
    try {
      const health = await this.client.cluster.health();
      return {
        status: health.status,
        available: health.status !== 'red',
      };
    } catch (error) {
      logger.error('Elasticsearch health check failed', { error });
      return { status: 'unavailable', available: false };
    }
  }

  /**
   * Create an index with mapping
   */
  async createIndex(indexName: string, mapping: IndexMapping): Promise<boolean> {
    try {
      const exists = await this.client.indices.exists({ index: indexName });

      if (exists) {
        logger.info('Index already exists', { indexName });
        return true;
      }

      await this.client.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 3,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                text_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'snowball'],
                },
                autocomplete_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'edge_ngram_filter'],
                },
                hashtag_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase'],
                },
              },
              filter: {
                edge_ngram_filter: {
                  type: 'edge_ngram',
                  min_gram: 1,
                  max_gram: 20,
                },
              },
            },
          },
          mappings: mapping as any,
        },
      });

      logger.info('Index created', { indexName });
      return true;
    } catch (error) {
      logger.error('Failed to create index', { indexName, error });
      return false;
    }
  }

  /**
   * Delete an index
   */
  async deleteIndex(indexName: string): Promise<boolean> {
    try {
      await this.client.indices.delete({ index: indexName });
      logger.info('Index deleted', { indexName });
      return true;
    } catch (error) {
      logger.error('Failed to delete index', { indexName, error });
      return false;
    }
  }

  /**
   * Index a document
   */
  async index(
    indexName: string,
    id: string,
    document: Record<string, unknown>
  ): Promise<boolean> {
    try {
      await this.client.index({
        index: indexName,
        id,
        document,
        refresh: true,
      });
      return true;
    } catch (error) {
      logger.error('Failed to index document', { indexName, id, error });
      return false;
    }
  }

  /**
   * Bulk index documents
   */
  async bulkIndex(
    indexName: string,
    documents: Array<{ id: string; document: Record<string, unknown> }>
  ): Promise<{ success: number; failed: number }> {
    if (documents.length === 0) {
      return { success: 0, failed: 0 };
    }

    try {
      const operations = documents.flatMap((doc) => [
        { index: { _index: indexName, _id: doc.id } },
        doc.document,
      ]);

      const result = await this.client.bulk({
        operations,
        refresh: true,
      });

      const failed = result.items.filter((item) => item.index?.error).length;
      const success = documents.length - failed;

      if (failed > 0) {
        logger.warn('Some documents failed to index', { indexName, failed, success });
      }

      return { success, failed };
    } catch (error) {
      logger.error('Bulk index failed', { indexName, error });
      return { success: 0, failed: documents.length };
    }
  }

  /**
   * Update a document
   */
  async update(
    indexName: string,
    id: string,
    document: Record<string, unknown>
  ): Promise<boolean> {
    try {
      await this.client.update({
        index: indexName,
        id,
        doc: document,
        refresh: true,
      });
      return true;
    } catch (error) {
      logger.error('Failed to update document', { indexName, id, error });
      return false;
    }
  }

  /**
   * Delete a document
   */
  async delete(indexName: string, id: string): Promise<boolean> {
    try {
      await this.client.delete({
        index: indexName,
        id,
        refresh: true,
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete document', { indexName, id, error });
      return false;
    }
  }

  /**
   * Search documents
   */
  async search(
    indexName: string | string[],
    query: Record<string, unknown>
  ): Promise<{
    hits: Array<{ id: string; score: number; source: Record<string, unknown>; highlight?: Record<string, string[]> }>;
    total: number;
    aggregations?: Record<string, unknown>;
    took: number;
  }> {
    try {
      const result = await this.client.search({
        index: indexName,
        ...query,
      });

      const hits = result.hits.hits.map((hit) => ({
        id: hit._id as string,
        score: hit._score || 0,
        source: hit._source as Record<string, unknown>,
        highlight: hit.highlight as Record<string, string[]> | undefined,
      }));

      return {
        hits,
        total: typeof result.hits.total === 'number'
          ? result.hits.total
          : result.hits.total?.value || 0,
        aggregations: result.aggregations as Record<string, unknown> | undefined,
        took: result.took,
      };
    } catch (error) {
      logger.error('Search failed', { indexName, error });
      return { hits: [], total: 0, took: 0 };
    }
  }

  /**
   * Get document by ID
   */
  async get(indexName: string, id: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.client.get({
        index: indexName,
        id,
      });
      return result._source as Record<string, unknown>;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if document exists
   */
  async exists(indexName: string, id: string): Promise<boolean> {
    try {
      return await this.client.exists({ index: indexName, id });
    } catch (error) {
      return false;
    }
  }

  /**
   * Refresh index
   */
  async refresh(indexName: string): Promise<void> {
    await this.client.indices.refresh({ index: indexName });
  }

  /**
   * Get index stats
   */
  async getStats(indexName: string): Promise<{
    docCount: number;
    sizeBytes: number;
  }> {
    try {
      const stats = await this.client.indices.stats({ index: indexName });
      const indexStats = stats.indices?.[indexName];

      return {
        docCount: indexStats?.primaries?.docs?.count || 0,
        sizeBytes: indexStats?.primaries?.store?.size_in_bytes || 0,
      };
    } catch (error) {
      logger.error('Failed to get index stats', { indexName, error });
      return { docCount: 0, sizeBytes: 0 };
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}
