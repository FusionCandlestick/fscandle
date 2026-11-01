import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPointInAnyFigure } from '../../src/engine/OverlayFigure';
import type { Overlay, OverlayFigureParams } from '../../src/engine/OverlayManager';
import {
  buildTradingLineFields,
  defaultTradingLineColor,
  isTradingLineOverlayId,
  TRADING_LINE_OVERLAY_TYPE,
  tradingLineFigures,
  tradingLineOverlayId,
  tradingLineTemplate,
} from '../../src/model/tradingLineOverlay';

function overlayFor(value: number, extra: Partial<Overlay> = {}): Overlay {
  return {
    id: 'trading-line-entry-1',
    type: TRADING_LINE_OVERLAY_TYPE,
    points: [{ timestamp: 1_000, value }],
    color: '#f59e0b',
    lineWidth: 2,
    ...extra,
  };
}

function paramsFor(overlay: Overlay, pixelY: number, width = 400): OverlayFigureParams {
  return {
    overlay,
    transformer: {} as OverlayFigureParams['transformer'],
    dataStore: {} as OverlayFigureParams['dataStore'],
    coordinates: [{ x: 120, y: pixelY }],
    width,
    height: 300,
    currentStep: 1,
    isSelected: false,
  };
}

describe('trading line ids', () => {
  it('prefixes caller ids and recognises the prefix', () => {
    assert.equal(tradingLineOverlayId('stop-1'), 'trading-line-stop-1');
    assert.equal(isTradingLineOverlayId('trading-line-stop-1'), true);
    assert.equal(isTradingLineOverlayId('overlay_123_0'), false);
  });
});

describe('buildTradingLineFields', () => {
  it('anchors one point at the given price and timestamp', () => {
    const fields = buildTradingLineFields(
      { id: 'a', type: 'stop', price: 101.5 },
      42,
    );
    assert.equal(fields.type, TRADING_LINE_OVERLAY_TYPE);
    assert.deepEqual(fields.points, [{ timestamp: 42, value: 101.5 }]);
  });

  it('uses the type default colour unless one is given', () => {
    assert.equal(defaultTradingLineColor('position'), '#10b981');
    assert.equal(defaultTradingLineColor('stop'), '#f59e0b');
    assert.equal(
      buildTradingLineFields({ id: 'a', type: 'stop', price: 1 }, 0).color,
      '#f59e0b',
    );
    assert.equal(
      buildTradingLineFields({ id: 'a', type: 'stop', price: 1, color: '#fff' }, 0).color,
      '#fff',
    );
  });

  it('locks the overlay only when draggable is explicitly false', () => {
    assert.equal(buildTradingLineFields({ id: 'a', type: 'limit', price: 1 }, 0).locked, false);
    assert.equal(
      buildTradingLineFields({ id: 'a', type: 'limit', price: 1, draggable: false }, 0).locked,
      true,
    );
  });

  it('carries the label as overlay text', () => {
    assert.equal(
      buildTradingLineFields({ id: 'a', type: 'entry', price: 1, label: 'Entry' }, 0).text,
      'Entry',
    );
  });
});

describe('tradingLineFigures', () => {
  it('draws a horizontal rule across the full width at the anchor row', () => {
    const [rule] = tradingLineFigures(paramsFor(overlayFor(100), 77, 400));
    assert.equal(rule.type, 'line');
    assert.deepEqual(rule.type === 'line' ? rule.attrs.coordinates : null, [
      { x: 0, y: 77 },
      { x: 400, y: 77 },
    ]);
  });

  it('shows the price to two decimals, prefixed by the label when present', () => {
    const [, plain] = tradingLineFigures(paramsFor(overlayFor(100.456), 10));
    assert.equal(plain.type === 'text' ? plain.attrs.text : null, '100.46');

    const [, labelled] = tradingLineFigures(paramsFor(overlayFor(100, { text: 'SL' }), 10));
    assert.equal(labelled.type === 'text' ? labelled.attrs.text : null, 'SL  100.00');
  });

  it('is hit-testable along the rule and not far away from it', () => {
    const figures = tradingLineFigures(paramsFor(overlayFor(100), 77, 400));
    assert.equal(isPointInAnyFigure(300, 77, figures, 4), true);
    assert.equal(isPointInAnyFigure(300, 150, figures, 4), false);
  });

  it('draws nothing without an anchor', () => {
    const params = paramsFor(overlayFor(100), 0);
    assert.deepEqual(tradingLineFigures({ ...params, coordinates: [] }), []);
  });
});

describe('tradingLineTemplate', () => {
  it('is a single-point, figure-drawn template with no default handle', () => {
    assert.equal(tradingLineTemplate.type, TRADING_LINE_OVERLAY_TYPE);
    assert.equal(tradingLineTemplate.totalStep, 1);
    assert.equal(tradingLineTemplate.needDefaultPointFigure, false);
    assert.equal(tradingLineTemplate.createFigures, tradingLineFigures);
  });
});
