// Every word of the panel comes from the i18n tables: no English string of the table may
// sit in the panel's sources as a literal, no other English text may either, and every key
// the sources name exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from '../src/i18n/en.js';

const FILES = ['src/ui/panel.js', 'src/main.js', 'src/ui/dom.js'];
const ALLOWED = new Set(['House Control']); // a name, the same in every language

/**
 * The string literals of a source file ('…', "…" and `…`), comments left out. A template's
 * `${…}` parts stay in its text. Good enough for these files: they hold no regex literal
 * with a quote in it.
 */
export function literals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; if (i < 2) break; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let depth = 0; // inside a template's ${…}
      let from = 0;
      const inner = [];
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') { if (!depth++) from = j + 2; j += 2; continue; }
        if (c === '`' && depth && src[j] === '{') { depth++; j++; continue; }
        if (c === '`' && depth && src[j] === '}') { if (!--depth) inner.push(src.slice(from, j)); j++; continue; }
        if (src[j] === c && !depth) break;
        if (c !== '`' && src[j] === '\n') break;
        j++;
      }
      out.push({ quote: c, text: src.slice(i + 1, j) });
      for (const expr of inner) out.push(...literals(expr)); // `${on ? 'All on' : ''}`
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// Each form of each table string as a pattern over a literal's whole (trimmed) text: `*` is
// dropped, a `{name}` matches anything (a `${…}` in a template). Only strings with at least
// three letters of their own are looked for, so `{n}%` or `On` cannot match code.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(en).flatMap(([key, value]) => (typeof value === 'string' ? [value] : Object.values(value))
  .map((form) => form.replace(/\*/g, ''))
  .filter((form) => !ALLOWED.has(form) && (form.replace(/\{\w+\}/g, '').match(/[A-Za-z]/g) || []).length >= 3)
  .map((form) => ({ key, form, re: new RegExp(`^${form.trim().split(/\{\w+\}/).map(escape).join('.*?')}$`, 's') })));

// English prose that is in no table: two words in a row ("Charging soon", " lights on"), or
// a capitalised word followed by lower case letters ("Cooling"). What looks like that in
// code and is no text for people is listed here.
const CODE = new Set([
  'Enter', 'Escape', // KeyboardEvent.key
  'Widget', // who made a change, for the native shell's other views
]);
const prose = (text) => {
  const plain = text.replace(/\$\{[^}]*\}/g, ' ').trim();
  if (!plain || CODE.has(plain) || ALLOWED.has(plain)) return false;
  if (/^[a-z-]+\(/.test(plain)) return false; // a CSS value: var(…), rgba(…), linear-gradient(…)
  return /[A-Za-z]{2,}[,.:;!?]? +[A-Za-z]{2,}/.test(plain) || /^[A-Z][a-z]{2,}\b/.test(plain);
};

const sources = FILES.map((file) => ({ file, src: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') }));

test('panel sources hold no literal from the string tables', () => {
  const found = [];
  for (const { file, src } of sources) {
    for (const { text } of literals(src)) {
      for (const p of patterns) if (p.re.test(text.trim())) found.push(`${file}: ${JSON.stringify(text)} is ${p.key}`);
    }
  }
  assert.deepEqual(found, []);
});

test('panel sources hold no other English text', () => {
  const found = [];
  for (const { file, src } of sources) {
    for (const { text } of literals(src)) {
      // A template is checked between its ${…} parts; a selector or a class list never has a space and a capital.
      if (prose(text)) found.push(`${file}: ${JSON.stringify(text)}`);
    }
  }
  assert.deepEqual(found, []);
});

test('every key the panel names is in the English table', () => {
  const missing = [];
  for (const { file, src } of sources) {
    for (const [, key] of src.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) if (!(key in en)) missing.push(`${file}: ${key}`);
  }
  assert.deepEqual(missing, []);
});

test('the checks catch what they are for', () => {
  const src = [
    "h('b', 'No'), ' lights on'", // the old header, split across literals
    'const a = "All on";', // double quotes
    "const b = 'All on ';", // a trailing space
    'const c = `Dock in ${room}`;', // a placeholder key
    "const g = `${on ? 'Whole home' : ''}!`;", // inside a template's ${…}
    "const d = '3 of 5 on';", // a plural key, filled in by hand
    "const e = 'Charging soon';", // English in no table
    "const f = 'Cooling';",
    "// a comment's 'Quoted text' is no literal",
  ].join('\n');
  const texts = literals(src).map((l) => l.text);
  assert.ok(!texts.includes('Quoted text'));
  const fromTable = texts.filter((x) => patterns.some((p) => p.re.test(x.trim())));
  assert.deepEqual(fromTable, ['All on', 'All on ', 'Dock in ${room}', 'Whole home', '3 of 5 on']);
  assert.deepEqual(texts.filter(prose), [' lights on', 'All on', 'All on ', 'Dock in ${room}', 'Whole home', 'Charging soon', 'Cooling']);
  // and stay quiet on code
  for (const code of ['div.tile-sub', 'keydown', 'Enter', 'house-control:state:v1', 'rgba(255,255,255,.25)', '${id}', 'image/jpeg', 'button.round.power', 'House Control',
    'var(--safe-top-preview, env(safe-area-inset-top, 0px))', 'linear-gradient(90deg, #4a4f5e 0%, #ffe2b0 100%)', '../i18n/index.js']) {
    assert.ok(!prose(code) && !patterns.some((p) => p.re.test(code)), code);
  }
});
