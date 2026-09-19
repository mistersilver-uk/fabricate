/** The Tags & Categories route: both tabs, their icons, badges and cascade-safe delete. */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries, setInputValue } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { managerComponents, settleBetweenTests } from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { navButton, vocabularyCounters } = queries;
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


  it('routes to the tabbed tags and categories screen with live validation, icons, and cascade-safe inline delete (issue 689)', async () => {
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
    // The three vocabularies are tabs; the recipe tab is shown first.
    assert.ok(target.querySelector('[data-vocabulary-tab="recipe"]'));
    assert.ok(target.querySelector('[data-vocabulary-tab="component"]'));
    assert.ok(target.querySelector('[data-vocabulary-tab="tag"]'));
    assert.ok(target.textContent.includes('potions'), 'recipe tab shows its custom category');
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
    // Item 3: the strip uses the shared editor-tab treatment, not a bespoke one.
    const vocabularyTabs = target.querySelector('.manager-vocabulary-tabs');
    assert.ok(
      vocabularyTabs.classList.contains('manager-editor-tabs'),
      'the vocabulary tab strip reuses the shared editor tab bar'
    );
    assert.ok(
      target
        .querySelector('[data-vocabulary-tab="recipe"]')
        .classList.contains('manager-editor-tab-button'),
      'each vocabulary tab reuses the shared editor tab button'
    );
    assert.ok(
      target.querySelector('[data-vocabulary-tab="recipe"] .manager-editor-tab-count'),
      'each vocabulary tab carries the shared editor tab RECORD COUNT (issue 1429): these are ' +
        'whole-vocabulary counts, and the Rail Marker Family draws a record count as a bare ' +
        'mono numeral rather than through the issue-summary chip this strip used to pass'
    );
    assert.ok(
      !target.querySelector('[data-vocabulary-tab="recipe"] .manager-editor-tab-badge'),
      'and must not ALSO draw a chip: substituting one vehicle for another is what the family ' +
        'exists to prevent, so the chip is gone rather than kept alongside'
    );

    // Inspector rail: at-a-glance tiles + reference-safe reassurance (issue 689).
    const howItWorks = target.querySelector('[data-tags-evidence="how-it-works"]');
    assert.ok(howItWorks);
    assert.ok(target.querySelector('[data-tags-evidence="at-a-glance"]'));
    assert.ok(target.querySelector('[data-tags-category-fact="component-categories"]'));
    assert.ok(target.querySelector('[data-tags-category-fact="references"]'));
    const referenceSafe = target.querySelector('[data-tags-evidence="reference-safe"]');
    assert.ok(referenceSafe);

    // Issue 881: both contextual-help cards render through the SAME explainer primitive
    // the Tool Studio's "How Tools work in Fabricate" card uses, so the rail stops
    // re-deriving one meaning as a disc-bulleted list and a bare paragraph. Rendering the
    // card shell, the shared card title and the glyph-led rows is the observable contract.
    for (const card of [howItWorks, referenceSafe]) {
      assert.ok(
        card.classList.contains('manager-inspector-card') &&
          card.classList.contains('manager-explainer-card'),
        'the tags help cards wear the shared side-panel card shell'
      );
      assert.ok(
        card.querySelector('h3.manager-card-title.manager-explainer-card-title > i'),
        'the tags help cards carry the shared glyph-led card title'
      );
    }
    assert.equal(
      howItWorks.querySelectorAll('.manager-explainer-card-list > li').length,
      3,
      'the recipe-categories help renders its three rows through the explainer list'
    );
    assert.equal(
      referenceSafe.querySelectorAll('.manager-explainer-card-list > li').length,
      1,
      'the reference-safety reassurance is one explainer row, not a bare paragraph'
    );
    assert.equal(
      target.querySelector('.manager-evidence-list'),
      null,
      'the retired bullet list must be gone from the rail, not merely unstyled'
    );
    // A bold lead-in and its prose are one sentence.
    for (const row of howItWorks.querySelectorAll('.manager-explainer-card-list > li')) {
      const lead = row.querySelector('strong');
      if (!lead) continue;
      assert.match(
        row.textContent,
        new RegExp(`${lead.textContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`),
        `explainer lead-in "${lead.textContent}" must be separated from its prose`
      );
    }

    // Live validation: the reserved bucket flags danger as you type, before submit.
    const categoryInput = target.querySelector('#manager-category-add');
    setInputValue(categoryInput, 'General');
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-vocabulary-hint.is-danger'));
    assert.ok(target.textContent.includes('General is already available as the base category.'));
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
    assert.ok(target.querySelector('.manager-vocabulary-hint.is-success'));
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    const addCall = calls.find((call) => call[0] === 'addCategory');
    assert.deepEqual(addCall, ['addCategory', 'Elixirs', '']);
    assert.equal(categoryInput.value, '');

    // Per-tab search filters only the active vocabulary and shows an empty state.
    const search = target.querySelector('.manager-vocabulary-search input[type="search"]');
    setInputValue(search, 'zzzz');
    await tick();
    flushSync();
    assert.ok(target.textContent.includes('No matches for "zzzz".'));
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

    // The tag tab lowercases as you type and delegates the normalized value.
    target.querySelector('[data-vocabulary-tab="tag"]').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-tag-id="ore"]'), 'the tag tab lists item tags');
    // Tag rows carry a fixed, non-editable decorative accent tile (issue 689 fidelity):
    const tagIconTile = target.querySelector(
      '[data-tag-id="ore"] .manager-vocabulary-icon.is-decorative'
    );
    assert.ok(tagIconTile, 'each tag row renders a decorative accent icon tile');
    assert.ok(
      tagIconTile.querySelector('i.fa-tag'),
      'the decorative tag tile uses the fa-tag glyph'
    );
    assert.ok(
      !target.querySelector('[data-tag-id="ore"] [data-vocabulary-icon-picker]'),
      'the tag tile is decorative, not an icon picker'
    );
    const tagInput = target.querySelector('#manager-tag-add');
    setInputValue(tagInput, 'SPICE');
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-vocabulary-hint.is-info'));
    assert.ok(target.textContent.includes('Will be added as "spice"'));
    target
      .querySelector('[aria-label="Component tags"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addTag' && call[1] === 'spice'));
    assert.equal(tagInput.value, '');

    // An UNUSED entry deletes in one click, matching the prototype.
    assert.ok(
      target.querySelector('[data-tag-id="herb"] .manager-vocabulary-chip-unused'),
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

  it('manages COMPONENT categories as an independent tab, distinct from recipe categories (issue 676, 689)', async () => {
    // The three vocabularies are tabs (issue 689).
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

    // The recipe tab leads; the component vocabulary is not yet mounted.
    assert.equal(target.querySelector('[data-component-category-id]'), null);
    target.querySelector('[data-vocabulary-tab="component"]').click();
    await tick();
    flushSync();

    const panel = target.querySelector('[aria-label="Component categories"]');
    assert.ok(panel, 'the component-categories tab renders its panel');
    // The seeded vocabulary reaches it through the selectedSystem viewState projection.
    assert.ok(
      target.querySelector('[data-component-category-id="reagent"]'),
      'the authored component category renders as its own row'
    );
    assert.ok(
      target.querySelector('[data-component-category-id="general"]'),
      'the reserved General row renders, locked'
    );
    // The recipe vocabulary is a different tab, so it never leaks into this one.
    assert.equal(
      panel.querySelector('[data-category-id]'),
      null,
      'the recipe vocabulary never leaks into the component tab'
    );

    // The reserved bucket is refused before it can reach the store (live-blocked).
    const input = target.querySelector('#manager-component-category-add');
    setInputValue(input, 'General');
    await tick();
    flushSync();
    panel
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    flushSync();
    assert.ok(!calls.some((call) => call[0] === 'addComponentCategory'));

    // A real add reaches the store's COMPONENT action — not addCategory.
    setInputValue(input, 'Metal');
    await tick();
    flushSync();
    panel
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addComponentCategory' && call[1] === 'Metal'));
    assert.ok(
      !calls.some((call) => call[0] === 'addCategory'),
      'the recipe vocabulary is never written by the component tab'
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

  it('counts the reserved General bucket in the tab badge, the glance tile and the entry chip alike (issue 878)', async () => {
    // Three counters used to disagree on one screen.
    await openTagsScreen();

    // The fixture seeds exactly one custom recipe category (`potions`) and one custom
    // component category (`Reagent`), so a correct category counter reads 2. A counter
    // still subtracting General reads 1 and one double-counting it reads 3.
    assert.deepEqual(
      vocabularyCounters('recipe', 'recipe-categories'),
      { tabBadge: '2', glanceTile: '2', entryChip: '2 entries' },
      'one custom recipe category plus General is two, on all three surfaces'
    );
    // With a custom entry present General has something to be distinguished FROM.
    assert.ok(
      target.querySelector('[data-category-id="general"]'),
      'the reserved row is listed once a custom category exists'
    );

    target.querySelector('[data-vocabulary-tab="component"]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      vocabularyCounters('component', 'component-categories'),
      { tabBadge: '2', glanceTile: '2', entryChip: '2 entries' },
      'the sibling component vocabulary counts its own General the same way'
    );
    assert.ok(target.querySelector('[data-component-category-id="general"]'));

    // Tags are the control: they pass `lockedRow={null}` and have no reserved bucket at
    // all, so their three counters must equal the raw tag count with nothing added.
    target.querySelector('[data-vocabulary-tab="tag"]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      vocabularyCounters('tag', 'item-tags'),
      { tabBadge: '3', glanceTile: '3', entryChip: '3 entries' },
      'the tag vocabulary has no reserved bucket, so nothing is added to its count'
    );
  });

  it('leaves General out of the list until the first custom category exists, and explains it in the empty state (issue 878)', async () => {
    // With no GM-defined categories the reserved row was the only thing in the list.
    await openTagsScreen([], {
      selectedSystemOverrides: { categories: [], componentCategories: [] },
    });

    assert.equal(
      target.querySelector('[data-category-id]'),
      null,
      'no rows at all render for an empty recipe-category vocabulary, General included'
    );
    assert.deepEqual(
      vocabularyCounters('recipe', 'recipe-categories'),
      { tabBadge: '1', glanceTile: '1', entryChip: '1 entry' },
      'General is counted even while it is not listed, and the chip reads as a singular'
    );

    const emptyPanel = target.querySelector('.manager-vocabulary-empty-panel');
    assert.ok(emptyPanel, 'the empty-state card renders in place of the reserved row');
    assert.ok(
      emptyPanel.textContent.includes('Only General so far'),
      'the card names General, so the counters reading 1 have a visible referent'
    );
    assert.ok(
      emptyPanel.textContent.includes('Every recipe falls under General until you add one.'),
      'the card explains what General does rather than merely naming it'
    );
    assert.ok(
      !emptyPanel.classList.contains('is-compact'),
      'the card is the full panel now that it is the only thing in the list'
    );

    target.querySelector('[data-vocabulary-tab="component"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-component-category-id]'), null);
    assert.deepEqual(
      vocabularyCounters('component', 'component-categories'),
      { tabBadge: '1', glanceTile: '1', entryChip: '1 entry' },
      'the component vocabulary resolves the same way from its own reserved bucket'
    );
    assert.ok(
      target
        .querySelector('.manager-vocabulary-empty-panel')
        .textContent.includes('Every component falls under General until you add one.'),
      'the component card explains its own General, not the recipe one'
    );

    // Tags again as the control: an empty tag vocabulary has genuinely nothing.
    target.querySelector('[data-vocabulary-tab="tag"]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      vocabularyCounters('tag', 'item-tags'),
      { tabBadge: '3', glanceTile: '3', entryChip: '3 entries' },
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
    target.querySelector('[data-vocabulary-tab="component"]').click();
    await tick();
    flushSync();

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

    // The add form's icon field is the SAME control as the row tile.
    const iconField = target.querySelector('[data-vocabulary-add-icon]');
    assert.ok(iconField, 'the add form renders an icon field');
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
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
    target
      .querySelector('[aria-label="Recipe categories"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addCategory' && call[1] === 'Elixirs'));
    assert.equal(categoryInput.value, 'Elixirs');
    assert.equal(document.activeElement, categoryInput);
    assert.ok(target.textContent.includes('Category could not be added.'));

    target.querySelector('[data-vocabulary-tab="tag"]').click();
    await tick();
    flushSync();
    const tagInput = target.querySelector('#manager-tag-add');
    setInputValue(tagInput, 'spice');
    await tick();
    flushSync();
    target
      .querySelector('[aria-label="Component tags"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'addTag' && call[1] === 'spice'));
    assert.equal(tagInput.value, 'spice');
    assert.equal(document.activeElement, tagInput);
    assert.ok(target.textContent.includes('Tag could not be added.'));
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
      target.querySelector('[data-vocabulary-tab="tag"]').click();
      await tick();
      flushSync();

      const herbRow = target.querySelector('[data-tag-id="herb"]');
      assert.ok(Boolean(herbRow), 'pre-condition: the tag tab lists `herb`');
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
