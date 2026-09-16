/**
 * NO RULE SENTENCE IS LOST WHEN THE HARNESS DOCUMENTS ARE SPLIT (issue #1661, phases 3-5).
 *
 * `AGENTS.md`, `CLAUDE.md` and `CONTRIBUTING.md` are being split into a short rulebook plus
 * reference files loaded on demand, across several PRs. The issue's acceptance for that was "a
 * diff review confirms no rule sentence was lost". A human diff review of an 1,100-line move is
 * exactly where a lost sentence hides, so this is the mechanical replacement, and it lands BEFORE
 * any text moves — a gate added after the move it was meant to guard has nothing left to guard.
 *
 * HOW IT WORKS. `tests/fixtures/doc-split/*.pre-split.md` are byte copies of the three documents
 * as they stood before any split. Every rule-bearing line of those is asserted to survive, the
 * same number of times, somewhere in the post-split set — which is enumerated by explicit path in
 * `DESTINATIONS` below, never by directory glob, so adding a file cannot silently satisfy this.
 *
 * WHY A MULTISET AND NOT A SET. If a rule appears twice in the old documents and once in the new,
 * a set comparison is satisfied while one of the two places that stated it has stopped stating it.
 * The issue's own verification allowed for "minus duplicated paragraphs", which is a loophole
 * wide enough to lose a rule through: a deliberate de-duplication must name the surviving location
 * and is checked against it, and the allowlist's length is pinned so it cannot quietly grow.
 *
 * WHILE NOTHING HAS MOVED YET this passes trivially — `DESTINATIONS` is the same three files. That
 * is the correct state for a gate armed ahead of the work, and it is also the state in which a
 * broken checker is invisible. So the falsification below is not decoration: it drives the real
 * comparator against deletion, reordering and REWORDING, the last being the edit a reviewer cannot
 * catch by eye and the one a laxer normalisation would wave through.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  missingSentences,
  multiset,
  sentencesOf,
  withoutCounts,
  withoutLinkTargets,
} from '../scripts/lib/docSentences.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = 'tests/fixtures/doc-split';

/** The pre-split documents, by the fixture that froze each one. Each floor sits just under the
 * fixture's sentence count, which fell when `sentencesOf` began joining hard wraps (issue #1661). */
const SOURCES = [
  { fixture: `${FIXTURES}/AGENTS.pre-split.md`, floor: 850 },
  { fixture: `${FIXTURES}/CLAUDE.pre-split.md`, floor: 42 },
  { fixture: `${FIXTURES}/CONTRIBUTING.pre-split.md`, floor: 900 },
];

/**
 * Every file a sentence is allowed to have moved INTO, by explicit path.
 *
 * NOT A GLOB, and that is the load-bearing part. A directory glob would let a stray file — a
 * scratch note, an unrelated document that happens to quote a rule — satisfy the assertion, so a
 * sentence could read as surviving in a file nothing else knows about. Phases 3-5 add their
 * destinations here, which is a visible edit in the PR that moves the text.
 */
const DESTINATIONS = [
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  // Phase 3: the smoke-harness narrative and the CI-workflow narrative, moved beside the code
  // they describe.
  'scripts/README.md',
  '.github/workflows/README.md',
  // Phase 4: the FoundryVTT notes and architecture pointers, moved whole.
  '.agents/docs/foundry-and-architecture.md',
];

/**
 * Sentences deliberately dropped, each naming the location that still carries them.
 *
 * The one admissible reason is de-duplication: the same rule stated twice, now stated once. A bare
 * "this was a duplicate" is not admissible — the entry names where it survives, and the assertion
 * below checks that file actually contains it. Same shape as ALLOW_MISSING in
 * `scripts/validate-agent-bindings.mjs`, where every exception carries a reason that is checkable.
 *
 * Empty, because nothing has moved yet. It is pinned at its length so that an entry cannot be
 * appended as the cheap way to green a real loss.
 */
const DEDUPLICATED = [];

/** Pinned exactly, not as a ceiling: a ceiling banks a free slot on every entry that is retired. */
const DEDUPLICATED_COUNT = 0;

/**
 * Sentences a move forced to change, where the only change is a link TARGET.
 *
 * When a heading moves to another file, the in-file `(#anchor)` links pointing at it have to
 * become `(path/to.md#anchor)`. That is a changed sentence and the subset assertion reports it,
 * which is correct — so the allowance is made here, and made narrowly: the test asserts that
 * stripping link targets from both makes them the same string. A retarget is admissible; a
 * reworded rule wearing a retarget's clothes is not.
 */
const RETARGETED = [
  {
    before: 'See [Manager confirm-discard guard](#manager-confirm-discard-guard).',
    after:
      'See [Manager confirm-discard guard](.agents/docs/foundry-and-architecture.md#manager-confirm-discard-guard).',
  },
];

/** Pinned for the same reason as DEDUPLICATED_COUNT. */
const RETARGETED_COUNT = 1;

/**
 * Sentences that state a View Lab registry case count, where the only change is that NUMBER.
 *
 * `scripts/lib/viewLabCases.js` grows independently of the AGENTS.md/CLAUDE.md/CONTRIBUTING.md
 * split, and these frozen sentences state the registry size directly, so a case-count PR changes
 * them for a reason that has nothing to do with a move. RETARGETED's shape — pin the literal
 * replacement text — does not fit here: the count keeps changing (it is already 463, and TP14-F
 * raises it again to 479), so a pinned `after` string would need editing on every registry change,
 * which is the churn this allowance exists to avoid.
 *
 * So each entry is the frozen `before` sentence only, and the proof is narrower instead of the
 * replacement being narrower: `withoutCounts` (digits replaced with a placeholder) must match
 * EXACTLY ONE surviving sentence, and the frozen text itself must no longer be present. Every
 * character that is not part of a digit run must still match exactly, so a reworded rule cannot
 * hide behind a coincidental digit change.
 */
const RENUMBERED = [
  'As of this writing the registry holds 379 cases: 148 `exact`, 8 `window`, 223 `beyond`.',
  'By default a PR touching the case registry, `labActors.js`, `labRunStates.js`, or any other ' +
    'file the lab depends on selects **surface coverage**: one frame of every route and tab the ' +
    'lab renders — every manager route, every player tab, one per single-screen canvas window, ' +
    'plus the light-theme pair — which is 48 of the 379 publishable cases.',
  'For a view covered by the canonical registry (`scripts/lib/viewLabCases.js`) — which is the ' +
    'normal case, at 379 cases across five windows — the **View Lab** is the producer, and it is ' +
    'what CI runs on every PR push: `node scripts/view-lab-screenshots.mjs apps` renders every ' +
    'case, or pass a comma-separated id list to render a subset, into `ui-screenshot-artifact/apps/`.',
];

/** Pinned for the same reason as DEDUPLICATED_COUNT and RETARGETED_COUNT. */
const RENUMBERED_COUNT = 3;

/** Every sentence of the post-split set, as one multiset. */
function survivingSentences() {
  const all = [];
  for (const destination of DESTINATIONS) {
    const absolute = path.join(REPOSITORY_ROOT, destination);
    assert.ok(existsSync(absolute), `DESTINATIONS names ${destination}, which is not in the checkout`);
    all.push(...sentencesOf(readFileSync(absolute, 'utf8')));
  }
  return multiset(all);
}

test('the frozen fixtures are the documents they claim to be', () => {
  // A checker fed an empty or unreadable OLD passes trivially, which is the commonest way a
  // migration gate is green on arrival. Each fixture is floored at a count derived from the real
  // document, so a truncated or emptied one fails here rather than everywhere else silently.
  for (const { fixture, floor } of SOURCES) {
    const absolute = path.join(REPOSITORY_ROOT, fixture);
    assert.ok(existsSync(absolute), `${fixture} is missing; it is the only record of the old text`);
    const count = sentencesOf(readFileSync(absolute, 'utf8')).length;
    assert.ok(
      count >= floor,
      `${fixture} yields ${count} sentences, under its floor of ${floor}. Either it has been ` +
        'truncated, or the normaliser has stopped recognising rule text — both make every ' +
        'assertion below pass over a smaller corpus than the one that matters.'
    );
  }
});

test('every sentence of the pre-split documents still exists somewhere', () => {
  const before = multiset(SOURCES.flatMap(({ fixture }) => sentencesOf(readFileSync(path.join(REPOSITORY_ROOT, fixture), 'utf8'))));
  const after = survivingSentences();
  const allowed = new Set([
    ...DEDUPLICATED.map(({ sentence }) => sentence),
    ...RETARGETED.map(({ before }) => before),
    ...RENUMBERED,
  ]);
  const lost = missingSentences(before, after).filter(({ sentence }) => !allowed.has(sentence));

  assert.deepEqual(
    lost.map(({ sentence, before: was, after: now }) => `(${was} -> ${now}) ${sentence}`),
    [],
    'these sentences were in the harness documents before the split and are not in the files ' +
      'DESTINATIONS names. Move them, or — if one is a genuine duplicate that now lives in one ' +
      'place — add it to DEDUPLICATED with the file that still carries it, and raise ' +
      'DEDUPLICATED_COUNT in the same commit. If only a registry case count changed, add it to ' +
      'RENUMBERED and raise RENUMBERED_COUNT instead.'
  );
});

test('every deduplication claim names a place that really carries the sentence', () => {
  assert.equal(
    DEDUPLICATED.length,
    DEDUPLICATED_COUNT,
    'the deduplication allowlist changed size. Growing it means deliberately dropping one ' +
      'statement of a rule, which needs its own justification in review; shrinking it means ' +
      'lowering this number in the same commit.'
  );

  for (const { sentence, survivesIn } of DEDUPLICATED) {
    assert.ok(
      DESTINATIONS.includes(survivesIn),
      `${survivesIn} is not in DESTINATIONS, so nothing checks it`
    );
    const text = sentencesOf(readFileSync(path.join(REPOSITORY_ROOT, survivesIn), 'utf8'));
    assert.ok(
      text.includes(sentence),
      `DEDUPLICATED says this sentence survives in ${survivesIn}, and it does not:\n  ${sentence}`
    );
  }
});

test('every retarget claim really is a retarget and nothing more', () => {
  assert.equal(
    RETARGETED.length,
    RETARGETED_COUNT,
    'the retarget allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const { before, after } of RETARGETED) {
    // 1. The replacement must actually be somewhere, or the sentence is simply gone.
    assert.ok(
      (surviving.get(after) ?? 0) > 0,
      `RETARGETED claims this replaced a sentence and it is in no destination:\n  ${after}`
    );
    // 2. THE ONLY DIFFERENCE MAY BE THE LINK TARGET. Without this the allowlist is a hole big
    //    enough to rewrite a rule through, which is the exact loophole this whole file exists to
    //    close on the deduplication side.
    assert.equal(
      withoutLinkTargets(after),
      withoutLinkTargets(before),
      'a RETARGETED entry changed more than a link target, so it is a rewrite, not a retarget'
    );
    // 3. And it must not be stale: an entry whose `before` still exists excuses nothing.
    assert.equal(
      surviving.get(before) ?? 0,
      0,
      `RETARGETED still lists this sentence, which is present after all — remove the entry:\n  ${before}`
    );
  }
});

test('every renumbering claim really is a renumbering and nothing more', () => {
  assert.equal(
    RENUMBERED.length,
    RENUMBERED_COUNT,
    'the renumbering allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const sentence of RENUMBERED) {
    // 1. It must not be stale: an entry whose text still exists excuses nothing.
    assert.equal(
      surviving.get(sentence) ?? 0,
      0,
      `RENUMBERED still lists this sentence, which is present after all — remove the entry:\n  ${sentence}`
    );
    // 2. Exactly one surviving sentence may match once digits are ignored. Zero means the count
    //    changed into a sentence that also changed some other word; more than one means the digit
    //    normalisation is too coarse to say which surviving sentence replaced this one.
    const target = withoutCounts(sentence);
    const matches = [...surviving.keys()].filter((candidate) => withoutCounts(candidate) === target);
    assert.equal(
      matches.length,
      1,
      `RENUMBERED entry does not match exactly one surviving sentence once digits are ignored ` +
        `(found ${matches.length}):\n  ${sentence}`
    );
  }
});

test('the comparator catches deletion, reordering and rewording', () => {
  // A gate that has only ever been watched to report nothing is not known to work. Each case below
  // is a way the split can actually go wrong, and the third is the one a laxer normaliser — one
  // that folded case or stripped punctuation "to be forgiving" — would wave through.
  const original = ['Never import them directly.', 'Read the token through `.document`.', 'Do not conflate the two.'];
  const before = multiset(original);

  // 1. Unchanged is clean.
  assert.deepEqual(missingSentences(before, multiset(original)), []);

  // 2. Reordering is NOT a loss. A move legitimately changes order.
  assert.deepEqual(missingSentences(before, multiset([...original].reverse())), []);

  // 3. Deletion is caught, and names the sentence.
  const deleted = missingSentences(before, multiset(original.slice(1)));
  assert.deepEqual(deleted.map(({ sentence }) => sentence), ['Never import them directly.']);

  // 4. REWORDING is caught. Same rule, different words: the sentence that went is reported and the
  //    replacement is not credited for it.
  const reworded = missingSentences(
    before,
    multiset(['Never import these directly.', ...original.slice(1)])
  );
  assert.deepEqual(reworded.map(({ sentence }) => sentence), ['Never import them directly.']);

  // 5. A DUPLICATE that collapses to one is caught — the set comparison this replaces would not.
  const twice = multiset([...original, original[0]]);
  const collapsed = missingSentences(twice, multiset(original));
  assert.deepEqual(collapsed, [{ sentence: 'Never import them directly.', before: 2, after: 1 }]);
});

test('normalisation forgives formatting and nothing else', () => {
  // What a move legitimately changes: a bullet becomes a paragraph, a heading level shifts, a
  // blockquote is unwrapped, indentation moves. None of those is a lost rule.
  const asBullet = sentencesOf('- Never import them directly.');
  assert.deepEqual(sentencesOf('Never import them directly.'), asBullet);
  assert.deepEqual(sentencesOf('### Never import them directly.'), asBullet);
  assert.deepEqual(sentencesOf('> Never import them directly.'), asBullet);
  assert.deepEqual(sentencesOf('  1. Never   import them  directly.'), asBullet);

  // What it must NOT forgive.
  assert.notDeepEqual(sentencesOf('never import them directly.'), asBullet);
  assert.notDeepEqual(sentencesOf('Never import them directly'), asBullet);

  // Structure carries no rule and is dropped, so a table reflow or a fence move is not a loss.
  assert.deepEqual(sentencesOf('| a | b |\n| --- | --- |\n---\n<!-- x -->\n[ref]: https://e.com\n'), []);
  assert.deepEqual(sentencesOf('```js\nconst a = 1;\n```\n'), []);
});
