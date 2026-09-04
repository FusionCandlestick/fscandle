import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPointInAnyFigure, isPointInFigure } from '../../src/engine/OverlayFigure';
import type { OverlayFigure } from '../../src/engine/OverlayFigure';

describe('isPointInFigure — line', () => {
  const line: OverlayFigure = {
    type: 'line',
    attrs: {
      coordinates: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
  };

  it('hits a point on the segment', () => {
    assert.equal(isPointInFigure(50, 0, line), true);
  });

  it('hits within the threshold band', () => {
    assert.equal(isPointInFigure(50, 5, line, 8), true);
    assert.equal(isPointInFigure(50, 20, line, 8), false);
  });

  it('misses past the endpoints', () => {
    assert.equal(isPointInFigure(200, 0, line, 8), false);
    assert.equal(isPointInFigure(-50, 0, line, 8), false);
  });

  it('follows every segment of a polyline', () => {
    const polyline: OverlayFigure = {
      type: 'line',
      attrs: {
        coordinates: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
          { x: 100, y: 0 },
        ],
      },
    };
    assert.equal(isPointInFigure(25, 25, polyline), true);
    assert.equal(isPointInFigure(75, 25, polyline), true);
    assert.equal(isPointInFigure(50, 0, polyline, 4), false);
  });

  it('returns false for a degenerate one-point line', () => {
    assert.equal(
      isPointInFigure(0, 0, { type: 'line', attrs: { coordinates: [{ x: 0, y: 0 }] } }),
      false,
    );
  });
});

describe('isPointInFigure — polygon', () => {
  const square: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('hits the interior only when filled', () => {
    const stroked: OverlayFigure = { type: 'polygon', attrs: { coordinates: square } };
    const filled: OverlayFigure = {
      type: 'polygon',
      attrs: { coordinates: square },
      styles: { style: 'fill' },
    };
    assert.equal(isPointInFigure(50, 50, stroked, 4), false);
    assert.equal(isPointInFigure(50, 50, filled, 4), true);
  });

  it('hits the outline in either style', () => {
    const stroked: OverlayFigure = { type: 'polygon', attrs: { coordinates: square } };
    assert.equal(isPointInFigure(50, 0, stroked, 4), true);
    assert.equal(isPointInFigure(0, 50, stroked, 4), true);
  });

  it('misses well outside', () => {
    const filled: OverlayFigure = {
      type: 'polygon',
      attrs: { coordinates: square },
      styles: { style: 'stroke_fill' },
    };
    assert.equal(isPointInFigure(300, 300, filled, 4), false);
  });
});

describe('isPointInFigure — rect', () => {
  const rect: OverlayFigure = {
    type: 'rect',
    attrs: { x: 10, y: 10, width: 100, height: 50 },
  };

  it('hits inside and within the threshold', () => {
    assert.equal(isPointInFigure(50, 30, rect, 4), true);
    assert.equal(isPointInFigure(8, 30, rect, 4), true);
    assert.equal(isPointInFigure(0, 30, rect, 4), false);
  });

  it('normalizes negative width and height', () => {
    const flipped: OverlayFigure = {
      type: 'rect',
      attrs: { x: 110, y: 60, width: -100, height: -50 },
    };
    assert.equal(isPointInFigure(50, 30, flipped, 4), true);
  });
});

describe('isPointInFigure — circle and arc', () => {
  it('hits only the ring when stroked', () => {
    const ring: OverlayFigure = { type: 'circle', attrs: { x: 50, y: 50, r: 20 } };
    assert.equal(isPointInFigure(70, 50, ring, 4), true);
    assert.equal(isPointInFigure(50, 50, ring, 4), false);
  });

  it('hits the interior when filled', () => {
    const disc: OverlayFigure = {
      type: 'circle',
      attrs: { x: 50, y: 50, r: 20 },
      styles: { style: 'fill' },
    };
    assert.equal(isPointInFigure(50, 50, disc, 4), true);
    assert.equal(isPointInFigure(100, 50, disc, 4), false);
  });

  it('treats an arc as a ring regardless of style', () => {
    const arc: OverlayFigure = {
      type: 'arc',
      attrs: { x: 50, y: 50, r: 20, startAngle: 0, endAngle: Math.PI },
      styles: { style: 'fill' },
    };
    assert.equal(isPointInFigure(70, 50, arc, 4), true);
    assert.equal(isPointInFigure(50, 50, arc, 4), false);
  });
});

describe('isPointInAnyFigure', () => {
  it('returns true when any figure matches', () => {
    const figures: OverlayFigure[] = [
      { type: 'circle', attrs: { x: 0, y: 0, r: 5 } },
      { type: 'rect', attrs: { x: 100, y: 100, width: 20, height: 20 } },
    ];
    assert.equal(isPointInAnyFigure(110, 110, figures, 2), true);
    assert.equal(isPointInAnyFigure(500, 500, figures, 2), false);
  });

  it('returns false for an empty list', () => {
    assert.equal(isPointInAnyFigure(0, 0, [], 4), false);
  });
});
