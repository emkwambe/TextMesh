import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  DataSubjectRequest,
  DataRequestType,
  DeletionConfirmation,
  DataInventory,
  DataCategory,
  AgeGroup,
  AgeAppropriateDefaults,
} from './types';

const DEFAULT_AGE_GROUPS: AgeGroup[] = [
  {
    name: 'child',
    minAge: 0,
    maxAge: 12,
    defaults: {
      privateAccount: true,
      dmRestriction: 'disabled',
      contentFilter: 'strict',
      dataCollection: 'minimal',
      adPersonalization: false,
      locationSharing: false,
      searchable: false,
    },
    restrictions: ['dm', 'live_streaming', 'public_posts', 'ad_targeting'],
  },
  {
    name: 'teen',
    minAge: 13,
    maxAge: 17,
    defaults: {
      privateAccount: true,
      dmRestriction: 'followers',
      contentFilter: 'standard',
      dataCollection: 'limited',
      adPersonalization: false,
      locationSharing: false,
      searchable: true,
    },
    restrictions: ['ad_targeting', 'data_selling'],
  },
  {
    name: 'adult',
    minAge: 18,
    maxAge: 999,
    defaults: {
      privateAccount: false,
      dmRestriction: 'none',
      contentFilter: 'off',
      dataCollection: 'full',
      adPersonalization: true,
      locationSharing: true,
      searchable: true,
    },
    restrictions: [],
  },
];

export class GDPRManager {
  private redis: Redis;
  private ageGroups: AgeGroup[];
  private readonly requestPrefix = 'compliance:dsr:';
  private readonly inventoryPrefix = 'compliance:data_inventory:';
  private readonly consentPrefix = 'compliance:consent:';

  constructor(redis: Redis, ageGroups?: AgeGroup[]) {
    this.redis = redis;
    this.ageGroups = ageGroups || DEFAULT_AGE_GROUPS;
  }

  // Data Subject Requests
  async createRequest(
    userId: string,
    type: DataRequestType,
    verificationMethod?: string
  ): Promise<DataSubjectRequest> {
    const request: DataSubjectRequest = {
      id: uuidv4(),
      userId,
      type,
      status: 'pending',
      requestedAt: new Date(),
      verificationMethod,
    };

    await this.redis.set(
      `${this.requestPrefix}${request.id}`,
      JSON.stringify(request)
    );

    await this.redis.sadd(`${this.requestPrefix}user:${userId}`, request.id);

    // Set SLA deadline (30 days for GDPR)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);
    await this.redis.zadd('compliance:dsr_deadlines', deadline.getTime(), request.id);

    return request;
  }

  async getRequest(requestId: string): Promise<DataSubjectRequest | null> {
    const data = await this.redis.get(`${this.requestPrefix}${requestId}`);
    if (!data) return null;

    return this.deserializeRequest(data);
  }

  async getUserRequests(userId: string): Promise<DataSubjectRequest[]> {
    const requestIds = await this.redis.smembers(`${this.requestPrefix}user:${userId}`);
    const requests: DataSubjectRequest[] = [];

    for (const id of requestIds) {
      const request = await this.getRequest(id);
      if (request) requests.push(request);
    }

    return requests.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  async processAccessRequest(requestId: string): Promise<DataSubjectRequest> {
    const request = await this.getRequest(requestId);
    if (!request) throw new Error('Request not found');

    request.status = 'processing';
    await this.saveRequest(request);

    // Generate data package
    const inventory = await this.generateDataInventory(request.userId);
    const packageUrl = await this.createDataPackage(request.userId, inventory);

    request.status = 'completed';
    request.completedAt = new Date();
    request.dataPackageUrl = packageUrl;
    request.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.saveRequest(request);

    return request;
  }

  async processErasureRequest(
    requestId: string,
    deletedBy: string
  ): Promise<DataSubjectRequest> {
    const request = await this.getRequest(requestId);
    if (!request) throw new Error('Request not found');

    request.status = 'processing';
    await this.saveRequest(request);

    // Perform deletion (this would call actual deletion services)
    const deletedDataTypes = await this.performDeletion(request.userId);

    // Generate deletion confirmation
    const confirmation: DeletionConfirmation = {
      deletedAt: new Date(),
      deletedBy,
      dataTypes: deletedDataTypes,
      retainedData: [
        {
          type: 'transaction_records',
          reason: 'Legal requirement for financial records',
          retentionPeriod: '7 years',
        },
        {
          type: 'moderation_logs',
          reason: 'Legal compliance and safety',
          retentionPeriod: '3 years',
        },
      ],
      thirdPartyNotified: true,
      verificationHash: this.generateDeletionHash(request.userId, deletedDataTypes),
    };

    request.status = 'verified';
    request.completedAt = new Date();
    request.deletionConfirmation = confirmation;

    await this.saveRequest(request);

    return request;
  }

  async verifyDeletion(requestId: string): Promise<{
    verified: boolean;
    confirmation?: DeletionConfirmation;
    issues?: string[];
  }> {
    const request = await this.getRequest(requestId);
    if (!request || !request.deletionConfirmation) {
      return { verified: false, issues: ['Request or confirmation not found'] };
    }

    const issues: string[] = [];

    // Verify hash
    const expectedHash = this.generateDeletionHash(
      request.userId,
      request.deletionConfirmation.dataTypes
    );

    if (expectedHash !== request.deletionConfirmation.verificationHash) {
      issues.push('Verification hash mismatch');
    }

    // Check if any data still exists (would check actual data stores)
    const remainingData = await this.checkRemainingData(request.userId);
    if (remainingData.length > 0) {
      issues.push(`Data still found: ${remainingData.join(', ')}`);
    }

    return {
      verified: issues.length === 0,
      confirmation: request.deletionConfirmation,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  // Data Inventory
  async generateDataInventory(userId: string): Promise<DataInventory> {
    const categories: DataCategory[] = [
      {
        name: 'Profile Data',
        description: 'Your account profile information',
        dataPoints: 15,
        size: 2048,
        sources: ['User input', 'Platform generation'],
        purposes: ['Account management', 'Personalization'],
        legalBasis: 'Contract performance',
        retention: 'Account lifetime + 30 days',
        sharedWith: [],
      },
      {
        name: 'Content',
        description: 'Posts, replies, and media you created',
        dataPoints: 0, // Would be calculated
        size: 0,
        sources: ['User input'],
        purposes: ['Platform functionality'],
        legalBasis: 'Contract performance',
        retention: 'Until deleted by user',
        sharedWith: ['Public (if public account)'],
      },
      {
        name: 'Engagement Data',
        description: 'Likes, bookmarks, and interactions',
        dataPoints: 0,
        size: 0,
        sources: ['User activity'],
        purposes: ['Platform functionality', 'Recommendations'],
        legalBasis: 'Legitimate interest',
        retention: 'Account lifetime',
        sharedWith: [],
      },
      {
        name: 'Usage Analytics',
        description: 'How you use the platform',
        dataPoints: 0,
        size: 0,
        sources: ['Automatic collection'],
        purposes: ['Service improvement', 'Safety'],
        legalBasis: 'Legitimate interest',
        retention: '90 days',
        sharedWith: [],
      },
    ];

    const inventory: DataInventory = {
      userId,
      generatedAt: new Date(),
      categories,
      totalSize: categories.reduce((sum, c) => sum + c.size, 0),
      retentionPolicies: [
        {
          dataType: 'Account data',
          retentionPeriod: 'Account lifetime + 30 days',
          deletionMethod: 'Secure deletion',
          legalBasis: 'Contract',
        },
        {
          dataType: 'Content',
          retentionPeriod: 'Until user deletion',
          deletionMethod: 'Immediate removal',
          legalBasis: 'Contract',
        },
        {
          dataType: 'Analytics',
          retentionPeriod: '90 days rolling',
          deletionMethod: 'Automatic purge',
          legalBasis: 'Legitimate interest',
        },
      ],
    };

    // Cache inventory
    await this.redis.set(
      `${this.inventoryPrefix}${userId}`,
      JSON.stringify(inventory),
      'EX',
      86400 // 24 hours
    );

    return inventory;
  }

  // Age-Appropriate Defaults
  getAgeGroup(age: number): AgeGroup | undefined {
    return this.ageGroups.find(g => age >= g.minAge && age <= g.maxAge);
  }

  getDefaultsForAge(age: number): AgeAppropriateDefaults {
    const group = this.getAgeGroup(age);
    return group?.defaults || this.ageGroups[this.ageGroups.length - 1].defaults;
  }

  getRestrictionsForAge(age: number): string[] {
    const group = this.getAgeGroup(age);
    return group?.restrictions || [];
  }

  async applyAgeDefaults(userId: string, age: number): Promise<void> {
    const defaults = this.getDefaultsForAge(age);
    const restrictions = this.getRestrictionsForAge(age);

    // Store applied defaults
    await this.redis.hset(`compliance:age_defaults:${userId}`, {
      age: age.toString(),
      appliedAt: new Date().toISOString(),
      defaults: JSON.stringify(defaults),
      restrictions: JSON.stringify(restrictions),
    });
  }

  // Consent Management
  async recordConsent(
    userId: string,
    purpose: string,
    granted: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    const consent = {
      purpose,
      granted,
      timestamp: new Date().toISOString(),
      details,
    };

    await this.redis.hset(
      `${this.consentPrefix}${userId}`,
      purpose,
      JSON.stringify(consent)
    );
  }

  async getConsent(userId: string, purpose: string): Promise<{
    granted: boolean;
    timestamp: Date;
  } | null> {
    const data = await this.redis.hget(`${this.consentPrefix}${userId}`, purpose);
    if (!data) return null;

    const consent = JSON.parse(data);
    return {
      granted: consent.granted,
      timestamp: new Date(consent.timestamp),
    };
  }

  async getAllConsents(userId: string): Promise<Record<string, { granted: boolean; timestamp: Date }>> {
    const data = await this.redis.hgetall(`${this.consentPrefix}${userId}`);
    const consents: Record<string, { granted: boolean; timestamp: Date }> = {};

    for (const [purpose, value] of Object.entries(data)) {
      const consent = JSON.parse(value);
      consents[purpose] = {
        granted: consent.granted,
        timestamp: new Date(consent.timestamp),
      };
    }

    return consents;
  }

  async withdrawConsent(userId: string, purpose: string): Promise<void> {
    await this.recordConsent(userId, purpose, false);
  }

  // SLA Monitoring
  async getPendingRequests(): Promise<DataSubjectRequest[]> {
    const allRequests: DataSubjectRequest[] = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.requestPrefix}????????-????-????-????-????????????`,
        'COUNT',
        100
      );
      cursor = newCursor;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const request = this.deserializeRequest(data);
          if (request.status === 'pending' || request.status === 'processing') {
            allRequests.push(request);
          }
        }
      }
    } while (cursor !== '0');

    return allRequests;
  }

  async getRequestsApproachingDeadline(daysRemaining: number = 5): Promise<DataSubjectRequest[]> {
    const deadline = Date.now() + daysRemaining * 24 * 60 * 60 * 1000;
    const requestIds = await this.redis.zrangebyscore(
      'compliance:dsr_deadlines',
      0,
      deadline
    );

    const requests: DataSubjectRequest[] = [];

    for (const id of requestIds) {
      const request = await this.getRequest(id);
      if (request && (request.status === 'pending' || request.status === 'processing')) {
        requests.push(request);
      }
    }

    return requests;
  }

  private async saveRequest(request: DataSubjectRequest): Promise<void> {
    await this.redis.set(
      `${this.requestPrefix}${request.id}`,
      JSON.stringify(request)
    );
  }

  private async createDataPackage(
    userId: string,
    inventory: DataInventory
  ): Promise<string> {
    // In production, this would create an actual downloadable package
    const packageId = uuidv4();
    const packageUrl = `data-export/${userId}/${packageId}`;

    await this.redis.set(
      `compliance:data_package:${packageId}`,
      JSON.stringify({ userId, inventory, createdAt: new Date() }),
      'EX',
      7 * 24 * 60 * 60 // 7 days
    );

    return packageUrl;
  }

  private async performDeletion(userId: string): Promise<string[]> {
    // In production, this would call actual deletion services
    return [
      'profile_data',
      'posts',
      'replies',
      'likes',
      'bookmarks',
      'dm_history',
      'search_history',
      'notification_preferences',
    ];
  }

  private async checkRemainingData(userId: string): Promise<string[]> {
    // In production, this would check actual data stores
    return [];
  }

  private generateDeletionHash(userId: string, dataTypes: string[]): string {
    const data = JSON.stringify({ userId, dataTypes, timestamp: Date.now() });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private deserializeRequest(data: string): DataSubjectRequest {
    const request = JSON.parse(data);
    request.requestedAt = new Date(request.requestedAt);
    if (request.completedAt) request.completedAt = new Date(request.completedAt);
    if (request.expiresAt) request.expiresAt = new Date(request.expiresAt);
    if (request.deletionConfirmation?.deletedAt) {
      request.deletionConfirmation.deletedAt = new Date(request.deletionConfirmation.deletedAt);
    }
    return request;
  }
}
