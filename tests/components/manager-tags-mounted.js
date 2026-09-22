/**
 * The Tags & Categories route: three vocabularies on one screen, their icons, counters and
 * cascade-safe delete. Since issue 1915 there are no tabs, so every locator below is scoped to
 * its own `[data-vocabulary-panel]` - an unscoped one now matches the first of three panels.
 */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries, setInputValue } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { managerComponents, settleBetweenTests } from './manager-mounted-shared.js';
import { normalizeVocabularyKey } from '../../src/ui/model/vocabularyUsage.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { navButton, vocabularyCounters } = queries;

/** One vocabulary panel's subtree. Three are mounted at once, so nothing is asked of `target`. */
const panelFor = (kind) => target.querySelector(`[data-vocabulary-panel="${kind}"]`);

/** Submit one panel's add form, exactly as pressing Enter in its field does. */
function submitAddForm(kind) {
  panelFor(kind)
    .querySelector('form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
const { mountManager, openTagsScreen } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerTagsCases() {
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


  it('routes to the tags and categories screen with live validation, icons, and cascade-safe inline delete (issue 689)', async () => {
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

    const tagsButton = navButton('Tags & Categories');
    assert.ok(tagsButton, 'tags/categories nav button should render for selected systems');
    assert.equal(tagsButton.disabled, false);
    tagsButton.click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'tags');
    // The three vocabularies mount SIMULTANEOUSLY since issue 1915; none is behind a tab.
    assert.ok(panelFor('recipeCategories'));
    assert.ok(panelFor('componentCategories'));
    assert.ok(panelFor('componentTags'));
    assert.ok(
      target.textContent.includes('potions'),
      'the recipe-category panel shows its custom category'
    );
    assert.ok(target.querySelector('[data-category-id="general"]').textContent.includes('Locked'));
    // A referenced category carries a per-category icon on its row.
    assert.ok(
      target.querySelector(
        '[data-vocabulary-icon-picker="potions"] .essence-icon-picker-trigger.manager-vocabulary-icon-trigger i'
      ),
      'the row icon renders the shared IconPicker trigger'
    );

    // Item 5 of issue 878: the view renders NO page header of its own.
    assert.equal(
      target.querySelector('.manager-tags-categories .manager-section-header'),
      null,
      'the tags route must not render a second page header'
    );
    // Issue 1915: the strip is RETIRED, roles and classes together, and each panel carries its
    // own head and sort control instead.
    assert.equal(
      target.querySelectorAll('[data-vocabulary-tab], .manager-vocabulary-tabs').length,
      0,
      'no tab strip survives on this route'
    );
    for (const kind of ['recipeCategories', 'componentCategories', 'componentTags']) {
      assert.ok(
        panelFor(kind).querySelector('.manager-vocabulary-shell-head h3'),
        `the ${kind} panel states its own title in its head`
      );
      assert.ok(
        panelFor(kind).querySelector('select[data-vocabulary-sort]'),
        `the ${kind} panel carries its own sort control`
      );
    }

    // Issue 1915: the inspector rail is RETIRED, so the whole route runs without an aside and
    // nothing on screen states a total across the three vocabularies.
    assert.equal(
      target.querySelectorAll('[data-tags-evidence], [data-tags-category-fact]').length,
      0,
      'no at-a-glance tile or explainer card survives the retired rail'
    );
    assert.ok(
      !target.querySelector('.manager-inspector'),
      'the tags route renders no inspector aside at all'
    );

    // Live validation: the reserved bucket flags danger as you type, before submit.
    const categoryInput = target.querySelector('#manager-category-add');
    setInputValue(categoryInput, 'General');
    await tick();
    flushSync();
    assert.ok(panelFor('recipeCategories').querySelector('.manager-vocabulary-hint.is-danger'));
    assert.ok(target.textContent.includes('General is already available as the base category.'));
    submitAddForm('recipeCategories');
    await tick();
    flushSync();
    assert.ok(
      !calls.some((call) => call[0] === 'addCategory'),
      'a blocked add never reaches the store'
    );

    // A valid add shows a success hint and delegates. The icon field is the shared
    // IconPicker now (issue 878), and an UNTOUCHED one stays empty so the row still
    // falls back to the default folder glyph — the picked-icon path is its own test.
    setInputValue(categoryInput, 'Elixirs');
    await tick();
    flushSync();
    assert.ok(panelFor('recipeCategories').querySelector('.manager-vocabulary-hint.is-success'));
    submitAddForm('recipeCategories');
    await tick();
    await tick();
    flushSync();
    const addCall = calls.find((call) => call[0] === 'addCategory');
    assert.deepEqual(addCall, ['addCategory', 'Elixirs', '']);
    assert.equal(categoryInput.value, '');

    // Per-PANEL search filters only its own vocabulary and shows an empty state; the two
    // neighbours on the same screen keep every row.
    const search = panelFor('recipeCategories').querySelector(
      '.manager-vocabulary-search input[type="search"]'
    );
    setInputValue(search, 'zzzz');
    await tick();
    flushSync();
    assert.ok(
      panelFor('recipeCategories').textContent.includes('No matches for "zzzz".'),
      'the searched panel states the miss'
    );
    assert.ok(
      panelFor('componentTags').querySelector('[data-tag-id]'),
      'and the tag panel beside it still lists its rows'
    );
    setInputValue(search, '');
    await tick();
    flushSync();

    // Deleting a referenced category confirms inline, then cascades through the store.
    target.querySelector('[aria-label="Remove category potions"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-vocabulary-confirm="potions"]'),
      'a referenced delete opens an inline confirm strip'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'removeCategory'),
      'nothing is removed before confirming'
    );
    target.querySelector('[data-vocabulary-confirm="potions"] .manager-button.is-danger').click();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'removeCategory' && call[1] === 'potions'));

    // The tag panel lowercases as you type and delegates the normalized value.
    assert.ok(panelFor('componentTags').querySelector('[data-tag-id="ore"]'), 'it lists item tags');
    // Tag rows carry a fixed, non-editable decorative accent tile (issue 689 fidelity):
    const tagIconTile = panelFor('componentTags').querySelector(
      '[data-tag-id="ore"] .manager-vocabulary-icon.is-decorative'
    );
    assert.ok(tagIconTile, 'each tag row renders a decorative accent icon tile');
    assert.ok(
      tagIconTile.querySelector('i.fa-hashtag'),
      'the decorative tag tile wears the tag vocabulary’s own glyph, the one heading its panel'
    );
    assert.ok(
      !target.querySelector('[data-tag-id="ore"] [data-vocabulary-icon-picker]'),
      'the tag tile is decorative, not an icon picker'
    );
    const tagInput = target.querySelector('#manager-tag-add');
    setInputValue(tagInput, 'SPICE');
    await tick();
    flushSync();
    assert.ok(panelFor('componentTags').querySelector('.manager-vocabulary-hint.is-info'));
    assert.ok(target.textContent.includes('Will be added as "spice"'));
    submitAddForm('componentTags');
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addTag' && call[1] === 'spice'));
    assert.equal(tagInput.value, '');

    // An UNUSED entry deletes in one click, matching the prototype.
    assert.ok(
      panelFor('componentTags').querySelector('[data-tag-id="herb"] .manager-vocabulary-chip-unused'),
      'the unused tag row is flagged Unused'
    );
    target.querySelector('[aria-label="Remove tag herb"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-vocabulary-confirm="herb"]'),
      null,
      'an unused delete never opens a confirm strip'
    );
    assert.ok(
      calls.some((call) => call[0] === 'removeTag' && call[1] === 'herb'),
      'an unused delete reaches the store directly in one click'
    );
  });

  it('manages COMPONENT categories as an independent panel, distinct from recipe categories (issue 676, 689)', async () => {
    // The three vocabularies are panels on one screen (issues 689, 1915).
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
    navButton('Tags & Categories').click();
    await tick();
    flushSync();

    const panel = panelFor('componentCategories');
    assert.ok(panel, 'the component-categories vocabulary renders its own panel');
    // The seeded vocabulary reaches it through the selectedSystem viewState projection.
    assert.ok(
      target.querySelector('[data-component-category-id="reagent"]'),
      'the authored component category renders as its own row'
    );
    assert.ok(
      target.querySelector('[data-component-category-id="general"]'),
      'the reserved General row renders, locked'
    );
    // The recipe vocabulary is a different PANEL on the same screen, so its rows carry a
    // different hook and never resolve inside this one.
    assert.equal(
      panel.querySelector('[data-category-id]'),
      null,
      'the recipe vocabulary never leaks into the component panel'
    );

    // The reserved bucket is refused before it can reach the store (live-blocked).
    const input = target.querySelector('#manager-component-category-add');
    setInputValue(input, 'General');
    await tick();
    flushSync();
    submitAddForm('componentCategories');
    await tick();
    flushSync();
    assert.ok(!calls.some((call) => call[0] === 'addComponentCategory'));

    // A real add reaches the store's COMPONENT action — not addCategory.
    setInputValue(input, 'Metal');
    await tick();
    flushSync();
    submitAddForm('componentCategories');
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addComponentCategory' && call[1] === 'Metal'));
    assert.ok(
      !calls.some((call) => call[0] === 'addCategory'),
      'the recipe vocabulary is never written by the component panel'
    );
    assert.equal(input.value, '');

    // Removal opens an inline confirm strip under its own kind; cancelling writes nothing.
    target.querySelector('[aria-label="Remove component category Reagent"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-vocabulary-confirm="reagent"]'));
    target
      .querySelector('[data-vocabulary-confirm="reagent"] .manager-button:not(.is-danger)')
      .click();
    await tick();
    flushSync();
    assert.ok(!target.querySelector('[data-vocabulary-confirm="reagent"]'));
    assert.ok(!calls.some((call) => call[0] === 'removeComponentCategory'));

    // Confirming it does cascade, under the component kind's own store action.
    target.querySelector('[aria-label="Remove component category Reagent"]').click();
    await tick();
    flushSync();
    target.querySelector('[data-vocabulary-confirm="reagent"] .manager-button.is-danger').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'removeComponentCategory' && call[1] === 'Reagent'),
      'the confirmed removal reaches removeComponentCategory with the authored label'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'removeCategory'),
      'and never through the recipe vocabulary'
    );
  });

  it('counts the reserved General bucket in the rail badge, the entry chip and the rows alike (issue 878)', async () => {
    // Three counters used to disagree on one screen.
    await openTagsScreen();

    // The fixture seeds exactly one custom recipe category (`potions`) and one custom
    // component category (`Reagent`), so a correct category counter reads 2. A counter
    // still subtracting General reads 1 and one double-counting it reads 3. The RAIL badge is
    // the whole screen's vocabulary, so it is the sum of all three: 2 + 2 + 3.
    assert.deepEqual(
      vocabularyCounters('recipeCategories', 'data-category-id'),
      { railBadge: '7', entryChip: '2 entries', rowCount: 2 },
      'one custom recipe category plus General is two, on the panel and in its rows'
    );
    // With a custom entry present General has something to be distinguished FROM.
    assert.ok(
      panelFor('recipeCategories').querySelector('[data-category-id="general"]'),
      'the reserved row is listed once a custom category exists'
    );

    assert.deepEqual(
      vocabularyCounters('componentCategories', 'data-component-category-id'),
      { railBadge: '7', entryChip: '2 entries', rowCount: 2 },
      'the sibling component vocabulary counts its own General the same way, at the same time'
    );
    assert.ok(
      panelFor('componentCategories').querySelector('[data-component-category-id="general"]')
    );

    // Tags are the control: they pass `lockedRow={null}` and have no reserved bucket at
    // all, so their counters equal the raw tag count with nothing added.
    assert.deepEqual(
      vocabularyCounters('componentTags', 'data-tag-id'),
      { railBadge: '7', entryChip: '3 entries', rowCount: 3 },
      'the tag vocabulary has no reserved bucket, so nothing is added to its count'
    );
  });

  it('leaves General out of the list until the first custom category exists, and explains it in the empty state (issue 878)', async () => {
    // With no GM-defined categories the reserved row was the only thing in the list.
    await openTagsScreen([], {
      selectedSystemOverrides: { categories: [], componentCategories: [] },
    });

    assert.deepEqual(
      vocabularyCounters('recipeCategories', 'data-category-id'),
      { railBadge: '5', entryChip: '1 entry', rowCount: 0 },
      'General is counted even while it is not listed, the chip reads as a singular, and no ' +
        'rows at all render for an empty recipe-category vocabulary, General included'
    );

    const emptyPanel = panelFor('recipeCategories').querySelector('.manager-vocabulary-empty-panel');
    assert.ok(emptyPanel, 'the empty-state card renders in place of the reserved row');
    assert.ok(
      emptyPanel.textContent.includes('Only General so far'),
      'the card names General, so the counter reading 1 has a visible referent'
    );
    assert.ok(
      emptyPanel.textContent.includes('Every recipe falls under General until you add one.'),
      'the card explains what General does rather than merely naming it'
    );
    assert.ok(
      !emptyPanel.classList.contains('is-compact'),
      'the card is the full panel now that it is the only thing in the list'
    );

    assert.deepEqual(
      vocabularyCounters('componentCategories', 'data-component-category-id'),
      { railBadge: '5', entryChip: '1 entry', rowCount: 0 },
      'the component vocabulary resolves the same way from its own reserved bucket'
    );
    assert.ok(
      panelFor('componentCategories')
        .querySelector('.manager-vocabulary-empty-panel')
        .textContent.includes('Every component falls under General until you add one.'),
      'the component card explains its own General, not the recipe one'
    );

    // Tags again as the control: suppressing a reserved row never touches the vocabulary that
    // has none, and it is rendered beside the two empty ones rather than behind a tab.
    assert.deepEqual(
      vocabularyCounters('componentTags', 'data-tag-id'),
      { railBadge: '5', entryChip: '3 entries', rowCount: 3 },
      'suppressing a reserved row never touches the vocabulary that has none'
    );
  });

  /** Open one vocabulary row's icon picker, search it, and take the first option. */
  async function chooseRowIcon(rowId, query) {
    const picker = target.querySelector(`[data-vocabulary-icon-picker="${rowId}"]`);
    assert.ok(Boolean(picker), `the ${rowId} row renders the shared IconPicker trigger`);
    picker.querySelector('.essence-icon-picker-trigger').click();
    await tick();
    flushSync();
    const popover = target.querySelector('.essence-icon-picker-popover');
    assert.ok(Boolean(popover), 'the searchable icon popover opens');
    const search = popover.querySelector('.essence-icon-picker-search input');
    assert.ok(Boolean(search), 'the popover leads with a search box');
    setInputValue(search, query);
    await tick();
    flushSync();
    const option = popover.querySelector('.essence-icon-picker-option');
    assert.ok(Boolean(option), 'the search narrows the option list');
    option.click();
    await tick();
    flushSync();
  }

  it('picks a per-category icon from the searchable popover and delegates it to the store (issue 878)', async () => {
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
    navButton('Tags & Categories').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-vocabulary-icon-edit="potions"]'),
      null,
      'the free-text icon-edit strip is gone'
    );
    await chooseRowIcon('potions', 'vial');
    assert.deepEqual(
      calls.find((call) => call[0] === 'setCategoryIcon'),
      ['setCategoryIcon', 'potions', 'fas fa-vial'],
      'choosing an option commits immediately — no separate save step'
    );
    assert.equal(
      target.querySelector('.essence-icon-picker-popover'),
      null,
      'the popover closes once an icon is chosen'
    );
  });

  // The component vocabulary has its own icon seam (issue 676): the two tabs must not write
  // through one another's store action.
  it('commits a component-category icon through the component seam alone', async () => {
    const calls = [];
    await openTagsScreen(calls);

    await chooseRowIcon('reagent', 'vial');

    assert.deepEqual(
      calls.find((call) => call[0] === 'setComponentCategoryIcon'),
      ['setComponentCategoryIcon', 'Reagent', 'fas fa-vial'],
      'choosing an option commits immediately, under the component action'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'setCategoryIcon'),
      'and never through the recipe vocabulary'
    );
  });

  it('adds a category with an icon chosen from the same searchable popover (issue 878)', async () => {
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
    navButton('Tags & Categories').click();
    await tick();
    flushSync();

    // The add form's icon field is the SAME control as the row tile. BOTH category panels draw
    // one now, so it is taken from the recipe panel by name rather than from the document.
    const iconField = panelFor('recipeCategories').querySelector('[data-vocabulary-add-icon]');
    assert.ok(iconField, 'the add form renders an icon field');
    assert.equal(
      panelFor('componentTags').querySelector('[data-vocabulary-add-icon]'),
      null,
      'and the tag vocabulary, which has no persisted row icon, renders none'
    );
    assert.equal(
      iconField.querySelector('input'),
      null,
      'the add form icon field is a picker, not a Font Awesome class box'
    );
    const trigger = iconField.querySelector(
      '.essence-icon-picker-trigger.manager-vocabulary-icon-trigger'
    );
    assert.ok(trigger, 'the add form icon field renders the shared IconPicker trigger');

    trigger.click();
    await tick();
    flushSync();
    const popover = target.querySelector('.essence-icon-picker-popover');
    setInputValue(popover.querySelector('.essence-icon-picker-search input'), 'vial');
    await tick();
    flushSync();
    popover.querySelector('.essence-icon-picker-option').click();
    await tick();
    flushSync();

    setInputValue(target.querySelector('#manager-category-add'), 'Elixirs');
    await tick();
    flushSync();
    submitAddForm('recipeCategories');
    await tick();
    await tick();
    flushSync();
    assert.deepEqual(
      calls.find((call) => call[0] === 'addCategory'),
      ['addCategory', 'Elixirs', 'fas fa-vial'],
      'the picked icon rides along with the new category'
    );
  });

  it('keeps tags and categories add inputs when store add callbacks fail (issue 689)', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          addCategoryResult: false,
          addTagReject: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Tags & Categories').click();
    await tick();
    flushSync();

    const categoryInput = target.querySelector('#manager-category-add');
    setInputValue(categoryInput, 'Elixirs');
    await tick();
    flushSync();
    submitAddForm('recipeCategories');
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addCategory' && call[1] === 'Elixirs'));
    assert.equal(categoryInput.value, 'Elixirs');
    assert.equal(document.activeElement, categoryInput);
    assert.ok(target.textContent.includes('Category could not be added.'));

    const tagInput = target.querySelector('#manager-tag-add');
    setInputValue(tagInput, 'spice');
    await tick();
    flushSync();
    submitAddForm('componentTags');
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addTag' && call[1] === 'spice'));
    assert.equal(tagInput.value, 'spice');
    assert.equal(document.activeElement, tagInput);
    assert.ok(target.textContent.includes('Tag could not be added.'));
  });

  // ── Case-only duplicates collapse to one row rather than crashing the list (issue 1397) ──
  describe('two entries differing only in case (issue 1397)', () => {
    /** Every row id one panel renders, in document order. */
    const rowIds = (kind, rowAttr) =>
      [...panelFor(kind).querySelectorAll(`[${rowAttr}]`)].map((row) =>
        row.getAttribute(rowAttr)
      );

    /** One row's visible name. */
    const rowName = (kind, rowAttr, id) =>
      panelFor(kind)
        .querySelector(`[${rowAttr}="${id}"] .manager-vocabulary-main strong`)
        .textContent.trim();

    it('renders one row per normalized key across all three vocabularies', async () => {
      // Before issue 1397 each pair minted two rows under one `id`, and Svelte's keyed `{#each}`
      // threw `each_key_duplicate` while the screen was rendering - so the whole route died.
      await openTagsScreen([], {
        selectedSystemOverrides: {
          categories: ['Potions', 'potions'],
          componentCategories: ['Reagent', 'reagent'],
          itemTags: ['general', 'herb', 'HERB'],
        },
      });

      assert.deepEqual(rowIds('recipeCategories', 'data-category-id'), ['general', 'potions']);
      assert.deepEqual(rowIds('componentCategories', 'data-component-category-id'), [
        'general',
        'reagent',
      ]);
      // `general` is a TAG here, not a reserved bucket: the tag vocabulary prepends no locked row,
      // so dropping the key left a stored, referenced, counted tag no GM could manage.
      assert.deepEqual(rowIds('componentTags', 'data-tag-id'), ['general', 'herb']);
      // The FIRST spelling in stored order is the one that survives.
      assert.equal(rowName('recipeCategories', 'data-category-id', 'potions'), 'Potions');
      assert.equal(rowName('componentCategories', 'data-component-category-id', 'reagent'), 'Reagent');
      // Tag rows render their name `#`-prefixed, which is the row anatomy rather than the entry.
      assert.equal(rowName('componentTags', 'data-tag-id', 'herb'), '#herb');
    });

    it('discloses the spellings behind a collapsed row, and nothing behind a single one', async () => {
      // The one disclosure the collapse has: pointer-only, so it reaches neither the keyboard nor
      // a screen reader, and it is the reason the storage half is still issue 1411's to reconcile.
      await openTagsScreen([], {
        selectedSystemOverrides: {
          categories: ['Potions', 'potions'],
          itemTags: ['general', 'herb', 'HERB'],
        },
      });

      const mainOf = (kind, rowAttr, id) =>
        panelFor(kind).querySelector(`[${rowAttr}="${id}"] .manager-vocabulary-main`);
      assert.equal(
        mainOf('recipeCategories', 'data-category-id', 'potions').getAttribute('title'),
        'Potions, potions'
      );
      assert.equal(
        mainOf('componentTags', 'data-tag-id', 'herb').getAttribute('title'),
        'herb, HERB'
      );
      assert.ok(
        !mainOf('componentTags', 'data-tag-id', 'general').hasAttribute('title'),
        'a row standing for one spelling says nothing under the cursor'
      );
    });

    it('counts a custom General as the locked row it collides with, not as a second entry', async () => {
      // The other half of the defect: the two category builders PREPEND the locked General row,
      // so a GM-authored `General` produced a second row under an id the list already held.
      // The COUNTERS are what see this one. `splitGeneralRow` lifts every `general`-id row out of
      // the custom list before it is rendered, so the duplicate never reaches the keyed `{#each}`
      // and the row list alone cannot tell a collapsed pair from a correct build.
      await openTagsScreen([], {
        selectedSystemOverrides: { categories: ['General', 'Potions'], componentCategories: [] },
      });

      assert.deepEqual(
        vocabularyCounters('recipeCategories', 'data-category-id'),
        { railBadge: '6', entryChip: '2 entries', rowCount: 2 },
        'General plus one custom category is two entries in the panel and two of the six the ' +
          'rail badge sums, not three'
      );
      assert.deepEqual(rowIds('recipeCategories', 'data-category-id'), ['general', 'potions']);
      assert.ok(
        panelFor('recipeCategories')
          .querySelector('[data-category-id="general"]')
          .textContent.includes('Locked'),
        'the surviving General row is the locked reserved one, not the GM-authored duplicate'
      );
    });

    it('takes every spelling with it when the collapsed row is deleted', async () => {
      // Storage stays case-preserving, but the DELETE is keyed: `adminStore.removeCategory` drops
      // every spelling that collapses to the row's key, because its cascade has already reassigned
      // the records under all of them. A survivor would come back as an orphaned `Unused` row.
      const stored = ['Potions', 'potions'];
      const calls = [];
      await openTagsScreen(calls, { selectedSystemOverrides: { categories: stored } });

      target.querySelector('[aria-label="Remove category Potions"]').click();
      await tick();
      flushSync();
      target.querySelector('[data-vocabulary-confirm="potions"] .manager-button.is-danger').click();
      await tick();
      flushSync();
      assert.ok(
        calls.some((call) => call[0] === 'removeCategory' && call[1] === 'Potions'),
        'the delete reaches the store with the AUTHORED label of the spelling on screen'
      );

      // What storage then holds, under the store's own rule rather than a hand-written answer;
      // `tests/admin-store-vocabulary-cascade.test.js` pins that the mutator applies it.
      const remaining = stored.filter(
        (category) => normalizeVocabularyKey(category) !== normalizeVocabularyKey('Potions')
      );
      assert.deepEqual(remaining, [], 'the keyed filter leaves no spelling behind');
      unmount(mounted);
      mounted = null;
      target.remove();
      await openTagsScreen([], { selectedSystemOverrides: { categories: remaining } });
      assert.deepEqual(
        rowIds('recipeCategories', 'data-category-id'),
        [],
        'and the row does NOT come back wearing the other spelling: with no custom category left ' +
          'the panel falls to its empty state, which withholds the locked General row too'
      );
    });
  });

  // ── The nav badge reads the pre-counted tag placeholders (issue 1081) ────────────────
  describe('the Tags & Categories badge reads pre-counted placeholders (issue 1081)', () => {
    /** A projected recipe row whose detail-tier fields are COUNTING getters. */
    function countingRecipeRow(reads) {
      const ingredientSets = [
        {
          id: 'set-any-herb',
          name: 'Any herb',
          ingredientGroups: [
            {
              id: 'group-any-herb',
              options: [{ match: { type: 'tags', tags: ['herb'] }, quantity: 1 }],
            },
          ],
        },
      ];
      const row = {
        id: 'r-placeholder',
        name: 'Any Herb Tincture',
        img: 'icons/consumables/potions/potion-bottle-corked-red.webp',
        description: 'Accepts any herb.',
        category: 'potions',
        enabled: true,
        locked: false,
        isSimple: true,
        structureLabel: 'Simple',
        stepCount: 1,
        resultGroupCount: 1,
        ingredientCount: 1,
        toolCount: 0,
        requirementsPreview: [],
        visibilitySummary: 'All players',
        ingredients: new Array(1),
        tools: [],
      };
      for (const [field, value] of [
        ['ingredientSets', ingredientSets],
        ['steps', []],
      ]) {
        Object.defineProperty(row, field, {
          enumerable: true,
          configurable: true,
          get() {
            reads[field] += 1;
            return value;
          },
        });
      }
      return row;
    }

    it('renders the reference without reading the detail tier, and CAN read it', async () => {
      const reads = { ingredientSets: 0, steps: 0 };
      const row = countingRecipeRow(reads);
      mountManager([], {
        recipes: [row],
        // As the real store publishes it, on every one of its publishes.
        recipeTagPlaceholderCounts: { herb: 1 },
      });

      // THE PERF LEG. The badge has already rendered — it is a sibling of every view.
      assert.equal(
        target.querySelectorAll('[data-tag-id]').length,
        0,
        'pre-condition: the Tags & Categories screen is not the mounted route'
      );
      assert.deepEqual(
        reads,
        { ingredientSets: 0, steps: 0 },
        'the always-mounted badge answered from the published record and walked nothing'
      );

      // THE CORRECTNESS LEG, same fixture. `herb` is referenced ONLY as a recipe ingredient
      // tag-placeholder. Reading it as unused would render the Unused chip and make it
      // deletable in one click with no confirm strip, breaking ingredient matching in every
      // recipe whose placeholder named it.
      navButton('Tags & Categories').click();
      await tick();
      flushSync();

      const herbRow = panelFor('componentTags').querySelector('[data-tag-id="herb"]');
      assert.ok(Boolean(herbRow), 'pre-condition: the tag panel lists `herb`');
      assert.ok(
        !herbRow.querySelector('.manager-vocabulary-chip-unused'),
        'a tag used only as a recipe ingredient placeholder is NOT unused'
      );
      assert.match(herbRow.textContent, /1 reference/, 'and the row reports that one reference');
      assert.deepEqual(
        reads,
        { ingredientSets: 0, steps: 0 },
        'reaching the screen that renders the number still walked nothing'
      );

      // POSITIVE CONTROL, same fixture and the same counters: the getters are live.
      void row.ingredientSets;
      void row.steps;
      assert.deepEqual(
        reads,
        { ingredientSets: 1, steps: 1 },
        'the counters CAN go up — reading either field is what does it'
      );
    });
  });
}
