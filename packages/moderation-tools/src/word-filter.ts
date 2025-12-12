import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { WordFilter, FilterType, ActionType } from './types';

interface FilterMatch {
  filter: WordFilter;
  matches: string[];
  positions: Array<{ start: number; end: number }>;
}

export class WordFilterService {
  private redis: Redis;
  private filters: Map<string, WordFilter> = new Map();
  private readonly filterPrefix = 'moderation:word_filter:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async loadFilters(): Promise<void> {
    this.filters.clear();
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.filterPrefix}*`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const filter = this.deserializeFilter(data);
          this.filters.set(filter.id, filter);
        }
      }
    } while (cursor !== '0');
  }

  async addFilter(
    word: string,
    type: FilterType,
    action: ActionType,
    options: {
      severity?: 'low' | 'medium' | 'high';
      isRegex?: boolean;
      caseSensitive?: boolean;
      contexts?: string[];
      createdBy: string;
    }
  ): Promise<WordFilter> {
    const filter: WordFilter = {
      id: uuidv4(),
      word,
      type,
      action,
      severity: options.severity || 'medium',
      isRegex: options.isRegex || false,
      caseSensitive: options.caseSensitive || false,
      contexts: options.contexts || ['all'],
      createdAt: new Date(),
      createdBy: options.createdBy,
    };

    await this.saveFilter(filter);
    this.filters.set(filter.id, filter);

    return filter;
  }

  async updateFilter(
    filterId: string,
    updates: Partial<Pick<WordFilter, 'word' | 'type' | 'action' | 'severity' | 'isRegex' | 'caseSensitive' | 'contexts'>>
  ): Promise<WordFilter | null> {
    const filter = this.filters.get(filterId);
    if (!filter) return null;

    Object.assign(filter, updates);
    await this.saveFilter(filter);
    this.filters.set(filterId, filter);

    return filter;
  }

  async deleteFilter(filterId: string): Promise<boolean> {
    await this.redis.del(`${this.filterPrefix}${filterId}`);
    this.filters.delete(filterId);
    return true;
  }

  async getFilter(filterId: string): Promise<WordFilter | null> {
    return this.filters.get(filterId) || null;
  }

  async listFilters(
    options: {
      type?: FilterType;
      severity?: 'low' | 'medium' | 'high';
      context?: string;
    } = {}
  ): Promise<WordFilter[]> {
    let filters = Array.from(this.filters.values());

    if (options.type) {
      filters = filters.filter((f) => f.type === options.type);
    }

    if (options.severity) {
      filters = filters.filter((f) => f.severity === options.severity);
    }

    if (options.context) {
      filters = filters.filter(
        (f) => f.contexts.includes('all') || f.contexts.includes(options.context!)
      );
    }

    return filters;
  }

  check(
    text: string,
    context: string = 'all'
  ): {
    blocked: boolean;
    flagged: boolean;
    matches: FilterMatch[];
    filteredText: string;
    actions: ActionType[];
  } {
    const matches: FilterMatch[] = [];
    const actions = new Set<ActionType>();
    let filteredText = text;
    let blocked = false;
    let flagged = false;

    const relevantFilters = Array.from(this.filters.values()).filter(
      (f) => f.contexts.includes('all') || f.contexts.includes(context)
    );

    for (const filter of relevantFilters) {
      const filterMatches = this.findMatches(text, filter);

      if (filterMatches.length > 0) {
        matches.push({
          filter,
          matches: filterMatches.map((m) => m.match),
          positions: filterMatches.map((m) => ({
            start: m.start,
            end: m.end,
          })),
        });

        actions.add(filter.action);

        if (filter.type === 'block') {
          blocked = true;
        } else if (filter.type === 'flag') {
          flagged = true;
        } else if (filter.type === 'replace') {
          for (const match of filterMatches.reverse()) {
            const replacement = '*'.repeat(match.match.length);
            filteredText =
              filteredText.substring(0, match.start) +
              replacement +
              filteredText.substring(match.end);
          }
        }
      }
    }

    return {
      blocked,
      flagged,
      matches,
      filteredText,
      actions: Array.from(actions),
    };
  }

  private findMatches(
    text: string,
    filter: WordFilter
  ): Array<{ match: string; start: number; end: number }> {
    const matches: Array<{ match: string; start: number; end: number }> = [];

    try {
      let regex: RegExp;

      if (filter.isRegex) {
        regex = new RegExp(filter.word, filter.caseSensitive ? 'g' : 'gi');
      } else {
        const escapedWord = filter.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(
          `\\b${escapedWord}\\b`,
          filter.caseSensitive ? 'g' : 'gi'
        );
      }

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          match: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    } catch {
    }

    return matches;
  }

  async bulkAddFilters(
    filters: Array<{
      word: string;
      type: FilterType;
      action: ActionType;
      severity?: 'low' | 'medium' | 'high';
    }>,
    createdBy: string
  ): Promise<WordFilter[]> {
    const created: WordFilter[] = [];

    for (const filterData of filters) {
      const filter = await this.addFilter(
        filterData.word,
        filterData.type,
        filterData.action,
        {
          severity: filterData.severity,
          createdBy,
        }
      );
      created.push(filter);
    }

    return created;
  }

  async importFilters(
    data: string,
    format: 'json' | 'csv',
    createdBy: string
  ): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      if (format === 'json') {
        const filters = JSON.parse(data);
        for (const filterData of filters) {
          try {
            await this.addFilter(
              filterData.word,
              filterData.type || 'block',
              filterData.action || 'flag',
              {
                severity: filterData.severity,
                isRegex: filterData.isRegex,
                caseSensitive: filterData.caseSensitive,
                contexts: filterData.contexts,
                createdBy,
              }
            );
            imported++;
          } catch (err) {
            errors.push(`Failed to import "${filterData.word}": ${err}`);
          }
        }
      } else if (format === 'csv') {
        const lines = data.split('\n').filter((l) => l.trim());

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map((p) => p.trim());
          if (parts.length < 3) {
            errors.push(`Line ${i + 1}: Invalid format`);
            continue;
          }

          try {
            await this.addFilter(
              parts[0],
              parts[1] as FilterType,
              parts[2] as ActionType,
              {
                severity: (parts[3] as 'low' | 'medium' | 'high') || 'medium',
                createdBy,
              }
            );
            imported++;
          } catch (err) {
            errors.push(`Line ${i + 1}: ${err}`);
          }
        }
      }
    } catch (err) {
      errors.push(`Parse error: ${err}`);
    }

    return { imported, errors };
  }

  async exportFilters(format: 'json' | 'csv'): Promise<string> {
    const filters = Array.from(this.filters.values());

    if (format === 'json') {
      return JSON.stringify(
        filters.map((f) => ({
          word: f.word,
          type: f.type,
          action: f.action,
          severity: f.severity,
          isRegex: f.isRegex,
          caseSensitive: f.caseSensitive,
          contexts: f.contexts,
        })),
        null,
        2
      );
    } else {
      const header = 'word,type,action,severity,isRegex,caseSensitive,contexts';
      const rows = filters.map(
        (f) =>
          `${f.word},${f.type},${f.action},${f.severity},${f.isRegex},${f.caseSensitive},"${f.contexts.join(';')}"`
      );
      return [header, ...rows].join('\n');
    }
  }

  private async saveFilter(filter: WordFilter): Promise<void> {
    await this.redis.set(
      `${this.filterPrefix}${filter.id}`,
      JSON.stringify(filter)
    );
  }

  private deserializeFilter(data: string): WordFilter {
    const filter = JSON.parse(data);
    filter.createdAt = new Date(filter.createdAt);
    return filter;
  }
}
