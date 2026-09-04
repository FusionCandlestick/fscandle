import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { priceFormatOptions } from '../../src/model/priceFormat';

const fmt = (price: number, step?: number) =>
  price.toLocaleString('en-US', priceFormatOptions(price, step));

describe('priceFormatOptions', () => {
  it('drops the fractional part at six integer digits', () => {
    assert.equal(fmt(100_000, 50), '100,000');
    assert.equal(fmt(123_456.78, 100), '123,457');
  });

  it('drops decimals for a >= 1000 price on a whole-number step (a round axis)', () => {
    assert.equal(fmt(99_999, 1), '99,999');
    assert.equal(fmt(90_000, 10_000), '90,000');
    assert.equal(fmt(5_000, 50), '5,000');
  });

  it('keeps decimals when the step itself is fractional', () => {
    assert.equal(fmt(1_502.25, 0.25), '1,502.25');
  });

  it('holds a two-decimal floor for sub-1000 prices even when the step is an integer', () => {
    assert.equal(fmt(155, 5), '155.00');
    assert.equal(fmt(42, 1), '42.00');
  });

  it('follows a finer step when the step has more precision than the floor', () => {
    assert.equal(fmt(1.239, 0.001), '1.239');
    assert.equal(fmt(1.2, 0.25), '1.20');
  });

  it('uses scientific notation to 4 significant figures below 0.01', () => {
    assert.equal(fmt(0.00001234, 0.000001), '1.234E-5');
    assert.equal(fmt(0.000000891, 1e-9), '8.91E-7');
  });

  it('does not switch to scientific at or above 0.01', () => {
    assert.equal(fmt(0.01, 0.001), '0.010');
    assert.equal(fmt(0.05, 0.01), '0.05');
  });

  it('is stable without a step', () => {
    assert.equal(fmt(155), '155.00');
    assert.equal(fmt(250_000), '250,000');
  });
});
