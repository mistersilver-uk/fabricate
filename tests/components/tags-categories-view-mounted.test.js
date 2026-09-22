/**
 * Mounted coverage for the system Tags & Categories screen (issues 924, 1915). The tabs are gone:
 * the three vocabularies mount SIMULTANEOUSLY through the shared vocabulary shell, so what this
 * file proves is that they are all present, independently sorted, and cannot reach each other.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tags-categories-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    // Each vocabulary panel's lifted search term and sort pair (issues 1438, 1915).
    'src/ui/model/managerBrowserViewState.js',
    'src/utils/scalars.js',
    // The shared shell's pure leaf and this screen's presentation model (issue 1915).
    'src/ui/svelte/apps/manager/vocabularyShell.js',
    'src/ui/svelte/apps/manager/systemVocabularyStudio.js',
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled)
    // rather than failing it, so the whole static closure is declared.
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    'src/ui/svelte/apps/manager/VocabularyPanel.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). VocabularyPanel`s confirm pair and InlineVocabularyAdd`s Add render it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    // The shared shell and the sort toolbar it hangs each panel's controls on (issue 1915). The
    // tab strip and `EditorTabs` behind it left this tree with the tabs.
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/apps/manager/VocabularyShell.svelte',
    'src/ui/svelte/apps/manager/VocabularyShellPanel.svelte',
    'src/ui/svelte/apps/manager/TagsCategoriesView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte',
});

const KINDS = ['recipeCategories', 'componentCategories', 'componentTags'];
const panelSelector = (kind) => `[data-vocabulary-panel="${kind}"]`;

function row(id, name, totalUsage = 0) {
  return { id, name, totalUsage };
}

function mountProps(overrides = {}) {
  return {
    // Name order and reference order DISAGREE, so a sort assertion can tell them apart.
    categoryRows: [
      row('general', 'General'),
      row('potions', 'Potions', 1),
      row('alloys', 'Alloys', 5),
    ],
    componentCategoryRows: [row('general', 'General'), row('reagent', 'Reagent', 2)],
    tagRows: [row('herb', 'herb', 5), row('ash', 'ash')],
    ...overrides,
  };
}

const namesIn = (root, kind, rowAttr) =>
  [
    ...root.querySelectorAll(
      `${panelSelector(kind)} [${rowAttr}]:not(.is-locked) .manager-vocabulary-main strong`
    ),
  ].map((element) => element.textContent);

describe('TagsCategoriesView (mounted)', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('mounts all three vocabularies at once, with no tab machinery left', async () => {
    const root = await harness.mount(mountProps());

    for (const kind of KINDS) {
      assert.ok(Boolean(root.querySelector(panelSelector(kind))), `${kind} panel renders`);
    }
    // THE RETIREMENT, STATED AS AN ABSENCE. A strip left behind would keep two of the three
    // vocabularies hidden and every assertion below would be about the one on screen.
    assert.equal(
      root.querySelectorAll('[role="tablist"], [role="tab"], [role="tabpanel"]').length,
      0,
      'the tab strip and its panel wrapper are gone, roles included'
    );
    assert.ok(
      !root.querySelector('.manager-vocabulary-tabs, .manager-tags-categories-workspace'),
      'and so are both of the classes the stylesheet drew them with'
    );

    const main = root.querySelector('main.manager-main.manager-tags-categories');
    assert.ok(Boolean(main), 'the route keeps its own page hook');
    // ONE CHILD, because `.manager-main` is `grid-template-rows: minmax(0, 1fr)` on this route.
    assert.equal(main.children.length, 1, '<main> renders exactly one element child');
  });

  it('names exactly three vocabulary regions, one per panel', async () => {
    const root = await harness.mount(mountProps());

    const regions = [...root.querySelectorAll('section.manager-vocabulary-panel[aria-label]')];
    assert.equal(regions.length, 3, 'one named region per vocabulary');
    assert.equal(
      new Set(regions.map((region) => region.getAttribute('aria-label'))).size,
      3,
      'three identical names would mean the per-kind copy table had collapsed to one entry'
    );
    for (const kind of KINDS) {
      assert.equal(
        root.querySelector(panelSelector(kind)).getAttribute('aria-label'),
        null,
        'the shell panel carries no name of its own: the primitive inside it is the landmark, ' +
          'and two nested named regions would announce the same vocabulary twice'
      );
    }
  });

  it('gives each panel its own row hook, add field and sort-label id', async () => {
    const root = await harness.mount(mountProps());

    for (const [kind, rowAttr] of [
      ['recipeCategories', 'data-category-id'],
      ['componentCategories', 'data-component-category-id'],
      ['componentTags', 'data-tag-id'],
    ]) {
      assert.ok(
        root.querySelector(`${panelSelector(kind)} [${rowAttr}]`),
        `${rowAttr} resolves rows inside its own panel`
      );
    }
    const inputIds = [...root.querySelectorAll('input[id^="manager-"]')].map((el) => el.id);
    assert.equal(new Set(inputIds).size, inputIds.length, 'no two add fields share an id');

    const labels = [...root.querySelectorAll('.manager-vocabulary-shell-sort-label')];
    assert.equal(labels.length, 3, 'one Sort by label per panel');
    for (const select of root.querySelectorAll('select[data-vocabulary-sort]')) {
      const target = root.querySelector(`#${select.getAttribute('aria-labelledby')}`);
      assert.ok(Boolean(target), 'each sort select names a label that exists');
      assert.equal(
        target.closest('[data-vocabulary-panel]'),
        select.closest('[data-vocabulary-panel]'),
        'and it is the label inside its OWN panel'
      );
    }
  });

  it('sorts one panel by references without touching the others', async () => {
    // UNBOUND, which is the isolated-mount path: with no lifted slot the panel falls back to its
    // own `$state`, and that fallback is what makes these controls reactive outside the root.
    const root = await harness.mount(mountProps());
    assert.deepEqual(namesIn(root, 'recipeCategories', 'data-category-id'), ['Alloys', 'Potions']);

    const select = root.querySelector(
      `${panelSelector('recipeCategories')} select[data-vocabulary-sort]`
    );
    select.value = 'references';
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(
      namesIn(root, 'recipeCategories', 'data-category-id'),
      ['Potions', 'Alloys'],
      '1 then 5 ascending, which is the REVERSE of the name order the same rows start in'
    );

    const toggle = () =>
      root.querySelector(`${panelSelector('recipeCategories')} button[data-vocabulary-direction]`);
    assert.equal(toggle().getAttribute('aria-pressed'), 'true', 'ascending is the resting state');
    toggle().click();
    flushSync();
    assert.deepEqual(namesIn(root, 'recipeCategories', 'data-category-id'), ['Alloys', 'Potions']);
    assert.equal(toggle().getAttribute('aria-pressed'), 'false');

    // THE NEIGHBOURS ARE UNMOVED. Three panels share one screen, so a sort written to the wrong
    // slot would reorder a vocabulary nobody touched.
    assert.deepEqual(namesIn(root, 'componentTags', 'data-tag-id'), ['#ash', '#herb']);
    assert.equal(
      root
        .querySelector(`${panelSelector('componentTags')} button[data-vocabulary-direction]`)
        .getAttribute('aria-pressed'),
      'true',
      'and its direction toggle is still at rest'
    );
  });

  it('writes the sort into the lifted slot and reads it back, so it survives the route trip', async () => {
    // THE HALF THE ROUTE TRIP DEPENDS ON, asserted on the OBJECT rather than through a remount:
    // the slot is the root's own `$state` in the product, and a plain object here would not be
    // reactive - but the write and the read are what make the trip work, and both are observable.
    const lifted = { searchTerm: '', sortKey: 'name', sortDirection: 'asc' };
    const root = await harness.mount(mountProps({ recipeCategoryBrowserState: lifted }));

    const select = root.querySelector(
      `${panelSelector('recipeCategories')} select[data-vocabulary-sort]`
    );
    select.value = 'references';
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    root
      .querySelector(`${panelSelector('recipeCategories')} button[data-vocabulary-direction]`)
      .click();
    flushSync();
    assert.deepEqual(
      lifted,
      { searchTerm: '', sortKey: 'references', sortDirection: 'desc' },
      'both axes are written into the slot the root owns, beside the search term'
    );

    await harness.remount();
    const returned = await harness.mount(mountProps({ recipeCategoryBrowserState: lifted }));
    assert.deepEqual(
      namesIn(returned, 'recipeCategories', 'data-category-id'),
      ['Alloys', 'Potions'],
      'and a fresh mount against that slot comes back sorted by references, descending'
    );
    assert.equal(
      returned
        .querySelector(`${panelSelector('recipeCategories')} button[data-vocabulary-direction]`)
        .getAttribute('aria-pressed'),
      'false',
      'with the toggle stating the direction it is actually sorting in'
    );
    assert.equal(
      returned.querySelector(`${panelSelector('recipeCategories')} select[data-vocabulary-sort]`)
        .value,
      'references',
      'and the select showing the key it is actually sorting on'
    );
  });

  it('locks General and offers the icon picker on the two CATEGORY panels only', async () => {
    const root = await harness.mount(mountProps());

    for (const kind of ['recipeCategories', 'componentCategories']) {
      const panel = root.querySelector(panelSelector(kind));
      const locked = panel.querySelector('.manager-vocabulary-card.is-locked');
      assert.ok(Boolean(locked), `${kind} renders the reserved General row`);
      assert.match(locked.textContent, /General/);
      assert.ok(
        !locked.querySelector('.fabricate-icon-button'),
        'and the reserved row offers no delete control'
      );
      assert.ok(
        Boolean(panel.querySelector('[data-vocabulary-icon-picker]')),
        `${kind} rows carry the persisted per-row icon picker`
      );
    }

    const tags = root.querySelector(panelSelector('componentTags'));
    assert.ok(
      !tags.querySelector('.manager-vocabulary-card.is-locked'),
      'component tags have no reserved bucket, so nothing is locked'
    );
    assert.ok(
      !tags.querySelector('[data-vocabulary-icon-picker]'),
      'and no tag row carries a persisted icon'
    );
    assert.ok(
      Boolean(tags.querySelector('.manager-vocabulary-icon.is-decorative')),
      'it takes the fixed decorative tile instead'
    );
    assert.match(
      tags.querySelector('[data-tag-id="herb"] .manager-vocabulary-main strong').textContent,
      /^#herb$/,
      'the # is DISPLAY only, and the tag panel is the one that draws it'
    );
  });

  it('arms a delete in one panel and leaves every other panel unarmed', async () => {
    const root = await harness.mount(mountProps());

    root
      .querySelector(`${panelSelector('componentCategories')} [data-component-category-id="reagent"] .fabricate-icon-button`)
      .click();
    flushSync();

    assert.ok(
      Boolean(root.querySelector('[data-vocabulary-confirm="reagent"]')),
      'the row the GM armed opens its confirm strip'
    );
    assert.equal(
      root.querySelectorAll('[data-vocabulary-confirm]').length,
      1,
      'and it is the ONLY armed strip on the screen: `pendingRemovalId` is component-local, so ' +
        'three panels sharing one arm would offer three deletes for one click'
    );
    for (const kind of ['recipeCategories', 'componentTags']) {
      assert.ok(
        !root.querySelector(`${panelSelector(kind)} [data-vocabulary-confirm]`),
        `${kind} stays unarmed`
      );
    }
  });

  it('routes each panel’s add and remove to that vocabulary’s own writer', async () => {
    const calls = [];
    const record = (name) => (value) => calls.push(`${name}:${value}`);
    const root = await harness.mount(
      mountProps({
        onAddCategory: record('addCategory'),
        onAddComponentCategory: record('addComponentCategory'),
        onAddTag: record('addTag'),
        onRemoveTag: record('removeTag'),
      })
    );

    const input = root.querySelector('input#manager-tag-add');
    input.value = '  Moss  ';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    root
      .querySelector(`${panelSelector('componentTags')} [data-inline-vocabulary-add]`)
      .dispatchEvent(new globalThis.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    flushSync();
    // NORMALIZED, and routed to the TAG writer rather than to either category writer.
    assert.deepEqual(calls, ['addTag:moss']);

    // A REFERENCED row, so the two-step confirm is the path under test; an unreferenced one
    // deletes on the first click and would never reach the confirm pair.
    const herb = root.querySelector(`${panelSelector('componentTags')} [data-tag-id="herb"]`);
    herb.querySelector('.fabricate-icon-button').click();
    flushSync();
    root.querySelector('[data-vocabulary-confirm-remove]').click();
    flushSync();
    assert.deepEqual(
      calls,
      ['addTag:moss', 'removeTag:herb'],
      'the remove carries the row NAME, not the `#herb` the panel DISPLAYS'
    );
  });
});
