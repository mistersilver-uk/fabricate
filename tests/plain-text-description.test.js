/**
 * `src/utils/plainTextDescription.js` NORMALIZES already-resolved description text.
 * It does not resolve — resolution is the async `enrichToHtml` seam, exercised in
 * `tests/enricher-resolution.test.js`. These tests therefore feed it ENRICHED HTML
 * (what Foundry's enricher produces), never raw directives, except where the point is
 * exactly what happens to an unresolvable residue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';
import {
  plainTextDescription,
  flattenRollExpressions,
  hasUnresolvedDirectives,
  descriptionTextCandidate,
} from '../src/utils/plainTextDescription.js';
import { withUnknownPlaceholder } from './helpers/enricherDescriptionFixtures.js';

// ---------------------------------------------------------------------------
// Roll expressions — flattened, NEVER evaluated
// ---------------------------------------------------------------------------

test('renders a labelled roll expression as its label', () => {
  assert.equal(plainTextDescription('[[/r 1d20+5]]{Attack}'), 'Attack');
  assert.equal(plainTextDescription('[[/roll 2d6]]{Fire damage}'), 'Fire damage');
});

test('renders a label-less roll expression as its bare formula, stripping command + flavor', () => {
  assert.equal(plainTextDescription('[[/r 1d20+5]]'), '1d20+5');
  assert.equal(plainTextDescription('[[/roll 2d6]]'), '2d6');
  assert.equal(plainTextDescription('[[/gmr 1d6]]'), '1d6');
  assert.equal(plainTextDescription('[[/br 1d8]]'), '1d8');
  assert.equal(plainTextDescription('[[/pr 1d10]]'), '1d10');
  assert.equal(plainTextDescription('[[/r 1d20 # to hit]]'), '1d20');
});

test('a bare, COMMAND-LESS inline roll survives as its formula and is never evaluated', () => {
  // This is the form `rolls: true` would EAGERLY evaluate, freezing a literal "4"
  // into the stored description forever. The deferred `[[/r …]]` forms above are
  // safe even with `rolls: true` and so cannot detect a regression — only this one
  // can, which is why it is asserted on its own.
  assert.equal(plainTextDescription('[[1d6]]'), '1d6');
  assert.equal(plainTextDescription('[[1d20+5]]'), '1d20+5');
  assert.equal(plainTextDescription('Burns for [[1d6]] rounds.'), 'Burns for 1d6 rounds.');
});

// ---------------------------------------------------------------------------
// Post-resolution label mop-up — a directive nothing registered an enricher for
// ---------------------------------------------------------------------------

test('renders an unregistered LABELLED directive as its authored label', () => {
  // Reached only after resolution, so nothing here still has a referent to lose:
  // every resolvable @UUID is already an anchor. What is left belongs to a system or
  // module that registered no enricher for it.
  assert.equal(plainTextDescription('@Check[ability=dex dc=15]{DC 15 Dexterity}'), 'DC 15 Dexterity');
  assert.equal(plainTextDescription('@Damage[2d6]{2d6 fire}'), '2d6 fire');
  assert.equal(plainTextDescription('&Reference[prone]{Prone}'), 'Prone');
  // `embeds: false` is deliberate — an @Embed would otherwise inline a whole page.
  assert.equal(plainTextDescription('@Embed[JournalEntryPage.abc]{Overview}'), 'Overview');
});

test('leaves an unregistered LABEL-LESS directive verbatim rather than dropping it', () => {
  // Dropping it was the rejected approach: with no label the raw text is all the
  // reader has, so deleting it destroys information rather than tidying it.
  assert.equal(plainTextDescription('@Check[ability=dex dc=15]'), '@Check[ability=dex dc=15]');
  assert.equal(plainTextDescription('&Reference[prone]'), '&Reference[prone]');
});

// ---------------------------------------------------------------------------
// Broken anchors — authored label PRESERVED, placeholder REMOVED
// ---------------------------------------------------------------------------

test('broken anchor: an AUTHORED LABEL is preserved and the PLACEHOLDER is removed', async (t) => {
  setupDOM();
  const restore = withUnknownPlaceholder();
  t.after(() => {
    restore();
    teardownDOM();
  });

  assert.equal(
    plainTextDescription('<a class="content-link broken">Alchemist\'s Fire</a>'),
    "Alchemist's Fire",
    'a broken reference must contribute its AUTHORED LABEL — removing it would delete author text'
  );
  assert.equal(
    plainTextDescription('Contains <a class="content-link broken">Unknown</a> reagents'),
    'Contains reagents',
    'the localized COMMON.Unknown placeholder must be removed, never rendered as prose'
  );
  assert.equal(
    plainTextDescription('<p class="broken content-embed">Unknown</p>'),
    'Unknown',
    'the `a.` selector prefix is load-bearing: _embedContent also emits p.broken.content-embed'
  );
});

// ---------------------------------------------------------------------------
// Privacy scrub — visibility-gated and secret markup never reaches stored text
// ---------------------------------------------------------------------------

test('privacy scrub removes gated and unrevealed-secret markup, keeps everything else', async (t) => {
  setupDOM();
  const restore = withUnknownPlaceholder();
  t.after(() => {
    restore();
    teardownDOM();
  });

  for (const gate of ['gm', 'none', 'owner']) {
    assert.equal(
      plainTextDescription(`<p>Public <span data-visibility="${gate}">Secret</span> tail</p>`),
      'Public tail',
      `[data-visibility="${gate}"] content must not reach stored text`
    );
  }

  assert.equal(
    plainTextDescription('Public <section class="secret">Hidden</section>'),
    'Public',
    'an unrevealed section.secret is removed'
  );
  assert.equal(
    plainTextDescription('Public <section class="secret revealed">Shown</section>'),
    'Public Shown',
    'a REVEALED secret survives — :not(.revealed) is load-bearing'
  );
  assert.equal(
    plainTextDescription('<p>Acid, <span data-visibility="gm">Poison</span>, Oil</p>'),
    'Acid, Oil',
    'separators orphaned by a gated removal are tidied'
  );
});

test('privacy beats label preservation: a LABELLED broken anchor inside a gated block is removed entirely', async (t) => {
  setupDOM();
  const restore = withUnknownPlaceholder();
  t.after(() => {
    restore();
    teardownDOM();
  });

  const enriched =
    '<p>Public. <span data-visibility="gm">See ' +
    '<a class="content-link broken">Forbidden Tome</a>.</span></p>';
  const output = plainTextDescription(enriched);
  assert.equal(output, 'Public.');
  assert.ok(
    !output.includes('Forbidden Tome'),
    'the broken-anchor label rule must NEVER override a privacy removal — a future ' +
      'refactor that reorders the two passes, or widens the unwrap, fails here'
  );
});

// ---------------------------------------------------------------------------
// Separator / bracket tidy
// ---------------------------------------------------------------------------

test('tidies separators and brackets orphaned by a removed reference', async (t) => {
  setupDOM();
  const restore = withUnknownPlaceholder();
  t.after(() => {
    restore();
    teardownDOM();
  });

  assert.equal(
    plainTextDescription('Craft: <a class="content-link broken">Unknown</a>, Oil'),
    'Craft: Oil'
  );
  assert.equal(
    plainTextDescription('Acid, <a class="content-link broken">Unknown</a>, Oil'),
    'Acid, Oil'
  );
  // The two degraded outputs the plan called out explicitly.
  assert.equal(
    plainTextDescription('Contains: <a class="content-link broken">Unknown</a>'),
    'Contains',
    'no dangling colon lead-in'
  );
  assert.equal(
    plainTextDescription('(see <a class="content-link broken">Unknown</a>)'),
    '(see)',
    'no dangling "( )"'
  );
  assert.equal(
    plainTextDescription('<a class="content-link broken">Unknown</a>'),
    '',
    'a fully emptied description yields "", so the surface renders its own no-description fallback'
  );
});

test('leaves legitimate author punctuation in prose untouched', () => {
  assert.equal(
    plainTextDescription('Mix acid, oil, and water; then rest.'),
    'Mix acid, oil, and water; then rest.'
  );
  assert.equal(plainTextDescription('Note: keep dry, cool.'), 'Note: keep dry, cool.');
  assert.equal(plainTextDescription('Aged (very) well.'), 'Aged (very) well.');
});

// ---------------------------------------------------------------------------
// hasUnresolvedDirectives — the DETECTOR predicate
// ---------------------------------------------------------------------------

test('hasUnresolvedDirectives detects raw directive text and nothing else', () => {
  assert.equal(hasUnresolvedDirectives('@UUID[Compendium.dnd5e.items.Item.abc123]'), true);
  assert.equal(hasUnresolvedDirectives('@UUID[x]{Acid}'), true);
  assert.equal(hasUnresolvedDirectives('&Reference[prone]{Prone}'), true);
  assert.equal(hasUnresolvedDirectives('Acid, Oil, Paper'), false);
  // Rolls are flattened deterministically at every read, so they are not a
  // repairable defect and must not trigger the GM notice.
  assert.equal(hasUnresolvedDirectives('Burns for [[1d6]] rounds'), false);
  assert.equal(hasUnresolvedDirectives(''), false);
  assert.equal(hasUnresolvedDirectives(null), false);
  assert.equal(hasUnresolvedDirectives(42), false);
});

// ---------------------------------------------------------------------------
// HTML, objects, idempotence, malformed safety
// ---------------------------------------------------------------------------

test('strips markup around resolved anchors', () => {
  assert.equal(
    plainTextDescription('<p>Craft: <a class="content-link" data-uuid="x">Acid</a></p>'),
    'Craft: Acid'
  );
});

test('extracts the candidate from Foundry-style description objects', () => {
  assert.equal(descriptionTextCandidate({ value: '  hello  ' }), 'hello');
  assert.equal(
    plainTextDescription({ value: '<p><a class="content-link">Acid</a>, <a class="content-link">Oil</a></p>' }),
    'Acid, Oil'
  );
  assert.equal(plainTextDescription({ unexpected: 'shape' }), '');
});

test('is idempotent: a second pass over normalized text is a no-op', () => {
  for (const input of [
    '<p>Craft: <a class="content-link">Acid</a>. Burns for [[1d6]] rounds.</p>',
    '@Check[ability=dex dc=15]{DC 15 Dexterity}',
    'Mix acid, oil, and water; then rest.',
  ]) {
    const once = plainTextDescription(input);
    assert.equal(plainTextDescription(once), once, `not idempotent for: ${input}`);
  }
});

test('leaves malformed / unterminated expressions verbatim without eating prose', () => {
  assert.equal(flattenRollExpressions('[[/r 1d20 keep this'), '[[/r 1d20 keep this');
  assert.equal(
    plainTextDescription('@UUID[Compendium.dnd5e.items.Item.abc keep this'),
    '@UUID[Compendium.dnd5e.items.Item.abc keep this'
  );
});

test('handles non-string input defensively', () => {
  assert.equal(flattenRollExpressions(null), '');
  assert.equal(flattenRollExpressions(undefined), '');
  assert.equal(plainTextDescription(null), '');
  assert.equal(plainTextDescription(''), '');
});

// ---------------------------------------------------------------------------
// ReDoS adversarial-length safety
// ---------------------------------------------------------------------------

test('returns adversarial-length unterminated runs verbatim and fast', () => {
  // A future swap of a bounded inner class back to an unbounded `[^\]]*` makes this
  // O(n^2): the same run took ~20s unbounded vs ~0.3s bounded. The 5s budget cleanly
  // separates linear from quadratic on any CI machine.
  for (const adversarial of ['[['.repeat(100000), '@UUID['.repeat(100000)]) {
    const start = performance.now();
    const out = plainTextDescription(adversarial);
    const elapsedMs = performance.now() - start;
    assert.equal(out, adversarial, 'unterminated run must be left verbatim');
    assert.ok(elapsedMs < 5000, `normalize took ${elapsedMs.toFixed(0)}ms — expected linear`);
  }
});
