/**
 * The coverage matrix: states the live smoke does not photograph, and the crafting-outcome frames beside them.
 */

import {
  CHECKS_ROUTE_MODEL_PATTERN,
  CRAFTING_ROUTED_CHECK,
  CRAFTING_ROUTED_INGREDIENTS,
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
  PLAYER_EXTENSION_RAIL_BUTTON,
  PLAYER_EXTENSION_ROUTE,
  PLAYER_EXTENSION_SOURCES,
} from './caseConstants.js';
import { managerCase, playerCase, previewAsActor } from './caseFactories.js';

export const CASES = Object.freeze([
  // Coverage matrix — states the live smoke does not photograph.

  managerCase({
    id: 'coverage-mode-routed-ingredients-results',
    label: 'Coverage — routedByIngredients results',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
    ],
  }),
  managerCase({
    id: 'coverage-mode-routed-check-results',
    label: 'Coverage — routedByCheck results',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'resolution-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      /^src\/systems\/ResolutionModeService\.js$/,
    ],
  }),
  managerCase({
    id: 'coverage-mode-routed-check-checks',
    label: 'Coverage — routedByCheck outcome tiers',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    // Scrolls to its own named subject.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-outcome-row="rw-ruined"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Anchored on the strip's own band, so a case that stopped drawing the strip fails rather than publishing the table.
    expectSelector: '.fabricate-manager [data-band-strip-band]',
    kinds: ['manager', 'checks', 'resolution-mode'],
    // No pattern for `components/ThresholdBandStrip.svelte`: it is a broad signal, so `sourceMatches` never sees it.
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//],
  }),
  managerCase({
    id: 'coverage-mode-routed-check-five-bands',
    label: 'Coverage — routedByCheck outcome tiers, five bands',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-runework' },
    // The frame that shows the whole ramp (issue 1096).
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-add-outcome-tier]' },
      { selector: '[data-add-outcome-tier]' },
      { selector: ':nth-match([data-outcome-name], 4)', fill: 'Flawless' },
      { selector: ':nth-match([data-outcome-dc], 4)', fill: '10' },
      { selector: ':nth-match([data-outcome-success], 4)' },
      { selector: ':nth-match([data-outcome-name], 5)', fill: 'Slag' },
      { selector: ':nth-match([data-outcome-dc], 5)', fill: '-10' },
      { selector: '[data-outcome-band-strip-hint]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-band-strip-band]',
    kinds: ['manager', 'checks', 'resolution-mode'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\//],
  }),
  managerCase({
    id: 'manager-checks-crafting-dynamic-dc',
    label: 'Manager — Checks crafting dynamic DC macro',
    // Beyond the smoke: the walk never switches the DC source, so the dynamic branch has no counterpart.
    reaches: 'beyond',
    smokeLabels: [],
    // Criterion 14's subject: the dynamic-DC macro card, the one shipped consumer moved onto `ItemDropZone`.
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-dc-mode-option="dynamic"] input' },
      { selector: '[data-check-macro-dropzone]', scroll: true },
    ],
    expectView: 'checks-crafting',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      // `ItemDropZone` is deliberately not claimed here (issue 1509): it is a broad signal, so it was never read.
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      /^src\/ui\/model\/macroReference\.js$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-recipe-tiers',
    label: 'Manager — Checks crafting recipe tiers',
    // Beyond the smoke: every simple check in the fixture world authors no recipe tier, so the list is unphotographed.
    reaches: 'beyond',
    smokeLabels: [],
    // The row treatment issue 1096 changed: the recipe-tier list was the last consumer of the boxed outcome table.
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-add-tier]' },
      { selector: '[data-add-tier]' },
      { selector: ':nth-match([data-tier-name], 1)', fill: 'Apprentice work' },
      { selector: ':nth-match([data-tier-name], 2)', fill: 'Masterwork' },
      { selector: '[data-tier-row]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The row, not the card: a card keeping its old table still satisfies a selector aimed at the section. The `role="list"` wrapper this used to name is the shared list's own `<ul>` as of issue 1512.
    expectSelector: '.fabricate-manager .fabricate-sortable-list-row[data-tier-row]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckRecipeTiers\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-recipe-tiers-narrow',
    label: 'Manager — Checks crafting recipe tiers at the declared floor',
    // The tier row's AFTER frame (issue 1512): it gains the numbered badge and the chevron rocker
    // issue 1096 refused, and the rocker has to stay on the row's one line at 1024x640.
    reaches: 'beyond',
    smokeLabels: [],
    query: {},
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '[data-add-tier]' },
      { selector: '[data-add-tier]' },
      { selector: ':nth-match([data-tier-name], 1)', fill: 'Apprentice work' },
      { selector: ':nth-match([data-tier-name], 2)', fill: 'Masterwork' },
      { selector: '[data-tier-row]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector:
      '.fabricate-manager .fabricate-sortable-list-row[data-tier-row] [data-sortable-move="up"]',
    position: { width: 1024, height: 640 },
    kinds: ['manager', 'checks', 'responsive'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckRecipeTiers\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-tier-step',
    label: 'Manager — Checks crafting tier-step triggers',
    // Beyond the smoke.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only crafting check with named outcome tiers, which is what makes `target`'s tier select render.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      // The list collapses (issue 1096), so the tier-step row is not in the document until its trigger is opened.
      { selector: '[data-trigger-disclosure="rw-trig-step-up"]' },
      // Anchored on a named trigger's tier-step row: which control is last depends on the mode.
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The route alone is not enough: a click that no-oped leaves the right screen showing the wrong state.
    expectSelector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-trigger-break-tools',
    label: 'Manager — Checks crafting trigger break-tools card',
    // Beyond the smoke: breaking tools is authored only while the authority is check-driven, and fixtures rest on `toolSpecific`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      // The authority is a per-system radio pair, so it is clicked rather than pinned on the fixture, as the smoke does.
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      { selector: '[data-trigger-disclosure="rw-trig-step-up"]' },
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-break]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The subject itself, not the route: both the authority click and the disclosure click have to have landed.
    expectSelector: '[data-trigger="rw-trig-step-up"] [data-trigger-break]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  // All four cases select an actor first, and that is not decoration.
  managerCase({
    id: 'manager-checks-crafting-simulator-rolled',
    label: 'Manager — Checks crafting outcome preview, rolled',
    // Beyond the smoke: the walk never opens the Checks rail's simulator, so a rolled readout has no counterpart.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only routed-by-check fixture with named tiers, so its matched band card reads as a GM would.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      // No disclosure step.
      { selector: '[data-checks-simulator-roll]' },
      { selector: '[data-checks-simulator-readout]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // Anchored on the readout: a case that stopped rolling would publish the pre-roll hint under a rolled name.
    expectSelector: '.fabricate-manager [data-checks-simulator-band]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkPreview\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOutcomePreview\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-enumerable',
    label: 'Manager — Checks crafting odds histogram (enumerable)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-checks-odds-state="enumerated"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The bars themselves, not the panel: a panel that abstained would still render.
    expectSelector: '.fabricate-manager [data-checks-odds-bar]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-not-enumerable',
    label: 'Manager — Checks crafting odds histogram (not enumerable)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    // The formula is typed rather than authored: the fixture check is shared, so authoring it would move every Runework frame.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-check-roll-formula]', fill: '2d20 + @abilities.int.mod' },
      { selector: '[data-checks-odds-state="not-enumerable"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The reason, not merely the note: an abstention with no stated reason is what the discriminated codes prevent.
    expectSelector: '.fabricate-manager [data-checks-odds-reason="non-unit-count"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-progressive',
    label: 'Manager — Checks crafting odds histogram (progressive award count)',
    reaches: 'beyond',
    smokeLabels: [],
    // Herbalism is the world's only progressive system, so only there does an award-count histogram exist.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-checks-odds-state="enumerated"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // A bucket that must exist, not merely a bar.
    expectSelector: '.fabricate-manager [data-checks-odds-row="award-0"]',
    kinds: ['manager', 'checks'],
    // No entry for `src/systems/progressiveCheckSandbox.js`: `isUiFile` admits no such path, so a pattern would be dead.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-simple-two-band-strip',
    label: 'Manager — Checks simple two-band DC strip',
    reaches: 'beyond',
    smokeLabels: [],
    // Smithing is the fixture's `simple` system, so its Outcomes section is the two-outcome card.
    query: { system: 'lab-smithing' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-outcomes' },
      ...previewAsActor('lab-actor-brenna'),
      { selector: '[data-simple-band-strip]', scroll: true },
    ],
    expectView: 'checks-crafting',
    expectSelector: '.fabricate-manager [data-simple-band-strip] [data-band-strip-handle]',
    kinds: ['manager', 'checks'],
    // The strip's simple mode, one of the two frames `BROAD_SIGNAL_CASE_OVERRIDES` names for it (issue 1378).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-outcomes-empty',
    label: 'Manager — Checks crafting Outcomes with zero tiers',
    // Beyond the smoke: every routed check in the fixture world authors three tiers, so the starting state was unframed.
    reaches: 'beyond',
    smokeLabels: [],
    // The dead end that was fixed (issue 1097 follow-up, maintainer report).
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // The mode radio group renders only on The roll section, which is where the route lands.
      { selector: '[data-crafting-alchemy-checkmode-option="tiered"] input' },
      { selector: '#checks-section-outcomes' },
      { selector: '[data-add-outcome-tier]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The fix as a selector: the add control has to be a sibling of the empty sentence, outside the list's `{#if}`.
    expectSelector: '.fabricate-manager [data-outcomes-empty] ~ [data-add-outcome-tier]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CraftingCheckEditor\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-alchemy-off',
    label: 'Manager — Checks crafting alchemy check switched off',
    // Beyond the smoke: the walk never opens a switched-off crafting check.
    reaches: 'beyond',
    smokeLabels: [],
    // The state the off switch exists for.
    query: { system: 'lab-tidewrack' },
    steps: ['Checks', { selector: '#manager-checks-nav-crafting' }],
    expectView: 'checks-crafting',
    // The turn-on action inside the off panel: the panel alone passes on the dead end this state used to be.
    expectSelector:
      '.fabricate-manager [data-checks-panel="crafting"][data-checks-off] [data-checks-turn-on]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-alchemy-behaviour',
    label: 'Manager — Checks crafting alchemy behaviour card',
    // Beyond the smoke: the walk never opens an alchemy system's On failure section.
    reaches: 'beyond',
    smokeLabels: [],
    // A card no frame reached.
    query: { system: 'lab-alchemy' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-on-failure' },
      { selector: '[data-alchemy-behaviour]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The card, which is the subject and exists in no other state — not one of its toggles.
    expectSelector: '.fabricate-manager [data-alchemy-behaviour]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      CHECKS_ROUTE_MODEL_PATTERN,
    ],
  }),
  // Player recipe detail, one per resolution mode.
  playerCase({
    id: 'coverage-mode-simple-detail',
    label: 'Coverage — simple recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE],
  }),
  // Known gap — no `coverage-mode-progressive-detail`.
  playerCase({
    id: 'coverage-mode-routed-ingredients-detail',
    label: 'Coverage — routedByIngredients recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    // Brenna holds the silver billet and not the gold, so one route is satisfied and one short.
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_ROUTED_INGREDIENTS],
  }),
  playerCase({
    id: 'coverage-mode-routed-check-detail',
    label: 'Coverage — routedByCheck recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    // The crafting list pages at twelve rows, and the lab world now holds more recipes than
    // that ahead of the Runeblade alphabetically (issue 1907), so narrow the list first.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Runeblade' },
      { selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' },
    ],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_ROUTED_CHECK],
  }),
  // Visibility mode changes which rails exist, and the smoke walks a single system, so two of the three were unframed.
  managerCase({
    id: 'coverage-visibility-global',
    label: 'Coverage — global visibility system',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-smithing' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  }),
  managerCase({
    id: 'coverage-visibility-knowledge',
    label: 'Coverage — knowledge-gated system',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  }),
  managerCase({
    id: 'coverage-visibility-restricted',
    label: 'Coverage — restricted system',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-alchemy' },
    steps: ['System Overview', { selector: '#system-tab-settings' }],
    expectView: 'system-edit',
    kinds: ['manager', 'system', 'visibility-mode'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\//,
    ],
  }),
  // Foundry's light application theme.
  playerCase({
    id: 'coverage-theme-light-player',
    label: 'Coverage — player app in Foundry light-theme chrome, dark Fabricate surfaces',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', colorScheme: 'light' },
    steps: [],
    kinds: ['player', 'crafting', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  }),
  managerCase({
    id: 'coverage-theme-light-manager',
    label: 'Coverage — manager in Foundry light-theme chrome, dark Fabricate surfaces',
    smokeLabels: [],
    reaches: 'beyond',
    query: { colorScheme: 'light' },
    steps: [],
    expectView: 'systems',
    kinds: ['manager', 'systems', 'theme'],
    sourceMatches: [/^styles\/fabricate\.css$/, /^src\/ui\/theme\.js$/],
  }),
  // Feature toggles that remove UI: `multiStepRecipes: false` drops the step rail, `experimental: '0'` the Graph entry.
  managerCase({
    id: 'coverage-multistep-off-recipe-editor',
    label: 'Coverage — multi-step disabled recipe editor',
    smokeLabels: [],
    reaches: 'beyond',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes', 'settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/recipe\//],
  }),
  playerCase({
    id: 'coverage-experimental-off-player',
    label: 'Coverage — player app with experimental off',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', experimental: '0' },
    steps: [],
    kinds: ['player', 'crafting', 'settings'],
    sourceMatches: [CRAFTING_SHARED],
  }),
  // Issue 1198 — the player companion surface.
  playerCase({
    id: 'player-test-companion-surface',
    label: 'Player app — navigation surface from a TEST companion',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: PLAYER_EXTENSION_ROUTE, playerProvider: '1' },
    steps: [],
    // The mounted stamp, not the panel element.
    expectSelector: '[data-player-extension-mounted="downtime"]',
    expectAttributes: [
      // A provider tab's `accessibleName` replaces the visible label, so the value is the stand-in's own composed string.
      { selector: PLAYER_EXTENSION_RAIL_BUTTON, name: 'aria-label', value: 'Open Projects' },
      // The IDREF wiring this seam gained: every rail button points at the one panel, which is labelled back by it.
      { selector: PLAYER_EXTENSION_RAIL_BUTTON, name: 'aria-controls', value: 'player-nav-panel' },
    ],
    // The seam adds a control to an existing fixed grid, so the pointer contract is photographed rather than assumed.
    expectCenterHit: PLAYER_EXTENSION_RAIL_BUTTON,
    expectClick: PLAYER_EXTENSION_RAIL_BUTTON,
    expectNoHorizontalOverflow: ['.fabricate-app-content', '.fabricate-app-nav'],
    kinds: ['player', 'extension'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),
  playerCase({
    id: 'player-test-companion-surface-narrow',
    label: 'Player app — TEST companion navigation surface, narrow with long labels',
    smokeLabels: [],
    reaches: 'beyond',
    // Both gaps in one frame: the enforced minimum window size, and the rail label's worst case against truncation.
    query: { tab: PLAYER_EXTENSION_ROUTE, playerProvider: '1', longPlayerLabels: '1' },
    steps: [],
    expectSelector: '[data-player-extension-mounted="downtime"]',
    expectAttributes: [
      {
        selector: PLAYER_EXTENSION_RAIL_BUTTON,
        name: 'aria-label',
        value: 'Open Commissions, projects and standing orders',
      },
    ],
    expectCenterHit: PLAYER_EXTENSION_RAIL_BUTTON,
    expectClick: PLAYER_EXTENSION_RAIL_BUTTON,
    // `.fabricate-app-nav` computes `overflow-x: auto`, so an untruncated label scrollbars the 84px column.
    expectNoHorizontalOverflow: [
      '.fabricate-app-content',
      '.fabricate-app-nav',
      '.fabricate-app-shell',
    ],
    position: { width: 1024, height: 640 },
    kinds: ['player', 'extension', 'responsive'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),
  playerCase({
    id: 'player-test-companion-fault',
    label: 'Player app — TEST companion surface fault state',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: PLAYER_EXTENSION_ROUTE, playerProvider: '1', playerProviderFault: '1' },
    steps: [],
    // The whole decision in one selector: the entry survives, the active tab holds, and Core renders its error state.
    expectSelector: `.fabricate-app-shell:has(${PLAYER_EXTENSION_RAIL_BUTTON}[aria-selected="true"]) [data-player-extension-fault="downtime"]`,
    // Core's own diagnostic copy, rendered: it names the provider that failed and nothing else.
    expectVisible:
      '[data-player-extension-fault="downtime"]:has-text("This section could not be displayed")',
    expectNoHorizontalOverflow: ['.fabricate-app-content', '.fabricate-app-nav'],
    kinds: ['player', 'extension'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),
]);
