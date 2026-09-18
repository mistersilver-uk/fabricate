/**
 * The coverage matrix: states the live smoke does not photograph, and the crafting-outcome frames beside them.
 */

import {
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
    // Anchored on the strip's own `<span>` band, so a case that stopped drawing the strip
    // fails here rather than publishing a frame of the table alone.
    expectSelector: '.fabricate-manager [data-band-strip-band]',
    kinds: ['manager', 'checks', 'resolution-mode'],
    // Deliberately no pattern for `components/ThresholdBandStrip.svelte`, for the reason
    // `manager-gathering-economy-actors` records about `Stepper`: `BROAD_SIGNAL_PATTERN` matches
    // `^src/ui/svelte/components/` and `selectRenderFileCases` `continue`s on a broad-signal file
    // before consulting any case's `sourceMatches`, so such an entry would be unreachable.
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
    // BEYOND the smoke. The walk never switches the DC source, so there is no counterpart frame of
    // the dynamic branch to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // Criterion 14's subject: the dynamic-DC macro card, which is the one shipped consumer this
    // change converted from a hand-rolled `use:dragDrop` div onto the shared `ItemDropZone`.
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
      // `ItemDropZone` is deliberately not claimed here (issue 1509), and the deletion changes no
      // routing: the pattern that used to sit on this line was on the removal-only
      // `BROAD_SHADOWED_SOURCE_MATCHES` register precisely because the file was already a broad
      // signal, so `selectRenderFileCases` never read it.
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      /^src\/ui\/model\/macroReference\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-recipe-tiers',
    label: 'Manager — Checks crafting recipe tiers',
    // BEYOND the smoke. The walk never adds a recipe tier, and every simple check in the
    // fixture world authors none — so the populated list has never been photographed at all.
    reaches: 'beyond',
    smokeLabels: [],
    // The row treatment, which is what issue 1096 changed here: the recipe-tier list was the last
    // consumer of `.manager-checks-outcome-table` on The roll, drawing boxed inputs in a grid with
    // a column-header row, while the prototype draws the same list as the Outcomes screen draws its
    // tiers.
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
    // The ROW, not the card: a card that kept its old table would still satisfy a selector
    // aimed at the section, and the row class is the thing this frame is evidence for.
    expectSelector: '.fabricate-manager .manager-checks-tier-list [data-tier-row]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckRecipeTiers\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-tier-step',
    label: 'Manager — Checks crafting tier-step triggers',
    // Beyond the smoke.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only fixture check carrying authored triggers, and the only crafting check
    // with named outcome tiers — which is what makes the `target` mode's tier select renderable at
    // all.
    query: { system: 'lab-runework' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      // The list collapses (issue 1096), so the subject of this case — the tier-step row — is not
      // in the document until its trigger is opened.
      { selector: '[data-trigger-disclosure="rw-trig-step-up"]' },
      // Anchored on a named trigger's own tier-step row, never on "the row's last control": which
      // control that is depends on the mode, so a mode change would silently move the anchor.
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The route alone is not enough here: the case is named for a control that only exists
    // once the disclosure above has actually opened, and a click that no-oped would leave the
    // right screen showing the wrong state.
    expectSelector: '[data-trigger="rw-trig-step-up"] [data-trigger-tier-step]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-trigger-break-tools',
    label: 'Manager — Checks crafting trigger break-tools card',
    // Beyond the smoke, and a state no other frame reaches: breaking tools is authored on a trigger
    // only while the system's tool-breakage authority is check-driven, and every fixture system
    // rests on `toolSpecific`.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    steps: [
      // The authority is a per-system radio pair on the tools browser, so it is CLICKED rather
      // than pinned on the fixture — the same route `manager-tool-stress-immune` takes for the
      // same reason, and the same one the smoke takes.
      { selector: '#manager-nav-tool-rules' },
      { selector: '[data-tool-authority-segment="checkDriven"]' },
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-triggers' },
      { selector: '[data-trigger-disclosure="rw-trig-step-up"]' },
      { selector: '[data-trigger="rw-trig-step-up"] [data-trigger-break]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The subject itself, not the route: the authority click and the disclosure click both have
    // to have landed, and a frame of the right screen with either one missing would show the
    // state this case is named for being ABSENT.
    expectSelector: '[data-trigger="rw-trig-step-up"] [data-trigger-break]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CheckTriggers\.svelte$/],
  }),
  // All four cases select an actor first, and that is not decoration.
  managerCase({
    id: 'manager-checks-crafting-simulator-rolled',
    label: 'Manager — Checks crafting outcome preview, rolled',
    // BEYOND the smoke. The walk never opens the Checks rail's simulator, so there is no
    // counterpart frame of a rolled readout to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // Runework is the only routed-by-check fixture with NAMED outcome tiers, which is what
    // makes the matched band card render something a GM can read.
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
    // Anchored on the readout itself: a case that stopped rolling would fail here rather
    // than publishing a frame of the pre-roll hint under a "rolled" name.
    expectSelector: '.fabricate-manager [data-checks-simulator-band]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkPreview\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOutcomePreview\.svelte$/,
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
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-not-enumerable',
    label: 'Manager — Checks crafting odds histogram (not enumerable)',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-runework' },
    // The formula is typed rather than authored, for the reason
    // `manager-checks-crafting-dynamic-dc` records: the fixture check is shared, so authoring
    // `2d20` there would move every already-captured Runework frame to photograph one panel.
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      ...previewAsActor('lab-actor-idrin'),
      { selector: '[data-check-roll-formula]', fill: '2d20 + @abilities.int.mod' },
      { selector: '[data-checks-odds-state="not-enumerable"]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The REASON, not merely the note: an abstention with no stated reason is the defect
    // the discriminated codes exist to prevent.
    expectSelector: '.fabricate-manager [data-checks-odds-reason="non-unit-count"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-crafting-odds-progressive',
    label: 'Manager — Checks crafting odds histogram (progressive award count)',
    reaches: 'beyond',
    smokeLabels: [],
    // Herbalism is the world's only progressive system, so it is the only route where a histogram
    // bucketed by award count exists at all.
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
    // NO entry for `src/systems/progressiveCheckSandbox.js`, deliberately: `isUiFile` admits
    // only `src/ui/`, `styles/`, `.svelte` and `.css`, so a change confined to that module
    // selects no case at all and a pattern for it here would be unreachable code — the same
    // trap the `Stepper` note two thousand lines up records for a different reason.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/checkOdds\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CheckOddsPanel\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-checks-simple-two-band-strip',
    label: 'Manager — Checks simple two-band DC strip',
    reaches: 'beyond',
    smokeLabels: [],
    // Smithing is the fixture's `simple` system, so its Outcomes section is the two-outcome
    // card the third `ThresholdBandStrip` binding renders in.
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
    // The strip's simple mode, and one of the two frames `BROAD_SIGNAL_CASE_OVERRIDES` names for
    // `components/ThresholdBandStrip.svelte` (issue 1378).
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-outcomes-empty',
    label: 'Manager — Checks crafting Outcomes with zero tiers',
    // BEYOND the smoke. The walk never empties an outcome table, and every routed check in the
    // fixture world authors three tiers, so the state a routed check STARTS in was in no frame
    // at all.
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
    // The fix itself, as a selector: the add control has to be a sibling of the empty sentence,
    // which is what taking it out of the list's `{#if}` made it.
    expectSelector: '.fabricate-manager [data-outcomes-empty] ~ [data-add-outcome-tier]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/CraftingCheckEditor\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-alchemy-off',
    label: 'Manager — Checks crafting alchemy check switched off',
    // BEYOND the smoke. The walk never opens a switched-off crafting check, so the state has no
    // counterpart frame.
    reaches: 'beyond',
    smokeLabels: [],
    // The state the off switch exists for.
    query: { system: 'lab-tidewrack' },
    steps: ['Checks', { selector: '#manager-checks-nav-crafting' }],
    expectView: 'checks-crafting',
    // The turn-on action INSIDE the off panel, as one selector: the panel alone would pass on a
    // dead end with no way back, which is precisely the failure this state used to be.
    expectSelector:
      '.fabricate-manager [data-checks-panel="crafting"][data-checks-off] [data-checks-turn-on]',
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/],
  }),
  managerCase({
    id: 'manager-checks-crafting-alchemy-behaviour',
    label: 'Manager — Checks crafting alchemy behaviour card',
    // BEYOND the smoke. The walk never opens an alchemy system's On failure section, so there is
    // no counterpart frame to fall short of.
    reaches: 'beyond',
    smokeLabels: [],
    // A CARD no frame reached.
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
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/],
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
    // Brenna holds the silver billet and not the gold one, so this frame shows one route satisfied
    // and one short — which is the only way a routed body's routing is visible at all.
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
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' }],
    kinds: ['player', 'crafting', 'resolution-mode'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_ROUTED_CHECK],
  }),
  // Visibility mode changes which rails EXIST, not merely what they contain — a restricted system
  // has an Access rail, a knowledge-gated one has Books & Scrolls and Knowledge, a global one has
  // neither. The smoke walks a single system, so two of the three were never photographed.
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
  // Feature toggles that remove UI. `multiStepRecipes: false` (the jewellers) drops the step rail
  // and the Multi-step chip from the recipe editor; `experimental: '0'` drops the Graph rail entry.
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
      // A provider tab's `accessibleName` REPLACES the visible label as the control's accessible
      // name, so the value is the stand-in's own composed string, verbatim and unlocalized.
      { selector: PLAYER_EXTENSION_RAIL_BUTTON, name: 'aria-label', value: 'Open Projects' },
      // The IDREF wiring the rail gained with this seam: every rail button points at the one
      // content panel, and the panel is labelled back by the active button.
      { selector: PLAYER_EXTENSION_RAIL_BUTTON, name: 'aria-controls', value: 'player-nav-panel' },
    ],
    // The seam adds a control to an existing fixed grid, so the pointer contract is photographed
    // rather than assumed.
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
    // Both gaps in one frame: the enforced minimum window size, rendered directly rather than
    // asserted about a larger frame, and the rail label's worst case against the truncation rule
    // that admits a third-party label at all.
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
    // The rail is the point of this frame: `.fabricate-app-nav` is `overflow-y: auto`, so its
    // `overflow-x` computes to `auto` and an untruncated label would put a horizontal scrollbar
    // in the 84px column. The shell is included so a spill cannot hide one level up.
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
    // The whole decision in one selector: the faulted surface's rail entry survives, the active tab
    // does not move, and Core renders its own error state in the panel.
    expectSelector: `.fabricate-app-shell:has(${PLAYER_EXTENSION_RAIL_BUTTON}[aria-selected="true"]) [data-player-extension-fault="downtime"]`,
    // Core's own diagnostic copy, rendered rather than merely present in the DOM. It names the
    // provider that failed and nothing else: no product name, no offer, no call to action.
    expectVisible:
      '[data-player-extension-fault="downtime"]:has-text("This section could not be displayed")',
    expectNoHorizontalOverflow: ['.fabricate-app-content', '.fabricate-app-nav'],
    kinds: ['player', 'extension'],
    sourceMatches: PLAYER_EXTENSION_SOURCES,
  }),
]);
