// =================================
// TEXTMESH STYLING ENGINE
// Complete Implementation
// =================================

import { v4 as uuidv4 } from 'uuid';

// Re-export types
export * from './types';
export * from './contrast';
export * from './templates';
export * from './patterns';
export * from './validation';
export * from './renderer';

// ============ CORE STYLING ENGINE ============

import {
  StyledPostContent,
  TextStyle,
  Background,
  Sticker,
  ShapeOverlay,
  TextColor,
  FontWeight,
  FontSize,
  TextAlignment,
  STYLE_LIMITS,
} from './types';
import { validateStyledContent, ValidationResult } from './validation';
import { checkContrast, getOptimalTextColor } from './contrast';
import { getTemplate, DEFAULT_TEMPLATES } from './templates';

export class StylingEngine {
  /**
   * Create a new styled post content with defaults
   */
  static createStyledContent(text: string, templateId?: string): StyledPostContent {
    const template = templateId ? getTemplate(templateId) : DEFAULT_TEMPLATES[0];

    return {
      version: '1.0',
      text,
      textStyles: [],
      background: template?.background || { type: 'solid', color: '#FFFFFF' },
      textAlignment: template?.textAlignment || 'center',
      defaultTextColor: template?.defaultTextColor || { type: 'solid', value: '#000000' },
      defaultFontWeight: template?.defaultFontWeight || 'regular',
      defaultFontSize: template?.defaultFontSize || 'md',
      stickers: [],
      overlays: [],
      templateId: template?.id,
      aspectRatio: '1:1',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Apply a text style to a range
   */
  static applyTextStyle(
    content: StyledPostContent,
    style: Partial<TextStyle>,
    start: number,
    end: number
  ): StyledPostContent {
    const newStyle: TextStyle = {
      range: { start, end },
      ...style,
    };

    // Remove overlapping styles and merge
    const filteredStyles = content.textStyles.filter(
      (s) => s.range.end <= start || s.range.start >= end
    );

    return {
      ...content,
      textStyles: [...filteredStyles, newStyle].slice(0, STYLE_LIMITS.maxTextStyles),
    };
  }

  /**
   * Apply color to text range
   */
  static applyTextColor(
    content: StyledPostContent,
    color: TextColor,
    start: number,
    end: number
  ): StyledPostContent {
    return this.applyTextStyle(content, { color }, start, end);
  }

  /**
   * Apply font weight to text range
   */
  static applyFontWeight(
    content: StyledPostContent,
    fontWeight: FontWeight,
    start: number,
    end: number
  ): StyledPostContent {
    return this.applyTextStyle(content, { fontWeight }, start, end);
  }

  /**
   * Apply font size to text range
   */
  static applyFontSize(
    content: StyledPostContent,
    fontSize: FontSize,
    start: number,
    end: number
  ): StyledPostContent {
    return this.applyTextStyle(content, { fontSize }, start, end);
  }

  /**
   * Set background
   */
  static setBackground(content: StyledPostContent, background: Background): StyledPostContent {
    // Auto-adjust text color for contrast
    const optimalColor = getOptimalTextColor(background);

    return {
      ...content,
      background,
      defaultTextColor: optimalColor,
    };
  }

  /**
   * Add sticker
   */
  static addSticker(content: StyledPostContent, sticker: Omit<Sticker, 'id'>): StyledPostContent {
    if (content.stickers.length >= STYLE_LIMITS.maxStickers) {
      throw new Error(`Maximum ${STYLE_LIMITS.maxStickers} stickers allowed`);
    }

    const newSticker: Sticker = {
      id: uuidv4(),
      ...sticker,
    };

    return {
      ...content,
      stickers: [...content.stickers, newSticker],
    };
  }

  /**
   * Remove sticker
   */
  static removeSticker(content: StyledPostContent, stickerId: string): StyledPostContent {
    return {
      ...content,
      stickers: content.stickers.filter((s) => s.id !== stickerId),
    };
  }

  /**
   * Update sticker
   */
  static updateSticker(
    content: StyledPostContent,
    stickerId: string,
    updates: Partial<Sticker>
  ): StyledPostContent {
    return {
      ...content,
      stickers: content.stickers.map((s) =>
        s.id === stickerId ? { ...s, ...updates } : s
      ),
    };
  }

  /**
   * Add overlay
   */
  static addOverlay(
    content: StyledPostContent,
    overlay: Omit<ShapeOverlay, 'id'>
  ): StyledPostContent {
    if (content.overlays.length >= STYLE_LIMITS.maxOverlays) {
      throw new Error(`Maximum ${STYLE_LIMITS.maxOverlays} overlays allowed`);
    }

    const newOverlay: ShapeOverlay = {
      id: uuidv4(),
      ...overlay,
    };

    return {
      ...content,
      overlays: [...content.overlays, newOverlay],
    };
  }

  /**
   * Remove overlay
   */
  static removeOverlay(content: StyledPostContent, overlayId: string): StyledPostContent {
    return {
      ...content,
      overlays: content.overlays.filter((o) => o.id !== overlayId),
    };
  }

  /**
   * Set text alignment
   */
  static setTextAlignment(
    content: StyledPostContent,
    alignment: TextAlignment
  ): StyledPostContent {
    return {
      ...content,
      textAlignment: alignment,
    };
  }

  /**
   * Apply template
   */
  static applyTemplate(content: StyledPostContent, templateId: string): StyledPostContent {
    const template = getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return {
      ...content,
      background: template.background,
      defaultTextColor: template.defaultTextColor,
      defaultFontWeight: template.defaultFontWeight,
      defaultFontSize: template.defaultFontSize,
      textAlignment: template.textAlignment,
      stickers: template.stickers || [],
      overlays: template.overlays || [],
      templateId: template.id,
    };
  }

  /**
   * Validate styled content
   */
  static validate(content: StyledPostContent): ValidationResult {
    return validateStyledContent(content);
  }

  /**
   * Check contrast for accessibility
   */
  static checkAccessibility(content: StyledPostContent): {
    isAccessible: boolean;
    contrastRatio: number;
    recommendation?: string;
  } {
    const result = checkContrast(content.defaultTextColor, content.background);

    return {
      isAccessible: result.aa,
      contrastRatio: result.ratio,
      recommendation: !result.aa
        ? 'Consider using a higher contrast color combination for better accessibility'
        : undefined,
    };
  }

  /**
   * Serialize to JSON for storage
   */
  static serialize(content: StyledPostContent): string {
    return JSON.stringify(content);
  }

  /**
   * Parse from JSON
   */
  static parse(json: string): StyledPostContent {
    const content = JSON.parse(json) as StyledPostContent;
    const validation = this.validate(content);

    if (!validation.isValid) {
      throw new Error(`Invalid styled content: ${validation.errors.join(', ')}`);
    }

    return content;
  }

  /**
   * Clone styled content
   */
  static clone(content: StyledPostContent): StyledPostContent {
    return JSON.parse(JSON.stringify(content)) as StyledPostContent;
  }

  /**
   * Get plain text from styled content
   */
  static getPlainText(content: StyledPostContent): string {
    return content.text;
  }

  /**
   * Update text while preserving styles where possible
   */
  static updateText(content: StyledPostContent, newText: string): StyledPostContent {
    // Simple approach: clear styles if text changed significantly
    if (Math.abs(newText.length - content.text.length) > content.text.length * 0.5) {
      return {
        ...content,
        text: newText,
        textStyles: [],
      };
    }

    // Adjust style ranges based on text changes
    const adjustedStyles = content.textStyles
      .map((style) => {
        if (style.range.end > newText.length) {
          return {
            ...style,
            range: {
              start: Math.min(style.range.start, newText.length),
              end: Math.min(style.range.end, newText.length),
            },
          };
        }
        return style;
      })
      .filter((style) => style.range.start < style.range.end);

    return {
      ...content,
      text: newText,
      textStyles: adjustedStyles,
    };
  }
}

export default StylingEngine;
