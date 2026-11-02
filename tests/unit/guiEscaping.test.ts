import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataTooltipWidget } from '../../src/gui/DataTooltipWidget';
import type { DataTooltipHost } from '../../src/gui/DataTooltipWidget';
import { escapeHtml, safeCssColor } from '../../src/gui/html';
import { LegendWidget } from '../../src/gui/LegendWidget';
import type { LegendHost, LegendPaneContent } from '../../src/gui/LegendWidget';
import { toolbarContentHtml } from '../../src/gui/ToolbarWidget';
import { defaultOptions } from '../../src/types/options';
import { makeBar } from '../support/fixtures';

/** An attribute breakout: closes the quoted value and adds an event handler. */
const ATTRIBUTE_PAYLOAD = 'x" onmouseover="window.__pwned=1" data-z="';
/** A tag injection: an element whose error handler runs on insertion. */
const TAG_PAYLOAD = '<img src=x onerror="window.__pwned=2">';

/**
 * Whether the payloads survived as live markup: the injected handler as a real
 * attribute, or the injected tag as a real element. The widgets' own inline
 * handlers (the legend's hover opacity) do not count.
 */
function isInjected(html: string): boolean {
  return /onmouseover="window\.__pwned/.test(html) || /<img\b/i.test(html);
}

describe('escapeHtml', () => {
  it('escapes the characters that end text or a quoted attribute', () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('treats null and undefined as empty, and stringifies other values', () => {
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(42), '42');
  });
});

describe('safeCssColor', () => {
  it('accepts hex, colour functions, and keywords', () => {
    for (const color of ['#fff', '#2962FFcc', 'rgba(1, 2, 3, 0.5)', 'hsl(120 50% 50% / 0.2)', 'transparent']) {
      assert.equal(safeCssColor(color, 'fallback'), color);
    }
  });

  it('falls back for anything that could close a declaration or attribute', () => {
    for (const color of ['red" onmouseover="x', 'red; background:url(//a)', 'expression(alert(1))', '', 7, null]) {
      assert.equal(safeCssColor(color, 'fallback'), 'fallback');
    }
  });
});

describe('toolbarContentHtml', () => {
  it('escapes overlay ids, labels, kinds and panes, and drops unsafe colours', () => {
    const html = toolbarContentHtml(
      [{ kind: 'overlay', id: ATTRIBUTE_PAYLOAD, label: TAG_PAYLOAD, color: 'red" onmouseover="x', paneId: ATTRIBUTE_PAYLOAD }],
      '#d1d4dc',
      'Nothing on the chart',
    );
    assert.equal(isInjected(html), false, html);
    assert.match(html, /data-id="x&quot; onmouseover=&quot;/);
    assert.match(html, /&lt;img src=x/);
  });

  it('keeps ordinary ids and colours as they are', () => {
    const html = toolbarContentHtml([{ kind: 'overlay', id: 'overlay_1', label: 'Trend Line', color: '#2962FF' }], '#d1d4dc', 'x');
    assert.match(html, /data-id="overlay_1"/);
    assert.match(html, /color: #2962FF;/);
    assert.match(html, />Trend Line</);
  });

  it('escapes the empty-state text', () => {
    assert.equal(isInjected(toolbarContentHtml([], '#fff', TAG_PAYLOAD)), false);
  });
});

/** A stand-in element: the widgets only write `innerHTML` and query for buttons. */
function fakeElement() {
  return {
    innerHTML: '',
    style: {} as Record<string, string>,
    offsetWidth: 100,
    offsetHeight: 50,
    querySelectorAll: () => [],
  } as unknown as HTMLDivElement;
}

function hostBase() {
  return {
    container: { clientWidth: 800, clientHeight: 400 } as HTMLDivElement,
    getOptions: () => defaultOptions,
    applyOptions: () => {},
    t: (key: string, params?: Record<string, string | number>) => (params?.label ? `${key} ${params.label}` : key),
    getAxisRailColors: () => ({ surface: '#000', stripe: '#111', border: '#222' }),
    formatPrice: (value: number) => value.toFixed(2),
    requestUpdate: () => {},
  };
}

describe('LegendWidget', () => {
  it('escapes series labels, ids, indicator names and values', () => {
    const element = fakeElement();
    const content: LegendPaneContent = {
      paneId: 'main',
      element,
      series: [{
        kind: 'stacked',
        id: ATTRIBUTE_PAYLOAD,
        label: TAG_PAYLOAD,
        bar: makeBar(0, 100),
        upColor: 'red" onmouseover="x',
        downColor: '#ef5350',
        hidden: false,
      }],
      indicators: [{ id: ATTRIBUTE_PAYLOAD, name: TAG_PAYLOAD, values: [{ key: TAG_PAYLOAD, text: TAG_PAYLOAD }] }],
    };
    const host = {
      ...hostBase(),
      getLegendContent: () => [content],
      toggleSeriesVisibility: () => {},
      openSeriesStyleMenu: () => {},
      closeSeriesStyleMenu: () => {},
      removeSeries: () => {},
      removeIndicator: () => {},
    } as unknown as LegendHost;

    new LegendWidget(host).render();
    assert.notEqual(element.innerHTML, '');
    assert.equal(isInjected(element.innerHTML), false, element.innerHTML);
  });
});

describe('DataTooltipWidget', () => {
  it('escapes the extra rows contributed by stacked series', () => {
    const element = fakeElement();
    const host = {
      ...hostBase(),
      formatTime: () => TAG_PAYLOAD,
      isLightBackground: () => false,
    } as unknown as DataTooltipHost;
    const widget = new DataTooltipWidget(host);
    // The element is normally created by mount(), which needs a document.
    (widget as unknown as { _element: HTMLDivElement })._element = element;

    widget.update({
      crosshairPos: { x: 10, y: 10 },
      hoveredData: makeBar(0, 100),
      extraRows: [[TAG_PAYLOAD, TAG_PAYLOAD]],
      leftAxisWidth: 0,
    });
    assert.notEqual(element.innerHTML, '');
    assert.equal(isInjected(element.innerHTML), false, element.innerHTML);
  });
});
