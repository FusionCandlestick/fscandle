import { createId } from '../model/ids';
import type { Overlay, OverlayPoint } from './OverlayManager';

/**
 * Drawing modes: the string a toolbar or caller passes to `setDrawingMode`,
 * such as `line:ray` or `wave:five`, is a family and a variant. These map a
 * mode to the overlay it starts and to how many points that overlay takes.
 */

/** Split `family:variant`; the variant is `default` when omitted. */
export function parseDrawingMode(type: string): { family: string; variant: string } {
  const [family, variant = 'default'] = type.split(':');
  return { family, variant };
}

/**
 * Points a drawing in this mode takes. Built-in families have variant-specific
 * counts; any other family that a registered template provides uses the
 * template's `totalStep` (`templateTotalStep` returns null for no template).
 */
export function requiredDrawingPointCount(
  type: string | null,
  templateTotalStep: (family: string) => number | null,
): number {
  if (!type) return 0;
  const drawing = parseDrawingMode(type);
  if (drawing.family === 'annotation') return 1;
  if (drawing.family === 'channel') return 3;
  if (drawing.family === 'wave') {
    if (drawing.variant === 'five') return 6;
    if (drawing.variant === 'abcde') return 5;
    return 4;
  }
  if (
    drawing.family === 'line' &&
    ['horizontal', 'vertical', 'horizontal-ray', 'vertical-ray', 'price'].includes(drawing.variant)
  ) return 1;
  // Registered templates (including third-party ones) declare their own
  // point count via `totalStep`; the built-in families above keep their
  // variant-specific counts.
  if (drawing.family !== 'line') {
    const totalStep = templateTotalStep(drawing.family);
    if (totalStep !== null) return totalStep;
  }
  return 2;
}

/** The overlay a drawing in this mode starts as, with the user's default colour and width. */
export function createDrawingOverlay(
  type: string,
  points: OverlayPoint[],
  defaults: { color: string; lineWidth: number },
): Overlay {
  const { family, variant } = parseDrawingMode(type);
  const drawingColor = defaults.color;
  const drawingLineWidth = defaults.lineWidth;
  if (family === 'line') {
    const direction = variant.includes('horizontal') || variant === 'price'
      ? 'horizontal'
      : variant.includes('vertical')
        ? 'vertical'
        : 'free';
    return {
      id: createId('overlay'),
      type: 'line',
      points,
      color: drawingColor,
      lineWidth: drawingLineWidth,
      line: {
        direction,
        extendStart: variant === 'trend' || variant === 'infinite' || variant === 'horizontal' || variant === 'vertical' || variant === 'price',
        extendEnd: variant === 'trend' || variant === 'infinite' || variant === 'ray' || variant === 'horizontal' || variant === 'vertical' || variant === 'horizontal-ray' || variant === 'vertical-ray' || variant === 'price',
        showPriceLabel: variant === 'price',
      },
    };
  }
  if (family === 'channel') {
    return {
      id: createId('overlay'),
      type: 'channel',
      points,
      color: drawingColor,
      lineWidth: drawingLineWidth,
      channel: { mode: variant === 'price' ? 'price' : 'parallel' },
    };
  }
  if (family === 'annotation') {
    return {
      id: createId('overlay'),
      type: 'annotation',
      points,
      color: drawingColor,
      lineWidth: drawingLineWidth,
      annotation: {
        kind: variant === 'default' || variant.startsWith('event-')
          ? (variant.startsWith('event-') ? 'tag' : 'text')
          : variant as 'text' | 'arrow' | 'image' | 'tag',
        placement: variant === 'tag' || variant.startsWith('event-') ? 'bottom' : 'floating',
      },
    };
  }
  if (family === 'wave') {
    return {
      id: createId('overlay'),
      type: 'wave',
      points,
      color: drawingColor,
      lineWidth: drawingLineWidth,
      wave: { kind: variant === 'default' ? 'three' : variant as 'three' | 'five' | 'abcd' | 'abcde' },
    };
  }
  return {
    id: createId('overlay'),
    type,
    points,
    color: drawingColor,
    lineWidth: drawingLineWidth,
  };
}
