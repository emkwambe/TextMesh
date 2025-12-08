// =================================
// TEXTMESH THEME SYSTEM
// Light & Dark Theme Configurations
// =================================

import { BRAND_COLORS, SEMANTIC_COLORS, DARK_SEMANTIC_COLORS } from './colors';
import { FONT_FAMILIES, TEXT_STYLES } from './typography';
import { SPACING, BORDER_RADIUS, SHADOWS, TRANSITIONS, Z_INDEX, BREAKPOINTS } from './spacing';
import {
  BUTTON_VARIANTS,
  BUTTON_SIZES,
  INPUT_STYLES,
  CARD_STYLES,
  DARK_BUTTON_VARIANTS,
  DARK_INPUT_STYLES,
  DARK_CARD_STYLES,
} from './components';

// ============ THEME TYPES ============

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  name: string;
  mode: ThemeMode;
  colors: typeof SEMANTIC_COLORS;
  brandColors: typeof BRAND_COLORS;
  typography: {
    fonts: typeof FONT_FAMILIES;
    styles: typeof TEXT_STYLES;
  };
  spacing: typeof SPACING;
  borderRadius: typeof BORDER_RADIUS;
  shadows: typeof SHADOWS;
  transitions: typeof TRANSITIONS;
  zIndex: typeof Z_INDEX;
  breakpoints: typeof BREAKPOINTS;
  components: {
    button: {
      variants: typeof BUTTON_VARIANTS;
      sizes: typeof BUTTON_SIZES;
    };
    input: typeof INPUT_STYLES;
    card: typeof CARD_STYLES;
  };
}

// ============ LIGHT THEME ============

export const lightTheme: Theme = {
  name: 'TextMesh Light',
  mode: 'light',
  colors: SEMANTIC_COLORS,
  brandColors: BRAND_COLORS,
  typography: {
    fonts: FONT_FAMILIES,
    styles: TEXT_STYLES,
  },
  spacing: SPACING,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
  transitions: TRANSITIONS,
  zIndex: Z_INDEX,
  breakpoints: BREAKPOINTS,
  components: {
    button: {
      variants: BUTTON_VARIANTS,
      sizes: BUTTON_SIZES,
    },
    input: INPUT_STYLES,
    card: CARD_STYLES,
  },
};

// ============ DARK THEME ============

export const darkTheme: Theme = {
  name: 'TextMesh Dark',
  mode: 'dark',
  colors: DARK_SEMANTIC_COLORS,
  brandColors: BRAND_COLORS,
  typography: {
    fonts: FONT_FAMILIES,
    styles: TEXT_STYLES,
  },
  spacing: SPACING,
  borderRadius: BORDER_RADIUS,
  shadows: {
    ...SHADOWS,
    // Adjusted shadows for dark mode
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.3)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.5)',
    primary: '0 10px 20px -3px rgba(0, 102, 255, 0.4)',
    secondary: '0 10px 20px -3px rgba(135, 25, 255, 0.4)',
    accent: '0 10px 20px -3px rgba(0, 212, 237, 0.4)',
  },
  transitions: TRANSITIONS,
  zIndex: Z_INDEX,
  breakpoints: BREAKPOINTS,
  components: {
    button: {
      variants: { ...BUTTON_VARIANTS, ...DARK_BUTTON_VARIANTS } as typeof BUTTON_VARIANTS,
      sizes: BUTTON_SIZES,
    },
    input: { ...INPUT_STYLES, default: { ...INPUT_STYLES.default, ...DARK_INPUT_STYLES } },
    card: { ...CARD_STYLES, ...DARK_CARD_STYLES } as typeof CARD_STYLES,
  },
};

// ============ CSS VARIABLE GENERATORS ============

export function generateCSSVariables(theme: Theme): string {
  const vars: string[] = [];

  // Color variables
  Object.entries(theme.brandColors).forEach(([colorName, shades]) => {
    if (typeof shades === 'object') {
      Object.entries(shades).forEach(([shade, value]) => {
        vars.push(`  --color-${colorName}-${shade}: ${value};`);
      });
    }
  });

  // Semantic color variables
  const flattenColors = (obj: Record<string, unknown>, prefix: string) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        vars.push(`  --${prefix}-${key}: ${value};`);
      } else if (typeof value === 'object' && value !== null) {
        flattenColors(value as Record<string, unknown>, `${prefix}-${key}`);
      }
    });
  };

  flattenColors(theme.colors as unknown as Record<string, unknown>, 'color');

  // Spacing variables
  Object.entries(theme.spacing).forEach(([key, value]) => {
    vars.push(`  --spacing-${key}: ${value};`);
  });

  // Border radius variables
  Object.entries(theme.borderRadius).forEach(([key, value]) => {
    vars.push(`  --radius-${key}: ${value};`);
  });

  // Shadow variables
  Object.entries(theme.shadows).forEach(([key, value]) => {
    vars.push(`  --shadow-${key}: ${value};`);
  });

  // Font variables
  vars.push(`  --font-primary: ${theme.typography.fonts.primary.stack};`);
  vars.push(`  --font-display: ${theme.typography.fonts.display.stack};`);
  vars.push(`  --font-mono: ${theme.typography.fonts.mono.stack};`);

  // Transition variables
  Object.entries(theme.transitions.duration).forEach(([key, value]) => {
    vars.push(`  --duration-${key}: ${value};`);
  });

  Object.entries(theme.transitions.easing).forEach(([key, value]) => {
    vars.push(`  --easing-${key}: ${value};`);
  });

  // Z-index variables
  Object.entries(theme.zIndex).forEach(([key, value]) => {
    vars.push(`  --z-${key}: ${value};`);
  });

  return `:root {\n${vars.join('\n')}\n}`;
}

export function generateDarkModeCSSVariables(theme: Theme): string {
  const vars: string[] = [];

  // Only override semantic colors for dark mode
  const flattenColors = (obj: Record<string, unknown>, prefix: string) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        vars.push(`  --${prefix}-${key}: ${value};`);
      } else if (typeof value === 'object' && value !== null) {
        flattenColors(value as Record<string, unknown>, `${prefix}-${key}`);
      }
    });
  };

  flattenColors(theme.colors as unknown as Record<string, unknown>, 'color');

  // Override shadows for dark mode
  Object.entries(theme.shadows).forEach(([key, value]) => {
    vars.push(`  --shadow-${key}: ${value};`);
  });

  return `@media (prefers-color-scheme: dark) {\n  :root {\n${vars.join('\n')}\n  }\n}\n\n[data-theme="dark"] {\n${vars.join('\n')}\n}`;
}

// ============ TAILWIND CONFIG GENERATOR ============

export function generateTailwindConfig(): object {
  return {
    colors: {
      primary: Object.fromEntries(
        Object.entries(BRAND_COLORS.primary).map(([k, v]) => [k, v])
      ),
      secondary: Object.fromEntries(
        Object.entries(BRAND_COLORS.secondary).map(([k, v]) => [k, v])
      ),
      accent: Object.fromEntries(
        Object.entries(BRAND_COLORS.accent).map(([k, v]) => [k, v])
      ),
      success: Object.fromEntries(
        Object.entries(BRAND_COLORS.success).map(([k, v]) => [k, v])
      ),
      warning: Object.fromEntries(
        Object.entries(BRAND_COLORS.warning).map(([k, v]) => [k, v])
      ),
      error: Object.fromEntries(
        Object.entries(BRAND_COLORS.error).map(([k, v]) => [k, v])
      ),
      neutral: Object.fromEntries(
        Object.entries(BRAND_COLORS.neutral).map(([k, v]) => [k, v])
      ),
    },
    fontFamily: {
      sans: FONT_FAMILIES.primary.stack,
      display: FONT_FAMILIES.display.stack,
      mono: FONT_FAMILIES.mono.stack,
    },
    spacing: Object.fromEntries(
      Object.entries(SPACING).map(([k, v]) => [k, v])
    ),
    borderRadius: Object.fromEntries(
      Object.entries(BORDER_RADIUS).map(([k, v]) => [k, v])
    ),
    boxShadow: Object.fromEntries(
      Object.entries(SHADOWS).map(([k, v]) => [k, v])
    ),
    screens: Object.fromEntries(
      Object.entries(BREAKPOINTS).map(([k, v]) => [k, v])
    ),
    zIndex: Object.fromEntries(
      Object.entries(Z_INDEX).map(([k, v]) => [k, String(v)])
    ),
  };
}

// ============ THEME CONTEXT TYPES ============

export interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

// ============ THEME UTILITIES ============

export function getSystemThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getEffectiveTheme(mode: ThemeMode): Theme {
  if (mode === 'system') {
    const systemMode = getSystemThemeMode();
    return systemMode === 'dark' ? darkTheme : lightTheme;
  }
  return mode === 'dark' ? darkTheme : lightTheme;
}

// ============ EXPORTS ============

export { SEMANTIC_COLORS, DARK_SEMANTIC_COLORS };
