/**
 * Mounted coverage for the Tags & Categories screen (issue 924).
 *
 * The view had NO test file of its own — it appeared only as a harness fixture inside
 * `manager-mounted.test.js` — so nothing asserted the tab semantics its keyboard handler
 * depends on. That mattered when the compiler's
 * `a11y_no_noninteractive_element_to_interactive_role` warnings on its `<nav>` and
 * `<section>` were fixed: the elements changed, the ROLES deliberately did not, and
 * `handleTabKeydown` resolves the strip with `.closest('[role="tablist"]')`. A source-string
 * assertion cannot observe that traversal, so the keyboard half of this file dispatches real
 * `KeyboardEvent`s and reads `document.activeElement`.
 *
 * Built on the shared mount harness rather than inlined boilerplate — an inlined mount trips
 * SonarCloud's new-code duplication threshold.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tags-categories-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled)
    // rather than failing it, so the whole static closure is declared.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    'src/ui/svelte/apps/manager/VocabularyPanel.svelte',
    // THE manager's labelled push-button (issue 1118). VocabularyPanel`s confirm pair and InlineVocabularyAdd`s Add render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/TagsCategoriesView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte',
});

const TABS = ['recipe', 'component', 'tag'];

function mountProps(overrides = {}) {
  return {
    categoryRows: [
      { id: 'general', name: 'General' },
      { id: 'potions', name: 'Potions' },
    ],
    componentCategoryRows: [{ id: 'general', name: 'General' }],
    tagRows: [{ id: 'herb', name: 'herb' }],
    counts: { recipeCategories: 2, componentCategories: 1, itemTags: 1 },
    activeTab: 'recipe',
    ...overrides,
  };
}

function tabButton(root, id) {
  return root.querySelector(`#vocabulary-tab-${id}`);
}

/** Dispatch a real keydown on a tab button, exactly as a keyboard user would produce it. */
function pressOn(element, key) {
  element.dispatchEvent(
    new globalThis.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  flushSync();
}

describe('TagsCategoriesView (mounted)', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the tab strip as a plain element carrying role="tablist"', async () => {
    const root = await harness.mount(mountProps());

    const strip = root.querySelector('.manager-vocabulary-tabs');
    assert.ok(strip, 'the tab strip renders');
    assert.equal(
      strip.getAttribute('role'),
      'tablist',
      'the ROLE is load-bearing — handleTabKeydown resolves the strip by it — and survives'
    );
    assert.equal(
      strip.tagName,
      'DIV',
      'the ELEMENT is what warned: role="tablist" on a <nav> overrides its navigation landmark'
    );
    assert.ok(strip.getAttribute('aria-label'), 'the strip keeps an accessible name');
  });

  it('names each tab and wires it to its panel, with a roving tabindex', async () => {
    const root = await harness.mount(mountProps({ activeTab: 'component' }));

    for (const id of TABS) {
      const tab = tabButton(root, id);
      assert.ok(tab, `the ${id} tab renders`);
      assert.equal(tab.getAttribute('role'), 'tab');
      assert.equal(tab.getAttribute('aria-controls'), `vocabulary-panel-${id}`);
      assert.equal(tab.getAttribute('aria-selected'), String(id === 'component'));
      assert.equal(
        tab.getAttribute('tabindex'),
        id === 'component' ? '0' : '-1',
        'exactly the active tab is in the tab order (roving tabindex)'
      );
    }
  });

  it('renders the panel as a plain element named by its own tab', async () => {
    const root = await harness.mount(mountProps({ activeTab: 'tag' }));

    const panel = root.querySelector('.manager-tags-categories-workspace');
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(
      panel.tagName,
      'DIV',
      'a <section> with an aria-label is promoted to the region landmark, which tabpanel' +
        ' then overrides — that is what the compiler reported'
    );
    assert.equal(panel.getAttribute('id'), 'vocabulary-panel-tag');
    assert.equal(
      panel.getAttribute('aria-labelledby'),
      'vocabulary-tab-tag',
      'the panel is named by the tab that opened it, matching KnowledgeView/RecipeEditView'
    );
    assert.equal(
      panel.getAttribute('aria-label'),
      null,
      'the standalone label is gone — its lang leaf was deleted with it'
    );
    assert.equal(
      tabButton(root, 'tag').getAttribute('aria-controls'),
      panel.getAttribute('id'),
      'the tab and its panel reference each other'
    );
  });

  // The acceptance-criterion test: this traverses `.closest('[role="tablist"]')` at runtime,
  // which only a mounted DOM test can observe. It is why the role could not simply be dropped
  // along with the element.
  it('moves focus along the strip on Arrow/Home/End and reports the next tab', async () => {
    const changes = [];
    const root = await harness.mount(
      mountProps({ onTabChange: (id) => changes.push(id) })
    );
    const activeElement = () => root.ownerDocument.activeElement;

    const recipe = tabButton(root, 'recipe');
    recipe.focus();
    assert.equal(activeElement(), recipe, 'the active tab takes focus');

    pressOn(recipe, 'ArrowRight');
    assert.equal(activeElement(), tabButton(root, 'component'), 'ArrowRight moves right');

    pressOn(activeElement(), 'ArrowRight');
    assert.equal(activeElement(), tabButton(root, 'tag'), 'and again');

    pressOn(activeElement(), 'ArrowRight');
    assert.equal(activeElement(), tabButton(root, 'recipe'), 'ArrowRight wraps at the end');

    pressOn(activeElement(), 'ArrowLeft');
    assert.equal(activeElement(), tabButton(root, 'tag'), 'ArrowLeft wraps at the start');

    pressOn(activeElement(), 'Home');
    assert.equal(activeElement(), tabButton(root, 'recipe'), 'Home goes to the first tab');

    pressOn(activeElement(), 'End');
    assert.equal(activeElement(), tabButton(root, 'tag'), 'End goes to the last tab');

    assert.deepEqual(
      changes,
      ['component', 'tag', 'recipe', 'tag', 'recipe', 'tag'],
      'every focus move also reports the new tab to the owning root'
    );
  });

  it('ignores keys that are not part of the strip contract', async () => {
    const changes = [];
    const root = await harness.mount(
      mountProps({ onTabChange: (id) => changes.push(id) })
    );

    const recipe = tabButton(root, 'recipe');
    recipe.focus();
    pressOn(recipe, 'ArrowDown');
    pressOn(recipe, 'a');

    assert.deepEqual(changes, [], 'no tab change');
    assert.equal(root.ownerDocument.activeElement, recipe, 'focus stays put');
  });

  it('switches the rendered vocabulary panel with the active tab', async () => {
    const recipeRoot = await harness.mount(mountProps({ activeTab: 'recipe' }));
    assert.match(recipeRoot.textContent, /Recipe categories/);

    await harness.remount();
    const tagRoot = await harness.mount(mountProps({ activeTab: 'tag' }));
    assert.match(tagRoot.textContent, /Component tags/);
    assert.equal(
      tagRoot.querySelector('.manager-tags-categories-workspace').getAttribute('id'),
      'vocabulary-panel-tag'
    );
  });

  it('fires onTabChange when a tab is clicked', async () => {
    const changes = [];
    const root = await harness.mount(
      mountProps({ onTabChange: (id) => changes.push(id) })
    );

    tabButton(root, 'component').click();
    flushSync();
    assert.deepEqual(changes, ['component']);
  });
});
