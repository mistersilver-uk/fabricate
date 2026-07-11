/**
 * Guard: every `FABRICATE.App.Alchemy.*` localization key the player Alchemy UI
 * references must resolve in `lang/en.json`.
 *
 * Regression: the player strings were originally added under the legacy
 * `FABRICATE.Alchemy.*` block while the components localize `FABRICATE.App.Alchemy.*`
 * (the player-app convention, matching App.Crafting / App.Gathering / …), so the
 * whole tab rendered raw key paths. The mounted test stubs `localize` and the smoke
 * harness never asserts key resolution, so nothing caught it — this test does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function resolveKey(langRoot, dottedKey) {
  return dottedKey.split('.').reduce((node, part) => (node == null ? undefined : node[part]), langRoot);
}

test('every FABRICATE.App.Alchemy.* key referenced by the alchemy UI resolves in en.json', () => {
  const lang = JSON.parse(readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8'));

  const sources = [
    ...readdirSync(join(ROOT, 'src', 'ui', 'svelte', 'apps', 'alchemy'))
      .filter((name) => name.endsWith('.svelte'))
      .map((name) => join('src', 'ui', 'svelte', 'apps', 'alchemy', name)),
    join('src', 'ui', 'svelte', 'stores', 'alchemyStore.svelte.js'),
  ];

  const referenced = new Set();
  for (const relative of sources) {
    const text = readFileSync(join(ROOT, relative), 'utf8');
    for (const match of text.matchAll(/FABRICATE\.App\.Alchemy\.[A-Za-z][A-Za-z.]*/g)) {
      referenced.add(match[0]);
    }
  }

  assert.ok(referenced.size > 0, 'expected the alchemy UI to reference App.Alchemy keys');

  const missing = [...referenced].filter((key) => typeof resolveKey(lang, key) !== 'string').sort();
  assert.deepEqual(missing, [], `unresolved App.Alchemy lang keys: ${missing.join(', ')}`);
});
