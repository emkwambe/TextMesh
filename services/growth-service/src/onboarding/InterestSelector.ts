// =================================
// TEXTMESH INTEREST SELECTOR
// User Interest Management
// =================================

import Redis from 'ioredis';

// ============ INTEREST TYPES ============

export interface Interest {
  id: string;
  name: string;
  icon: string;
  category: InterestCategory;
  description?: string;
  followersCount: number;
  postsCount: number;
}

export interface InterestCategory {
  id: string;
  name: string;
  icon: string;
}

export interface UserInterests {
  selected: string[];
  suggested: string[];
  trending: string[];
}

// ============ INTEREST DEFINITIONS ============

const INTEREST_CATEGORIES: InterestCategory[] = [
  { id: 'technology', name: 'Technology', icon: '💻' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'lifestyle', name: 'Lifestyle', icon: '✨' },
  { id: 'news', name: 'News & Politics', icon: '📰' },
  { id: 'science', name: 'Science', icon: '🔬' },
  { id: 'arts', name: 'Arts & Culture', icon: '🎨' },
  { id: 'business', name: 'Business', icon: '💼' },
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'food', name: 'Food & Drink', icon: '🍕' },
];

const INTERESTS: Interest[] = [
  // Technology
  { id: 'programming', name: 'Programming', icon: '👨‍💻', category: INTEREST_CATEGORIES[0]!, followersCount: 1500000, postsCount: 5000000 },
  { id: 'ai', name: 'Artificial Intelligence', icon: '🤖', category: INTEREST_CATEGORIES[0]!, followersCount: 2000000, postsCount: 3000000 },
  { id: 'startups', name: 'Startups', icon: '🚀', category: INTEREST_CATEGORIES[0]!, followersCount: 1200000, postsCount: 2500000 },
  { id: 'crypto', name: 'Cryptocurrency', icon: '₿', category: INTEREST_CATEGORIES[0]!, followersCount: 1800000, postsCount: 4000000 },
  { id: 'web3', name: 'Web3', icon: '🌐', category: INTEREST_CATEGORIES[0]!, followersCount: 900000, postsCount: 1500000 },
  { id: 'mobile', name: 'Mobile Development', icon: '📱', category: INTEREST_CATEGORIES[0]!, followersCount: 800000, postsCount: 1200000 },
  { id: 'cybersecurity', name: 'Cybersecurity', icon: '🔒', category: INTEREST_CATEGORIES[0]!, followersCount: 600000, postsCount: 800000 },

  // Entertainment
  { id: 'movies', name: 'Movies', icon: '🎬', category: INTEREST_CATEGORIES[1]!, followersCount: 3000000, postsCount: 8000000 },
  { id: 'music', name: 'Music', icon: '🎵', category: INTEREST_CATEGORIES[1]!, followersCount: 3500000, postsCount: 10000000 },
  { id: 'tv', name: 'TV Shows', icon: '📺', category: INTEREST_CATEGORIES[1]!, followersCount: 2500000, postsCount: 6000000 },
  { id: 'anime', name: 'Anime', icon: '🎌', category: INTEREST_CATEGORIES[1]!, followersCount: 2000000, postsCount: 5000000 },
  { id: 'kpop', name: 'K-Pop', icon: '🎤', category: INTEREST_CATEGORIES[1]!, followersCount: 1500000, postsCount: 4000000 },
  { id: 'comedy', name: 'Comedy', icon: '😂', category: INTEREST_CATEGORIES[1]!, followersCount: 1800000, postsCount: 3500000 },

  // Sports
  { id: 'football', name: 'Football', icon: '⚽', category: INTEREST_CATEGORIES[2]!, followersCount: 4000000, postsCount: 12000000 },
  { id: 'basketball', name: 'Basketball', icon: '🏀', category: INTEREST_CATEGORIES[2]!, followersCount: 2500000, postsCount: 7000000 },
  { id: 'tennis', name: 'Tennis', icon: '🎾', category: INTEREST_CATEGORIES[2]!, followersCount: 1000000, postsCount: 2000000 },
  { id: 'fitness', name: 'Fitness', icon: '💪', category: INTEREST_CATEGORIES[2]!, followersCount: 2200000, postsCount: 5500000 },
  { id: 'running', name: 'Running', icon: '🏃', category: INTEREST_CATEGORIES[2]!, followersCount: 800000, postsCount: 1500000 },
  { id: 'esports', name: 'Esports', icon: '🏆', category: INTEREST_CATEGORIES[2]!, followersCount: 1500000, postsCount: 3500000 },

  // Lifestyle
  { id: 'fashion', name: 'Fashion', icon: '👗', category: INTEREST_CATEGORIES[3]!, followersCount: 2000000, postsCount: 6000000 },
  { id: 'beauty', name: 'Beauty', icon: '💄', category: INTEREST_CATEGORIES[3]!, followersCount: 1800000, postsCount: 5000000 },
  { id: 'travel', name: 'Travel', icon: '✈️', category: INTEREST_CATEGORIES[3]!, followersCount: 2500000, postsCount: 7000000 },
  { id: 'photography', name: 'Photography', icon: '📷', category: INTEREST_CATEGORIES[3]!, followersCount: 1600000, postsCount: 4500000 },
  { id: 'parenting', name: 'Parenting', icon: '👨‍👩‍👧', category: INTEREST_CATEGORIES[3]!, followersCount: 900000, postsCount: 2000000 },
  { id: 'pets', name: 'Pets', icon: '🐾', category: INTEREST_CATEGORIES[3]!, followersCount: 1400000, postsCount: 4000000 },

  // News & Politics
  { id: 'news', name: 'Breaking News', icon: '📰', category: INTEREST_CATEGORIES[4]!, followersCount: 3000000, postsCount: 15000000 },
  { id: 'politics', name: 'Politics', icon: '🏛️', category: INTEREST_CATEGORIES[4]!, followersCount: 2000000, postsCount: 8000000 },
  { id: 'economy', name: 'Economy', icon: '📈', category: INTEREST_CATEGORIES[4]!, followersCount: 1200000, postsCount: 3000000 },

  // Science
  { id: 'space', name: 'Space', icon: '🚀', category: INTEREST_CATEGORIES[5]!, followersCount: 1500000, postsCount: 2500000 },
  { id: 'environment', name: 'Environment', icon: '🌍', category: INTEREST_CATEGORIES[5]!, followersCount: 1200000, postsCount: 2000000 },
  { id: 'health', name: 'Health', icon: '🏥', category: INTEREST_CATEGORIES[5]!, followersCount: 1800000, postsCount: 4000000 },

  // Arts & Culture
  { id: 'art', name: 'Art', icon: '🎨', category: INTEREST_CATEGORIES[6]!, followersCount: 1400000, postsCount: 3500000 },
  { id: 'books', name: 'Books', icon: '📚', category: INTEREST_CATEGORIES[6]!, followersCount: 1100000, postsCount: 2500000 },
  { id: 'design', name: 'Design', icon: '✏️', category: INTEREST_CATEGORIES[6]!, followersCount: 1000000, postsCount: 2200000 },

  // Business
  { id: 'investing', name: 'Investing', icon: '💰', category: INTEREST_CATEGORIES[7]!, followersCount: 1600000, postsCount: 3500000 },
  { id: 'marketing', name: 'Marketing', icon: '📣', category: INTEREST_CATEGORIES[7]!, followersCount: 900000, postsCount: 2000000 },
  { id: 'entrepreneurship', name: 'Entrepreneurship', icon: '🎯', category: INTEREST_CATEGORIES[7]!, followersCount: 1200000, postsCount: 2800000 },

  // Gaming
  { id: 'gaming', name: 'Gaming', icon: '🎮', category: INTEREST_CATEGORIES[8]!, followersCount: 2800000, postsCount: 8000000 },
  { id: 'playstation', name: 'PlayStation', icon: '🎮', category: INTEREST_CATEGORIES[8]!, followersCount: 1500000, postsCount: 4000000 },
  { id: 'nintendo', name: 'Nintendo', icon: '🍄', category: INTEREST_CATEGORIES[8]!, followersCount: 1200000, postsCount: 3000000 },
  { id: 'pc-gaming', name: 'PC Gaming', icon: '🖥️', category: INTEREST_CATEGORIES[8]!, followersCount: 1400000, postsCount: 3500000 },

  // Food & Drink
  { id: 'cooking', name: 'Cooking', icon: '👨‍🍳', category: INTEREST_CATEGORIES[9]!, followersCount: 1800000, postsCount: 5000000 },
  { id: 'restaurants', name: 'Restaurants', icon: '🍽️', category: INTEREST_CATEGORIES[9]!, followersCount: 1200000, postsCount: 3000000 },
  { id: 'coffee', name: 'Coffee', icon: '☕', category: INTEREST_CATEGORIES[9]!, followersCount: 900000, postsCount: 2000000 },
  { id: 'wine', name: 'Wine', icon: '🍷', category: INTEREST_CATEGORIES[9]!, followersCount: 600000, postsCount: 1200000 },
];

// ============ INTEREST SELECTOR CLASS ============

export class InterestSelector {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get all available interests grouped by category
   */
  async getAvailableInterests(): Promise<{
    categories: InterestCategory[];
    interests: Interest[];
    trending: Interest[];
  }> {
    // Get trending interests
    const trendingIds = await this.redis.zrevrange('trending:interests', 0, 9);
    const trending = INTERESTS.filter((i) => trendingIds.includes(i.id));

    return {
      categories: INTEREST_CATEGORIES,
      interests: INTERESTS,
      trending: trending.length > 0 ? trending : INTERESTS.slice(0, 10),
    };
  }

  /**
   * Set user interests
   */
  async setUserInterests(userId: string, interests: string[]): Promise<void> {
    // Validate interests
    const validInterests = interests.filter((id) =>
      INTERESTS.some((i) => i.id === id)
    );

    if (validInterests.length === 0) {
      throw new Error('No valid interests provided');
    }

    // Store in Redis
    const key = `user:interests:${userId}`;
    await this.redis.del(key);
    await this.redis.sadd(key, ...validInterests);

    // Also store in sorted set for quick lookup
    const sortedKey = `user:interests:sorted:${userId}`;
    await this.redis.del(sortedKey);

    const pipeline = this.redis.pipeline();
    for (let i = 0; i < validInterests.length; i++) {
      const interest = validInterests[i];
      if (interest) {
        pipeline.zadd(sortedKey, i, interest);
      }
    }
    await pipeline.exec();

    // Update interest counts
    for (const interestId of validInterests) {
      await this.redis.incr(`interest:followers:${interestId}`);
    }
  }

  /**
   * Get user interests
   */
  async getUserInterests(userId: string): Promise<UserInterests> {
    const key = `user:interests:${userId}`;
    const selected = await this.redis.smembers(key);

    // Get suggested based on what similar users have selected
    const suggested = await this.getSuggestedInterests(userId, selected);

    // Get trending interests
    const trendingIds = await this.redis.zrevrange('trending:interests', 0, 4);
    const trending = trendingIds.filter((id) => !selected.includes(id));

    return {
      selected,
      suggested,
      trending,
    };
  }

  /**
   * Add interest for user
   */
  async addInterest(userId: string, interestId: string): Promise<boolean> {
    const interest = INTERESTS.find((i) => i.id === interestId);
    if (!interest) {
      return false;
    }

    const key = `user:interests:${userId}`;
    await this.redis.sadd(key, interestId);
    await this.redis.incr(`interest:followers:${interestId}`);

    return true;
  }

  /**
   * Remove interest for user
   */
  async removeInterest(userId: string, interestId: string): Promise<boolean> {
    const key = `user:interests:${userId}`;
    const removed = await this.redis.srem(key, interestId);

    if (removed > 0) {
      await this.redis.decr(`interest:followers:${interestId}`);
      return true;
    }

    return false;
  }

  /**
   * Get interest details
   */
  getInterestDetails(interestId: string): Interest | undefined {
    return INTERESTS.find((i) => i.id === interestId);
  }

  /**
   * Search interests
   */
  searchInterests(query: string): Interest[] {
    const lowerQuery = query.toLowerCase();
    return INTERESTS.filter(
      (i) =>
        i.name.toLowerCase().includes(lowerQuery) ||
        i.category.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get suggested interests based on user's current interests
   */
  private async getSuggestedInterests(
    userId: string,
    currentInterests: string[]
  ): Promise<string[]> {
    if (currentInterests.length === 0) {
      // Return popular interests if user has none
      return INTERESTS.sort((a, b) => b.followersCount - a.followersCount)
        .slice(0, 5)
        .map((i) => i.id);
    }

    // Find interests in the same categories as current interests
    const currentCategories = new Set<string>();
    for (const interestId of currentInterests) {
      const interest = INTERESTS.find((i) => i.id === interestId);
      if (interest) {
        currentCategories.add(interest.category.id);
      }
    }

    // Get interests from same categories that user doesn't have
    const suggested = INTERESTS.filter(
      (i) =>
        currentCategories.has(i.category.id) &&
        !currentInterests.includes(i.id)
    )
      .sort((a, b) => b.followersCount - a.followersCount)
      .slice(0, 5)
      .map((i) => i.id);

    return suggested;
  }

  /**
   * Get popular interests overall
   */
  async getPopularInterests(limit: number = 20): Promise<Interest[]> {
    return INTERESTS.sort((a, b) => b.followersCount - a.followersCount).slice(
      0,
      limit
    );
  }

  /**
   * Get interests by category
   */
  getInterestsByCategory(categoryId: string): Interest[] {
    return INTERESTS.filter((i) => i.category.id === categoryId);
  }

  /**
   * Update trending interests (called periodically)
   */
  async updateTrendingInterests(): Promise<void> {
    // This would analyze recent activity to determine trending interests
    // For now, just use follower counts
    const sorted = [...INTERESTS].sort(
      (a, b) => b.followersCount - a.followersCount
    );

    const pipeline = this.redis.pipeline();
    pipeline.del('trending:interests');

    for (let i = 0; i < Math.min(20, sorted.length); i++) {
      const interest = sorted[i];
      if (interest) {
        pipeline.zadd('trending:interests', sorted.length - i, interest.id);
      }
    }

    await pipeline.exec();
  }
}

export default InterestSelector;
