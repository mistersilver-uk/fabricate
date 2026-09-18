/** Shared assertions for `game.fabricate.api.COMPANION` answers (issue 1289). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LANG = JSON.parse(readFileSync(new URL('../../lang/en.json', import.meta.url), 'utf8'));

/**
 * Resolve a dotted `FABRICATE.…` key against `lang/en.json`.
 *
 * @returns {*} the resolved node, or `undefined`
 */
export function localizedString(key) {
  let node = LANG;
  for (const segment of String(key).split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[segment];
  }
  return node;
}

/**
 * Assert one key is a `FABRICATE.*` localization key resolving to a string leaf.
 *
 * @param {string} label what the key is, for the failure message
 */
export function assertLocalizationKey(key, label = 'message') {
  assert.equal(typeof key, 'string', `${label} must be a localization key, not free text`);
  assert.ok(key.startsWith('FABRICATE.'), `${label} must be a FABRICATE key, got ${key}`);
  assert.equal(
    typeof localizedString(key),
    'string',
    `${label} ${key} must resolve to a string leaf in lang/en.json`
  );
}

/**
 * Assert an answer's `messageData` supplies every placeholder its `message` interpolates (issue
 * 1289).
 *
 * @param {object} result the answer under test
 * @param {string} [label] what the answer is, for the failure message
 */
export function assertMessageDataCovers(result, label = 'the answer') {
  const template = localizedString(result?.message);
  if (typeof template !== 'string') return;
  const placeholders = new Set(
    [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(([, name]) => name)
  );
  const data = result?.messageData ?? {};
  const missing = [...placeholders].filter((name) => !(name in data));
  assert.deepEqual(
    missing,
    [],
    `${label} interpolates ${missing.join(', ')} but carries no such messageData, so a GM reads the braces verbatim`
  );
}

/**
 * Assert an answer's `message` is a value in THAT MEMBER's own frozen key table. The `stable`
 * tier's central invariant, asserted on a REAL ANSWER rather than on the table.
 *
 * @param {object} result the answer under test
 * @param {object} messageKeys the member's own outcome -> key table
 * @param {string} [label] what the answer is, for the failure message
 */
export function assertMessageIsFromTable(result, messageKeys, label = 'the answer') {
  const owned = new Set(Object.values(messageKeys));
  assert.ok(
    owned.has(result?.message),
    `${label} answered ${String(result?.message)} for outcome ${String(result?.outcome)}, which is not a value in this member's OWN key table`
  );
}

/**
 * Assert a contract answer WHOLE: frozen, exactly the expected fields, and a resolvable message
 * key.
 *
 * @param {object} result the answer under test
 * @param {object} expected the complete expected answer
 */
export function assertContractResult(result, expected) {
  assert.ok(Object.isFrozen(result), 'a contract answer crosses the boundary frozen');
  assert.deepEqual(
    { ...result },
    expected,
    `unexpected answer for outcome ${String(result?.outcome)}`
  );
  assertLocalizationKey(result.message, `the ${String(result?.outcome)} message`);
  assertMessageDataCovers(result, `the ${String(result?.outcome)} answer`);
}
