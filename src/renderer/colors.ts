import type { ChartOptions } from '../types/options';

export interface AxisRailColors {
  surface: string;
  stripe: string;
  border: string;
}

/**
 * Perceived-luminance test used to pick readable foregrounds. Handles `#rrggbb`
 * and `rgb()`/`rgba()`; anything else is treated as dark, which is the safer
 * default for this chart's palette.
 */
export function isLightColor(color: string): boolean {
  const value = color.trim().toLowerCase();

  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const red = parseInt(hex[1].slice(0, 2), 16);
    const green = parseInt(hex[1].slice(2, 4), 16);
    const blue = parseInt(hex[1].slice(4, 6), 16);
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.6;
  }

  const rgb = value.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(',').map(part => Number.parseFloat(part.trim()));
    if (parts.length >= 3) {
      const [red, green, blue] = parts;
      return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.6;
    }
  }

  return false;
}

/**
 * Colors for the axis rails and any chrome that should match them. Explicit
 * `axis.*` options win; otherwise a light or dark preset is chosen from the
 * background.
 */
export function getAxisRailColors(options: ChartOptions): AxisRailColors {
  const { axis, layout, grid } = options;

  if (axis.backgroundColor || axis.borderColor || axis.alternateBackgroundColor) {
    return {
      surface: axis.backgroundColor || layout.background.color,
      stripe: axis.alternateBackgroundColor || 'rgba(128, 128, 128, 0.06)',
      border: axis.borderColor || grid.horzLines.color,
    };
  }

  if (isLightColor(layout.background.color)) {
    return {
      surface: 'rgba(255, 255, 255, 0.96)',
      stripe: 'rgba(15, 23, 42, 0.03)',
      border: 'rgba(15, 23, 42, 0.18)',
    };
  }

  return {
    surface: 'rgba(10, 16, 32, 0.92)',
    stripe: 'rgba(148, 163, 184, 0.06)',
    border: 'rgba(148, 163, 184, 0.32)',
  };
}
