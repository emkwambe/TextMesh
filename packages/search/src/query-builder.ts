/**
 * Search Query Builder
 *
 * Builds Elasticsearch queries from search parameters
 */

import { SearchQuery, SearchFilter, SearchableType, SearchConfig } from './types';

export class SearchQueryBuilder {
  private config: SearchConfig;

  constructor(config: SearchConfig) {
    this.config = config;
  }

  /**
   * Build Elasticsearch query from search parameters
   */
  build(query: SearchQuery): Record<string, unknown> {
    const esQuery: Record<string, unknown> = {
      from: query.from || 0,
      size: Math.min(query.size || this.config.defaults.size, this.config.defaults.maxSize),
    };

    // Build the main query
    esQuery.query = this.buildQuery(query);

    // Add sorting
    if (query.sort) {
      esQuery.sort = [{ [query.sort.field]: { order: query.sort.order } }];
    } else {
      // Default: relevance + recency
      esQuery.sort = [
        { _score: { order: 'desc' } },
        { createdAt: { order: 'desc' } },
      ];
    }

    // Add highlighting
    if (query.highlight !== false) {
      esQuery.highlight = this.buildHighlight();
    }

    // Add aggregations
    if (query.aggregations && query.aggregations.length > 0) {
      esQuery.aggs = this.buildAggregations(query.aggregations);
    }

    // Add suggestions
    if (query.suggest) {
      esQuery.suggest = this.buildSuggestions(query.query);
    }

    return esQuery;
  }

  /**
   * Build the main query part
   */
  private buildQuery(searchQuery: SearchQuery): Record<string, unknown> {
    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [];
    const should: Record<string, unknown>[] = [];

    // Main text query
    if (searchQuery.query && searchQuery.query.trim()) {
      must.push({
        multi_match: {
          query: searchQuery.query,
          fields: this.getSearchFields(searchQuery.types),
          type: 'best_fields',
          fuzziness: 'AUTO',
          prefix_length: 2,
          operator: 'or',
          minimum_should_match: '75%',
        },
      });

      // Boost exact matches
      should.push({
        multi_match: {
          query: searchQuery.query,
          fields: this.getExactMatchFields(searchQuery.types),
          type: 'phrase',
          boost: 2,
        },
      });
    }

    // Type filter
    if (searchQuery.types && searchQuery.types.length > 0) {
      filter.push({
        terms: { type: searchQuery.types },
      });
    }

    // Apply additional filters
    if (searchQuery.filters) {
      for (const f of searchQuery.filters) {
        filter.push(this.buildFilter(f));
      }
    }

    // Build bool query
    const boolQuery: Record<string, unknown> = {};

    if (must.length > 0) {
      boolQuery.must = must;
    }

    if (filter.length > 0) {
      boolQuery.filter = filter;
    }

    if (should.length > 0) {
      boolQuery.should = should;
    }

    return { bool: boolQuery };
  }

  /**
   * Get search fields based on types
   */
  private getSearchFields(types?: SearchableType[]): string[] {
    const allFields = [
      'content^1',
      'title^2',
      'username^3',
      'displayName^2',
      'name^2',
      'description^1',
      'bio^1',
      'tag^3',
      'hashtags^2',
    ];

    if (!types || types.length === 0) {
      return allFields;
    }

    const fieldsByType: Record<SearchableType, string[]> = {
      user: ['username^3', 'displayName^2', 'bio^1'],
      post: ['content^1', 'hashtags^2'],
      comment: ['content^1'],
      hashtag: ['tag^3'],
      community: ['name^2', 'description^1'],
      message: ['content^1'],
    };

    const fields = new Set<string>();
    for (const type of types) {
      for (const field of fieldsByType[type]) {
        fields.add(field);
      }
    }

    return Array.from(fields);
  }

  /**
   * Get exact match fields
   */
  private getExactMatchFields(types?: SearchableType[]): string[] {
    return [
      'username.keyword',
      'displayName',
      'name.keyword',
      'tag.keyword',
    ];
  }

  /**
   * Build a single filter
   */
  private buildFilter(filter: SearchFilter): Record<string, unknown> {
    switch (filter.operator) {
      case 'eq':
        return { term: { [filter.field]: filter.value } };

      case 'neq':
        return { bool: { must_not: { term: { [filter.field]: filter.value } } } };

      case 'gt':
        return { range: { [filter.field]: { gt: filter.value } } };

      case 'gte':
        return { range: { [filter.field]: { gte: filter.value } } };

      case 'lt':
        return { range: { [filter.field]: { lt: filter.value } } };

      case 'lte':
        return { range: { [filter.field]: { lte: filter.value } } };

      case 'in':
        return { terms: { [filter.field]: filter.value } };

      case 'nin':
        return { bool: { must_not: { terms: { [filter.field]: filter.value } } } };

      case 'range':
        const rangeValue = filter.value as { min?: unknown; max?: unknown };
        const range: Record<string, unknown> = {};
        if (rangeValue.min !== undefined) range.gte = rangeValue.min;
        if (rangeValue.max !== undefined) range.lte = rangeValue.max;
        return { range: { [filter.field]: range } };

      case 'exists':
        return filter.value
          ? { exists: { field: filter.field } }
          : { bool: { must_not: { exists: { field: filter.field } } } };

      default:
        return { term: { [filter.field]: filter.value } };
    }
  }

  /**
   * Build highlight configuration
   */
  private buildHighlight(): Record<string, unknown> {
    return {
      fields: {
        content: {
          fragment_size: this.config.defaults.highlightFragmentSize,
          number_of_fragments: 3,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        title: {
          number_of_fragments: 0,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        username: {
          number_of_fragments: 0,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        displayName: {
          number_of_fragments: 0,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        name: {
          number_of_fragments: 0,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        description: {
          fragment_size: this.config.defaults.highlightFragmentSize,
          number_of_fragments: 2,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        bio: {
          fragment_size: this.config.defaults.highlightFragmentSize,
          number_of_fragments: 1,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        tag: {
          number_of_fragments: 0,
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
      },
    };
  }

  /**
   * Build aggregations
   */
  private buildAggregations(aggregations: string[]): Record<string, unknown> {
    const aggs: Record<string, unknown> = {};

    for (const agg of aggregations) {
      switch (agg) {
        case 'types':
          aggs.types = { terms: { field: 'type', size: 10 } };
          break;
        case 'authors':
          aggs.authors = { terms: { field: 'authorId', size: 20 } };
          break;
        case 'hashtags':
          aggs.hashtags = { terms: { field: 'hashtags', size: 20 } };
          break;
        case 'categories':
          aggs.categories = { terms: { field: 'category', size: 20 } };
          break;
        case 'date_histogram':
          aggs.date_histogram = {
            date_histogram: {
              field: 'createdAt',
              calendar_interval: 'day',
            },
          };
          break;
      }
    }

    return aggs;
  }

  /**
   * Build suggestions
   */
  private buildSuggestions(query: string): Record<string, unknown> {
    return {
      text: query,
      simple_phrase: {
        phrase: {
          field: 'content',
          size: this.config.defaults.suggestSize,
          gram_size: 3,
          direct_generator: [
            {
              field: 'content',
              suggest_mode: 'popular',
            },
          ],
        },
      },
    };
  }

  /**
   * Build autocomplete query
   */
  buildAutocomplete(
    prefix: string,
    types?: SearchableType[],
    size: number = 10
  ): Record<string, unknown> {
    const should: Record<string, unknown>[] = [];

    // Prefix query on autocomplete fields
    const autocompleteFields = [
      'username.autocomplete',
      'displayName.autocomplete',
      'name.autocomplete',
      'tag.autocomplete',
      'content.autocomplete',
    ];

    for (const field of autocompleteFields) {
      should.push({
        match: {
          [field]: {
            query: prefix,
            operator: 'and',
          },
        },
      });
    }

    // Also do prefix matching on keyword fields
    should.push({
      prefix: {
        'username.keyword': {
          value: prefix.toLowerCase(),
          boost: 2,
        },
      },
    });

    const query: Record<string, unknown> = {
      size,
      query: {
        bool: {
          should,
          minimum_should_match: 1,
        },
      },
      _source: ['id', 'type', 'username', 'displayName', 'name', 'tag', 'content'],
    };

    // Filter by types if specified
    if (types && types.length > 0) {
      (query.query as Record<string, Record<string, unknown>>).bool.filter = {
        terms: { type: types },
      };
    }

    return query;
  }
}
