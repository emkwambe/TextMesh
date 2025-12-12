/**
 * Search Types
 */

export type SearchableType = 'user' | 'post' | 'comment' | 'hashtag' | 'community' | 'message';

export interface SearchDocument {
  id: string;
  type: SearchableType;
  content: string;
  title?: string;
  authorId?: string;
  authorName?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  boost?: number;
}

export interface SearchQuery {
  query: string;
  types?: SearchableType[];
  filters?: SearchFilter[];
  sort?: SearchSort;
  from?: number;
  size?: number;
  highlight?: boolean;
  suggest?: boolean;
  aggregations?: string[];
}

export interface SearchFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'range' | 'exists';
  value: unknown;
}

export interface SearchSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface SearchResult {
  total: number;
  hits: SearchHit[];
  aggregations?: Record<string, AggregationResult>;
  suggestions?: Suggestion[];
  took: number;
}

export interface SearchHit {
  id: string;
  type: SearchableType;
  score: number;
  document: SearchDocument;
  highlights?: Record<string, string[]>;
}

export interface AggregationResult {
  buckets: Array<{
    key: string;
    count: number;
  }>;
}

export interface Suggestion {
  text: string;
  score: number;
  frequency: number;
}

export interface AutocompleteResult {
  suggestions: Array<{
    text: string;
    type: SearchableType;
    id?: string;
    score: number;
  }>;
}

export interface IndexMapping {
  properties: Record<string, {
    type: string;
    analyzer?: string;
    fields?: Record<string, unknown>;
    index?: boolean;
  }>;
}

export interface SearchConfig {
  elasticsearch: {
    node: string;
    auth?: {
      username: string;
      password: string;
    };
    tls?: {
      rejectUnauthorized: boolean;
    };
  };
  indices: {
    users: string;
    posts: string;
    comments: string;
    hashtags: string;
    communities: string;
    messages: string;
  };
  defaults: {
    size: number;
    maxSize: number;
    highlightFragmentSize: number;
    suggestSize: number;
  };
}

export interface TrendingItem {
  term: string;
  type: 'hashtag' | 'topic' | 'search';
  count: number;
  velocity: number; // Rate of increase
  category?: string;
}

export interface SearchAnalytics {
  query: string;
  userId?: string;
  timestamp: Date;
  resultCount: number;
  clickedResults: string[];
  filters: SearchFilter[];
}
