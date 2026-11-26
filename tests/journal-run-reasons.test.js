/**
 * The authority reports a refusal as `{ success: false, reason }` with NO `message`, and every
 * player surface used to read `message` alone — so a `ledger-missing` craft toasted the literal
 * text `undefined` and a refused brew/attempt was silent.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ITERATIVE_ATTEMPT_REFUSALS } from '../src/systems/iterative/resolveAttempt.js';
import { runStateNotice } from '../src/ui/svelte/apps/journal/runStateNotice.js';
import {
  JOURNAL_RUN_REASON_KEYS,
  REDACTED_REASON_KEYS,
  isResolvedFailureOutcome,
  journalRedactedRefusal,
  journalRefusalMessage,
  journalRunReasonMessage,
  resolvedFailureMessage,
} from '../src/ui/svelte/util/journalRunReasons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// DISCOVERED, not listed. This guard was first written against two named files, and the
// ledger-arbitration module that landed later carried four more reason literals that it therefore
// could not see — `ledger-create-denied` and `ledger-create-failed` would have reached a player as
// the generic fallback with nothing red.
const AUTHORITY_SOURCE_DIR = 'src/systems';
const AUTHORITY_SOURCE_PATTERN = /^journalRun[A-Za-z]*\.js$/;

// The EDGES that also mint a refusal a player reads. Named explicitly, because no glob over the
// authority modules reaches them and every reason minted here was unmapped until issue 1648.
const EDGE_SOURCES = [
  'src/bootstrap/journalOperations.js',
  'src/systems/alchemyStartSelection.js',
  'src/systems/journalPreparedCheck.js',
  'src/ui/SvelteFabricateApp.svelte.js',
  'src/systems/iterative/IterativeAttemptExecutor.js',
  'src/systems/iterative/iterativeAttemptCheck.js',
  'src/systems/iterative/iterativeJournalOperation.js',
  'src/systems/iterative/iterativeCraftGate.js',
  'src/systems/iterative/iterativeStepStart.js',
];

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

// The resolver's refusals are a frozen map of values, not `reason` lines, so they are unioned in.
function authorityReasons() {
  const found = new Set(Object.values(ITERATIVE_ATTEMPT_REFUSALS));
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

  // THE OTHER DIRECTION, and it is not symmetry for its own sake.
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

  // A refused start creates no run and a claim can belong to none, so the claim's refusal must
  // never speak of a run, while the run-level blocker keeps its own wording.
  it('words the retained claim apart from the run-level recovery blocker', () => {
    const claimText = journalRunReasonMessage('recovery-required', localizeFromLang);
    const runText = journalRunReasonMessage('recoveryRequired', localizeFromLang);
    assert.equal(claimText, langLeaf('FABRICATE.App.Journal.Actions.ClaimRetained'));
    assert.equal(runText, langLeaf('FABRICATE.App.Journal.Actions.RecoveryRequired'));
    assert.notEqual(claimText, runText);
    assert.doesNotMatch(claimText, /\brun\b/i, 'a refused start has no run to name');
  });

  it('words the retained-claim prompt for the claim, never for a run', () => {
    const words = Object.values(langLeaf('FABRICATE.App.Journal.Recovery')).filter(
      (value) => typeof value === 'string'
    );
    assert.ok(words.length >= 10, 'positive control: the prompt vocabulary was read');
    for (const text of words) assert.doesNotMatch(text, /\bthis run\b/i, text);
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

  // Issue 1648, F5. `choiceRequired` fires for an unmade ROUTE, an unmade OPTION pick and an unmade
  // ESSENCE allocation, and its one sentence named only the first — so a player on a single-route
  // stage was told to choose a route that has one value while the real gap was an allocation.
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
  // consequence note is explicit that they must not diverge.
  it('keeps the merged badge and the merged filter tab on one word', () => {
    assert.equal(
      langLeaf('FABRICATE.App.Journal.Filters.Status.InProgress'),
      langLeaf('FABRICATE.App.Journal.Status.inProgress')
    );
    assert.equal(langLeaf('FABRICATE.App.Journal.Status.inProgress'), 'In progress');
    assert.equal(langLeaf('FABRICATE.App.Journal.Status.waiting'), undefined, 'the retired badge word is removed');
    assert.equal(langLeaf('FABRICATE.App.Journal.Filters.Status.Waiting'), undefined, 'and so is the retired tab word');
  });

  it('words every Iterative Attempt refusal without a placeholder, saying nothing was spent', () => {
    const keys = Object.entries(JOURNAL_RUN_REASON_KEYS).filter(([, key]) =>
      key.startsWith('FABRICATE.App.Journal.Reason.Iterative')
    );
    assert.equal(keys.length, 13, 'positive control: every C4 sentence was read');
    for (const [reason, key] of keys) {
      const text = langLeaf(key);
      assert.doesNotMatch(text, /\{/, reason);
      if (reason === 'check-mismatch') assert.match(text, /workpiece is unchanged/, reason);
      else assert.match(text, /Nothing was spent/, reason);
      // Every attempt refusal also says the session was not counted; the start refusal has none.
      if (reason === 'iterative-not-ready') assert.doesNotMatch(text, /session/, reason);
      else assert.match(text, /the session wasn’t counted\.$/, reason);
    }
    for (const reason of Object.values(ITERATIVE_ATTEMPT_REFUSALS)) {
      assert.ok(JOURNAL_RUN_REASON_KEYS[reason], `${reason} is mapped`);
    }
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

// Issue 3033: a viewer the recipe is hidden from is told why a stage waits, never what it holds.
describe('redacted reason wording', () => {
  const redacted = { redacted: true };
  const notice = (run) => runStateNotice(run, localizeFromLang);
  const hiddenRun = (disabledReason, extra = {}) => ({
    redacted: true, actions: { disabledReason, execute: false, beginStep: false }, ...extra,
  });

  it('words each overlaid code for a redacted viewer and leaves the shared text alone', () => {
    assert.deepEqual(Object.keys(REDACTED_REASON_KEYS), ['routeRequired', 'choiceRequired',
      'awardChoicePending', 'toolRequired', 'selectionRequired', 'essenceRequired']);
    for (const [code, key] of Object.entries(REDACTED_REASON_KEYS)) {
      assert.equal(typeof langLeaf(key), 'string', `${key} is a shipped string`);
      assert.equal(journalRunReasonMessage(code, localizeFromLang, redacted), langLeaf(key), code);
      const shared = langLeaf(JOURNAL_RUN_REASON_KEYS[code]);
      assert.equal(journalRunReasonMessage(code, localizeFromLang), shared, `${code} unchanged`);
      assert.notEqual(shared, langLeaf(key), `${code} is reworded`);
    }
    for (const code of ['currencyRequired', 'routeUnavailable', 'sourcesUnavailable', 'stageNotStarted'])
      assert.equal(journalRunReasonMessage(code, localizeFromLang, redacted),
        langLeaf(JOURNAL_RUN_REASON_KEYS[code]), `${code} asks for no pick, so it stays shared`);
  });

  it('carries no placeholder through which a route, material or tool could be named', () => {
    const keys = [...Object.values(REDACTED_REASON_KEYS),
      'FABRICATE.App.Journal.Actions.RedactedBeginStepPrompt',
      'FABRICATE.App.Journal.Notice.RedactedChoiceTitle',
      'FABRICATE.App.Journal.Notice.RedactedChoiceDetail'];
    for (const key of keys) assert.doesNotMatch(langLeaf(key), /[{}]/, key);
  });

  it('reports a redacted refusal by its code and never by the engine sentence', () => {
    const tool = { success: false, message: 'Missing required tool (Qzx-Tool)', blocker: 'toolRequired' };
    assert.equal(journalRedactedRefusal(tool, localizeFromLang, 'Generic.'),
      langLeaf(REDACTED_REASON_KEYS.toolRequired));
    assert.equal(journalRedactedRefusal({ message: 'Qzx', reason: 'ledger-missing' }, localizeFromLang, 'Generic.'),
      langLeaf(JOURNAL_RUN_REASON_KEYS['ledger-missing']));
    assert.equal(journalRedactedRefusal({ message: 'Missing Qzx Ore' }, localizeFromLang, ' Generic. '), 'Generic.');
    assert.equal(journalRedactedRefusal(null, localizeFromLang, undefined), '');
  });

  it('raises the withheld-pick notice for a redacted route or option pick', () => {
    for (const code of ['routeRequired', 'choiceRequired']) {
      const withheld = notice(hiddenRun(code));
      assert.equal(withheld.tone, 'info', code);
      assert.equal(withheld.blocking, false);
      assert.equal(withheld.title, langLeaf('FABRICATE.App.Journal.Notice.RedactedChoiceTitle'));
      assert.equal(withheld.detail, langLeaf('FABRICATE.App.Journal.Notice.RedactedChoiceDetail'));
      assert.deepEqual(withheld.hooks, { 'data-journal-awaiting-choice': 'true',
        'data-journal-choice-withheld': 'true' });
      const paused = notice(hiddenRun(code, { pauseState: { pausedAt: 1 } }));
      assert.equal(paused.hooks['data-journal-paused'], 'true', 'the paused hook rides along');
    }
    assert.equal(notice(hiddenRun('stageNotStarted')), null, 'an unbegun stage is ordinary play');
    assert.equal(notice({ ...hiddenRun('routeRequired'), redacted: false }), null,
      'a visible run is asked through its own awaitingChoice notice');
    assert.equal(notice({ ...hiddenRun('routeRequired'), redacted: false, awaitingChoice: true }).title,
      langLeaf('FABRICATE.App.Journal.Notice.ChoiceTitle'));
  });

  it('titles a redacted shortfall banner in redacted words', () => {
    for (const code of ['selectionRequired', 'essenceRequired', 'toolRequired']) {
      const banner = notice(hiddenRun(code));
      assert.equal(banner.hooks['data-journal-action-blocker'], code);
      assert.equal(banner.title, langLeaf(REDACTED_REASON_KEYS[code]), code);
      assert.equal(notice({ ...hiddenRun(code), redacted: false }).title,
        langLeaf(JOURNAL_RUN_REASON_KEYS[code]), `${code} visible title unchanged`);
    }
  });
});

// Issue 1648: a failed CHECK is an outcome, and reporting it as a refusal told the player
// "Something went wrong while crafting.
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
