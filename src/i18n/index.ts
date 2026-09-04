import { enUS, PartialTranslationDict, TranslationDict, TranslationKey } from './locales/en-US';
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';

export type { TranslationDict, TranslationKey, PartialTranslationDict };
export { enUS };

const registry = new Map<string, PartialTranslationDict>([
  ['en-US', enUS],
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
]);

export const FALLBACK_LOCALE = 'en-US';

/** Register or override a locale dictionary at runtime. */
export function registerLocale(locale: string, dict: PartialTranslationDict) {
  registry.set(locale, { ...(registry.get(locale) ?? {}), ...dict });
}

export function getRegisteredLocales(): string[] {
  return Array.from(registry.keys());
}

/**
 * Resolve a requested locale to a registered one.
 *
 * Tries the exact tag, then the bare language, then any registered tag sharing
 * that language (so `zh-HK` lands on `zh-TW` rather than English). Returns the
 * fallback locale when nothing matches.
 */
export function resolveLocale(locale: string): string {
  if (registry.has(locale)) return locale;

  const language = locale.split('-')[0].toLowerCase();
  if (registry.has(language)) return language;

  // Traditional-Chinese regions should prefer zh-TW over zh-CN.
  if (language === 'zh') {
    const region = locale.split('-')[1]?.toUpperCase();
    if (region === 'HK' || region === 'MO' || region === 'TW' || region === 'HANT') {
      return 'zh-TW';
    }
  }

  for (const key of registry.keys()) {
    if (key.split('-')[0].toLowerCase() === language) return key;
  }

  return FALLBACK_LOCALE;
}

/** Substitute `{name}` placeholders. Unknown placeholders are left intact. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export class I18n {
  private _locale: string;
  private _dict: PartialTranslationDict;

  constructor(locale: string = FALLBACK_LOCALE) {
    this._locale = resolveLocale(locale);
    this._dict = registry.get(this._locale) ?? enUS;
  }

  public setLocale(locale: string) {
    this._locale = resolveLocale(locale);
    this._dict = registry.get(this._locale) ?? enUS;
  }

  public getLocale(): string {
    return this._locale;
  }

  /**
   * Translate a key. Falls back to English, then to the key itself, so a
   * missing translation degrades to readable text instead of blank UI.
   */
  public t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template = this._dict[key] ?? enUS[key] ?? key;
    return interpolate(template, params);
  }
}
