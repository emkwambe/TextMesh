// =================================
// WCAG CONTRAST CHECKER
// Complete Implementation
// =================================

import {
  TextColor,
  Background,
  ContrastResult,
  GradientBackground,
  SolidBackground,
} from './types';

// ============ COLOR UTILITIES ============

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(result[1] || '0', 16),
    g: parseInt(result[2] || '0', 16),
    b: parseInt(result[3] || '0', 16),
  };
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (c: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, c))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// ============ RELATIVE LUMINANCE ============

/**
 * Calculate relative luminance according to WCAG 2.1
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * (rs ?? 0) + 0.7152 * (gs ?? 0) + 0.0722 * (bs ?? 0);
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

// ============ WCAG COMPLIANCE CHECKING ============

/**
 * Check if contrast ratio meets WCAG requirements
 */
export function checkContrastRatio(ratio: number): ContrastResult {
  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5, // Normal text
    aaa: ratio >= 7, // Enhanced
    aaLarge: ratio >= 3, // Large text (18pt+ or 14pt bold+)
    aaaLarge: ratio >= 4.5, // Enhanced large text
  };
}

/**
 * Get the dominant color from a background
 */
export function getBackgroundColor(background: Background): string {
  switch (background.type) {
    case 'solid':
      return (background as SolidBackground).color;

    case 'gradient': {
      const gradient = background as GradientBackground;
      // Return average of gradient stops
      if (gradient.stops.length === 0) return '#FFFFFF';

      const colors = gradient.stops.map((stop) => hexToRgb(stop.color));
      const avgR = Math.round(colors.reduce((sum, c) => sum + c.r, 0) / colors.length);
      const avgG = Math.round(colors.reduce((sum, c) => sum + c.g, 0) / colors.length);
      const avgB = Math.round(colors.reduce((sum, c) => sum + c.b, 0) / colors.length);

      return rgbToHex({ r: avgR, g: avgG, b: avgB });
    }

    case 'pattern':
      return background.primaryColor;

    case 'image':
      // For images, assume light background unless overlay specified
      return background.overlay || '#FFFFFF';

    default:
      return '#FFFFFF';
  }
}

/**
 * Get text color value
 */
export function getTextColorValue(textColor: TextColor): string {
  if (textColor.type === 'solid') {
    return textColor.value;
  }
  // For gradient text, use the first color
  return textColor.value;
}

/**
 * Check contrast between text color and background
 */
export function checkContrast(textColor: TextColor, background: Background): ContrastResult {
  const textColorValue = getTextColorValue(textColor);
  const bgColorValue = getBackgroundColor(background);

  const textRgb = hexToRgb(textColorValue);
  const bgRgb = hexToRgb(bgColorValue);

  const ratio = getContrastRatio(textRgb, bgRgb);

  return checkContrastRatio(ratio);
}

/**
 * Get optimal text color for a background (black or white)
 */
export function getOptimalTextColor(background: Background): TextColor {
  const bgColor = getBackgroundColor(background);
  const bgRgb = hexToRgb(bgColor);
  const bgLuminance = getRelativeLuminance(bgRgb);

  // If background is dark, use white text; otherwise use black
  const textValue = bgLuminance > 0.179 ? '#000000' : '#FFFFFF';

  return {
    type: 'solid',
    value: textValue,
  };
}

/**
 * Suggest accessible text colors for a background
 */
export function suggestAccessibleColors(
  background: Background,
  count: number = 5
): TextColor[] {
  const bgColor = getBackgroundColor(background);
  const bgRgb = hexToRgb(bgColor);
  const bgHsl = rgbToHsl(bgRgb);

  const suggestions: TextColor[] = [];

  // Always include optimal black/white
  const optimal = getOptimalTextColor(background);
  suggestions.push(optimal);

  // Generate complementary colors with good contrast
  const baseHue = bgHsl.h;
  const hueOffsets = [180, 120, 240, 60, 300]; // Complementary and triadic

  for (const offset of hueOffsets) {
    if (suggestions.length >= count) break;

    const newHue = (baseHue + offset) % 360;

    // Try different lightness values to find good contrast
    for (const lightness of [15, 25, 75, 85]) {
      const candidateRgb = hslToRgb({ h: newHue, s: 70, l: lightness });
      const ratio = getContrastRatio(candidateRgb, bgRgb);

      if (ratio >= 4.5) {
        suggestions.push({
          type: 'solid',
          value: rgbToHex(candidateRgb),
        });
        break;
      }
    }
  }

  return suggestions.slice(0, count);
}

/**
 * Adjust color to meet minimum contrast ratio
 */
export function adjustForContrast(
  textColor: string,
  background: Background,
  minRatio: number = 4.5
): string {
  const bgColor = getBackgroundColor(background);
  const bgRgb = hexToRgb(bgColor);
  const textRgb = hexToRgb(textColor);

  let currentRatio = getContrastRatio(textRgb, bgRgb);

  if (currentRatio >= minRatio) {
    return textColor;
  }

  const textHsl = rgbToHsl(textRgb);
  const bgLuminance = getRelativeLuminance(bgRgb);

  // Determine direction to adjust lightness
  const direction = bgLuminance > 0.5 ? -1 : 1;

  // Iterate to find acceptable lightness
  let adjustedLightness = textHsl.l;
  for (let i = 0; i < 100; i++) {
    adjustedLightness += direction * 2;
    adjustedLightness = Math.max(0, Math.min(100, adjustedLightness));

    const adjustedRgb = hslToRgb({ ...textHsl, l: adjustedLightness });
    currentRatio = getContrastRatio(adjustedRgb, bgRgb);

    if (currentRatio >= minRatio) {
      return rgbToHex(adjustedRgb);
    }
  }

  // Fallback to black or white
  return bgLuminance > 0.5 ? '#000000' : '#FFFFFF';
}

// ============ COLOR MANIPULATION ============

/**
 * Lighten a color by percentage
 */
export function lighten(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.min(100, hsl.l + percent);
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Darken a color by percentage
 */
export function darken(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, hsl.l - percent);
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Saturate a color by percentage
 */
export function saturate(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  hsl.s = Math.min(100, hsl.s + percent);
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Desaturate a color by percentage
 */
export function desaturate(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  hsl.s = Math.max(0, hsl.s - percent);
  return rgbToHex(hslToRgb(hsl));
}

/**
 * Mix two colors
 */
export function mix(color1: string, color2: string, weight: number = 0.5): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  const mixed: RGB = {
    r: Math.round(rgb1.r * weight + rgb2.r * (1 - weight)),
    g: Math.round(rgb1.g * weight + rgb2.g * (1 - weight)),
    b: Math.round(rgb1.b * weight + rgb2.b * (1 - weight)),
  };

  return rgbToHex(mixed);
}
