// =================================
// TEXTMESH COLOR SYSTEM
// Brand Colors & Palettes
// =================================

// ============ PRIMARY BRAND COLORS ============

export const BRAND_COLORS = {
  // Primary - TextMesh signature blue
  primary: {
    50: '#E6F0FF',
    100: '#CCE0FF',
    200: '#99C2FF',
    300: '#66A3FF',
    400: '#3385FF',
    500: '#0066FF', // Main brand color
    600: '#0052CC',
    700: '#003D99',
    800: '#002966',
    900: '#001433',
  },

  // Secondary - Accent purple
  secondary: {
    50: '#F3E8FF',
    100: '#E7D1FF',
    200: '#CFA3FF',
    300: '#B775FF',
    400: '#9F47FF',
    500: '#8719FF', // Secondary brand color
    600: '#6C14CC',
    700: '#510F99',
    800: '#360A66',
    900: '#1B0533',
  },

  // Accent - Vibrant cyan
  accent: {
    50: '#E0FCFF',
    100: '#C2F9FF',
    200: '#85F3FF',
    300: '#47EDFF',
    400: '#0AE7FF',
    500: '#00D4ED', // Accent color
    600: '#00AABE',
    700: '#007F8E',
    800: '#00555F',
    900: '#002A2F',
  },

  // Success - Green
  success: {
    50: '#E6FFF0',
    100: '#CCFFE0',
    200: '#99FFC2',
    300: '#66FFA3',
    400: '#33FF85',
    500: '#00FF66',
    600: '#00CC52',
    700: '#00993D',
    800: '#006629',
    900: '#003314',
  },

  // Warning - Amber
  warning: {
    50: '#FFF8E6',
    100: '#FFF1CC',
    200: '#FFE299',
    300: '#FFD466',
    400: '#FFC533',
    500: '#FFB700',
    600: '#CC9200',
    700: '#996E00',
    800: '#664900',
    900: '#332500',
  },

  // Error - Red
  error: {
    50: '#FFE6E6',
    100: '#FFCCCC',
    200: '#FF9999',
    300: '#FF6666',
    400: '#FF3333',
    500: '#FF0000',
    600: '#CC0000',
    700: '#990000',
    800: '#660000',
    900: '#330000',
  },

  // Neutral - Gray scale
  neutral: {
    0: '#FFFFFF',
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#030712',
  },
} as const;

// ============ SEMANTIC COLORS ============

export const SEMANTIC_COLORS = {
  // Background colors
  background: {
    primary: BRAND_COLORS.neutral[0],
    secondary: BRAND_COLORS.neutral[50],
    tertiary: BRAND_COLORS.neutral[100],
    inverse: BRAND_COLORS.neutral[900],
    brand: BRAND_COLORS.primary[500],
    accent: BRAND_COLORS.accent[500],
  },

  // Text colors
  text: {
    primary: BRAND_COLORS.neutral[900],
    secondary: BRAND_COLORS.neutral[600],
    tertiary: BRAND_COLORS.neutral[400],
    inverse: BRAND_COLORS.neutral[0],
    brand: BRAND_COLORS.primary[500],
    link: BRAND_COLORS.primary[600],
    success: BRAND_COLORS.success[600],
    warning: BRAND_COLORS.warning[600],
    error: BRAND_COLORS.error[600],
  },

  // Border colors
  border: {
    default: BRAND_COLORS.neutral[200],
    hover: BRAND_COLORS.neutral[300],
    focus: BRAND_COLORS.primary[500],
    error: BRAND_COLORS.error[500],
    success: BRAND_COLORS.success[500],
  },

  // Interactive colors
  interactive: {
    primary: BRAND_COLORS.primary[500],
    primaryHover: BRAND_COLORS.primary[600],
    primaryActive: BRAND_COLORS.primary[700],
    secondary: BRAND_COLORS.neutral[100],
    secondaryHover: BRAND_COLORS.neutral[200],
    secondaryActive: BRAND_COLORS.neutral[300],
    disabled: BRAND_COLORS.neutral[200],
    disabledText: BRAND_COLORS.neutral[400],
  },

  // State colors
  state: {
    success: BRAND_COLORS.success[500],
    successBg: BRAND_COLORS.success[50],
    warning: BRAND_COLORS.warning[500],
    warningBg: BRAND_COLORS.warning[50],
    error: BRAND_COLORS.error[500],
    errorBg: BRAND_COLORS.error[50],
    info: BRAND_COLORS.primary[500],
    infoBg: BRAND_COLORS.primary[50],
  },
} as const;

// ============ DARK MODE COLORS ============

export const DARK_SEMANTIC_COLORS = {
  background: {
    primary: BRAND_COLORS.neutral[900],
    secondary: BRAND_COLORS.neutral[800],
    tertiary: BRAND_COLORS.neutral[700],
    inverse: BRAND_COLORS.neutral[0],
    brand: BRAND_COLORS.primary[600],
    accent: BRAND_COLORS.accent[600],
  },

  text: {
    primary: BRAND_COLORS.neutral[50],
    secondary: BRAND_COLORS.neutral[300],
    tertiary: BRAND_COLORS.neutral[500],
    inverse: BRAND_COLORS.neutral[900],
    brand: BRAND_COLORS.primary[400],
    link: BRAND_COLORS.primary[400],
    success: BRAND_COLORS.success[400],
    warning: BRAND_COLORS.warning[400],
    error: BRAND_COLORS.error[400],
  },

  border: {
    default: BRAND_COLORS.neutral[700],
    hover: BRAND_COLORS.neutral[600],
    focus: BRAND_COLORS.primary[400],
    error: BRAND_COLORS.error[400],
    success: BRAND_COLORS.success[400],
  },

  interactive: {
    primary: BRAND_COLORS.primary[500],
    primaryHover: BRAND_COLORS.primary[400],
    primaryActive: BRAND_COLORS.primary[300],
    secondary: BRAND_COLORS.neutral[800],
    secondaryHover: BRAND_COLORS.neutral[700],
    secondaryActive: BRAND_COLORS.neutral[600],
    disabled: BRAND_COLORS.neutral[700],
    disabledText: BRAND_COLORS.neutral[500],
  },

  state: {
    success: BRAND_COLORS.success[400],
    successBg: `${BRAND_COLORS.success[500]}20`,
    warning: BRAND_COLORS.warning[400],
    warningBg: `${BRAND_COLORS.warning[500]}20`,
    error: BRAND_COLORS.error[400],
    errorBg: `${BRAND_COLORS.error[500]}20`,
    info: BRAND_COLORS.primary[400],
    infoBg: `${BRAND_COLORS.primary[500]}20`,
  },
} as const;

// ============ GRADIENT PRESETS ============

export const BRAND_GRADIENTS = {
  primary: `linear-gradient(135deg, ${BRAND_COLORS.primary[500]} 0%, ${BRAND_COLORS.secondary[500]} 100%)`,
  accent: `linear-gradient(135deg, ${BRAND_COLORS.accent[400]} 0%, ${BRAND_COLORS.primary[500]} 100%)`,
  vibrant: `linear-gradient(135deg, ${BRAND_COLORS.secondary[500]} 0%, ${BRAND_COLORS.accent[500]} 100%)`,
  sunset: `linear-gradient(135deg, #FF6B6B 0%, #FFE66D 100%)`,
  ocean: `linear-gradient(135deg, ${BRAND_COLORS.primary[400]} 0%, ${BRAND_COLORS.accent[400]} 100%)`,
  night: `linear-gradient(135deg, ${BRAND_COLORS.neutral[800]} 0%, ${BRAND_COLORS.secondary[800]} 100%)`,
  dawn: `linear-gradient(135deg, #FFB7B7 0%, ${BRAND_COLORS.primary[300]} 100%)`,
} as const;

// ============ COLOR UTILITIES ============

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1] || '0', 16),
        g: parseInt(result[2] || '0', 16),
        b: parseInt(result[3] || '0', 16),
      }
    : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function getContrastColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return BRAND_COLORS.neutral[900];

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? BRAND_COLORS.neutral[900] : BRAND_COLORS.neutral[0];
}

export function adjustBrightness(hexColor: string, percent: number): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return hexColor;

  const adjust = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value + (percent / 100) * 255)));

  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

export function withAlpha(hexColor: string, alpha: number): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return hexColor;

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// ============ EXPORT TYPES ============

export type BrandColor = keyof typeof BRAND_COLORS;
export type ColorShade = keyof typeof BRAND_COLORS.primary;
