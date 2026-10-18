import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, pickLang } from '../src/i18n/index.js';
import en from '../src/i18n/en.js';
import ru from '../src/i18n/ru.js';

// The {name} tokens of a string, or of every form of a plural.
const placeholders = (v) => [...new Set((typeof v === 'string' ? [v] : Object.values(v))
  .flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();

test('ru covers every en key with the same placeholders', () => {
  for (const [k, v] of Object.entries(en)) {
    assert.ok(k in ru, `ru lacks ${k}`);
    assert.deepEqual(placeholders(ru[k]), placeholders(v), k);
  }
});

test('ru has no key en lacks', () => {
  for (const k of Object.keys(ru)) assert.ok(k in en, `en lacks ${k}`);
});

test('a Russian plural has every form', () => {
  for (const [k, v] of Object.entries(ru)) {
    if (typeof v === 'object') for (const form of ['one', 'few', 'many', 'other']) assert.ok(v[form], `${k}.${form}`);
  }
});

test('Russian plurals', () => {
  const { t } = createI18n({ lang: 'ru', tables: { en, ru } });
  const RU_ONE = 'Горит *1 лампа из 3*';
  const RU_FEW = 'Горят *2 лампы из 3*';
  const RU_MANY = 'Горят *5 ламп из 9*';
  assert.equal(t('panel.lightsOnCount', { n: 1, total: 3 }), RU_ONE);
  assert.equal(t('panel.lightsOnCount', { n: 2, total: 3 }), RU_FEW);
  assert.equal(t('panel.lightsOnCount', { n: 5, total: 9 }), RU_MANY);
  assert.equal(t('panel.lightsOnCount', { n: 21, total: 30 }), 'Горит *21 лампа из 30*');
  assert.notEqual(RU_FEW, RU_MANY);
});

test('English plurals and placeholders', () => {
  const { t } = createI18n({ lang: 'en', tables: { en, ru } });
  assert.equal(t('panel.lightsOnCount', { n: 1, total: 3 }), '*1 of 3* lights on');
  assert.equal(t('vacuum.dockIn', { room: 'Hall' }), 'Dock in Hall');
  assert.equal(t('vacuum.dockIn'), 'Dock in {room}');
});

test('fallbacks', () => {
  const { t, has } = createI18n({ lang: 'ru', tables: { en: { 'x.only': 'Only en' }, ru: {} } });
  assert.equal(t('x.only'), 'Only en');
  assert.equal(t('x.none'), 'x.none');
  assert.equal(has('x.only'), true);
  assert.equal(has('x.none'), false);
});

test('number format', () => {
  assert.equal(createI18n({ lang: 'ru', tables: { en, ru } }).num(22.5, 1), '22,5');
  assert.equal(createI18n({ lang: 'en', tables: { en, ru } }).num(22.5, 1), '22.5');
  assert.equal(createI18n({ lang: 'ru', tables: { en, ru } }).num(22.46), '22');
});

test('pickLang', () => {
  const s = (q) => new URLSearchParams(q);
  assert.equal(pickLang({ boot: { lang: 'ru' }, search: s(''), navigatorLanguage: 'en-US', isNative: false }), 'ru');
  assert.equal(pickLang({ boot: { lang: 'en' }, search: s('?lang=ru'), navigatorLanguage: 'ru-RU', isNative: false }), 'en');
  assert.equal(pickLang({ boot: null, search: s('?lang=ru'), navigatorLanguage: 'en-US', isNative: true }), 'ru');
  assert.equal(pickLang({ boot: null, search: s(''), navigatorLanguage: 'ru-RU', isNative: false }), 'ru');
  assert.equal(pickLang({ boot: null, search: s(''), navigatorLanguage: 'ru-RU', isNative: true }), 'en');
  assert.equal(pickLang({ boot: null, search: s(''), navigatorLanguage: 'de-DE', isNative: false }), 'en');
  assert.equal(pickLang({ boot: { lang: 'de' }, search: s('?lang=xx'), navigatorLanguage: undefined, isNative: false }), 'en');
});
