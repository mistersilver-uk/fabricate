/**
 * A facade method that delegates must not NARROW what it forwards (issue 1759). Why it survived a
 * fix is the part worth keeping, because it is the shape of the trap.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { INSTALLED_FACADE_MEMBERS } from '../src/bootstrap/Fabricate.js';
import { FABRICATE_ENTRY_SOURCE } from './helpers/bootstrapEntrySource.js';

/** Normalise line endings before scanning. */
function normaliseEndings(text) {
  return text.split(String.fromCharCode(13) + '\n').join('\n');
}

const mainSource = normaliseEndings(FABRICATE_ENTRY_SOURCE);

/** A method declared at class-body indentation, with its parameter list and body. */
const METHOD = /\n {2}(?:async )?([A-Za-z_][\w$]*)\(([^)]*)\) \{\n((?: {4}[^\n]*\n|\n)*?) {2}\},?\n/g;

/** `this.<service>?.<sameName>(` — the delegation shape the facade uses throughout. */
const HANDOFF_OWNER = /this\.[A-Za-z_][\w$]*$/;

const parameterNames = (text) =>
  text
    .split(',')
    .map((part) => part.split('=')[0].trim())
    .filter(Boolean);

/**
 * Every method that hands off to a same-named method on one of its own services, as `{ method,
 * declared, forwarded }`.
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

test('every slice member really is installed on the prototype', () => {
  // The export exists so the install is asserted rather than inferred: a slice dropped from the
  // list, or a name declared twice across two slices, is visible here and nowhere else.
  assert.ok(INSTALLED_FACADE_MEMBERS.length > 60, `expected the five slices, got ${INSTALLED_FACADE_MEMBERS.length}`);
  assert.equal(
    new Set(INSTALLED_FACADE_MEMBERS).size,
    INSTALLED_FACADE_MEMBERS.length,
    'two slices declare the same member name, so one silently overwrites the other'
  );
  for (const name of ['craftRecipe', 'startGatheringAttempt', 'awardComponents', 'salvageComponents', 'listJournalForActor']) {
    assert.ok(INSTALLED_FACADE_MEMBERS.includes(name), `${name} is installed`);
  }
});

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
