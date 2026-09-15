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
  isResolvedFailureOutcome,
  journalRefusalMessage,
  journalRunReasonMessage,
  resolvedFailureMessage,
} from '../src/ui/svelte/util/journalRunReasons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// DISCOVERED, not listed. This guard was first written against two named files, and the
// ledger-arbitration module that landed later carried four more reason literals that it
// therefore could not see — `ledger-create-denied` and `ledger-create-failed` would have
// reached a player as the generic fallback with nothing red.
//
// CORRECTION: this comment used to claim a `journalRun*.js` glob "cannot be blind to the next
// such module". That was wrong, and `authority-unavailable` proved it — minted at five sites in
// `src/main.js` and one in `src/ui/SvelteFabricateApp.svelte.js`, neither of which this glob
// will ever match, and unmapped for as long as it existed. The glob covers the AUTHORITY
// MODULES, not every minting site; a reason minted at an edge is invisible here, so the edges
// now mint through `authorityUnavailableRefusal`/`authorityUnavailableAvailability` in
// `journalRunCommands.js` and the vocabulary has one home this scan can reach. The floor below
// keeps the glob itself from silently matching nothing.
const AUTHORITY_SOURCE_DIR = 'src/systems';
const AUTHORITY_SOURCE_PATTERN = /^journalRun[A-Za-z]*\.js$/;

// The EDGES that also mint a refusal a player reads. Named explicitly, because no glob over the
// authority modules reaches them and every reason minted here was unmapped until issue 1648.
const EDGE_SOURCES = ['src/main.js', 'src/ui/SvelteFabricateApp.svelte.js'];

function authoritySources() {
  const names = readdirSync(join(ROOT, AUTHORITY_SOURCE_DIR))
    .filter((name) => AUTHORITY_SOURCE_PATTERN.test(name))
    .sort();
  assert.ok(
    names.length >= 3,
    `expected at least the three journalRun* authority modules, found ${names.length}: ` +
      'a glob that stops matching makes every assertion below vacuous'
  );
  return [...names.map((name) => `${AUTHORITY_SOURCE_DIR}/${name}`), ...EDGE_SOURCES];
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
    assert.ok(reasons.has('authority-unavailable'), 'the edge refusal is derived too');
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

  // Issue 1648, M15: the two causes must not be conflated, so each maps to its own distinct
  // sentence — an unmade choice is not worded as "complete the current stage requirements".
  it('words an unmade choice apart from a known material shortfall', () => {
    const choiceText = journalRunReasonMessage('choiceRequired', localizeFromLang);
    const materialsText = journalRunReasonMessage('selectionRequired', localizeFromLang);
    assert.equal(choiceText, langLeaf('FABRICATE.App.Journal.Actions.ChoiceRequired'));
    assert.notEqual(choiceText, '');
    assert.notEqual(choiceText, materialsText);
  });

  // Issue 1648, F5. `choiceRequired` fires for an unmade ROUTE, an unmade OPTION pick and an
  // unmade ESSENCE allocation, and its one sentence named only the first — so a player on a
  // single-route stage was told to choose a route that has one value while the real gap was an
  // allocation. The route decision keeps that sentence under its own code; what remains says
  // what it actually is, and says it without naming a route.
  it('gives the route decision its own code and stops the other choices naming a route', () => {
    const routeText = journalRunReasonMessage('routeRequired', localizeFromLang);
    const choiceText = journalRunReasonMessage('choiceRequired', localizeFromLang);
    assert.equal(routeText, langLeaf('FABRICATE.App.Journal.Actions.RouteRequired'));
    assert.match(routeText, /route/i, 'the route decision still says route');
    assert.notEqual(choiceText, routeText, 'two causes, two sentences');
    assert.doesNotMatch(
      choiceText,
      /\broute\b/i,
      'an option pick and an essence allocation are not route decisions'
    );
  });

  // Issue 1648, U4. `SelectionRequired` is reached only for a physical shortfall, and its old
  // sentence — "Complete the current stage requirements first." — was an instruction to go and
  // CHOOSE, which is the one thing that cannot help someone who is short of Iron.
  it('tells a player short of materials to acquire them, not to make a choice', () => {
    const materialsText = journalRunReasonMessage('selectionRequired', localizeFromLang);
    assert.match(materialsText, /acquire/i, 'it names the act that fixes it');
    assert.doesNotMatch(materialsText, /^Complete the current stage requirements/i);
  });

  // Issue 1648, D-029/M19. The badge and the filter tab are one vocabulary, and the maintainer's
  // consequence note is explicit that they must not diverge. `Status.waiting` is gone entirely:
  // a leaf left behind is a word a later reader can reintroduce.
  it('keeps the merged badge and the merged filter tab on one word', () => {
    assert.equal(
      langLeaf('FABRICATE.App.Journal.Filters.Status.InProgress'),
      langLeaf('FABRICATE.App.Journal.Status.inProgress')
    );
    assert.equal(langLeaf('FABRICATE.App.Journal.Status.inProgress'), 'In progress');
    assert.equal(langLeaf('FABRICATE.App.Journal.Status.waiting'), undefined, 'the retired badge word is removed');
    assert.equal(langLeaf('FABRICATE.App.Journal.Filters.Status.Waiting'), undefined, 'and so is the retired tab word');
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

// ── Issue 1648: a failed CHECK is an outcome, and reporting it as a refusal told the
// player "Something went wrong while crafting. Nothing was consumed." while the chat
// card itemised what the failure policy had just consumed.
describe('isResolvedFailureOutcome', () => {
  it('answers true only for a disposition a stage that RAN can mint', () => {
    assert.equal(isResolvedFailureOutcome({ success: false, disposition: 'failed' }), true);
    assert.equal(
      isResolvedFailureOutcome({ success: false, disposition: 'produced-on-failure' }),
      true
    );
    // Every refusal shape a player surface can receive. None reached a check.
    for (const refusal of [
      null,
      undefined,
      {},
      { success: false },
      { success: false, reason: 'ledger-missing' },
      { success: false, reason: 'claim-held', status: 'failed' },
      { success: false, message: 'There is no in-progress craft to execute.' },
      { success: false, disposition: 'error' },
      { success: false, disposition: 'no-match' },
      { success: true, disposition: 'started' },
      { success: true, disposition: 'time-armed' },
    ]) {
      assert.equal(
        isResolvedFailureOutcome(refusal),
        false,
        `a refusal is not an outcome: ${JSON.stringify(refusal)}`
      );
    }
  });

  it('does not key on `status`, which a refusal about a failed run can also carry', () => {
    assert.equal(
      isResolvedFailureOutcome({ success: false, reason: 'stale-run', status: 'failed' }),
      false,
      'the run document being in a failed state says nothing about THIS attempt'
    );
  });
});

describe('resolvedFailureMessage', () => {
  it('states the failed check and claims nothing about consumption', () => {
    const text = resolvedFailureMessage(localizeFromLang);
    assert.equal(text, langLeaf('FABRICATE.App.Crafting.Notify.CheckFailed'));
    assert.ok(text.length > 0, 'the key resolves to a real shipped leaf');
    assert.equal(
      text.toLowerCase().includes('consumed'),
      false,
      'the store cannot know what the failure policy consumed, so it must not say'
    );
    assert.notEqual(
      text,
      langLeaf('FABRICATE.App.Crafting.Notify.CraftFailed'),
      'the generic thrown-error text is a different sentence and stays that way'
    );
  });

  it('always answers a string', () => {
    for (const localize of [null, undefined, 'nope', () => 42, () => undefined, () => '  ']) {
      const answer = resolvedFailureMessage(localize);
      assert.equal(typeof answer, 'string', `a string for ${String(localize)}`);
      assert.notEqual(answer, 'undefined');
    }
  });
});
