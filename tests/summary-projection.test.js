/**
 * The canonical recipe and component summary projections (issue 1091, under #1070).
 *
 * Four properties are load-bearing here, and each gets its own section:
 *
 * 1. **The shape is exactly the manifest.** The whole point of #1091 is that #1075 and
 *    #1081 consume ONE shape rather than growing two overlapping ones, so the emitted key
 *    set is asserted against `RECIPE_SUMMARY_FIELDS` / `COMPONENT_SUMMARY_FIELDS` rather
 *    than spot-checked field by field. A field added to one surface and not the manifest
 *    fails here instead of forking the contract silently.
 * 2. **Shared fields share a DERIVATION.** The contract permits the two audiences to
 *    differ in FIELDS and forbids them differing in how a shared field is derived, so the
 *    two summaries of one recipe are compared field-by-field over `shared`.
 * 3. **The purity invariant is counted, not asserted by inspection.** Building N summaries
 *    invokes `evaluateCraftability()` and `resolveIngredientSelection()` zero times. The
 *    counter is proved non-vacuous in the same test — a counter that cannot go up reports
 *    a green baseline forever — and the structural half (this module holds no collaborator
 *    it could call either function on) is pinned separately against the real import list.
 * 4. **Redaction WITHHOLDS rather than blanks.** A redacted player summary must not carry
 *    availability, and must not have computed it: availability is derived from the
 *    recipe's ingredients, which is one of the three fields a teaser hides by default. The
 *    snapshot's tally accessor is counted to prove it was never consulted.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { countCalls, createOperationCounters } from './helpers/scale/scaleCounters.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty } };

const { buildInventorySnapshot } = await import('../src/systems/inventorySnapshot.js');
const { CRAFTING_BROWSE_STATUS, deriveBrowseStatus } = await import(
  '../src/systems/craftingBrowseStatus.js'
);
const {
  COMPONENT_SUMMARY_FIELDS,
  RECIPE_SUMMARY_FIELDS,
  SUMMARY_AUDIENCE,
  projectComponentSummary,
  projectRecipeSummary,
  projectSummaryAvailability,
  summaryFieldsFor,
} = await import('../src/systems/summaryProjection.js');

const SYSTEM_ID = 'system-1';

const IRON = Object.freeze({
  id: 'comp-iron',
  name: 'Iron Ingot',
  img: 'icons/commodities/metal/ingot-iron.webp',
  category: 'Metals',
  tags: ['metal', 'metal', 'ore'],
  essences: { earth: 2, fire: 0 },
  salvage: { enabled: true },
});

const SYSTEM = Object.freeze({
  id: SYSTEM_ID,
  name: 'Alchemical Arts',
  components: [IRON],
  essenceDefinitions: [{ id: 'earth', name: 'Earth' }],
});

/** A recipe needing `quantity` Iron, plus optional essences. */
function makeRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Iron Nails',
    img: 'icons/tools/smithing/nails.webp',
    craftingSystemId: SYSTEM_ID,
    category: 'Smithing',
    tags: ['starter'],
    enabled: true,
    locked: false,
    ingredientSets: [
      {
        ingredientGroups: [
          { options: [{ quantity: 2, match: { type: 'component', componentId: IRON.id } }] },
        ],
        essences: {},
      },
    ],
    ...overrides,
  };
}

function makeItem(name, quantity) {
  return { uuid: `item-${name}-${quantity}`, name, system: { quantity } };
}

/** A snapshot over one actor holding `quantity` Iron. */
function snapshotHolding(quantity) {
  return buildInventorySnapshot({
    craftingActor: { id: 'actor-1', items: [makeItem('Iron Ingot', quantity)] },
    resolveComponent: (item) => (item.name === IRON.name ? IRON : null),
  });
}

const VISIBLE_ACCESS = Object.freeze({ visible: true, reason: 'ok' });
const TEASER_ACCESS = Object.freeze({
  visible: true,
  reason: 'teaser',
  teaserState: { isTeaser: true, hiddenFields: ['ingredients', 'results'] },
});

describe('summary shape — one documented shape per entity', () => {
  it('emits exactly the manifest keys for each recipe audience', () => {
    const recipe = makeRecipe();
    for (const audience of [SUMMARY_AUDIENCE.GM, SUMMARY_AUDIENCE.PLAYER]) {
      const summary = projectRecipeSummary({ recipe, system: SYSTEM, audience });
      assert.deepEqual(
        Object.keys(summary).sort((left, right) => left.localeCompare(right)),
        summaryFieldsFor(RECIPE_SUMMARY_FIELDS, audience),
        `${audience} summary key set`
      );
    }
  });

  it('splits the audiences only where the manifest says it does', () => {
    const recipe = makeRecipe({ locked: true });
    const gm = projectRecipeSummary({ recipe, system: SYSTEM, audience: SUMMARY_AUDIENCE.GM });
    const player = projectRecipeSummary({
      recipe,
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      favourite: true,
    });

    assert.equal(gm.locked, true, 'locked is authoring state and rides on the GM summary');
    assert.equal('favourite' in gm, false, 'the GM has no viewer to read favourites for');
    assert.equal(player.favourite, true);
    assert.equal('locked' in player, false, 'authoring state must not cross to a player client');
  });

  it('derives every SHARED field identically for both audiences', () => {
    const recipe = makeRecipe();
    const snapshot = snapshotHolding(5);
    const shared = { recipe, system: SYSTEM, access: VISIBLE_ACCESS, snapshot };
    const gm = projectRecipeSummary({ ...shared, audience: SUMMARY_AUDIENCE.GM });
    const player = projectRecipeSummary({ ...shared, audience: SUMMARY_AUDIENCE.PLAYER });

    for (const field of RECIPE_SUMMARY_FIELDS.shared) {
      // `audience` is shared as a FIELD (every summary declares which contract it is) and
      // is the one whose value legitimately differs; everything else must match exactly.
      if (field === 'audience') continue;
      assert.deepEqual(gm[field], player[field], `shared field '${field}' must not diverge`);
    }
    assert.equal(gm.audience, SUMMARY_AUDIENCE.GM);
    assert.equal(player.audience, SUMMARY_AUDIENCE.PLAYER);
  });

  it('emits exactly the manifest keys for a component summary, with no audience axis', () => {
    const summary = projectComponentSummary({ component: IRON, systemId: SYSTEM_ID });
    assert.deepEqual(
      Object.keys(summary).sort((left, right) => left.localeCompare(right)),
      summaryFieldsFor(COMPONENT_SUMMARY_FIELDS, SUMMARY_AUDIENCE.GM)
    );
    assert.deepEqual(COMPONENT_SUMMARY_FIELDS.gmOnly, []);
    assert.deepEqual(COMPONENT_SUMMARY_FIELDS.playerOnly, []);
  });

  it('normalizes identity, grouping and tags off the authored records', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe({ category: '  ', tags: ['a', 'a', ' b ', ''] }),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
    });
    assert.equal(summary.category, 'general', 'absent category normalizes to the reserved bucket');
    assert.deepEqual(summary.tags, ['a', 'b'], 'deduped and trimmed, order preserved');
    assert.equal(summary.systemId, SYSTEM_ID);
    assert.equal(summary.systemName, SYSTEM.name);
  });

  it('reads an absent `enabled` as ON, matching the model default and the GM filter', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe({ enabled: undefined }),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
    });
    assert.equal(summary.enabled, true);
  });
});

describe('summary purity — zero exact-evaluation calls', () => {
  /**
   * A recipe carrying counted tripwires everywhere a projection could plausibly reach for
   * one: on the recipe, on each ingredient set, and on the owning system. Nothing here is
   * a real API — the point is that if a future summary ever grows a collaborator, the
   * shapes it would reach through are already instrumented.
   */
  function tripwiredFixture(counters) {
    const recipe = makeRecipe();
    for (const target of [recipe, recipe.ingredientSets[0]]) {
      target.evaluateCraftability = () => ({ canCraft: true });
      target.resolveIngredientSelection = () => ({ selection: [] });
      countCalls(target, 'evaluateCraftability', counters, 'evaluateCraftability');
      countCalls(target, 'resolveIngredientSelection', counters, 'resolveIngredientSelection');
    }
    const system = { ...SYSTEM };
    system.evaluateCraftability = () => ({ canCraft: true });
    system.resolveIngredientSelection = () => ({ selection: [] });
    countCalls(system, 'evaluateCraftability', counters, 'evaluateCraftability');
    countCalls(system, 'resolveIngredientSelection', counters, 'resolveIngredientSelection');
    return { recipe, system };
  }

  it('builds N recipe summaries with zero evaluateCraftability / resolveIngredientSelection calls', () => {
    const counters = createOperationCounters();
    const { recipe, system } = tripwiredFixture(counters);
    const snapshot = snapshotHolding(9);

    const N = 50;
    for (let index = 0; index < N; index += 1) {
      const summary = projectRecipeSummary({
        recipe: { ...recipe, id: `recipe-${index}` },
        system,
        audience: SUMMARY_AUDIENCE.PLAYER,
        access: VISIBLE_ACCESS,
        snapshot,
      });
      assert.equal(summary.availability.available, true);
    }

    assert.equal(counters.get('evaluateCraftability'), 0, 'exact craftability must never run');
    assert.equal(counters.get('resolveIngredientSelection'), 0, 'no ingredient solve either');

    // Non-vacuity: the same counters DO move when the tripwires are invoked directly, so a
    // zero above is evidence rather than a counter that cannot count.
    recipe.evaluateCraftability();
    recipe.resolveIngredientSelection();
    assert.equal(counters.get('evaluateCraftability'), 1);
    assert.equal(counters.get('resolveIngredientSelection'), 1);
  });

  it('builds N component summaries with zero exact-evaluation calls', () => {
    const counters = createOperationCounters();
    const component = { ...IRON };
    component.evaluateCraftability = () => ({ canCraft: true });
    countCalls(component, 'evaluateCraftability', counters, 'evaluateCraftability');
    const tallies = snapshotHolding(4).componentTallies(SYSTEM);

    for (let index = 0; index < 50; index += 1) {
      projectComponentSummary({ component, systemId: SYSTEM_ID, tallies });
    }
    assert.equal(counters.get('evaluateCraftability'), 0);
  });

  it('holds no collaborator it could call either function on', () => {
    // The structural half of the invariant. A summary takes VALUES, so the counter test
    // above pins a property the module has no way to violate by accident — but only for
    // as long as that stays true, which is what this asserts.
    const source = readFileSync(
      fileURLToPath(new URL('../src/systems/summaryProjection.js', import.meta.url)),
      'utf8'
    );
    const imports = [...source.matchAll(/^import\s.*?from\s+'([^']+)';$/gm)].map(
      (match) => match[1]
    );
    assert.ok(imports.length > 0, 'the import scan must not silently match nothing');
    for (const specifier of imports) {
      assert.doesNotMatch(
        specifier,
        /RecipeManager|CraftingEngine|CraftingListingBuilder|RecipeVisibilityService/,
        `summaryProjection must not import ${specifier}`
      );
    }
  });
});

describe('the cheap-availability rule, defined once', () => {
  it('answers from the snapshot tallies and marks itself optimistic', () => {
    const availability = projectSummaryAvailability({
      snapshot: snapshotHolding(3),
      system: SYSTEM,
      recipe: makeRecipe(),
    });
    assert.equal(availability.available, true);
    assert.equal(availability.optimistic, true, 'the upper-bound marker is part of the shape');
  });

  it('carries #1077 optimism forward: available where exact evaluation would refuse', () => {
    // Two groups each needing 2x Iron against 3 held units. No assignment satisfies both,
    // so exact evaluation says no and this rule says yes. That is the documented contract
    // both surfaces inherit, and it is pinned here so neither can "fix" it independently.
    const contended = makeRecipe({
      ingredientSets: [
        {
          ingredientGroups: [
            { options: [{ quantity: 2, match: { type: 'component', componentId: IRON.id } }] },
            { options: [{ quantity: 2, match: { type: 'component', componentId: IRON.id } }] },
          ],
          essences: {},
        },
      ],
    });
    const summary = projectRecipeSummary({
      recipe: contended,
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(3),
    });
    assert.equal(summary.availability.available, true);
    assert.equal(summary.availability.optimistic, true);
    assert.equal(summary.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
  });

  it('is definitive in the negative direction and says missingMaterials', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(1),
    });
    assert.equal(summary.availability.available, false);
    assert.equal(summary.browseStatus, CRAFTING_BROWSE_STATUS.MISSING_MATERIALS);
  });

  it('distinguishes "not asked" from "unavailable" when no snapshot is in view', () => {
    // The GM browser projects definitions rather than one actor's view of them. A `false`
    // here would paint every row of a 5,000-recipe system as short of materials.
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
      access: VISIBLE_ACCESS,
    });
    assert.equal(summary.availability, null);
    assert.equal(summary.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
  });

  it('walks the inventory once for a whole page of recipes of one system', () => {
    // The rule's cost claim: the snapshot memoises per-system tallies, so N summaries read
    // the actor's items ONCE. Counted through the snapshot's own accessor rather than
    // inferred, because "cheap" is the reason both surfaces are allowed to call this.
    const counters = createOperationCounters();
    const snapshot = snapshotHolding(20);
    countCalls(snapshot, 'componentTallies', counters, 'componentTallies');

    let itemReads = 0;
    const actorItems = snapshot.actors[0].items;
    Object.defineProperty(snapshot.actors[0], 'items', {
      configurable: true,
      get() {
        itemReads += 1;
        return actorItems;
      },
    });

    for (let index = 0; index < 25; index += 1) {
      projectRecipeSummary({
        recipe: makeRecipe({ id: `recipe-${index}` }),
        system: SYSTEM,
        audience: SUMMARY_AUDIENCE.PLAYER,
        access: VISIBLE_ACCESS,
        snapshot,
      });
    }

    assert.equal(counters.get('componentTallies'), 25, 'once per summary, by construction');
    // …but the tallies themselves are memoised per system, so the inventory is WALKED once
    // for the whole page. Without that the count would track the page size, which is the
    // `recipes x items` product #1070's field report hit.
    assert.equal(itemReads, 1, 'one lazy walk for 25 summaries, not 25');
  });
});

describe('player-facing redaction', () => {
  it('withholds availability from a redacted teaser summary and never computes it', () => {
    const counters = createOperationCounters();
    const snapshot = snapshotHolding(9);
    countCalls(snapshot, 'componentTallies', counters, 'componentTallies');

    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: TEASER_ACCESS,
      snapshot,
    });

    assert.equal(summary.redaction.redacted, true);
    assert.deepEqual(summary.redaction.hiddenFields, ['ingredients', 'results']);
    assert.equal(summary.availability, null, 'an ingredient-derived signal must not cross');
    assert.equal(summary.browseStatus, CRAFTING_BROWSE_STATUS.DISCOVERY);
    assert.equal(
      counters.get('componentTallies'),
      0,
      'withheld, not blanked: the snapshot is never consulted for a redacted recipe'
    );
  });

  it('still surfaces identity and grouping metadata for a teaser', () => {
    // A teaser is shown to the player DELIBERATELY, so name, image, category and tags are
    // the part they are meant to see. This mirrors the shipped listing model, which
    // records the same decision for `category` in as many words.
    const recipe = makeRecipe();
    const summary = projectRecipeSummary({
      recipe,
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: TEASER_ACCESS,
    });
    assert.equal(summary.name, recipe.name);
    assert.equal(summary.img, recipe.img);
    assert.equal(summary.category, 'Smithing');
    assert.deepEqual(summary.tags, ['starter']);
  });

  it('does not redact the same recipe for the GM', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
      access: TEASER_ACCESS,
      snapshot: snapshotHolding(9),
    });
    assert.equal(summary.redaction.redacted, false);
    assert.deepEqual(summary.redaction.hiddenFields, []);
    assert.equal(summary.availability.available, true);
  });

  it('defaults an omitted audience to the REDACTING one', () => {
    // Failing safe matters more than convenience here: an omitted audience that defaulted
    // to `gm` would ship an unredacted teaser to whichever caller forgot the argument.
    const summary = projectRecipeSummary({ recipe: makeRecipe(), access: TEASER_ACCESS });
    assert.equal(summary.audience, SUMMARY_AUDIENCE.PLAYER);
    assert.equal(summary.redaction.redacted, true);
  });

  it('falls back to the documented default hidden fields when the teaser names none', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: { visible: true, reason: 'teaser', teaserState: { isTeaser: true } },
    });
    assert.deepEqual(summary.redaction.hiddenFields, ['ingredients', 'results', 'description']);
  });
});

describe('browse-status precedence', () => {
  const cases = [
    ['teaser', { reason: 'teaser' }, CRAFTING_BROWSE_STATUS.DISCOVERY],
    ['locked', { reason: 'locked' }, CRAFTING_BROWSE_STATUS.LOCKED],
    ['knowledge', { reason: 'knowledge' }, CRAFTING_BROWSE_STATUS.UNKNOWN],
    ['exhausted', { exhausted: true }, CRAFTING_BROWSE_STATUS.EXHAUSTED],
    ['short', { materialsAvailable: false }, CRAFTING_BROWSE_STATUS.MISSING_MATERIALS],
    ['ok', { materialsAvailable: true }, CRAFTING_BROWSE_STATUS.AVAILABLE],
    ['not asked', { materialsAvailable: null }, CRAFTING_BROWSE_STATUS.AVAILABLE],
  ];

  for (const [label, input, expected] of cases) {
    it(`resolves ${label} to ${expected}`, () => {
      assert.equal(deriveBrowseStatus(input), expected);
    });
  }

  it('prefers the visibility reason over a material shortfall', () => {
    assert.equal(
      deriveBrowseStatus({ reason: 'knowledge', materialsAvailable: false, exhausted: true }),
      CRAFTING_BROWSE_STATUS.UNKNOWN
    );
  });

  it('surfaces exhaustion the knowledge evaluation already established', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(9),
      exhausted: true,
    });
    assert.equal(summary.browseStatus, CRAFTING_BROWSE_STATUS.EXHAUSTED);
  });
});

describe('component summary', () => {
  it('projects identity, grouping, tags and salvage state off the authored record', () => {
    const summary = projectComponentSummary({ component: IRON, systemId: SYSTEM_ID });
    assert.equal(summary.id, IRON.id);
    assert.equal(summary.name, IRON.name);
    assert.equal(summary.img, IRON.img);
    assert.equal(summary.category, 'Metals');
    assert.deepEqual(summary.tags, ['metal', 'ore'], 'deduped');
    assert.equal(summary.salvageEnabled, true);
    assert.equal(summary.systemId, SYSTEM_ID);
  });

  it('names the owning system from the caller, never from the component', () => {
    // Component ids are unique only WITHIN a system — a copy-imported system deliberately
    // preserves its origin's ids — so a summary that could not name its system would be
    // ambiguous the moment two systems were browsed together.
    assert.equal(projectComponentSummary({ component: IRON }).systemId, null);
  });

  it('resolves essence display names through the definition index, and drops zeroes', () => {
    const index = new Map([['earth', { id: 'earth', name: 'Earth' }]]);
    const summary = projectComponentSummary({
      component: IRON,
      systemId: SYSTEM_ID,
      essenceDefinitionsById: index,
    });
    assert.deepEqual(summary.essences, [{ id: 'earth', quantity: 2, name: 'Earth' }]);
  });

  it('falls back to the essence id when no definition is indexed', () => {
    const summary = projectComponentSummary({ component: IRON, systemId: SYSTEM_ID });
    assert.deepEqual(summary.essences, [{ id: 'earth', quantity: 2, name: 'earth' }]);
  });

  it('orders essences by id so two summaries of one component compare equal', () => {
    const component = { ...IRON, essences: { water: 1, earth: 2, air: 3 } };
    const ids = projectComponentSummary({ component, systemId: SYSTEM_ID }).essences.map(
      (essence) => essence.id
    );
    assert.deepEqual(ids, ['air', 'earth', 'water']);
  });

  it('reads held quantity from the snapshot tallies, and distinguishes zero from unasked', () => {
    const tallies = snapshotHolding(7).componentTallies(SYSTEM);
    assert.deepEqual(projectComponentSummary({ component: IRON, tallies }).held, {
      quantity: 7,
      stacks: 1,
    });
    assert.deepEqual(
      projectComponentSummary({ component: { ...IRON, id: 'comp-absent' }, tallies }).held,
      { quantity: 0, stacks: 0 },
      'a genuine zero'
    );
    assert.equal(
      projectComponentSummary({ component: IRON }).held,
      null,
      'no actor in view is not a held quantity of zero'
    );
  });
});
