import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FALLBACK_LOCALE,
  I18n,
  getRegisteredLocales,
  registerLocale,
  resolveLocale,
} from '../../src/i18n';
import { enUS } from '../../src/i18n/locales/en-US';
import { zhCN } from '../../src/i18n/locales/zh-CN';

describe('resolveLocale', () => {
  it('resolves an exact registered tag', () => {
    assert.equal(resolveLocale('zh-CN'), 'zh-CN');
    assert.equal(resolveLocale('en-US'), 'en-US');
  });

  it('routes traditional-Chinese regions to zh-TW rather than zh-CN', () => {
    assert.equal(resolveLocale('zh-HK'), 'zh-TW');
    assert.equal(resolveLocale('zh-MO'), 'zh-TW');
    assert.equal(resolveLocale('zh-TW'), 'zh-TW');
  });

  it('falls back to a same-language tag for unknown regions', () => {
    assert.equal(resolveLocale('zh-XX'), 'zh-CN');
    assert.equal(resolveLocale('en-GB'), 'en-US');
  });

  it('falls back to English for unknown languages', () => {
    assert.equal(resolveLocale('xx-YY'), FALLBACK_LOCALE);
    assert.equal(resolveLocale(''), FALLBACK_LOCALE);
  });
});

describe('I18n.t', () => {
  it('returns the locale translation when present', () => {
    const i18n = new I18n('zh-CN');
    assert.equal(i18n.t('toolbar.undo'), zhCN['toolbar.undo']);
  });

  it('falls back to English for an untranslated key', () => {
    registerLocale('xx-TEST', { 'toolbar.undo': 'UNDO-XX' });
    const i18n = new I18n('xx-TEST');
    assert.equal(i18n.t('toolbar.undo'), 'UNDO-XX');
    // Not overridden, so it should read through to English.
    assert.equal(i18n.t('toolbar.redo'), enUS['toolbar.redo']);
  });

  it('interpolates named parameters', () => {
    const i18n = new I18n('en-US');
    assert.equal(i18n.t('legend.adjust', { label: 'MACD' }), 'Adjust MACD');
  });

  it('leaves unknown placeholders intact rather than printing undefined', () => {
    registerLocale('xx-PLACEHOLDER', { 'toolbar.undo': 'a {known} b {missing}' });
    const i18n = new I18n('xx-PLACEHOLDER');
    assert.equal(i18n.t('toolbar.undo', { known: 'X' }), 'a X b {missing}');
  });

  it('switches locale in place', () => {
    const i18n = new I18n('en-US');
    assert.equal(i18n.t('toolbar.undo'), enUS['toolbar.undo']);
    i18n.setLocale('zh-CN');
    assert.equal(i18n.getLocale(), 'zh-CN');
    assert.equal(i18n.t('toolbar.undo'), zhCN['toolbar.undo']);
  });
});

describe('locale dictionaries', () => {
  it('ships the documented set of locales', () => {
    const locales = getRegisteredLocales();
    for (const expected of ['en-US', 'zh-CN', 'zh-TW']) {
      assert.ok(locales.includes(expected), `missing locale ${expected}`);
    }
    for (const dropped of ['ja-JP', 'ko-KR', 'de-DE', 'es-ES', 'fr-FR', 'ru-RU']) {
      assert.ok(!locales.includes(dropped), `${dropped} should no longer be bundled`);
    }
  });

  it('has no empty translation values', () => {
    for (const locale of ['zh-CN', 'zh-TW']) {
      const i18n = new I18n(locale);
      for (const key of Object.keys(enUS) as Array<keyof typeof enUS>) {
        assert.ok(i18n.t(key).length > 0, `${locale}/${String(key)} is empty`);
      }
    }
  });
});
