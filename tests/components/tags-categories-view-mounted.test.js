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
 *
 * ── ISSUE 1429 MOVED THE STRIP AND THIS FILE DELIBERATELY DID NOT MOVE WITH IT ──────────
 * The tablist is `VocabularyTabs` -> `EditorTabs` now, not markup this view authors. Every
 * clause below still mounts THIS view and reads the rendered DOM, which is the point: a
 * conversion is exactly the change under which a suite that had been asserting on the view's
 * own source, or on a hand-written copy of its markup, would keep passing while the product
 * stopped emitting it. Mounting the real tree is what makes the roving `tabindex`, the
 * `aria-selected` binding and the Arrow/Home/End traversal observable across the seam — and
 * the traversal in particular is now `EditorTabs`' `parentElement`/`[role="tab"]` walk rather
 * than this view's old `.closest('[role="tablist"]')`, so the CONTRACT is asserted here while
 * the mechanism belongs to the primitive.
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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    // Each vocabulary panel's lifted search term (issue 1438).
    'src/utils/managerBrowserViewState.js',
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled)
    // rather than failing it, so the whole static closure is declared.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    'src/ui/svelte/apps/manager/VocabularyPanel.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). VocabularyPanel`s confirm pair and InlineVocabularyAdd`s Add render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    // The strip, extracted from this view in issue 1429, and the primitive it wraps. Both are
    // rendered by the tree under test, and a rendered `.svelte` the harness omits HANGS the
    // suite (`# cancelled`) rather than failing it.
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/VocabularyTabs.svelte',
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

  // THE ONE INTENTIONAL RENDERED CHANGE in issue 1429's conversion, asserted positively rather
  // than left to a parity comparison. A parity harness cannot see this on its own: reverting the
  // vehicle makes the converted strip byte-identical to the strip it replaced, so the comparison
  // reports parity precisely when the correction is missing.
  it('draws each vocabulary count on the record-count vehicle, not through a chip', async () => {
    const root = await harness.mount(
      mountProps({ counts: { recipeCategories: 4, componentCategories: 11, itemTags: 2 } })
    );

    const expected = { recipe: '4', component: '11', tag: '2' };
    for (const id of TABS) {
      const tab = tabButton(root, id);
      const count = tab.querySelector('.manager-editor-tab-count');
      assert.ok(Boolean(count), `the ${id} tab draws its record count`);
      assert.equal(count.textContent.trim(), expected[id]);
      assert.ok(
        !tab.querySelector('.manager-editor-tab-badge'),
        `the ${id} tab must not draw a RECORD COUNT through the issue-summary chip: the Rail ` +
          'Marker Family forbids substituting one vehicle for another, and this strip drew a ' +
          'neutral chip until issue 1429'
      );
      assert.ok(
        !tab.querySelector('.manager-chip'),
        `the ${id} tab count is a bare mono numeral, so no chip element may remain`
      );
    }
  });

  // The zero is the OTHER thing a sweep could have taken silently. `EditorTabs` suppresses a
  // falsy mark by default; this strip has always stated its zero, so `VocabularyTabs` passes
  // `suppressZero: false` and the behaviour is pinned here rather than left to a default.
  it('states a record count of zero rather than omitting it', async () => {
    const root = await harness.mount(
      mountProps({ counts: { recipeCategories: 0, componentCategories: 0, itemTags: 0 } })
    );

    for (const id of TABS) {
      const count = tabButton(root, id).querySelector('.manager-editor-tab-count');
      assert.ok(Boolean(count), `the ${id} tab still renders a mark at zero`);
      assert.equal(count.textContent.trim(), '0', 'the zero is stated, not suppressed');
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
    // The focused tab BY ID, never the element itself. `assert.equal` on two mounted happy-dom
    // nodes serialises their circular trees to build a failure diff and kills the heap, so a
    // one-line focus regression surfaces as a `# cancelled` suite with no message —
    // indistinguishable from a missing harness allowlist entry. Proved by mutating
    // `EditorTabs`' `Home` branch, which took this suite from a clean red to a two-minute hang.
    // An id string diffs in one line and names the tab that took focus.
    const focusedTab = () => activeElement()?.getAttribute('data-vocabulary-tab') ?? null;

    const recipe = tabButton(root, 'recipe');
    recipe.focus();
    assert.equal(focusedTab(), 'recipe', 'the active tab takes focus');

    pressOn(recipe, 'ArrowRight');
    assert.equal(focusedTab(), 'component', 'ArrowRight moves right');

    pressOn(activeElement(), 'ArrowRight');
    assert.equal(focusedTab(), 'tag', 'and again');

    pressOn(activeElement(), 'ArrowRight');
    assert.equal(focusedTab(), 'recipe', 'ArrowRight wraps at the end');

    pressOn(activeElement(), 'ArrowLeft');
    assert.equal(focusedTab(), 'tag', 'ArrowLeft wraps at the start');

    pressOn(activeElement(), 'Home');
    assert.equal(focusedTab(), 'recipe', 'Home goes to the first tab');

    pressOn(activeElement(), 'End');
    assert.equal(focusedTab(), 'tag', 'End goes to the last tab');

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
    assert.equal(
      root.ownerDocument.activeElement?.getAttribute('data-vocabulary-tab') ?? null,
      'recipe',
      'focus stays put'
    );
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
