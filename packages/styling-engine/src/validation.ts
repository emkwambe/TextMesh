// =================================
// TEXTMESH STYLE VALIDATION
// Server-side validation for styled content
// =================================

import {
  StyledPostContent,
  TextStyle,
  Background,
  Sticker,
  ShapeOverlay,
  STYLE_LIMITS,
} from './types';

// ============ VALIDATION RESULT ============

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============ VALIDATION FUNCTIONS ============

/**
 * Validate text content
 */
function validateText(text: string): string[] {
  const errors: string[] = [];

  if (!text || text.length === 0) {
    errors.push('Text content is required');
  }

  if (text.length > STYLE_LIMITS.maxTextLength) {
    errors.push(
      `Text exceeds maximum length of ${STYLE_LIMITS.maxTextLength} characters`
    );
  }

  // Check for prohibited content patterns
  const prohibitedPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i, // onclick, onerror, etc.
    /data:/i,
  ];

  for (const pattern of prohibitedPatterns) {
    if (pattern.test(text)) {
      errors.push('Text contains prohibited content');
      break;
    }
  }

  return errors;
}

/**
 * Validate text styles
 */
function validateTextStyles(
  styles: TextStyle[],
  textLength: number
): string[] {
  const errors: string[] = [];

  if (styles.length > STYLE_LIMITS.maxTextStyles) {
    errors.push(
      `Too many text styles. Maximum ${STYLE_LIMITS.maxTextStyles} allowed`
    );
  }

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];

    if (!style) continue;

    // Validate range
    if (style.range.start < 0) {
      errors.push(`Style ${i}: Range start cannot be negative`);
    }

    if (style.range.end > textLength) {
      errors.push(`Style ${i}: Range end exceeds text length`);
    }

    if (style.range.start >= style.range.end) {
      errors.push(`Style ${i}: Invalid range (start >= end)`);
    }

    // Validate color
    if (style.color) {
      if (style.color.type === 'solid' && !isValidHexColor(style.color.value)) {
        errors.push(`Style ${i}: Invalid color value`);
      }
    }

    // Validate link URL
    if (style.linkUrl && !isValidUrl(style.linkUrl)) {
      errors.push(`Style ${i}: Invalid link URL`);
    }
  }

  return errors;
}

/**
 * Validate background
 */
function validateBackground(background: Background): string[] {
  const errors: string[] = [];

  switch (background.type) {
    case 'solid':
      if (!isValidHexColor(background.color)) {
        errors.push('Invalid solid background color');
      }
      break;

    case 'gradient':
      if (!background.stops || background.stops.length === 0) {
        errors.push('Gradient must have at least one stop');
      }

      if (background.stops.length > STYLE_LIMITS.maxGradientStops) {
        errors.push(
          `Too many gradient stops. Maximum ${STYLE_LIMITS.maxGradientStops} allowed`
        );
      }

      for (const stop of background.stops) {
        if (!isValidHexColor(stop.color)) {
          errors.push('Invalid gradient stop color');
        }
        if (stop.position < 0 || stop.position > 1) {
          errors.push('Gradient stop position must be between 0 and 1');
        }
      }

      if (background.gradientType === 'linear') {
        if (background.angle < 0 || background.angle > 360) {
          errors.push('Linear gradient angle must be between 0 and 360');
        }
      }

      if (background.gradientType === 'radial') {
        if (
          background.centerX < 0 ||
          background.centerX > 1 ||
          background.centerY < 0 ||
          background.centerY > 1
        ) {
          errors.push('Radial gradient center must be between 0 and 1');
        }
      }
      break;

    case 'pattern':
      if (!background.patternId) {
        errors.push('Pattern ID is required');
      }
      if (!isValidHexColor(background.primaryColor)) {
        errors.push('Invalid pattern primary color');
      }
      break;

    case 'image':
      if (!background.imageUrl) {
        errors.push('Image URL is required');
      }
      if (!isValidUrl(background.imageUrl)) {
        errors.push('Invalid image URL');
      }
      break;

    default:
      errors.push('Invalid background type');
  }

  return errors;
}

/**
 * Validate stickers
 */
function validateStickers(stickers: Sticker[]): string[] {
  const errors: string[] = [];

  if (stickers.length > STYLE_LIMITS.maxStickers) {
    errors.push(
      `Too many stickers. Maximum ${STYLE_LIMITS.maxStickers} allowed`
    );
  }

  for (let i = 0; i < stickers.length; i++) {
    const sticker = stickers[i];

    if (!sticker) continue;

    if (!sticker.id) {
      errors.push(`Sticker ${i}: ID is required`);
    }

    if (!sticker.stickerId) {
      errors.push(`Sticker ${i}: Sticker ID is required`);
    }

    // Validate position
    if (
      sticker.position.x < 0 ||
      sticker.position.x > 100 ||
      sticker.position.y < 0 ||
      sticker.position.y > 100
    ) {
      errors.push(`Sticker ${i}: Position must be between 0 and 100`);
    }

    // Validate size
    if (
      sticker.size.width <= 0 ||
      sticker.size.width > 100 ||
      sticker.size.height <= 0 ||
      sticker.size.height > 100
    ) {
      errors.push(`Sticker ${i}: Invalid size`);
    }

    // Validate opacity
    if (sticker.opacity < 0 || sticker.opacity > 1) {
      errors.push(`Sticker ${i}: Opacity must be between 0 and 1`);
    }

    // Validate zIndex
    if (sticker.zIndex < 0 || sticker.zIndex > 100) {
      errors.push(`Sticker ${i}: zIndex must be between 0 and 100`);
    }
  }

  return errors;
}

/**
 * Validate overlays
 */
function validateOverlays(overlays: ShapeOverlay[]): string[] {
  const errors: string[] = [];

  if (overlays.length > STYLE_LIMITS.maxOverlays) {
    errors.push(
      `Too many overlays. Maximum ${STYLE_LIMITS.maxOverlays} allowed`
    );
  }

  const validShapeTypes = [
    'rectangle',
    'circle',
    'triangle',
    'star',
    'heart',
    'custom',
  ];

  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i];

    if (!overlay) continue;

    if (!overlay.id) {
      errors.push(`Overlay ${i}: ID is required`);
    }

    if (!validShapeTypes.includes(overlay.shapeType)) {
      errors.push(`Overlay ${i}: Invalid shape type`);
    }

    // Validate position
    if (
      overlay.position.x < 0 ||
      overlay.position.x > 100 ||
      overlay.position.y < 0 ||
      overlay.position.y > 100
    ) {
      errors.push(`Overlay ${i}: Position must be between 0 and 100`);
    }

    // Validate colors
    if (overlay.fill && !isValidHexColor(overlay.fill)) {
      errors.push(`Overlay ${i}: Invalid fill color`);
    }

    if (overlay.stroke && !isValidHexColor(overlay.stroke)) {
      errors.push(`Overlay ${i}: Invalid stroke color`);
    }

    // Validate custom path
    if (overlay.shapeType === 'custom' && !overlay.customPath) {
      errors.push(`Overlay ${i}: Custom shape requires a path`);
    }
  }

  return errors;
}

/**
 * Main validation function
 */
export function validateStyledContent(content: StyledPostContent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Version check
  if (content.version !== '1.0') {
    warnings.push(`Unknown version ${content.version}, may have compatibility issues`);
  }

  // Validate text
  errors.push(...validateText(content.text));

  // Validate text styles
  errors.push(...validateTextStyles(content.textStyles, content.text.length));

  // Validate background
  errors.push(...validateBackground(content.background));

  // Validate stickers
  errors.push(...validateStickers(content.stickers));

  // Validate overlays
  errors.push(...validateOverlays(content.overlays));

  // Validate default text color
  if (
    content.defaultTextColor.type === 'solid' &&
    !isValidHexColor(content.defaultTextColor.value)
  ) {
    errors.push('Invalid default text color');
  }

  // Validate aspect ratio
  const validAspectRatios = ['1:1', '4:5', '16:9', '9:16'];
  if (!validAspectRatios.includes(content.aspectRatio)) {
    errors.push('Invalid aspect ratio');
  }

  // Validate timestamp
  if (!content.createdAt || isNaN(Date.parse(content.createdAt))) {
    errors.push('Invalid createdAt timestamp');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============ HELPER FUNCTIONS ============

/**
 * Validate hex color
 */
function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Validate URL
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitize styled content (remove potentially dangerous content)
 */
export function sanitizeStyledContent(
  content: StyledPostContent
): StyledPostContent {
  return {
    ...content,
    text: sanitizeText(content.text),
    textStyles: content.textStyles.map((style) => ({
      ...style,
      linkUrl: style.linkUrl ? sanitizeUrl(style.linkUrl) : undefined,
    })),
  };
}

/**
 * Sanitize text
 */
function sanitizeText(text: string): string {
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

/**
 * Sanitize URL
 */
function sanitizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
