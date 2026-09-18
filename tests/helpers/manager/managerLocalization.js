/**
 * The shipped `lang/en.json` strings, for the manager cases that assert on COPY rather than on
 * behaviour (issue 1669, extracted from `tests/components/manager-mounted.test.js`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repoRoot } from '../sourceScan.js';

// The mounted harness stubs `game.i18n.localize` as `(key) => key`, which makes the root's
// `text(key, fallback)` return the FALLBACK for everything.
const SHIPPED_LANG = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

const identityLocalize = (key) => key;

function shippedString(key) {
  let node = SHIPPED_LANG;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return key;
    node = node[part];
  }
  return typeof node === 'string' ? node : key;
}

// Paired with the suite's `afterEach`, which restores the identity localizer whether the
// test passed or threw.
function useShippedLocalization() {
  globalThis.game.i18n.localize = shippedString;
}

export { SHIPPED_LANG, identityLocalize, shippedString, useShippedLocalization };
