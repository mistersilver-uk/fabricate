/**
 * World scope: currency, prerequisites, modifiers, the component catalogue, the vocabulary and the essence catalogue.
 */

import { chooseSelectOption, managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'currency-actor-property',
    label: 'Manager — World Currency actor property',
    smokeLabels: ['currency-actor-property'],
    reaches: 'exact',
    // World > Currency (issue 1278). The ladder is world scope, so this route needs no selected
    // system and is ungated — the card renders whether or not any crafting system has switched
    // currency on.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      { selector: '[data-world-currency-units]', scroll: true },
    ],
    expectView: 'world-currency',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'currency-macro',
    label: 'Manager — World Currency macro',
    smokeLabels: ['currency-macro'],
    reaches: 'exact',
    // The macro branch is chosen on the app's own option list (issue 1510): the strategy control
    // is a `<Select>` now, so the native `select:` verb — which `view-lab-screenshots.mjs` turns
    // into Playwright's `<select>`-only `selectOption` — would throw on its `<button>` trigger.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      ...chooseSelectOption('[data-world-currency-strategy-select]', 'macro'),
      { selector: '[data-world-currency-units]', scroll: true },
    ],
    expectView: 'world-currency',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'currency-actor-inventory',
    label: 'Manager — World Currency actor inventory',
    smokeLabels: ['currency-actor-inventory'],
    reaches: 'exact',
    // dnd5e registers no inventory currency provider, so this strategy resolves to the
    // no-provider callout steering the GM to macro mode — which is the state the smoke's
    // counterpart photographs too, for the same reason.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      ...chooseSelectOption('[data-world-currency-strategy-select]', 'actorInventory'),
      { selector: '[data-world-currency-units]', scroll: true },
    ],
    expectView: 'world-currency',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    // The sub-unit chip, which no frame held (issue 1515).
    id: 'manager-world-currency-subunit-expanded',
    label: 'Manager — World Currency sub-unit chip expanded',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      { selector: '[data-world-currency-unit-expand="gp"]' },
      {
        selector: '[data-world-currency-unit="gp"] [data-world-currency-subunit="sp"]',
        scroll: true,
      },
    ],
    expectView: 'world-currency',
    // The chip itself, inside the unit that owns it.
    expectSelector:
      '.fabricate-manager [data-world-currency-unit="gp"] [data-world-currency-subunit="sp"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'world-prerequisites',
    label: 'Manager — World Character prerequisites',
    // No counterpart, and the empty array is a correction rather than an omission (issue 1520).
    smokeLabels: [],
    reaches: 'beyond',
    // World > Rules & Resources > Character prerequisites (issue 1311). The library is world scope
    // since issue 1308, so this route needs no selected system and is ungated.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-prerequisites', press: 'Enter' },
      { selector: '[data-world-prerequisites-page]', scroll: true },
    ],
    expectView: 'world-prerequisites',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldPrerequisitesTab\.svelte$/],
  }),
  // Every converted control's open state became photographable for the first time with the
  // conversion — a native `<select>`'s popup is drawn by the operating system and does not appear
  // in a screenshot at all — and an open-panel case cannot double as its view's closed-state frame,
  // because the portal occludes the screen behind it.
  managerCase({
    id: 'world-currency-strategy-list',
    label: 'Manager — World Currency spend strategy list',
    smokeLabels: [],
    // `beyond`: the smoke walks THROUGH this control to the macro and inventory states and never
    // rests on it open, so there is no counterpart frame to fall short of.
    reaches: 'beyond',
    // The closed-state case's own route, stopped at the trigger with no row click.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-currency', press: 'Enter' },
      { selector: '[data-world-currency-strategy-select]' },
    ],
    expectView: 'world-currency',
    // Three claims, and a trigger-only frame satisfies none of them: the panel exists, it is a
    // direct child of the manager root (the portal, not the fallback that draws it in place), and
    // it is the unticked configuration.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover' +
      ':not(.fabricate-select-popover-ticked) [data-popover-option="macro"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/],
  }),
  managerCase({
    id: 'world-prerequisites-operator-list',
    label: 'Manager — World Character prerequisite operator list',
    smokeLabels: [],
    reaches: 'beyond',
    // The narrowest trigger in the phase, and the one whose panel is overridden.
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-prerequisites', press: 'Enter' },
      { selector: '.manager-prerequisite-item [data-toggle-prerequisite]' },
      { selector: '[data-prerequisite-operator]' },
    ],
    expectView: 'world-prerequisites',
    // The tick element on the selected row, which is the claim the panel's own class does not make.
    expectSelector:
      '.fabricate-manager > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[role="option"][aria-selected="true"] .fabricate-select-tick',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/system\/CharacterPrerequisitesCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/world\/WorldPrerequisitesTab\.svelte$/,
    ],
  }),
  managerCase({
    // The converted row with its list shut (issue 1510).
    id: 'world-prerequisites-condition-row',
    label: 'Manager — World Character prerequisite condition row, operator closed',
    smokeLabels: [],
    // `beyond`: the smoke never expands a prerequisite item, so there is no counterpart frame
    // this one could fall short of and no label it could claim.
    reaches: 'beyond',
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-prerequisites', press: 'Enter' },
      { selector: '.manager-prerequisite-item [data-toggle-prerequisite]' },
      { selector: '[data-world-prerequisites-page]', scroll: true },
    ],
    expectView: 'world-prerequisites',
    // Both halves matter.
    expectSelector:
      '.manager-prerequisite-condition [data-prerequisite-operator].fabricate-select-trigger',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/system\/CharacterPrerequisitesCard\.svelte$/],
  }),
  managerCase({
    id: 'world-modifiers',
    label: 'Manager — World Modifiers',
    // No counterpart, for the reason its sibling above records.
    smokeLabels: [],
    reaches: 'beyond',
    // World > Rules & Resources > Modifiers (issue 1311).
    steps: [
      { selector: '#manager-world-nav-rules', press: 'Enter' },
      { selector: '#manager-rules-nav-modifiers', press: 'Enter' },
      { selector: '[data-world-modifiers-page]', scroll: true },
    ],
    expectView: 'world-modifiers',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/world\/WorldModifiersTab\.svelte$/],
  }),
  // Frames from this PR prove the shell only. Every one of these routes is a placeholder: no
  // catalogue, no editor, no `InheritRow`.
  managerCase({
    id: 'world-component-catalogue',
    label: 'Manager — World Component catalogue',
    // Beyond the smoke, and the empty `smokeLabels` says so explicitly rather than by omission.
    reaches: 'beyond',
    smokeLabels: [],
    // The row is inspected, not merely listed (issue 1371).
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Iron Ingot' },
      { selector: '[data-scoped-list-inspect="sm-iron-ingot"]' },
      { selector: '[data-scoped-list-search]', fill: '' },
    ],
    expectView: 'world-components',
    // The page's own hook, so a route that silently fell back to the systems library fails the
    // capture rather than publishing a frame of the wrong screen.
    expectSelector: '[data-scoped-page="world-components"]',
    // The four leaves, in the prototype's authored order, each proved to hold its own icon rather
    // than merely to exist.
    expectContained: [
      {
        container: '#manager-world-nav-component-catalogue',
        target: '#manager-world-nav-component-catalogue > i',
      },
      { container: '#manager-world-nav-vocabulary', target: '#manager-world-nav-vocabulary > i' },
      {
        container: '#manager-world-nav-essence-catalogue',
        target: '#manager-world-nav-essence-catalogue > i',
      },
      {
        container: '#manager-world-nav-tool-catalogue',
        target: '#manager-world-nav-tool-catalogue > i',
      },
      // The pager, which is the cleared search's own witness.
      {
        container: '[data-scoped-page="world-components"]',
        target: '[data-pagination-page]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The placeholder claim is gone (issue 1371), and dropping it is not optional bookkeeping:
    // `tests/manager-scoped-prop-contract.test.js` pairs "a case claims the shared placeholder
    // body" with "that route's page still imports it", so a real body left claiming the placeholder
    // publishes this route's screen as evidence of a placeholder change.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentCataloguePage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityCatalogueShell\.svelte$/,
      // Issue 1371 r8-cat: the frame is this screen too.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/EntityListInspectorFrame\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/componentScoped\.js$/,
    ],
  }),
  managerCase({
    // The selection's own face (issue 1371).
    id: 'world-component-catalogue-bulk',
    label: 'Manager — World Component catalogue, bulk selection',
    reaches: 'beyond',
    smokeLabels: [],
    // One search over both subjects, AND A staged instruction (issue 1371, round 3).
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'salt' },
      { selector: '[data-scoped-list-select="tw-brine-salt"]' },
      { selector: '[data-scoped-list-select="al-saltpetre"]' },
      // Issue 1371 r8-cat: the tag is staged from the inset row.
      {
        selector: '[data-bulk-inset="tags"] [data-world-component-bulk-option="moss"]',
      },
      // AND the direction is staged last, which is also what scrolls the panel back to its HEAD.
      { selector: '[data-world-component-bulk-mode-option="remove"]' },
    ],
    expectView: 'world-components',
    expectSelector: '[data-world-component-bulk-panel]',
    expectContained: [
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-mode]',
      },
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-apply]',
      },
      // The two staged axes, so the frame is asserted to hold the changed panel rather than the
      // resting one.
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-mode-state]',
      },
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-tag-chip="moss"]',
      },
      // AND the three insets themselves (issue 1371 r8-cat, gap-list rows 43-45).
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-bulk-inset="systems"]',
      },
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-bulk-inset="tags"]',
      },
      // AND THE DANGER LEG (gap-list row 47), which is the one control on this panel that had no
      // counterpart at all before this revision.
      {
        container: '[data-world-component-bulk-panel]',
        target: '[data-world-component-bulk-danger]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ComponentCatalogueBulkPanel\.svelte$/,
    ],
  }),
  managerCase({
    // The entry editor's definition tab (issue 1371), reached the way a GM reaches it: through the
    // catalogue row's pen.
    id: 'world-component-entry-definition',
    label: 'Manager — World Component entry',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-page="world-component-entry"]',
    expectContained: [
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-identity="sm-coal"]',
      },
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-source="sm-coal"]',
      },
      // THE PREVIEW RAIL IS THE GRID'S SECOND COLUMN (issue 1371, parity round 4), so it is in
      // the FIRST frame rather than below a fold: it no longer scrolls with the card stack, and
      // this claim is what would red if it were nested back inside the tab panel.
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-preview-tile]',
      },
      // The category card's claims moved to the tags case (issue 1371, round 2), because that is
      // the frame the card is fully drawn in.
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/,
      // The three children the entry was rebuilt as (issue 1371, parity round 4).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntrySourceCard\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPreviewRail\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    // The other half of the entry's definition tab (issue 1371, round 2), reached by scrolling.
    id: 'world-component-entry-tags',
    label: 'Manager — World Component entry, world classification',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-tags="sm-coal"]', scroll: true },
    ],
    expectView: 'world-component-entry',
    // One CARD, two columns (issue 1371, parity round 4): `proto:881-910` draws category and tags
    // in a single `World classification` card, and the two-card split this case used to photograph
    // is gone.
    expectSelector: '[data-scoped-entry-category="sm-coal"]',
    expectContained: [
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-category-label]',
      },
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-category-note]',
      },
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-vocabulary-exit]',
      },
      {
        container: '[data-scoped-entry-category="sm-coal"]',
        target: '[data-scoped-entry-tags="sm-coal"]',
      },
      {
        container: '[data-scoped-entry-tags="sm-coal"]',
        target: '[data-scoped-entry-tag-note]',
      },
      // One lit chip, AND it is the frame's point (issue 1371 r17, ux F-N2).
      {
        container: '[data-scoped-entry-tags="sm-coal"]',
        target: '[data-scoped-entry-tag="moss"][aria-pressed="true"]',
      },
      // The applied-but-unauthored chip (issue 1371 r18-entry, maintainer ruling M33, closing
      // D-CJ).
      {
        container: '[data-scoped-entry-tags="sm-coal"]',
        target:
          '[data-scoped-entry-tag="fuel"][aria-pressed="true"][data-scoped-entry-tag-unauthored]',
      },
    ],
    // The tag chip owns its own centre (issue 1371, revision 8 — ux F13).
    expectCenterHit: '[data-scoped-entry-tag="moss"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/],
  }),
  managerCase({
    // The entry's `Essence contribution` CARD (issue 1371 r18-entry, maintainer ruling M31),
    // reached by scrolling for the reason the tags case gives: the card follows `World
    // classification`, so at 1280x900 the definition frame shows its head and the tops of its tiles
    // and puts the steppers under the panel's fold, where every assertion passes on a frame that
    // shows no control.
    id: 'world-component-entry-essences',
    label: 'Manager — World Component entry, essence contribution',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-essences="sm-coal"]', scroll: true },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-entry-essences="sm-coal"]',
    expectContained: [
      // The grid of shared quantity cards, one per WORLD essence, with the elected `fire` value
      // drawn as a CONTRIBUTING tile; the note that counts the section's inheritors; and the
      // rail's essence run, which follows the same map and is the frame's other half.
      {
        container: '[data-scoped-entry-essences="sm-coal"]',
        target: '[data-scoped-entry-essence-grid]',
      },
      {
        container: '[data-scoped-entry-essences="sm-coal"]',
        target: '[data-component-edit-essence="fire"][data-component-essence-active="true"]',
      },
      {
        container: '[data-scoped-entry-essences="sm-coal"]',
        target: '[data-scoped-entry-essence-note]',
      },
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-preview-essences] [data-essence-chip="fire"]',
      },
    ],
    // THE STEPPER IS THE NEW CONTROL (issue 1371 r18-entry): a real pointer hit on its `+`, because
    // a grid that overflowed its card or a head that overlapped it would leave a control present
    // in the DOM, correct in every mounted assertion and unclickable on screen.
    expectCenterHit:
      '[data-scoped-entry-essences="sm-coal"] [data-component-edit-essence="fire"] [data-stepper-increment]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/,
      // The shared quantity card is the frame's subject too: a change to it moves every tile here.
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceQuantityCard\.svelte$/,
    ],
  }),
  managerCase({
    // The maintainer's second exhibit (issue 1371, parity round 4): `Systems using this component`,
    // and the `Delete from the world` card under it.
    id: 'world-component-entry-systems',
    label: 'Manager — World Component entry, systems and deletion',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-delete-card]', scroll: true },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-entry-systems="sm-coal"]',
    expectContained: [
      // THE HEAD, ITS ACTION AND THE SEGMENTED FILTER, which round 3 drew as a bare kicker
      // reading the data and a `<select>`.
      {
        container: '[data-scoped-entry-systems="sm-coal"]',
        target: '[data-scoped-entry-add-to-systems]',
      },
      {
        container: '[data-scoped-entry-systems="sm-coal"]',
        target: '[data-scoped-entry-system-filter="without"]',
      },
      {
        container: '[data-scoped-entry-systems="sm-coal"]',
        target: '[data-scoped-entry-system-count]',
      },
      // AND THE DANGER CARD, with its reach note beside the armed control.
      {
        container: '[data-scoped-page="world-component-entry"]',
        target: '[data-scoped-entry-delete-note]',
      },
    ],
    // Two pointer proofs on one frame (issue 1371, revision 8 — ux F13), because these are the two
    // controls on this screen a compressed row can swallow and no mounted test can see: happy-dom
    // lays nothing out, so every mounted assertion about either passes on a zero-sized target.
    expectCenterHit:
      '[data-scoped-entry-system="lab-smithing"] [data-arm-token="scoped-membership-remove:sm-coal|lab-smithing"]',
    expectClick: '[data-arm-token="world-component-delete:sm-coal"]',
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntrySystemsCard\.svelte$/,
    ],
  }),
  managerCase({
    // The validation tab, on the one lab component that fails a blocking check: `lab-unbound-salt`
    // is seeded with no source uuid at all, so `No source item linked` blocks and the two world
    // classification rows warn.
    id: 'world-component-entry-validation',
    label: 'Manager — World Component entry, validation',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Unbound Salt' },
      { selector: '[data-scoped-list-inspect="lab-unbound-salt"]' },
      { selector: '[data-scoped-component-open-entry]' },
      { selector: '[data-scoped-entry-tab="validation"]' },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-entry-validation]',
    expectContained: [
      {
        container: '[data-scoped-entry-validation]',
        target: '[data-scoped-entry-check="source"]',
      },
      {
        container: '[data-scoped-entry-validation]',
        target: '[data-scoped-entry-check="worldCategory"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [/^src\/ui\/model\/componentScopeValidation\.js$/],
  }),
  managerCase({
    // The frame the world Component entry and the system component rules editor share stacks its
    // rail under its content column below `@container fabricate-manager (max-width: 1000px)`, and
    // until this revision nothing in the registry reached that state on either consumer — while
    // their three neighbours (`manager-components-stacked`, `manager-essences-stacked`,
    // `manager-tags-categories-stacked`) all have one.
    id: 'world-component-entry-stacked',
    label: 'Manager — World Component entry stacked',
    reaches: 'beyond',
    smokeLabels: [],
    steps: [
      { selector: '#manager-world-nav-component-catalogue' },
      { selector: '[data-scoped-list-search]', fill: 'Coal' },
      { selector: '[data-scoped-list-inspect="sm-coal"]' },
      { selector: '[data-scoped-component-open-entry]' },
      // The strip into view before the pointer TEST.
      { selector: '[data-scoped-entry-tab="definition"]', scroll: true },
    ],
    expectView: 'world-component-entry',
    expectSelector: '[data-scoped-page="world-component-entry"]',
    expectLayout: {
      containerSelector: '.fabricate-manager',
      gridSelector: '.manager-component-entry-page',
      expectedTracks: 1,
    },
    expectCenterHit: '[data-scoped-entry-tab="definition"]',
    expectContained: [
      {
        container: '.manager-component-entry-page',
        target: '[data-scoped-entry-preview-tile]',
      },
    ],
    // 980 rather than the registry's usual 1024, and the twenty-two pixels are measured rather than
    // chosen: the lab's manager container resolves to the window width minus two (measured at five
    // widths), and the frame's own query is `max-width: 1000px` on that container.
    position: { width: 980, height: 860 },
    kinds: ['manager', 'world', 'scoped', 'responsive'],
    // The frame is the SHEET's and the two pages that wear it, so a change to either page or to
    // the shared rail selects this frame alongside its wide twin.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldComponentEntryPreviewRail\.svelte$/,
    ],
  }),
  managerCase({
    id: 'world-vocabulary',
    label: 'Manager — World Tags & Categories',
    reaches: 'beyond',
    smokeLabels: [],
    // The leaf whose label is character-for-character identical to the system-scope entry further
    // up the same rail.
    steps: [{ selector: '#manager-world-nav-vocabulary' }],
    expectView: 'world-vocabulary',
    expectSelector: '[data-scoped-page="world-vocabulary"]',
    // The three delete controls, one per panel, each keyed on its own panel (issue 1392).
    expectContained: [
      {
        container: '[data-wvocab-panel="recipeCategories"]',
        target: '[data-recipe-category-id] .manager-icon-button',
      },
      {
        container: '[data-wvocab-panel="componentCategories"]',
        target: '[data-component-category-id] .manager-icon-button',
      },
      {
        container: '[data-wvocab-panel="componentTags"]',
        target: '[data-component-tag-id] .manager-icon-button',
      },
    ],
    // Taller than the world scoped-entity cases, and the extra 100px is the full-width tag band
    // (issue 1392).
    position: { width: 1280, height: 1000 },
    kinds: ['manager', 'world', 'scoped'],
    // The `ScopedPlaceholderPage` claim is deleted here, not merely joined by the new patterns
    // (issue 1392).
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldVocabularyPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/worldVocabularyStudio\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyPanel\.svelte$/,
    ],
  }),
  // The catalogue's `ScopedPlaceholderPage` claim is deleted here, not merely joined by the new
  // patterns.
  managerCase({
    id: 'world-essence-catalogue',
    label: 'Manager — World Essence Catalogue',
    reaches: 'beyond',
    smokeLabels: [],
    // The second step selects A row, AND without it this case photographs the wrong screen.
    steps: [
      { selector: '#manager-world-nav-essence-catalogue' },
      { selector: '[data-scoped-list-inspect]' },
    ],
    expectView: 'world-essences',
    expectSelector: '[data-scoped-page="world-essences"]',
    // The rows AND the filled inspector, proved present rather than assumed.
    expectContained: [
      {
        container: '[data-scoped-list]',
        target: '[data-scoped-list-row] [data-medallion="glyph"]',
      },
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inherit-note="effectSource"]',
      },
      {
        container: '[data-scoped-list-inspector]',
        target: '[data-scoped-list-inspector-foot]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldEssenceCataloguePage\.svelte$/,
      // The two shared list primitives this screen composes (issue 1380).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/Entity(?:CatalogueShell|ListInspectorFrame)\.svelte$/,
      // The `SYSTEM RULES n / m` panel the shell's inspector composes (issue 1372).
      /^src\/ui\/svelte\/apps\/manager\/scoped\/SystemRulesRoster\.svelte$/,
      // The inspector's foot action, which this case draws and did not claim (issue 1446).
      /^src\/ui\/svelte\/apps\/manager\/InspectorActionButton\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/essenceScoped\.js$/,
      /^src\/ui\/model\/scopedEntityListModel\.js$/,
    ],
  }),
  managerCase({
    id: 'world-essence-entry',
    label: 'Manager — World Essence entry',
    reaches: 'beyond',
    smokeLabels: [],
    // Reached the way A GM reaches it, through the catalogue row's pen.
    steps: [
      { selector: '#manager-world-nav-essence-catalogue' },
      { selector: '[data-scoped-list-action="open-entry"]' },
    ],
    expectView: 'world-essence-entry',
    expectSelector: '[data-scoped-page="world-essence-entry"]',
    // Both world-default cards, with their inherit lines. A frame that showed the identity fields
    // alone would show nothing this screen exists for.
    expectContained: [
      {
        container: '[data-scoped-page="world-essence-entry"]',
        target: '[data-scoped-world-default="effectSource"]',
      },
      {
        container: '[data-scoped-entry-defaults-section]',
        target: '[data-scoped-world-default="macro"]',
      },
      {
        container: '[data-scoped-world-default="effectSource"]',
        target: '[data-scoped-world-default-inherit="effectSource"]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldEssenceEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/MembershipActions\.svelte$/,
      // The buffered-save seam (issue 1372): the header's `← Back` / `Save essence` pair and the
      // draft leaf behind it.
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
  managerCase({
    id: 'world-essence-entry-dirty',
    label: 'Manager - World Essence entry, unsaved',
    reaches: 'beyond',
    smokeLabels: [],
    // The state the explicit save exists for (issue 1372, maintainer parity round 4).
    steps: [
      { selector: '#manager-world-nav-essence-catalogue' },
      { selector: '[data-scoped-list-action="open-entry"]' },
      { selector: '[data-scoped-entry-name]', fill: 'Aetherlight' },
      { selector: '[data-scoped-entry-colour] [data-manager-color-token="sage"]' },
    ],
    expectView: 'world-essence-entry',
    expectSelector: '[data-scoped-page="world-essence-entry"]',
    // The header pair, proved present and inside the band that owns it.
    expectContained: [
      {
        container: '.manager-header-actions',
        target: '[data-world-essence-save]',
      },
      {
        container: '.manager-header-actions',
        target: '[data-world-essence-back]',
      },
    ],
    position: { width: 1280, height: 900 },
    kinds: ['manager', 'world', 'scoped'],
    // The same three files the resting case claims, deliberately: this is the `-narrow` / `-normal`
    // relationship, where one screen is photographed in two states and a change to it publishes
    // both.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/scoped\/WorldEssenceEntryPage\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/ScopedEntryHeaderActions\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/scoped\/scopedEntryDraft\.js$/,
    ],
  }),
]);
