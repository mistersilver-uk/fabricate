/**
 * Player-visible redaction pins for the crafting read path (issue 1075, under #1070).
 *
 * ## Why this suite exists, and why it lands BEFORE the summary/detail split
 *
 * #1075 splits `CraftingListingBuilder.buildListing` into a cheap paged summary phase and
 * a per-recipe detail phase. The risk in that split is not performance, it is DISCLOSURE:
 * `RecipeVisibilityService` is over two thousand lines, the teaser gate it feeds is the only
 * thing standing between an undiscovered recipe and the player's screen, and the failure
 * mode of moving a field to the wrong phase is a leak rather than a slow list.
 *
 * So the behaviour is pinned against the PRE-SPLIT builder first, and every later commit has
 * to keep these assertions green. A regression suite written after a refactor pins the
 * refactor, not the behaviour it was supposed to preserve.
 *
 * ## The adapter is the only thing the split is allowed to move
 *
 * Every assertion below reaches the player-visible model through {@link playerView}. Before
 * the split it reads one corpus-wide listing of rich models; after it, `rows` are #1091
 * summaries and `detailFor` hydrates one recipe. That indirection is deliberate: it keeps the
 * ~30 disclosure assertions BYTE-IDENTICAL across the split, so the diff of the commit that
 * performs the split shows the adapter moving and nothing else. An assertion rewritten in the
 * same commit as the code it guards proves nothing.
 *
 * `rows` are therefore only ever asserted on fields BOTH shapes carry — identity, grouping,
 * browse status and the redaction verdict. The material-availability half is deliberately not
 * asserted at row level, because the split legitimately re-derives it through #1077's
 * optimistic projection; what must not change is who is redacted and what is withheld.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CRAFTING_BROWSE_STATUS } from '../src/systems/craftingBrowseStatus.js';
import { CraftingListingBuilder } from '../src/systems/CraftingListingBuilder.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';

import { countCalls, createOperationCounters } from './helpers/scale/scaleCounters.js';

const PLAYER = { id: 'user-fern', isGM: false };
const GAME_MASTER = { id: 'user-quill', isGM: true };

const FORGE_ID = 'sys-emberforge';

/** Components the fixture recipes consume and produce, with progressive difficulties. */
const LIBRARY = Object.freeze([
  {
    id: 'c-emberdust',
    name: 'Emberdust',
    img: 'icons/dust.webp',
    difficulty: 2,
    essences: { ember: 1 },
  },
  { id: 'c-slag', name: 'Cooled Slag', img: 'icons/slag.webp', difficulty: 3 },
  { id: 'c-warding-nail', name: 'Warding Nail', img: 'icons/nail.webp', difficulty: 4 },
  // Tags are authored on the COMPONENT definition, which is the only place Fabricate ever
  // writes them (issue 857). The tag-matched fixtures below hold an item that carries no
  // `flags.fabricate.tags` of its own, exactly as a real owned stack does.
  {
    id: 'c-brine-salt',
    name: 'Brine Salt',
    img: 'icons/salt.webp',
    difficulty: 1,
    tags: ['quenchant'],
  },
]);

/** The one authored result group every fixture recipe routes to. */
const YIELD_GROUP = Object.freeze({
  id: 'grp-yield',
  name: 'Yield',
  checkOutcomeIds: [],
  results: [
    { id: 'res-nail', componentId: 'c-warding-nail', quantity: 3 },
    { id: 'res-slag', componentId: 'c-slag', quantity: 1 },
  ],
});

function forgeSystem(overrides = {}) {
  return {
    id: FORGE_ID,
    name: 'Emberforge',
    resolutionMode: 'simple',
    enableEssences: true,
    features: { craftingChecks: true },
    craftingCheck: {
      simple: { rollFormula: '1d20 + @abilities.str.mod', dc: 17 },
      routed: {},
      progressive: {},
    },
    components: [...LIBRARY],
    ...overrides,
  };
}

/**
 * A recipe whose every spoiler-bearing field carries a value a leak test can name. Nothing
 * here is empty, because an empty field is indistinguishable from a redacted one.
 */
function forgeRecipe(overrides = {}) {
  const sets = overrides.ingredientSets ?? [
    {
      id: 'set-primary',
      name: 'Quenched in brine',
      essences: { ember: 2 },
      ingredientGroups: [
        {
          id: 'grp-dust',
          options: [{ quantity: 2, match: { type: 'component', componentId: 'c-emberdust' } }],
        },
      ],
    },
  ];
  const resultGroups = overrides.resultGroups ?? [YIELD_GROUP];
  return {
    id: 'r-warding-nails',
    name: 'Warding Nails',
    img: 'icons/nail.webp',
    craftingSystemId: FORGE_ID,
    category: 'Ironwork',
    description: 'SPOILER: quenched in the blood of the thing beneath the forge.',
    timeRequirement: { hours: 6 },
    ...overrides,
    ingredientSets: sets,
    resultGroups,
    getExecutionSteps: () => [
      { id: 'step-forge', name: 'Forge', ingredientSets: sets, resultGroups },
    ],
  };
}

/** The teaser hidden-field vocabulary the builder falls back to when a teaser names none. */
const DEFAULT_HIDDEN = ['ingredients', 'results', 'description'];

function teaserAccess(hiddenFields) {
  return {
    visible: true,
    reason: 'teaser',
    teaserState: hiddenFields ? { isTeaser: true, hiddenFields } : { isTeaser: true },
  };
}

/**
 * A builder over a fixed entry list, with an `evaluateCraftability` tripwire.
 *
 * The tripwire is counted rather than merely stubbed: "an undiscovered recipe's exact
 * craftability is never computed" is the disclosure half nothing in the returned model can
 * show, since the leak would be the WORK rather than a field. `counters` is returned so a
 * test can prove the count is non-vacuous by invoking the tripwire itself.
 */
function forgeBuilder({
  entries,
  system = forgeSystem(),
  canCraft = true,
  exhausted = false,
  isSystemBlockedForRecipes = null,
} = {}) {
  const counters = createOperationCounters();
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getRecipeItemDefinition: () => null,
  };
  const recipeManager = {
    evaluateCraftability: () => ({
      canCraft,
      satisfiableSet: { id: 'set-primary' },
      ingredientStates: [{ description: '2x Emberdust', need: 2, have: 2, satisfied: true }],
      essenceStates: [],
      toolStates: [],
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    getRecipe: (id) => entries.find((entry) => entry.recipe?.id === id)?.recipe ?? null,
  };
  countCalls(recipeManager, 'evaluateCraftability', counters, 'evaluateCraftability');

  const builder = new CraftingListingBuilder({
    recipeManager,
    recipeVisibility: {
      getVisibleRecipes: () => entries,
      evaluateRecipeAccess: ({ recipe }) =>
        entries.find((entry) => entry.recipe?.id === recipe?.id)?.access ?? {
          visible: false,
          reason: 'visibility',
        },
      isKnowledgeItemExhausted: () => exhausted,
    },
    resolutionModeService: new ResolutionModeService(craftingSystemManager),
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 4200,
    // The summary phase's held-quantity tallies resolve item identity through this seam
    // (issue 1075). Wired by NAME here, which is enough for a fixture and keeps the real
    // four-module matcher graph out of the suite.
    resolveComponentForItem: (item, components) =>
      components.find((component) => component.name === item?.name) ?? null,
    ...(isSystemBlockedForRecipes && { isSystemBlockedForRecipes }),
  });
  return { builder, counters, recipeManager };
}

/**
 * The viewing character, holding MORE than the fixture recipe requires.
 *
 * A stocked actor rather than an empty one, because after the summary/detail split the row's
 * material verdict comes from what this actor really holds instead of from a stubbed
 * `canCraft`. An empty actor would paint every row `missingMaterials`, which outranks nothing
 * but does mask the statuses these tests are actually about.
 */
const ACTOR = Object.freeze({
  id: 'actor-fern',
  name: 'Fern',
  items: [{ uuid: 'Item.emberdust-1', name: 'Emberdust', system: { quantity: 4 } }],
});

/**
 * THE ADAPTER — see the header. `rows` is what the browser list renders; `detailFor` is
 * what the inspector renders for one recipe.
 */
function playerView({ builder }, viewer = PLAYER, craftingActor = ACTOR) {
  const listing = builder.buildListing({ craftingActor, viewer });
  const rows = listing.summaries;
  return {
    listing,
    rows,
    rowFor: (id) => rows.find((row) => row?.id === id) ?? null,
    // Deliberately by ID and with no `access` argument, so the detail phase re-resolves
    // visibility for itself. Handing it the row's access would test the projection while
    // skipping the gate that decides whether the projection may run at all.
    detailFor: (id) => builder.buildRecipeDetail({ recipeId: id, craftingActor, viewer }),
  };
}

describe('crafting redaction — an undiscovered recipe stays undiscovered', () => {
  const fullyHidden = () =>
    forgeBuilder({ entries: [{ recipe: forgeRecipe(), access: teaserAccess(DEFAULT_HIDDEN) }] });

  it('marks the row redacted and names exactly the authored hidden fields', () => {
    const view = playerView(fullyHidden());
    const row = view.rowFor('r-warding-nails');
    assert.equal(row.redaction.redacted, true);
    assert.deepEqual(row.redaction.hiddenFields, DEFAULT_HIDDEN);
  });

  it('paints the row with the discovery status, never a craftable-looking one', () => {
    // The status IS the disclosure at row level: an `available` teaser tells the player
    // they hold everything an unseen recipe needs.
    const row = playerView(fullyHidden()).rowFor('r-warding-nails');
    assert.equal(row.browseStatus, CRAFTING_BROWSE_STATUS.DISCOVERY);
  });

  it('carries no material-availability signal on a redacted row', () => {
    // Availability is derived from the recipe's INGREDIENTS, one of the three fields a
    // teaser hides by default, so a row answering "you have the materials" would leak the
    // shape of a requirement the player is not meant to see — once per inventory change.
    // Asserted as falsy rather than `=== null` so it holds for a shape that omits the field
    // entirely as well as one that withholds it.
    const row = playerView(fullyHidden()).rowFor('r-warding-nails');
    assert.ok(!row.availability, 'no availability may ride on a redacted row');
  });

  it('still surfaces the identity and grouping metadata a teaser is MEANT to show', () => {
    // A teaser is displayed deliberately. Name, image and category are the part the GM
    // chose to reveal; withholding them would break the feature rather than protect it.
    const row = playerView(fullyHidden()).rowFor('r-warding-nails');
    assert.equal(row.name, 'Warding Nails');
    assert.equal(row.img, 'icons/nail.webp');
    assert.equal(row.category, 'Ironwork');
    assert.equal(row.categoryLabel, 'Ironwork');
    assert.equal(row.systemId, FORGE_ID);
    assert.equal(row.systemName, 'Emberforge');
  });

  it('withholds the description, the ingredients, the results and the check', () => {
    const detail = playerView(fullyHidden()).detailFor('r-warding-nails');
    assert.equal(detail.flavor, '', 'the authored spoiler description must not cross');
    assert.deepEqual(detail.ingredientSets, [], 'no ingredient set names or requirements');
    assert.deepEqual(detail.result.items, [], 'no product rows');
    assert.equal(detail.check, null, 'no roll formula, skill or DC');
    assert.equal(detail.outcomeTiers, null, 'no per-tier outcomes');
    assert.deepEqual(detail.progressiveStages, [], 'no stage list');
  });

  it('withholds the duration and the step structure regardless of the hidden-field list', () => {
    // Timing and step shape are spoiler detail for a Discovery-Mode teaser independently of
    // the configurable result-field redaction, so a teaser naming ONLY `ingredients` must
    // still surface neither. The recipe authors a 6-hour requirement, so a `null` here is a
    // decision rather than an absent fixture value.
    const partial = forgeBuilder({
      entries: [{ recipe: forgeRecipe(), access: teaserAccess(['ingredients']) }],
    });
    const detail = playerView(partial).detailFor('r-warding-nails');
    assert.equal(detail.duration, null);
    assert.deepEqual(detail.steps, []);
  });

  it('exposes no selectable set and no run position for a teaser', () => {
    const detail = playerView(fullyHidden()).detailFor('r-warding-nails');
    assert.equal(detail.defaultSetId, null);
    assert.equal(detail.activeStepId, null);
    assert.equal(detail.displayedStepId, null);
    assert.equal(detail.activeStepIndex, 0);
    assert.equal(detail.activeStepTimeGateArmed, false);
  });

  it('never evaluates exact craftability for a redacted recipe', () => {
    // The disclosure no returned field can show: the leak here would be the WORK, not a
    // value. Exact evaluation reads the actor's inventory against the hidden requirements,
    // and a "why is opening this list slow only when I own the reagents?" oracle is a real
    // side channel — but the first-order reason is simpler: a redacted model has nowhere to
    // put the answer, so computing it is pure disclosure risk for no product.
    const { builder, counters, recipeManager } = fullyHidden();
    playerView({ builder });
    assert.equal(counters.get('evaluateCraftability'), 0);

    // Non-vacuity: the same counter DOES move when the tripwire is invoked directly, so the
    // zero above is evidence rather than a counter that cannot count.
    recipeManager.evaluateCraftability();
    assert.equal(counters.get('evaluateCraftability'), 1);
  });

  it('falls back to the documented default hidden fields when the teaser names none', () => {
    const defaulted = forgeBuilder({
      entries: [{ recipe: forgeRecipe(), access: teaserAccess(null) }],
    });
    const view = playerView(defaulted);
    assert.deepEqual(view.rowFor('r-warding-nails').redaction.hiddenFields, DEFAULT_HIDDEN);
    const detail = view.detailFor('r-warding-nails');
    assert.equal(detail.flavor, '');
    assert.deepEqual(detail.ingredientSets, []);
    assert.equal(detail.check, null);
  });
});

describe('crafting redaction — a partial teaser hides exactly what it names', () => {
  const partial = (hiddenFields) =>
    forgeBuilder({ entries: [{ recipe: forgeRecipe(), access: teaserAccess(hiddenFields) }] });

  it('hides ingredients while still surfacing results, check and description', () => {
    const detail = playerView(partial(['ingredients'])).detailFor('r-warding-nails');
    assert.deepEqual(detail.ingredientSets, []);
    assert.equal(detail.flavor, 'SPOILER: quenched in the blood of the thing beneath the forge.');
    assert.equal(detail.result.items.length, 2, 'both authored product rows surface');
    assert.ok(detail.check, 'the check surfaces');
  });

  it('hides results while still surfacing the ingredient set names', () => {
    const detail = playerView(partial(['results'])).detailFor('r-warding-nails');
    assert.equal(detail.ingredientSets.length, 1);
    assert.equal(detail.ingredientSets[0].label, 'Quenched in brine');
    assert.deepEqual(detail.result.items, []);
    assert.equal(detail.check, null);
    assert.equal(detail.outcomeTiers, null);
  });

  it('never attaches per-set craftability to a teaser, even when ingredients are shown', () => {
    // The set NAMES are permitted for a teaser that does not hide `ingredients`; the actor's
    // exact standing against them is not, in either direction. A satisfied-looking set is
    // the same disclosure as an unsatisfied one.
    const detail = playerView(partial(['results'])).detailFor('r-warding-nails');
    assert.equal(detail.ingredientSets[0].craftability, null);
  });

  it('hides only the description when that is all the teaser names', () => {
    const detail = playerView(partial(['description'])).detailFor('r-warding-nails');
    assert.equal(detail.flavor, '');
    assert.equal(detail.ingredientSets.length, 1);
    assert.equal(detail.result.items.length, 2);
  });
});

describe('crafting redaction — a progressive teaser leaks no stage list', () => {
  const PROGRESSIVE = forgeSystem({
    resolutionMode: 'progressive',
    craftingCheck: {
      simple: {},
      routed: {},
      progressive: { rollFormula: '2d6', awardMode: 'equal' },
    },
  });

  const progressiveBuilder = (access) =>
    forgeBuilder({ system: PROGRESSIVE, entries: [{ recipe: forgeRecipe(), access }] });

  it('withholds every authored stage from a redacted player', () => {
    const detail = playerView(progressiveBuilder(teaserAccess(DEFAULT_HIDDEN))).detailFor(
      'r-warding-nails'
    );
    assert.deepEqual(detail.progressiveStages, []);
  });

  it('non-vacuity: the same recipe DOES surface its stages once discovered', () => {
    // Without this the assertion above passes for a fixture that simply has no stages, which
    // is the shape a redaction test most easily degrades into.
    const detail = playerView(progressiveBuilder({ visible: true, reason: 'ok' })).detailFor(
      'r-warding-nails'
    );
    assert.deepEqual(
      detail.progressiveStages.map((stage) => stage.name),
      ['Warding Nail', 'Cooled Slag']
    );
  });
});

describe('crafting redaction — the GM bypass is total, and the player gate is not', () => {
  const teased = () =>
    forgeBuilder({ entries: [{ recipe: forgeRecipe(), access: teaserAccess(DEFAULT_HIDDEN) }] });

  it('shows a GM the whole recipe even when the access reason is teaser', () => {
    const view = playerView(teased(), GAME_MASTER);
    assert.equal(view.rowFor('r-warding-nails').redaction.redacted, false);
    const detail = view.detailFor('r-warding-nails');
    assert.equal(detail.flavor, 'SPOILER: quenched in the blood of the thing beneath the forge.');
    assert.equal(detail.ingredientSets.length, 1);
    assert.equal(detail.result.items.length, 2);
    assert.ok(detail.check);
  });

  it('never reports a GM row exhausted, because a GM bypasses the knowledge gate', () => {
    const view = playerView(
      forgeBuilder({
        entries: [{ recipe: forgeRecipe(), access: { visible: true, reason: 'ok' } }],
        exhausted: true,
      }),
      GAME_MASTER
    );
    assert.equal(view.rowFor('r-warding-nails').browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
  });

  it('surfaces exhaustion to the PLAYER the knowledge evaluation established it for', () => {
    const view = playerView(
      forgeBuilder({
        entries: [{ recipe: forgeRecipe(), access: { visible: true, reason: 'ok' } }],
        exhausted: true,
      })
    );
    assert.equal(view.rowFor('r-warding-nails').browseStatus, CRAFTING_BROWSE_STATUS.EXHAUSTED);
  });

  it('keeps the reason-driven statuses a player is entitled to see', () => {
    for (const [reason, expected] of [
      ['locked', CRAFTING_BROWSE_STATUS.LOCKED],
      ['knowledge', CRAFTING_BROWSE_STATUS.UNKNOWN],
    ]) {
      const view = playerView(
        forgeBuilder({ entries: [{ recipe: forgeRecipe(), access: { visible: true, reason } }] })
      );
      assert.equal(view.rowFor('r-warding-nails').browseStatus, expected, reason);
    }
  });
});

describe('crafting redaction — a blocked system exposes nothing to a player', () => {
  const blocked = () =>
    forgeBuilder({
      entries: [{ recipe: forgeRecipe(), access: { visible: true, reason: 'ok' } }],
      isSystemBlockedForRecipes: (id) => id === FORGE_ID,
    });

  it('drops every row of a blocked system for a non-GM viewer', () => {
    const view = playerView(blocked());
    assert.equal(view.rows.length, 0);
    assert.deepEqual(view.listing.counts, { available: 0, total: 0 });
  });

  it('retains them for a GM', () => {
    const view = playerView(blocked(), GAME_MASTER);
    assert.equal(view.rows.length, 1);
    assert.equal(view.rowFor('r-warding-nails').id, 'r-warding-nails');
  });

  it('projects nothing at all for an entry carrying no recipe', () => {
    const view = playerView(
      forgeBuilder({
        entries: [
          { access: { visible: true, reason: 'ok' } },
          { recipe: forgeRecipe(), access: { visible: true, reason: 'ok' } },
        ],
      })
    );
    assert.equal(view.rows.length, 1);
  });
});

// ---------------------------------------------------------------------------
// The material verdict a row actually carries
// ---------------------------------------------------------------------------

/** A tag-matched recipe: 2x anything carrying the authored `quenchant` tag. */
function brineRecipe() {
  return forgeRecipe({
    id: 'r-brined-nails',
    name: 'Brined Nails',
    ingredientSets: [
      {
        id: 'set-brine',
        name: 'Quenched in brine',
        essences: {},
        ingredientGroups: [
          {
            id: 'grp-quenchant',
            options: [
              { quantity: 2, match: { type: 'tags', tags: ['quenchant'], tagMatch: 'any' } },
            ],
          },
        ],
      },
    ],
  });
}

/**
 * An actor holding `quantity` Brine Salt and NOTHING ELSE.
 *
 * The held item carries no `flags.fabricate.tags`, because Fabricate never stamps that flag
 * onto an inventory item — its tags come from the `c-brine-salt` component it resolves to.
 */
function brineActor(quantity) {
  return {
    id: 'actor-brine',
    name: 'Wren',
    items: [{ uuid: 'Item.salt-1', name: 'Brine Salt', system: { quantity } }],
  };
}

const visible = (recipe) => ({ recipe, access: { visible: true, reason: 'ok' } });

describe('crafting availability — a row says what the actor really holds', () => {
  it('reports a tag-matched recipe AVAILABLE from the component-authored tags', () => {
    // The defect this pins (issue 857 read forwards): authored tags live on the managed
    // component, never on the owned item's flags. A tally reading only the item flag is
    // empty in every real world, so every tag-matched option reported `false` — the row
    // painted "Missing materials" while the inspector this PR hydrates from the exact model
    // said "Available", on the same screen, in the direction the contract forbids.
    const view = playerView(
      forgeBuilder({ entries: [visible(brineRecipe())] }),
      PLAYER,
      brineActor(4)
    );
    const row = view.rowFor('r-brined-nails');

    assert.equal(row.availability.available, true, 'four salts cover a 2x quenchant requirement');
    assert.equal(row.availability.optimistic, true, 'and it still advertises its imprecision');
    assert.equal(row.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
    assert.equal(view.listing.counts.available, 1);
  });

  it('non-vacuity: the same tag requirement goes short when the actor holds too few', () => {
    // Without this the assertion above passes for a projection that answers `true` for
    // everything, which is precisely what a summary phase that stopped consulting the
    // snapshot would do — the FAIL-OPEN direction.
    const view = playerView(
      forgeBuilder({ entries: [visible(brineRecipe())] }),
      PLAYER,
      brineActor(1)
    );
    const row = view.rowFor('r-brined-nails');

    assert.equal(row.availability.available, false, 'one salt cannot cover a 2x requirement');
    assert.equal(row.browseStatus, CRAFTING_BROWSE_STATUS.MISSING_MATERIALS);
    assert.equal(view.listing.counts.available, 0);
  });

  it('carries a non-null availability on an ordinary component-matched row', () => {
    // `assert.ok(!row.availability)` on the redacted row is only a controlled negative if
    // something asserts the field IS populated when it should be. Without this pair, a
    // summary phase that stopped passing the snapshot altogether would leave every
    // assertion in this file green while every player row read "available" regardless of
    // inventory.
    const row = playerView(forgeBuilder({ entries: [visible(forgeRecipe())] })).rowFor(
      'r-warding-nails'
    );
    assert.equal(row.availability.available, true, 'the actor holds 4 of the 2 required');
    assert.equal(row.availability.optimistic, true);
    assert.equal(row.browseStatus, CRAFTING_BROWSE_STATUS.AVAILABLE);
  });

  it('paints missingMaterials for a component requirement the actor cannot cover', () => {
    const bare = { id: 'actor-bare', name: 'Fern', items: [] };
    const view = playerView(forgeBuilder({ entries: [visible(forgeRecipe())] }), PLAYER, bare);
    const row = view.rowFor('r-warding-nails');

    assert.equal(row.availability.available, false);
    assert.equal(row.browseStatus, CRAFTING_BROWSE_STATUS.MISSING_MATERIALS);
  });
});

// ---------------------------------------------------------------------------
// The detail phase's own gates — an id is not a permission
// ---------------------------------------------------------------------------

describe('crafting detail gates — hydrating by id re-applies every summary-phase gate', () => {
  it('answers nothing for an id no recipe exists for', () => {
    const view = playerView(forgeBuilder({ entries: [visible(forgeRecipe())] }));
    assert.equal(view.detailFor('r-not-a-recipe'), null);
    assert.ok(view.detailFor('r-warding-nails'), 'non-vacuity: the real id still hydrates');
  });

  it('re-applies the system block; an id is not a permission', () => {
    // `hydrateCraftingRecipe({recipeId})` is client-reachable and the id arrives from the
    // client. Without this gate a player passes a blocked system's recipe id and receives
    // the full rich model — description, ingredient sets, check DC, outcome tiers.
    const blocked = () =>
      forgeBuilder({
        entries: [visible(forgeRecipe())],
        isSystemBlockedForRecipes: (id) => id === FORGE_ID,
      });

    assert.equal(playerView(blocked()).detailFor('r-warding-nails'), null);
    assert.ok(
      playerView(blocked(), GAME_MASTER).detailFor('r-warding-nails'),
      'non-vacuity: the GM bypass still hydrates it'
    );
  });

  it('answers nothing when access resolves invisible for an entry that IS in the pass', () => {
    // This pins the deliberate `=== false` rather than `!== true` read: an access result
    // that explicitly says `visible: false` blanks the inspector, while a hand-built result
    // carrying only a `reason` does not.
    const hidden = forgeBuilder({
      entries: [{ recipe: forgeRecipe(), access: { visible: false, reason: 'visibility' } }],
    });
    assert.equal(playerView(hidden).detailFor('r-warding-nails'), null);

    const reasonOnly = forgeBuilder({
      entries: [{ recipe: forgeRecipe(), access: { reason: 'ok' } }],
    });
    assert.ok(
      playerView(reasonOnly).detailFor('r-warding-nails'),
      'non-vacuity: an access result with no `visible` flag is not read as invisible'
    );
  });

  it('answers nothing for a recipe the GM has disabled', () => {
    // The summary phase sources from `getRecipes({enabled: true})`, so it can never project
    // a disabled recipe. `recipeManager.getRecipe` applies no such filter, so without this
    // gate a player who holds an id from before the GM disabled it — or any id at all —
    // hydrates the full model of a recipe the summary phase would refuse to list.
    const disabled = () => forgeBuilder({ entries: [visible(forgeRecipe({ enabled: false }))] });

    assert.equal(playerView(disabled()).detailFor('r-warding-nails'), null);
    assert.ok(
      playerView(disabled(), GAME_MASTER).detailFor('r-warding-nails'),
      'non-vacuity: a GM authoring the disabled recipe still sees it'
    );
    assert.ok(
      playerView(forgeBuilder({ entries: [visible(forgeRecipe())] })).detailFor('r-warding-nails'),
      'non-vacuity: the same recipe hydrates for a player while it is enabled'
    );
  });
});
