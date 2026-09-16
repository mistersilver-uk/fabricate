/**
 * Shared assertions for `game.fabricate.api.COMPANION` answers (issue 1289).
 *
 * Every `stable` member of the companion contract answers in one shape, and three claims are
 * true of EVERY answer it gives: the answer is frozen plain data, it carries exactly the
 * fields the contract documents, and its `message` is a LOCALIZATION KEY that resolves to a
 * real string leaf — never free text, and never a key that renders as a raw dotted path.
 *
 * They live here rather than in one member's suite because three suites make the same claims
 * — the contract vocabulary's own (`tests/companion-contract.test.js`), the knowledge
 * grant's, and the affordability check's — and a per-suite copy of the same six assertions
 * is both a duplication block and three places for the claim to drift.
 *
 * `localizedString` doubles as the namespace-shadowing detector for new keys: a STRING
 * occupying a namespace slot silently shadows every key beneath it, and Foundry's
 * `localize()` then returns the key verbatim while a `text(key, fallback)` idiom renders
 * hardcoded English with nothing failing. Resolving through the real tree and requiring a
 * string leaf is what turns that into a test failure.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LANG = JSON.parse(readFileSync(new URL('../../lang/en.json', import.meta.url), 'utf8'));

/**
 * Resolve a dotted `FABRICATE.…` key against `lang/en.json`.
 *
 * Returns `undefined` for a missing key AND for a key whose ancestor is not an object, so a
 * shadowed namespace is indistinguishable from an absent key — which is correct, because
 * neither renders.
 *
 * @param {string} key
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
 * @param {string} key
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
 * Assert an answer's `messageData` supplies every placeholder its `message` interpolates.
 *
 * `message` is a localization KEY, and Foundry's `format()` leaves an unsupplied `{name}` in
 * the rendered string VERBATIM. So an answer whose data bag is missing one shows a GM
 * "{actor} already knows {recipe}, so nothing was written." with the braces intact — a
 * user-visible defect that no key-set, type or freeze assertion can see, because the answer is
 * perfectly well formed. Two of these shipped past the whole suite (issue 1289): dropping the
 * bag from the `alreadyKnown` answer, and from `systemNotFound`.
 *
 * Derived from the STRING rather than from a per-outcome table, so a placeholder added to an
 * existing string fails at whichever answers already carry that key rather than waiting for
 * someone to remember a table.
 *
 * A `message` that does not resolve is left alone here: {@link assertLocalizationKey} owns that
 * failure, and reporting it twice would bury the cause.
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
 * Assert an answer's `message` is a value in THAT MEMBER's own frozen key table.
 *
 * The `stable` tier's central invariant, asserted on a REAL ANSWER rather than on the table.
 * `assertLocalizationKey` proves a message resolves to a string leaf, and the vocabulary
 * reconciliation in `companion-contract.test.js` proves each table's keys are declared — but
 * neither can see a member that answers with ANOTHER member's key, which would report a failed
 * check in the words of a failed grant while passing both.
 *
 * Shared by all four `stable` members, which is why it lives here rather than in one suite.
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
 * Assert a contract answer WHOLE: frozen, exactly the expected fields, and a resolvable
 * message key.
 *
 * `expected` is the complete answer, message key included, so the field SET is asserted by
 * equality rather than by spot-checks — an answer that grew a field, or lost one, fails here
 * rather than at whichever caller happened to read it.
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
