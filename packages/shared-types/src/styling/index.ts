// =================================
// TEXTMESH TEXT STYLING SYSTEM
// Complete Type Definitions
// =================================

// ============ TEXT STYLING TYPES ============

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type TextAlignment = 'left' | 'center' | 'right';

export interface TextColor {
  type: 'solid' | 'gradient';
  value: string; // hex color or gradient id
  opacity?: number;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface TextStyle {
  range: TextRange;
  color?: TextColor;
  fontWeight?: FontWeight;
  fontSize?: FontSize;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  linkUrl?: string;
  mentionUserId?: string;
  hashtagId?: string;
}

// ============ BACKGROUND TYPES ============

export type BackgroundType = 'solid' | 'gradient' | 'pattern' | 'image';

export interface SolidBackground {
  type: 'solid';
  color: string;
}

export interface GradientStop {
  color: string;
  position: number; // 0-1
}

export interface LinearGradient {
  type: 'gradient';
  gradientType: 'linear';
  angle: number; // 0-360
  stops: GradientStop[];
}

export interface RadialGradient {
  type: 'gradient';
  gradientType: 'radial';
  centerX: number; // 0-1
  centerY: number; // 0-1
  radius: number; // 0-1
  stops: GradientStop[];
}

export type GradientBackground = LinearGradient | RadialGradient;

export interface PatternBackground {
  type: 'pattern';
  patternId: string;
  primaryColor: string;
  secondaryColor?: string;
  scale?: number;
  rotation?: number;
}

export interface ImageBackground {
  type: 'image';
  imageUrl: string;
  blur?: number;
  brightness?: number;
  overlay?: string; // hex color with alpha
}

export type Background = SolidBackground | GradientBackground | PatternBackground | ImageBackground;

// ============ STICKER & OVERLAY TYPES ============

export interface Position {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export interface Size {
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

export interface Transform {
  rotation: number; // degrees
  scale: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface Sticker {
  id: string;
  stickerId: string;
  position: Position;
  size: Size;
  transform: Transform;
  opacity: number;
  zIndex: number;
}

export interface ShapeOverlay {
  id: string;
  shapeType: 'rectangle' | 'circle' | 'triangle' | 'star' | 'heart' | 'custom';
  position: Position;
  size: Size;
  transform: Transform;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity: number;
  zIndex: number;
  customPath?: string; // SVG path for custom shapes
}

// ============ TEMPLATE TYPES ============

export interface TextTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  background: Background;
  defaultTextColor: TextColor;
  defaultFontWeight: FontWeight;
  defaultFontSize: FontSize;
  textAlignment: TextAlignment;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  stickers?: Sticker[];
  overlays?: ShapeOverlay[];
  thumbnail: string;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TemplateCategory =
  | 'minimal'
  | 'vibrant'
  | 'nature'
  | 'abstract'
  | 'seasonal'
  | 'celebration'
  | 'motivation'
  | 'social'
  | 'business'
  | 'custom';

// ============ STYLED POST SCHEMA ============

export interface StyledPostContent {
  version: '1.0';
  text: string;
  textStyles: TextStyle[];
  background: Background;
  textAlignment: TextAlignment;
  defaultTextColor: TextColor;
  defaultFontWeight: FontWeight;
  defaultFontSize: FontSize;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  stickers: Sticker[];
  overlays: ShapeOverlay[];
  templateId?: string;
  aspectRatio: '1:1' | '4:5' | '16:9' | '9:16';
  createdAt: string;
}

// ============ WCAG CONTRAST TYPES ============

export interface ContrastResult {
  ratio: number;
  aa: boolean;
  aaa: boolean;
  aaLarge: boolean;
  aaaLarge: boolean;
}

// ============ PATTERN DEFINITIONS ============

export interface PatternDefinition {
  id: string;
  name: string;
  svgPattern: string;
  defaultPrimaryColor: string;
  defaultSecondaryColor?: string;
  category: 'geometric' | 'organic' | 'abstract' | 'dots' | 'lines' | 'waves';
}

// ============ STICKER PACK TYPES ============

export interface StickerPack {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  stickers: StickerDefinition[];
  isPremium: boolean;
  price?: number;
  createdAt: string;
}

export interface StickerDefinition {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  tags: string[];
}

// ============ VALIDATION SCHEMA ============

export const STYLE_LIMITS = {
  maxTextLength: 500,
  maxTextStyles: 50,
  maxStickers: 10,
  maxOverlays: 5,
  maxGradientStops: 5,
  minFontSize: 12,
  maxFontSize: 72,
} as const;

export const FONT_SIZE_MAP: Record<FontSize, number> = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 32,
  xl: 48,
};

export const FONT_WEIGHT_MAP: Record<FontWeight, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};
