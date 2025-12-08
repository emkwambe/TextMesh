// =================================
// TEXTMESH SPACING SYSTEM
// Layout & Spacing Tokens
// =================================

// ============ BASE SPACING UNIT ============

export const SPACING_UNIT = 4; // 4px base unit

// ============ SPACING SCALE ============

export const SPACING = {
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
  36: '9rem',       // 144px
  40: '10rem',      // 160px
  44: '11rem',      // 176px
  48: '12rem',      // 192px
  52: '13rem',      // 208px
  56: '14rem',      // 224px
  60: '15rem',      // 240px
  64: '16rem',      // 256px
  72: '18rem',      // 288px
  80: '20rem',      // 320px
  96: '24rem',      // 384px
} as const;

// ============ SEMANTIC SPACING ============

export const SEMANTIC_SPACING = {
  // Component spacing
  component: {
    xxs: SPACING[1],   // 4px - Tiny gaps
    xs: SPACING[2],    // 8px - Small gaps
    sm: SPACING[3],    // 12px - Default small
    md: SPACING[4],    // 16px - Default medium
    lg: SPACING[6],    // 24px - Default large
    xl: SPACING[8],    // 32px - Extra large
    '2xl': SPACING[12], // 48px - Very large
  },

  // Section spacing
  section: {
    sm: SPACING[12],   // 48px
    md: SPACING[16],   // 64px
    lg: SPACING[24],   // 96px
    xl: SPACING[32],   // 128px
  },

  // Page padding
  page: {
    mobile: SPACING[4],   // 16px
    tablet: SPACING[6],   // 24px
    desktop: SPACING[8],  // 32px
  },

  // Container max widths
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
    full: '100%',
  },

  // Content max width
  content: {
    prose: '65ch',
    narrow: '540px',
    default: '720px',
    wide: '1024px',
  },
} as const;

// ============ BORDER RADIUS ============

export const BORDER_RADIUS = {
  none: '0',
  xs: '0.125rem',    // 2px
  sm: '0.25rem',     // 4px
  md: '0.375rem',    // 6px
  lg: '0.5rem',      // 8px
  xl: '0.75rem',     // 12px
  '2xl': '1rem',     // 16px
  '3xl': '1.5rem',   // 24px
  full: '9999px',
} as const;

// ============ SHADOWS ============

export const SHADOWS = {
  none: 'none',
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',

  // Colored shadows
  primary: '0 10px 20px -3px rgba(0, 102, 255, 0.3)',
  secondary: '0 10px 20px -3px rgba(135, 25, 255, 0.3)',
  accent: '0 10px 20px -3px rgba(0, 212, 237, 0.3)',
} as const;

// ============ Z-INDEX ============

export const Z_INDEX = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
} as const;

// ============ BREAKPOINTS ============

export const BREAKPOINTS = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const BREAKPOINT_VALUES = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// ============ ASPECT RATIOS ============

export const ASPECT_RATIOS = {
  square: '1 / 1',
  video: '16 / 9',
  portrait: '4 / 5',
  story: '9 / 16',
  wide: '21 / 9',
  golden: '1.618 / 1',
} as const;

// ============ TRANSITIONS ============

export const TRANSITIONS = {
  // Durations
  duration: {
    instant: '0ms',
    fast: '100ms',
    normal: '200ms',
    slow: '300ms',
    slower: '400ms',
    slowest: '500ms',
  },

  // Easings
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    // Custom curves
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },

  // Presets
  presets: {
    default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    fast: 'all 100ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    colors: 'color 200ms, background-color 200ms, border-color 200ms',
    opacity: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    shadow: 'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// ============ ANIMATIONS ============

export const ANIMATIONS = {
  spin: 'spin 1s linear infinite',
  ping: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
  pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  bounce: 'bounce 1s infinite',
  fadeIn: 'fadeIn 200ms ease-out',
  fadeOut: 'fadeOut 200ms ease-in',
  slideUp: 'slideUp 300ms ease-out',
  slideDown: 'slideDown 300ms ease-out',
  scaleIn: 'scaleIn 200ms ease-out',
  shimmer: 'shimmer 2s linear infinite',
} as const;

export const KEYFRAMES = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes bounce {
  0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); }
  50% { transform: translateY(0); animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes slideDown {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

// ============ EXPORT TYPES ============

export type SpacingKey = keyof typeof SPACING;
export type BorderRadiusKey = keyof typeof BORDER_RADIUS;
export type ShadowKey = keyof typeof SHADOWS;
export type BreakpointKey = keyof typeof BREAKPOINTS;
export type ZIndexKey = keyof typeof Z_INDEX;
