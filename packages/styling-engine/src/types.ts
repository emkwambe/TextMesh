// =================================
// STYLING ENGINE TYPES
// Re-exported from shared-types with extensions
// =================================

export {
  FontWeight,
  FontSize,
  TextAlignment,
  TextColor,
  TextRange,
  TextStyle,
  BackgroundType,
  SolidBackground,
  GradientStop,
  LinearGradient,
  RadialGradient,
  GradientBackground,
  PatternBackground,
  ImageBackground,
  Background,
  Position,
  Size,
  Transform,
  Sticker,
  ShapeOverlay,
  TextTemplate,
  TemplateCategory,
  StyledPostContent,
  ContrastResult,
  PatternDefinition,
  StickerPack,
  StickerDefinition,
  STYLE_LIMITS,
  FONT_SIZE_MAP,
  FONT_WEIGHT_MAP,
} from '@textmesh/shared-types/src/styling';

// Extended types for engine use

export interface RenderOptions {
  width: number;
  height: number;
  scale: number;
  format: 'png' | 'jpeg' | 'webp' | 'svg';
  quality?: number;
}

export interface RenderResult {
  data: Buffer | string;
  width: number;
  height: number;
  format: string;
}

export interface StyleOperation {
  type: 'add' | 'remove' | 'update';
  target: 'textStyle' | 'sticker' | 'overlay' | 'background';
  data: unknown;
  timestamp: number;
}

export interface StyleHistory {
  operations: StyleOperation[];
  currentIndex: number;
}
