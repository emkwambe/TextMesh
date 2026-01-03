// =================================
// TEXTMESH FIRST POST PROMPTS
// Context-Aware Prompts for Group First Posts
// =================================

import { GroupType } from '@prisma/client';

// ============ TYPES ============

export interface FirstPostPromptResult {
  prompt: string;
  placeholder: string;
  suggestions: string[];
}

// ============ FIRST POST PROMPTS CLASS ============

export class FirstPostPrompts {
  /**
   * Get context-aware prompt based on group type
   */
  getPrompt(groupType: GroupType): FirstPostPromptResult {
    switch (groupType) {
      case GroupType.STUDY:
        return {
          prompt: 'What are we focusing on first?',
          placeholder: 'Share the first topic or chapter we should tackle...',
          suggestions: [
            'Share the study schedule',
            'Post the first topic or chapter',
            'Link to key resources',
            'Set expectations for the group',
          ],
        };

      case GroupType.JOURNEY:
        return {
          prompt: "What's the goal for this week?",
          placeholder: 'Set the first milestone or weekly goal...',
          suggestions: [
            'Define the week 1 goal',
            'Share the overall journey plan',
            'Post accountability check-in schedule',
            'Introduce the challenge',
          ],
        };

      case GroupType.UPDATES:
        return {
          prompt: 'What should members know right now?',
          placeholder: 'Share your first update or announcement...',
          suggestions: [
            'Post the latest update',
            'Share upcoming events or deadlines',
            'Set the update frequency',
            'Explain what to expect',
          ],
        };

      case GroupType.COMMUNITY:
        return {
          prompt: 'Introduce yourself to the group',
          placeholder: 'Tell the group about yourself and why you created this community...',
          suggestions: [
            'Share your background',
            'Explain the community purpose',
            'Invite others to introduce themselves',
            'Set the tone for conversations',
          ],
        };

      case GroupType.OTHER:
      default:
        return {
          prompt: 'Share your first update with the group',
          placeholder: 'What should members know to get started?',
          suggestions: [
            'Welcome members',
            'Explain what this group is about',
            'Share initial plans or topics',
            'Encourage participation',
          ],
        };
    }
  }

  /**
   * Get all available prompts for preview
   */
  getAllPrompts(): Record<GroupType, FirstPostPromptResult> {
    return {
      [GroupType.STUDY]: this.getPrompt(GroupType.STUDY),
      [GroupType.JOURNEY]: this.getPrompt(GroupType.JOURNEY),
      [GroupType.UPDATES]: this.getPrompt(GroupType.UPDATES),
      [GroupType.COMMUNITY]: this.getPrompt(GroupType.COMMUNITY),
      [GroupType.OTHER]: this.getPrompt(GroupType.OTHER),
    };
  }

  /**
   * Get prompt text only (simple version)
   */
  getPromptText(groupType: GroupType): string {
    return this.getPrompt(groupType).prompt;
  }
}
