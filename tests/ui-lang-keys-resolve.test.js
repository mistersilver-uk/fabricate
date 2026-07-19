/**
 * Guard: every literal `FABRICATE.*` key referenced in `src/ui/**` must resolve
 * to a STRING leaf in `lang/en.json`.
 *
 * This catches the invisible i18n failure mode (issues 664/665): a localization
 * key that resolves to `undefined` (missing key) or to an OBJECT (a leaf label
 * used where a namespace exists) silently renders its hardcoded English fallback,
 * so the UI, screenshots, and mounted tests all look correct — nothing fails.
 *
 * Covered reference patterns (all with a literal first-string key):
 *   - inline `text('FABRICATE…')` / `format('FABRICATE…')`;
 *   - `labelKey: 'FABRICATE…'` / `descKey: 'FABRICATE…'` object properties
 *     (option/nav tables rendered later via `text(option.labelKey, …)`);
 *   - `['FABRICATE…', fallback]` array-first-element tables (STATUS/SORT labels).
 *
 * Coverage limit (stated, not total): DYNAMIC references are out of scope — a call
 * whose key is a variable (`text(someKey)` / `text(obj.key)`) or a computed
 * property is resolved at runtime and cannot be checked statically. Only literal
 * `FABRICATE.*` string keys in the patterns above are asserted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI_ROOT = join(ROOT, 'src', 'ui');

// Each pattern captures the literal key in group 2. A dynamic first argument
// (e.g. `text(varKey)`, `labelKey: someVar`) does not start with a quote and is
// therefore never matched — exactly the intended skip.
const KEY_PATTERNS = [
  // text('FABRICATE…') / format("FABRICATE…")
  /\b(?:text|format)\(\s*(['"])(FABRICATE[^'"]*)\1/g,
  // labelKey: 'FABRICATE…' / descKey: "FABRICATE…"
  /\b(?:labelKey|descKey)\s*:\s*(['"])(FABRICATE[^'"]*)\1/g,
  // ['FABRICATE…', fallback] array-first-element label tables
  /\[\s*(['"])(FABRICATE[^'"]*)\1\s*,/g,
];

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.svelte') || entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function resolveKey(langRoot, dottedKey) {
  return dottedKey.split('.').reduce((node, part) => (node == null ? undefined : node[part]), langRoot);
}

test('every literal FABRICATE key in src/ui resolves to a string in en.json', () => {
  const lang = JSON.parse(readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8'));

  const referenced = new Set();
  for (const file of collectSourceFiles(UI_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of KEY_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        referenced.add(match[2]);
      }
    }
  }

  assert.ok(referenced.size > 0, 'expected src/ui to reference literal FABRICATE lang keys');

  const unresolved = [...referenced]
    .filter((key) => typeof resolveKey(lang, key) !== 'string')
    .sort();
  assert.deepEqual(unresolved, [], `unresolved src/ui lang keys: ${unresolved.join(', ')}`);
});
