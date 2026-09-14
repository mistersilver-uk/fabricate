/**
 * The authority reports a refusal as `{ success: false, reason }` with NO `message`,
 * and every player surface used to read `message` alone — so a `ledger-missing` craft
 * toasted the literal text `undefined` and a refused brew/attempt was silent.
 *
 * Two guards live here: the reason vocabulary is a hand-maintained MIRROR of the
 * literals `journalRunAuthority.js`/`journalRunCommands.js` can return, so it is
 * re-derived from those sources on every run rather than trusted; and the chain
 * `journalRefusalMessage` implements is pinned to always answer a string.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  JOURNAL_RUN_REASON_KEYS,
  journalRefusalMessage,
  journalRunReasonMessage,
} from '../src/ui/svelte/util/journalRunReasons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// DISCOVERED, not listed. This guard was first written against two named files, and the
// ledger-arbitration module that landed later carried four more reason literals that it
// therefore could not see — `ledger-create-denied` and `ledger-create-failed` would have
// reached a player as the generic fallback with nothing red. A `journalRun*.js` glob cannot
// be blind to the next such module; the floor below keeps the glob itself from silently
// matching nothing.
const AUTHORITY_SOURCE_DIR = 'src/systems';
const AUTHORITY_SOURCE_PATTERN = /^journalRun[A-Za-z]*\.js$/;

function authoritySources() {
  const names = readdirSync(join(ROOT, AUTHORITY_SOURCE_DIR))
    .filter((name) => AUTHORITY_SOURCE_PATTERN.test(name))
    .sort();
  assert.ok(
    names.length >= 3,
    `expected at least the three journalRun* authority modules, found ${names.length}: ` +
      'a glob that stops matching makes every assertion below vacuous'
  );
  return names.map((name) => `${AUTHORITY_SOURCE_DIR}/${name}`);
}

// A line that mentions `reason`, `unavailable(` or `failure(` carries a refusal code;
// on such a line a HYPHENATED lower-case literal is one. Requiring the hyphen is what
// keeps `'object'`, `'function'` and `'start'` — all of which sit on such lines — out,
// and every code the authority returns is kebab-case with at least one hyphen.
const REASON_LINE = /\breason\b|unavailable\(|failure\(/;
const REASON_LITERAL = /'([a-z][a-z0-9]*(?:-[a-z0-9]+)+)'/g;

function authorityReasons() {
  const found = new Set();
  for (const source of authoritySources()) {
    for (const line of readFileSync(join(ROOT, source), 'utf8').split(/\r?\n/)) {
      if (!REASON_LINE.test(line)) continue;
      for (const match of line.matchAll(REASON_LITERAL)) found.add(match[1]);
    }
  }
  return found;
}

function langLeaf(key) {
  const lang = JSON.parse(readFileSync(join(ROOT, 'lang/en.json'), 'utf8'));
  return key.split('.').reduce((node, segment) => node?.[segment], lang);
}

const localizeFromLang = (key) => {
  const leaf = langLeaf(key);
  return typeof leaf === 'string' ? leaf : key;
};

describe('journal run reason vocabulary', () => {
  it('re-derives a non-trivial reason set from the authority sources', () => {
    const reasons = authorityReasons();
    // Guard the guard: a regex that silently stopped matching would make every
    // assertion below vacuously true.
    assert.ok(
      reasons.size >= 30,
      `expected the authority sources to yield a full reason vocabulary, got ${reasons.size}`
    );
    assert.ok(reasons.has('ledger-missing'), 'the reported defect\u2019s own reason is derived');
    assert.ok(reasons.has('command-timeout'));
    assert.ok(reasons.has('source-owner-required'));
  });

  it('maps every reason the authority can return', () => {
    const unmapped = [...authorityReasons()].filter((reason) => !JOURNAL_RUN_REASON_KEYS[reason]);
    assert.deepEqual(
      unmapped,
      [],
      'these reasons would reach a player as the generic fallback; add them to JOURNAL_RUN_REASON_KEYS'
    );
  });

  // THE OTHER DIRECTION, and it is not symmetry for its own sake. `ledger-already-exists` outlived
  // the refusal that produced it and sat here pointing at an `AuthoritySetup.*` string for a
  // dialog that had been deleted — unreachable, so nothing above could see it. Every HYPHENATED
  // key is an authority reason and must still be one; the camelCase keys are the UI's own
  // `actions.disabledReason` vocabulary and are deliberately exempt.
  it('maps no reason the authority can no longer return', () => {
    const derived = authorityReasons();
    const stale = Object.keys(JOURNAL_RUN_REASON_KEYS).filter(
      (reason) => reason.includes('-') && !derived.has(reason)
    );
    assert.deepEqual(
      stale,
      [],
      'these entries word a refusal nothing produces; delete them with the code that raised them'
    );
  });

  it('resolves every mapped key to a real lang/en.json string', () => {
    const broken = Object.entries(JOURNAL_RUN_REASON_KEYS)
      .filter(([, key]) => typeof langLeaf(key) !== 'string')
      .map(([reason, key]) => `${reason} -> ${key}`);
    assert.deepEqual(broken, [], 'a key with no string leaf renders as its own dotted path');
  });

  it('localizes a known reason and returns empty for anything it cannot word', () => {
    assert.equal(
      journalRunReasonMessage('ledger-missing', localizeFromLang),
      langLeaf('FABRICATE.App.Journal.Actions.LedgerMissing')
    );
    for (const value of [undefined, null, '', '   ', 42, {}, 'not-a-real-reason']) {
      assert.equal(journalRunReasonMessage(value, localizeFromLang), '', `empty for ${String(value)}`);
    }
    assert.equal(journalRunReasonMessage('ledger-missing', null), '', 'no localize means no guess');
  });

  it('never lets a raw slug reach a player', () => {
    assert.equal(journalRunReasonMessage('ledger-missing', localizeFromLang).includes('-'), false);
    assert.equal(journalRefusalMessage({ success: false, reason: 'nope' }, localizeFromLang, 'Generic.'), 'Generic.');
  });
});

describe('journalRefusalMessage chain', () => {
  it('prefers the trimmed message, then the reason, then the generic', () => {
    const localize = localizeFromLang;
    assert.equal(
      journalRefusalMessage({ message: '  Missing materials  ', reason: 'ledger-missing' }, localize, 'Generic.'),
      'Missing materials'
    );
    assert.equal(
      journalRefusalMessage({ success: false, reason: 'ledger-missing' }, localize, 'Generic.'),
      langLeaf('FABRICATE.App.Journal.Actions.LedgerMissing')
    );
    assert.equal(journalRefusalMessage({ success: false }, localize, 'Generic.'), 'Generic.');
    assert.equal(
      journalRefusalMessage({ message: '   ', reason: 'ledger-missing' }, localize, 'Generic.'),
      langLeaf('FABRICATE.App.Journal.Actions.LedgerMissing'),
      'a whitespace-only message does not win the chain'
    );
  });

  it('always answers a string, whatever it is handed', () => {
    for (const result of [null, undefined, {}, { message: 42 }, { message: {} }, { reason: 7 }]) {
      const answer = journalRefusalMessage(result, localizeFromLang, undefined);
      assert.equal(typeof answer, 'string', `a string for ${JSON.stringify(result)}`);
      assert.notEqual(answer, 'undefined');
    }
    assert.equal(typeof journalRefusalMessage({ reason: 'ledger-missing' }, null, null), 'string');
  });
});
