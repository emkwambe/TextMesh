// =================================
// TEXTMESH PATTERN LIBRARY
// SVG-Based Background Patterns
// =================================

import { PatternDefinition } from './types';

// ============ PATTERN DEFINITIONS ============

export const PATTERN_LIBRARY: PatternDefinition[] = [
  // === GEOMETRIC PATTERNS ===
  {
    id: 'geometric-grid',
    name: 'Grid',
    category: 'geometric',
    defaultPrimaryColor: '#E0E0E0',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="{{secondary}}"/>
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="{{primary}}" stroke-width="1"/>
      </pattern>
    `,
  },
  {
    id: 'geometric-diagonal',
    name: 'Diagonal Lines',
    category: 'geometric',
    defaultPrimaryColor: '#CCCCCC',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="diagonal" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="{{secondary}}"/>
        <line x1="0" y1="0" x2="0" y2="10" stroke="{{primary}}" stroke-width="2"/>
      </pattern>
    `,
  },
  {
    id: 'geometric-chevron',
    name: 'Chevron',
    category: 'geometric',
    defaultPrimaryColor: '#D4D4D4',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="chevron" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="{{secondary}}"/>
        <path d="M0 10 L10 0 L20 10 M0 20 L10 10 L20 20" fill="none" stroke="{{primary}}" stroke-width="2"/>
      </pattern>
    `,
  },
  {
    id: 'geometric-hexagon',
    name: 'Hexagon',
    category: 'geometric',
    defaultPrimaryColor: '#E8E8E8',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="hexagon" width="28" height="49" patternUnits="userSpaceOnUse">
        <rect width="28" height="49" fill="{{secondary}}"/>
        <path d="M14 0 L28 8.5 L28 25.5 L14 34 L0 25.5 L0 8.5 Z" fill="none" stroke="{{primary}}" stroke-width="1"/>
        <path d="M14 34 L28 42.5 L28 59.5 L14 68 L0 59.5 L0 42.5 Z" fill="none" stroke="{{primary}}" stroke-width="1" transform="translate(0, -17)"/>
      </pattern>
    `,
  },
  {
    id: 'geometric-triangles',
    name: 'Triangles',
    category: 'geometric',
    defaultPrimaryColor: '#E0E0E0',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="triangles" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="{{secondary}}"/>
        <polygon points="10,0 20,20 0,20" fill="{{primary}}"/>
      </pattern>
    `,
  },
  {
    id: 'geometric-squares',
    name: 'Squares',
    category: 'geometric',
    defaultPrimaryColor: '#F0F0F0',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="squares" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="{{secondary}}"/>
        <rect x="5" y="5" width="10" height="10" fill="{{primary}}"/>
      </pattern>
    `,
  },

  // === DOT PATTERNS ===
  {
    id: 'dots-polka',
    name: 'Polka Dots',
    category: 'dots',
    defaultPrimaryColor: '#CCCCCC',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="polka" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="{{secondary}}"/>
        <circle cx="10" cy="10" r="3" fill="{{primary}}"/>
      </pattern>
    `,
  },
  {
    id: 'dots-confetti',
    name: 'Confetti',
    category: 'dots',
    defaultPrimaryColor: '#FFD93D',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="confetti" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill="{{secondary}}"/>
        <circle cx="5" cy="5" r="2" fill="{{primary}}"/>
        <circle cx="20" cy="12" r="1.5" fill="{{primary}}" opacity="0.7"/>
        <circle cx="10" cy="25" r="2.5" fill="{{primary}}" opacity="0.5"/>
        <circle cx="25" cy="22" r="1" fill="{{primary}}"/>
      </pattern>
    `,
  },
  {
    id: 'dots-scattered',
    name: 'Scattered Dots',
    category: 'dots',
    defaultPrimaryColor: '#B8B8B8',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="scattered" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="{{secondary}}"/>
        <circle cx="8" cy="8" r="2" fill="{{primary}}"/>
        <circle cx="28" cy="4" r="1" fill="{{primary}}"/>
        <circle cx="16" cy="20" r="1.5" fill="{{primary}}"/>
        <circle cx="36" cy="24" r="2" fill="{{primary}}"/>
        <circle cx="4" cy="32" r="1" fill="{{primary}}"/>
        <circle cx="24" cy="36" r="1.5" fill="{{primary}}"/>
      </pattern>
    `,
  },

  // === LINE PATTERNS ===
  {
    id: 'lines-horizontal',
    name: 'Horizontal Lines',
    category: 'lines',
    defaultPrimaryColor: '#E0E0E0',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="horizontal" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="{{secondary}}"/>
        <line x1="0" y1="5" x2="10" y2="5" stroke="{{primary}}" stroke-width="1"/>
      </pattern>
    `,
  },
  {
    id: 'lines-vertical',
    name: 'Vertical Lines',
    category: 'lines',
    defaultPrimaryColor: '#E0E0E0',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="vertical" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="{{secondary}}"/>
        <line x1="5" y1="0" x2="5" y2="10" stroke="{{primary}}" stroke-width="1"/>
      </pattern>
    `,
  },
  {
    id: 'lines-crosshatch',
    name: 'Crosshatch',
    category: 'lines',
    defaultPrimaryColor: '#D0D0D0',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="crosshatch" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="{{secondary}}"/>
        <path d="M0 0 L10 10 M10 0 L0 10" stroke="{{primary}}" stroke-width="0.5"/>
      </pattern>
    `,
  },

  // === WAVE PATTERNS ===
  {
    id: 'waves-sine',
    name: 'Sine Waves',
    category: 'waves',
    defaultPrimaryColor: '#87CEEB',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="sine" width="40" height="20" patternUnits="userSpaceOnUse">
        <rect width="40" height="20" fill="{{secondary}}"/>
        <path d="M0 10 Q10 0 20 10 T40 10" fill="none" stroke="{{primary}}" stroke-width="2"/>
      </pattern>
    `,
  },
  {
    id: 'waves-zigzag',
    name: 'Zigzag',
    category: 'waves',
    defaultPrimaryColor: '#FFB6C1',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="zigzag" width="20" height="12" patternUnits="userSpaceOnUse">
        <rect width="20" height="12" fill="{{secondary}}"/>
        <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke="{{primary}}" stroke-width="2"/>
      </pattern>
    `,
  },
  {
    id: 'waves-ripple',
    name: 'Ripple',
    category: 'waves',
    defaultPrimaryColor: '#ADD8E6',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="ripple" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="{{secondary}}"/>
        <circle cx="20" cy="20" r="5" fill="none" stroke="{{primary}}" stroke-width="1"/>
        <circle cx="20" cy="20" r="10" fill="none" stroke="{{primary}}" stroke-width="1" opacity="0.7"/>
        <circle cx="20" cy="20" r="15" fill="none" stroke="{{primary}}" stroke-width="1" opacity="0.4"/>
      </pattern>
    `,
  },

  // === ORGANIC PATTERNS ===
  {
    id: 'organic-leaves',
    name: 'Leaves',
    category: 'organic',
    defaultPrimaryColor: '#90EE90',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="leaves" width="30" height="30" patternUnits="userSpaceOnUse">
        <rect width="30" height="30" fill="{{secondary}}"/>
        <path d="M15 5 Q20 15 15 25 Q10 15 15 5" fill="{{primary}}" opacity="0.6"/>
        <path d="M5 15 Q15 20 25 15 Q15 10 5 15" fill="{{primary}}" opacity="0.4" transform="rotate(45 15 15)"/>
      </pattern>
    `,
  },
  {
    id: 'organic-bubbles',
    name: 'Bubbles',
    category: 'organic',
    defaultPrimaryColor: '#B0E0E6',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="bubbles" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="{{secondary}}"/>
        <circle cx="10" cy="10" r="6" fill="none" stroke="{{primary}}" stroke-width="1"/>
        <circle cx="30" cy="25" r="8" fill="none" stroke="{{primary}}" stroke-width="1"/>
        <circle cx="15" cy="32" r="4" fill="none" stroke="{{primary}}" stroke-width="1"/>
      </pattern>
    `,
  },

  // === ABSTRACT PATTERNS ===
  {
    id: 'abstract-noise',
    name: 'Noise',
    category: 'abstract',
    defaultPrimaryColor: '#808080',
    defaultSecondaryColor: '#FFFFFF',
    svgPattern: `
      <pattern id="noise" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="{{secondary}}"/>
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
        </filter>
        <rect width="100" height="100" filter="url(#noiseFilter)" opacity="0.1"/>
      </pattern>
    `,
  },
  {
    id: 'abstract-memphis',
    name: 'Memphis',
    category: 'abstract',
    defaultPrimaryColor: '#FF6B6B',
    defaultSecondaryColor: '#FFF5E6',
    svgPattern: `
      <pattern id="memphis" width="60" height="60" patternUnits="userSpaceOnUse">
        <rect width="60" height="60" fill="{{secondary}}"/>
        <circle cx="15" cy="15" r="4" fill="{{primary}}"/>
        <rect x="40" y="10" width="8" height="8" fill="{{primary}}" transform="rotate(15 44 14)"/>
        <path d="M10 45 L20 35 L30 45" fill="none" stroke="{{primary}}" stroke-width="2"/>
        <circle cx="45" cy="45" r="6" fill="none" stroke="{{primary}}" stroke-width="2"/>
      </pattern>
    `,
  },
];

// ============ PATTERN FUNCTIONS ============

/**
 * Get pattern by ID
 */
export function getPattern(patternId: string): PatternDefinition | undefined {
  return PATTERN_LIBRARY.find((p) => p.id === patternId);
}

/**
 * Get patterns by category
 */
export function getPatternsByCategory(
  category: PatternDefinition['category']
): PatternDefinition[] {
  return PATTERN_LIBRARY.filter((p) => p.category === category);
}

/**
 * Get all pattern categories
 */
export function getPatternCategories(): PatternDefinition['category'][] {
  const categories = new Set(PATTERN_LIBRARY.map((p) => p.category));
  return Array.from(categories);
}

/**
 * Generate SVG pattern with custom colors
 */
export function generatePatternSvg(
  patternId: string,
  primaryColor?: string,
  secondaryColor?: string,
  scale: number = 1
): string {
  const pattern = getPattern(patternId);
  if (!pattern) {
    throw new Error(`Pattern ${patternId} not found`);
  }

  const primary = primaryColor || pattern.defaultPrimaryColor;
  const secondary = secondaryColor || pattern.defaultSecondaryColor;

  let svg = pattern.svgPattern
    .replace(/\{\{primary\}\}/g, primary)
    .replace(/\{\{secondary\}\}/g, secondary);

  if (scale !== 1) {
    svg = svg.replace(
      /patternUnits="userSpaceOnUse"/g,
      `patternUnits="userSpaceOnUse" patternTransform="scale(${scale})"`
    );
  }

  return svg;
}

/**
 * Generate complete SVG with pattern fill
 */
export function generatePatternBackground(
  patternId: string,
  width: number,
  height: number,
  primaryColor?: string,
  secondaryColor?: string,
  scale: number = 1
): string {
  const patternSvg = generatePatternSvg(patternId, primaryColor, secondaryColor, scale);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        ${patternSvg}
      </defs>
      <rect width="100%" height="100%" fill="url(#${patternId.split('-')[1]})"/>
    </svg>
  `.trim();
}

/**
 * Get pattern as data URL
 */
export function getPatternDataUrl(
  patternId: string,
  width: number,
  height: number,
  primaryColor?: string,
  secondaryColor?: string
): string {
  const svg = generatePatternBackground(
    patternId,
    width,
    height,
    primaryColor,
    secondaryColor
  );
  const encoded = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}
