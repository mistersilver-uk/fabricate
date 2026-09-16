/**
 * A facade method that delegates must not NARROW what it forwards (issue 1759).
 *
 * `main.js` wraps the run-command service in thin pass-through methods. One of them —
 * `executeJournalRunCommand` — was written to take `command` alone while its own caller passed
 * `(command, options)`. The second argument was dropped on the floor, so `interactive` reverted to
 * its `true` default: `game.fabricate.craft()` on a recipe with a check opened a roll dialog
 * nobody could answer and waited forever. The Foundry smoke met that as a 28-minute Phase E
 * timeout, across two releases.
 *
 * Why it survived a fix is the part worth keeping, because it is the shape of the trap. #1758
 * fixed the service AND the call site, and pinned that call site in `fabricate-api-surface.test.js`
 * under a comment reading "The options are FORWARDED, not dropped". Twelve lines earlier the same
 * file pinned the literal string `executeJournalRunCommand(command)` — the one-argument signature
 * doing the dropping. Both pins passed. Neither could see the gap between them, because a source
 * pin reads one line and this defect lives in the relationship between two.
 *
 * So this gate reads the relationship: for every delegating method, what it hands on must cover
 * what it declares. That generalises past the single method that happened to be wrong.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

/**
 * Normalise line endings before scanning.
 *
 * The checkout is CRLF on Windows and LF in CI. A scan anchored to one of them matches nothing on
 * the other — which is this gate's own failure mode, so it is removed rather than relied upon.
 */
function normaliseEndings(text) {
  return text.split(String.fromCharCode(13) + '\n').join('\n');
}

const mainSource = normaliseEndings(
  readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8')
);

/** A method declared at class-body indentation, with its parameter list and body. */
const METHOD = /\n {2}(?:async )?([A-Za-z_][\w$]*)\(([^)]*)\) \{\n((?: {4}[^\n]*\n|\n)*?) {2}\}/g;

/** `this.<service>?.<sameName>(` — the delegation shape the facade uses throughout. */
const HANDOFF_OWNER = /this\.[A-Za-z_][\w$]*$/;

const parameterNames = (text) =>
  text
    .split(',')
    .map((part) => part.split('=')[0].trim())
    .filter(Boolean);

/**
 * Every method that hands off to a same-named method on one of its own services, as
 * `{ method, declared, forwarded }`.
 *
 * The service property is deliberately not pinned: a new service bag inherits this guard for
 * free, which is the point of gating the defect class rather than the one instance of it.
 */
function delegations() {
  const found = [];
  for (const [, name, params, body] of mainSource.matchAll(METHOD)) {
    const handoff = `?.${name}(`;
    const at = body.indexOf(handoff);
    if (at === -1 || !HANDOFF_OWNER.test(body.slice(0, at))) continue;
    const argsFrom = at + handoff.length;
    const argsTo = body.indexOf(')', argsFrom);
    if (argsTo === -1) continue;
    found.push({
      method: name,
      declared: parameterNames(params),
      forwarded: parameterNames(body.slice(argsFrom, argsTo)),
    });
  }
  return found;
}

test('the gate finds the facade delegations it exists to police', () => {
  // A scan that silently matches nothing is the vacuous shape this work keeps turning up, so the
  // corpus is asserted before anything is concluded from it.
  const names = delegations().map((entry) => entry.method);
  assert.ok(names.length >= 5, `expected several delegating methods, found ${names.length}`);
  assert.ok(
    names.includes('executeJournalRunCommand'),
    `the method this gate was written for must be in the corpus; found ${JSON.stringify(names)}`
  );
});

test('no delegating facade method drops an argument its caller relies on', () => {
  const narrowed = delegations()
    .filter((entry) => entry.declared.some((param) => !entry.forwarded.includes(param)))
    .map(
      (entry) =>
        `${entry.method}(${entry.declared.join(', ')}) forwards only (${entry.forwarded.join(', ')})`
    );
  assert.deepEqual(
    narrowed,
    [],
    'a facade method that declares a parameter and does not hand it on silently reverts the ' +
      'callee to its own default, which is how the public craft API came to open a roll dialog'
  );
});
