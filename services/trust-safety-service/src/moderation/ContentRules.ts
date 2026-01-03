// =================================
// TEXTMESH CONTENT RULES
// Auto-Flagging Rules for Content Moderation
// =================================

// ============ TYPES ============

export interface Post {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date;
}

export interface FlagResult {
  shouldFlag: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high';
}

// ============ CONTENT RULES CLASS ============

export class ContentRules {
  /**
   * Check if a post should be flagged for review
   * Note: This DOES NOT block the post, just flags it for manual review
   */
  shouldFlagPost(post: Post): FlagResult {
    // Rule 1: Headline-only framing
    // Short text + external link = potentially misleading content without context
    const headlineOnlyFlag = this.checkHeadlineOnly(post.content);
    if (headlineOnlyFlag.shouldFlag) {
      return headlineOnlyFlag;
    }

    // Rule 2: Excessive links (potential spam)
    const excessiveLinksFlag = this.checkExcessiveLinks(post.content);
    if (excessiveLinksFlag.shouldFlag) {
      return excessiveLinksFlag;
    }

    // Rule 3: Very short posts with no context
    const noContextFlag = this.checkNoContext(post.content);
    if (noContextFlag.shouldFlag) {
      return noContextFlag;
    }

    return { shouldFlag: false };
  }

  /**
   * Check for headline-only framing
   * Enforces TextMesh manifesto rule against framing without context
   */
  private checkHeadlineOnly(content: string): FlagResult {
    const hasExternalLink = /https?:\/\//.test(content);
    const isShort = content.length < 50;

    if (hasExternalLink && isShort) {
      return {
        shouldFlag: true,
        reason: 'Headline-only post: short text with external link (lacks context)',
        severity: 'medium',
      };
    }

    return { shouldFlag: false };
  }

  /**
   * Check for excessive external links (potential spam)
   */
  private checkExcessiveLinks(content: string): FlagResult {
    const linkMatches = content.match(/https?:\/\/[^\s]+/g);
    const linkCount = linkMatches ? linkMatches.length : 0;

    // More than 3 links in a single post is suspicious
    if (linkCount > 3) {
      return {
        shouldFlag: true,
        reason: `Excessive links: ${linkCount} external links in post`,
        severity: 'high',
      };
    }

    // More than 1 link with very little text is suspicious
    if (linkCount > 1 && content.length < 100) {
      return {
        shouldFlag: true,
        reason: 'Multiple links with minimal context',
        severity: 'medium',
      };
    }

    return { shouldFlag: false };
  }

  /**
   * Check for posts with no meaningful context
   */
  private checkNoContext(content: string): FlagResult {
    const trimmedContent = content.trim();

    // Very short posts (< 10 chars) with no link = low-quality
    if (trimmedContent.length < 10 && !/https?:\/\//.test(trimmedContent)) {
      return {
        shouldFlag: true,
        reason: 'Very short post with no context',
        severity: 'low',
      };
    }

    return { shouldFlag: false };
  }

  /**
   * Batch check multiple posts
   */
  batchCheck(posts: Post[]): Map<string, FlagResult> {
    const results = new Map<string, FlagResult>();

    for (const post of posts) {
      const result = this.shouldFlagPost(post);
      if (result.shouldFlag) {
        results.set(post.id, result);
      }
    }

    return results;
  }
}
