/**
 * `src/ui/svelte/util/managerColorTokens.js` — the manager's ONE colour vocabulary
 * (issue 1036).
 *
 * The palette, its ORDER and its names were written out three times before this module
 * existed: in `ManagerColorPopover`'s presets, in `ManagerColorPicker`'s `normalizedToken`,
 * and again in that file's swatch helper. Two of the three could drift apart without any
 * gate noticing, and the visible symptom would be a trigger painting one colour while the
 * popover it opens marks another.
 *
 * The labels are also the entire screen-reader surface of a colour cell — they serve as both
 * `aria-label` and `title` — so they carry real localization keys rather than derived
 * English.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MANAGER_COLOR_TOKENS,
  MANAGER_COLOR_TOKEN_KEYS,
  MANAGER_COLOR_TOKEN_KEY_PREFIX,
  managerColorTokenLabel,
  normalizeManagerColorToken,
} from '../src/ui/svelte/util/managerColorTokens.js';
import { ESSENCE_COLOR_TOKENS } from '../src/ui/svelte/util/essenceIcons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = JSON.parse(readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8'));

test('1036: the palette is the shipped eight, in the shipped order', () => {
  assert.deepEqual(MANAGER_COLOR_TOKEN_KEYS, [
    'sage',
    'mist',
    'lavender',
    'rose',
    'peach',
    'butter',
    'aqua',
    'mauve',
  ]);
});

test('1036: it is the SAME vocabulary the essence colour normalizer accepts', () => {
  // Two lists of the same eight keys is how a per-essence colour ends up authored and then
  // silently normalized away, so they are asserted equal rather than each asserted correct.
  assert.deepEqual([...MANAGER_COLOR_TOKEN_KEYS], [...ESSENCE_COLOR_TOKENS]);
});

test('1036: every token has a real lang key, and the label falls back to English without one', () => {
  const tokenNamespace = MANAGER_COLOR_TOKEN_KEY_PREFIX.split('.')
    .filter(Boolean)
    .reduce((node, part) => node?.[part], { FABRICATE: lang.FABRICATE });

  for (const preset of MANAGER_COLOR_TOKENS) {
    assert.equal(
      typeof tokenNamespace?.[preset.token],
      'string',
      `en.json should define ${MANAGER_COLOR_TOKEN_KEY_PREFIX}${preset.token}`
    );
    assert.equal(
      managerColorTokenLabel(preset.token, (key) => tokenNamespace[key.split('.').pop()]),
      tokenNamespace[preset.token],
      'a localizer that resolves wins'
    );
    assert.equal(
      managerColorTokenLabel(preset.token, (key) => key),
      preset.label,
      'and a localizer that returns the key falls back to the English label'
    );
  }
});

test('1036: the label is a real localization, not a capitalized token', () => {
  // Before this change the name was derived by `charAt(0).toUpperCase()`, which made "Sage"
  // the most-repeated untranslated string on the essence Identity tab. The guard is that a
  // localizer's answer is USED, even when it looks nothing like the token.
  assert.equal(
    managerColorTokenLabel('rose', () => 'Rosé foncé'),
    'Rosé foncé'
  );
});

test('1036: both spellings of a token normalize to the same key', () => {
  assert.equal(normalizeManagerColorToken('--fab-tag-mauve'), 'mauve');
  assert.equal(normalizeManagerColorToken('mauve'), 'mauve');
  assert.equal(
    normalizeManagerColorToken('not-a-colour'),
    'sage',
    'an unrecognised value folds onto sage, which is why `unset` exists as a separate flag'
  );
  assert.equal(normalizeManagerColorToken(undefined), 'sage');
});

test('1036: the module is import-free, so it can be added to a mount harness alone', () => {
  // Every harness that compiles either colour component must copy this module verbatim. A
  // leaf with dependencies would propagate that obligation silently — and an omitted raw
  // module HANGS a hand-rolled harness rather than failing it.
  const source = readFileSync(
    join(ROOT, 'src', 'ui', 'svelte', 'util', 'managerColorTokens.js'),
    'utf8'
  );
  assert.equal(
    /^\s*import\s/m.test(source),
    false,
    'managerColorTokens.js must stay dependency-free'
  );
});
