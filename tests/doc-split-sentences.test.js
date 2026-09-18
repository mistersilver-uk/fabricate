/**
 * NO RULE SENTENCE IS LOST WHEN THE HARNESS DOCUMENTS ARE SPLIT (issue #1661, phases 3-5). HOW IT
 * WORKS. `tests/fixtures/doc-split/*.pre-split.md` are byte copies of the three documents as they
 * stood before any split.
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

/** Every file a sentence is allowed to have moved INTO, by explicit path. */
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
 * Sentences deliberately dropped, each naming the location that still carries them. Empty, because
 * nothing has moved yet.
 */
const DEDUPLICATED = [];

/** Pinned exactly, not as a ceiling: a ceiling banks a free slot on every entry that is retired. */
const DEDUPLICATED_COUNT = 0;

/** Sentences a move forced to change, where the only change is a link TARGET. */
const RETARGETED = [
  {
    before: 'See [Manager confirm-discard guard](#manager-confirm-discard-guard).',
    after:
      'See [Manager confirm-discard guard](.agents/docs/foundry-and-architecture.md#manager-confirm-discard-guard).',
  },
];

/** Pinned for the same reason as DEDUPLICATED_COUNT. */
const RETARGETED_COUNT = 1;

/** Sentences that state a View Lab registry case count, where the only change is that NUMBER. */
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

/**
 * Sentences a deliberate rename forced to change, where the only edit is an identifier (issue
 * #1761).
 */
const RENAMED = [
  {
    before:
      'The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, ' +
      'where `<segment>` comes from a per-channel repository **secret** (`S3_TESTER_PATH_SECRET` ' +
      'for beta, a separate `S3_EARLY_ACCESS_PATH_SECRET` for early access, referred to abstractly ' +
      'here — never paste the value) — never the committed config.',
    after:
      'The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, ' +
      'where `<segment>` comes from a per-channel repository **secret** (`S3_TESTER_PATH_SECRET` ' +
      'for beta, a separate `S3_GUILD_ARTISAN_PATH_SECRET` for early access, referred to abstractly ' +
      'here — never paste the value) — never the committed config.',
    identifiers: [['S3_GUILD_ARTISAN_PATH_SECRET', 'S3_EARLY_ACCESS_PATH_SECRET']],
  },
  {
    before:
      "Cite code by symbol name and file path only — for example `_playerListingFields` in `src/systems/GatheringListingBuilder.js`, locatable with `grep -n` — never by line number; `npm run validate:agents` rejects `file.js:NNN`-style citations because they rot silently as code moves.",
    after:
      "Cite code by symbol name and file path only — for example `_playerListingFields` in `src/ui/presenters/GatheringListingBuilder.js`, locatable with `grep -n` — never by line number; `npm run validate:agents` rejects `file.js:NNN`-style citations because they rot silently as code moves.",
    identifiers: [['src/ui/presenters/GatheringListingBuilder.js', 'src/systems/GatheringListingBuilder.js']],
  },
  {
    before:
      "**Player listing counts are a separate, engine-owned surface.** The player-facing listing is produced by `GatheringEngine.listForActor` — a thin delegator to the engine's injected `GatheringListingBuilder` collaborator, whose `_buildEnvironmentListing` in `src/systems/GatheringListingBuilder.js` does the construction — not the admin store.",
    after:
      "**Player listing counts are a separate, engine-owned surface.** The player-facing listing is produced by `GatheringEngine.listForActor` — a thin delegator to the engine's injected `GatheringListingBuilder` collaborator, whose `_buildEnvironmentListing` in `src/ui/presenters/GatheringListingBuilder.js` does the construction — not the admin store.",
    identifiers: [['src/ui/presenters/GatheringListingBuilder.js', 'src/systems/GatheringListingBuilder.js']],
  },
  // Issue #1671 moved the cases into one file per surface, so these three sentences name the directory.
  {
    before: 'Cases live in `scripts/lib/viewLabCases.js`.',
    after: 'Cases live in `scripts/lib/view-lab-cases/`.',
    identifiers: [['scripts/lib/view-lab-cases/', 'scripts/lib/viewLabCases.js']],
  },
  {
    before:
      'A patch to `scripts/lib/viewLabCases.js` selects only the case literals its hunks fall inside.',
    after:
      'A patch to `scripts/lib/view-lab-cases/` selects only the case literals its hunks fall inside.',
    identifiers: [['scripts/lib/view-lab-cases/', 'scripts/lib/viewLabCases.js']],
  },
];

/** Pinned for the same reason as DEDUPLICATED_COUNT. */
const RENAMED_COUNT = 5;

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
  // migration gate is green on arrival.
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
    ...RENAMED.map(({ before }) => before),
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
      'RENUMBERED and raise RENUMBERED_COUNT instead; if only a renamed identifier changed, ' +
      'RENAMED and RENAMED_COUNT.'
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
    // 2. THE ONLY DIFFERENCE MAY BE THE LINK TARGET.
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
    // 2. Exactly one surviving sentence may match once digits are ignored.
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

test('every rename claim really is a rename and nothing more', () => {
  assert.equal(
    RENAMED.length,
    RENAMED_COUNT,
    'the rename allowlist changed size. Each entry excuses one sentence from the subset ' +
      'assertion, so growing it needs its own justification in review.'
  );

  const surviving = survivingSentences();
  for (const { before, after, identifiers } of RENAMED) {
    // 1. The replacement must actually be somewhere, or the sentence is simply gone.
    assert.ok(
      (surviving.get(after) ?? 0) > 0,
      `RENAMED claims this replaced a sentence and it is in no destination:
  ${after}`
    );
    // 2. It must not be stale: an entry whose `before` still exists excuses nothing.
    assert.equal(
      surviving.get(before) ?? 0,
      0,
      `RENAMED still lists this sentence, which is present after all — remove the entry:
  ${before}`
    );
    // 3. The only difference may be the one named identifier, and the substitution must really
    //    fire: a pair matching nothing would leave the equality below comparing a sentence to
    //    itself, and five pairs under one entry would excuse a rewrite as a rename.
    assert.equal(identifiers.length, 1, `RENAMED entry names ${identifiers.length} pairs, not one`);
    let restored = after;
    for (const [renamed, original] of identifiers) {
      assert.ok(restored.includes(renamed), `RENAMED entry does not contain ${renamed}`);
      restored = restored.replaceAll(renamed, original);
    }
    assert.equal(
      restored,
      before,
      'a RENAMED entry changed more than the identifiers it names, so it is a rewrite'
    );
  }
});

test('the comparator catches deletion, reordering and rewording', () => {
  // A gate that has only ever been watched to report nothing is not known to work.
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
