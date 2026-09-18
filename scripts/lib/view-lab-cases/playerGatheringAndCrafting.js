/**
 * The player window: the Gathering tab and every crafting resolution mode.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  CRAFTING_PROGRESSIVE,
  CRAFTING_ROUTED_CHECK,
  CRAFTING_ROUTED_INGREDIENTS,
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
} from './caseConstants.js';
import { playerCase, responsiveLayout } from './caseFactories.js';

export const CASES = Object.freeze([
  playerCase({
    id: 'player-gathering-events',
    label: 'Player app — Gathering events',
    smokeLabels: ['player-gathering-events'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The counterpart's own sequence — select an environment, open the Events tab, wait on
    // `[data-gathering-event-section]` — on the world's only environment that has an Events tab.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '[data-gathering-detail-tab="events"]' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-task-ready',
    label: 'Player app — Gathering task ready',
    smokeLabels: ['player-gathering-task-ready'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The counterpart's condition is a selected task whose attempt is not blocked
    // (`[data-gathering-attempt-blocked="false"]`).
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-ridgemoss"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-after-success',
    label: 'Player app — Gathering after success',
    smokeLabels: ['player-gathering-after-success'],
    // The gather runs end to end and the frame says so: "Nodes available: 2/3" against the ready
    // state's 3/3, from a run the manager recorded as `succeeded`. Verified live.
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '.gathering-task-row[data-task-id="sm-task-prospect"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-tool-blocked',
    label: 'Player app — Gathering tool blocked',
    smokeLabels: ['player-gathering-tool-blocked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // A selected task whose attempt is blocked, on the tool reason specifically: Cut Icecap Fronds
    // requires the herbalist's glass alembic, and the gathering actor is the smith who carries none
    // of Idrin's glassware.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-icecap"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-timed-ready',
    label: 'Player app — Gathering timed ready',
    smokeLabels: ['player-gathering-timed-ready'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // A timed task before it has been started: attempt unblocked, and the requirements panel names
    // the six hours the attempt will wait rather than resolving on the spot.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-slowbloom"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-timed-active',
    label: 'Player app — Gathering timed active',
    smokeLabels: ['player-gathering-timed-active'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The same task after its attempt has been started.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-slowbloom"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-blind',
    label: 'Player app — Gathering blind',
    smokeLabels: ['player-gathering-blind'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // `[data-gathering-blind-card]`: a blind-selection environment redacts its task list entirely
    // — one opaque attempt card instead of rows, with the mask chip on the environment card.
    steps: [{ selector: '.gathering-env-card[data-environment-id="hb-env-thicket"]' }],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-realm-locked',
    label: 'Player app — Gathering realm locked',
    smokeLabels: ['player-gathering-realm-locked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The one environment-card state selection cannot reach: a locked teaser, greyed, with the lock
    // overlay and the "not in current realm" header alert.
    steps: [{ selector: '.gathering-env-card.is-locked', scroll: true }],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-stacked',
    label: 'Player app — Gathering stacked',
    smokeLabels: ['player-gathering-stacked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'gathering', 'responsive'],
    expectLayout: responsiveLayout('.gathering-view-container', '.gathering-view-grid'),
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-crafting-simple',
    label: 'Player app — Crafting simple',
    smokeLabels: ['player-crafting-simple'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1100, height: 760 },
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  // The Crafting header withholds "Ready to craft" and leads the blocking callout with the
  // authority's own reason.
  playerCase({
    id: 'player-crafting-authority-blocked',
    label: 'Player app — Crafting blocked by the run authority',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', journalCaseState: 'authority-unavailable' },
    steps: [],
    position: { width: 1100, height: 760 },
    expectTab: 'crafting',
    expectSelector: '[data-recipe-authority-blocked]',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/apps\/crafting\/RecipeDetailHeader\.svelte$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-category-filter-list',
    label: 'Player app — Crafting category filter list',
    smokeLabels: [],
    reaches: 'beyond',
    // The full-width panel, and the only player option list with a sentinel row (issue 1511).
    query: { tab: 'crafting' },
    position: { width: 1100, height: 760 },
    steps: [{ selector: '[data-crafting-category-filter]' }],
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="__unchanged__"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-crafting-sources-picker',
    label: 'Player app — Crafting component sources picker',
    // The panel twenty-seven frames claim AND none opens (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { tab: 'crafting' },
    steps: [{ selector: '[data-crafting-sources-add]' }],
    // The portaled form, as of the phase that routed this control onto the shared picker.
    expectSelector:
      '.fabricate-picker-popover.crafting-sources-popover ' +
      '.manager-travel-popover-options .crafting-source-option',
    kinds: ['player', 'crafting'],
    // `apps/crafting/ComponentSourcesBar.svelte` named explicitly rather than left to
    // `CRAFTING_SHARED`.
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-crafting-ingredient-routed',
    label: 'Player app — Crafting ingredient routed',
    smokeLabels: ['player-crafting-ingredient-routed'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_INGREDIENTS,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-routed-by-check',
    label: 'Player app — Crafting routed by check',
    smokeLabels: ['player-crafting-routed-by-check'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_CHECK,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-run-summary',
    label: 'Player app — Crafting run summary',
    smokeLabels: ['player-crafting-run-summary'],
    // The counterpart's condition is the right column having swapped to the run summary —
    // `[data-crafting-run-summary]`, which `CraftingView` renders only once `lastRollResult`
    // carries an entry for the selected recipe.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Smelt Iron' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-iron-ingot"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-roll-result',
    label: 'Player app — Crafting roll result',
    smokeLabels: ['player-crafting-roll-result'],
    // The counterpart's condition is the RollResultBox inside the run summary, scrolled into frame:
    // `[data-crafting-run-summary] [data-recipe-section="roll-result"]`.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
      {
        selector: '[data-crafting-run-summary] [data-recipe-section="roll-result"]',
        scroll: true,
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt',
    label: 'Player app — Crafting roll prompt with modifier choice',
    smokeLabels: ['player-crafting-roll-prompt'],
    // The interactive check roll prompt, standing and unanswered, with the `playerPicks` modifier
    // fieldset issue 855 adds.
    reaches: 'exact',
    query: { tab: 'crafting', dialog: 'open' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    // The dialog is a sibling of the application window, so the app's own route is satisfied by the
    // crafting tab with nothing over it — precisely the screen a prompt that never opened would
    // publish.
    expectSelector: '.application.dialog .fabricate-roll-prompt__modifiers',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      // Narrow rather than `CRAFTING_SHARED`: `rollPrompt.js` builds this dialog end to end and
      // nothing else under that folder contributes a pixel of it, so a change elsewhere in
      // `crafting/` should not conscript a frame of a modal that would not show it.
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt\.js$/,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-essence-alternative',
    label: 'Player app — Crafting essence alternative',
    smokeLabels: ['player-crafting-essence-alternative'],
    // The counterpart's condition is an open alternatives radiogroup — `.crafting-alt-option` rows
    // under `[data-recipe-section="alternatives"]` — one of whose options is an essence, so the
    // option card draws the shared art tile in its glyph face, `[data-medallion="glyph"]`, rather
    // than an item image.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Quench in Fire' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-quenchoil"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-alternatives',
    label: 'Player app — Crafting alternatives',
    smokeLabels: ['player-crafting-alternatives'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-legacy',
    label: 'Player app — Crafting essence legacy',
    smokeLabels: ['player-crafting-essence-legacy'],
    // Window, and unreachable from fixture data. The legacy surface is the IoTable's own
    // `[data-io-group="essences"]` group, which renders only from a set-level
    // `ingredientSet.essences` map.
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-ingredient',
    label: 'Player app — Crafting essence ingredient',
    smokeLabels: ['player-crafting-essence-ingredient'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-emberbrand"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-shopping',
    label: 'Player app — Crafting essence shopping',
    smokeLabels: ['player-crafting-essence-shopping'],
    // The counterpart's condition is an essence tile inside the shopping list's acquire card:
    // `[data-shopping-acquire-components] [data-medallion="glyph"]`, reached by pressing a recipe
    // row's cart button.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Rivet Chainmail' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"]' },
      {
        selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"] .crafting-recipe-row-add',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-slot-rail',
    label: 'Player app — Crafting slot rail',
    smokeLabels: ['player-crafting-slot-rail'],
    // The counterpart's three programmatic assertions, all reproduced: the rail's slot states are
    // exactly `['choice:partial', 'essence:short', 'fixed:met']` and exactly one chooser is open.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Temper a Tidebound' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-tidebound"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-tag-unmatched',
    label: 'Player app — Crafting tag unmatched',
    smokeLabels: ['player-crafting-tag-unmatched'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The counterpart's three assertions, all reproduced: a rail whose tag tile has no item image
    // to borrow renders its own glyph and never Foundry's `item-bag.svg`; every group is fixed, so
    // it is the world's only rail with no chooser open.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Refine Silver' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-silver-ingot"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-pool',
    label: 'Player app — Crafting essence pool',
    smokeLabels: ['player-crafting-essence-pool'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-pick-for-me',
    label: 'Player app — Crafting pick for me',
    smokeLabels: ['player-crafting-pick-for-me'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // "Pick for me" restoring the resolver's suggestion after the player has trimmed it — the
    // counterpart's own sequence.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Rivet Chainmail' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"]' },
      {
        selector: '.essence-pool-carrier[data-essence-carrier="Item.sm-coal"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector: '.essence-pool-carrier[data-essence-carrier="Item.sm-ruby"] .fab-stepper-input',
        fill: '0',
      },
      { selector: '.requirement-rail-wand' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-pool-shared',
    label: 'Player app — Crafting essence pool shared',
    smokeLabels: ['player-crafting-essence-pool-shared'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The shared-pool proof: two essence requirements in one set, funded from one dual carrier.
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-iron-ore"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-iron-ingot"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-steel-ingot"] .fab-stepper-input',
        fill: '2',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-consumption-plan',
    label: 'Player app — Crafting consumption plan',
    smokeLabels: ['player-crafting-consumption-plan'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-shield"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-multistep',
    label: 'Player app — Crafting multistep',
    smokeLabels: ['player-crafting-multistep'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-pattern-blade"]' },
      // Scroll to the second step ("Fold the pattern") to show its corrected requirements,
      // which is painted with its own coal-only cost, not step 1's Steel Ingot + Coal.
      { selector: '[data-recipe-step]:nth-of-type(2)', scroll: true },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-progressive',
    label: 'Player app — Crafting progressive',
    smokeLabels: ['player-crafting-progressive'],
    // The reorderable stage list at rest — `[data-recipe-section="progressive-stages"]` with its
    // grips, ordinals, per-stage difficulty and "Reached at ≥N" thresholds, and the chevron box
    // rendered whether or not anything has moved.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
    // The crafting half of the per-stage complication band (issue 1286), asserted on the frame that
    // already draws it for the same reason `player-salvage` is: `ProgressiveBody` passes
    // `complications="forecast"` unconditionally, so all four `player-crafting-progressive*` frames
    // render the band, and a fifth case sharing this case's query and steps would publish a
    // byte-identical PNG under a second name.
    expectSelector:
      '[data-recipe-mode="progressive"]' +
      ':has([data-recipe-section="progressive-stages"] ' +
      '[data-progressive-stage-complications][data-progressive-stage-complication-tense="forecast"] ' +
      '[data-progressive-stage-complication="hb-comp-dust-cloud"])' +
      ':not(:has([data-progressive-stage-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    id: 'player-crafting-progressive-reordered',
    label: 'Player app — Crafting progressive reordered',
    smokeLabels: ['player-crafting-progressive-reordered'],
    // The same list after one downward move, which is the counterpart's own sequence and the only
    // state in which two of its invariants stop being vacuous: the live region is empty until a
    // move announces, and the authored thresholds ascend by construction until one is re-derived.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-progressive-stage-move-down]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-fixed',
    label: 'Player app — Crafting progressive fixed',
    smokeLabels: ['player-crafting-progressive-fixed'],
    // The GM-ordered variant, on its own recipe because the state is a recipe flag:
    // `allowPlayerResultReorder` defaults true, so an explicit false has to be authored to reach it
    // at all.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Set the Drying Kiln' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-kiln"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-stacked',
    label: 'Player app — Crafting progressive stacked',
    smokeLabels: ['player-crafting-progressive-stacked'],
    // The shared 960px boundary makes the smoke counterpart's stacked condition reachable at
    // production's 1024px player-window floor: the named container is roughly 938px wide there.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
    ],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'crafting', 'responsive'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-stacked',
    label: 'Player app — Crafting stacked',
    smokeLabels: ['player-crafting-stacked'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'crafting', 'responsive'],
    expectLayout: responsiveLayout('.crafting-view-container', '.crafting-view-grid'),
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
]);
