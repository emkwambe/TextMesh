// =================================
// TEXTMESH TYPOGRAPHY SYSTEM
// Fonts, Sizes & Text Styles
// =================================

// ============ FONT FAMILIES ============

export const FONT_FAMILIES = {
  // Primary font - For body text and UI
  primary: {
    name: 'Inter',
    stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    weights: [400, 500, 600, 700] as const,
  },

  // Display font - For headlines and branding
  display: {
    name: 'Clash Display',
    stack: "'Clash Display', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    weights: [500, 600, 700] as const,
  },

  // Mono font - For code and technical content
  mono: {
    name: 'JetBrains Mono',
    stack: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', monospace",
    weights: [400, 500, 600] as const,
  },
} as const;

// ============ FONT SIZES ============

export const FONT_SIZES = {
  // Display sizes - For large headlines
  '3xl': { size: '3rem', lineHeight: '1.1' },      // 48px
  '2xl': { size: '2.25rem', lineHeight: '1.15' },  // 36px
  xl: { size: '1.875rem', lineHeight: '1.2' },     // 30px

  // Heading sizes
  lg: { size: '1.5rem', lineHeight: '1.25' },      // 24px
  md: { size: '1.25rem', lineHeight: '1.3' },      // 20px
  base: { size: '1rem', lineHeight: '1.5' },       // 16px

  // Body sizes
  sm: { size: '0.875rem', lineHeight: '1.5' },     // 14px
  xs: { size: '0.75rem', lineHeight: '1.5' },      // 12px
  '2xs': { size: '0.625rem', lineHeight: '1.4' },  // 10px
} as const;

// ============ FONT WEIGHTS ============

export const FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// ============ LETTER SPACING ============

export const LETTER_SPACING = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
} as const;

// ============ TEXT STYLES ============

export const TEXT_STYLES = {
  // Display styles - For hero sections and marketing
  displayXl: {
    fontFamily: FONT_FAMILIES.display.stack,
    fontSize: FONT_SIZES['3xl'].size,
    lineHeight: FONT_SIZES['3xl'].lineHeight,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: LETTER_SPACING.tight,
  },
  displayLg: {
    fontFamily: FONT_FAMILIES.display.stack,
    fontSize: FONT_SIZES['2xl'].size,
    lineHeight: FONT_SIZES['2xl'].lineHeight,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: LETTER_SPACING.tight,
  },
  displayMd: {
    fontFamily: FONT_FAMILIES.display.stack,
    fontSize: FONT_SIZES.xl.size,
    lineHeight: FONT_SIZES.xl.lineHeight,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: LETTER_SPACING.tight,
  },

  // Heading styles - For content structure
  h1: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.xl.size,
    lineHeight: FONT_SIZES.xl.lineHeight,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: LETTER_SPACING.tight,
  },
  h2: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.lg.size,
    lineHeight: FONT_SIZES.lg.lineHeight,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: LETTER_SPACING.tight,
  },
  h3: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.md.size,
    lineHeight: FONT_SIZES.md.lineHeight,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: LETTER_SPACING.normal,
  },
  h4: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.base.size,
    lineHeight: FONT_SIZES.base.lineHeight,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: LETTER_SPACING.normal,
  },

  // Body styles - For main content
  bodyLg: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.md.size,
    lineHeight: '1.6',
    fontWeight: FONT_WEIGHTS.regular,
    letterSpacing: LETTER_SPACING.normal,
  },
  body: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.base.size,
    lineHeight: FONT_SIZES.base.lineHeight,
    fontWeight: FONT_WEIGHTS.regular,
    letterSpacing: LETTER_SPACING.normal,
  },
  bodySm: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.sm.size,
    lineHeight: FONT_SIZES.sm.lineHeight,
    fontWeight: FONT_WEIGHTS.regular,
    letterSpacing: LETTER_SPACING.normal,
  },

  // UI styles - For interface elements
  label: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.sm.size,
    lineHeight: FONT_SIZES.sm.lineHeight,
    fontWeight: FONT_WEIGHTS.medium,
    letterSpacing: LETTER_SPACING.normal,
  },
  caption: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.xs.size,
    lineHeight: FONT_SIZES.xs.lineHeight,
    fontWeight: FONT_WEIGHTS.regular,
    letterSpacing: LETTER_SPACING.normal,
  },
  overline: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.xs.size,
    lineHeight: FONT_SIZES.xs.lineHeight,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: LETTER_SPACING.widest,
    textTransform: 'uppercase' as const,
  },
  button: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: FONT_SIZES.sm.size,
    lineHeight: '1',
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: LETTER_SPACING.wide,
  },

  // Special styles
  code: {
    fontFamily: FONT_FAMILIES.mono.stack,
    fontSize: FONT_SIZES.sm.size,
    lineHeight: FONT_SIZES.sm.lineHeight,
    fontWeight: FONT_WEIGHTS.regular,
    letterSpacing: LETTER_SPACING.normal,
  },
  link: {
    fontFamily: FONT_FAMILIES.primary.stack,
    fontSize: 'inherit',
    lineHeight: 'inherit',
    fontWeight: FONT_WEIGHTS.medium,
    letterSpacing: LETTER_SPACING.normal,
    textDecoration: 'underline' as const,
  },
} as const;

// ============ RESPONSIVE TYPOGRAPHY ============

export const RESPONSIVE_SCALES = {
  mobile: {
    displayXl: FONT_SIZES['2xl'].size,
    displayLg: FONT_SIZES.xl.size,
    displayMd: FONT_SIZES.lg.size,
    h1: FONT_SIZES.lg.size,
    h2: FONT_SIZES.md.size,
    h3: FONT_SIZES.base.size,
  },
  tablet: {
    displayXl: FONT_SIZES['2xl'].size,
    displayLg: FONT_SIZES.xl.size,
    displayMd: FONT_SIZES.lg.size,
    h1: FONT_SIZES.xl.size,
    h2: FONT_SIZES.lg.size,
    h3: FONT_SIZES.md.size,
  },
  desktop: {
    displayXl: FONT_SIZES['3xl'].size,
    displayLg: FONT_SIZES['2xl'].size,
    displayMd: FONT_SIZES.xl.size,
    h1: FONT_SIZES.xl.size,
    h2: FONT_SIZES.lg.size,
    h3: FONT_SIZES.md.size,
  },
} as const;

// ============ WEB FONT LOADING ============

export const WEB_FONTS = {
  google: [
    {
      family: 'Inter',
      weights: [400, 500, 600, 700],
      display: 'swap' as const,
    },
    {
      family: 'JetBrains Mono',
      weights: [400, 500, 600],
      display: 'swap' as const,
    },
  ],
  custom: [
    {
      family: 'Clash Display',
      src: [
        { url: '/fonts/ClashDisplay-Medium.woff2', format: 'woff2' },
        { url: '/fonts/ClashDisplay-Semibold.woff2', format: 'woff2' },
        { url: '/fonts/ClashDisplay-Bold.woff2', format: 'woff2' },
      ],
      weights: [500, 600, 700],
    },
  ],
};

// ============ FONT FACE CSS GENERATOR ============

export function generateFontFaceCSS(): string {
  const fontFaces: string[] = [];

  for (const font of WEB_FONTS.custom) {
    for (let i = 0; i < font.weights.length; i++) {
      const weight = font.weights[i];
      const src = font.src[i];
      if (!src) continue;

      fontFaces.push(`
@font-face {
  font-family: '${font.family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('${src.url}') format('${src.format}');
}`);
    }
  }

  return fontFaces.join('\n');
}

// ============ GOOGLE FONTS URL GENERATOR ============

export function generateGoogleFontsURL(): string {
  const families = WEB_FONTS.google
    .map((font) => {
      const weights = font.weights.join(';');
      return `family=${font.family.replace(' ', '+')}:wght@${weights}`;
    })
    .join('&');

  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

// ============ EXPORT TYPES ============

export type TextStyle = keyof typeof TEXT_STYLES;
export type FontSize = keyof typeof FONT_SIZES;
export type FontWeight = keyof typeof FONT_WEIGHTS;
