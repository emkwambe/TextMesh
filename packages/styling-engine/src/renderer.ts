// =================================
// TEXTMESH STYLE RENDERER
// Generate renderable output from styled content
// =================================

import {
  StyledPostContent,
  TextStyle,
  Background,
  GradientBackground,
  FONT_SIZE_MAP,
  FONT_WEIGHT_MAP,
  RenderOptions,
} from './types';
import { generatePatternSvg } from './patterns';

// ============ HTML RENDERING ============

/**
 * Generate inline CSS for background
 */
export function generateBackgroundCSS(background: Background): string {
  switch (background.type) {
    case 'solid':
      return `background-color: ${background.color};`;

    case 'gradient': {
      const gradient = background as GradientBackground;
      const stopsCSS = gradient.stops
        .map((s) => `${s.color} ${s.position * 100}%`)
        .join(', ');

      if (gradient.gradientType === 'linear') {
        return `background: linear-gradient(${gradient.angle}deg, ${stopsCSS});`;
      } else {
        return `background: radial-gradient(circle at ${gradient.centerX * 100}% ${gradient.centerY * 100}%, ${stopsCSS});`;
      }
    }

    case 'pattern':
      return `background-color: ${background.primaryColor}; background-image: url("data:image/svg+xml,${encodeURIComponent(generatePatternSvg(background.patternId, background.primaryColor, background.secondaryColor))}");`;

    case 'image':
      let css = `background-image: url('${background.imageUrl}'); background-size: cover; background-position: center;`;
      if (background.blur) {
        css += ` filter: blur(${background.blur}px);`;
      }
      if (background.overlay) {
        css = `background: linear-gradient(${background.overlay}, ${background.overlay}), url('${background.imageUrl}'); background-size: cover;`;
      }
      return css;

    default:
      return 'background-color: #FFFFFF;';
  }
}

/**
 * Generate CSS class name for text style
 */
function generateTextStyleClass(index: number): string {
  return `ts-${index}`;
}

/**
 * Generate CSS for text style
 */
function generateTextStyleCSS(style: TextStyle, index: number): string {
  const className = generateTextStyleClass(index);
  const rules: string[] = [];

  if (style.color) {
    if (style.color.type === 'solid') {
      rules.push(`color: ${style.color.value}`);
    }
    if (style.color.opacity !== undefined) {
      rules.push(`opacity: ${style.color.opacity}`);
    }
  }

  if (style.fontWeight) {
    rules.push(`font-weight: ${FONT_WEIGHT_MAP[style.fontWeight]}`);
  }

  if (style.fontSize) {
    rules.push(`font-size: ${FONT_SIZE_MAP[style.fontSize]}px`);
  }

  if (style.isItalic) {
    rules.push('font-style: italic');
  }

  if (style.isUnderline) {
    rules.push('text-decoration: underline');
  }

  if (style.isStrikethrough) {
    rules.push('text-decoration: line-through');
  }

  return `.${className} { ${rules.join('; ')}; }`;
}

/**
 * Apply text styles to text and generate HTML
 */
export function generateStyledTextHTML(content: StyledPostContent): string {
  const { text, textStyles } = content;

  if (textStyles.length === 0) {
    return escapeHtml(text);
  }

  // Sort styles by start position
  const sortedStyles = [...textStyles].sort((a, b) => a.range.start - b.range.start);

  // Build styled HTML
  let html = '';
  let currentIndex = 0;

  for (let i = 0; i < sortedStyles.length; i++) {
    const style = sortedStyles[i];

    if (!style) continue;

    // Add unstyled text before this style
    if (currentIndex < style.range.start) {
      html += escapeHtml(text.slice(currentIndex, style.range.start));
    }

    // Add styled text
    const styledText = text.slice(style.range.start, style.range.end);
    const className = generateTextStyleClass(i);

    if (style.linkUrl) {
      html += `<a href="${escapeHtml(style.linkUrl)}" class="${className}" target="_blank" rel="noopener noreferrer">${escapeHtml(styledText)}</a>`;
    } else if (style.mentionUserId) {
      html += `<a href="/user/${style.mentionUserId}" class="${className} mention">${escapeHtml(styledText)}</a>`;
    } else if (style.hashtagId) {
      html += `<a href="/hashtag/${style.hashtagId}" class="${className} hashtag">${escapeHtml(styledText)}</a>`;
    } else {
      html += `<span class="${className}">${escapeHtml(styledText)}</span>`;
    }

    currentIndex = style.range.end;
  }

  // Add remaining unstyled text
  if (currentIndex < text.length) {
    html += escapeHtml(text.slice(currentIndex));
  }

  return html;
}

/**
 * Generate complete HTML document for styled post
 */
export function renderToHTML(
  content: StyledPostContent,
  options: Partial<RenderOptions> = {}
): string {
  const { width = 600, height = 600 } = options;

  // Generate style rules
  const styleRules = content.textStyles
    .map((style, index) => generateTextStyleCSS(style, index))
    .join('\n');

  const backgroundCSS = generateBackgroundCSS(content.background);
  const textColor = content.defaultTextColor.type === 'solid'
    ? content.defaultTextColor.value
    : '#000000';
  const fontWeight = FONT_WEIGHT_MAP[content.defaultFontWeight];
  const fontSize = FONT_SIZE_MAP[content.defaultFontSize];

  const styledTextHTML = generateStyledTextHTML(content);

  // Generate sticker HTML
  const stickersHTML = content.stickers
    .map(
      (sticker) => `
      <div class="sticker" style="
        position: absolute;
        left: ${sticker.position.x}%;
        top: ${sticker.position.y}%;
        width: ${sticker.size.width}%;
        height: ${sticker.size.height}%;
        transform: rotate(${sticker.transform.rotation}deg) scale(${sticker.transform.scale});
        opacity: ${sticker.opacity};
        z-index: ${sticker.zIndex};
      ">
        <img src="/stickers/${sticker.stickerId}" alt="" style="width: 100%; height: 100%; object-fit: contain;" />
      </div>
    `
    )
    .join('\n');

  // Generate overlay HTML
  const overlaysHTML = content.overlays
    .map((overlay) => {
      let shapeSVG = '';
      switch (overlay.shapeType) {
        case 'rectangle':
          shapeSVG = `<rect width="100%" height="100%" fill="${overlay.fill || 'none'}" stroke="${overlay.stroke || 'none'}" stroke-width="${overlay.strokeWidth || 0}"/>`;
          break;
        case 'circle':
          shapeSVG = `<circle cx="50%" cy="50%" r="50%" fill="${overlay.fill || 'none'}" stroke="${overlay.stroke || 'none'}" stroke-width="${overlay.strokeWidth || 0}"/>`;
          break;
        case 'triangle':
          shapeSVG = `<polygon points="50,0 100,100 0,100" fill="${overlay.fill || 'none'}" stroke="${overlay.stroke || 'none'}" stroke-width="${overlay.strokeWidth || 0}"/>`;
          break;
        case 'custom':
          shapeSVG = `<path d="${overlay.customPath}" fill="${overlay.fill || 'none'}" stroke="${overlay.stroke || 'none'}" stroke-width="${overlay.strokeWidth || 0}"/>`;
          break;
      }

      return `
        <div class="overlay" style="
          position: absolute;
          left: ${overlay.position.x}%;
          top: ${overlay.position.y}%;
          width: ${overlay.size.width}%;
          height: ${overlay.size.height}%;
          transform: rotate(${overlay.transform.rotation}deg) scale(${overlay.transform.scale});
          opacity: ${overlay.opacity};
          z-index: ${overlay.zIndex};
        ">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 100%;">
            ${shapeSVG}
          </svg>
        </div>
      `;
    })
    .join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    .styled-post {
      width: ${width}px;
      height: ${height}px;
      ${backgroundCSS}
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .text-container {
      padding: ${content.padding?.top || 40}px ${content.padding?.right || 40}px ${content.padding?.bottom || 40}px ${content.padding?.left || 40}px;
      text-align: ${content.textAlignment};
      color: ${textColor};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: ${fontWeight};
      font-size: ${fontSize}px;
      line-height: 1.4;
      word-wrap: break-word;
      z-index: 10;
      position: relative;
    }

    .mention, .hashtag {
      text-decoration: none;
    }

    .mention:hover, .hashtag:hover {
      text-decoration: underline;
    }

    ${styleRules}
  </style>
</head>
<body>
  <div class="styled-post">
    ${overlaysHTML}
    ${stickersHTML}
    <div class="text-container">
      ${styledTextHTML}
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============ SVG RENDERING ============

/**
 * Render styled content to SVG
 */
export function renderToSVG(
  content: StyledPostContent,
  options: Partial<RenderOptions> = {}
): string {
  const { width = 600, height = 600 } = options;

  // Generate background
  let backgroundElement = '';
  switch (content.background.type) {
    case 'solid':
      backgroundElement = `<rect width="100%" height="100%" fill="${content.background.color}"/>`;
      break;
    case 'gradient': {
      const gradient = content.background as GradientBackground;
      const gradientId = 'bg-gradient';
      const stops = gradient.stops
        .map((s) => `<stop offset="${s.position * 100}%" stop-color="${s.color}"/>`)
        .join('');

      if (gradient.gradientType === 'linear') {
        const rad = (gradient.angle * Math.PI) / 180;
        const x2 = 50 + 50 * Math.cos(rad);
        const y2 = 50 + 50 * Math.sin(rad);
        backgroundElement = `
          <defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="${x2}%" y2="${y2}%">
              ${stops}
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#${gradientId})"/>
        `;
      } else {
        backgroundElement = `
          <defs>
            <radialGradient id="${gradientId}" cx="${gradient.centerX * 100}%" cy="${gradient.centerY * 100}%" r="${gradient.radius * 100}%">
              ${stops}
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#${gradientId})"/>
        `;
      }
      break;
    }
    default:
      backgroundElement = `<rect width="100%" height="100%" fill="#FFFFFF"/>`;
  }

  // Calculate text position
  const padding = content.padding || { top: 40, right: 40, bottom: 40, left: 40 };
  const textX = content.textAlignment === 'left'
    ? padding.left
    : content.textAlignment === 'right'
      ? width - padding.right
      : width / 2;
  const textAnchor = content.textAlignment === 'left'
    ? 'start'
    : content.textAlignment === 'right'
      ? 'end'
      : 'middle';

  const textColor = content.defaultTextColor.type === 'solid'
    ? content.defaultTextColor.value
    : '#000000';
  const fontSize = FONT_SIZE_MAP[content.defaultFontSize];
  const fontWeight = FONT_WEIGHT_MAP[content.defaultFontWeight];

  // Wrap text for SVG
  const lines = wrapText(content.text, width - padding.left - padding.right, fontSize);
  const lineHeight = fontSize * 1.4;
  const totalHeight = lines.length * lineHeight;
  const startY = (height - totalHeight) / 2 + fontSize;

  const textElements = lines
    .map(
      (line, i) => `
      <text
        x="${textX}"
        y="${startY + i * lineHeight}"
        text-anchor="${textAnchor}"
        fill="${textColor}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="${fontSize}"
        font-weight="${fontWeight}"
      >${escapeHtml(line)}</text>
    `
    )
    .join('\n');

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${backgroundElement}
  ${textElements}
</svg>
  `.trim();
}

// ============ JSON FOR MOBILE RENDERING ============

/**
 * Generate JSON for mobile app rendering
 */
export function renderToMobileJSON(content: StyledPostContent): object {
  return {
    version: content.version,
    text: content.text,
    textStyles: content.textStyles.map((style) => ({
      range: style.range,
      attributes: {
        ...(style.color && {
          foregroundColor: style.color.value,
          colorType: style.color.type,
        }),
        ...(style.fontWeight && {
          fontWeight: FONT_WEIGHT_MAP[style.fontWeight],
        }),
        ...(style.fontSize && {
          fontSize: FONT_SIZE_MAP[style.fontSize],
        }),
        ...(style.isItalic && { italic: true }),
        ...(style.isUnderline && { underline: true }),
        ...(style.isStrikethrough && { strikethrough: true }),
        ...(style.linkUrl && { link: style.linkUrl }),
        ...(style.mentionUserId && { mention: style.mentionUserId }),
        ...(style.hashtagId && { hashtag: style.hashtagId }),
      },
    })),
    background: content.background,
    layout: {
      alignment: content.textAlignment,
      padding: content.padding,
      aspectRatio: content.aspectRatio,
    },
    defaults: {
      textColor: content.defaultTextColor,
      fontWeight: FONT_WEIGHT_MAP[content.defaultFontWeight],
      fontSize: FONT_SIZE_MAP[content.defaultFontSize],
    },
    stickers: content.stickers,
    overlays: content.overlays,
  };
}

// ============ HELPER FUNCTIONS ============

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Simple text wrapping for SVG
 */
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  const avgCharWidth = fontSize * 0.5;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = testLine.length * avgCharWidth;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
