/** The component routes: the browser, the editor, salvage authoring and card hydration. */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { writable } from 'svelte/store';
// The shipped array transform the store publishes hydrated cards through (issue 1081). The
// DOM guards below drive the REAL one rather than restating it, so a revert to re-wrapping
// the same card objects turns them red. Safe to import here: the projection is a deliberate
// leaf with no `.svelte` and no Foundry globals in its graph, and this is the test file's own
// module scope rather than the compiled mount closure.
import { republishHydratedItemCards } from '../../src/ui/svelte/stores/adminComponentRowProjection.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import {
  managerComponents,
  settle,
  settleBetweenTests,
  settleRouteExit,
} from './manager-mounted-shared.js';
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionValues,
} from '../helpers/select-control.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { assertHeaderBackIsGhost, gatheringSubitem, gatheringToggle, navButton } = queries;
const { mountManager } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerComponentsCases() {
  before(async () => {
    ({ Component } = await managerComponents());
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


  it('routes to the components browser with filters, drop import, selected inspector, and actions', async () => {
    const calls = [];
    const dropped = [];
    const edited = [];
    const copied = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onDropItem: (data) => dropped.push(data),
          onEditComponent: (id) => edited.push(id),
          onCopySourceUuid: (uuid) => copied.push(uuid),
        },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);
    // The view renders NO page header of its own (issue 676).
    assert.equal(
      target.querySelector('.manager-main .manager-section-header'),
      null,
      'the browser renders no second page header'
    );
    assert.ok(target.textContent.includes('Drop items to add components'));
    assert.ok(target.textContent.includes('Iron Ore'));
    // THE SOURCE-ORIGIN PILL IS GONE FROM THE ROW (issue 1371, parity round 4; gap-list row 114).
    assert.ok(
      !target.querySelector('[data-component-id="c1"] .manager-chip.is-accent'),
      'no `Compendium` / `Items Directory` pill on a system rules row'
    );
    assert.ok(
      target.textContent.includes('Recipes'),
      'and the trailing cluster states the stat the reference draws in its place'
    );
    const compactEssenceChip = target.querySelector(
      '[data-component-id="c1"] .manager-essence-compact-chip'
    );
    assert.equal(
      compactEssenceChip?.textContent.trim(),
      '2',
      'essence row should show only compact quantity text'
    );
    assert.equal(
      compactEssenceChip?.getAttribute('aria-label'),
      'Earth 2',
      'compact essence chip should expose the essence name and quantity accessibly'
    );
    assert.equal(target.textContent.includes('Usage evidence'), false);
    assert.equal(target.textContent.includes('Evidence'), false);
    assert.equal(target.textContent.includes('Progressive difficulty'), false);

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'iron';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    // Issue 676: components group and filter by CATEGORY.
    assert.equal(
      target.querySelector('[aria-label="Filter components by tag"]'),
      null,
      'the legacy tag dropdown is gone'
    );
    assert.equal(
      target.querySelector('[aria-label="Search component tags"]'),
      null,
      'the tag search facet is gone — category is the grouping axis now'
    );
    assert.equal(
      target.querySelector('[data-component-tag-search]'),
      null,
      'no tag search control'
    );
    assert.equal(
      target.querySelector(
        '.manager-component-row .manager-chip-row .manager-chip:not(.manager-essence-compact-chip)'
      ),
      null,
      'rows render no tag chips'
    );

    const categoryFilter = target.querySelector('[data-component-category-filter]');
    assert.ok(categoryFilter, 'the browser filters by category');
    categoryFilter.value = 'Reagent';
    categoryFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);
    assert.ok(target.textContent.includes('Iron Ore'), 'the category filter narrows the list');

    // NO CATEGORY BADGE ON THE ROW since issue 1371's parity round 4 (gap-list row 114). The
    // reference's system row carries one state pill — `Salvage` — because CATEGORY is the group
    // band's whole subject, and a chip repeating it on every row inside that band is the noise
    // the band exists to remove. It stays a selectable FILTER option, which is the half of the
    // Recipe Studio's badge-vs-filter asymmetry that survives.
    assert.ok(
      !target.querySelector('[data-component-id="c1"] [data-component-category]'),
      'the row states no category: the band it sits under already does'
    );
    assert.equal(
      target.querySelector('[data-component-group="Reagent"] .fab-group-name').textContent.trim(),
      'Reagent',
      'and THAT is where the category is stated'
    );
    categoryFilter.value = 'general';
    categoryFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);
    assert.ok(
      target.textContent.includes('Glass Vial'),
      'the uncategorized component falls into general'
    );
    // ── THE ACTIVE-FILTER CHIP ROW IS GONE (gap-list row 103) ────────────────────────────
    // The reference's toolbar is TWO rows — [search, category, essence] then [Select all, Group
    // by category, Sort by, count] — and this one was four. The chip run was the third of them,
    // and each of the three filters already shows its own state in the control that set it.
    assert.ok(
      !target.querySelector('[data-component-filter-chip]'),
      'no third toolbar row restating what the three controls above already show'
    );

    // The filter is cleared through the control that set it, and the list widens again.
    categoryFilter.value = 'all';
    categoryFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 2);
    // The count is the sentence the reference writes for the in-system cohort (`proto:1069`),
    // computed over the rows the body is drawing.
    assert.equal(
      target.querySelector('[data-component-count]').textContent.trim(),
      '2 of 2 catalogue entries'
    );

    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-component-id="c1"]').classList.contains('is-selected'));
    assert.equal(
      target.textContent.includes('Compendium.fabricate.items.iron-ore'),
      false,
      'raw source UUID should not render as inspector text'
    );

    // Copy, Unlink and Delete are HOSTED here (issue 676).
    target.querySelector('[data-component-inspector-menu]').click();
    flushSync();
    const menuLabels = [...target.querySelectorAll('[role="menuitem"]')].map((item) =>
      item.textContent.trim()
    );
    assert.deepEqual(menuLabels, [
      'Copy source UUID',
      'Unlink component',
      'Delete component',
    ]);
    [...target.querySelectorAll('[role="menuitem"]')][0].click();
    flushSync();
    assert.equal(
      target.querySelector('[data-component-source-missing]'),
      null,
      'resolved source should not show a missing-source warning'
    );
    const componentInspector = target.querySelector('[data-component-inspector]');
    assert.ok(componentInspector, 'the components route renders the browser inspector');
    assert.ok(
      componentInspector.querySelector('.manager-component-inspector-identity .fab-medallion'),
      'the inspector identity renders the shared Medallion, not a bespoke preview img'
    );
    // THE TWO STAT TILES ARE GONE (gap-list row 118): the subline states both numbers.
    assert.equal(componentInspector.querySelectorAll('[data-component-fact]').length, 0);
    assert.equal(
      componentInspector.querySelector('[data-component-inspector-subline]').textContent.trim(),
      '2 tags · 1 essence',
      'the subline states both numbers, which is what the two tiles were for'
    );

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.dropped' }) },
    });
    target.querySelector('.manager-component-drop-zone').dispatchEvent(dropEvent);

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'component-edit',
      'row Edit action should route into the manager component-edit view'
    );
    // 'Component Rules' since issue 1362: the crumb takes the screen's own title.
    Array.from(target.querySelectorAll('.manager-breadcrumbs button'))
      .find((button) => button.textContent.trim() === 'Component Rules')
      .click();
    flushSync();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'components',
      'the breadcrumb button should return to the components browser'
    );
    // Delete now fires from the INSPECTOR, not the row: the row carries one action.
    assert.equal(
      target.querySelector('[data-component-id="c1"] [aria-label="Delete Iron Ore"]'),
      null,
      'the row no longer carries a delete icon'
    );
    assert.equal(
      target.querySelectorAll('[data-component-id="c1"] .manager-action-group button').length,
      1,
      'the row carries exactly ONE action — three ghost icons made it a toolbar'
    );
    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();
    target.querySelector('[data-component-inspector-menu]').click();
    flushSync();
    [...target.querySelectorAll('[role="menuitem"]')]
      .find((item) => item.textContent.trim() === 'Delete component')
      .click();
    flushSync();

    assert.deepEqual(dropped, [{ type: 'Item', uuid: 'Item.dropped' }]);
    assert.deepEqual(copied, ['Compendium.fabricate.items.iron-ore']);
    assert.deepEqual(
      edited,
      [],
      'manager row Edit should no longer call the legacy services.onEditComponent'
    );
    assert.ok(calls.some((call) => call[0] === 'setItemSearch' && call[1] === 'iron'));
    assert.ok(calls.some((call) => call[0] === 'deleteComponent' && call[1] === 'c1'));
  });

  it('shows progressive difficulty only for progressive component systems and warns for missing sources', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          alchemyResolutionMode: 'progressive',
          missingComponentSource: true,
        }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {}, onCopySourceUuid: () => {} },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    // The badge reads as the VALUE alone and names itself through its TOOLTIP.
    const difficultyChip = target.querySelector('[data-component-difficulty]');
    assert.equal(
      difficultyChip?.getAttribute('title'),
      'Progressive difficulty',
      'the shortened badge must still name what it measures, via its tooltip'
    );
    assert.equal(
      target.textContent.includes('Progressive difficulty'),
      false,
      'the words belong in the tooltip only: repeating them on every row crowded the description'
    );
    // THE DANGLING LINK IS STATED IN THE INSPECTOR, NOT ON THE ROW (issue 1371, parity round 4).
    assert.ok(
      Boolean(target.querySelector('[data-component-inspector] [data-component-source-missing]')),
      'a missing source still reaches the GM, one pane over'
    );

    // Issue 676: the rebuilt browser is a LIST.
    const c1Difficulty = target.querySelector(
      '[data-component-id="c1"] [data-component-difficulty]'
    );
    assert.ok(c1Difficulty, 'a difficulty badge renders for a progressive system');
    // EXACT, not /2/: a loose match still passes against the old "Progressive difficulty 2"
    // long form, so it could not detect the label creeping back into the badge text.
    assert.equal(c1Difficulty.textContent.trim(), '2', 'the badge shows the VALUE alone');
    const c2Difficulty = target.querySelector(
      '[data-component-id="c2"] [data-component-difficulty]'
    );
    assert.equal(c2Difficulty.textContent.trim(), 'None', 'an unset difficulty shows "None" alone');

    target.querySelector('[data-component-id="c1"] .manager-component-identity').click();
    await tick();
    flushSync();

    assert.ok(
      target.querySelector('[data-component-source-missing]'),
      'missing stored source should show a warning callout'
    );
    assert.equal(
      target.textContent.includes('Compendium.fabricate.items.iron-ore'),
      false,
      'missing source warning should not print the raw UUID'
    );
  });

  it('opens the in-manager component-edit view, persists tag changes, and exposes source actions', async () => {
    const calls = [];
    const replaced = [];
    const unlinked = [];
    const opened = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          onDropItem: () => {},
          onCopySourceUuid: () => {},
          onReplaceSource: (itemId, data) => replaced.push({ itemId, data }),
          onUnlinkSource: (itemId) => unlinked.push(itemId),
          onOpenSource: (uuid) => opened.push(uuid),
        },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();

    const root = target.querySelector('.fabricate-manager');
    assert.equal(
      root.dataset.managerView,
      'component-edit',
      'row Edit should land on the component-edit route'
    );
    // Issue 676, decision 4: the editor header is the COMPONENT's identity.
    const editHeading = target.querySelector('[data-component-edit-heading]');
    assert.ok(editHeading, 'the component editor renders its own identity heading');
    assert.equal(
      editHeading.querySelector('h1.manager-title').textContent.trim(),
      'Iron Ore',
      'the heading names the component, not the route'
    );
    assert.ok(
      editHeading.querySelector('.fab-medallion'),
      'the heading leads with the shared Medallion, as the recipe editor does'
    );
    // `{system} rules · {effective category} · {mode}` since issue 1371's parity round 4
    // (`proto:5719`, gap-list row 125). The subline used to end in a SOURCE segment naming where
    // the linked Item lives, which under epic 1357 is world data stated on the world entry — so
    // the one line this screen has for context spent half of it on a fact that is not this
    // screen's. The reference spends it on the three facts that decide what the editor below can
    // author: whose rules these are, what they classify the component as, and how salvage
    // resolves here.
    assert.equal(
      editHeading.querySelector('[data-component-edit-subline]').textContent.trim(),
      'Alchemy rules · Reagent · Simple',
      'the subline reads "{system} rules · {category} · {mode}"'
    );
    // The breadcrumb names the component too.
    assert.ok(
      Array.from(target.querySelectorAll('.manager-breadcrumbs span')).some(
        (node) => node.textContent.trim() === 'Iron Ore'
      ),
      'the breadcrumb names the component'
    );
    assert.ok(
      target.querySelector('[data-component-edit-section="identity"]'),
      'Identity card should render in the editor'
    );
    // Issue 676: there is NO right rail. Both hooks survive the rebuild inside the
    // single scrolling column's identity strip — `scripts/foundry-test-run.mjs`
    // hard-waits on each, and the "source" wait aborts Phase D0 before every
    // downstream frame.
    assert.ok(
      target.querySelector('[data-component-edit-section="source"]'),
      'the source block renders inside the identity strip, not a rail inspector'
    );
    assert.equal(
      target.querySelector('.manager-inspector .manager-inspector-card'),
      null,
      'the component editor renders no right-rail inspector card'
    );

    // ── THE SOURCE REGISTER IS GONE FROM THIS SCREEN (issue 1371, parity round 4) ──────────
    // Open-sheet on the name, the overflow's Copy source UUID and Unlink Source Item, and the
    // drop-to-replace target were all asserted here. `rebuild-spec.md` D3 removes every one of
    // them: under epic 1357 the record naming the source Item is world catalogue data, so it is
    // authored on the world Component entry and this screen carries the ONE exit that goes
    // there. The removal is asserted rather than deleted, and the three unused recorders below
    // are the proof that no path still reaches them.
    assert.ok(
      !target.querySelector('[data-component-edit-action="open-source"]'),
      'the name no longer opens the linked Item sheet from a system rules screen'
    );
    assert.ok(
      !target.querySelector('.manager-component-overflow-trigger'),
      'and there is no source overflow to bury Unlink and Copy source UUID in'
    );
    assert.ok(
      !target.querySelector('[data-component-edit-action="replace-source"]'),
      'and no drop target: a rules editor must not restamp the durable roles map'
    );
    assert.deepEqual(
      [opened, unlinked, replaced],
      [[], [], []],
      'nothing reached the three source services, which is what "removed" has to mean'
    );

    // What stands in their place is ONE callout. THIS fixture's world corpus holds no record of
    // `c1`, which is the branch that withholds the pill, the attribution note and the exit — so
    // the card states whose the identity is instead of claiming a catalogue entry that is not
    // there. Both branches are driven; the other is
    // `tests/components/component-identity-strip-mounted.test.js`.
    const callout = target.querySelector('[data-component-edit-section="identity"]');
    assert.ok(Boolean(callout), 'the editor opens on the identity callout');
    assert.equal(
      callout.querySelector('[data-component-edit-field="name"]').textContent.trim(),
      'Iron Ore'
    );
    assert.ok(!callout.querySelector('[data-component-world-pill]'));
    assert.match(
      callout.querySelector('[data-component-identity-unlinked-hint]').textContent,
      /no world catalogue entry/
    );

    // Tags and essences are cards on the `Component rules` tab.
    assert.ok(
      target.querySelector('[data-component-edit-section="tags"]'),
      'Tags section should render'
    );
    assert.ok(
      target.querySelector('[data-component-edit-section="essences"]'),
      'Essences section should render'
    );

    // Tags are TOGGLE PILLS (issue 676).
    const mineral = target.querySelector('[data-component-edit-tag-toggle="mineral"]');
    assert.ok(mineral, 'every system itemTag renders as a pill, selected or not');
    assert.equal(
      mineral.getAttribute('aria-pressed'),
      'false',
      'mineral should not be applied yet'
    );

    mineral.click();
    flushSync();
    await tick();
    flushSync();

    assert.equal(
      target
        .querySelector('[data-component-edit-tag-toggle="mineral"]')
        .getAttribute('aria-pressed'),
      'true',
      'clicking the pill applies the tag'
    );
    assert.ok(
      target.textContent.includes('Unsaved'),
      'dirty indicator should appear after a tag change'
    );

    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'header save submit should target the edit form');
    assert.equal(saveButton.disabled, false, 'save should be enabled when the draft is dirty');

    // `ComponentEditorHeader`'s conversion.
    assertHeaderBackIsGhost('[data-component-edit-back]', 'component-edit');
    assert.ok(
      saveButton.classList.contains('fab-manager-button'),
      `the header Save renders through the ManagerButton primitive, got ${saveButton.className}`
    );
    assert.ok(
      saveButton.classList.contains('is-primary') && !saveButton.classList.contains('is-ghost'),
      `and stays the primary beside a ghost Back, got ${saveButton.className}`
    );
    assert.equal(
      saveButton.getAttribute('type'),
      'submit',
      'and keeps the submit type that pairs with `form="manager-component-edit-form"` — the ' +
        'primitive emits `type` only on a <button>, and dropping it silently stops Save working'
    );
    saveButton.click();
    flushSync();
    await tick();
    flushSync();
    await tick();
    flushSync();

    const updateCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(updateCall, 'save should call store.updateComponent');
    assert.equal(updateCall[1], 'c1');
    assert.equal(
      Array.isArray(updateCall[2].tags) && updateCall[2].tags.includes('mineral'),
      true,
      'tags update should include the newly checked tag'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'components',
      'successful save should return to the components browser'
    );
  });

  // Mount the manager and open c1's component-edit route. Hoisted so the
  // difficulty-inspector tests stay DRY (Sonar new-code gate).
  async function openComponentEditor(calls, storeOptions = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, storeOptions),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    return target;
  }

  // `component.difficulty` is ONE scalar consumed by several progressive surfaces
  // (recipes via ResolutionModeService, salvage via CraftingEngine, gathering via
  // GatheringEngine#difficultyForResult), each with its OWN resolution mode. The
  // control gated on the RECIPE mode alone, so a system that resolved recipes by
  // check but salvaged progressively read difficulty and could never author it —
  // exactly the shape that shipped broken in issue 676, with no test to catch it.
  const difficultyConsumerCases = [
    {
      name: 'progressive recipes',
      options: { alchemyResolutionMode: 'progressive' },
    },
    {
      name: 'routedByCheck recipes with progressive salvage (the issue 676 regression)',
      options: { alchemyResolutionMode: 'routedByCheck', salvageResolutionMode: 'progressive' },
    },
    {
      name: 'routedByCheck recipes with a progressive gathering economy',
      options: {
        alchemyResolutionMode: 'routedByCheck',
        gatheringConfig: { systems: { alchemy: { economy: { resolutionMode: 'progressive' } } } },
      },
    },
  ];

  for (const { name, options } of difficultyConsumerCases) {
    it(`shows the component difficulty control for ${name}`, async () => {
      await openComponentEditor([], options);
      const card = target.querySelector('[data-component-edit-section="difficulty"]');
      assert.ok(card, `difficulty control should render for ${name}`);
      assert.ok(card.querySelector('input'), 'the difficulty control should expose an input');
    });
  }

  it('titles the difficulty card without stealing the browser badge label', async () => {
    // The card title and the browser badge are DIFFERENT strings that both describe
    // `component.difficulty`. The badge composes `${label} ${difficulty}`, so pointing
    // the card's <h3> at the shared `Component.ProgressiveDifficulty` key would render
    // "This component's Progressive DC 2" in the list. They must stay separate keys.
    await openComponentEditor([], { alchemyResolutionMode: 'progressive' });
    const card = target.querySelector('[data-component-edit-section="difficulty"]');
    assert.equal(card.querySelector('h3').textContent.trim(), 'This component’s Progressive DC');
    assert.ok(
      card
        .querySelector('p')
        .textContent.includes(
          'shown read-only wherever this component appears as a progressive result'
        )
    );
  });

  it('hides the component difficulty control when no progressive surface consumes it', async () => {
    await openComponentEditor([], {
      alchemyResolutionMode: 'routedByCheck',
      salvageResolutionMode: 'simple',
    });
    assert.equal(
      target.querySelector('[data-component-edit-section="difficulty"]'),
      null,
      'a difficulty control nothing reads is clutter and must stay hidden'
    );
  });

  it('saves a staged difficulty when only salvage is progressive', async () => {
    // Guards the half-fix: if dirtiness/save kept the old recipe-mode gate the field
    // would render and then silently refuse to persist.
    const calls = [];
    await openComponentEditor(calls, {
      alchemyResolutionMode: 'routedByCheck',
      salvageResolutionMode: 'progressive',
    });
    const input = target.querySelector('[data-component-edit-section="difficulty"] input');
    input.value = '9';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.equal(saveButton.disabled, false, 'a staged difficulty change should enable Save');
    saveButton.click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(saveCall, 'Save should call store.updateComponent');
    assert.equal(saveCall[2].difficulty, 9, 'the staged difficulty should persist on Save');
  });

  it('stages progressive-difficulty edits into the component editor save flow', async () => {
    const calls = [];
    await openComponentEditor(calls, { alchemyResolutionMode: 'progressive' });

    const card = target.querySelector('[data-component-edit-section="difficulty"]');
    assert.ok(card, 'difficulty inspector card should render for a progressive system');
    const input = card.querySelector('input');
    assert.ok(input, 'difficulty card should expose a number input');
    assert.equal(input.value, '2', 'input should seed from the persisted component difficulty');

    // Editing stages the value but must NOT write to the store immediately.
    input.value = '5';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'updateComponent'),
      false,
      'editing difficulty must not persist before Save'
    );

    // Staging a change makes the editor dirty and enables Save.
    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'component editor Save button should render');
    assert.equal(saveButton.disabled, false, 'a staged difficulty change should enable Save');

    // Saving persists the staged difficulty through the editor's save flow.
    saveButton.click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(saveCall, 'Save should call store.updateComponent');
    assert.equal(saveCall[1], 'c1');
    assert.equal(saveCall[2].difficulty, 5, 'the staged truncated integer should persist on Save');
  });

  it('clears a staged progressive difficulty on Save when it is taken to zero', async () => {
    // The CAPABILITY under test — "the GM can clear a difficulty back to null, and the
    // clear persists" — is unchanged. The GESTURE changed in issue 676, when this control
    // became the shared `Stepper`: the stepper's input deliberately ignores an empty
    // string (so a half-typed value is never coerced to 0 mid-keystroke) and re-asserts
    // the model value on blur, so blanking is structurally not expressible through it.
    const calls = [];
    await openComponentEditor(calls, { alchemyResolutionMode: 'progressive' });

    const input = target.querySelector('[data-component-edit-section="difficulty"] input');
    input.value = '0';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('button[form="manager-component-edit-form"]').click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(saveCall, 'Save should call store.updateComponent');
    assert.equal(saveCall[2].difficulty, null, 'blanking the input clears the difficulty on Save');
  });

  it('hides the progressive-difficulty inspector for a non-progressive system', async () => {
    const calls = [];
    await openComponentEditor(calls);

    assert.ok(
      target.querySelector('[data-component-edit-section="source"]'),
      'source inspector should still render'
    );
    assert.equal(
      target.querySelector('[data-component-edit-section="difficulty"]'),
      null,
      'difficulty inspector should be absent when crafting resolution mode is not progressive'
    );
  });

  // Mount the manager with salvage authoring enabled and open c1's component-edit
  // route. Hoisted so the salvage-section tests stay DRY (Sonar new-code gate).
  async function openComponentSalvageEditor(calls, storeOptions = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          selectedFeatures: {
            essences: true,
            effectTransfer: true,
            itemTags: true,
            gathering: true,
            recipeCategories: true,
            salvage: true,
          },
          ...storeOptions,
        }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();
    return target;
  }

  const ROUTED_SALVAGE_CHECK = {
    enabled: true,
    routed: {
      type: 'relative',
      relativeOutcomes: [
        { id: 'o-fail', name: 'Failure', success: false },
        { id: 'o-pass', name: 'Success', success: true },
        { id: 'o-crit', name: 'Critical Success', success: true },
      ],
    },
  };

  it('renders the salvage authoring section with result-group add, routing selects, and DC override for a routed system', async () => {
    const calls = [];
    await openComponentSalvageEditor(calls, {
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: ROUTED_SALVAGE_CHECK,
    });

    const section = target.querySelector('[data-salvage-section]');
    assert.ok(section, 'salvage authoring section should render when showSalvage is true');

    // Adding a result group reveals the group name input and an add-result button.
    assert.equal(
      section.querySelector('[data-salvage-group-name]'),
      null,
      'no result group should exist before adding one'
    );
    section.querySelector('[data-add-salvage-group]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-salvage-section] [data-salvage-group-name]'),
      'add group should render an editable result group'
    );

    // Issue 676: the per-component salvage gate now defaults OFF (decision 6).
    const enableToggle = target.querySelector('[data-recipe-field="salvageEnabled"]');
    assert.equal(enableToggle.disabled, false, 'one result group enables the salvage toggle');
    enableToggle.click();
    await tick();
    flushSync();

    // One routing control per non-empty outcome name on the routed salvage check. The hook rides
    // the shared picker's trigger button since issue 1510, so the query is unchanged and the
    // per-row identity it carries is still the outcome's own name.
    const routes = target.querySelectorAll('[data-salvage-routing] [data-salvage-route]');
    assert.equal(routes.length, 3, 'one routing control per routed outcome tier name');
    assert.deepEqual(
      Array.from(routes).map((trigger) => trigger.dataset.salvageRoute),
      ['Failure', 'Success', 'Critical Success'],
      'routing controls should be keyed by outcome tier name'
    );

    assert.ok(
      target.querySelector(
        '[data-salvage-section] [data-salvage-dc-override] [data-salvage-dc-preset]'
      ),
      'routed mode should render the DC-override field'
    );

    // The routing row's caption names its own outcome (issue 1510), not the generic control label.
    assert.equal(
      assertSelectHasResolvedName(target, '[data-salvage-route="Success"]'),
      'Success',
      'the Success row resolves its own outcome name'
    );
    // `''` (Unrouted) is stamped `__unchanged__` in the DOM — a `data-popover-option` cannot be
    // empty — so the real group id is whichever value is not that sentinel.
    const groupId = selectOptionValues(target, '[data-salvage-route="Success"]').find(
      (value) => value !== '__unchanged__'
    );
    assert.ok(groupId, 'the added result group offers a routable value');
    chooseSelectOption(target, '[data-salvage-route="Success"]', groupId);
    await tick();
    flushSync();

    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    saveButton.click();
    flushSync();
    await tick();
    flushSync();
    await tick();
    flushSync();
    const updateCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(updateCall, 'routing the Success outcome should call store.updateComponent');
    assert.deepEqual(
      updateCall[2].salvage.outcomeRouting,
      { Success: groupId },
      'only the routed outcome is staged, and the other two stay absent'
    );
  });

  it('hides the salvage authoring section when the system does not enable salvage', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          selectedFeatures: {
            essences: true,
            effectTransfer: true,
            itemTags: true,
            gathering: true,
            recipeCategories: true,
            salvage: false,
          },
        }),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-component-id="c1"] [aria-label="Edit Iron Ore"]').click();
    flushSync();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-salvage-section]'),
      null,
      'salvage section should not render when showSalvage is false'
    );
  });

  it('shows salvage result groups but hides routing and DC override in progressive mode', async () => {
    const calls = [];
    await openComponentSalvageEditor(calls, {
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: { enabled: true, progressive: { awardMode: 'equal' } },
    });

    assert.ok(
      target.querySelector('[data-salvage-section] [data-add-salvage-group]'),
      'progressive mode should still allow authoring result groups'
    );
    assert.equal(
      target.querySelector('[data-salvage-routing]'),
      null,
      'progressive mode has no routing'
    );
    assert.equal(
      target.querySelector('[data-salvage-dc-override]'),
      null,
      'progressive mode has no DC override'
    );
  });

  it('the salvage yield picker is NOT filtered by the component browser search', async () => {
    // THE DEFECT (issue 676): `salvageComponentOptions` projected from `itemCards`.
    const calls = [];
    await openComponentSalvageEditor(calls, {
      // Matches ONLY "Iron Ore" (c1) — the component being edited.
      itemSearchTerm: 'iron',
      salvageResolutionMode: 'progressive',
      componentSalvage: {
        enabled: true,
        resultGroups: [
          { id: 'g1', name: 'Scraps', results: [{ id: 'r1', componentId: 'c4', quantity: 1 }] },
        ],
      },
    });

    const root = target.querySelector('.fabricate-manager');
    target.querySelector('.manager-salvage-component-trigger').click();
    await tick();
    flushSync();

    const optionLabels = Array.from(root.querySelectorAll('.manager-travel-option')).map((button) =>
      button.textContent.trim()
    );
    assert.ok(
      optionLabels.some((label) => label.includes('Glass Vial')),
      `the picker must offer every component, not just search matches (saw: ${optionLabels.join(' | ')})`
    );
    assert.ok(optionLabels.some((label) => label.includes('Coal')));
    assert.ok(optionLabels.some((label) => label.includes('Nightshade')));
  });

  it('a yield row reads its DC from the picker source — difficulty survives the projection', async () => {
    // The options list is an ALLOWLIST projection. `difficulty` reaching the editor as
    // `undefined` is indistinguishable from a component that was never given one, so a
    // dropped field renders "DC —" on every row instead of failing. This drives the badge
    // through the ROOT (not by handing ComponentEditView props directly), which is the
    // only way the projection itself is under test.
    const calls = [];
    await openComponentSalvageEditor(calls, {
      itemSearchTerm: 'iron',
      salvageResolutionMode: 'progressive',
      componentSalvage: {
        enabled: true,
        resultGroups: [
          { id: 'g1', name: 'Scraps', results: [{ id: 'r1', componentId: 'c4', quantity: 1 }] },
        ],
      },
    });

    // c4 (Coal) has difficulty 3 and is EXCLUDED by the "iron" search.
    assert.equal(
      target
        .querySelector('[data-salvage-result-difficulty]')
        .getAttribute('data-salvage-result-difficulty'),
      '3',
      'the yield row reads the referenced component difficulty from the picker source'
    );
  });

  it('emits onDraftChange with updates.salvage carrying authored result-group edits', async () => {
    const calls = [];
    await openComponentSalvageEditor(calls, {
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { enabled: true, simple: {} },
      componentSalvage: {
        enabled: true,
        ingredientQuantity: 2,
        toolIds: ['anvil'],
        dcOverride: null,
        resultGroups: [],
        outcomeRouting: {},
      },
    });

    const section = target.querySelector('[data-salvage-section]');
    section.querySelector('[data-add-salvage-group]').click();
    await tick();
    flushSync();
    target.querySelector('[data-salvage-section] [data-add-salvage-result]').click();
    await tick();
    flushSync();

    // The component header Save submits the edit form and routes through
    // store.updateComponent with the authored salvage payload.
    const saveButton = target.querySelector('button[form="manager-component-edit-form"]');
    assert.ok(saveButton, 'salvage edits should reveal the header Save button');
    assert.equal(saveButton.disabled, false, 'save should be enabled after a salvage edit');
    saveButton.click();
    flushSync();
    await tick();
    flushSync();
    await tick();
    flushSync();

    const updateCall = calls.find((call) => call[0] === 'updateComponent');
    assert.ok(updateCall, 'salvage save should call store.updateComponent');
    assert.equal(updateCall[1], 'c1');
    const salvage = updateCall[2].salvage;
    assert.ok(salvage, 'updates should carry a salvage payload');
    assert.equal(salvage.resultGroups.length, 1, 'one authored result group');
    assert.equal(salvage.resultGroups[0].results.length, 1, 'one authored result in the group');
    // Untouched salvage fields must survive the round-trip (not be dropped).
    assert.equal(salvage.enabled, true, 'enabled should be preserved');
    assert.equal(salvage.ingredientQuantity, 2, 'ingredientQuantity should be preserved');
    assert.deepEqual(salvage.toolIds, ['anvil'], 'toolIds should be preserved');
  });

  it('clears hidden component facet filters when the selected system changes', async () => {
    const store = createStore();
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store,
        services: {
          openCurrentAdmin: () => {},
          onDropItem: () => {},
        },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    // Issue 676: the facet is CATEGORY now.
    const categoryFilter = target.querySelector('[data-component-category-filter]');
    categoryFilter.value = 'Reagent';
    categoryFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);
    assert.ok(target.textContent.includes('Iron Ore'));

    store.selectSystem('smithing');
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-component-category-filter]').value,
      'all',
      'a stale category facet is cleared when the selected system changes'
    );
    assert.equal(target.querySelectorAll('.manager-component-row').length, 1);
    assert.ok(target.textContent.includes('Coal'));
    assert.equal(target.textContent.includes('No components match these filters'), false);
  });

  // ── The selected and edited component card hydrate too (issue 1081) ──────────────────
  describe('component hydration reaches the selected and edited card (issue 1081)', () => {
    /** 30 cards in their own category, so they fill page 1 and push the stored-first card off it. */
    const AETHER_LIBRARY = Array.from({ length: 30 }, (_, index) => ({
      id: `x${String(index + 1).padStart(2, '0')}`,
      name: `Aether ${String(index + 1).padStart(2, '0')}`,
      img: 'icons/svg/item-bag.svg',
      description: '',
      category: 'Aether',
      tags: [],
      essences: [],
      registeredItemUuidDisplay: '',
      hasRegisteredItemUuid: false,
      sourceOrigin: 'unknown',
      sourceOriginLabel: 'Unknown',
      sourceMissing: false,
      showTags: true,
      showEssences: true,
    }));

    function mountManager(storeOptions) {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: {
          store: createStore([], storeOptions),
          services: { openCurrentAdmin: () => {}, onDropItem: () => {} },
        },
      });
      flushSync();
      return target;
    }

    function renderedComponentIds() {
      return Array.from(target.querySelectorAll('[data-component-id]')).map(
        (row) => row.dataset.componentId
      );
    }

    it('asks the OFF-PAGE default selection to hydrate, and no other off-page card', async () => {
      const requests = new Set();
      mountManager({
        extraComponentItems: AETHER_LIBRARY,
        componentHydrationRequests: requests,
      });
      navButton('Component Rules').click();
      await tick();
      flushSync();

      // The fixture's point: `selectedComponentId` starts empty.
      const rendered = renderedComponentIds();
      assert.equal(rendered.length, 25, 'page 1 holds 25 rows');
      assert.equal(rendered.includes('c1'), false, 'and the stored-first card is NOT among them');

      assert.equal(
        requests.has('c1'),
        true,
        'the off-page default selection was asked to hydrate — the inspector renders it, so ' +
          'nothing else in the application will ask'
      );
      // The negative half, in the same fixture against the same spy.
      assert.equal(requests.has('c2'), false, 'an off-page card that is not selected is not asked');
      for (const id of rendered) {
        assert.equal(requests.has(id), true, `the rendered row ${id} was asked`);
      }
    });

    it('asks the EDITED card to hydrate on a route that never mounts the browser', async () => {
      const requests = new Set();
      mountManager({ componentHydrationRequests: requests });

      // The essence-usage thumbnail routes straight into `component-edit`.
      navButton('Essence Rules').click();
      await tick();
      flushSync();
      assert.equal(
        target.querySelectorAll('[data-component-id]').length,
        0,
        'pre-condition: the components browser is not mounted on the Essences route'
      );

      requests.clear();
      target.querySelector('.manager-essence-usage-item').click();
      flushSync();
      await tick();
      flushSync();

      assert.equal(
        target.querySelector('.fabricate-manager').dataset.managerView,
        'component-edit',
        'pre-condition: the thumbnail routed into the component editor'
      );
      assert.equal(
        target.querySelectorAll('[data-component-id]').length,
        0,
        'and the editor route still does not mount the browser, so its page effect cannot ' +
          'be what performs the ask below'
      );
      assert.equal(
        requests.has('c1'),
        true,
        'the edited card was asked to hydrate — otherwise the identity strip shows the stale ' +
          'stored image, "Linked Compendium" for an unresolved source, and an em dash for a ' +
          'description that lives on the source document'
      );
    });

    // The gathering task editor's component picker paginates the SAME `itemCards`.
    it('asks the gathering task picker page to hydrate, on a route with no components browser', async () => {
      const requests = new Set();
      mountManager({ componentHydrationRequests: requests });

      gatheringToggle().click();
      await tick();
      flushSync();
      gatheringSubitem('Tasks').click();
      await tick();
      flushSync();
      target
        .querySelector(
          '[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]'
        )
        .click();
      await tick();
      flushSync();

      assert.equal(
        target.querySelector('.fabricate-manager').dataset.managerView,
        'gathering-task-edit',
        'pre-condition: the task editor is open'
      );
      assert.equal(
        target.querySelectorAll('[data-component-id]').length,
        0,
        'pre-condition: the components browser is not mounted on this route'
      );
      const picked = Array.from(target.querySelectorAll('[data-gathering-component-card]')).map(
        (node) => node.dataset.gatheringComponentCard
      );
      assert.ok(picked.includes('c2'), 'pre-condition: the picker rendered the second component');

      // `c2` is never the inspector's selection and never the editor's subject.
      assert.equal(requests.has('c2'), true, 'the picker asked its own rendered page to hydrate');
    });
  });

  // ── A hydrated card actually REACHES the screen (issue 1081) ─────────────────────────
  describe('a hydrated component card reaches the rendered surfaces (issue 1081)', () => {
    /** The resolution `hydrate()` produces for a linked component whose document is gone. */
    const RESOLVED = Object.freeze({
      description: 'Prose from the source document',
      hasDescription: true,
      sourceMissing: true,
      sourceOrigin: 'missing',
      sourceOriginLabel: 'Missing',
    });

    /**
     * A card in the shape the real projection hands out for a compendium-linked component
     * with NO stored description: the un-hydrated reading, plus the non-enumerable `hydrate`
     * seam. Its promise is settled by the returned `fill`, so the test controls exactly when
     * the resolution lands and can read the DOM on both sides of it.
     */
    function makeLinkedCard(onHydrated) {
      const card = {
        id: 'linked-1',
        name: 'Aether Salt',
        img: 'icons/svg/item-bag.svg',
        description: '',
        hasDescription: false,
        category: 'general',
        tags: [],
        essences: [],
        salvageSummary: null,
        registeredItemUuidDisplay: 'Compendium.pack.Item.source-1',
        hasRegisteredItemUuid: true,
        sourceMissing: false,
        sourceOrigin: 'compendium',
        sourceOriginLabel: 'Linked Compendium',
        showTags: true,
        showEssences: true,
      };
      let settle;
      const pending = new Promise((resolve) => {
        settle = resolve;
      });
      Object.defineProperty(card, 'hydrate', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: () => pending,
      });
      return {
        card,
        // Exactly what the projection's `resolve()` does, in exactly that order.
        fill: () => {
          Object.assign(card, RESOLVED);
          onHydrated(card);
          settle(card);
        },
      };
    }

    /** The store's coalesced republish, over the shipped array transform. */
    function republisher(store) {
      const hydrated = new Set();
      let scheduled = false;
      return (card) => {
        hydrated.add(card);
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const batch = new Set(hydrated);
          hydrated.clear();
          store.viewState.update((state) => ({
            ...state,
            itemCards: republishHydratedItemCards(state.itemCards, batch),
          }));
        });
      };
    }

    async function openComponentStudioWithLinkedCard() {
      const store = createStore([], {});
      const { card, fill } = makeLinkedCard(republisher(store));
      store.viewState.update((state) => ({ ...state, itemCards: [card] }));

      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: { store, services: { openCurrentAdmin: () => {}, onDropItem: () => {} } },
      });
      flushSync();
      navButton('Component Rules').click();
      await tick();
      flushSync();
      return { fill };
    }

    // THE INSPECTOR'S HYDRATED SURFACE IS ITS REMEDIATION PARAGRAPH (issue 1371, parity round 4).
    const inspectorRemediation = () =>
      target.querySelector('[data-component-inspector] [data-component-source-missing]');
    const rowDescription = () =>
      target
        .querySelector('[data-component-id="linked-1"] .manager-system-description')
        .textContent.trim();

    it('replaces the inspector prose and flips the source pill from Linked to Missing', async () => {
      const { fill } = await openComponentStudioWithLinkedCard();

      // CONTROL, same fixture: the pre-hydration reading. The un-hydrated card still reads as a
      // healthy link, so the panel offers nothing to act on — which is what a broken republish
      // would leave on screen forever.
      assert.ok(
        Boolean(target.querySelector('[data-component-inspector]')),
        'pre-condition: the inspector is open on the linked card'
      );
      assert.ok(!inspectorRemediation(), 'pre-condition: and offers no remediation paragraph');

      fill();
      await tick();
      await tick();
      flushSync();

      assert.ok(
        Boolean(inspectorRemediation()),
        'the resolved verdict REACHES the inspector — a fill the GM never sees is the whole ' +
          'defect, and every spy in this repo stays green through it'
      );
      assert.match(
        inspectorRemediation().textContent,
        /no longer resolves/,
        'and it is the sentence that tells the GM what to do about it'
      );
    });

    it('replaces the browser row prose too, through the keyed each and the row props', async () => {
      const { fill } = await openComponentStudioWithLinkedCard();

      assert.equal(
        rowDescription(),
        'No description',
        'pre-condition: the row shows its own (shorter) empty-description fallback'
      );

      fill();
      await tick();
      await tick();
      flushSync();

      assert.equal(
        rowDescription(),
        RESOLVED.description,
        'the row updates as well — the keyed `{#each}` compares the ITEM by `===`, so a card ' +
          'filled in place and handed back is invisible to it'
      );
      assert.ok(
        Boolean(target.querySelector('[data-component-id="linked-1"]')),
        'and the row is the same key, so nothing remounted'
      );
    });
  });

  describe('a dirty component editor guards the way out (issue 1705)', () => {
    /** Open c1's editor over a salvage yield on c2 to leave by, and stage one tag edit into it. */
    async function openDirtyEditor(calls, storeOptions = {}) {
      await openComponentSalvageEditor(calls, {
        salvageResolutionMode: 'progressive',
        componentSalvage: {
          enabled: true,
          resultGroups: [
            { id: 'g1', name: 'Scraps', results: [{ id: 'r1', componentId: 'c2', quantity: 1 }] },
          ],
        },
        ...storeOptions,
      });
      target.querySelector('[data-component-edit-tag-toggle="mineral"]').click();
      await settle();
      assert.equal(
        target.querySelector('button[form="manager-component-edit-form"]').disabled,
        false,
        'the tag never staged, so every exit below has nothing to guard and passes vacuously'
      );
    }

    const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;
    const editedComponent = () =>
      target.querySelector('[data-component-edit-heading] h1.manager-title')?.textContent?.trim();
    const promptCount = (calls) =>
      calls.filter(([name]) => name === 'confirmDiscardDirtyComponentDraft').length;

    it('prompts on a hop to another component, which keeps the view token (issue 676)', async () => {
      const calls = [];
      await openDirtyEditor(calls);
      const yieldEdit = target.querySelector('[data-salvage-result-edit="c2"]');
      assert.ok(Boolean(yieldEdit), 'the salvage yield row rendered no editor link to leave by');
      yieldEdit.click();
      await settleRouteExit();

      assert.equal(
        promptCount(calls),
        1,
        'the component row waives no navigation, not even one that keeps the view token, so a ' +
          'hop to another component must ask before it abandons the staged tag'
      );
      assert.equal(managerView(), 'component-edit');
      assert.equal(editedComponent(), 'Glass Vial', 'and the discarded exit lands on the yield');
    });

    /** What each answer to the prompt does to the store and to where the GM ends up. */
    const EXIT_ANSWERS = [
      { answer: 'save', writes: true },
      { answer: 'discard', writes: false },
    ];

    for (const { answer, writes } of EXIT_ANSWERS) {
      it(`carries a ${answer} from the prompt to the components browser`, async () => {
        const calls = [];
        await openDirtyEditor(calls, { confirmDiscardComponentResult: answer });
        navButton('Component Rules').click();
        await settleRouteExit();

        assert.equal(promptCount(calls), 1, 'the exit raised exactly one prompt');
        const written = calls.find(([name]) => name === 'updateComponent');
        assert.equal(
          Boolean(written),
          writes,
          `a ${answer} must reach this row's own finisher, which is the only thing that writes`
        );
        if (writes) assert.ok(written[2].tags.includes('mineral'), 'and it wrote the staged tag');
        assert.equal(managerView(), 'components', 'and the GM leaves the editor either way');
      });
    }
  });
}
