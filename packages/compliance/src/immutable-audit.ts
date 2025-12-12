import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { AuditEntry, AuditAction } from './types';

export class ImmutableAuditTrail {
  private redis: Redis;
  private readonly auditPrefix = 'compliance:audit:';
  private readonly chainPrefix = 'compliance:audit_chain:';
  private readonly indexPrefix = 'compliance:audit_index:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async log(
    action: AuditAction,
    actorType: AuditEntry['actorType'],
    actorId: string,
    targetType: AuditEntry['targetType'],
    targetId: string,
    details: Record<string, unknown>,
    options: {
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<AuditEntry> {
    // Get previous hash for chain
    const previousHash = await this.getLatestHash();

    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      action,
      actorType,
      actorId,
      targetType,
      targetId,
      details,
      previousState: options.previousState,
      newState: options.newState,
      reason: options.reason,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      hash: '', // Will be calculated
      previousHash,
    };

    // Calculate hash
    entry.hash = this.calculateHash(entry);

    // Store entry
    await this.storeEntry(entry);

    return entry;
  }

  async getEntry(entryId: string): Promise<AuditEntry | null> {
    const data = await this.redis.get(`${this.auditPrefix}${entryId}`);
    if (!data) return null;

    return this.deserializeEntry(data);
  }

  async getEntriesByTarget(
    targetType: AuditEntry['targetType'],
    targetId: string,
    options: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditEntry[]> {
    const { limit = 100, startDate, endDate } = options;

    const start = startDate?.getTime() || '-inf';
    const end = endDate?.getTime() || '+inf';

    const entryIds = await this.redis.zrevrangebyscore(
      `${this.indexPrefix}target:${targetType}:${targetId}`,
      end,
      start,
      'LIMIT',
      0,
      limit
    );

    return this.getEntriesByIds(entryIds);
  }

  async getEntriesByActor(
    actorId: string,
    options: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditEntry[]> {
    const { limit = 100, startDate, endDate } = options;

    const start = startDate?.getTime() || '-inf';
    const end = endDate?.getTime() || '+inf';

    const entryIds = await this.redis.zrevrangebyscore(
      `${this.indexPrefix}actor:${actorId}`,
      end,
      start,
      'LIMIT',
      0,
      limit
    );

    return this.getEntriesByIds(entryIds);
  }

  async getEntriesByAction(
    action: AuditAction,
    options: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditEntry[]> {
    const { limit = 100, startDate, endDate } = options;

    const start = startDate?.getTime() || '-inf';
    const end = endDate?.getTime() || '+inf';

    const entryIds = await this.redis.zrevrangebyscore(
      `${this.indexPrefix}action:${action}`,
      end,
      start,
      'LIMIT',
      0,
      limit
    );

    return this.getEntriesByIds(entryIds);
  }

  async verifyIntegrity(startEntryId?: string): Promise<{
    valid: boolean;
    entriesChecked: number;
    invalidEntries: string[];
  }> {
    const invalidEntries: string[] = [];
    let entriesChecked = 0;
    let currentId = startEntryId || await this.getFirstEntryId();

    while (currentId) {
      const entry = await this.getEntry(currentId);
      if (!entry) break;

      entriesChecked++;

      // Verify hash
      const expectedHash = this.calculateHash({
        ...entry,
        hash: '', // Exclude hash from calculation
      });

      if (entry.hash !== expectedHash) {
        invalidEntries.push(entry.id);
      }

      // Get next entry
      currentId = await this.getNextEntryId(entry.timestamp);
    }

    return {
      valid: invalidEntries.length === 0,
      entriesChecked,
      invalidEntries,
    };
  }

  async getAuditStats(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalEntries: number;
    byAction: Record<string, number>;
    byActorType: Record<string, number>;
    byTargetType: Record<string, number>;
  }> {
    const entryIds = await this.redis.zrangebyscore(
      `${this.indexPrefix}time`,
      startDate.getTime(),
      endDate.getTime()
    );

    const entries = await this.getEntriesByIds(entryIds);

    const byAction: Record<string, number> = {};
    const byActorType: Record<string, number> = {};
    const byTargetType: Record<string, number> = {};

    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      byActorType[entry.actorType] = (byActorType[entry.actorType] || 0) + 1;
      byTargetType[entry.targetType] = (byTargetType[entry.targetType] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      byAction,
      byActorType,
      byTargetType,
    };
  }

  async exportAuditLog(
    startDate: Date,
    endDate: Date,
    filters?: {
      actions?: AuditAction[];
      actorTypes?: AuditEntry['actorType'][];
      targetTypes?: AuditEntry['targetType'][];
    }
  ): Promise<AuditEntry[]> {
    const entryIds = await this.redis.zrangebyscore(
      `${this.indexPrefix}time`,
      startDate.getTime(),
      endDate.getTime()
    );

    let entries = await this.getEntriesByIds(entryIds);

    // Apply filters
    if (filters) {
      entries = entries.filter(e => {
        if (filters.actions && !filters.actions.includes(e.action)) return false;
        if (filters.actorTypes && !filters.actorTypes.includes(e.actorType)) return false;
        if (filters.targetTypes && !filters.targetTypes.includes(e.targetType)) return false;
        return true;
      });
    }

    return entries;
  }

  private async storeEntry(entry: AuditEntry): Promise<void> {
    const timestamp = entry.timestamp.getTime();

    // Store entry
    await this.redis.set(
      `${this.auditPrefix}${entry.id}`,
      JSON.stringify(entry)
    );

    // Update chain
    await this.redis.set(`${this.chainPrefix}latest`, entry.hash);

    // Index by time
    await this.redis.zadd(`${this.indexPrefix}time`, timestamp, entry.id);

    // Index by target
    await this.redis.zadd(
      `${this.indexPrefix}target:${entry.targetType}:${entry.targetId}`,
      timestamp,
      entry.id
    );

    // Index by actor
    await this.redis.zadd(
      `${this.indexPrefix}actor:${entry.actorId}`,
      timestamp,
      entry.id
    );

    // Index by action
    await this.redis.zadd(
      `${this.indexPrefix}action:${entry.action}`,
      timestamp,
      entry.id
    );
  }

  private async getEntriesByIds(ids: string[]): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = [];

    for (const id of ids) {
      const entry = await this.getEntry(id);
      if (entry) entries.push(entry);
    }

    return entries;
  }

  private async getLatestHash(): Promise<string> {
    const hash = await this.redis.get(`${this.chainPrefix}latest`);
    return hash || 'genesis';
  }

  private async getFirstEntryId(): Promise<string | null> {
    const ids = await this.redis.zrange(`${this.indexPrefix}time`, 0, 0);
    return ids[0] || null;
  }

  private async getNextEntryId(afterTimestamp: Date): Promise<string | null> {
    const ids = await this.redis.zrangebyscore(
      `${this.indexPrefix}time`,
      afterTimestamp.getTime() + 1,
      '+inf',
      'LIMIT',
      0,
      1
    );
    return ids[0] || null;
  }

  private calculateHash(entry: Omit<AuditEntry, 'hash'> & { hash: string }): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      actorType: entry.actorType,
      actorId: entry.actorId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: entry.details,
      previousHash: entry.previousHash,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private deserializeEntry(data: string): AuditEntry {
    const entry = JSON.parse(data);
    entry.timestamp = new Date(entry.timestamp);
    return entry;
  }
}
