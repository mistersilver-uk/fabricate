/**
 * System scope: the recipe editor tabs, its crafting-modifier states and the Access route.
 */

import { ACCESS_ROSTER_SEARCH_MISS_TERM, ANCHORED_POPOVER_SOURCES } from './caseConstants.js';
import { managerCase } from './caseFactories.js';

export const CASES = Object.freeze([
  managerCase({
    id: 'manager-recipe-edit-normal',
    label: 'Manager — Recipe edit normal',
    smokeLabels: ['manager-recipe-edit-normal'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-overview' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Every frame below reaches its state by clicking the rule group (and, for the capped pair, by
  // typing into the pick-cap Stepper) rather than by authoring a second catalogued system.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inherit',
    label: 'Manager — Recipe edit crafting modifier inherit',
    // Beyond the smoke.
    reaches: 'beyond',
    smokeLabels: [],
    // The per-recipe check-modifier picker at rest.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The picker cell AND the inherited-names paragraph.
    expectSelector:
      '.fabricate-manager [data-recipe-editor] ' +
      '[data-recipe-crafting-modifier-picker] [data-recipe-crafting-modifier-inherited]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-custom-set',
    label: 'Manager — Recipe edit crafting modifier custom set',
    // BEYOND the smoke: the walk never presses a rule card, so its seeded system is `highest` and
    // no counterpart frame of the picker in its custom-set state exists.
    reaches: 'beyond',
    smokeLabels: [],
    // `hb-r-stillroom` authors `{ modifierIds: [...three] }`, so the tri-state reads `Custom set`
    // above a three-pill row.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The pill row is what a `Custom set` adds over `Inherit`; the absent cap sentence is what
    // separates this frame from both of its capped neighbours.
    expectSelector:
      '.fabricate-manager [data-recipe-editor] ' +
      '[data-recipe-crafting-modifier-picker]:has([data-modifier-pill-select])' +
      ':not(:has([data-recipe-crafting-modifier-cap]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // The suppressed-pick state (issue 1608): the same seeded custom set as the case above, after one
  // of its three stored picks is un-marked on the Checks tab rather than removed on the recipe.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-suppressed',
    label: 'Manager — Recipe edit crafting modifier suppressed pick',
    // BEYOND the smoke, same as its neighbours: the smoke's system authors no modifier picks at
    // all under this rule, let alone an un-marked one.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      // Un-marks `hb-mod-medicine` selectable.
      { selector: '[data-crafting-modifier-eligibility-input="hb-mod-medicine"]' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The count, not merely the note's presence: a click that landed on the wrong row, or one that
    // toggled nothing, would still leave all three picks eligible and render no note at all, and a
    // selector asserting only `[data-recipe-crafting-modifier-suppressed]` would be satisfied by
    // any nonzero count.
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-suppressed="1"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Two frames, because the cap has two readings and they are different pictures: below the bound
  // the sentence states it and the Add menu is live, at the bound the sentence gains its at-cap
  // clause and the Add menu goes dead.
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-cap-available',
    label: 'Manager — Recipe edit crafting modifier below the pick cap',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '5' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The READING, not merely the presence of a sentence: both frames render the same element with
    // the same chrome, so a fill that silently did not land would publish the at-cap picture here.
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-cap="available"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-cap-reached',
    label: 'Manager — Recipe edit crafting modifier at the pick cap',
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      { selector: '[data-crafting-modifier-max-picks-input]', fill: '3' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-crafting-modifier-picker]', scroll: true },
    ],
    expectView: 'recipe-edit',
    expectSelector: '.fabricate-manager [data-recipe-crafting-modifier-cap="reached"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-absent',
    label: 'Manager — Recipe edit crafting modifier absent',
    // BEYOND the smoke. The walk photographs a system whose recipes DO author picks, so there is
    // no counterpart frame of the surface being gone.
    reaches: 'beyond',
    smokeLabels: [],
    // The negative frame, and the one the redesign turns on. Under any rule but `bySubject` this
    // tab renders nothing about check modifiers — no picker, and no standing "the system decides"
    // banner either.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-stillroom"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="identity"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // Absence in THREE directions, because each retired hook is a different way the surface could
    // come back: the picker cell, the retired rule select, and the retired delegation banner.
    expectSelector:
      '.fabricate-manager [data-recipe-editor]' +
      ':not(:has([data-recipe-crafting-modifier-picker]))' +
      ':not(:has([data-recipe-crafting-modifier]))' +
      ':not(:has([data-recipe-modifier-banner]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  // Both cases used to photograph the `noPlaceholder` inert cause — a formula authored but never
  // spending the check-modifier roll-formula placeholder — and that cause retires with the
  // placeholder: the scalar is appended to whatever the GM authored, so the state is unreachable.
  managerCase({
    id: 'manager-checks-crafting-modifier-inert',
    label: 'Manager — Checks crafting modifiers inert',
    // BEYOND the smoke. The walk never empties a check formula, so no counterpart frame of
    // the notice exists.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      // Clearing the field reaches `noFormula`: a check slot that exists and rolls nothing.
      { selector: '[data-check-roll-formula]', fill: '' },
      { selector: '[data-checks-save]' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-inert]', scroll: true },
    ],
    expectView: 'checks-crafting',
    // The CAUSE, not just the notice. Both causes render through the same element with the
    // same chrome, so a presence-only assertion would photograph the wrong sentence.
    expectSelector: '.fabricate-manager [data-crafting-modifier-inert="noFormula"]',
    kinds: ['manager', 'checks'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\//,
      /^src\/ui\/svelte\/apps\/manager\/.*Check/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-crafting-modifier-inert',
    label: 'Manager — Recipe edit crafting modifier inert',
    // BEYOND the smoke, for the same reason as the sibling above.
    reaches: 'beyond',
    smokeLabels: [],
    // The recipe end of the same fact, and the only check-modifier banner this tab has left.
    query: { system: 'lab-herbalism' },
    steps: [
      'Checks',
      { selector: '#manager-checks-nav-crafting' },
      { selector: '#checks-section-modifiers' },
      { selector: '[data-crafting-modifier-policy-option="bySubject"] input' },
      // Back to The roll to clear the formula: the field and the catalogue it makes inert
      // are two SECTIONS apart now (issue 1096), and a step that stayed on Modifiers would
      // find no formula field and abort the case.
      { selector: '#checks-section-roll' },
      { selector: '[data-check-roll-formula]', fill: '' },
      { selector: '[data-checks-save]' },
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-kiln"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-modifier-inert]', scroll: true },
    ],
    expectView: 'recipe-edit',
    // The cause, and the withdrawal.
    expectSelector:
      '.fabricate-manager [data-recipe-editor]:has([data-recipe-modifier-inert="noFormula"])' +
      ':not(:has([data-recipe-crafting-modifier-picker]))',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-books-scrolls',
    label: 'Manager — Recipe edit books scrolls',
    smokeLabels: ['manager-recipe-edit-books-scrolls'],
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    // Pinned by row id rather than left on "whichever row is first".
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-greater-healing"]' },
      { selector: '#recipe-tab-books-scrolls' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-tools',
    label: 'Manager — Recipe edit tools',
    smokeLabels: ['manager-recipe-edit-tools'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-tools' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients',
    label: 'Manager — Recipe edit ingredients',
    smokeLabels: ['manager-recipe-edit-ingredients'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-ingredients' },
    ],
    expectView: 'recipe-edit',
    // The converged row, named (issue 1373).
    expectSelector: '[data-recipe-option] [data-recipe-option-kind]',
    expectContained: [
      {
        container: '[data-recipe-option]',
        target: '[data-recipe-option-kind]',
      },
      // AND THE ADDERS, which are three controls in one row rather than three buttons stacked
      // under a heading. The set card is what draws them.
      {
        container: '[data-recipe-set]',
        target: '[data-recipe-add="tag-requirement"]',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients-cost',
    label: 'Manager — Recipe edit ingredients cost',
    smokeLabels: ['manager-recipe-edit-ingredients-cost'],
    // The essence + currency-cost requirement rows, which sit below the fold of the plain
    // ingredients frame — the smoke splits them into their own capture for exactly that reason and
    // scrolls the currency row (the last requirement) into view so both rows and their end-of-row
    // Steppers are on screen.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-currency]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-tag-picker',
    label: 'Manager — Recipe edit, the tag picker open over a system vocabulary',
    smokeLabels: [],
    // No case in the registry opened this popover (issue 1373, maintainer round 8), which is the
    // third such gap in as many rounds and is why it went on drawing a panel that is not the
    // design's.
    reaches: 'beyond',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '[data-recipe-option-tags]', scroll: true },
      { selector: '[data-recipe-option-tags] [data-recipe-add-tag]' },
    ],
    expectView: 'recipe-edit',
    // The panel AND A row in it.
    expectSelector:
      '.fabricate-manager .fabricate-picker-popover.manager-travel-popover ' +
      '.manager-travel-popover-options .manager-travel-option',
    // Portaled, so containment is asserted against the application root rather than against the row
    // that owns the trigger: the panel escapes the editor's clipping on purpose, so a container
    // assertion on that row could only ever fail.
    expectContained: [
      {
        container: '.fabricate-manager',
        target: '.fabricate-picker-popover .manager-travel-popover-search input',
      },
    ],
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-ingredients-or-menu',
    label: 'Manager — Recipe edit ingredients, the "or…" menu open',
    reaches: 'beyond',
    smokeLabels: [],
    // No case in the registry had ever opened this menu (issue 1373, maintainer round 8), and that
    // is the whole reason it shipped as a wide list of four full sentences with no header and no
    // colour while three surfaces around it were being brought onto the design.
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-tincture"]' },
      { selector: '#recipe-tab-ingredients' },
      { selector: '.manager-recipe-or-trigger' },
    ],
    expectView: 'recipe-edit',
    // Named on the last kind, not on the panel.
    expectSelector: '.manager-recipe-or-popover [data-recipe-add="alternative-currency"]',
    // The panel is PORTALED to the manager root (`util/overlayHost.js`), so the container is that
    // root and not the recipe view: it is deliberately outside the scrolling editor pane, and
    // containment against the pane would be a claim about a box it does not sit in.
    expectContained: [{ container: '.fabricate-manager', target: '.manager-recipe-or-popover' }],
    // …and it is actually on top. A menu drawn under the row it hangs from is contained, visible
    // and useless, which is a failure no bounding box can see.
    expectCenterHit: '.manager-recipe-or-popover [data-recipe-add="alternative-component"]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-validation',
    label: 'Manager — Recipe edit validation',
    smokeLabels: ['manager-recipe-edit-validation'],
    reaches: 'exact',
    query: {},
    // The recipe is named, and that is the whole difference between this frame and the one it
    // replaces.
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-runeplate-draft"]' },
      { selector: '#recipe-tab-validation' },
    ],
    expectView: 'recipe-edit',
    // A representative frame for `EditorValidationSurface` since issue 1517, and it had no
    // assertion at all until then.
    expectSelector: '[data-recipe-tab="validation"] [data-recipe-issue-view]',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-multistep',
    label: 'Manager — Recipe edit multistep',
    smokeLabels: ['manager-recipe-edit-multistep'],
    // The Overview tab's editable steps accordion, with a per-step duration control on each header.
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results',
    label: 'Manager — Recipe edit results',
    smokeLabels: ['manager-recipe-edit-results'],
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '.manager-icon-button[aria-label^="Edit"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-multistep',
    label: 'Manager — Recipe edit results multistep',
    smokeLabels: ['manager-recipe-edit-results-multistep'],
    // The Results tab's per-step result sections — the frame that proves a multi-step recipe's
    // Results renders something rather than an empty tab (the structural bug that shipped unseen
    // for want of exactly this coverage).
    reaches: 'exact',
    query: {},
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="sm-r-pattern-blade"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-multistep-disable-confirm',
    label: 'Manager — Multistep disable confirm',
    smokeLabels: ['manager-multistep-disable-confirm'],
    reaches: 'exact',
    // `dialog: 'open'` leaves Foundry's own DialogV2 standing and unresolved, which is the whole
    // point of this frame: the confirmation itself is the state, not what follows it.
    query: { dialog: 'open' },
    steps: [
      'System Overview',
      { selector: '#system-tab-settings' },
      { selector: '.manager-feature-tile[data-feature-key="multiStepRecipes"] button' },
    ],
    expectView: 'system-edit',
    // The dialog IS the state, so the frame has to be held to it: `expectView: 'system-edit'` is
    // satisfied by the settings tab with no dialog standing, which is precisely the screen a
    // silently no-oping toggle would have published.
    expectSelector: '.application.dialog',
    kinds: ['manager', 'recipes'],
    // Matches the screen it renders.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-collapsed',
    label: 'Manager — Recipe edit collapsed',
    smokeLabels: ['manager-recipe-edit-collapsed'],
    // The collapsed editor: `RecipeEditView` draws a read-only steps card plus its explanatory
    // note, instead of the editable accordion, whenever `!multiStepEnabled && steps.length > 1`.
    reaches: 'exact',
    query: { system: 'lab-jewelry' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="jw-r-circlet"]' },
      { selector: '#recipe-tab-overview' },
      { selector: '[data-recipe-section="collapsed-steps"]', scroll: true },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-progressive',
    label: 'Manager — Recipe edit results progressive',
    smokeLabels: ['manager-recipe-edit-results-progressive'],
    // Progressive Results: an ORDERED stage list with a roll-budget strip, a read-only difficulty
    // badge and keyboard move chevrons — a wholly different tab body from the routed and simple
    // shapes. It is a SYSTEM-mode fact, so it can only be photographed on the progressive system.
    reaches: 'exact',
    query: { system: 'lab-herbalism' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="hb-r-grind"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-results-alchemy',
    label: 'Manager — Recipe edit results alchemy',
    smokeLabels: ['manager-recipe-edit-results-alchemy'],
    // Alchemy Results: the two-slot shape — an authored success set plus a reserved, undeletable
    // "On a failed check" set the editor draws itself.
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '[data-recipe-edit="al-r-elixir"]' },
      { selector: '#recipe-tab-results' },
    ],
    expectView: 'recipe-edit',
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/recipe\//,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-access-rail',
    label: 'Manager — Recipe edit access rail',
    smokeLabels: ['manager-recipe-edit-access-rail'],
    reaches: 'exact',
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-access' }],
    expectView: 'access',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      // The manager router and the Crafting entry model (issue 1151), for the reason recorded on
      // `manager-books-scrolls-normal`.
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/crafting\/craftingNav\.js$/,
    ],
  }),
  managerCase({
    id: 'manager-recipe-edit-access-inspector',
    label: 'Manager — Recipe access inspector, a recipe selected',
    // The inspector no frame filled (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // The inspector's CHARACTERS roster, not the inspector root: the root renders in BOTH
    // branches, so naming it alone would pass over the empty state this case exists to leave.
    expectSelector: '[data-access-inspector] [data-access-roster="characters"]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-selected',
    label: 'Manager — Recipe access rosters for a selected recipe',
    // The populated half of the access inspector (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    // `lab-alchemy` is a `restricted` system, which is what makes the Access rail entry render
    // at all; `al-r-elixir` is one of its five recipes, well inside the list's resting page size
    // of ten, so the row is on screen without a filter or a pager step.
    query: { system: 'lab-alchemy' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // The inspector's populated branch, proved by an element that exists only in it: the empty
    // branch draws an `EmptyState` and nothing else, so `[data-access-inspector]` alone is
    // satisfied by the frame this case exists to distinguish itself from.
    expectSelector:
      '.fabricate-manager [data-access-inspector]:has([data-access-summary])' +
      ' [data-access-roster="characters"] [data-access-character-row]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RosterRow\.svelte$/,
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-roster-paged',
    label: 'Manager — Recipe access players roster paged',
    // The roster's pager, which no case could reach (issue 1515).
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy', manyPlayers: '1' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
    ],
    expectView: 'access',
    // A full page of six, which is the paged state stated as something the DOM can answer.
    expectSelector:
      '.fabricate-manager [data-access-inspector] [data-access-roster="players"]' +
      ' .manager-access-roster-rows [data-access-player-row]:nth-child(6)',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RosterRow\.svelte$/,
      // No `Pagination.svelte` pattern, though this frame is the registry's only paged roster.
    ],
  }),
  managerCase({
    id: 'manager-access-recipe-roster-no-match',
    label: 'Manager — Recipe access players roster no match',
    // The per-roster no-match line (issue 1515), the second state the one-user roster made
    // unreachable: the field that produces it renders only over a roster with something in it, and
    // a roster of one has nothing a query can miss that the screen does not already show.
    reaches: 'beyond',
    smokeLabels: [],
    query: { system: 'lab-alchemy', manyPlayers: '1' },
    steps: [
      'Crafting',
      { selector: '#manager-crafting-nav-access' },
      { selector: '[data-access-row="al-r-elixir"]' },
      { selector: '[data-access-roster-search="players"]', fill: ACCESS_ROSTER_SEARCH_MISS_TERM },
    ],
    expectView: 'access',
    // Both rosters, because the claim is that one of them missed.
    expectSelector:
      '.fabricate-manager [data-access-inspector]' +
      ':has([data-access-roster="characters"] [data-access-character-row])' +
      ' [data-access-roster="players"] [data-access-roster-empty="players"]',
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
      // No `EmptyState.svelte` pattern, for the reason the paged case above records about
      // `Pagination`: it is a broad signal, so the pattern could never be consulted.
    ],
  }),
]);
