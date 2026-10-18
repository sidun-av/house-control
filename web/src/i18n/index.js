// The words of the panel in the reader's language. English is the reference table; a key
// another language lacks falls back to it, and a key nobody has shows as itself, so a
// missing string is visible instead of blank.
import en from './en.js';
import ru from './ru.js';

export const TABLES = { en, ru };
export const LANGS = Object.keys(TABLES);

/**
 * `t(key, params)` fills `{name}` from params; a plural entry `{ one, few, many, other }` is
 * picked by `params.n`. `num(value, digits)` writes a number the local way (22,5 in Russian).
 */
export function createI18n({ lang, tables = TABLES }) {
  const own = tables[lang] || {};
  const base = tables.en || {};
  const rules = new Intl.PluralRules(lang);
  const formats = new Map();

  const entry = (key) => (key in own ? own[key] : key in base ? base[key] : undefined);

  function t(key, params = {}) {
    let text = entry(key);
    if (text === undefined) return key;
    if (typeof text === 'object') {
      const form = Number.isFinite(params.n) ? rules.select(params.n) : 'other';
      text = text[form] ?? text.other ?? text.many ?? '';
    }
    return text.replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all));
  }

  function num(value, digits = 0) {
    let f = formats.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
      formats.set(digits, f);
    }
    return f.format(value);
  }

  return { lang, t, num, has: (key) => entry(key) !== undefined };
}

/**
 * The boot config's `lang`, then `?lang=`, then the browser's language. Inside the native
 * app the system language is not followed: the Mac and iPhone apps stay in English unless
 * told otherwise.
 */
export function pickLang({ boot, search, navigatorLanguage, isNative }) {
  const ok = (l) => (typeof l === 'string' && LANGS.includes(l.toLowerCase()) ? l.toLowerCase() : null);
  return ok(boot?.lang)
    || ok(search?.get('lang'))
    || (isNative ? null : ok(String(navigatorLanguage || '').slice(0, 2)))
    || 'en';
}

const inBrowser = typeof window !== 'undefined';

export const i18n = createI18n({
  lang: inBrowser
    ? pickLang({
      boot: window.__HOUSE_BOOT__,
      search: new URLSearchParams(location.search),
      navigatorLanguage: navigator.language,
      isNative: Boolean(window.webkit?.messageHandlers?.house),
    })
    : 'en',
});
export const t = i18n.t;
export const num = i18n.num;
