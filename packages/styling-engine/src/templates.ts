// =================================
// TEXTMESH TEMPLATE LIBRARY
// 20+ Preset Templates
// =================================

import { TextTemplate, TemplateCategory } from './types';

// ============ DEFAULT TEMPLATES ============

export const DEFAULT_TEMPLATES: TextTemplate[] = [
  // === MINIMAL TEMPLATES ===
  {
    id: 'minimal-white',
    name: 'Clean White',
    category: 'minimal',
    background: { type: 'solid', color: '#FFFFFF' },
    defaultTextColor: { type: 'solid', value: '#1A1A1A' },
    defaultFontWeight: 'regular',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 40, right: 40, bottom: 40, left: 40 },
    thumbnail: '/templates/minimal-white.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'minimal-dark',
    name: 'Elegant Dark',
    category: 'minimal',
    background: { type: 'solid', color: '#1A1A1A' },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 40, right: 40, bottom: 40, left: 40 },
    thumbnail: '/templates/minimal-dark.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'minimal-cream',
    name: 'Warm Cream',
    category: 'minimal',
    background: { type: 'solid', color: '#FDF6E3' },
    defaultTextColor: { type: 'solid', value: '#5C4A32' },
    defaultFontWeight: 'regular',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 40, right: 40, bottom: 40, left: 40 },
    thumbnail: '/templates/minimal-cream.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === VIBRANT TEMPLATES ===
  {
    id: 'vibrant-sunset',
    name: 'Sunset Vibes',
    category: 'vibrant',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#FF6B6B', position: 0 },
        { color: '#FFE66D', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/vibrant-sunset.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'vibrant-ocean',
    name: 'Ocean Breeze',
    category: 'vibrant',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 180,
      stops: [
        { color: '#667EEA', position: 0 },
        { color: '#764BA2', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'semibold',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/vibrant-ocean.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'vibrant-neon',
    name: 'Neon Glow',
    category: 'vibrant',
    background: {
      type: 'gradient',
      gradientType: 'radial',
      centerX: 0.5,
      centerY: 0.5,
      radius: 1,
      stops: [
        { color: '#0F0C29', position: 0 },
        { color: '#302B63', position: 0.5 },
        { color: '#24243E', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#00F5FF' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/vibrant-neon.png',
    isPremium: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'vibrant-candy',
    name: 'Cotton Candy',
    category: 'vibrant',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 45,
      stops: [
        { color: '#FF9A9E', position: 0 },
        { color: '#FECFEF', position: 0.5 },
        { color: '#A18CD1', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#4A2C4E' },
    defaultFontWeight: 'semibold',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/vibrant-candy.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === NATURE TEMPLATES ===
  {
    id: 'nature-forest',
    name: 'Forest Green',
    category: 'nature',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 180,
      stops: [
        { color: '#134E5E', position: 0 },
        { color: '#71B280', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/nature-forest.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'nature-sky',
    name: 'Clear Sky',
    category: 'nature',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 180,
      stops: [
        { color: '#87CEEB', position: 0 },
        { color: '#E0F7FF', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#1E3A5F' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/nature-sky.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'nature-earth',
    name: 'Earth Tones',
    category: 'nature',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#8B7355', position: 0 },
        { color: '#D4A574', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/nature-earth.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === ABSTRACT TEMPLATES ===
  {
    id: 'abstract-aurora',
    name: 'Aurora',
    category: 'abstract',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 45,
      stops: [
        { color: '#00C9FF', position: 0 },
        { color: '#92FE9D', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#0A2540' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/abstract-aurora.png',
    isPremium: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'abstract-galaxy',
    name: 'Galaxy',
    category: 'abstract',
    background: {
      type: 'gradient',
      gradientType: 'radial',
      centerX: 0.3,
      centerY: 0.3,
      radius: 1.5,
      stops: [
        { color: '#1A0533', position: 0 },
        { color: '#3D1A5C', position: 0.5 },
        { color: '#0D0221', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#E8D5FF' },
    defaultFontWeight: 'semibold',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/abstract-galaxy.png',
    isPremium: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === SEASONAL TEMPLATES ===
  {
    id: 'seasonal-spring',
    name: 'Spring Bloom',
    category: 'seasonal',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#FFECD2', position: 0 },
        { color: '#FCB69F', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#5C3D2E' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/seasonal-spring.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'seasonal-winter',
    name: 'Winter Frost',
    category: 'seasonal',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 180,
      stops: [
        { color: '#E6E9F0', position: 0 },
        { color: '#C4D4E0', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#2C3E50' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/seasonal-winter.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === CELEBRATION TEMPLATES ===
  {
    id: 'celebration-party',
    name: 'Party Time',
    category: 'celebration',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 45,
      stops: [
        { color: '#F857A6', position: 0 },
        { color: '#FF5858', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'xl',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/celebration-party.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'celebration-gold',
    name: 'Golden Hour',
    category: 'celebration',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#F7971E', position: 0 },
        { color: '#FFD200', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#4A3000' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/celebration-gold.png',
    isPremium: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === MOTIVATION TEMPLATES ===
  {
    id: 'motivation-focus',
    name: 'Focus Mode',
    category: 'motivation',
    background: { type: 'solid', color: '#2D3436' },
    defaultTextColor: { type: 'solid', value: '#FDCB6E' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 60, right: 50, bottom: 60, left: 50 },
    thumbnail: '/templates/motivation-focus.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'motivation-inspire',
    name: 'Inspire',
    category: 'motivation',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#11998E', position: 0 },
        { color: '#38EF7D', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 60, right: 50, bottom: 60, left: 50 },
    thumbnail: '/templates/motivation-inspire.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === SOCIAL TEMPLATES ===
  {
    id: 'social-announcement',
    name: 'Announcement',
    category: 'social',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#4776E6', position: 0 },
        { color: '#8E54E9', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'bold',
    defaultFontSize: 'lg',
    textAlignment: 'center',
    padding: { top: 50, right: 40, bottom: 50, left: 40 },
    thumbnail: '/templates/social-announcement.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },

  // === BUSINESS TEMPLATES ===
  {
    id: 'business-professional',
    name: 'Professional',
    category: 'business',
    background: {
      type: 'gradient',
      gradientType: 'linear',
      angle: 135,
      stops: [
        { color: '#1E3C72', position: 0 },
        { color: '#2A5298', position: 1 },
      ],
    },
    defaultTextColor: { type: 'solid', value: '#FFFFFF' },
    defaultFontWeight: 'medium',
    defaultFontSize: 'md',
    textAlignment: 'left',
    padding: { top: 50, right: 50, bottom: 50, left: 50 },
    thumbnail: '/templates/business-professional.png',
    isPremium: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'business-corporate',
    name: 'Corporate',
    category: 'business',
    background: { type: 'solid', color: '#F8F9FA' },
    defaultTextColor: { type: 'solid', value: '#212529' },
    defaultFontWeight: 'regular',
    defaultFontSize: 'md',
    textAlignment: 'left',
    padding: { top: 50, right: 50, bottom: 50, left: 50 },
    thumbnail: '/templates/business-corporate.png',
    isPremium: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

// ============ TEMPLATE FUNCTIONS ============

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): TextTemplate | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): TextTemplate[] {
  return DEFAULT_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get free templates
 */
export function getFreeTemplates(): TextTemplate[] {
  return DEFAULT_TEMPLATES.filter((t) => !t.isPremium);
}

/**
 * Get premium templates
 */
export function getPremiumTemplates(): TextTemplate[] {
  return DEFAULT_TEMPLATES.filter((t) => t.isPremium);
}

/**
 * Get all template categories
 */
export function getTemplateCategories(): TemplateCategory[] {
  const categories = new Set(DEFAULT_TEMPLATES.map((t) => t.category));
  return Array.from(categories);
}

/**
 * Search templates
 */
export function searchTemplates(query: string): TextTemplate[] {
  const lowerQuery = query.toLowerCase();
  return DEFAULT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.category.toLowerCase().includes(lowerQuery)
  );
}
