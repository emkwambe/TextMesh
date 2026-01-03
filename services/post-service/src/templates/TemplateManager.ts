// =================================
// TEMPLATE MANAGER
// Manages post templates for styled posts
// =================================

import { PrismaClient, PostStyle } from '@prisma/client';
import { Logger } from '@textmesh/logger';

// ============ TYPES ============

export interface Template {
  id: string;
  name: string;
  style: PostStyle;
  placeholder: string;
  structure: {
    prefix?: string;
    suffix?: string;
    format?: string;
  };
}

export interface CreateTemplateRequest {
  name: string;
  style: PostStyle;
  placeholder: string;
  structure: {
    prefix?: string;
    suffix?: string;
    format?: string;
  };
  isSystem?: boolean;
}

// ============ TEMPLATE MANAGER CLASS ============

export class TemplateManager {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  /**
   * Seed system templates (run once on service startup)
   */
  async seedTemplates(): Promise<void> {
    const systemTemplates: CreateTemplateRequest[] = [
      {
        name: 'Announcement',
        style: PostStyle.ANNOUNCEMENT,
        placeholder: 'Important update for the group...',
        structure: { prefix: '📢 ' },
        isSystem: true
      },
      {
        name: 'Question',
        style: PostStyle.QUESTION,
        placeholder: 'What are your thoughts on...',
        structure: { suffix: ' ?' },
        isSystem: true
      },
      {
        name: 'Weekly Update',
        style: PostStyle.UPDATE,
        placeholder: 'This week we covered...',
        structure: { prefix: '📅 Week of ' },
        isSystem: true
      },
      {
        name: 'Daily Standup',
        style: PostStyle.UPDATE,
        placeholder: 'Today we will...',
        structure: { prefix: '🗓️ ' },
        isSystem: true
      },
      {
        name: 'Discussion Starter',
        style: PostStyle.DISCUSSION,
        placeholder: 'Let\'s discuss...',
        structure: { prefix: '💬 ' },
        isSystem: true
      }
    ];

    for (const template of systemTemplates) {
      // Check if template already exists by name
      const existing = await this.prisma.postTemplate.findFirst({
        where: { name: template.name }
      });

      if (!existing) {
        await this.prisma.postTemplate.create({
          data: {
            name: template.name,
            style: template.style,
            placeholder: template.placeholder,
            structure: template.structure,
            isSystem: template.isSystem ?? true
          }
        });
        this.logger.info(`Seeded template: ${template.name}`);
      }
    }
  }

  /**
   * Get all templates or filter by style
   */
  async getTemplates(style?: PostStyle): Promise<Template[]> {
    const templates = await this.prisma.postTemplate.findMany({
      where: style ? { style } : {},
      orderBy: { name: 'asc' }
    });

    return templates.map(t => ({
      id: t.id,
      name: t.name,
      style: t.style,
      placeholder: t.placeholder,
      structure: t.structure as { prefix?: string; suffix?: string; format?: string }
    }));
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: string): Promise<Template | null> {
    const template = await this.prisma.postTemplate.findUnique({
      where: { id }
    });

    if (!template) return null;

    return {
      id: template.id,
      name: template.name,
      style: template.style,
      placeholder: template.placeholder,
      structure: template.structure as { prefix?: string; suffix?: string; format?: string }
    };
  }

  /**
   * Apply template to content
   */
  applyTemplate(content: string, template: Template): string {
    let result = content;

    if (template.structure.prefix) {
      result = template.structure.prefix + result;
    }

    if (template.structure.suffix) {
      result = result + template.structure.suffix;
    }

    // Add format processing here if needed (e.g., markdown, special formatting)

    return result;
  }

  /**
   * Create custom template (for future use)
   */
  async createTemplate(data: CreateTemplateRequest): Promise<Template> {
    const template = await this.prisma.postTemplate.create({
      data: {
        name: data.name,
        style: data.style,
        placeholder: data.placeholder,
        structure: data.structure,
        isSystem: data.isSystem ?? false
      }
    });

    return {
      id: template.id,
      name: template.name,
      style: template.style,
      placeholder: template.placeholder,
      structure: template.structure as { prefix?: string; suffix?: string; format?: string }
    };
  }
}
