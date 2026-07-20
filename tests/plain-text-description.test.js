import test from 'node:test';
import assert from 'node:assert/strict';

import {
  plainTextDescription,
  flattenEnricherSyntax,
  descriptionTextCandidate,
} from '../src/utils/plainTextDescription.js';
import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { InventoryListingBuilder } from '../src/systems/InventoryListingBuilder.js';
import {
  REPORTER_ENRICHER_DESCRIPTION,
  REPORTER_ENRICHER_EXPECTED,
  BROAD_ENRICHER_DESCRIPTION,
  BROAD_ENRICHER_EXPECTED,
} from './helpers/enricherDescriptionFixtures.js';

// ---------------------------------------------------------------------------
// Per-form flattening
// ---------------------------------------------------------------------------

test('flattens labelled content links, references, checks, damage to the label', () => {
  assert.equal(
    plainTextDescription('@UUID[Compendium.dnd5e.equipment24.Item.phbagA cid0000000]{Acid}'),
    'Acid'
  );
  assert.equal(plainTextDescription('@Compendium[dnd5e.items.Oil]{Oil}'), 'Oil');
  assert.equal(plainTextDescription('@Damage[2d6]{2d6 fire}'), '2d6 fire');
  assert.equal(plainTextDescription('@Check[ability=dex dc=15]{DC 15 Dexterity}'), 'DC 15 Dexterity');
  assert.equal(plainTextDescription('&Reference[prone]{Prone}'), 'Prone');
});

test('drops label-less content-link / reference / check / damage directives', () => {
  assert.equal(plainTextDescription('@UUID[Compendium.dnd5e.items.Item.abc123]'), '');
  assert.equal(plainTextDescription('@Compendium[dnd5e.items.Oil]'), '');
  assert.equal(plainTextDescription('@Check[ability=dex dc=15]'), '');
  assert.equal(plainTextDescription('&Reference[prone]'), '');
  // Empty braces are treated as label-less for the @ / & families.
  assert.equal(plainTextDescription('@UUID[Compendium.dnd5e.items.Item.abc123]{}'), '');
});

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
  // A trailing inline #flavor token is dropped.
  assert.equal(plainTextDescription('[[/r 1d20 # to hit]]'), '1d20');
});

test('renders a deferred inline roll as its bare formula', () => {
  assert.equal(plainTextDescription('[[1d20+5]]'), '1d20+5');
});

test('reproduces the reporter Alchemist’s Supplies string as labels only', () => {
  assert.equal(plainTextDescription(REPORTER_ENRICHER_DESCRIPTION), REPORTER_ENRICHER_EXPECTED);
  // No raw directive text survives.
  assert.ok(!/@[A-Za-z]+\[/.test(plainTextDescription(REPORTER_ENRICHER_DESCRIPTION)));
});

test('flattens the broad mixed fixture (labelled list + rolls + mid-list drop)', () => {
  assert.equal(plainTextDescription(BROAD_ENRICHER_DESCRIPTION), BROAD_ENRICHER_EXPECTED);
});

// ---------------------------------------------------------------------------
// Separator tidy
// ---------------------------------------------------------------------------

test('collapses a run of separators orphaned by a mid-list drop', () => {
  assert.equal(
    plainTextDescription('Craft: @UUID[x]{Acid}, @UUID[y], @UUID[z]{Oil}'),
    'Craft: Acid, Oil'
  );
});

test('strips a dangling separator immediately after a colon lead-in', () => {
  assert.equal(plainTextDescription('Craft: @UUID[y], @UUID[z]{Oil}'), 'Craft: Oil');
});

test('reduces an all-dropped list to the bare lead-in', () => {
  assert.equal(plainTextDescription('Craft: @UUID[a]{}, @UUID[b]{}, @UUID[c]{}'), 'Craft:');
});

test('trims separators orphaned at the string edges', () => {
  assert.equal(plainTextDescription('@UUID[x], Oil'), 'Oil');
  assert.equal(plainTextDescription('Oil, @UUID[x]'), 'Oil');
});

test('leaves legitimate author punctuation in prose untouched', () => {
  assert.equal(
    plainTextDescription('Mix acid, oil, and water; then rest.'),
    'Mix acid, oil, and water; then rest.'
  );
  assert.equal(plainTextDescription('Note: keep dry, cool.'), 'Note: keep dry, cool.');
});

// ---------------------------------------------------------------------------
// HTML, objects, idempotence, malformed safety
// ---------------------------------------------------------------------------

test('flattens enricher inside HTML and strips the markup', () => {
  assert.equal(plainTextDescription('<p>Craft: @UUID[x]{Acid}</p>'), 'Craft: Acid');
});

test('extracts the candidate from Foundry-style description objects', () => {
  assert.equal(descriptionTextCandidate({ value: '  hello  ' }), 'hello');
  assert.equal(
    plainTextDescription({ value: '<p>@UUID[x]{Acid}, @UUID[y]{Oil}</p>' }),
    'Acid, Oil'
  );
  // Unknown object shapes render empty rather than object coercion strings.
  assert.equal(plainTextDescription({ unexpected: 'shape' }), '');
});

test('is idempotent: a second pass over flattened text is a no-op', () => {
  const once = plainTextDescription(BROAD_ENRICHER_DESCRIPTION);
  assert.equal(plainTextDescription(once), once);
  const reporterOnce = plainTextDescription(REPORTER_ENRICHER_DESCRIPTION);
  assert.equal(plainTextDescription(reporterOnce), reporterOnce);
});

test('leaves malformed / unterminated directives verbatim without eating prose', () => {
  assert.equal(
    flattenEnricherSyntax('@UUID[Compendium.dnd5e.items.Item.abc keep this'),
    '@UUID[Compendium.dnd5e.items.Item.abc keep this'
  );
  assert.equal(flattenEnricherSyntax('[[/r 1d20 keep this'), '[[/r 1d20 keep this');
  assert.equal(flattenEnricherSyntax('&Reference[prone keep this'), '&Reference[prone keep this');
});

test('handles non-string input defensively', () => {
  assert.equal(flattenEnricherSyntax(null), '');
  assert.equal(flattenEnricherSyntax(undefined), '');
  assert.equal(plainTextDescription(null), '');
  assert.equal(plainTextDescription(''), '');
});

// ---------------------------------------------------------------------------
// ReDoS adversarial-length safety
// ---------------------------------------------------------------------------

test('returns an adversarial-length unterminated run verbatim and fast', () => {
  // A future swap of a bounded inner class back to an unbounded `[^\]]*` makes
  // this O(n^2): the same run took ~20s unbounded vs ~0.3s bounded. The 5s
  // budget cleanly separates linear from quadratic on any CI machine.
  for (const adversarial of ['@UUID['.repeat(100000), '[['.repeat(100000)]) {
    const start = performance.now();
    const out = flattenEnricherSyntax(adversarial);
    const elapsedMs = performance.now() - start;
    assert.equal(out, adversarial, 'unterminated run must be left verbatim');
    assert.ok(elapsedMs < 5000, `flatten took ${elapsedMs.toFixed(0)}ms — expected linear`);
  }
});

// ---------------------------------------------------------------------------
// Cross-caller equivalence — the shared helper, CraftingSystemManager, and the
// InventoryListingBuilder buildListing row must produce identical output. A
// revert-to-local-copy or one-sided drift in any caller fails this.
// (The adminStore leg is asserted in tests/stores/adminStore.test.js, which has
// the store harness.)
// ---------------------------------------------------------------------------

function buildListingComponentDescription(rawDescription) {
  const system = {
    id: 'sys-1',
    name: 'Alchemy',
    components: [{ id: 'c1', name: 'Alchemist’s Supplies', description: rawDescription }],
  };
  const builder = new InventoryListingBuilder({
    recipeManager: { getRecipes: () => [], toolMatchesItem: () => false },
    craftingSystemManager: { getSystems: () => [system] },
    localize: (key) => key,
    nowWorldTime: () => 0,
  });
  const listing = builder.buildListing({
    craftingActor: {
      id: 'a1',
      name: 'Akra',
      img: 'icons/a1.webp',
      items: [{ name: 'Alchemist’s Supplies', system: { quantity: 1 } }],
    },
  });
  const row = listing.rows.find((entry) => entry.componentId === 'c1' && !entry.isEssenceSource);
  return row?.description;
}

test('CraftingSystemManager and InventoryListingBuilder match the shared helper', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  for (const input of [REPORTER_ENRICHER_DESCRIPTION, BROAD_ENRICHER_DESCRIPTION]) {
    const expected = plainTextDescription(input);
    assert.equal(manager._normalizeComponentDescription(input), expected);
    assert.equal(buildListingComponentDescription(input), expected);
  }
});
