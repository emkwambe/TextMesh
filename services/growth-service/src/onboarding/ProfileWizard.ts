// =================================
// TEXTMESH PROFILE WIZARD
// Smart Profile Setup Assistance
// =================================

import { PrismaClient } from '@prisma/client';

// ============ PROFILE TYPES ============

export interface ProfileSuggestions {
  displayNameSuggestions: string[];
  bioTemplates: BioTemplate[];
  avatarSuggestions: AvatarSuggestion[];
  websiteValidation?: boolean;
  profileCompletion: ProfileCompletion;
}

export interface BioTemplate {
  id: string;
  category: string;
  template: string;
  placeholders: string[];
}

export interface AvatarSuggestion {
  type: 'initial' | 'gradient' | 'pattern';
  value: string;
  colors?: string[];
}

export interface ProfileCompletion {
  percentage: number;
  missing: ProfileField[];
  suggestions: ProfileSuggestion[];
}

export interface ProfileField {
  field: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ProfileSuggestion {
  field: string;
  reason: string;
  impact: string;
}

export interface ProfileUpdates {
  displayName?: string;
  bio?: string;
  avatar?: string;
  website?: string;
  location?: string;
}

// ============ BIO TEMPLATES ============

const BIO_TEMPLATES: BioTemplate[] = [
  {
    id: 'professional',
    category: 'Professional',
    template: '{{title}} at {{company}}. {{interest}} enthusiast. {{location}}',
    placeholders: ['title', 'company', 'interest', 'location'],
  },
  {
    id: 'creative',
    category: 'Creative',
    template: '{{role}} â€¢ {{passion}} â€¢ Creating {{what}} for {{audience}}',
    placeholders: ['role', 'passion', 'what', 'audience'],
  },
  {
    id: 'simple',
    category: 'Simple',
    template: 'Love {{interest1}}, {{interest2}}, and {{interest3}}. {{location}} ðŸ“',
    placeholders: ['interest1', 'interest2', 'interest3', 'location'],
  },
  {
    id: 'student',
    category: 'Student',
    template: '{{major}} student at {{school}}. Interested in {{topics}}.',
    placeholders: ['major', 'school', 'topics'],
  },
  {
    id: 'entrepreneur',
    category: 'Entrepreneur',
    template: 'Founder of {{company}}. Building {{product}} to {{mission}}.',
    placeholders: ['company', 'product', 'mission'],
  },
  {
    id: 'parent',
    category: 'Parent',
    template: '{{role}} of {{children}}. {{hobby}} enthusiast. Living life in {{location}}.',
    placeholders: ['role', 'children', 'hobby', 'location'],
  },
  {
    id: 'minimalist',
    category: 'Minimalist',
    template: '{{one_liner}}.',
    placeholders: ['one_liner'],
  },
  {
    id: 'traveler',
    category: 'Traveler',
    template: 'ðŸŒ {{countries}} countries visited. Currently in {{current_location}}. Next stop: {{next_destination}}',
    placeholders: ['countries', 'current_location', 'next_destination'],
  },
];

// ============ AVATAR GRADIENTS ============

const AVATAR_GRADIENTS = [
  ['#FF6B6B', '#4ECDC4'],
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a8edea', '#fed6e3'],
  ['#5ee7df', '#b490ca'],
  ['#d299c2', '#fef9d7'],
  ['#89f7fe', '#66a6ff'],
];

// ============ PROFILE WIZARD CLASS ============

export class ProfileWizard {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get profile suggestions for user
   */
  async getSuggestions(userId: string): Promise<ProfileSuggestions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        website: true,
        location: true,
        email: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const displayNameSuggestions = this.generateDisplayNameSuggestions(
      user.username,
      user.email
    );

    const avatarSuggestions = this.generateAvatarSuggestions(
      user.username,
      user.displayName
    );

    const profileCompletion = this.calculateProfileCompletion(user);

    return {
      displayNameSuggestions,
      bioTemplates: BIO_TEMPLATES,
      avatarSuggestions,
      profileCompletion,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: ProfileUpdates): Promise<{
    success: boolean;
    profile: Record<string, unknown>;
    completion: ProfileCompletion;
  }> {
    // Validate updates
    const validatedUpdates = this.validateUpdates(updates);

    // Update profile
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: validatedUpdates,
      select: {
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        website: true,
        location: true,
      },
    });

    const completion = this.calculateProfileCompletion(updatedUser);

    return {
      success: true,
      profile: updatedUser,
      completion,
    };
  }

  /**
   * Generate username suggestions from email
   */
  generateUsernameSuggestions(email: string): string[] {
    const localPart = email.split('@')[0] || '';
    const suggestions: string[] = [];

    // Clean username base
    const base = localPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    suggestions.push(base);
    suggestions.push(`${base}${Math.floor(Math.random() * 100)}`);
    suggestions.push(`the_${base}`);
    suggestions.push(`${base}_official`);

    // Add some creative variations
    if (base.length > 4) {
      suggestions.push(base.slice(0, 4) + base.slice(-2));
    }

    return suggestions.slice(0, 5);
  }

  // ============ HELPER METHODS ============

  private generateDisplayNameSuggestions(
    username: string,
    email?: string | null
  ): string[] {
    const suggestions: string[] = [];

    // Capitalize username
    suggestions.push(
      username
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );

    // From email
    if (email) {
      const localPart = email.split('@')[0] || '';
      const cleaned = localPart
        .replace(/[^a-zA-Z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleaned.length > 2) {
        suggestions.push(
          cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
        );
      }
    }

    // Title case variations
    suggestions.push(username.charAt(0).toUpperCase() + username.slice(1));

    return [...new Set(suggestions)].slice(0, 5);
  }

  private generateAvatarSuggestions(
    username: string,
    displayName?: string | null
  ): AvatarSuggestion[] {
    const suggestions: AvatarSuggestion[] = [];
    const name = displayName || username;
    const initials = this.getInitials(name);

    // Initial-based avatars with gradients
    for (let i = 0; i < 4; i++) {
      const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
      if (gradient) {
        suggestions.push({
          type: 'gradient',
          value: initials,
          colors: gradient,
        });
      }
    }

    // Simple initial
    suggestions.push({
      type: 'initial',
      value: initials,
    });

    // Pattern-based
    suggestions.push({
      type: 'pattern',
      value: this.generatePatternId(username),
    });

    return suggestions;
  }

  private getInitials(name: string): string {
    const parts = name.split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
    }
    return (name.slice(0, 2) || '??').toUpperCase();
  }

  private generatePatternId(username: string): string {
    // Generate a deterministic pattern ID based on username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0;
    }
    return `pattern_${Math.abs(hash) % 20}`;
  }

  private calculateProfileCompletion(user: {
    displayName?: string | null;
    bio?: string | null;
    avatar?: string | null;
    website?: string | null;
    location?: string | null;
  }): ProfileCompletion {
    const fields: ProfileField[] = [];
    const suggestions: ProfileSuggestion[] = [];
    let completed = 0;
    const total = 5;

    // Check each field
    if (user.displayName) {
      completed++;
    } else {
      fields.push({
        field: 'displayName',
        label: 'Display Name',
        priority: 'high',
      });
      suggestions.push({
        field: 'displayName',
        reason: 'A display name helps others identify you',
        impact: 'Increases profile views by 40%',
      });
    }

    if (user.bio && user.bio.length > 10) {
      completed++;
    } else {
      fields.push({
        field: 'bio',
        label: 'Bio',
        priority: 'high',
      });
      suggestions.push({
        field: 'bio',
        reason: 'A bio tells others what you\'re about',
        impact: 'Increases follow rate by 60%',
      });
    }

    if (user.avatar) {
      completed++;
    } else {
      fields.push({
        field: 'avatar',
        label: 'Profile Photo',
        priority: 'high',
      });
      suggestions.push({
        field: 'avatar',
        reason: 'Profiles with photos get more engagement',
        impact: 'Increases trust score by 50%',
      });
    }

    if (user.website) {
      completed++;
    } else {
      fields.push({
        field: 'website',
        label: 'Website',
        priority: 'low',
      });
    }

    if (user.location) {
      completed++;
    } else {
      fields.push({
        field: 'location',
        label: 'Location',
        priority: 'medium',
      });
      suggestions.push({
        field: 'location',
        reason: 'Location helps you connect with nearby users',
        impact: 'Increases local engagement by 25%',
      });
    }

    return {
      percentage: Math.round((completed / total) * 100),
      missing: fields,
      suggestions,
    };
  }

  private validateUpdates(updates: ProfileUpdates): Partial<{
    displayName: string;
    bio: string;
    avatarUrl: string;
    website: string;
    location: string;
  }> {
    const validated: Partial<{
      displayName: string;
      bio: string;
      avatarUrl: string;
      website: string;
      location: string;
    }> = {};

    if (updates.displayName !== undefined) {
      const name = updates.displayName.trim();
      if (name.length >= 2 && name.length <= 50) {
        validated.displayName = name;
      }
    }

    if (updates.bio !== undefined) {
      const bio = updates.bio.trim();
      if (bio.length <= 160) {
        validated.bio = bio;
      }
    }

    if (updates.avatar !== undefined) {
      // Validate URL format
      if (this.isValidUrl(updates.avatar)) {
        validated.avatarUrl = updates.avatar;
      }
    }

    if (updates.website !== undefined) {
      if (updates.website === '' || this.isValidUrl(updates.website)) {
        validated.website = updates.website;
      }
    }

    if (updates.location !== undefined) {
      const location = updates.location.trim();
      if (location.length <= 100) {
        validated.location = location;
      }
    }

    return validated;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

export default ProfileWizard;


