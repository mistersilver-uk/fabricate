/** The Checks route: its four tabs, every check editor and the Validation activity rail. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { getModifierExpressionSuggestions } from '../../src/config/modifierExpressionSuggestions.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries, setInputValue } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import {
  labCaseSelector,
  managerComponents,
  settleBetweenTests,
  settleRouteExit,
  compareStrings,
} from './manager-mounted-shared.js';
// A converted control's value is read off its trigger rather than off a `.value` (issue 1510).
import { assertSelectHasResolvedName, selectTriggerText } from '../helpers/select-control.js';

let Component;
let ChecksRightMenuComponent;
let CraftingCheckEditorComponent;
let SimpleCraftingCheckEditorComponent;
let ProgressiveCraftingCheckEditorComponent;
let ChecksViewComponent;
let mounted;
let target;
// The store `mountManager` built, so a case can make one save refuse after mounting.
let checksStore;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { navButton, openChecksActivity, openChecksSection } = queries;
const { mountManager, mountWorldRulesDestination, openRecipeEditor } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: (store) => {
    checksStore = store;
  },
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerChecksCases() {
  before(async () => {
    ({
      Component,
      ChecksRightMenuComponent,
      CraftingCheckEditorComponent,
      SimpleCraftingCheckEditorComponent,
      ProgressiveCraftingCheckEditorComponent,
      ChecksViewComponent,
    } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  it('routes the Checks nav to a four-tab view with a tab-aware context menu', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const checksNav = navButton('Checks');
    assert.ok(checksNav, 'a real Checks nav button should render');
    assert.equal(
      checksNav.disabled,
      false,
      'Checks should be an active route, not a Soon placeholder'
    );
    assert.ok(checksNav.querySelector('i.fa-dice-d20'), 'Checks nav should use the d20 die icon');

    checksNav.click();
    await tick();
    flushSync();

    // Activating the group PARENT redirects to the first available child (issue 1096).
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'checks-crafting');
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-checks-nav-item]')).map((button) =>
        // The rail's badge column can carry an issue count and a dirty marker beside the
        // label, so the label is read off its own span rather than off the whole button.
        button.querySelector('.manager-nav-label').textContent.trim()
      ),
      ['Crafting', 'Salvage', 'Gathering', 'Validation']
    );

    // The Crafting route renders a single editor (the default fixture is alchemy mode,
    // which authors a simple pass/fail check) — not a create-a-list surface — and its
    // docs help card sits in the right menu.
    const craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(craftingPanel, 'Crafting panel should be the default');
    assert.ok(
      craftingPanel.querySelector('[data-simple-check-editor]'),
      'alchemy crafting shows the simple check editor'
    );
    assert.equal(
      target.querySelector('.manager-header-actions [data-checks-create]'),
      null,
      'a singleton check has no create action'
    );
    const craftingHelp = target.querySelector('[data-checks-help="crafting"]');
    assert.ok(craftingHelp, 'Crafting tab shows its docs links');
    // NOT an explainer card any more (issue 1096). The maintainer removed the
    // `ABOUT CRAFTING CHECKS` card outright — the prototype's rail opens on a
    // documentation / quickstart PAIR and nothing else — so what this hook now names is
    // that pair. The links themselves are what the assertions below are really about.
    assert.ok(
      craftingHelp.classList.contains('manager-checks-rail-links'),
      'the rail opens on the documentation/quickstart link pair'
    );
    assert.equal(
      craftingHelp.querySelectorAll('a').length,
      2,
      'both the docs link and the Quickstart survive'
    );
    const craftingDocs = craftingHelp.querySelector(
      'a[href="https://mistersilver-uk.github.io/fabricate/checks/crafting"]'
    );
    assert.ok(craftingDocs, 'crafting help card links to the crafting checks docs page');
    assert.equal(craftingDocs.getAttribute('target'), '_blank');
    assert.equal(craftingDocs.getAttribute('rel'), 'noreferrer');
    assert.ok(
      !target.querySelector('.manager-environment-workspace.is-inspector-hidden'),
      'the context menu column should be visible on the Crafting route'
    );

    // Salvage is its own singleton page with its own docs link.
    await openChecksActivity('salvage');
    const salvagePanel = target.querySelector('[data-checks-panel="salvage"]');
    // Salvage (simple resolution mode by default) now renders the shared simple
    // check editor with the recipe-specific DC source hidden.
    assert.ok(
      salvagePanel.querySelector('[data-simple-check-editor]'),
      'salvage simple mode shows the simple check editor'
    );
    assert.equal(
      salvagePanel.querySelector('[data-dc-mode-option]'),
      null,
      'salvage hides the recipe-specific DC source section'
    );
    assert.ok(
      target
        .querySelector('[data-checks-help="salvage"]')
        ?.querySelector('a[href="https://mistersilver-uk.github.io/fabricate/checks/salvage"]'),
      'salvage help card links to the salvage docs page'
    );

    // Gathering page (default fixture economy is d100) renders the read-only card
    // reflecting the d100-is-the-roll framing and links to its docs.
    await openChecksActivity('gathering');
    const gatheringPanel = target.querySelector('[data-checks-panel="gathering"]');
    assert.ok(
      gatheringPanel.hasAttribute('data-gathering-d100-readonly'),
      'd100 gathering renders the read-only card, not an editor'
    );
    assert.equal(
      gatheringPanel.querySelector('.manager-checks-card-title').textContent.trim(),
      'Fixed d100 roll'
    );
    assert.ok(
      gatheringPanel.textContent.includes('d100'),
      'the gathering page explains the d100 roll is the check'
    );
    assert.ok(
      target
        .querySelector('[data-checks-help="gathering"]')
        ?.querySelector('a[href="https://mistersilver-uk.github.io/fabricate/checks/gathering"]'),
      'gathering help card links to the gathering checks docs page'
    );

    // Validation spans the full width with no context menu.
    await openChecksActivity('validation');
    const validationPanel = target.querySelector('[data-checks-panel="validation"]');
    assert.ok(validationPanel);
    // The Validation tab now renders a per-check readiness section for every
    // in-play subsystem (alchemy fixture: crafting + salvage), replacing the old
    // "Nothing to validate yet" placeholder.
    assert.ok(
      validationPanel.querySelector('[data-checks-validation-section="crafting"]'),
      'the Validation tab renders a per-check section for the crafting check'
    );
    assert.ok(
      validationPanel.querySelector(
        '[data-checks-validation-section="crafting"] [data-check="hasRollFormula"]'
      ),
      'the crafting section lists the roll-formula readiness check'
    );
    // The Validation route DOES have a rail now (issue 1096).
    assert.ok(
      target.querySelector('[data-checks-help="validation"]'),
      'Validation keeps the documentation pair'
    );
    assert.ok(
      target.querySelector('[data-checks-all-checks]'),
      'Validation renders the All-checks summary'
    );
    for (const absent of [
      '[data-checks-active]',
      '[data-checks-preview-as]',
      '[data-checks-simulator]',
      '[data-checks-odds]',
      '[data-checks-digest]',
      '[data-checks-sections]',
    ]) {
      assert.ok(!target.querySelector(absent), `the Validation route must not render ${absent}`);
    }

    // The shared manager inspector is not rendered for the Checks view.
    assert.ok(
      !target.querySelector('.manager-body > .manager-inspector'),
      'the Checks routes own their context menu, so the shared inspector is skipped'
    );
  });

  it('hides the Checks Salvage tab when the salvage feature is off', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          selectedFeatures: {
            essences: true,
            itemTags: true,
            recipeCategories: true,
            gathering: true,
            salvage: false,
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();

    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-checks-nav-item]')).map((button) =>
        button.querySelector('.manager-nav-label').textContent.trim()
      ),
      ['Crafting', 'Gathering', 'Validation'],
      'the Salvage tab is dropped when salvage is off'
    );
    assert.equal(
      target.querySelector('[data-checks-nav-item="salvage"]'),
      null,
      'no salvage tab button renders'
    );
  });

  it('keeps the rail’s THREE badge-column markers pairwise distinguishable (issue 1096)', async () => {
    // A record count, an issue count and an unsaved marker share one column.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          alchemyResolutionMode: 'simple',
          // No salvage check at all under ROUTED salvage.
          salvageResolutionMode: 'routed',
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();

    // 1. The ISSUE badge names its unit, so a bare numeral cannot be mistaken for it.
    const salvageBadge = target.querySelector('[data-checks-nav-issues="salvage"]');
    assert.ok(salvageBadge, 'a salvage readiness issue badges its rail child');
    assert.match(salvageBadge.getAttribute('aria-label'), /issue/i);
    assert.match(salvageBadge.textContent.trim(), /^\d+$/);

    // 2. The parent badge restates the same unit, and is the marker a COLLAPSED rail keeps.
    const parentBadge = target.querySelector('[data-checks-nav-issues="checks"]');
    assert.ok(parentBadge, 'the group parent carries the total');
    assert.match(parentBadge.getAttribute('aria-label'), /issue/i);

    // 3. The RECORD count is a different attribute entirely and names no unit.
    const recordCount = target.querySelector('.manager-nav-button .manager-nav-count');
    assert.ok(recordCount, 'the rail still renders record-count numerals');
    assert.ok(
      !recordCount.hasAttribute('aria-label'),
      'a record count is a bare numeral; it is the issue badge that must name its unit'
    );

    // 4. The DIRTY marker is a third attribute with its own name.
    assert.ok(
      !target.querySelector('[data-checks-nav-dirty]'),
      'nothing is dirty yet, so no unsaved marker renders'
    );
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 3');
    await tick();
    flushSync();
    const dirtyMarker = target.querySelector('[data-checks-nav-dirty="crafting"]');
    assert.ok(dirtyMarker, 'an unsaved crafting edit marks its own rail child');
    assert.match(dirtyMarker.getAttribute('aria-label'), /unsaved/i);
    assert.notEqual(
      dirtyMarker.getAttribute('aria-label'),
      salvageBadge.getAttribute('aria-label'),
      'the two markers must not announce the same thing'
    );
    assert.notEqual(
      dirtyMarker.className,
      salvageBadge.className,
      'and they must not render as the same shape'
    );
  });

  it('gives the section strip’s warning dot a TEXT accessible name (issue 1096)', async () => {
    // The frames show "The roll ●" — a colour-and-shape-only signal.
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { alchemyResolutionMode: 'routedByCheck' }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();

    // A routed check with no authored formula raises `noRollFormula`.
    const dot = target.querySelector('[data-checks-section-dot="roll"]');
    assert.ok(dot, 'the roll section carries a warning dot');
    assert.match(dot.getAttribute('aria-label'), /issue/i);
    assert.equal(dot.getAttribute('role'), 'img', 'a decorative span announces nothing');

    // A count of zero renders NO badge: five sections each wearing a `0` is chrome.
    assert.ok(
      !target.querySelector('[data-checks-section-count="triggers"]'),
      'a zero count renders unbadged'
    );
  });

  async function mountChecksWithAlchemyCheckMode(checkMode) {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { alchemyConfig: { checkMode } }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();
    return calls;
  }

  it('Checks: alchemy checkMode=none is the OFF state — the turn-on empty state and a live Active toggle, not a read-only notice', async () => {
    await mountChecksWithAlchemyCheckMode('none');
    // `none` is no longer a MODE the studio offers.
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"][data-checks-off]'),
      'the crafting route renders the shared off-state panel'
    );
    assert.ok(
      target.querySelector('[data-checks-turn-on]'),
      'and offers the turn-this-check-on button'
    );
    assert.equal(
      target.querySelector('[data-alchemy-none-readonly]'),
      null,
      'the retired read-only notice is gone — it named a mode the selector no longer offers'
    );
    // The switch is LIVE and reads off, which is the whole point.
    const toggle = target.querySelector('[data-checks-active-toggle]');
    assert.ok(toggle, 'the Active toggle renders and is operable');
    assert.equal(
      target.querySelector('[data-checks-active-required]'),
      null,
      'and carries no "cannot be turned off" hint'
    );

    // Turning it back on stages `simple` and the authoring surface returns.
    target.querySelector('[data-checks-turn-on]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'),
      'the check-mode selector comes back'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-simple-check-editor]'),
      'and the simple pass/fail editor with it'
    );
  });

  it('Checks: the alchemy check-mode selector offers Simple and Tiered only — "No check" is not a mode', async () => {
    await mountChecksWithAlchemyCheckMode('simple');
    const selector = target.querySelector(
      '[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'
    );
    assert.ok(selector, 'the alchemy check-mode selector renders at the top of the Crafting tab');
    const selectorOptions = Array.from(
      selector.querySelectorAll('[data-crafting-alchemy-checkmode-option]')
    ).map((option) => option.getAttribute('data-crafting-alchemy-checkmode-option'));
    assert.deepEqual(
      selectorOptions,
      ['simple', 'tiered'],
      'the selector answers only what SHAPE the check is; on/off is the Active switch'
    );
  });

  it('Checks: alchemy checkMode=simple renders the selector above the simple editor and CAN be disabled', async () => {
    await mountChecksWithAlchemyCheckMode('simple');
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'),
      'the alchemy check-mode selector renders at the top of the Crafting tab'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-simple-check-editor]'),
      'Simple mode renders the simple pass/fail editor below the selector'
    );
    assert.ok(
      target.querySelector('[data-checks-active-toggle]'),
      'Simple mode is OPTIONAL — it offers a live Active toggle'
    );
    assert.equal(
      target.querySelector('[data-checks-active-required]'),
      null,
      'and no longer claims the mode requires the check'
    );
  });

  it('Checks: alchemy checkMode=tiered renders the selector above the routed editor and cannot be disabled (issue 554)', async () => {
    await mountChecksWithAlchemyCheckMode('tiered');
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode]'),
      'the alchemy check-mode selector renders at the top of the Crafting tab'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-crafting-check-editor]'),
      'Tiered mode renders the routed outcome-tier editor below the selector'
    );
    assert.equal(
      target.querySelector('[data-checks-active-toggle]'),
      null,
      'Tiered mode is mandatory — no operable Active toggle'
    );
    const locked = target.querySelector('[data-checks-active-locked]');
    assert.ok(locked, 'it shows the locked always-on indicator instead');
    assert.equal(
      locked.getAttribute('data-checks-active-locked'),
      'on',
      'and that indicator reads ON — tiered always rolls'
    );
    assert.ok(
      target.querySelector('[data-checks-active-required]'),
      'Tiered mode shows the cannot-be-disabled required hint'
    );
  });

  it('Checks: selecting a check-mode option STAGES it — no store write until Save checks', async () => {
    // The lifecycle is the point. This used to call `store.setAlchemyCheckMode` straight from
    // the radio's change handler, so the mode landed on click: no Unsaved chip, nothing for
    // the route-exit guard to guard, and Discard could not put it back.
    const calls = await mountChecksWithAlchemyCheckMode('simple');
    const tieredRadio = target.querySelector(
      '[data-checks-panel="crafting"] [data-crafting-alchemy-checkmode-option="tiered"] input'
    );
    assert.ok(tieredRadio, 'the tiered option radio renders');
    tieredRadio.checked = true;
    tieredRadio.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'setAlchemyCheckMode'),
      [],
      'choosing a mode writes NOTHING on its own'
    );
    // …and the studio now reports work in hand, which is what makes Save reachable.
    const save = target.querySelector('[data-checks-save]');
    assert.ok(save && !save.disabled, 'Save checks is enabled by the staged mode change');

    save.click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'setAlchemyCheckMode'),
      [['setAlchemyCheckMode', 'tiered']],
      'and Save checks is what applies it, through the same store action as before'
    );
  });

  it('Checks: the alchemy Active toggle stages the check OFF as checkMode none, applied by Save checks', async () => {
    // The off state is the MODE, not `craftingCheck.enabled`.
    const calls = await mountChecksWithAlchemyCheckMode('simple');
    const toggle = target.querySelector('[data-checks-active-toggle]');
    assert.ok(toggle, 'the Active toggle renders for alchemy simple');
    toggle.click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'saveCraftingCheckActive'),
      [],
      'it never writes the generic craftingCheck.enabled flag'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"][data-checks-off]'),
      'the route immediately previews the off state from the draft'
    );

    const save = target.querySelector('[data-checks-save]');
    assert.ok(save && !save.disabled, 'Save checks is enabled by the staged toggle');
    save.click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'setAlchemyCheckMode'),
      [['setAlchemyCheckMode', 'none']],
      'and Save applies it as checkMode none'
    );
    assert.deepEqual(
      calls.filter((call) => call[0] === 'saveCraftingCheckSimple'),
      [],
      'and writes no untouched slot draft alongside it — the per-slot dirty guards'
    );
  });

  it('Checks: alchemy behaviour flags render as toggles reflecting stored values and persist via saveAlchemyConfig (issue 713)', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksSection('on-failure');

    const behaviour = target.querySelector(
      '[data-checks-panel="crafting"] [data-alchemy-behaviour]'
    );
    assert.ok(behaviour, 'the alchemy behaviour card renders on the alchemy crafting tab');
    const learn = behaviour.querySelector('[data-recipe-field="learnOnCraft"]');
    const consume = behaviour.querySelector('[data-recipe-field="consumeOnFail"]');
    const history = behaviour.querySelector('[data-recipe-field="showAttemptHistoryToPlayers"]');
    assert.ok(learn && consume && history, 'all three behaviour toggles render');
    // Default fixture: learnOnCraft true, consumeOnFail true.
    assert.equal(learn.getAttribute('aria-pressed'), 'true');
    assert.equal(consume.getAttribute('aria-pressed'), 'true');
    assert.equal(history.getAttribute('aria-pressed'), 'false');
    // The consumption-policy card is alchemy-exclusive-off.
    assert.equal(
      target.querySelector('[data-checks-panel="crafting"] [data-failure-consumption]'),
      null,
      'the failure consumption policy card is not shown in alchemy mode'
    );

    // Toggling one flag sends the FULL config with only that field flipped.
    history.click();
    await tick();
    flushSync();
    const saved = calls.find((call) => call[0] === 'saveAlchemyConfig');
    assert.ok(saved, 'toggling persists through saveAlchemyConfig');
    assert.deepEqual(saved[1], {
      checkMode: 'simple',
      learnOnCraft: true,
      consumeOnFail: true,
      showAttemptHistoryToPlayers: true,
    });
  });

  it('Checks: failure consumption policy renders two toggles reflecting stored values and persists via saveCraftingCheckConsumption (issue 712)', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'simple',
          craftingCheck: {
            consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: true },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksSection('on-failure');

    const policy = target.querySelector(
      '[data-checks-panel="crafting"] [data-failure-consumption]'
    );
    assert.ok(
      policy,
      'the failure consumption policy card renders on the non-alchemy crafting tab'
    );
    const consume = policy.querySelector('[data-recipe-field="consumeIngredientsOnFail"]');
    const breakTools = policy.querySelector('[data-recipe-field="breakToolsOnFail"]');
    assert.ok(consume && breakTools, 'both policy toggles render');
    // Stored non-default fixture: consume OFF, break ON.
    assert.equal(consume.getAttribute('aria-pressed'), 'false');
    assert.equal(breakTools.getAttribute('aria-pressed'), 'true');
    // The alchemy behaviour card is not shown outside alchemy mode.
    assert.equal(
      target.querySelector('[data-checks-panel="crafting"] [data-alchemy-behaviour]'),
      null,
      'the alchemy behaviour card is not shown in non-alchemy crafting mode'
    );

    consume.click();
    await tick();
    flushSync();
    const saved = calls.find((call) => call[0] === 'saveCraftingCheckConsumption');
    assert.ok(saved, 'toggling persists through saveCraftingCheckConsumption');
    assert.deepEqual(saved[1], { consumeIngredientsOnFail: true });

    // ── The prototype's own SHAPE for this screen (issue 1096) ──────────────────────
    // Both flags are TOP-LEVEL cards. The `Failure consumption policy` card that used to
    // wrap them was invented here — the structural parity pass reported it as an extra
    // card, and the exemption that excused it has been overruled rather than reworded.
    assert.ok(
      !target.querySelector(
        '[data-checks-panel="crafting"] .manager-inspector-card [data-recipe-section="failure-consume-ingredients"]'
      ),
      'no card wraps the two failure flags'
    );
    // The prototype's glyphs, not the more literal ones this screen had chosen.
    assert.ok(
      Boolean(
        policy.querySelector('[data-recipe-section="failure-consume-ingredients"] i.fa-fire')
      ),
      'consume-on-fail wears the prototype’s fa-fire'
    );
    assert.ok(
      Boolean(policy.querySelector('[data-recipe-section="failure-break-tools"] i.fa-hammer')),
      'break-tools wears the prototype’s fa-hammer'
    );
    assert.ok(
      !policy.querySelector('i.fa-fire-flame-curved, i.fa-hammer-crash'),
      'and neither keeps the glyph the exemption used to defend'
    );
    // The note the prototype ends the screen with.
    const note = target.querySelector('[data-failure-salvage-note]');
    assert.ok(Boolean(note), 'the salvage note closes the screen');
    assert.ok(
      Boolean(note.querySelector('i.fa-circle-info')),
      'glyph-led, as the prototype has it'
    );
    assert.match(note.textContent, /Salvage failures follow their own separate policy/);
  });

  it('points each Checks help card at the matching documentation page', () => {
    const cases = [
      {
        activeTab: 'crafting',
        href: 'https://mistersilver-uk.github.io/fabricate/checks/crafting',
      },
      { activeTab: 'salvage', href: 'https://mistersilver-uk.github.io/fabricate/checks/salvage' },
      {
        activeTab: 'gathering',
        href: 'https://mistersilver-uk.github.io/fabricate/checks/gathering',
      },
    ];
    for (const { activeTab, href } of cases) {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(ChecksRightMenuComponent, {
        target,
        // An activation is supplied so the Active card renders too.
        props: { activeTab, activation: { enabled: true, optional: true } },
      });
      flushSync();

      // The DESTINATIONS are what this row is for.
      const linkRow = target.querySelector(`[data-checks-help="${activeTab}"]`);
      assert.ok(linkRow, `${activeTab} menu renders its documentation link pair`);
      const linkHrefs = Array.from(linkRow.querySelectorAll('a')).map((anchor) =>
        anchor.getAttribute('href')
      );
      assert.deepEqual(
        linkHrefs,
        [href, 'https://mistersilver-uk.github.io/fabricate/help/quickstart'],
        `${activeTab} rail keeps both its docs page and the Quickstart`
      );
      for (const anchor of linkRow.querySelectorAll('a')) {
        assert.equal(anchor.getAttribute('target'), '_blank');
        assert.equal(anchor.getAttribute('rel'), 'noreferrer');
      }

      // FLAT HEADING, CARD BENEATH — the Tool Studio's inspector convention.
      const activeCard = target.querySelector(`[data-checks-active="${activeTab}"]`);
      assert.ok(activeCard, `${activeTab} menu renders its Active card`);
      assert.ok(
        !activeCard.querySelector('.manager-card-title'),
        'a card-title inside a rail card is the convention the Tool Studio replaced'
      );
      assert.ok(
        !activeCard.previousElementSibling?.classList.contains('manager-kicker'),
        'the activation card carries no heading: it states its own subject'
      );
      assert.match(
        activeCard.textContent,
        /Check is (on|off)/,
        'and it reads the sentence the prototype gives the card, not a bare On/Off'
      );

      // Every OTHER section keeps the flat kicker.
      const digestHead = target.querySelector('[data-checks-digest]').previousElementSibling;
      assert.ok(
        Boolean(digestHead?.classList.contains('manager-checks-rail-head')),
        'the digest is named by a flat heading row directly above its card'
      );
      assert.ok(
        Boolean(digestHead.querySelector('.manager-checks-rail-head-icon')),
        'and that row leads with a glyph'
      );
      assert.ok(
        Boolean(digestHead.querySelector('.manager-kicker')),
        'and still names the section with a kicker'
      );

      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  it('renders the routed crafting check editor only when the system is in routed mode', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'routedByCheck',
          craftingCheck: {
            routed: {
              type: 'fixed',
              rollExpression: '2d6',
              relativeOutcomes: [],
              fixedOutcomes: [
                { id: 'seed1', name: 'Hit', success: true, breakTools: false, start: 1, end: 6 },
              ],
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksSection('outcomes');

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'checks-crafting');
    assert.ok(
      target.querySelector('[data-crafting-check-editor]'),
      'routed mode shows the crafting check editor'
    );
    assert.ok(
      !target.querySelector('.manager-checks-page'),
      'the singleton placeholder page is replaced by the editor'
    );
    assert.equal(target.querySelectorAll('[data-check-type-option]').length, 2);
    const rows = target.querySelectorAll('[data-outcome-row]');
    assert.equal(rows.length, 1, 'the persisted tier is rendered');
    assert.equal(rows[0].getAttribute('data-outcome-id'), 'seed1');
    assert.equal(rows[0].querySelector('[data-outcome-name]').value, 'Hit');

    // The formula field lives on The roll, the tier rows on Outcomes (issue 1096).
    await openChecksSection('roll');
    // The editor is seeded from the selected system's persisted routed config
    // (legacy `rollExpression` migrates to the shared `rollFormula` field).
    const expressionInput = target.querySelector('[data-check-roll-formula]');
    assert.equal(expressionInput.value, '2d6');

    // Routed mode requires the check.
    assert.ok(
      target.querySelector('[data-checks-active="crafting"] [data-checks-active-required]'),
      'routed crafting check shows the required hint'
    );
    assert.ok(!target.querySelector('[data-checks-active-toggle]'));

    // The Save button is always present, disabled until there are unsaved edits.
    const saveButtonInitial = target.querySelector('[data-checks-save]');
    assert.ok(saveButtonInitial, 'the Save button is always rendered');
    assert.ok(saveButtonInitial.disabled, 'the Save button is disabled with no unsaved edits');

    // Editing stages a change: the Save button enables and persists via the store
    // seam (not auto-saved), then the unsaved state clears.
    expressionInput.value = '2d6+1d4';
    expressionInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    const saveButton = target.querySelector('[data-checks-save]');
    assert.ok(saveButton, 'the Save button is present');
    assert.equal(saveButton.disabled, false, 'editing enables the Save button');

    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();
    const saved = calls.find((call) => call[0] === 'saveCraftingCheckRouted');
    assert.ok(saved, 'Save persists the routed config through the store');
    assert.equal(saved[1].rollFormula, '2d6+1d4');
    assert.ok(
      target.querySelector('[data-checks-save]').disabled,
      'saving clears the unsaved state and re-disables the Save button'
    );
  });

  it('routedByIngredients renders the SimpleCraftingCheckEditor (no tier editor) and Save routes through the simple slot', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'routedByIngredients',
          // The RI check now lives on the shared simple pass/fail slot.
          craftingCheck: {
            simple: {
              rollFormula: '1d20',
              dc: 14,
              thresholdMode: 'meet',
              dcMode: 'static',
              tiers: [],
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    const craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(
      craftingPanel.querySelector('[data-simple-check-editor]'),
      'routedByIngredients renders the simple pass/fail editor'
    );
    // It is NOT the routed tier editor: no relative/fixed toggle.
    assert.equal(
      craftingPanel.querySelector('[data-crafting-check-editor]'),
      null,
      'the routed tier editor is not rendered for routedByIngredients'
    );
    assert.equal(
      craftingPanel.querySelector('[data-check-type-option]'),
      null,
      'no relative/fixed type toggle'
    );
    assert.equal(craftingPanel.querySelector('[data-outcome-row]'), null, 'no outcome-tiers table');
    // The DC + static/dynamic DC source are shown (pass/fail gate uses the DC).
    assert.ok(
      craftingPanel.querySelector('[data-dc-mode-option]'),
      'the simple editor shows the static/dynamic DC source'
    );
    const formulaInput = craftingPanel.querySelector('[data-check-roll-formula]');
    assert.equal(formulaInput.value, '1d20', 'seeded from craftingCheck.simple');

    // Save routes through the simple slot, not the routed slot.
    formulaInput.value = '1d20+2';
    formulaInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('[data-checks-save]').click();
    await tick();
    await Promise.resolve();
    flushSync();
    assert.ok(
      calls.find((call) => call[0] === 'saveCraftingCheckSimple'),
      'Save persists the routedByIngredients check through the simple slot'
    );
    assert.equal(
      calls.some((call) => call[0] === 'saveCraftingCheckRouted'),
      false,
      'routedByIngredients never saves through the routed slot'
    );
  });

  it('reseeds the crafting-check drafts on a same-system resolution-mode switch across the RI boundary', async () => {
    const calls = [];
    const store = createStore(calls, {
      alchemyResolutionMode: 'routedByIngredients',
      craftingCheck: {
        simple: { rollFormula: '1d20', dc: 14, thresholdMode: 'meet', dcMode: 'static', tiers: [] },
        routed: { rollFormula: '', type: 'relative', relativeOutcomes: [], fixedOutcomes: [] },
      },
    });
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    // Initially routedByIngredients → the simple editor, seeded from the simple slot.
    let craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(craftingPanel.querySelector('[data-simple-check-editor]'));

    // Switch the SAME system to routedByCheck with a persisted routed formula. The
    // reseed guard must re-read both crafting-check slots so the routed editor shows
    // the persisted routed formula (not a stale/empty draft).
    store.viewState.update((state) => ({
      ...state,
      selectedSystem: {
        ...state.selectedSystem,
        resolutionMode: 'routedByCheck',
        craftingCheck: {
          simple: state.selectedSystem.craftingCheck.simple,
          routed: {
            rollFormula: '2d8+1',
            type: 'relative',
            relativeOutcomes: [],
            fixedOutcomes: [],
          },
        },
      },
    }));
    await tick();
    flushSync();

    craftingPanel = target.querySelector('[data-checks-panel="crafting"]');
    assert.ok(
      craftingPanel.querySelector('[data-crafting-check-editor]'),
      'routedByCheck now renders the routed tier editor'
    );
    assert.equal(
      craftingPanel.querySelector('[data-check-roll-formula]').value,
      '2d8+1',
      'the routed draft was reseeded from the persisted routed slot (no data-loss)'
    );
  });

  it('Checks Save is tab-aware: edits and persists the salvage progressive award mode', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          salvageResolutionMode: 'progressive',
          salvageCraftingCheck: {
            enabled: true,
            progressive: { awardMode: 'equal', allowPlayerReorder: true },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    // Switch to the Salvage sub-tab; progressive salvage reuses the crafting
    // progressive editor (formula + crits + award mode).
    await openChecksActivity('salvage');
    await openChecksSection('outcomes');

    const salvageEditor = target.querySelector('[data-progressive-check-editor]');
    assert.ok(salvageEditor, 'progressive salvage shows the progressive editor');
    assert.ok(
      salvageEditor
        .querySelector('[data-award-mode-option="equal"]')
        .classList.contains('is-active'),
      'the selector is seeded from the persisted award mode'
    );

    // The Save button is present but disabled until an edit stages a change.
    assert.ok(
      target.querySelector('[data-checks-save]')?.disabled,
      'the Save button is disabled with no unsaved edits'
    );

    // Change the award mode; the shared (tab-aware) Save button enables.
    salvageEditor.querySelector('[data-award-mode-option="exceed"] input').click();
    await tick();
    flushSync();
    const saveButton = target.querySelector('[data-checks-save]');
    assert.ok(saveButton, 'the Save button is present');
    assert.equal(
      saveButton.disabled,
      false,
      'editing the salvage award mode enables the Save button'
    );

    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();

    // The header Save routes to the SALVAGE seam (not crafting) because the salvage
    // sub-tab is active.
    const saved = calls.find((call) => call[0] === 'saveSalvageCheckProgressive');
    assert.ok(saved, 'Save persists the salvage progressive config through the store');
    assert.equal(saved[1].awardMode, 'exceed', 'the new award mode is sent');
    // Issue 651 retired the system-level reorder flag.
    assert.equal(
      saved[1].allowPlayerReorder,
      undefined,
      'the retired allowPlayerReorder is not sent'
    );
    assert.equal(
      calls.find((call) => call[0] === 'saveCraftingCheckProgressive'),
      undefined,
      'the salvage tab does not call the crafting save seam'
    );
    assert.ok(
      target.querySelector('[data-checks-save]').disabled,
      'saving clears the unsaved state and re-disables the Save button'
    );
  });

  it('Checks carries the progressive PREVIEW SANDBOX through the draft and into the save', async () => {
    // The THIRD allowlist rebuild the progressive block passes through (issue 1097). The
    // manager's normalizer and the store's projection are graded in
    // `tests/progressive-preview-sandbox.test.js`; what this suite grades through the mounted
    // root is `cloneProgressiveCheck`, whose whitelist would otherwise hold the GM's experiment
    // for exactly as long as the panel stayed open and then write a block without it.
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          salvageResolutionMode: 'progressive',
          salvageCraftingCheck: {
            enabled: true,
            progressive: {
              awardMode: 'equal',
              rollFormula: '1d20',
              preview: { difficulties: [6, 9] },
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksActivity('salvage');

    const field = target.querySelector('[data-checks-preview-difficulties]');
    assert.ok(field, 'the sandbox field renders on a progressive route');
    assert.equal(
      field.value,
      '6, 9',
      'the DRAFT clone carried the persisted order; a whitelist that dropped it reads empty'
    );

    // THE FIELD KEEPS THE GM'S OWN TEXT.
    setInputValue(field, '6, 9, 14, x');
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-checks-preview-difficulties]').value,
      '6, 9, 14, x',
      'the half-typed entry survived the order it just wrote upstream'
    );

    setInputValue(field, '14, 6, -2');
    await tick();
    flushSync();

    const saveButton = target.querySelector('[data-checks-save]');
    assert.equal(saveButton.disabled, false, 'a sandbox edit is a real unsaved change');
    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();

    const saved = calls.find((call) => call[0] === 'saveSalvageCheckProgressive');
    assert.ok(saved, 'Save routes the sandbox through the salvage progressive seam');
    assert.deepEqual(
      saved[1].preview.difficulties,
      [14, 6, -2],
      'order preserved and unsorted, negatives kept — the experiment is the GM’s'
    );
    assert.equal(saved[1].rollFormula, '1d20', 'and the rest of the block rode along');
  });

  it('Checks Gathering tab in d100 economy mode renders the read-only card and no editor', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { gatheringResolutionMode: 'd100' }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksActivity('gathering');

    const panel = target.querySelector('[data-checks-panel="gathering"]');
    assert.ok(
      panel.hasAttribute('data-gathering-d100-readonly'),
      'd100 mode renders the read-only card'
    );
    assert.equal(
      panel.querySelector('[data-progressive-check-editor]'),
      null,
      'd100 mode renders no progressive editor'
    );
    assert.equal(
      panel.querySelector('[data-crafting-check-editor]'),
      null,
      'd100 mode renders no routed editor'
    );
    // d100 is the fixed roll: the Active card shows the read-only note, no toggle.
    assert.ok(
      target.querySelector('[data-checks-active="gathering"] [data-checks-active-required]'),
      'd100 gathering shows the read-only required hint'
    );
    assert.equal(
      target.querySelector('[data-checks-active="gathering"] [data-checks-active-toggle]'),
      null,
      'd100 gathering offers no Active toggle'
    );
  });

  it('Checks Gathering tab in progressive economy mode renders the progressive editor and saves', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringResolutionMode: 'progressive',
          gatheringCraftingCheck: {
            enabled: true,
            progressive: { awardMode: 'equal', allowPlayerReorder: true },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksActivity('gathering');
    await openChecksSection('outcomes');

    const panel = target.querySelector('[data-checks-panel="gathering"]');
    assert.ok(
      panel.hasAttribute('data-gathering-d100-readonly') === false,
      'progressive mode is not the read-only card'
    );
    const editor = panel.querySelector('[data-progressive-check-editor]');
    assert.ok(editor, 'progressive gathering shows the progressive editor');
    assert.ok(
      editor.querySelector('[data-award-mode-option="equal"]').classList.contains('is-active'),
      'the editor is seeded from the persisted award mode'
    );

    // The Save button is present but disabled until an edit stages a change.
    assert.ok(
      target.querySelector('[data-checks-save]')?.disabled,
      'the Save button is disabled with no unsaved edits'
    );

    editor.querySelector('[data-award-mode-option="exceed"] input').click();
    await tick();
    flushSync();
    const saveButton = target.querySelector('[data-checks-save]');
    assert.ok(saveButton, 'the Save button is present');
    assert.equal(
      saveButton.disabled,
      false,
      'editing the gathering award mode enables the Save button'
    );

    saveButton.click();
    await tick();
    await Promise.resolve();
    flushSync();

    const saved = calls.find((call) => call[0] === 'saveGatheringCheckProgressive');
    assert.ok(saved, 'Save persists the gathering progressive config through the store');
    assert.equal(saved[1].awardMode, 'exceed', 'the new award mode is sent');
    // Issue 651 retired the system-level reorder flag.
    assert.equal(
      saved[1].allowPlayerReorder,
      undefined,
      'the retired allowPlayerReorder is not sent'
    );
    assert.equal(
      calls.find((call) => call[0] === 'saveSalvageCheckProgressive'),
      undefined,
      'the gathering tab does not call the salvage save seam'
    );
  });

  it('Checks Gathering tab in routed economy mode renders the routed editor without recipe tiers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringResolutionMode: 'routed',
          gatheringCraftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              rollFormula: '2d6',
              relativeOutcomes: [
                { id: 'seed1', name: 'Rich Vein', success: true, breakTools: false, dc: 5 },
              ],
              fixedOutcomes: [],
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksActivity('gathering');

    const panel = target.querySelector('[data-checks-panel="gathering"]');
    const editor = panel.querySelector('[data-crafting-check-editor]');
    assert.ok(editor, 'routed gathering shows the crafting check editor');
    // Routed gathering reuses the crafting editor with recipe tiers hidden
    // (showTiers={false}), like routed salvage.
    assert.equal(
      editor.querySelector('[data-routed-tiers]'),
      null,
      'routed gathering hides the recipe tiers card'
    );
    assert.equal(panel.querySelector('[data-check-roll-formula]').value, '2d6');

    // Editing stages a change that persists via the gathering routed seam.
    const formula = panel.querySelector('[data-check-roll-formula]');
    formula.value = '2d6+1d4';
    formula.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    target.querySelector('[data-checks-save]').click();
    await tick();
    await Promise.resolve();
    flushSync();
    const saved = calls.find((call) => call[0] === 'saveGatheringCheckRouted');
    assert.ok(saved, 'Save persists the gathering routed config through the store');
    assert.equal(saved[1].rollFormula, '2d6+1d4');
  });

  it('offers an Active on/off toggle for the crafting check when resolution is simple', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'simple',
          craftingCheck: { enabled: false },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Checks').click();
    await tick();
    flushSync();

    // Simple mode: the check is optional.
    // and the central column is the singleton page (not the routed editor).
    const toggle = target.querySelector(
      '[data-checks-active="crafting"] [data-checks-active-toggle]'
    );
    assert.ok(toggle, 'optional crafting check shows the Active toggle');
    assert.equal(target.querySelector('[data-checks-active-required]'), null);
    assert.equal(target.querySelector('[data-crafting-check-editor]'), null);

    // IT STAGES rather than persisting on click. Every Active switch in the studio now goes
    // through the shared stage → `Save checks` → applied lifecycle, so one affordance does not
    // mean two different things depending on which route the GM is standing on.
    toggle.click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'saveCraftingCheckActive'),
      [],
      'the click alone writes nothing'
    );

    const save = target.querySelector('[data-checks-save]');
    assert.ok(save && !save.disabled, 'Save checks is enabled by the staged switch');
    save.click();
    await tick();
    flushSync();
    const toggled = calls.find((call) => call[0] === 'saveCraftingCheckActive');
    assert.ok(toggled, 'and Save checks is what persists it');
    assert.equal(toggled[1], true, 'enabling the check sends true');
  });

  it('crafting check editor (relative): formula/DC/comparison, unified triggers, recipe tiers, and outcomes', () => {
    const emitted = [];
    const value = {
      type: 'relative',
      rollFormula: '2d6+1d4',
      dc: 14,
      thresholdMode: 'meet',
      tiers: [],
      checkBreakage: { triggers: [] },
      relativeOutcomes: [
        { id: 'a1b2c3d4ef', name: 'Fail', success: false, breakTools: true, dc: -2 },
      ],
      fixedOutcomes: [
        { id: 'fx1', name: 'Range', success: true, breakTools: false, start: 1, end: 6 },
      ],
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingCheckEditorComponent, {
      target,
      props: { value, onChange: (next) => emitted.push(next) },
    });
    flushSync();

    // Routed mirrors simple: a formula/DC/comparison row and the always-rendered
    // unified trigger editor (replacing the old per-die crit table).
    assert.equal(target.querySelector('[data-check-roll-formula]').value, '2d6+1d4');
    assert.equal(target.querySelector('[data-check-dc]').value, '14');
    assert.ok(target.querySelector('[data-threshold-mode]'), 'the comparison control renders');
    assert.ok(target.querySelector('[data-check-triggers]'), 'the unified trigger editor renders');
    assert.equal(target.querySelector('[data-crit-group]'), null, 'the old crit table is gone');
    // Relative checks expose recipe tiers (DC overrides); fixed checks do not.
    assert.ok(
      target.querySelector('[data-routed-tiers]'),
      'relative mode shows the recipe tiers card'
    );

    // NO COLUMN HEADER ROW (issue 1096). The tier list is the prototype's flex list.
    assert.equal(
      target.querySelector('.manager-checks-outcome-head'),
      null,
      'the tier list carries no column-header row'
    );
    assert.ok(
      Boolean(target.querySelector('.manager-checks-tier-list')),
      'tiers render as the prototype flex list'
    );
    assert.equal(
      target.querySelector('[data-outcome-name]').getAttribute('aria-label'),
      'Name',
      'the name field names itself'
    );
    assert.ok(target.querySelector('[data-outcome-dc]'), 'relative tiers expose a DC field');
    assert.equal(
      target.querySelector('[data-outcome-start]'),
      null,
      'relative tiers do not expose a fixed range'
    );

    // The generated id is kept on the row but never printed (secret).
    const row = target.querySelector('[data-outcome-row]');
    assert.equal(row.getAttribute('data-outcome-id'), 'a1b2c3d4ef');
    assert.ok(!row.textContent.includes('a1b2c3'), 'the secret id is not displayed');

    // A SEGMENTED TOGGLE, not a pill that swaps its own label on click (issue 1096). The
    // pill showed only the state the tier was IN, so a GM could not tell whether the word
    // was a reading or the verb that would change it. Both options are on screen now, and
    // the lit one is the current state.
    const successToggle = target.querySelector('[data-outcome-success]');
    assert.ok(
      successToggle.classList.contains('manager-segmented'),
      'the outcome control is the shared segmented track'
    );
    assert.deepEqual(
      [...successToggle.querySelectorAll('.manager-segment-label')].map((el) =>
        el.textContent.trim()
      ),
      ['Success', 'Failure'],
      'both outcomes are visible, not just the current one'
    );
    const litSegment = successToggle.querySelector('.manager-segment.is-active');
    assert.ok(
      litSegment.textContent.includes('Failure'),
      'the lit segment is the tier’s current state'
    );
    assert.ok(litSegment.classList.contains('is-danger'), 'the failure segment takes the red tint');
    // The per-outcome break-tools pill is hidden under toolSpecific authority.
    assert.equal(
      target.querySelector('[data-outcome-break]'),
      null,
      'the per-outcome break column is hidden under toolSpecific'
    );
    // The radio, not the label: `SegmentedControl` renders real radios and commits on their
    // `change`, which is what makes the track keyboard-operable.
    const successRadio = successToggle.querySelector(
      '[data-outcome-success-option="success"] input'
    );
    successRadio.checked = true;
    successRadio.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(
      emitted.at(-1).relativeOutcomes[0].success,
      true,
      'choosing the Success segment flips the tier'
    );

    // The type selector reuses the resolution radio-option styling.
    target.querySelector('[data-check-type-option="fixed"] input').click();
    assert.equal(emitted.at(-1).type, 'fixed', 'switching type emits the new type');

    // The card's ONE add control, the dashed one at the foot of the list. The head carried a
    // second `[data-add-outcome]` doing the same thing; it was removed on the maintainer's
    // instruction, so this asserts through the control that survived.
    target.querySelector('[data-add-outcome-tier]').click();
    assert.equal(emitted.at(-1).relativeOutcomes.length, 2, 'adding appends a relative tier');
    assert.ok(emitted.at(-1).relativeOutcomes.at(-1).id, 'a new tier is given a generated id');

    target.querySelector('[data-remove-outcome]').click();
    assert.equal(emitted.at(-1).relativeOutcomes.length, 0, 'removing drops the relative tier');
    assert.equal(
      emitted.at(-1).fixedOutcomes.length,
      1,
      'editing relative tiers never touches the independent fixed tiers'
    );
  });

  // ── The ZERO state must offer the way out of itself (issue 1097 follow-up) ─────────────
  for (const [type, key] of [
    ['relative', 'relativeOutcomes'],
    ['fixed', 'fixedOutcomes'],
  ]) {
    it(`crafting check editor (${type}): the add control is reachable with ZERO outcome tiers`, () => {
      const emitted = [];
      const value = {
        type,
        rollFormula: '1d20',
        dc: 12,
        thresholdMode: 'meet',
        tiers: [],
        checkBreakage: { triggers: [] },
        relativeOutcomes: [],
        fixedOutcomes: [],
      };
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(CraftingCheckEditorComponent, {
        target,
        props: { value, onChange: (next) => emitted.push(next) },
      });
      flushSync();

      assert.ok(
        Boolean(target.querySelector('[data-outcomes-empty]')),
        'the empty state states the absence'
      );
      assert.equal(
        target.querySelector('.manager-checks-tier-list'),
        null,
        'and there is no list, which is exactly what used to take the add control with it'
      );
      const add = target.querySelector('[data-add-outcome-tier]');
      assert.ok(
        Boolean(add),
        'an instruction to add tiers must come with the control that adds one'
      );
      // ...and the zero state says NOTHING ELSE. Both of these rendered unconditionally and
      // both are false with no tiers: the strip cannot resolve an empty set, so it fell back
      // to "these tiers leave a gap or overlap" about tiers that do not exist, and the hint
      // invited a GM to drag a band edge on a strip that has no edges. Asserted by ABSENCE
      // because presence is what shipped — a test that only checked the empty sentence and the
      // add control passed with both lies on screen beside them.
      assert.equal(
        target.querySelector('[data-outcome-band-strip]'),
        null,
        'a strip with no bands claims a gap or overlap between tiers that do not exist'
      );
      assert.equal(
        target.querySelector('[data-outcome-band-strip-hint]'),
        null,
        'and the drag hint names an affordance the zero state does not offer'
      );

      add.click();
      flushSync();
      assert.equal(
        emitted.at(-1)[key].length,
        1,
        `pressing it authors the first ${type} tier, so the dead end is genuinely open`
      );
    });
  }

  it('crafting check editor (fixed): bounds the value range and flags overlapping tiers', () => {
    const value = {
      type: 'fixed',
      rollExpression: '1d20',
      relativeOutcomes: [],
      fixedOutcomes: [
        { id: 'id00000001', name: 'Low', success: false, breakTools: false, start: 1, end: 12 },
        { id: 'id00000002', name: 'High', success: true, breakTools: false, start: 10, end: 20 },
      ],
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingCheckEditorComponent, { target, props: { value, onChange: () => {} } });
    flushSync();

    assert.ok(target.querySelector('[data-outcome-start]'), 'fixed tiers expose a range');
    assert.equal(target.querySelector('[data-outcome-dc]'), null, 'fixed tiers hide the DC field');
    assert.equal(
      target.querySelector('[data-expression-range]'),
      null,
      'no value range is computed (the roll may reference actor data)'
    );
    // Inline textual validation moved to the Checks Validation tab.
    assert.equal(
      target.querySelector('[data-checks-validation]'),
      null,
      'the editor no longer renders inline validation messages'
    );
    assert.equal(
      target.querySelectorAll('.manager-checks-tier-row.is-invalid').length,
      2,
      'both overlapping tiers still get the per-row invalid highlight'
    );
  });

  it('crafting check editor: no longer surfaces tier validation inline (moved to the Validation tab)', () => {
    const value = {
      type: 'relative',
      rollFormula: '1d20',
      dc: 15,
      relativeOutcomes: [
        { id: 'id00000001', name: 'Success', success: true, breakTools: false, dc: 0 },
        { id: 'id00000002', name: '   ', success: false, breakTools: false, dc: -5 },
      ],
      fixedOutcomes: [],
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingCheckEditorComponent, { target, props: { value, onChange: () => {} } });
    flushSync();

    // The unnamed-tier (and no-Success) messages are surfaced by the Checks
    // Validation tab now; the editor itself renders no inline validation list.
    assert.equal(
      target.querySelector('[data-checks-validation]'),
      null,
      'the editor no longer renders the inline unnamed-tier validation message'
    );
  });

  it('simple check editor: threshold + comparison, unified triggers, tiers, and macro modes', () => {
    const emitted = [];
    const value = {
      rollFormula: '1d20+@abilities.int.mod',
      dc: 12,
      thresholdMode: 'meet',
      dcMode: 'static',
      tiers: [{ id: 'tier1', name: 'Hard', dc: 18 }],
      macroUuid: null,
      // Two unified triggers: a forced failure and a forced success on the d20 total.
      checkBreakage: {
        triggers: [
          {
            id: 'c1',
            condition: {
              type: 'diceGroup',
              groupId: 0,
              aggregate: 'total',
              operator: '==',
              value: 1,
            },
            outcome: 'failure',
            breakTools: false,
          },
          {
            id: 'c2',
            condition: {
              type: 'diceGroup',
              groupId: 0,
              aggregate: 'total',
              operator: '==',
              value: 20,
            },
            outcome: 'success',
            breakTools: false,
          },
        ],
      },
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(SimpleCraftingCheckEditorComponent, {
      target,
      props: { value, onChange: (next) => emitted.push(next) },
    });
    flushSync();

    assert.ok(target.querySelector('[data-simple-check-editor]'));
    // DC + comparison sit on the formula line.
    assert.equal(target.querySelector('[data-check-dc]').value, '12');
    // The comparison is a SEGMENTED CONTROL now (issue 1096), not a <select>.
    assert.ok(
      target.querySelector('[data-threshold-mode-option="meet"]').classList.contains('is-active'),
      'the meet-or-exceed segment is the lit one'
    );

    // The old crit table is replaced by the always-rendered unified trigger editor.
    assert.equal(target.querySelector('[data-crit-group]'), null, 'the old crit table is gone');
    const triggers = target.querySelector('[data-check-triggers]');
    assert.ok(triggers, 'the unified trigger editor renders');
    assert.equal(triggers.querySelectorAll('[data-trigger]').length, 2, 'both triggers render');
    // Under toolSpecific authority the outcome toggle is available but the break card is not.
    const c2 = openTrigger(triggers, 'c2');
    assert.ok(
      c2.querySelector('[data-trigger-outcome="success"]').classList.contains('is-active'),
      'the success trigger shows the Automatic success segment selected'
    );
    assert.ok(!triggers.querySelector('[data-trigger-break]'), 'no break card under toolSpecific');

    // Choosing a segment emits the new outcome.
    chooseSegment(c2, 'data-trigger-outcome', 'none');
    assert.equal(emitted.at(-1).checkBreakage.triggers.find((t) => t.id === 'c2').outcome, 'none');

    // Add appends a new trigger; remove drops one.
    triggers.querySelector('[data-add-trigger]').click();
    assert.equal(emitted.at(-1).checkBreakage.triggers.length, 3, 'add appends a trigger');
    triggers.querySelector('[data-trigger="c1"] [data-remove-trigger]').click();
    assert.deepEqual(
      emitted.at(-1).checkBreakage.triggers.map((t) => t.id),
      ['c2'],
      'remove drops just that trigger'
    );

    // Static mode shows the tiers table (no macro drop zone).
    assert.equal(target.querySelector('[data-tier-name]').value, 'Hard');
    assert.equal(target.querySelector('[data-check-macro-dropzone]'), null);

    target.querySelector('[data-add-tier]').click();
    assert.equal(emitted.at(-1).tiers.length, 2);
    target.querySelector('[data-remove-tier]').click();
    assert.equal(emitted.at(-1).tiers.length, 0);

    // Switching to dynamic keeps the static fields (non-destructive).
    target.querySelector('[data-dc-mode-option="dynamic"] input').click();
    assert.equal(emitted.at(-1).dcMode, 'dynamic');
    assert.equal(emitted.at(-1).dc, 12, 'shared fields are preserved');
    assert.deepEqual(emitted.at(-1).tiers, value.tiers);
  });

  it('simple check editor: dynamic mode renders a macro drop zone (threshold stays on the formula line)', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(SimpleCraftingCheckEditorComponent, {
      target,
      props: {
        value: {
          rollFormula: '1d20',
          dc: 15,
          thresholdMode: 'meet',
          dcMode: 'dynamic',
          tiers: [],
          macroUuid: null,
          diceCrits: [],
        },
        onChange: () => {},
      },
    });
    flushSync();
    assert.ok(target.querySelector('[data-dynamic-dc]'));
    assert.ok(target.querySelector('[data-check-macro-dropzone]'), 'shows the macro drop zone');
    assert.equal(target.querySelector('[data-tier-name]'), null, 'no tiers table in dynamic mode');
    // The threshold is shared, so it is shown in both modes.
    assert.ok(target.querySelector('[data-check-dc]'));
  });

  it('progressive check editor: formula + unified trigger list only (no DC, comparison, tiers, or macro)', () => {
    const emitted = [];
    const value = {
      awardMode: 'equal',
      rollFormula: '2d6',
      checkBreakage: {
        triggers: [
          {
            id: 'c1',
            condition: {
              type: 'diceGroup',
              groupId: 0,
              aggregate: 'total',
              operator: '==',
              value: 12,
            },
            outcome: 'success',
            breakTools: false,
          },
          {
            id: 'c2',
            condition: {
              type: 'diceGroup',
              groupId: 0,
              aggregate: 'total',
              operator: '==',
              value: 2,
            },
            outcome: 'failure',
            breakTools: false,
          },
        ],
      },
    };
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ProgressiveCraftingCheckEditorComponent, {
      target,
      props: { value, onChange: (next) => emitted.push(next) },
    });
    flushSync();

    assert.ok(target.querySelector('[data-progressive-check-editor]'));
    // Formula field is shared, but the DC + comparison are hidden (no threshold).
    assert.ok(target.querySelector('[data-check-roll-formula]'), 'the formula field renders');
    assert.equal(target.querySelector('[data-check-dc]'), null, 'no DC field');
    assert.equal(target.querySelector('[data-threshold-mode]'), null, 'no comparison control');
    // No DC-source radios, recipe tiers, or macro drop zone.
    assert.equal(target.querySelector('[data-dc-mode-option]'), null);
    assert.equal(target.querySelector('[data-tier-name]'), null);
    assert.equal(target.querySelector('[data-check-macro-dropzone]'), null);

    // The unified trigger list renders. In the progressive (numeric) context the
    // outcome toggle is relabelled award-all/award-none rather than success/failure.
    const triggers = target.querySelector('[data-check-triggers]');
    assert.ok(triggers, 'the unified trigger editor renders');
    const c1Triggers = openTrigger(triggers, 'c1');
    assert.ok(
      c1Triggers.querySelector('[data-trigger-outcome="success"]').classList.contains('is-active'),
      'the success trigger selects the award-all segment'
    );
    const optionLabels = [...c1Triggers.querySelectorAll('[data-trigger-outcome]')].map(
      (b) => b.textContent
    );
    assert.ok(
      optionLabels.some((label) => label.includes('Award all')),
      'success reads "Award all"'
    );
    assert.ok(
      optionLabels.some((label) => label.includes('Award none')),
      'failure reads "Award none"'
    );
    // Default toolSpecific authority hides the per-trigger break card.
    assert.ok(!triggers.querySelector('[data-trigger-break]'), 'no break card under toolSpecific');

    // The award-mode selector renders, defaults to equal, and emits the chosen mode.
    const awardCard = target.querySelector('[data-award-mode]');
    assert.ok(awardCard, 'the award-mode card renders');
    assert.ok(
      awardCard.querySelector('[data-award-mode-option="equal"]').classList.contains('is-active'),
      'equal is the default award mode'
    );
    awardCard.querySelector('[data-award-mode-option="partial"] input').click();
    assert.equal(emitted.at(-1).awardMode, 'partial', 'selecting an award mode emits it');

    // Editing a trigger outcome preserves the carried award settings.
    chooseSegment(c1Triggers, 'data-trigger-outcome', 'none');
    assert.equal(
      emitted.at(-1).checkBreakage.triggers.find((t) => t.id === 'c1').outcome,
      'none',
      'choosing a segment emits the new outcome'
    );
    assert.equal(
      emitted.at(-1).awardMode,
      'equal',
      'award settings are preserved on a trigger edit'
    );
  });

  // Tool-breakage authority UI (issue 419 recombine). Each editor accepts a
  // `breakageAuthority` prop and ALWAYS renders the unified CheckTriggers editor; the
  // per-trigger break-tools pill (and the routed per-outcome break column) is shown
  // ONLY under `checkDriven`. Mount an editor with a given authority and return the
  // emitted patches so each assertion stays DRY.
  function mountCheckEditor(EditorComponent, value, breakageAuthority, extraProps = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    const emitted = [];
    mounted = mount(EditorComponent, {
      target,
      props: {
        value,
        breakageAuthority,
        onChange: (next) => emitted.push(next),
        ...extraProps,
      },
    });
    flushSync();
    return emitted;
  }

  // The outcome toggle and the tier-step mode control are SegmentedControls (issue
  // 975): the real control is the visually hidden radio, the `<label>` segment is only
  // the styled surface. Set `.checked`, then dispatch a bubbling `change`.
  function chooseSegment(root, optionDataAttr, value) {
    const radio = root.querySelector(`[${optionDataAttr}="${value}"] input[type="radio"]`);
    assert.ok(radio, `a radio exists for ${optionDataAttr}="${value}"`);
    radio.checked = true;
    radio.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    flushSync();
    return radio;
  }

  // A trigger's controls sit behind a disclosure (issue 1096).
  function openTrigger(root, id) {
    const disclosure = root.querySelector(`[data-trigger-disclosure="${id}"]`);
    assert.ok(Boolean(disclosure), `the head of trigger ${id} renders`);
    disclosure.click();
    flushSync();
    const card = root.querySelector(`[data-trigger="${id}"]`);
    assert.ok(
      Boolean(card.querySelector(`[data-trigger-body="${id}"]`)),
      `the head of trigger ${id} opens its body`
    );
    return card;
  }

  /** Open the FIRST trigger a container renders, for cases that do not name one. */
  function openFirstTrigger(root) {
    const first = root.querySelector('[data-trigger]');
    assert.ok(Boolean(first), 'at least one trigger renders');
    return openTrigger(root, first.getAttribute('data-trigger'));
  }

  const breakageTriggers = {
    triggers: [
      {
        id: 'c1',
        condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
        outcome: 'failure',
        breakTools: false,
        tierStep: { mode: 'none', steps: 1, tierId: null },
      },
    ],
  };
  const simpleBreakageValue = {
    rollFormula: '1d20',
    dc: 12,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    checkBreakage: breakageTriggers,
  };
  const progressiveBreakageValue = {
    awardMode: 'equal',
    rollFormula: '2d6',
    checkBreakage: {
      triggers: [
        {
          id: 'c1',
          condition: {
            type: 'diceGroup',
            groupId: 0,
            aggregate: 'total',
            operator: '==',
            value: 2,
          },
          outcome: 'failure',
          breakTools: false,
        },
      ],
    },
  };
  const routedBreakageValue = {
    type: 'relative',
    rollFormula: '1d20',
    dc: 14,
    thresholdMode: 'meet',
    tiers: [],
    checkBreakage: breakageTriggers,
    relativeOutcomes: [{ id: 'o1', name: 'Success', success: true, breakTools: false, dc: 0 }],
    fixedOutcomes: [],
  };

  // The unified trigger editor is ALWAYS rendered, regardless of authority.
  const breakageEditorCases = [
    {
      name: 'simple',
      component: () => SimpleCraftingCheckEditorComponent,
      value: () => simpleBreakageValue,
    },
    {
      name: 'progressive',
      component: () => ProgressiveCraftingCheckEditorComponent,
      value: () => progressiveBreakageValue,
    },
    {
      name: 'routed',
      component: () => CraftingCheckEditorComponent,
      value: () => routedBreakageValue,
    },
  ];
  for (const editorCase of breakageEditorCases) {
    it(`${editorCase.name} check editor: renders the unified triggers with no break pill under toolSpecific`, () => {
      mountCheckEditor(editorCase.component(), editorCase.value(), 'toolSpecific');
      const triggers = target.querySelector('[data-check-triggers]');
      assert.ok(triggers, 'the unified trigger editor renders under toolSpecific authority');
      const card = openFirstTrigger(triggers);
      // The outcome toggle is always available (forcing works under both authorities).
      assert.ok(
        card.querySelector('[data-trigger-outcome]'),
        'the outcome toggle renders under toolSpecific'
      );
      // The break-tools card is gated off under toolSpecific.
      assert.ok(
        !card.querySelector('[data-trigger-break]'),
        'the per-trigger break card is hidden under toolSpecific'
      );
      // The free-text label input is gone entirely.
      assert.ok(
        !triggers.querySelector('[data-breakage-trigger-label]'),
        'no trigger label input remains'
      );
    });

    it(`${editorCase.name} check editor: renders the unified triggers WITH the break pill under checkDriven`, () => {
      mountCheckEditor(editorCase.component(), editorCase.value(), 'checkDriven');
      const triggers = target.querySelector('[data-check-triggers]');
      assert.ok(triggers, 'the unified trigger editor renders under checkDriven authority');
      const card = openFirstTrigger(triggers);
      assert.ok(
        card.querySelector('[data-trigger-outcome]'),
        'the outcome toggle renders under checkDriven'
      );
      assert.ok(
        card.querySelector('[data-trigger-break]'),
        'the per-trigger break card renders under checkDriven'
      );
    });
  }

  it('routed check editor: shows the per-outcome break-tools column only under checkDriven', () => {
    mountCheckEditor(CraftingCheckEditorComponent, routedBreakageValue, 'toolSpecific');
    assert.equal(
      target.querySelector('[data-outcome-break]'),
      null,
      'the per-outcome break-tools pill is hidden under toolSpecific'
    );

    if (mounted) unmount(mounted);
    target.remove();
    mountCheckEditor(CraftingCheckEditorComponent, routedBreakageValue, 'checkDriven');
    assert.ok(
      target.querySelector('[data-outcome-break]'),
      'the per-outcome break-tools pill renders under checkDriven'
    );
  });

  it('check triggers editor: Add seeds a default trigger and the break pill toggles breakTools', () => {
    const emitted = mountCheckEditor(
      SimpleCraftingCheckEditorComponent,
      {
        ...simpleBreakageValue,
        checkBreakage: {
          triggers: [
            {
              id: 'c1',
              condition: { type: 'rollTotal', operator: '<=', value: 3 },
              outcome: 'none',
              breakTools: true,
            },
          ],
        },
      },
      'checkDriven'
    );
    // Add appends a new default trigger (controlled component: the DOM reflects the
    // value prop, not the emit, so the new trigger is asserted on the emitted block).
    target.querySelector('[data-add-trigger]').click();
    flushSync();
    const added = emitted.at(-1).checkBreakage.triggers;
    assert.equal(added.length, 2, 'adding appends a trigger');
    assert.equal(added[1].outcome, 'none', 'a new trigger forces no outcome by default');
    assert.equal(
      added[1].breakTools,
      true,
      'a new trigger breaks tools by default under checkDriven'
    );

    // The existing trigger's break card renders (checkDriven) and its switch toggles breakTools.
    const breakSwitch = openTrigger(target, 'c1').querySelector('[data-trigger-break]');
    assert.ok(breakSwitch, 'the break card renders under checkDriven');
    breakSwitch.click();
    flushSync();
    assert.equal(
      emitted.at(-1).checkBreakage.triggers.find((t) => t.id === 'c1').breakTools,
      false,
      'clicking the break switch toggles breakTools off'
    );
  });

  it('check triggers editor: disables the forcing segments for an outcomeTier condition', () => {
    mountCheckEditor(
      CraftingCheckEditorComponent,
      {
        ...routedBreakageValue,
        checkBreakage: {
          triggers: [
            {
              id: 't1',
              condition: { type: 'outcomeTier', tierIds: ['o1'], outcomeKeys: [] },
              outcome: 'none',
              breakTools: true,
              tierStep: { mode: 'none', steps: 1, tierId: null },
            },
          ],
        },
      },
      'checkDriven'
    );
    const tierTrigger = openTrigger(target, 't1');
    const successSeg = tierTrigger.querySelector('[data-trigger-outcome="success"]');
    const noneSeg = tierTrigger.querySelector('[data-trigger-outcome="none"]');
    assert.ok(successSeg, 'the outcome toggle renders for an outcomeTier trigger');
    // Disabled on the RADIO, which is what actually prevents the choice.
    assert.ok(
      successSeg.querySelector('input[type="radio"]').disabled,
      'an outcomeTier condition disables the forcing segments'
    );
    assert.ok(noneSeg.classList.contains('is-active'), 'the outcome is pinned to No effect');
    // Stepping is deliberately NOT pinned.
    assert.equal(
      tierTrigger.querySelector('[data-trigger-tier-step-mode="up"] input[type="radio"]').disabled,
      false,
      'an outcomeTier condition can still drive a tier step'
    );
  });

  // `activity` is a PROP now (issue 1096): the four activities became rail routes.
  function mountChecksView(props, section = '') {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(ChecksViewComponent, {
      target,
      props: {
        activity: 'crafting',
        resolutionMode: 'simple',
        craftingCheckSimple: simpleBreakageValue,
        ...props,
      },
    });
    flushSync();
    if (section) selectChecksSection(section);
  }

  function selectChecksSection(section) {
    const button = target.querySelector(`#checks-section-${section}`);
    assert.ok(button, `the section strip should offer "${section}"`);
    button.click();
    flushSync();
  }

  it('checks view: a checkDriven crafting editor shows the break pill; the gathering tab is hidden when gathering is off', () => {
    mountChecksView(
      {
        breakageAuthority: 'checkDriven',
        features: { gathering: false },
        gatheringResolutionMode: 'routed',
        gatheringCheckRouted: routedBreakageValue,
      },
      'triggers'
    );
    // Crafting (always on) honours the system authority and shows the break card.
    const craftingTriggers = target.querySelector('[data-check-triggers]');
    assert.ok(craftingTriggers, 'crafting editor renders the unified triggers');
    assert.ok(
      openFirstTrigger(craftingTriggers).querySelector('[data-trigger-break]'),
      'crafting break card renders under checkDriven authority'
    );

    // Gathering is an opt-in feature: with it off.
    assert.equal(
      target.querySelector('[data-checks-nav-item="gathering"]'),
      null,
      'the gathering tab is hidden when the gathering feature is off'
    );
  });

  it('checks view: the gathering tab is offered when the gathering feature is on', () => {
    mountChecksView({
      breakageAuthority: 'toolSpecific',
      features: { gathering: true },
      gatheringResolutionMode: 'routed',
      gatheringCheckRouted: routedBreakageValue,
    });
    // The feature GATE moved out of this view and into the rail model (issue 1096).
    assert.ok(
      !target.querySelector('[data-checks-nav-item="gathering"]'),
      'the four activities are rail children now; this view renders one of them'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    mountChecksView({
      activity: 'gathering',
      breakageAuthority: 'toolSpecific',
      features: { gathering: true },
      gatheringResolutionMode: 'routed',
      gatheringCheckRouted: routedBreakageValue,
    });
    assert.ok(
      target.querySelector('[data-checks-panel="gathering"]'),
      'the gathering panel renders when the router opens the gathering route'
    );
  });

  it('checks view: the modifier card renders when the check is usable and emits SELECTION edits (issues 770, 1117)', () => {
    const patches = [];
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
        craftingDefaultModifierPolicy: 'highest',
        craftingDefaultModifierIds: ['med'],
        onUpdateCraftingCheckModifiers: (patch) => patches.push(patch),
      },
      'modifiers'
    );
    const card = target.querySelector('[data-crafting-modifier-catalogue]');
    assert.ok(card, 'the modifier card renders in the crafting stack when a formula is authored');
    // THE RULE GRID IS ITS OWN CARD since issue 1096's parity round.
    const ruleCard = target.querySelector('[data-crafting-modifier-policy-card]');
    assert.ok(ruleCard, 'the combination rule renders as its own card beside the library');
    // The policy radio-cards reflect the passed default policy.
    assert.equal(
      ruleCard.querySelector('[data-crafting-modifier-policy-option="highest"] input').checked,
      true,
      'the default policy is pinned on the radio-cards'
    );
    // Switching policy emits a defaultModifierPolicy patch.
    ruleCard.querySelector('[data-crafting-modifier-policy-option="addAll"] input').click();
    flushSync();
    assert.ok(
      patches.some((p) => p.defaultModifierPolicy === 'addAll'),
      'selecting a policy radio emits defaultModifierPolicy'
    );
    // The Phase-2 "Player picks" policy renders as a fourth radio and emits (issue 770 P2).
    const playerPicksOption = ruleCard.querySelector(
      '[data-crafting-modifier-policy-option="playerPicks"] input'
    );
    assert.ok(playerPicksOption, 'the playerPicks policy radio renders');
    playerPicksOption.click();
    flushSync();
    assert.ok(
      patches.some((p) => p.defaultModifierPolicy === 'playerPicks'),
      'selecting playerPicks emits defaultModifierPolicy'
    );
    // NO ENTRY AUTHORING, ON ANY ACTIVITY (issue 1117). The library is authored once.
    for (const editorHook of [
      '[data-crafting-modifier-add]',
      '[data-crafting-modifier-field="expression"]',
      '[data-crafting-modifier-field="icon"]',
      '[data-crafting-modifier-remove]',
    ]) {
      assert.ok(!card.querySelector(editorHook), `${editorHook} is authoring, not selection`);
    }
    assert.ok(
      Boolean(card.querySelector('[data-crafting-modifier-edit-link]')),
      'the deep link to the one authoring surface renders instead'
    );
    // The entry is READ OUT instead — identity and expression.
    assert.equal(
      card.querySelector('[data-crafting-modifier-readonly="label"]').textContent.trim(),
      'Medicine'
    );
    assert.equal(
      card.querySelector('[data-crafting-modifier-readonly="expression"]').textContent.trim(),
      '@abilities.med.mod'
    );
    // The eligibility state is authored PER ROW (issue 1095).
    const eligibility = card.querySelector('[data-crafting-modifier-eligibility="med"]');
    assert.ok(eligibility, 'each catalogue row carries its own eligibility control');
    assert.equal(eligibility.tagName, 'BUTTON', 'the accessible CONTROL is the pill itself');
    assert.equal(
      eligibility.getAttribute('aria-pressed'),
      'true',
      'the eligible entry reads as on'
    );
    // Nothing interactive NESTS: an interactive control inside an interactive one lands DOM the
    // browser did not build as authored, and a half-finished conversion is exactly how a stray
    // checkbox would survive inside the pill.
    assert.ok(
      !eligibility.querySelector('input, button, a'),
      'the pill contains no second control — it IS the control'
    );
    eligibility.click();
    flushSync();
    assert.ok(
      patches.some((p) => Array.isArray(p.defaultModifierIds) && p.defaultModifierIds.length === 0),
      'switching an entry off emits an empty defaultModifierIds set'
    );
  });

  // Every choice group in the Checks editors now renders through the shared
  // RadioCardGroup primitive (issue 855), which only draws the icon tile when the
  // option supplies an `icon`. An option list that loses its icons still renders,
  // still emits, and still passes every behavioural test above — the card just goes
  // blank. Walk the four remaining groups and assert the tile per option.
  it('checks view: every check choice group renders an icon tile per option (issue 855)', () => {
    const groups = [
      {
        props: { resolutionMode: 'routedByCheck', craftingCheck: routedBreakageValue },
        attr: 'data-check-type-option',
        section: 'outcomes',
        values: ['relative', 'fixed'],
      },
      {
        props: { resolutionMode: 'simple', craftingCheckSimple: simpleBreakageValue },
        attr: 'data-dc-mode-option',
        section: 'roll',
        values: ['static', 'dynamic'],
      },
      {
        props: {
          resolutionMode: 'progressive',
          craftingCheckProgressive: { rollFormula: '1d20', awardMode: 'equal' },
        },
        attr: 'data-award-mode-option',
        section: 'outcomes',
        values: ['equal', 'partial', 'exceed'],
      },
      {
        // `simple`, not `none`: `routeIsOff` answers from `alchemyCheckMode` directly.
        props: { resolutionMode: 'alchemy', alchemyCheckMode: 'simple' },
        attr: 'data-crafting-alchemy-checkmode-option',
        section: 'roll',
        values: ['simple', 'tiered'],
      },
    ];
    for (const group of groups) {
      mountChecksView(group.props, group.section);
      const options = [...target.querySelectorAll(`[${group.attr}]`)];
      assert.deepEqual(
        options.map((option) => option.getAttribute(group.attr)),
        group.values,
        `${group.attr} still lists its options in authoring order`
      );
      for (const option of options) {
        assert.ok(
          Boolean(option.querySelector('[data-tool-choice-icon] i')),
          `${group.attr}="${option.getAttribute(group.attr)}" renders an icon tile`
        );
      }
      unmount(mounted);
      mounted = null;
      target.remove();
    }
  });

  // The check-modifier RULE group is rendered through the shared RadioCardGroup primitive
  // (issues 855, 1055), and its hook attributes are a hand-maintained mirror:
  it('checks view: the modifier rule group keeps its capture-harness hooks and shows an icon per option (issues 855, 1055)', () => {
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
        craftingDefaultModifierPolicy: 'bySubject',
      },
      'modifiers'
    );
    // SCOPED TO THE RULE CARD, not the library card.
    const group = target.querySelector(
      '[data-crafting-modifier-policy-card] [data-crafting-modifier-policy]'
    );
    assert.ok(Boolean(group), 'the group still resolves by [data-crafting-modifier-policy]');
    const options = [...group.querySelectorAll('[data-crafting-modifier-policy-option]')];
    assert.deepEqual(
      options.map((option) => option.getAttribute('data-crafting-modifier-policy-option')),
      ['addAll', 'highest', 'bySubject', 'playerPicks'],
      'every option carries the per-option hook, in authoring order'
    );
    for (const option of options) {
      const value = option.getAttribute('data-crafting-modifier-policy-option');
      assert.ok(
        Boolean(option.querySelector('[data-tool-choice-icon] i')),
        `the ${value} card renders an icon tile`
      );
      assert.ok(
        Boolean(option.querySelector('input[type="radio"]')),
        `the ${value} card is still driven by a real radio input`
      );
    }
    assert.equal(
      target.querySelector('[data-crafting-modifier-policy-option="bySubject"] input').checked,
      true,
      'the passed rule is pinned on the radio-cards'
    );
    // The maintainer asked for TWO columns, and the count is the layout.
    assert.match(
      group.querySelector('.manager-resolution-mode-options').getAttribute('style') || '',
      /--manager-radio-card-columns:\s*2/,
      'the rule group is a 2x2 grid, not a four-across row'
    );
  });

  // The pick cap (issue 1055). `data-crafting-modifier-max-picks` carries the READING —
  // `"unlimited"` or the integer as a string — so the View Lab and the smoke harness can
  // both assert which of the two states is on screen without parsing the input.
  it('checks view: the pick cap renders only under a SELECTING rule, and states unlimited as a blank field', () => {
    const props = {
      resolutionMode: 'simple',
      craftingCheckSimple: { rollFormula: '1d20 + 4' },
      modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
    };
    // A cap on a selection nobody makes is a control with no effect.
    for (const craftingDefaultModifierPolicy of ['addAll', 'highest']) {
      mountChecksView(
        { ...props, craftingDefaultModifierPolicy, craftingMaxModifierPicks: 2 },
        'modifiers'
      );
      assert.ok(
        !target.querySelector('[data-crafting-modifier-max-picks]'),
        `${craftingDefaultModifierPolicy} selects nothing, so it shows no cap field`
      );
    }
    for (const craftingDefaultModifierPolicy of ['bySubject', 'playerPicks']) {
      mountChecksView(
        { ...props, craftingDefaultModifierPolicy, craftingMaxModifierPicks: null },
        'modifiers'
      );
      const field = target.querySelector('[data-crafting-modifier-max-picks]');
      assert.ok(
        Boolean(field),
        `${craftingDefaultModifierPolicy} defers the selection, so it caps`
      );
      assert.equal(
        field.getAttribute('data-crafting-modifier-max-picks'),
        'unlimited',
        'an absent cap reads as unlimited rather than as a magic number'
      );
      const input = field.querySelector('[data-crafting-modifier-max-picks-input]');
      assert.ok(Boolean(input), 'the Stepper input carries its own hook');
      assert.equal(input.value, '', 'unlimited is a BLANK field, not a 0 or a 1');
      assert.match(
        input.getAttribute('placeholder') || '',
        /Unlimited/,
        'and the placeholder is the only place that reading is stated'
      );
    }
  });

  // CLEARING the field is a real edit.
  it('checks view: emptying the pick-cap Stepper patches a null cap, not an omission (issue 1055)', () => {
    const patches = [];
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
        craftingDefaultModifierPolicy: 'playerPicks',
        craftingMaxModifierPicks: 3,
        onUpdateCraftingCheckModifiers: (patch) => patches.push(patch),
      },
      'modifiers'
    );
    const input = target.querySelector('[data-crafting-modifier-max-picks-input]');
    assert.equal(input.value, '3', 'the authored cap is in the field before it is cleared');
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    // `null`, not a missing key: the store spreads this patch onto the persisted check.
    assert.deepEqual(
      patches,
      [{ maxModifierPicks: null }],
      'clearing the field must overwrite the stored cap with the value that means unlimited'
    );
  });

  it('checks view: an authored cap is rendered on the hook and in the Stepper', () => {
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
        craftingDefaultModifierPolicy: 'playerPicks',
        craftingMaxModifierPicks: 1,
      },
      'modifiers'
    );
    const field = target.querySelector('[data-crafting-modifier-max-picks]');
    assert.equal(field.getAttribute('data-crafting-modifier-max-picks'), '1');
    assert.equal(field.querySelector('[data-crafting-modifier-max-picks-input]').value, '1');
    // A stored value the ENGINE reads as unlimited must not render as a cap that
    // truncates nothing: the field routes through `resolveMaxModifierPicks`, so `0` and
    // `-2` both come back as the blank unlimited state.
    for (const junk of [0, -2, 2.5]) {
      mountChecksView(
        {
          resolutionMode: 'simple',
          craftingCheckSimple: { rollFormula: '1d20 + 4' },
          modifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
          craftingDefaultModifierPolicy: 'playerPicks',
          craftingMaxModifierPicks: junk,
        },
        'modifiers'
      );
      assert.equal(
        target
          .querySelector('[data-crafting-modifier-max-picks]')
          .getAttribute('data-crafting-modifier-max-picks'),
        'unlimited',
        `a stored ${junk} is unlimited to the engine, so the field says so too`
      );
    }
  });

  // Retargeted from "the card is hidden when the check has no formula" (issue 770). The
  // card is now rendered in that state ON PURPOSE (issue 1055 criterion 10): hiding it
  // reported nothing about a catalogue that reaches no roll, which is the defect the
  // card must state rather than conceal. It stamps WHICH of the three causes applies.
  it('checks view: the modifier catalogue card renders an inert notice naming the cause when the check has no formula (issue 1055)', () => {
    // A non-empty catalogue is part of the fixture, not incidental.
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '' },
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
      },
      'modifiers'
    );
    const card = target.querySelector('[data-crafting-modifier-catalogue]');
    assert.ok(Boolean(card), 'a formula-less check still shows the catalogue, with a warning');
    const notice = card.querySelector('[data-crafting-modifier-inert]');
    assert.ok(Boolean(notice), 'the inert notice renders');
    assert.equal(
      notice.getAttribute('data-crafting-modifier-inert'),
      'noFormula',
      'and names WHICH cause applies — one boolean cannot carry three remedies'
    );
  });

  // The other half of that gate, and the reason it exists.
  it('checks view: an EMPTY catalogue shows no inert notice even when the cause applies (issue 1055)', () => {
    const props = { resolutionMode: 'simple', craftingCheckSimple: { rollFormula: '' } };
    mountChecksView({ ...props, modifiers: [] }, 'modifiers');
    assert.ok(
      Boolean(target.querySelector('[data-crafting-modifier-empty]')),
      'the empty catalogue renders its empty state'
    );
    assert.ok(
      !target.querySelector('[data-crafting-modifier-inert]'),
      'an empty catalogue has no modifiers to warn about, so the notice stays away'
    );

    unmount(mounted);
    mounted = null;
    target.remove();
    // Same cause, one modifier: the notice appears and still names the cause.
    mountChecksView(
      {
        ...props,
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
      },
      'modifiers'
    );
    const notice = target.querySelector('[data-crafting-modifier-inert]');
    assert.ok(Boolean(notice), 'one authored modifier is enough to make the notice worth showing');
    assert.equal(
      notice.getAttribute('data-crafting-modifier-inert'),
      'noFormula',
      'and the cause is unchanged by the catalogue gate'
    );
  });

  // Issue 1094 retired the THIRD cause. `noPlaceholder`.
  it('checks view: the inert cause discriminates no-check from no-formula (issues 1055, 1094)', () => {
    // Every case below carries a non-empty catalogue: the notice is gated on one.
    const catalogue = [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }];
    // ALCHEMY `none` NO LONGER APPEARS HERE. It used to be this test's `noCheck` case.
    for (const { props, cause } of [
      {
        props: { resolutionMode: 'simple', craftingCheckSimple: { rollFormula: '  ' } },
        cause: 'noFormula',
      },
    ]) {
      mountChecksView({ ...props, modifiers: catalogue }, 'modifiers');
      const notice = target.querySelector('[data-crafting-modifier-inert]');
      assert.ok(Boolean(notice), `${cause}: an inert notice renders`);
      assert.equal(notice.getAttribute('data-crafting-modifier-inert'), cause);
      unmount(mounted);
      mounted = null;
      target.remove();
    }
    // …and an ORDINARY authored formula.
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: catalogue,
      },
      'modifiers'
    );
    assert.ok(
      !target.querySelector('[data-crafting-modifier-inert]'),
      'an authored formula is never inert: the modifiers are appended to it'
    );
    unmount(mounted);
    mounted = null;
    target.remove();

    // The alchemy OFF route: no Modifiers section at all, so no inert notice.
    mountChecksView(
      {
        resolutionMode: 'alchemy',
        alchemyCheckMode: 'none',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: catalogue,
      },
      'roll'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"][data-checks-off]'),
      'a switched-off alchemy check collapses to the turn-on panel'
    );
    assert.ok(
      !target.querySelector('[data-crafting-modifier-inert]'),
      'and carries no inert-modifier notice, because it renders no Modifiers section'
    );
  });

  // Gathering d100 is the one activity+mode where "this resolution mode rolls no check" is
  // FALSE: the d100 rolled against each drop's chance IS the check. What it lacks is a seam
  // to add modifiers to. It reported `noCheck` — telling the GM the mode rolls nothing and
  // to switch to one that rolls, when the two gathering modes that take modifiers are the
  // ones rendered disabled. Both halves below fail against that component.
  it('checks view: gathering d100 names the missing MODIFIER SUPPORT, not a missing check', () => {
    mountChecksView(
      {
        activity: 'gathering',
        features: { gathering: true },
        gatheringResolutionMode: 'd100',
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
        gatheringDefaultModifierIds: ['med'],
      },
      'modifiers'
    );
    const notice = target.querySelector('[data-crafting-modifier-inert]');
    assert.ok(Boolean(notice), 'a selection that reaches no roll is still reported');
    assert.equal(
      notice.getAttribute('data-crafting-modifier-inert'),
      'noModifierSupport',
      'the cause is the absent modifier seam, not an absent check'
    );
    assert.ok(
      !/rolls no check/i.test(notice.textContent),
      'the d100 IS this mode’s check, so the sentence must not deny that it rolls one'
    );
  });

  it('checks view: an unstamped system shows the rule the ENGINE would apply, not a blank group (issue 1055)', () => {
    mountChecksView(
      {
        resolutionMode: 'simple',
        craftingCheckSimple: { rollFormula: '1d20 + 4' },
        modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
        // No `craftingDefaultModifierPolicy` at all — the never-authored state.
      },
      'modifiers'
    );
    const checked = [...target.querySelectorAll('[data-crafting-modifier-policy-option]')].filter(
      (option) => option.querySelector('input').checked
    );
    assert.equal(checked.length, 1, 'exactly one rule is shown as selected');
    assert.equal(
      checked[0].getAttribute('data-crafting-modifier-policy-option'),
      'addAll',
      'absence resolves as addAll — the rule the engine applies to an unasked system'
    );
  });

  // What marking an entry MEANS depends on the rule.
  it('checks view: the default-set intro follows the combination rule (issue 1055)', () => {
    const introText = (craftingDefaultModifierPolicy) => {
      mountChecksView(
        {
          resolutionMode: 'simple',
          craftingCheckSimple: { rollFormula: '1d20 + 4' },
          modifiers: [{ id: 'med', label: 'Medicine', expression: '@abilities.med.mod' }],
          craftingDefaultModifierPolicy,
        },
        'modifiers'
      );
      const text = target.querySelector('#manager-crafting-modifier-eligibility-intro').textContent;
      unmount(mounted);
      mounted = null;
      target.remove();
      return text;
    };
    assert.ok(
      introText('bySubject').includes('the recipe may choose from'),
      'under By recipe the sentence names the RECORD that does the choosing'
    );
    assert.ok(
      introText('playerPicks').includes('the player may choose from'),
      'under Player picks it names the PLAYER — the same sentence, a different chooser'
    );
    assert.ok(
      introText('highest').includes('only the largest of them is added'),
      'under Highest it states the reduction, because marking an entry enters it into a comparison'
    );
    for (const locked of ['addAll', 'highest']) {
      assert.ok(
        !introText(locked).includes('may choose from'),
        `at ${locked} nobody chooses, so the sentence must not promise a control that is not there`
      );
    }
  });

  it('the routed editor renders the tier-step row in BOTH tier types', () => {
    // The check-wide natural-stepping boolean and its card are gone (issue 975):
    mountCheckEditor(CraftingCheckEditorComponent, routedBreakageValue, 'toolSpecific');
    assert.ok(
      openTrigger(target, 'c1').querySelector('[data-trigger-tier-step]'),
      'a relative routed check offers the per-trigger tier step'
    );

    unmount(mounted);
    target.remove();
    mounted = null;
    target = null;
    mountCheckEditor(
      CraftingCheckEditorComponent,
      { ...routedBreakageValue, type: 'fixed' },
      'toolSpecific'
    );
    assert.ok(
      openTrigger(target, 'c1').querySelector('[data-trigger-tier-step]'),
      'a FIXED routed check offers it too — stepping is no longer type-scoped'
    );
  });

  it('offers tier stepping on routed crafting, salvage AND gathering', () => {
    // The old toggle was absent for gathering entirely; the per-trigger effect is not.
    // One ROUTE at a time now (issue 1096): the view renders the activity the router hands
    // it, so the three activities are three mounts rather than three clicks. The claim is
    // unchanged — every one of them offers the per-trigger tier step.
    for (const activity of ['crafting', 'salvage', 'gathering']) {
      mountChecksView(
        {
          activity,
          resolutionMode: 'routedByCheck',
          craftingCheck: routedBreakageValue,
          salvageResolutionMode: 'routed',
          salvageCheckRouted: routedBreakageValue,
          gatheringResolutionMode: 'routed',
          gatheringCheckRouted: routedBreakageValue,
          features: { salvage: true, gathering: true },
        },
        'triggers'
      );
      assert.ok(
        openFirstTrigger(
          target.querySelector(`[data-checks-panel="${activity}"] [data-check-triggers]`)
        ).querySelector('[data-trigger-tier-step]'),
        `${activity} offers the per-trigger tier step`
      );
      unmount(mounted);
      mounted = null;
      target.remove();
    }
  });

  it('carries an authored tierStep through the root draft and into the Save payload', async () => {
    // The allowlist trap: `cloneCheckBreakage` rebuilds each trigger key by key.
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          alchemyResolutionMode: 'routedByCheck',
          craftingCheck: {
            routed: {
              ...routedBreakageValue,
              checkBreakage: {
                triggers: [
                  {
                    ...breakageTriggers.triggers[0],
                    tierStep: { mode: 'target', steps: 2, tierId: 'o1' },
                  },
                ],
              },
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksSection('triggers');

    const card = openTrigger(target, 'c1');
    assert.ok(
      card.querySelector('[data-trigger-tier-step-mode="target"]').classList.contains('is-active'),
      'cloneCheckBreakage reads the persisted tierStep back into the draft'
    );
    assert.equal(
      selectTriggerText(target, '[data-trigger="c1"] [data-trigger-tier-step-target]'),
      'Success',
      'and the authored target tier survives the clone'
    );

    chooseSegment(card, 'data-trigger-tier-step-mode', 'down');
    await tick();
    flushSync();
    target.querySelector('[data-checks-save]').click();
    await tick();
    await Promise.resolve();
    flushSync();

    const saved = calls.find((call) => call[0] === 'saveCraftingCheckRouted');
    assert.deepEqual(
      saved?.[1]?.checkBreakage?.triggers?.[0]?.tierStep,
      { mode: 'down', steps: 2, tierId: 'o1' },
      'Save persists the edited tierStep, retaining the target operand'
    );
    assert.equal(
      Object.hasOwn(saved?.[1] ?? {}, 'natStepping'),
      false,
      'and the retired natStepping key is not written back'
    );
  });

  for (const mode of ['simple', 'alchemy']) {
    it(`renders the simple crafting check editor and saves it in ${mode} mode`, async () => {
      const calls = [];
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: {
          store: createStore(calls, {
            alchemyResolutionMode: mode,
            craftingCheck: {
              simple: {
                rollFormula: '1d20',
                dc: 12,
                thresholdMode: 'meet',
                dcMode: 'static',
                tiers: [],
                macroUuid: null,
                diceCrits: [],
              },
            },
          }),
          services: { openCurrentAdmin: () => {} },
        },
      });
      flushSync();

      navButton('Checks').click();
      await tick();
      flushSync();

      assert.ok(
        target.querySelector('[data-simple-check-editor]'),
        `${mode} mode shows the simple check editor`
      );
      assert.equal(
        target.querySelector('[data-crafting-check-editor]'),
        null,
        'not the routed editor'
      );

      // Seeded from the persisted config; Save present but disabled until edited.
      const dcInput = target.querySelector('[data-check-dc]');
      assert.equal(dcInput.value, '12');
      assert.ok(
        target.querySelector('[data-checks-save]')?.disabled,
        'the Save button is disabled with no unsaved edits'
      );

      dcInput.value = '17';
      dcInput.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
      flushSync();
      const saveButton = target.querySelector('[data-checks-save]');
      assert.ok(saveButton, 'the Save button is present');
      assert.equal(saveButton.disabled, false, 'editing enables the Save button');

      saveButton.click();
      await tick();
      await Promise.resolve();
      flushSync();
      const saved = calls.find((call) => call[0] === 'saveCraftingCheckSimple');
      assert.ok(saved, 'Save persists the simple config through the store');
      assert.equal(saved[1].dc, 17);
      assert.ok(
        target.querySelector('[data-checks-save]').disabled,
        'saving clears the unsaved state and re-disables the Save button'
      );
    });
  }

  // The manager root's crafting-modifier WIRING (issue 1055).
  const MODIFIER_CATALOGUE = [
    { id: 'med', label: 'Medicine', expression: '@abilities.med.mod' },
    { id: 'alch', label: 'Alchemy', expression: '@abilities.alch.mod' },
  ];
  const modifierRuleSystemCheck = (defaultModifierPolicy, maxModifierPicks) => ({
    simple: {
      rollFormula: '1d20 + 4',
      dc: 12,
      thresholdMode: 'meet',
      dcMode: 'static',
      tiers: [],
    },
    defaultModifierIds: ['med'],
    defaultModifierPolicy,
    ...(maxModifierPicks === undefined ? {} : { maxModifierPicks }),
  });
  const modifierRuleSystem = (defaultModifierPolicy, maxModifierPicks) => ({
    modifiers: MODIFIER_CATALOGUE,
    craftingCheck: modifierRuleSystemCheck(defaultModifierPolicy, maxModifierPicks),
  });

  it('root: the Checks card’s rule radio tracks the SYSTEM’s defaultModifierPolicy (issue 1055)', async () => {
    for (const policy of ['highest', 'bySubject', 'playerPicks']) {
      mountManager([], modifierRuleSystem(policy));
      navButton('Checks').click();
      await tick();
      flushSync();
      await openChecksSection('modifiers');
      const checked = [...target.querySelectorAll('[data-crafting-modifier-policy-option]')]
        .filter((option) => option.querySelector('input').checked)
        .map((option) => option.getAttribute('data-crafting-modifier-policy-option'));
      assert.deepEqual(
        checked,
        [policy],
        `the root forwards the system's own rule (${policy}); an unforwarded prop pins every system at addAll`
      );
      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  it('root: the Checks card’s pick cap tracks the SYSTEM’s maxModifierPicks (issue 1055)', async () => {
    for (const [maxModifierPicks, reading] of [
      [2, '2'],
      [undefined, 'unlimited'],
    ]) {
      mountManager([], modifierRuleSystem('bySubject', maxModifierPicks));
      navButton('Checks').click();
      await tick();
      flushSync();
      await openChecksSection('modifiers');
      assert.equal(
        target
          .querySelector('[data-crafting-modifier-max-picks]')
          .getAttribute('data-crafting-modifier-max-picks'),
        reading,
        `the root forwards the system's own cap (${String(maxModifierPicks)})`
      );
      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  // THE CROSS-COPY, END TO END (issues 1308, 1311).
  it('root: copying a modifier lands on Character prerequisites with the new entry open', async () => {
    const { calls } = await mountWorldRulesDestination(
      {
        modifiers: [
          {
            id: 'mod-herbalism',
            label: 'Herbalism',
            icon: 'fa-solid fa-leaf',
            expression: '@skills.nature.value',
          },
        ],
      },
      'modifiers'
    );

    target.querySelector('[data-copy-to-prerequisite="mod-herbalism"]').click();
    // The copy is a write THEN a navigation.
    for (let i = 0; i < 4; i += 1) {
      await Promise.resolve();
      await tick();
      flushSync();
    }

    const write = calls.find((call) => call[0] === 'addCharacterPrerequisite');
    assert.ok(write, 'the root writes the mapped entry to the destination library');
    assert.equal(write[1].name, 'Herbalism', 'the modifier label becomes the prerequisite name');
    assert.equal(
      write[1].path,
      'skills.nature.value',
      'and the expression becomes a roll-data path, with its leading sigil stripped'
    );
    assert.equal('id' in write[1], false, 'the destination mints the id, not the mapper');

    assert.ok(
      target.querySelector('[data-world-prerequisites-page]'),
      'the copy NAVIGATES to the destination page'
    );
    assert.equal(
      target.querySelector('[data-world-modifiers-page]'),
      null,
      'and leaves the source page behind'
    );
    assert.match(
      target.querySelector('[data-list-copy-announcement]')?.textContent ?? '',
      /Herbalism/,
      'the announcement is rendered by the DESTINATION — on the source page the navigation would ' +
        'tear it down before an assistive technology reached it'
    );
  });

  it('root: only a bySubject system’s recipe editor offers the modifier picker (issue 1055)', async () => {
    for (const [policy, picker] of [
      ['bySubject', true],
      ['addAll', false],
      ['highest', false],
      ['playerPicks', false],
    ]) {
      const editor = await openRecipeEditor([], modifierRuleSystem(policy));
      assert.equal(
        Boolean(editor.querySelector('.manager-main [data-recipe-crafting-modifier-picker]')),
        picker,
        `rule ${policy}: eligible-modifier picker rendered = ${picker}`
      );
      // The rejected design's surfaces are GONE, not merely hidden.
      assert.ok(
        !editor.querySelector('.manager-main [data-recipe-crafting-modifier]'),
        `rule ${policy}: a recipe never authors the combination rule`
      );
      assert.ok(
        !editor.querySelector('.manager-main [data-recipe-modifier-banner]'),
        `rule ${policy}: the read-only delegation banner is gone`
      );
      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  it('root: the recipe picker’s cap hint tracks the SYSTEM’s maxModifierPicks (issue 1055)', async () => {
    // Custom set + a cap of 1, so the picker is at its cap and reports `reached`.
    const editor = await openRecipeEditor([], {
      ...modifierRuleSystem('bySubject', 1),
      recipeOverrides: { craftingModifier: { modifierIds: ['med'] } },
    });
    assert.equal(
      editor
        .querySelector('.manager-main [data-recipe-crafting-modifier-cap]')
        ?.getAttribute('data-recipe-crafting-modifier-cap'),
      'reached',
      'the root forwards the cap; an unforwarded prop leaves every recipe unbounded and hides this hint entirely'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    // …and an unbounded system states no cap at all.
    const unbounded = await openRecipeEditor([], {
      ...modifierRuleSystem('bySubject'),
      recipeOverrides: { craftingModifier: { modifierIds: ['med'] } },
    });
    assert.ok(
      !unbounded.querySelector('.manager-main [data-recipe-crafting-modifier-cap]'),
      'unlimited states nothing rather than "up to Infinity"'
    );
  });

  // The View Lab's own `expectSelector`s, run against the mounted root.

  it('root: the Checks card satisfies manager-checks-crafting-modifiers’ own selector (issue 1055)', async () => {
    const selector = labCaseSelector('manager-checks-crafting-modifiers');
    const transformedSystem = modifierRuleSystem('addAll');
    transformedSystem.modifiers = [
      { ...MODIFIER_CATALOGUE[0], expression: '1d20cs>15' },
    ];
    mountManager([], transformedSystem);
    checksStore.saveCraftingCheckModifiers = (patch) => {
      checksStore.viewState.update((state) => ({
        ...state,
        selectedSystem: {
          ...state.selectedSystem,
          craftingCheck: { ...state.selectedSystem.craftingCheck, ...patch },
        },
      }));
    };
    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksSection('modifiers');
    const calloutSelector = '[data-checks-section-callout="modifierAverageUnavailable"]';
    assert.ok(!target.querySelector(calloutSelector), 'addAll has no transformed-ranking warning');

    const highest = target.querySelector(
      '[data-crafting-modifier-policy-option="highest"] input'
    );
    assert.ok(highest, 'the production highest policy input renders');
    highest.click();
    await tick();
    flushSync();
    const highestWarning = target.querySelector(calloutSelector);
    assert.ok(highestWarning, 'highest shows a warning for the eligible transformed modifier');
    assert.equal(highestWarning.getAttribute('data-callout-tone'), 'info');
    assert.match(
      highestWarning.textContent,
      /Medicine\) changes what its dice total means, so it has no comparable average/
    );

    const eligibility = target.querySelector('[data-crafting-modifier-eligibility-input="med"]');
    assert.ok(eligibility, 'the production eligibility control renders');
    eligibility.click();
    await tick();
    flushSync();
    assert.ok(!target.querySelector(calloutSelector), 'the warning clears when the entry is ineligible');
    eligibility.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector(calloutSelector), 'the warning returns when the entry is eligible');

    const playerPicks = target.querySelector(
      '[data-crafting-modifier-policy-option="playerPicks"] input'
    );
    assert.ok(playerPicks, 'the production playerPicks policy input renders');
    playerPicks.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector(calloutSelector), 'playerPicks shows the transformed warning');
    const maxPicksInput = target.querySelector('[data-crafting-modifier-max-picks-input]');
    assert.ok(maxPicksInput, 'the selecting policy renders its cap input');
    maxPicksInput.value = '';
    maxPicksInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    assert.ok(
      Boolean(target.querySelector(selector)),
      'a selecting rule with no cap must put BOTH the bySubject option and the unlimited cap ' +
        'reading inside one [data-crafting-modifier-catalogue] — a cap field rendered as a ' +
        'SIBLING of the card would satisfy every hook-by-hook assertion above and still fail here'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    // The negative control, and the state the capture job actually hit.
    mountManager([], modifierRuleSystem('playerPicks', 1));
    navButton('Checks').click();
    await tick();
    flushSync();
    assert.ok(
      !target.querySelector(selector),
      'a BOUNDED cap must not satisfy the unlimited case, or the frame published under it ' +
        'would be its bounded sibling'
    );
  });

  it('root: the recipe picker satisfies manager-recipe-edit-crafting-modifier-custom-set’s own selector (issue 1055)', async () => {
    const selector = labCaseSelector('manager-recipe-edit-crafting-modifier-custom-set');
    const custom = { craftingModifier: { modifierIds: ['med', 'alch'] } };
    const unbounded = await openRecipeEditor([], {
      ...modifierRuleSystem('bySubject'),
      recipeOverrides: custom,
    });
    assert.ok(
      Boolean(unbounded.querySelector(selector)),
      'a custom set under an unbounded system is a pill row with no cap sentence, which is the ' +
        'whole difference between this frame and its two capped neighbours'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    // The negative control, and the state the capture job actually hit. The picker and its
    // pill row are present either way; the standing cap sentence is what the `:not(:has(…))`
    // half refuses, so a system that acquired a cap nobody authored fails here and only here.
    const bounded = await openRecipeEditor([], {
      ...modifierRuleSystem('bySubject', 1),
      recipeOverrides: custom,
    });
    assert.ok(
      Boolean(bounded.querySelector('.manager-main [data-recipe-crafting-modifier-picker]')),
      'the picker itself still renders, so the failure below is the cap sentence and nothing else'
    );
    assert.ok(
      !bounded.querySelector(selector),
      'a system carrying a cap states it standing, so this case cannot publish that frame'
    );
  });

  // ── Issue 1096, revision 2: the seven behaviours whose mutations SURVIVED ─────────────


  async function mountChecks(calls = [], storeOptions = {}) {
    mountManager(calls, storeOptions);
    navButton('Checks').click();
    await tick();
    flushSync();
    return target;
  }

  /** The routed crafting system these Checks cases share. */
  const routedCraftingOptions = (rollFormula) => ({
    alchemyResolutionMode: 'routedByCheck',
    craftingCheck: {
      enabled: true,
      routed: {
        rollFormula,
        type: 'relative',
        relativeOutcomes: [{ id: 'x', name: 'Success', success: true, dc: 0 }],
      },
    },
  });

  it('evaluates the check the ENGINE rolls, for the one mode the two mappings disagreed on', async () => {
    // ALCHEMY + TIERED. The route renders the ROUTED editor (its own derivation reads
    // `alchemy.checkMode`), so the routed draft is the one a GM edits — but the rail badge
    // picked the SIMPLE draft from a second mapping while evaluating it under ROUTED rules.
    await mountChecks([], {
      alchemyResolutionMode: 'alchemy',
      alchemyConfig: { checkMode: 'tiered', learnOnCraft: true, consumeOnFail: true },
      craftingCheck: {
        enabled: true,
        simple: { rollFormula: '1d20', dc: 12 },
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [{ id: 'x', name: '', success: false, dc: 0 }],
        },
      },
    });

    const badge = target.querySelector('[data-checks-nav-issues="crafting"]');
    assert.ok(badge, 'the routed draft is broken, so the rail child is badged');
    assert.equal(badge.textContent.trim(), '2', 'unnamed tier + no success tier');

    // And the Validation route reports exactly the same two.
    await openChecksActivity('validation');
    const reported = [
      ...target.querySelectorAll(
        '[data-checks-validation-section="crafting"] [data-issue-severity="critical"]'
      ),
    ].map((row) => row.getAttribute('data-issue'));
    assert.deepEqual(reported.sort(compareStrings), ['noSuccessOutcome', 'unnamedOutcome']);
  });

  it('marks and SAVES an alchemy-tiered edit, which lands on the routed draft', async () => {
    // The same disagreement, on the other side.
    const calls = [];
    await mountChecks(calls, {
      alchemyResolutionMode: 'alchemy',
      alchemyConfig: { checkMode: 'tiered', learnOnCraft: true, consumeOnFail: true },
      craftingCheck: {
        enabled: true,
        simple: { rollFormula: '1d20', dc: 12 },
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [{ id: 'x', name: 'Success', success: true, dc: 0 }],
        },
      },
    });
    await openChecksActivity('crafting');
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 4');
    await tick();
    flushSync();

    assert.ok(
      target.querySelector('[data-checks-nav-dirty="crafting"]'),
      'the edit marks the crafting child unsaved'
    );
    target.querySelector('[data-checks-save]').click();
    await tick();
    flushSync();
    const written = calls.find((call) => call[0] === 'saveCraftingCheckRouted');
    assert.ok(written, 'Save writes the ROUTED slot, which is what alchemy-tiered rolls');
    assert.equal(written[1].rollFormula, '1d20 + 4');
    assert.ok(
      !calls.some((call) => call[0] === 'saveCraftingCheckSimple'),
      'and never the simple slot, which this mode does not roll'
    );
  });

  it('raises NO readiness issue on a crafting mode that rolls no check at all', async () => {
    // Alchemy `none`. The coerced reading demanded a roll formula.
    await mountChecks([], {
      alchemyResolutionMode: 'alchemy',
      alchemyConfig: { checkMode: 'none', learnOnCraft: true, consumeOnFail: true },
      craftingCheck: { enabled: true, simple: { rollFormula: '', dc: 12 } },
    });
    assert.ok(
      !target.querySelector('[data-checks-nav-issues="crafting"]'),
      'a mode that rolls nothing has no formula to be missing'
    );
    await openChecksActivity('crafting');
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"][data-checks-off]'),
      'and the route says so, with no formula field to clear a badge with'
    );
    assert.ok(
      !target.querySelector('[data-checks-section-dot="roll"]'),
      'so The roll carries no dot either'
    );
  });

  it('states a result for a Validation group with neither a tick nor an issue', async () => {
    // Gathering in `d100` with no eligible modifiers evaluates to nothing at all.
    await mountChecks([], { gatheringResolutionMode: 'd100' });
    await openChecksActivity('validation');
    const group = target.querySelector('[data-checks-validation-section="gathering"]');
    assert.ok(group, 'gathering is still evaluated and still has a group');
    const rows = group.querySelectorAll('.manager-recipe-val-row');
    assert.equal(rows.length, 1, 'exactly one row, not an empty heading');
    assert.ok(
      group.querySelector('[data-checks-no-issues="gathering"]'),
      'and that row is the stated "no issues" result'
    );
    assert.match(rows[0].textContent, /No issues detected/i);
  });

  it('honours a REPEATED deep link to a section the GM has since left', async () => {
    // The latch was on the section VALUE.
    await mountChecks([], routedCraftingOptions(''));
    await openChecksActivity('validation');

    const deepLink = () => {
      const row = target.querySelector(
        '[data-checks-validation-section="crafting"] [data-issue="noRollFormula"]'
      );
      assert.ok(row, 'the missing formula is reported and deep-linkable');
      row.querySelector('.manager-recipe-val-view').click();
    };

    deepLink();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('#checks-section-roll').getAttribute('aria-selected'),
      'true',
      'the first deep link opens The roll'
    );

    await openChecksSection('triggers');
    assert.equal(
      target.querySelector('#checks-section-triggers').getAttribute('aria-selected'),
      'true'
    );

    await openChecksActivity('validation');
    deepLink();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('#checks-section-roll').getAttribute('aria-selected'),
      'true',
      'and so does the SECOND, for the same section'
    );
  });

  it('reads the locked activation state in the SAME words the live switch uses', async () => {
    // ONE vocabulary across both slots.
    await mountChecks([], { alchemyResolutionMode: 'simple' });
    await openChecksActivity('crafting');
    const live = target.querySelector('[data-checks-active-toggle] .manager-status-toggle-label');
    assert.ok(Boolean(live), 'a simple crafting check offers the live switch');
    const liveReading = live.textContent.trim();
    assert.equal(liveReading, 'Check is on', 'the live switch reads the card sentence');

    // routedByCheck REQUIRES its check, so the same slot renders the locked indicator.
    await mountChecks([], routedCraftingOptions('1d20'));
    await openChecksActivity('crafting');
    const locked = target.querySelector('[data-checks-active-locked]');
    assert.ok(Boolean(locked), 'a mandatory check renders the locked indicator instead');
    assert.ok(
      !target.querySelector('[data-checks-active-toggle]'),
      'and the two never render together, so this really is the same slot'
    );
    assert.equal(
      locked.querySelector('.manager-status-toggle-label').textContent.trim(),
      liveReading,
      'the locked reading is the live switch’s own word'
    );
    // The locked MEANING still reaches assistive tech, which is why the reading can drop it.
    assert.match(locked.getAttribute('aria-label'), /Check is on — locked by the resolution mode/);
  });

  it('opens the section a digest row describes, and offers nothing to press on an absence', async () => {
    // The digest rows grew the prototype's trailing chevron.
    await mountChecks([], routedCraftingOptions('1d20'));
    await openChecksActivity('crafting');

    // ONE card of rows, not one card per row. Direct children.
    const digest = target.querySelector('[data-checks-digest]');
    const rows = [...digest.children];
    assert.ok(rows.length >= 2, 'the digest states more than one fact');
    assert.ok(
      rows.every((row) => row.classList.contains('manager-checks-rail-row')),
      'every direct child of the digest card is a row, so the card is not a stack of cards'
    );

    const triggers = target.querySelector('[data-checks-digest-row="triggers"]');
    assert.equal(triggers.tagName, 'BUTTON', 'a row with a destination is pressable');
    assert.ok(
      Boolean(triggers.querySelector('.manager-checks-rail-row-chevron')),
      'and carries the chevron that says so'
    );
    triggers.click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('#checks-section-triggers').getAttribute('aria-selected'),
      'true',
      'pressing the triggers row opens the Triggers section'
    );

    // The same rail with the check switched OFF: one row, stating an absence, going nowhere.
    await mountChecks([], {
      alchemyResolutionMode: 'simple',
      craftingCheck: { enabled: false, simple: { rollFormula: '1d20', dc: 12 } },
    });
    await openChecksActivity('crafting');
    const off = target.querySelector('[data-checks-digest-row="off"]');
    assert.ok(Boolean(off), 'an off check states why the digest is empty');
    assert.equal(off.tagName, 'DIV', 'and states it without offering anything to press');
    assert.ok(
      !off.querySelector('.manager-checks-rail-row-chevron'),
      'so it carries no chevron either'
    );
  });

  it('offers only formula tokens the active world can resolve', async () => {
    // `@ingredients` resolved against NOTHING. A GM clicked the chip.
    await mountChecks([], routedCraftingOptions('1d20'));
    await openChecksActivity('crafting');
    const chips = [...target.querySelectorAll('[data-check-formula-token]')];
    assert.ok(chips.length > 0, 'the formula field offers quick-add chips');
    const offered = chips.map((chip) => chip.getAttribute('data-check-formula-token'));
    assert.ok(
      !offered.includes('@ingredients'),
      `@ingredients resolves against nothing and must never be offered again: ${offered.join(', ')}`
    );

    // Every offered term is one the shipped derivation produces for this world. That is what
    // makes the assertion above a property rather than one blocked string: a new invented
    // token fails here even though it is not `@ingredients`.
    const allowed = new Set(
      getModifierExpressionSuggestions(game.system?.id || '').map(
        (suggestion) => suggestion.expression
      )
    );
    for (const token of offered) {
      assert.ok(allowed.has(token), `"${token}" is not a term this world's presets produce`);
    }
  });

  it('names the domain the odds panel ACTUALLY enumerated, never a die it merely mentions', async () => {
    // The prototype's `CHANCE PER OUTCOME` heading carries `all 20 faces` hard right. It is a
    // fact about the space the histogram beneath it walked, so it is derived rather than
    // stated — a fixed "20" beside a 2d6 check would be a claim about a check that does not
    // roll a d20.
    // IT READS THE PANEL, NOT THE FORMULA (issue 1097). This assertion used to expect
    // `all 6 faces` for `2d6 + @prof`, off a regex that finds the first `NdS` in the AUTHORED
    // string. That was the only derivation available while the panel was a slot; now that the
    // panel is real it ABSTAINS on `2d6` — eleven outcomes on a triangular distribution are
    // not six uniform faces — and prints "chances are listed for a single die only". A
    // heading reading `all 6 faces` directly above that sentence is a contradiction on one
    // screen, which is the exact defect class this change exists to remove. The regex is kept
    // as the fallback for a rail mounted without a view-model and is unreachable here.
    await mountChecks([], routedCraftingOptions('1d20 + @prof'));
    await openChecksActivity('crafting');
    // This suite installs no dice engine.
    // want of one. That is exactly the condition the arms below measure, and the POSITIVE
    // arm — a real d20 check whose heading reads `all 20 faces` — is asserted in
    // `tests/components/check-preview-mounted.test.js`, which does install one.
    for (const formula of ['1d20 + @prof', '2d6 + @prof', '@prof']) {
      await mountChecks([], routedCraftingOptions(formula));
      await openChecksActivity('crafting');
      assert.ok(
        target.querySelector('[data-checks-odds-state="not-enumerable"]'),
        `${formula}: the panel abstains without a dice engine`
      );
      assert.ok(
        !target.querySelector('[data-checks-odds-domain]'),
        `${formula}: and the heading names no domain the panel did not walk — not even for the d20 the regex fallback would have found`
      );
    }
  });

  it('names each mode in the ALL CHECKS rail the way its own picker names it', async () => {
    // The rail read the AUTHORED tokens straight out of the system.
    await mountChecks([], {
      ...routedCraftingOptions('1d20'),
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: {
        enabled: true,
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [{ id: 's1', name: 'Scrap', success: true, dc: 0 }],
        },
      },
    });
    await openChecksActivity('validation');

    // The rail row renders its second line — the mode + formula — in its own detail span.
    const detailOf = (id) =>
      target.querySelector(`[data-checks-all-checks-row="${id}"] .manager-checks-rail-row-detail`)
        ?.textContent || '';
    const card = target.querySelector('[data-checks-all-checks]');
    assert.ok(Boolean(card), 'the Validation rail renders the All checks card');
    const cardText = card.textContent;

    // The GM-facing name, on BOTH rows, and it is the SAME words for the same mode.
    assert.match(
      cardText,
      /Routed by check/,
      'the routed modes are named as the pickers name them'
    );
    assert.ok(
      !/routedByCheck/.test(cardText),
      `no internal identifier reaches the card:\n${cardText}`
    );
    assert.ok(
      !/\brouted\b/.test(cardText),
      `and the salvage row does not print its raw token either:\n${cardText}`
    );
    assert.match(detailOf('crafting'), /Routed by check/, 'the crafting row names its mode');
    assert.match(detailOf('salvage'), /Routed by check/, 'and the salvage row the same one');
  });

  it('does not re-apply a standing deep link when the GM changes ACTIVITY', async () => {
    // The mirror defect, which is why the latch cannot simply be removed.
    await mountChecks([], {
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: {
        enabled: true,
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [{ id: 's1', name: 'Scrap', success: false, dc: 0 }],
        },
      },
    });
    await openChecksActivity('validation');
    target
      .querySelector('[data-checks-validation-section="salvage"] [data-issue="noSuccessOutcome"]')
      .querySelector('.manager-recipe-val-view')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('#checks-section-outcomes').getAttribute('aria-selected'),
      'true',
      'the deep link opens Outcomes on salvage'
    );

    // The GM moves off the requested section, then leaves the activity entirely.
    await openChecksSection('triggers');
    await openChecksActivity('crafting');
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'checks-crafting',
      'the rail click changed route, so the adoption effect really did re-run'
    );
    assert.equal(
      target.querySelector('#checks-section-triggers').getAttribute('aria-selected'),
      'true',
      'the GM stays where they clicked'
    );
    assert.equal(
      target.querySelector('#checks-section-outcomes').getAttribute('aria-selected'),
      'false',
      'and the honoured request does not re-apply itself on the new activity'
    );
  });

  it('deep-links to the owning ACTIVITY as well as the section', async () => {
    // Both halves of `onOpenActivity`.
    await mountChecks([], {
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: {
        enabled: true,
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [{ id: 's1', name: 'Scrap', success: false, dc: 0 }],
        },
      },
    });
    await openChecksActivity('validation');
    target
      .querySelector('[data-checks-validation-section="salvage"] [data-issue="noSuccessOutcome"]')
      .querySelector('.manager-recipe-val-view')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'checks-salvage',
      'the route follows the issue to its owning activity'
    );
    assert.equal(
      target.querySelector('#checks-section-outcomes').getAttribute('aria-selected'),
      'true',
      'and the section it names is the one that opens — not the default'
    );
  });

  it('explains the open section’s warning dot IN the panel', async () => {
    // The dot's legend (DN8). Without it the only route to the sentence is to leave for
    // Validation and deep-link back.
    await mountChecks([], routedCraftingOptions(''));
    await openChecksActivity('crafting');
    const callout = target.querySelector('[data-checks-section-callout="noRollFormula"]');
    assert.ok(callout, 'the roll section explains its own dot');
    assert.match(callout.textContent, /no roll formula/i);
    assert.equal(
      callout.getAttribute('data-callout-tone'),
      'info',
      'a non-blocking issue is guidance, not a hazard'
    );
    // A section with no issue of its own carries none.
    await openChecksSection('triggers');
    assert.ok(
      !target.querySelector('[data-checks-section-callout]'),
      'Triggers owns no open issue here, so it states nothing'
    );
  });

  it('renders the full activity rail stack, so the Validation absence assertions mean something', async () => {
    // The four rail hooks were asserted ABSENT on Validation and nowhere else.
    await mountChecks([], { alchemyResolutionMode: 'simple' });
    await openChecksActivity('crafting');
    for (const present of [
      // `data-checks-rail` is the View Lab's `manager-checks-stacked-floor` wait selector.
      '[data-checks-rail="crafting"]',
      '[data-checks-active="crafting"]',
      '[data-checks-preview-as]',
      '[data-checks-simulator]',
      '[data-checks-odds]',
      '[data-checks-digest]',
      '[data-checks-sections]',
    ]) {
      assert.ok(target.querySelector(present), `an activity route renders ${present}`);
    }
    // Preview-as was a PRE-ROLL SLOT under issue 1096.
    const previewAs = target.querySelector('[data-checks-preview-as]');
    const actorPicker = previewAs.querySelector('[data-checks-preview-actor]');
    const recordSelect = previewAs.querySelector('[data-checks-preview-record]');
    assert.ok(actorPicker, 'the actor picker is a real control now that a simulator reads it');
    assert.ok(recordSelect, 'so is the record selector');
    // The record control is the shared `<Select>` since issue 1510, so its hook has to land on the
    // TRIGGER for the same reason the actor picker's does.
    assert.equal(recordSelect.tagName, 'BUTTON', 'and its hook is on the picker trigger too');
    assert.equal(
      assertSelectHasResolvedName(target, '[data-checks-preview-record]'),
      'Preview against record',
      'and the screen-reader-only caption it lost is its own name at route level'
    );
    // The actor control is a `SearchablePopover` rather than a `<select>` (the issue 1097
    // follow-up): the list is filtered to player characters and searched, because a world's
    // actor directory is mostly bestiary. Its options exist only while it is open, so what
    // is pinned from here is that the hook lands on the TRIGGER — the View Lab's five checks
    // simulator cases open it through exactly this selector, and a hook that moved to a
    // wrapper would fail the capture job whole while every mounted query still resolved.
    assert.equal(actorPicker.tagName, 'BUTTON', 'the hook is on the popover trigger itself');
    assert.match(
      actorPicker.textContent,
      /No actor/,
      '"No actor" is an explicit resting selection, not an absence'
    );
  });

  it('keeps the gathering d100 route on its own explanation, not the check-OFF empty state', async () => {
    // The D-2 predicate. `optional` means `mode === 'd100'` on gathering.
    await mountChecks([], {
      gatheringResolutionMode: 'd100',
      gatheringCraftingCheck: { enabled: false },
    });
    await openChecksActivity('gathering');
    assert.ok(
      !target.querySelector('[data-checks-off-empty]'),
      'a mode with no toggle is INERT, never "switched off"'
    );
    assert.ok(
      target.querySelector('[data-gathering-d100-readonly]'),
      'the d100 explanation is what renders'
    );
    assert.ok(
      target.querySelector('[data-checks-active-locked="on"]'),
      'and the rail states the locked reading rather than removing the switch'
    );

    // The positive half, so the assertion above is discriminating.
    await mountChecks([], {
      alchemyResolutionMode: 'simple',
      craftingCheck: { enabled: false, simple: { rollFormula: '1d20', dc: 12 } },
    });
    await openChecksActivity('crafting');
    assert.ok(
      target.querySelector('[data-checks-off-empty]'),
      'an optional check the GM switched off does collapse'
    );
    assert.ok(target.querySelector('[data-checks-turn-on]'), 'with the way back on in the panel');
  });

  it('prompts on leaving a dirty Checks route, and discards when the prompt says so', async () => {
    const calls = [];
    await mountChecks(calls, { alchemyResolutionMode: 'simple' });
    await openChecksActivity('crafting');
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 7');
    await tick();
    flushSync();

    // Moving BETWEEN Checks children never prompts — the drafts live above the route.
    await openChecksActivity('salvage');
    assert.ok(
      !calls.some((call) => call[0] === 'confirmDiscardDirtyChecksDraft'),
      'a sibling Checks route preserves the draft silently'
    );

    navButton('Component Rules').click();
    await settleRouteExit();
    const prompt = calls.find((call) => call[0] === 'confirmDiscardDirtyChecksDraft');
    assert.ok(prompt, 'leaving the studio with an unsaved edit prompts');
    // Lowercase because the localization fake returns the key.
    assert.deepEqual(prompt[1], ['crafting'], 'and NAMES the dirty activity');
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'components',
      'discard lets navigation proceed'
    );
  });

  it('saves a staged alchemy check-ON together with the formula authored beside it', async () => {
    // THE LOAD-BEARING CLAIM of the staged check mode. `craftingCheckMode` resolves the slot
    // from the DRAFT alchemy mode; resolving it from the persisted one instead made this
    // exact visit lose work. Turning the check on leaves the persisted mode at `none`, which
    // resolves to slot `null`, so the simple draft never read dirty and Save wrote the mode
    // while silently dropping the formula the GM had just typed.
    const calls = [];
    await mountChecks(calls, {
      alchemyResolutionMode: 'alchemy',
      alchemyConfig: { checkMode: 'none', learnOnCraft: true, consumeOnFail: true },
      craftingCheck: { enabled: true, simple: { rollFormula: '', dc: 12 } },
    });
    await openChecksActivity('crafting');

    target.querySelector('[data-checks-turn-on]').click();
    await tick();
    flushSync();
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 5');
    await tick();
    flushSync();

    target.querySelector('[data-checks-save]').click();
    await settleRouteExit();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'setAlchemyCheckMode'),
      [['setAlchemyCheckMode', 'simple']],
      'the staged mode lands'
    );
    const simple = calls.find((call) => call[0] === 'saveCraftingCheckSimple');
    assert.ok(simple, 'and so does the formula staged in the same visit');
    assert.equal(simple[1].rollFormula, '1d20 + 5');
  });

  it('discards a staged alchemy check-mode change along with the other drafts', async () => {
    // The other defect the staging fixes: the mode persisted on click.
    const calls = [];
    await mountChecks(calls, {
      alchemyResolutionMode: 'alchemy',
      alchemyConfig: { checkMode: 'simple', learnOnCraft: true, consumeOnFail: true },
      craftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
    });
    await openChecksActivity('crafting');

    target.querySelector('[data-checks-active-toggle]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"][data-checks-off]'),
      'the route previews the staged OFF state'
    );

    navButton('Component Rules').click();
    await settleRouteExit();
    const prompt = calls.find((call) => call[0] === 'confirmDiscardDirtyChecksDraft');
    assert.ok(prompt, 'a staged mode change is dirty enough to prompt on the way out');
    assert.deepEqual(prompt[1], ['crafting'], 'and names crafting as the dirty activity');
    assert.deepEqual(
      calls.filter((call) => call[0] === 'setAlchemyCheckMode'),
      [],
      'discarding writes NOTHING — the whole point of staging it'
    );

    navButton('Checks').click();
    await tick();
    flushSync();
    await openChecksActivity('crafting');
    assert.ok(
      target.querySelector('[data-checks-panel="crafting"] [data-simple-check-editor]'),
      'and the check is back ON when the studio is reopened'
    );
  });

  it('stages the SALVAGE Active switch too, and Discard puts it back', async () => {
    // The follow-up half of the staging work. Alchemy's switch staged first because its off
    // state is a check mode; that left one affordance on two lifecycles — staged on an alchemy
    // crafting route, write-through everywhere else. A GM flipping Active on Salvage got no
    // Unsaved chip, a disabled Save, and a Discard that could not undo it.
    const calls = [];
    await mountChecks(calls, {
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
    });
    await openChecksActivity('salvage');

    const toggle = target.querySelector(
      '[data-checks-active="salvage"] [data-checks-active-toggle]'
    );
    assert.ok(toggle, 'the salvage Active switch renders in simple mode');
    toggle.click();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.filter((call) => call[0] === 'saveSalvageCheckActive'),
      [],
      'flipping it writes nothing on its own'
    );
    assert.ok(
      target.querySelector('[data-checks-panel="salvage"][data-checks-off]'),
      'the route previews the staged OFF state'
    );

    navButton('Component Rules').click();
    await settleRouteExit();
    const prompt = calls.find((call) => call[0] === 'confirmDiscardDirtyChecksDraft');
    assert.ok(prompt, 'and it is dirty enough to prompt on the way out');
    assert.deepEqual(prompt[1], ['salvage'], 'naming salvage as the dirty activity');
    assert.deepEqual(
      calls.filter((call) => call[0] === 'saveSalvageCheckActive'),
      [],
      'discarding writes nothing'
    );
  });

  it('stays on the Checks route when a Save-on-navigate does not land', async () => {
    // The checks row's finisher returned `true` unconditionally after awaiting the save.
    const calls = [];
    await mountChecks(calls, {
      alchemyResolutionMode: 'simple',
      confirmDiscardChecksResult: 'save',
      saveCraftingCheckSimpleResult: false,
    });
    await openChecksActivity('crafting');
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 7');
    await tick();
    flushSync();

    navButton('Component Rules').click();
    await settleRouteExit();
    assert.ok(
      calls.some((call) => call[0] === 'saveCraftingCheckSimple'),
      'the save is attempted'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'checks-crafting',
      'a refused save keeps the GM on the studio'
    );
    assert.ok(
      target.querySelector('[data-checks-nav-dirty="crafting"]'),
      'and the activity is still marked unsaved, because the baseline was not moved'
    );
  });

  it('navigates away when the Save-on-navigate DOES land', async () => {
    // The positive control for the gate above: without it, "always false" would pass.
    const calls = [];
    await mountChecks(calls, {
      alchemyResolutionMode: 'simple',
      confirmDiscardChecksResult: 'save',
    });
    await openChecksActivity('crafting');
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 7');
    await tick();
    flushSync();

    navButton('Component Rules').click();
    await settleRouteExit();
    const written = calls.find((call) => call[0] === 'saveCraftingCheckSimple');
    assert.ok(written, 'the save is attempted');
    assert.equal(written[1].rollFormula, '1d20 + 7');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
  });

  /** The routed gathering economy the per-slot save cases below share. */
  const routedGatheringOptions = {
    gatheringResolutionMode: 'routed',
    gatheringCraftingCheck: {
      enabled: true,
      routed: {
        rollFormula: '2d6',
        type: 'relative',
        relativeOutcomes: [{ id: 'g1', name: 'Rich Vein', success: true, dc: 5 }],
        fixedOutcomes: [],
      },
    },
  };

  async function toggleActive(activity) {
    target.querySelector(`[data-checks-active="${activity}"] [data-checks-active-toggle]`).click();
    await tick();
    flushSync();
  }

  // A moved Active switch dirties its activity, so each slot save must still read its own flag.
  for (const row of [
    {
      activity: 'crafting',
      options: {
        alchemyResolutionMode: 'simple',
        craftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
      },
      active: 'saveCraftingCheckActive',
      slot: 'saveCraftingCheckSimple',
    },
    {
      activity: 'salvage',
      options: {
        salvageResolutionMode: 'simple',
        salvageCraftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
      },
      active: 'saveSalvageCheckActive',
      slot: 'saveSalvageCheckSimple',
    },
    {
      activity: 'gathering',
      options: routedGatheringOptions,
      active: 'saveGatheringCheckActive',
      slot: 'saveGatheringCheckRouted',
    },
  ]) {
    it(`applies a staged ${row.activity} Active switch without rewriting its untouched slot`, async () => {
      const calls = [];
      await mountChecks(calls, row.options);
      await openChecksActivity(row.activity);
      await toggleActive(row.activity);

      target.querySelector('[data-checks-save]').click();
      await settleRouteExit();
      assert.deepEqual(
        calls.filter((call) => call[0] === row.active),
        [[row.active, false]],
        'Save applies the staged switch'
      );
      assert.deepEqual(
        calls.filter((call) => call[0] === row.slot),
        [],
        'and the slot draft nobody touched is not written'
      );
    });
  }

  // A store save resolving `false` answers false, so the guard keeps the GM here, and it leaves
  // the baseline where it was, so the activity still reads unsaved.
  for (const row of [
    {
      activity: 'crafting',
      options: { alchemyResolutionMode: 'simple', craftingCheck: { enabled: false } },
      save: 'saveCraftingCheckActive',
      edit: () => toggleActive('crafting'),
    },
    {
      activity: 'crafting',
      options: {
        alchemyResolutionMode: 'alchemy',
        alchemyConfig: { checkMode: 'simple', learnOnCraft: true, consumeOnFail: true },
        craftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
      },
      save: 'setAlchemyCheckMode',
      edit: () => toggleActive('crafting'),
    },
    {
      activity: 'salvage',
      options: {
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { enabled: true, progressive: { awardMode: 'equal' } },
      },
      save: 'saveSalvageCheckProgressive',
      edit: async () => {
        await openChecksSection('outcomes');
        target.querySelector('[data-award-mode-option="exceed"] input').click();
        await tick();
        flushSync();
      },
    },
    {
      activity: 'gathering',
      options: routedGatheringOptions,
      save: 'saveGatheringCheckRouted',
      edit: async () => {
        setInputValue(target.querySelector('[data-check-roll-formula]'), '2d6 + 1');
        await tick();
        flushSync();
      },
    },
  ]) {
    it(`keeps a refused ${row.save} unsaved and the GM on checks-${row.activity}`, async () => {
      const calls = [];
      await mountChecks(calls, { ...row.options, confirmDiscardChecksResult: 'save' });
      checksStore[row.save] = (value) => {
        calls.push([row.save, value]);
        return false;
      };
      await openChecksActivity(row.activity);
      await row.edit();

      navButton('Component Rules').click();
      await settleRouteExit();
      assert.ok(
        calls.some((call) => call[0] === row.save),
        'the save is attempted'
      );
      assert.equal(
        target.querySelector('.fabricate-manager').dataset.managerView,
        `checks-${row.activity}`,
        'a refused save keeps the GM on the studio'
      );
      assert.ok(
        target.querySelector(`[data-checks-nav-dirty="${row.activity}"]`),
        'and the activity is still marked unsaved, because the baseline was not moved'
      );
    });
  }

  // Each editor's update callback reaches its own slot draft, and Save sends that draft.
  for (const row of [
    {
      activity: 'crafting',
      options: {
        alchemyResolutionMode: 'progressive',
        craftingCheck: { enabled: true, progressive: { rollFormula: '1d20', awardMode: 'equal' } },
      },
      save: 'saveCraftingCheckProgressive',
    },
    {
      activity: 'salvage',
      options: {
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: {
          enabled: true,
          routed: {
            rollFormula: '1d20',
            type: 'relative',
            relativeOutcomes: [{ id: 's1', name: 'Scrap', success: true, dc: 0 }],
          },
        },
      },
      save: 'saveSalvageCheckRouted',
    },
  ]) {
    it(`stages a ${row.activity} formula edit and saves it through ${row.save}`, async () => {
      const calls = [];
      await mountChecks(calls, row.options);
      checksStore[row.save] = (draft) => calls.push([row.save, draft]);
      await openChecksActivity(row.activity);
      setInputValue(target.querySelector('[data-check-roll-formula]'), '2d10 + 4');
      await tick();
      flushSync();

      target.querySelector('[data-checks-save]').click();
      await settleRouteExit();
      const saved = calls.filter((call) => call[0] === row.save);
      assert.equal(saved.length, 1, 'Save writes the edited slot once');
      assert.equal(saved[0][1].rollFormula, '2d10 + 4', 'and sends the staged formula');
    });
  }

  it('reseeds the salvage and gathering drafts when the selected system switches', async () => {
    await mountChecks([], {
      ...routedGatheringOptions,
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
    });
    const formula = () => target.querySelector('[data-check-roll-formula]');
    await openChecksActivity('salvage');
    setInputValue(formula(), '1d20 + 3');
    await openChecksActivity('gathering');
    setInputValue(formula(), '2d6 + 1');
    await tick();
    flushSync();
    for (const activity of ['salvage', 'gathering']) {
      const marker = `[data-checks-nav-dirty="${activity}"]`;
      assert.ok(target.querySelector(marker), `${activity} is staged`);
    }

    // Another system, whose gathering economy is routed too, so the same editor stays up.
    checksStore.viewState.update((state) => ({
      ...state,
      selectedSystem: {
        ...state.selectedSystem,
        id: 'alchemy-reforged',
        salvageCraftingCheck: { enabled: true, simple: { rollFormula: '3d6', dc: 12 } },
        gatheringCraftingCheck: {
          ...routedGatheringOptions.gatheringCraftingCheck,
          routed: { ...routedGatheringOptions.gatheringCraftingCheck.routed, rollFormula: '4d4' },
        },
      },
      gatheringConfig: {
        ...state.gatheringConfig,
        systems: {
          ...state.gatheringConfig.systems,
          'alchemy-reforged': state.gatheringConfig.systems.alchemy,
        },
      },
    }));
    await tick();
    flushSync();

    assert.equal(formula().value, '4d4', 'the gathering draft follows the new system');
    await openChecksActivity('salvage');
    assert.equal(formula().value, '3d6', 'and so does the salvage draft');
    assert.ok(
      !target.querySelector('[data-checks-nav-dirty]'),
      'and the switch rebaselined both, so nothing reads unsaved'
    );
  });

  it('gives every outcome band its OWN colour, and keys the strip from the tier rows', async () => {
    // Deriving the fill from the `success` flag alone painted Standard and Masterwork
    // identically on a five-tier check — per-band identity is the whole reason this control
    // refuses the full-track gradient exemption, and two of five bands indistinguishable is
    // not per-band identity. The ramp walks five tones by POSITION IN VALUE ORDER across the
    // whole list, so a five-tier check spends the ramp exactly once, end to end.
    await mountChecks([], {
      alchemyResolutionMode: 'routedByCheck',
      craftingCheck: {
        enabled: true,
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [
            { id: 'ruined', name: 'Ruined', success: false, dc: -10 },
            { id: 'flawed', name: 'Flawed', success: false, dc: -5 },
            { id: 'standard', name: 'Standard', success: true, dc: 0 },
            { id: 'fine', name: 'Fine', success: true, dc: 5 },
            { id: 'masterwork', name: 'Masterwork', success: true, dc: 10 },
          ],
        },
      },
    });
    await openChecksActivity('crafting');
    await openChecksSection('outcomes');

    const styleOf = (band) => band.getAttribute('style') || '';
    const drawn = [...target.querySelectorAll('[data-band-strip-band]')];
    const bands = drawn.map((band) => /--fab-band-strip-fill:\s*([^;]+)/.exec(styleOf(band))?.[1]);
    const inks = drawn.map((band) => /--fab-band-strip-ink:\s*([^;]+)/.exec(styleOf(band))?.[1]);
    assert.equal(bands.length, 5, 'five authored tiers draw five bands');
    assert.equal(new Set(bands).size, 5, `five DISTINCT fills, got ${bands.join(' | ')}`);
    // The ramp itself, named tone by tone in value order.
    assert.deepEqual(
      bands.map((fill) => /var\(--fab-([\w-]+)\)/.exec(fill)?.[1]),
      ['danger', 'warning', 'success', 'info', 'accent'],
      `the ramp walks its five tones in value order, got ${bands.join(' | ')}`
    );
    // Each band inks its own name. One ink for the whole strip is what held the previous ramp
    // under a single luminance ceiling, so a band that loses its ink loses the headroom too.
    assert.deepEqual(
      inks,
      [
        'var(--fab-danger-text)',
        'var(--fab-warning-text)',
        'var(--fab-success-text)',
        'var(--fab-info-text)',
        'var(--fab-accent-text)',
      ],
      `every band carries its own tone's ink, got ${inks.join(' | ')}`
    );

    // The KEY: each tier row wears its own band's tone.
    const swatch = (id) =>
      target.querySelector(`[data-outcome-swatch="${id}"]`)?.getAttribute('style') || '';
    assert.ok(swatch('ruined').startsWith('--fab-outcome-swatch:'), 'the swatch carries a fill');
    for (const [index, id] of ['ruined', 'flawed', 'standard', 'fine', 'masterwork'].entries()) {
      const tone = /var\(--fab-([\w-]+)\)/.exec(bands[index])?.[1];
      assert.equal(
        swatch(id),
        `--fab-outcome-swatch: var(--fab-${tone});`,
        `the ${id} row wears its own band's tone undiluted`
      );
    }
  });

  it('spends the whole ramp on a THREE-tier check, so it still reads as escalating', async () => {
    // The three-tier case is where ranking inside each semantic family went wrong.
    await mountChecks([], {
      alchemyResolutionMode: 'routedByCheck',
      craftingCheck: {
        enabled: true,
        routed: {
          rollFormula: '1d20',
          type: 'relative',
          relativeOutcomes: [
            { id: 'ruined', name: 'Ruined', success: false, dc: -5 },
            { id: 'standard', name: 'Standard', success: true, dc: 0 },
            { id: 'masterwork', name: 'Masterwork', success: true, dc: 5 },
          ],
        },
      },
    });
    await openChecksActivity('crafting');
    await openChecksSection('outcomes');

    const bands = [...target.querySelectorAll('[data-band-strip-band]')].map(
      (band) => /--fab-band-strip-fill:\s*([^;]+)/.exec(band.getAttribute('style') || '')?.[1]
    );
    assert.deepEqual(
      bands.map((fill) => /var\(--fab-([\w-]+)\)/.exec(fill)?.[1]),
      ['danger', 'success', 'accent'],
      `three tiers take the ramp's two ends and its middle, got ${bands.join(' | ')}`
    );
  });

  it('drives the section strip from Home and End as well as the arrows', async () => {
    await mountChecks([], { alchemyResolutionMode: 'simple' });
    await openChecksActivity('crafting');
    const press = (id, key) => {
      const button = target.querySelector(`#checks-section-${id}`);
      assert.ok(button, `the strip offers ${id}`);
      button.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key, bubbles: true }));
    };
    const selected = () =>
      [...target.querySelectorAll('[data-checks-section-button]')].find(
        (button) => button.getAttribute('aria-selected') === 'true'
      )?.dataset.checksSectionButton;

    await openChecksSection('triggers');
    press('triggers', 'End');
    await tick();
    flushSync();
    assert.equal(selected(), 'on-failure', 'End goes to the last section');

    press('on-failure', 'Home');
    await tick();
    flushSync();
    assert.equal(selected(), 'roll', 'and Home back to the first');

    // …and the arrows still work, so the two additions did not replace them.
    press('roll', 'ArrowRight');
    await tick();
    flushSync();
    assert.equal(selected(), 'outcomes');
  });

  it('points only the SELECTED tab at a panel, because only its panel exists', async () => {
    await mountChecks([], { alchemyResolutionMode: 'simple' });
    await openChecksActivity('crafting');
    const tabs = [...target.querySelectorAll('[data-checks-section-button]')];
    assert.ok(tabs.length >= 5, 'the strip renders its sections');
    const controlled = tabs.filter((tab) => tab.hasAttribute('aria-controls'));
    assert.equal(controlled.length, 1, 'exactly one tab carries aria-controls');
    assert.equal(controlled[0].getAttribute('aria-selected'), 'true', 'and it is the selected one');
    const panelId = controlled[0].getAttribute('aria-controls');
    assert.ok(
      target.querySelector(`#${panelId}`),
      `aria-controls must name a node that exists, got ${panelId}`
    );
    // The other four reference nothing rather than an id that resolves to nothing.
    for (const tab of tabs.filter((candidate) => candidate !== controlled[0])) {
      assert.ok(
        !tab.hasAttribute('aria-controls'),
        `${tab.dataset.checksSectionButton} names none`
      );
    }
  });

  it('gives every labelled rail marker a role, so the name is actually exposed', async () => {
    // ARIA-in-HTML forbids `aria-label` on a generic element.
    await mountChecks([], { alchemyResolutionMode: 'routedByCheck' });
    for (const selector of [
      '[data-checks-nav-issues="checks"]',
      '[data-checks-nav-issues="crafting"]',
    ]) {
      const badge = target.querySelector(selector);
      assert.ok(badge, `${selector} renders for a check with an open issue`);
      assert.equal(badge.tagName, 'SPAN');
      assert.ok(badge.hasAttribute('aria-label'), `${selector} carries a name`);
      assert.equal(badge.getAttribute('role'), 'img', `${selector} carries a role to expose it`);
    }
    // Proven against the sibling that already got this right, so the rule is stated once.
    await openChecksActivity('crafting');
    setInputValue(target.querySelector('[data-check-roll-formula]'), '1d20 + 1');
    await tick();
    flushSync();
    const dirty = target.querySelector('[data-checks-nav-dirty="crafting"]');
    assert.equal(dirty.getAttribute('role'), 'img');
  });
}
