/** The canonical recipe and component summary projections (issue 1091, under #1070). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CRAFTING_IMAGE,
  GENERIC_ITEM_IMAGE,
} from '../src/ui/svelte/util/craftingImageDefaults.js';

import { countCalls, createOperationCounters } from './helpers/scale/scaleCounters.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty, randomID: () => 'id-fixture' } };
// `Recipe`'s constructor stamps `metadata.author` from the active user; the drift guard
// below builds one, so the global has to exist before the module is imported.
globalThis.game = { user: { name: 'Fixture GM' } };

const { Recipe } = await import('../src/models/Recipe.js');
const { buildInventorySnapshot } = await import('../src/systems/inventorySnapshot.js');
const { CRAFTING_BROWSE_STATUS, deriveBrowseStatus } =
  await import('../src/systems/craftingBrowseStatus.js');
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
function snapshotHolding(quantity, counters = null) {
  return buildInventorySnapshot({
    craftingActor: { id: 'actor-1', items: [makeItem('Iron Ingot', quantity)] },
    resolveComponent: (item) => {
      counters?.bump('resolveComponent');
      return item.name === IRON.name ? IRON : null;
    },
  });
}

/** One ingredient set requiring `quantity` Iron. */
function ironSet(quantity) {
  return {
    id: `set-${quantity}`,
    ingredientGroups: [
      { options: [{ quantity, match: { type: 'component', componentId: IRON.id } }] },
    ],
    essences: {},
  };
}

/** An explicit multi-step recipe: requirements on `steps[]`, top-level sets EMPTY. */
function makeSteppedRecipe(...perStepIron) {
  return makeRecipe({
    id: 'recipe-stepped',
    ingredientSets: [],
    steps: perStepIron.map((quantity, index) => ({
      id: `step-${index + 1}`,
      name: `Step ${index + 1}`,
      ingredientSets: [ironSet(quantity)],
      resultGroups: [],
    })),
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
    assert.equal('enabled' in player, false, 'nor the GM on/off toggle');

    // Absent means UNLOCKED — the mirror of the absent-`enabled` rule below.
    assert.equal(
      projectRecipeSummary({
        recipe: makeRecipe({ locked: undefined }),
        audience: SUMMARY_AUDIENCE.GM,
      }).locked,
      false
    );
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
      // Deliberately NOT alphabetical: an ascending fixture cannot tell "preserves the
      // authored order" apart from "sorts", so the assertion message below would be
      // claiming something its own inputs could not show.
      recipe: makeRecipe({ category: '  ', tags: ['tin', 'tin', ' brass ', ''] }),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
    });
    assert.equal(summary.category, 'general', 'absent category normalizes to the reserved bucket');
    assert.deepEqual(summary.tags, ['tin', 'brass'], 'deduped and trimmed, order preserved');
    assert.equal(summary.systemId, SYSTEM_ID);
    assert.equal(summary.systemName, SYSTEM.name);
  });

  it('derives categoryLabel from the SAME helper both shipped surfaces already use', () => {
    // `category` is the raw filter-match token and `categoryLabel` is its display string.
    const custom = projectRecipeSummary({
      recipe: makeRecipe({ category: 'Smithing' }),
      localize: (key) => `localized:${key}`,
    });
    assert.equal(custom.category, 'Smithing');
    assert.equal(
      custom.categoryLabel,
      'Smithing',
      'a CUSTOM category is surfaced verbatim — it is GM-authored text, never a key'
    );

    const general = projectRecipeSummary({
      recipe: makeRecipe({ category: '   ' }),
      localize: (key) => `localized:${key}`,
    });
    assert.equal(general.category, 'general');
    assert.equal(
      general.categoryLabel,
      'localized:FABRICATE.Common.General',
      'only the RESERVED bucket is localized, and only through the injected seam'
    );
  });

  it('falls back to the helper’s own default label when no localize seam is supplied', () => {
    // A caller with no i18n (the benchmark harness, a unit fixture) must still get a usable
    // label rather than a raw key leaking into a row.
    assert.equal(
      projectRecipeSummary({ recipe: makeRecipe({ category: null }) }).categoryLabel,
      'General'
    );
  });

  it('surfaces a name exactly as authored, padding included', () => {
    // Deliberately untrimmed: the summary and the editor must agree about what the name
    // IS, and a projection that quietly trimmed would make a GM's leading space invisible
    // in every list while remaining in the record.
    assert.equal(
      projectRecipeSummary({ recipe: makeRecipe({ name: '  Iron Nails  ' }) }).name,
      '  Iron Nails  '
    );
  });

  it('reads an absent `enabled` as ON, matching the model default and the GM filter', () => {
    const summary = projectRecipeSummary({
      recipe: makeRecipe({ enabled: undefined }),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
    });
    assert.equal(summary.enabled, true);
  });

  it('takes systemId from the RECIPE, never from the system it was handed', () => {
    // Pinned with the two deliberately DIFFERENT, because the default fixture has them equal —
    // under which reading the wrong object is indistinguishable, and `system` is optional, so the
    // mistake would surface as a null systemId for every caller that omits it.
    const summary = projectRecipeSummary({
      recipe: makeRecipe({ craftingSystemId: 'from-the-recipe' }),
      system: { id: 'from-the-system', name: 'Alchemical Arts' },
      audience: SUMMARY_AUDIENCE.GM,
    });
    assert.equal(summary.systemId, 'from-the-recipe');
    assert.equal(summary.systemName, 'Alchemical Arts', 'the NAME does come from the system');
  });

  it('resolves the recipe image through the shared sentinel chokepoint', () => {
    // `resolveRecipeImage` maps both "" and Foundry's generic item-bag to the blueprint default.
    for (const authored of ['', GENERIC_ITEM_IMAGE]) {
      assert.equal(
        projectRecipeSummary({ recipe: makeRecipe({ img: authored }), system: SYSTEM }).img,
        DEFAULT_CRAFTING_IMAGE
      );
    }
    assert.equal(
      projectRecipeSummary({ recipe: makeRecipe({ img: 'icons/own.webp' }), system: SYSTEM }).img,
      'icons/own.webp',
      'an authored image still wins'
    );
  });

  it('projects an absent recipe and component without throwing', () => {
    const recipe = projectRecipeSummary({ audience: SUMMARY_AUDIENCE.GM });
    assert.equal(recipe.id, null);
    assert.equal(recipe.name, '');
    assert.equal(recipe.availability, null);
    assert.deepEqual(
      Object.keys(recipe).sort((left, right) => left.localeCompare(right)),
      summaryFieldsFor(RECIPE_SUMMARY_FIELDS, SUMMARY_AUDIENCE.GM),
      'the shape is uniform even for an absent record'
    );
    assert.equal(projectComponentSummary({}).id, null);
  });
});

describe('summary purity — zero exact-evaluation calls', () => {
  /**
   * A recipe carrying counted tripwires everywhere a projection could plausibly reach for one: on
   * the recipe, on each ingredient set, and on the owning system.
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

  it('ignores a manager-shaped collaborator handed to it under any plausible name', () => {
    // The tripwires above sit on objects the projection is STRUCTURALLY unable to call, so on their
    // own they only rule out the least likely regression.
    const counters = createOperationCounters();
    const manager = {
      evaluateCraftability: () => ({ canCraft: false }),
      resolveIngredientSelection: () => ({ selection: [] }),
      getRecipes: () => [],
    };
    countCalls(manager, 'evaluateCraftability', counters, 'evaluateCraftability');
    countCalls(manager, 'resolveIngredientSelection', counters, 'resolveIngredientSelection');

    const collaborators = {
      recipeManager: manager,
      manager,
      recipeVisibility: manager,
      craftingSystemManager: manager,
      listingBuilder: manager,
    };
    projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(9),
      ...collaborators,
    });
    projectComponentSummary({ component: IRON, systemId: SYSTEM_ID, ...collaborators });

    assert.equal(counters.get('evaluateCraftability'), 0);
    assert.equal(counters.get('resolveIngredientSelection'), 0);

    // …and the counter is bound to methods that really can move it.
    manager.evaluateCraftability();
    assert.equal(counters.get('evaluateCraftability'), 1);
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
    // The structural half of the invariant.
    const source = readFileSync(
      fileURLToPath(new URL('../src/systems/summaryProjection.js', import.meta.url)),
      'utf8'
    );

    // Comments are stripped FIRST. The exhaustiveness count below keys on the `import`
    // keyword, and this is a module whose own documentation discusses its imports — a doc
    // comment merely containing the word would otherwise fail the test with a message
    // pointing at an import statement that does not exist. (`[^:]` spares `://` in a URL.)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    // The stripper is regex-based, so a stray `/*` inside a string literal or a line comment could
    // open a phantom block running to the next real `*/` and swallow the code between.
    const anchoredImports = (text) => (text.match(/^[ \t]*import\b/gm) ?? []).length;
    assert.equal(
      anchoredImports(code),
      anchoredImports(source),
      'comment stripping must not swallow an import statement'
    );

    // Matches the multi-line form Prettier produces past the print width, and either quote style.
    const withClause = [
      ...code.matchAll(/\b(?:import|export)\b[\s\S]*?\bfrom\s*(['"])([^'"]+)\1/g),
    ].map((match) => match[2]);
    // Side-effect imports (`import './x.js';`) carry no `from` clause at all.
    const sideEffect = [...code.matchAll(/\bimport\s*(['"])([^'"]+)\1/g)].map((match) => match[2]);
    const specifiers = [...new Set([...withClause, ...sideEffect])].sort((left, right) =>
      left.localeCompare(right)
    );

    assert.deepEqual(
      specifiers,
      [
        '../ui/svelte/util/craftingImageDefaults.js',
        '../utils/componentCategories.js',
        '../utils/recipeCategories.js',
        './craftingBrowseStatus.js',
        './inventorySnapshot.js',
        './stepRecipeView.js',
      ],
      'summaryProjection may hold only pure projection leaves — no manager, engine, ' +
        'builder or visibility service. Adding an import or re-export here is a ' +
        'deliberate act.'
    );

    // The scan must also be exhaustive: every `import` keyword in the code has to have
    // been captured above, or a form neither pattern understands could slip past both.
    assert.equal(
      (code.match(/\bimport\b/g) ?? []).length,
      withClause.length,
      'every import statement must be visible to the scan'
    );
    assert.doesNotMatch(code, /\bimport\s*\(/, 'no dynamic import may smuggle one in');
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
    // Two groups each needing 2x Iron against 3 held units. No assignment satisfies both, so exact
    // evaluation says no and this rule says yes.
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

  it('reads a MULTI-STEP recipe from its first execution step, not its empty top level', () => {
    // An explicit multi-step recipe carries its requirements on `steps[]` and leaves the raw
    // top-level `ingredientSets` EMPTY.
    const stepped = makeSteppedRecipe(4);
    assert.deepEqual(stepped.ingredientSets, [], 'the fixture is the real shape, not a prop');

    const short = projectRecipeSummary({
      recipe: stepped,
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(1),
    });
    assert.equal(short.availability.available, false, 'the step requires 4, the actor holds 1');
    assert.equal(short.browseStatus, CRAFTING_BROWSE_STATUS.MISSING_MATERIALS);

    const met = projectRecipeSummary({
      recipe: stepped,
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(9),
    });
    assert.equal(met.availability.available, true);
  });

  it('tolerates both recipe shapes a caller may hold', () => {
    // A `Recipe` answers `getExecutionSteps()`; a deserialized row carries a bare `steps[]`.
    // Reading only the latter would leave every instance caller on the silently-vacuous path above.
    const plain = makeSteppedRecipe(4);
    for (const [label, recipe] of [
      ['plain object', plain],
      ['Recipe instance', new Recipe({ ...plain, id: 'recipe-stepped-instance' })],
    ]) {
      assert.equal(
        projectSummaryAvailability({ snapshot: snapshotHolding(1), system: SYSTEM, recipe })
          .available,
        false,
        label
      );
    }
  });

  it("reads the FIRST step, not the last and not the actor's active one", () => {
    // The spec states the FIRST step normatively, and the module's own docblock explains why it is
    // not the active step.
    const twoStep = makeSteppedRecipe(2, 99);
    for (const [label, recipe] of [
      ['plain object', twoStep],
      ['Recipe instance', new Recipe({ ...twoStep, id: 'recipe-two-step-instance' })],
    ]) {
      assert.equal(
        projectSummaryAvailability({ snapshot: snapshotHolding(3), system: SYSTEM, recipe })
          .available,
        true,
        `${label}: step 1 needs 2 against 3 held — step 2's 99 must not decide the row`
      );
    }
  });

  it('answers "not asked" for an absent recipe even WITH a snapshot in view', () => {
    // The `!recipe` guard, pinned directly.
    assert.equal(
      projectSummaryAvailability({ snapshot: snapshotHolding(9), system: SYSTEM, recipe: null }),
      null
    );
    assert.equal(
      projectRecipeSummary({
        system: SYSTEM,
        audience: SUMMARY_AUDIENCE.PLAYER,
        access: VISIBLE_ACCESS,
        snapshot: snapshotHolding(9),
      }).availability,
      null
    );
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

  it('resolves the inventory once for a whole page of recipes of one system', () => {
    // The rule's cost claim, and the reason both surfaces are allowed to call it per row.
    const counters = createOperationCounters();
    const snapshot = snapshotHolding(20, counters);
    countCalls(snapshot, 'componentTallies', counters, 'componentTallies');
    countCalls(snapshot, 'heldItems', counters, 'heldItems');

    let itemReads = 0;
    const actorItems = snapshot.actors[0].items;
    Object.defineProperty(snapshot.actors[0], 'items', {
      configurable: true,
      get() {
        itemReads += 1;
        return actorItems;
      },
    });

    const PAGE = 25;
    for (let index = 0; index < PAGE; index += 1) {
      projectRecipeSummary({
        recipe: makeRecipe({ id: `recipe-${index}` }),
        system: SYSTEM,
        audience: SUMMARY_AUDIENCE.PLAYER,
        access: VISIBLE_ACCESS,
        snapshot,
      });
    }

    assert.equal(counters.get('componentTallies'), PAGE, 'once per summary, by construction');
    assert.equal(itemReads, 1, 'one lazy walk for the whole page, not one per row');
    assert.equal(
      counters.get('resolveComponent'),
      1,
      'one identity resolution per held item for the whole page — not one per row'
    );
    assert.equal(counters.get('heldItems'), 0, 'and no walk of its own beside the tallies');
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
    // A teaser is shown to the player DELIBERATELY, so name, image, category and tags are the part
    // they are meant to see.
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
    assert.equal(
      summary.categoryLabel,
      'Smithing',
      'the display form of an unredacted field discloses nothing the field did not'
    );
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

  it("that fallback does not drift from the Recipe model's own normalized default", () => {
    // The default list is a hand-maintained mirror — the model owns it, and nothing binds the
    // copies.
    const authoritative = new Recipe({
      id: 'drift',
      name: 'Drift Guard',
      craftingSystemId: SYSTEM_ID,
      teaser: { enabled: true },
    }).teaser.hiddenFields;

    const projected = projectRecipeSummary({
      recipe: makeRecipe(),
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: { visible: true, reason: 'teaser', teaserState: { isTeaser: true } },
    }).redaction.hiddenFields;

    assert.deepEqual(projected, authoritative);
  });

  it('hands out a COPY of hiddenFields, never the caller’s own array', () => {
    // A consumer trimming or sorting the list it was given would otherwise reach back into
    // the caller's `access.teaserState` — or throw, when the fallback path handed out the
    // module's frozen default.
    const access = {
      visible: true,
      reason: 'teaser',
      teaserState: { isTeaser: true, hiddenFields: ['ingredients'] },
    };
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      audience: SUMMARY_AUDIENCE.PLAYER,
      access,
    });
    summary.redaction.hiddenFields.push('results');
    assert.deepEqual(access.teaserState.hiddenFields, ['ingredients'], 'caller state untouched');

    const defaulted = projectRecipeSummary({
      recipe: makeRecipe(),
      audience: SUMMARY_AUDIENCE.PLAYER,
      access: { visible: true, reason: 'teaser', teaserState: { isTeaser: true } },
    });
    defaulted.redaction.hiddenFields.push('tools');
    assert.deepEqual(
      projectRecipeSummary({
        recipe: makeRecipe(),
        audience: SUMMARY_AUDIENCE.PLAYER,
        access: { visible: true, reason: 'teaser', teaserState: { isTeaser: true } },
      }).redaction.hiddenFields,
      ['ingredients', 'results', 'description'],
      'the shared default survives a consumer mutating an earlier copy'
    );
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

  // The one-hot table above cannot pin the ORDER of two conditions — it only ever sets one at a
  // time, so swapping a pair of branches leaves it green.
  const precedencePairs = [
    ['teaser over everything below it', { reason: 'teaser' }, CRAFTING_BROWSE_STATUS.DISCOVERY],
    ['locked over everything below it', { reason: 'locked' }, CRAFTING_BROWSE_STATUS.LOCKED],
    ['knowledge over everything below it', { reason: 'knowledge' }, CRAFTING_BROWSE_STATUS.UNKNOWN],
    ['exhaustion over a material shortfall', {}, CRAFTING_BROWSE_STATUS.EXHAUSTED],
  ];

  for (const [label, higher, expected] of precedencePairs) {
    it(`resolves ${label} with every lower condition also set`, () => {
      // Every condition BELOW the one under test is set too, so the assertion is about
      // order rather than about the branch in isolation.
      assert.equal(
        deriveBrowseStatus({ ...higher, exhausted: true, materialsAvailable: false }),
        expected
      );
    });
  }

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

  it('never reports a GM row exhausted, because a GM bypasses the knowledge gate', () => {
    // `browseStatus` is a SHARED field, so honouring a caller's `exhausted` for a GM would make a
    // shared field's derivation depend on the audience — the one thing this contract forbids.
    const summary = projectRecipeSummary({
      recipe: makeRecipe(),
      system: SYSTEM,
      audience: SUMMARY_AUDIENCE.GM,
      access: VISIBLE_ACCESS,
      snapshot: snapshotHolding(9),
      exhausted: true,
    });
    assert.equal(summary.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
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

  it('accepts the definition index as a Map OR a plain object', () => {
    // The failure mode of a Map-only read is SILENT: a plain object misses, the name falls
    // back to the raw id, and an id is a valid name — so the wrong shape would ship green
    // with ids showing in the UI rather than throwing anywhere.
    const expected = [{ id: 'earth', quantity: 2, name: 'Earth' }];
    for (const [label, index] of [
      ['Map', new Map([['earth', { id: 'earth', name: 'Earth' }]])],
      ['plain object', { earth: { id: 'earth', name: 'Earth' } }],
    ]) {
      assert.deepEqual(
        projectComponentSummary({ component: IRON, essenceDefinitionsById: index }).essences,
        expected,
        label
      );
    }
  });

  it('reports salvageEnabled false for a component carrying no salvage block', () => {
    // The only component fixture has salvage enabled, so a `!== false` read would pass
    // every assertion while flipping every unsalvageable component ON in the GM filter.
    assert.equal(projectComponentSummary({ component: { id: 'c' } }).salvageEnabled, false);
    assert.equal(
      projectComponentSummary({ component: { id: 'c', salvage: { enabled: false } } })
        .salvageEnabled,
      false
    );
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
