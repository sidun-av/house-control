// Every word of the panel comes from the i18n tables: no English string of the table may
// sit in the panel's sources as a literal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from '../src/i18n/en.js';

const FILES = ['src/ui/panel.js', 'src/main.js', 'src/ui/dom.js'];
const ALLOWED = new Set(['House Control']); // a name, the same in every language

test('panel sources hold no literal from the string tables', () => {
  const found = new Set();
  for (const file of FILES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const value of Object.values(en)) {
      if (typeof value !== 'string' || value.length < 3 || value.includes('{') || ALLOWED.has(value)) continue;
      if (src.includes(`'${value}'`) || src.includes(`\`${value}\``)) found.add(`${file}: ${value}`);
    }
  }
  assert.deepEqual([...found], []);
});
