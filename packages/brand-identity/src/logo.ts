// =================================
// TEXTMESH LOGO SYSTEM
// Logo Variations & Generation
// =================================

import { BRAND_COLORS } from './colors';

// ============ LOGO TYPES ============

export interface LogoConfig {
  variant: LogoVariant;
  color: LogoColor;
  size: LogoSize;
  background?: boolean;
}

export type LogoVariant = 'full' | 'compact' | 'icon' | 'wordmark';
export type LogoColor = 'primary' | 'white' | 'black' | 'gradient';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// ============ LOGO DIMENSIONS ============

export const LOGO_SIZES: Record<LogoSize, { width: number; height: number }> = {
  xs: { width: 24, height: 24 },
  sm: { width: 32, height: 32 },
  md: { width: 48, height: 48 },
  lg: { width: 64, height: 64 },
  xl: { width: 96, height: 96 },
  '2xl': { width: 128, height: 128 },
};

export const WORDMARK_SIZES: Record<LogoSize, { width: number; height: number }> = {
  xs: { width: 80, height: 16 },
  sm: { width: 100, height: 20 },
  md: { width: 140, height: 28 },
  lg: { width: 180, height: 36 },
  xl: { width: 240, height: 48 },
  '2xl': { width: 320, height: 64 },
};

export const FULL_LOGO_SIZES: Record<LogoSize, { width: number; height: number }> = {
  xs: { width: 120, height: 28 },
  sm: { width: 160, height: 36 },
  md: { width: 200, height: 44 },
  lg: { width: 260, height: 56 },
  xl: { width: 340, height: 72 },
  '2xl': { width: 440, height: 92 },
};

// ============ LOGO COLORS ============

export const LOGO_COLORS: Record<LogoColor, { primary: string; secondary: string }> = {
  primary: {
    primary: BRAND_COLORS.primary[500],
    secondary: BRAND_COLORS.secondary[500],
  },
  white: {
    primary: '#FFFFFF',
    secondary: '#FFFFFF',
  },
  black: {
    primary: BRAND_COLORS.neutral[900],
    secondary: BRAND_COLORS.neutral[900],
  },
  gradient: {
    primary: `url(#textmesh-gradient)`,
    secondary: `url(#textmesh-gradient)`,
  },
};

// ============ SVG LOGO GENERATORS ============

/**
 * Generate the TextMesh icon SVG
 * The icon is a stylized "T" with mesh/grid pattern
 */
export function generateLogoIconSVG(config: LogoConfig): string {
  const size = LOGO_SIZES[config.size];
  const colors = LOGO_COLORS[config.color];

  const gradientDef =
    config.color === 'gradient'
      ? `
    <defs>
      <linearGradient id="textmesh-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND_COLORS.primary[500]}" />
        <stop offset="100%" stop-color="${BRAND_COLORS.secondary[500]}" />
      </linearGradient>
    </defs>`
      : '';

  const bgRect = config.background
    ? `<rect width="${size.width}" height="${size.height}" rx="${size.width * 0.2}" fill="${BRAND_COLORS.neutral[900]}" />`
    : '';

  return `<svg width="${size.width}" height="${size.height}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${gradientDef}
  ${bgRect}
  <!-- Main T shape -->
  <path d="M8 8H40V16H28V40H20V16H8V8Z" fill="${colors.primary}" />
  <!-- Mesh pattern overlay -->
  <g opacity="0.3">
    <line x1="14" y1="8" x2="14" y2="16" stroke="${colors.secondary}" stroke-width="1" />
    <line x1="24" y1="8" x2="24" y2="40" stroke="${colors.secondary}" stroke-width="1" />
    <line x1="34" y1="8" x2="34" y2="16" stroke="${colors.secondary}" stroke-width="1" />
    <line x1="8" y1="12" x2="40" y2="12" stroke="${colors.secondary}" stroke-width="1" />
    <line x1="20" y1="24" x2="28" y2="24" stroke="${colors.secondary}" stroke-width="1" />
    <line x1="20" y1="32" x2="28" y2="32" stroke="${colors.secondary}" stroke-width="1" />
  </g>
  <!-- Corner accent dots -->
  <circle cx="8" cy="8" r="2" fill="${colors.secondary}" />
  <circle cx="40" cy="8" r="2" fill="${colors.secondary}" />
  <circle cx="24" cy="40" r="2" fill="${colors.secondary}" />
</svg>`;
}

/**
 * Generate the TextMesh wordmark SVG
 */
export function generateWordmarkSVG(config: LogoConfig): string {
  const size = WORDMARK_SIZES[config.size];
  const colors = LOGO_COLORS[config.color];

  const gradientDef =
    config.color === 'gradient'
      ? `
    <defs>
      <linearGradient id="textmesh-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND_COLORS.primary[500]}" />
        <stop offset="100%" stop-color="${BRAND_COLORS.secondary[500]}" />
      </linearGradient>
    </defs>`
      : '';

  return `<svg width="${size.width}" height="${size.height}" viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${gradientDef}
  <text x="0" y="32" font-family="'Clash Display', sans-serif" font-size="32" font-weight="700" fill="${colors.primary}">
    Text<tspan fill="${colors.secondary}">Mesh</tspan>
  </text>
</svg>`;
}

/**
 * Generate the full logo (icon + wordmark) SVG
 */
export function generateFullLogoSVG(config: LogoConfig): string {
  const size = FULL_LOGO_SIZES[config.size];
  const colors = LOGO_COLORS[config.color];

  const gradientDef =
    config.color === 'gradient'
      ? `
    <defs>
      <linearGradient id="textmesh-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND_COLORS.primary[500]}" />
        <stop offset="100%" stop-color="${BRAND_COLORS.secondary[500]}" />
      </linearGradient>
    </defs>`
      : '';

  const bgRect = config.background
    ? `<rect width="${size.width}" height="${size.height}" rx="8" fill="${BRAND_COLORS.neutral[900]}" />`
    : '';

  return `<svg width="${size.width}" height="${size.height}" viewBox="0 0 320 72" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${gradientDef}
  ${bgRect}
  <!-- Icon -->
  <g transform="translate(8, 8)">
    <path d="M4 4H52V14H32V52H24V14H4V4Z" fill="${colors.primary}" />
    <g opacity="0.3">
      <line x1="14" y1="4" x2="14" y2="14" stroke="${colors.secondary}" stroke-width="1" />
      <line x1="28" y1="4" x2="28" y2="52" stroke="${colors.secondary}" stroke-width="1" />
      <line x1="42" y1="4" x2="42" y2="14" stroke="${colors.secondary}" stroke-width="1" />
    </g>
    <circle cx="4" cy="4" r="2" fill="${colors.secondary}" />
    <circle cx="52" cy="4" r="2" fill="${colors.secondary}" />
    <circle cx="28" cy="52" r="2" fill="${colors.secondary}" />
  </g>
  <!-- Wordmark -->
  <text x="76" y="48" font-family="'Clash Display', sans-serif" font-size="40" font-weight="700" fill="${colors.primary}">
    Text<tspan fill="${colors.secondary}">Mesh</tspan>
  </text>
</svg>`;
}

/**
 * Generate the compact logo SVG (icon with small text below)
 */
export function generateCompactLogoSVG(config: LogoConfig): string {
  const size = { width: config.size === 'xs' ? 40 : config.size === 'sm' ? 56 : 72, height: config.size === 'xs' ? 48 : config.size === 'sm' ? 68 : 88 };
  const colors = LOGO_COLORS[config.color];

  const gradientDef =
    config.color === 'gradient'
      ? `
    <defs>
      <linearGradient id="textmesh-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${BRAND_COLORS.primary[500]}" />
        <stop offset="100%" stop-color="${BRAND_COLORS.secondary[500]}" />
      </linearGradient>
    </defs>`
      : '';

  return `<svg width="${size.width}" height="${size.height}" viewBox="0 0 72 88" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${gradientDef}
  <!-- Icon -->
  <g transform="translate(8, 4)">
    <path d="M4 4H52V14H32V52H24V14H4V4Z" fill="${colors.primary}" />
    <g opacity="0.3">
      <line x1="14" y1="4" x2="14" y2="14" stroke="${colors.secondary}" stroke-width="1" />
      <line x1="28" y1="4" x2="28" y2="52" stroke="${colors.secondary}" stroke-width="1" />
      <line x1="42" y1="4" x2="42" y2="14" stroke="${colors.secondary}" stroke-width="1" />
    </g>
    <circle cx="4" cy="4" r="2" fill="${colors.secondary}" />
    <circle cx="52" cy="4" r="2" fill="${colors.secondary}" />
    <circle cx="28" cy="52" r="2" fill="${colors.secondary}" />
  </g>
  <!-- Text -->
  <text x="36" y="78" text-anchor="middle" font-family="'Clash Display', sans-serif" font-size="12" font-weight="600" fill="${colors.primary}">
    TM
  </text>
</svg>`;
}

// ============ LOGO GENERATION FUNCTION ============

export function generateLogo(config: LogoConfig): string {
  switch (config.variant) {
    case 'icon':
      return generateLogoIconSVG(config);
    case 'wordmark':
      return generateWordmarkSVG(config);
    case 'full':
      return generateFullLogoSVG(config);
    case 'compact':
      return generateCompactLogoSVG(config);
    default:
      return generateFullLogoSVG(config);
  }
}

// ============ LOGO USAGE GUIDELINES ============

export const LOGO_GUIDELINES = {
  minimumSize: {
    icon: 24,
    wordmark: 80,
    full: 120,
  },
  clearSpace: {
    description: 'Maintain clear space around the logo equal to the height of the T letter',
    ratio: 0.5,
  },
  backgrounds: {
    light: ['primary', 'gradient', 'black'] as LogoColor[],
    dark: ['white', 'gradient', 'primary'] as LogoColor[],
  },
  donts: [
    'Do not rotate the logo',
    'Do not stretch or distort the logo',
    'Do not add effects like drop shadows',
    'Do not use unapproved colors',
    'Do not place on busy backgrounds',
    'Do not recreate with different fonts',
  ],
};

// ============ FAVICON GENERATOR ============

export function generateFaviconSVG(): string {
  return `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="6" fill="${BRAND_COLORS.primary[500]}" />
  <path d="M6 8H26V12H18V24H14V12H6V8Z" fill="white" />
  <g opacity="0.4">
    <line x1="10" y1="8" x2="10" y2="12" stroke="white" stroke-width="0.75" />
    <line x1="16" y1="8" x2="16" y2="24" stroke="white" stroke-width="0.75" />
    <line x1="22" y1="8" x2="22" y2="12" stroke="white" stroke-width="0.75" />
  </g>
  <circle cx="6" cy="8" r="1.5" fill="${BRAND_COLORS.accent[400]}" />
  <circle cx="26" cy="8" r="1.5" fill="${BRAND_COLORS.secondary[400]}" />
</svg>`;
}

// ============ APP ICON GENERATOR ============

export function generateAppIconSVG(size: number = 1024): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_COLORS.primary[500]}" />
      <stop offset="100%" stop-color="${BRAND_COLORS.secondary[500]}" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#icon-gradient)" />

  <!-- Main T shape -->
  <path d="M192 256H832V384H576V768H448V384H192V256Z" fill="white" />

  <!-- Mesh pattern -->
  <g opacity="0.3">
    <line x1="320" y1="256" x2="320" y2="384" stroke="white" stroke-width="6" />
    <line x1="512" y1="256" x2="512" y2="768" stroke="white" stroke-width="6" />
    <line x1="704" y1="256" x2="704" y2="384" stroke="white" stroke-width="6" />
    <line x1="192" y1="320" x2="832" y2="320" stroke="white" stroke-width="6" />
    <line x1="448" y1="512" x2="576" y2="512" stroke="white" stroke-width="6" />
    <line x1="448" y1="640" x2="576" y2="640" stroke="white" stroke-width="6" />
  </g>

  <!-- Accent dots -->
  <circle cx="192" cy="256" r="24" fill="${BRAND_COLORS.accent[400]}" />
  <circle cx="832" cy="256" r="24" fill="${BRAND_COLORS.accent[400]}" />
  <circle cx="512" cy="768" r="24" fill="${BRAND_COLORS.accent[400]}" />
</svg>`;
}
