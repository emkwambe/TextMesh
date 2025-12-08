// =================================
// TEXTMESH COMPONENT STYLES
// Common Component Design Tokens
// =================================

import { BRAND_COLORS, SEMANTIC_COLORS, DARK_SEMANTIC_COLORS } from './colors';
import { TEXT_STYLES } from './typography';
import { SPACING, BORDER_RADIUS, SHADOWS, TRANSITIONS } from './spacing';

// ============ BUTTON STYLES ============

export const BUTTON_VARIANTS = {
  primary: {
    background: SEMANTIC_COLORS.interactive.primary,
    backgroundHover: SEMANTIC_COLORS.interactive.primaryHover,
    backgroundActive: SEMANTIC_COLORS.interactive.primaryActive,
    text: BRAND_COLORS.neutral[0],
    border: 'transparent',
    shadow: SHADOWS.sm,
    shadowHover: SHADOWS.primary,
  },
  secondary: {
    background: SEMANTIC_COLORS.interactive.secondary,
    backgroundHover: SEMANTIC_COLORS.interactive.secondaryHover,
    backgroundActive: SEMANTIC_COLORS.interactive.secondaryActive,
    text: SEMANTIC_COLORS.text.primary,
    border: SEMANTIC_COLORS.border.default,
    shadow: SHADOWS.xs,
    shadowHover: SHADOWS.sm,
  },
  outline: {
    background: 'transparent',
    backgroundHover: BRAND_COLORS.primary[50],
    backgroundActive: BRAND_COLORS.primary[100],
    text: BRAND_COLORS.primary[600],
    border: BRAND_COLORS.primary[500],
    shadow: 'none',
    shadowHover: 'none',
  },
  ghost: {
    background: 'transparent',
    backgroundHover: BRAND_COLORS.neutral[100],
    backgroundActive: BRAND_COLORS.neutral[200],
    text: SEMANTIC_COLORS.text.primary,
    border: 'transparent',
    shadow: 'none',
    shadowHover: 'none',
  },
  danger: {
    background: BRAND_COLORS.error[500],
    backgroundHover: BRAND_COLORS.error[600],
    backgroundActive: BRAND_COLORS.error[700],
    text: BRAND_COLORS.neutral[0],
    border: 'transparent',
    shadow: SHADOWS.sm,
    shadowHover: SHADOWS.md,
  },
} as const;

export const BUTTON_SIZES = {
  xs: {
    padding: `${SPACING[1.5]} ${SPACING[3]}`,
    fontSize: TEXT_STYLES.caption.fontSize,
    height: '28px',
    borderRadius: BORDER_RADIUS.md,
    iconSize: '14px',
  },
  sm: {
    padding: `${SPACING[2]} ${SPACING[4]}`,
    fontSize: TEXT_STYLES.bodySm.fontSize,
    height: '36px',
    borderRadius: BORDER_RADIUS.lg,
    iconSize: '16px',
  },
  md: {
    padding: `${SPACING[2.5]} ${SPACING[5]}`,
    fontSize: TEXT_STYLES.button.fontSize,
    height: '44px',
    borderRadius: BORDER_RADIUS.lg,
    iconSize: '18px',
  },
  lg: {
    padding: `${SPACING[3]} ${SPACING[6]}`,
    fontSize: TEXT_STYLES.body.fontSize,
    height: '52px',
    borderRadius: BORDER_RADIUS.xl,
    iconSize: '20px',
  },
} as const;

// ============ INPUT STYLES ============

export const INPUT_STYLES = {
  default: {
    background: BRAND_COLORS.neutral[0],
    border: SEMANTIC_COLORS.border.default,
    borderFocus: SEMANTIC_COLORS.border.focus,
    borderError: SEMANTIC_COLORS.border.error,
    text: SEMANTIC_COLORS.text.primary,
    placeholder: SEMANTIC_COLORS.text.tertiary,
    shadow: SHADOWS.xs,
    shadowFocus: `0 0 0 3px ${BRAND_COLORS.primary[100]}`,
  },
  sizes: {
    sm: {
      padding: `${SPACING[2]} ${SPACING[3]}`,
      fontSize: TEXT_STYLES.bodySm.fontSize,
      height: '36px',
      borderRadius: BORDER_RADIUS.md,
    },
    md: {
      padding: `${SPACING[2.5]} ${SPACING[4]}`,
      fontSize: TEXT_STYLES.body.fontSize,
      height: '44px',
      borderRadius: BORDER_RADIUS.lg,
    },
    lg: {
      padding: `${SPACING[3]} ${SPACING[5]}`,
      fontSize: TEXT_STYLES.bodyLg.fontSize,
      height: '52px',
      borderRadius: BORDER_RADIUS.lg,
    },
  },
} as const;

// ============ CARD STYLES ============

export const CARD_STYLES = {
  default: {
    background: BRAND_COLORS.neutral[0],
    border: SEMANTIC_COLORS.border.default,
    borderRadius: BORDER_RADIUS.xl,
    shadow: SHADOWS.sm,
    shadowHover: SHADOWS.md,
    padding: SPACING[6],
  },
  elevated: {
    background: BRAND_COLORS.neutral[0],
    border: 'transparent',
    borderRadius: BORDER_RADIUS['2xl'],
    shadow: SHADOWS.lg,
    shadowHover: SHADOWS.xl,
    padding: SPACING[8],
  },
  outlined: {
    background: 'transparent',
    border: SEMANTIC_COLORS.border.default,
    borderRadius: BORDER_RADIUS.xl,
    shadow: 'none',
    shadowHover: SHADOWS.sm,
    padding: SPACING[6],
  },
  filled: {
    background: BRAND_COLORS.neutral[50],
    border: 'transparent',
    borderRadius: BORDER_RADIUS.xl,
    shadow: 'none',
    shadowHover: 'none',
    padding: SPACING[6],
  },
} as const;

// ============ AVATAR STYLES ============

export const AVATAR_SIZES = {
  xs: { size: '24px', fontSize: '10px', border: '1px' },
  sm: { size: '32px', fontSize: '12px', border: '2px' },
  md: { size: '40px', fontSize: '14px', border: '2px' },
  lg: { size: '56px', fontSize: '18px', border: '3px' },
  xl: { size: '80px', fontSize: '24px', border: '3px' },
  '2xl': { size: '120px', fontSize: '36px', border: '4px' },
} as const;

export const AVATAR_COLORS = [
  BRAND_COLORS.primary[500],
  BRAND_COLORS.secondary[500],
  BRAND_COLORS.accent[500],
  BRAND_COLORS.success[500],
  BRAND_COLORS.warning[500],
  BRAND_COLORS.error[400],
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
] as const;

// ============ BADGE STYLES ============

export const BADGE_VARIANTS = {
  primary: {
    background: BRAND_COLORS.primary[500],
    text: BRAND_COLORS.neutral[0],
  },
  secondary: {
    background: BRAND_COLORS.neutral[200],
    text: BRAND_COLORS.neutral[700],
  },
  success: {
    background: BRAND_COLORS.success[100],
    text: BRAND_COLORS.success[700],
  },
  warning: {
    background: BRAND_COLORS.warning[100],
    text: BRAND_COLORS.warning[700],
  },
  error: {
    background: BRAND_COLORS.error[100],
    text: BRAND_COLORS.error[700],
  },
  info: {
    background: BRAND_COLORS.primary[100],
    text: BRAND_COLORS.primary[700],
  },
} as const;

export const BADGE_SIZES = {
  sm: {
    padding: `${SPACING[0.5]} ${SPACING[2]}`,
    fontSize: '10px',
    borderRadius: BORDER_RADIUS.sm,
  },
  md: {
    padding: `${SPACING[1]} ${SPACING[2.5]}`,
    fontSize: '12px',
    borderRadius: BORDER_RADIUS.md,
  },
  lg: {
    padding: `${SPACING[1.5]} ${SPACING[3]}`,
    fontSize: '14px',
    borderRadius: BORDER_RADIUS.md,
  },
} as const;

// ============ TOAST STYLES ============

export const TOAST_VARIANTS = {
  success: {
    background: BRAND_COLORS.success[50],
    border: BRAND_COLORS.success[200],
    text: BRAND_COLORS.success[800],
    icon: BRAND_COLORS.success[500],
  },
  error: {
    background: BRAND_COLORS.error[50],
    border: BRAND_COLORS.error[200],
    text: BRAND_COLORS.error[800],
    icon: BRAND_COLORS.error[500],
  },
  warning: {
    background: BRAND_COLORS.warning[50],
    border: BRAND_COLORS.warning[200],
    text: BRAND_COLORS.warning[800],
    icon: BRAND_COLORS.warning[500],
  },
  info: {
    background: BRAND_COLORS.primary[50],
    border: BRAND_COLORS.primary[200],
    text: BRAND_COLORS.primary[800],
    icon: BRAND_COLORS.primary[500],
  },
} as const;

// ============ TAB STYLES ============

export const TAB_STYLES = {
  underline: {
    tabGap: SPACING[1],
    indicatorHeight: '2px',
    indicatorColor: BRAND_COLORS.primary[500],
    activeText: BRAND_COLORS.primary[600],
    inactiveText: BRAND_COLORS.neutral[500],
    hoverText: BRAND_COLORS.neutral[700],
    padding: `${SPACING[3]} ${SPACING[4]}`,
  },
  pills: {
    tabGap: SPACING[2],
    activeBackground: BRAND_COLORS.primary[500],
    activeText: BRAND_COLORS.neutral[0],
    inactiveBackground: 'transparent',
    inactiveText: BRAND_COLORS.neutral[600],
    hoverBackground: BRAND_COLORS.neutral[100],
    padding: `${SPACING[2]} ${SPACING[4]}`,
    borderRadius: BORDER_RADIUS.lg,
  },
  segment: {
    tabGap: '0',
    containerBackground: BRAND_COLORS.neutral[100],
    containerBorderRadius: BORDER_RADIUS.lg,
    activeBackground: BRAND_COLORS.neutral[0],
    activeText: BRAND_COLORS.neutral[900],
    inactiveText: BRAND_COLORS.neutral[600],
    padding: `${SPACING[2]} ${SPACING[4]}`,
    borderRadius: BORDER_RADIUS.md,
  },
} as const;

// ============ MODAL STYLES ============

export const MODAL_STYLES = {
  overlay: {
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
  },
  container: {
    background: BRAND_COLORS.neutral[0],
    borderRadius: BORDER_RADIUS['2xl'],
    shadow: SHADOWS['2xl'],
    maxWidth: {
      sm: '400px',
      md: '500px',
      lg: '640px',
      xl: '800px',
      full: '100%',
    },
    padding: {
      header: SPACING[6],
      body: SPACING[6],
      footer: SPACING[4],
    },
  },
} as const;

// ============ SKELETON STYLES ============

export const SKELETON_STYLES = {
  baseColor: BRAND_COLORS.neutral[200],
  highlightColor: BRAND_COLORS.neutral[100],
  animation: `
    background: linear-gradient(
      90deg,
      ${BRAND_COLORS.neutral[200]} 25%,
      ${BRAND_COLORS.neutral[100]} 50%,
      ${BRAND_COLORS.neutral[200]} 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  `,
  borderRadius: BORDER_RADIUS.md,
} as const;

// ============ TOOLTIP STYLES ============

export const TOOLTIP_STYLES = {
  background: BRAND_COLORS.neutral[900],
  text: BRAND_COLORS.neutral[0],
  fontSize: TEXT_STYLES.caption.fontSize,
  padding: `${SPACING[2]} ${SPACING[3]}`,
  borderRadius: BORDER_RADIUS.md,
  shadow: SHADOWS.lg,
  maxWidth: '300px',
} as const;

// ============ DARK MODE COMPONENT OVERRIDES ============

export const DARK_BUTTON_VARIANTS = {
  primary: {
    background: BRAND_COLORS.primary[500],
    backgroundHover: BRAND_COLORS.primary[400],
    text: BRAND_COLORS.neutral[0],
  },
  secondary: {
    background: BRAND_COLORS.neutral[800],
    backgroundHover: BRAND_COLORS.neutral[700],
    text: BRAND_COLORS.neutral[100],
    border: BRAND_COLORS.neutral[600],
  },
  outline: {
    background: 'transparent',
    backgroundHover: `${BRAND_COLORS.primary[500]}20`,
    text: BRAND_COLORS.primary[400],
    border: BRAND_COLORS.primary[400],
  },
  ghost: {
    background: 'transparent',
    backgroundHover: BRAND_COLORS.neutral[800],
    text: BRAND_COLORS.neutral[200],
  },
} as const;

export const DARK_INPUT_STYLES = {
  background: BRAND_COLORS.neutral[800],
  border: BRAND_COLORS.neutral[600],
  borderFocus: BRAND_COLORS.primary[400],
  text: BRAND_COLORS.neutral[100],
  placeholder: BRAND_COLORS.neutral[500],
  shadowFocus: `0 0 0 3px ${BRAND_COLORS.primary[500]}30`,
} as const;

export const DARK_CARD_STYLES = {
  background: BRAND_COLORS.neutral[800],
  border: BRAND_COLORS.neutral[700],
  backgroundElevated: BRAND_COLORS.neutral[850] || BRAND_COLORS.neutral[800],
  backgroundFilled: BRAND_COLORS.neutral[850] || BRAND_COLORS.neutral[800],
} as const;

// ============ EXPORT TYPES ============

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;
export type BadgeVariant = keyof typeof BADGE_VARIANTS;
export type BadgeSize = keyof typeof BADGE_SIZES;
export type AvatarSize = keyof typeof AVATAR_SIZES;
export type ToastVariant = keyof typeof TOAST_VARIANTS;
export type CardStyle = keyof typeof CARD_STYLES;
