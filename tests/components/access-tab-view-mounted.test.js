import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { itResolvesTheRecipesOwnImage } from '../helpers/recipeOwnImageCases.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-access-tab-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/utils/recipeCategories.js'
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    // The shared no-state primitive (issue 785). A `.svelte` the tree renders but
    // the harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    // THE manager's labelled push-button (issue 1118). Clear filters and Clear search both render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/AccessTabView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/AccessTabView.svelte'
});

function makeRecipe(overrides = {}) {
  const characterCount = overrides.characterCount ?? 0;
  const playerCount = overrides.playerCount ?? 0;
  return {
    id: overrides.id || 'r1',
    name: overrides.name || 'Alloy Bronze',
    img: 'icons/svg/book.svg',
    category: overrides.category || 'smithing',
    accessSummary: { characterCount, playerCount },
    ...overrides
  };
}

function grantChipText(root, id) {
  return root.querySelector(`[data-access-grant="${id}"] span`).textContent.trim();
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('AccessTabView (mounted)', () => {
  it('renders a row per recipe with name, category, and grant chip', async () => {
    const root = await harness.mount({
      recipes: [
        makeRecipe({ id: 'alloy', name: 'Alloy Bronze', characterCount: 2, playerCount: 0 }),
        makeRecipe({ id: 'soul', name: 'Soul-Ash', characterCount: 0, playerCount: 1 })
      ],
      selectedSystemName: 'Mythwright'
    });

    assert.equal(root.querySelectorAll('[data-access-row]').length, 2);
    assert.equal(grantChipText(root, 'alloy'), '2 char · 0 player');
    assert.equal(grantChipText(root, 'soul'), '0 char · 1 player');
  });

  it('renders the danger "No access" chip when no one is granted', async () => {
    const root = await harness.mount({
      recipes: [makeRecipe({ id: 'longsword', name: 'Longsword', characterCount: 0, playerCount: 0 })]
    });
    const chip = root.querySelector('[data-access-grant="longsword"]');
    assert.equal(chip.querySelector('span').textContent.trim(), 'No access');
    assert.ok(chip.classList.contains('is-danger'));
  });

  it('filters by access state (granted / none)', async () => {
    const root = await harness.mount({
      recipes: [
        makeRecipe({ id: 'granted', name: 'Granted One', characterCount: 1, playerCount: 0 }),
        makeRecipe({ id: 'open', name: 'Open One', characterCount: 0, playerCount: 0 })
      ]
    });
    assert.equal(root.querySelectorAll('[data-access-row]').length, 2);

    const filter = root.querySelector('[data-access-filter]');
    filter.value = 'none';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    const rows = root.querySelectorAll('[data-access-row]');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].getAttribute('data-access-row'), 'open');
  });

  it('marks the selected row and fires onSelectRecipe on click', async () => {
    let selected = null;
    const root = await harness.mount({
      recipes: [makeRecipe({ id: 'alloy', name: 'Alloy Bronze', characterCount: 1, playerCount: 0 })],
      selectedRecipeId: 'alloy',
      onSelectRecipe: (id) => { selected = id; }
    });

    const row = root.querySelector('[data-access-row="alloy"]');
    assert.ok(row.classList.contains('is-selected'));
    row.click();
    assert.equal(selected, 'alloy');
  });

  it('renders the empty state when there are no recipes', async () => {
    const root = await harness.mount({ recipes: [] });
    assert.ok(root.querySelector('.manager-empty'));
    assert.equal(root.querySelectorAll('[data-access-row]').length, 0);
  });

  // Issue 924 — the list was a `<div role="list">` of `<button role="listitem">`, which
  // overrode each row button's own interactive role and told assistive technology the row
  // was not operable. It is now a real `<ul>`/`<li>` with the button inside the item.
  it('renders the access list as a real ul/li with the button inside the item', async () => {
    const root = await harness.mount({
      recipes: [makeRecipe({ id: 'alloy', name: 'Alloy Bronze', characterCount: 1 })]
    });

    const list = root.querySelector('.manager-access-list');
    assert.equal(list.tagName, 'UL', 'the list is a real ul');
    // Not restated, because it is the element's implicit role. The compiler does NOT
    // report it — `a11y_no_redundant_roles` exempts `<ul role="list">` (that redundancy is
    // a documented Safari/VoiceOver workaround) even though it fires for
    // `<nav role="navigation">` — so this assertion, not the gate, is what holds it.
    assert.equal(list.getAttribute('role'), null, 'role="list" must not be restated');

    const row = root.querySelector('[data-access-row="alloy"]');
    assert.equal(row.tagName, 'BUTTON', 'data-access-row stays on the clickable element');
    assert.equal(row.getAttribute('role'), null, 'the button keeps its own implicit role');
    assert.equal(row.parentElement.tagName, 'LI', 'each row button sits in its own list item');
    assert.equal(row.parentElement.parentElement, list, 'and each item sits in the ul');
  });

  // `aria-pressed` described an independent toggle: a row cannot be un-pressed, and selecting
  // another silently un-presses the first. `aria-current` means "the current item in a set of
  // related items", is valid on any role, and is ABSENT rather than "false" when not current.
  it('marks the selected row with aria-current and omits the attribute otherwise', async () => {
    const root = await harness.mount({
      recipes: [
        makeRecipe({ id: 'alloy', name: 'Alloy Bronze', characterCount: 1 }),
        makeRecipe({ id: 'soul', name: 'Soul-Ash', playerCount: 1 })
      ],
      selectedRecipeId: 'alloy'
    });

    const selected = root.querySelector('[data-access-row="alloy"]');
    const other = root.querySelector('[data-access-row="soul"]');
    assert.equal(selected.getAttribute('aria-current'), 'true');
    assert.equal(selected.getAttribute('aria-pressed'), null, 'aria-pressed must not return');
    assert.equal(
      other.getAttribute('aria-current'),
      null,
      'an unselected row omits the attribute entirely rather than saying aria-current="false"'
    );
  });

  // The loud failure mode on this surface, and the one nothing photographic can catch: the
  // manager access screen matches no screenshot recipe and the smoke walk never visits it.
  // Unreset, Foundry's `@layer elements.typography` `ul, ol` rule draws bullets and a
  // ~21-24px indent on a GM screen.
  it('resets the ul so Foundry draws no bullets or indent on it', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/AccessTabView.svelte'),
      'utf8'
    );
    const block = source.match(/\.manager-access-list\s*{([^}]*)}/)?.[1];
    assert.ok(block, 'the list must declare its own scoped block');
    for (const declaration of ['list-style: none', 'margin: 0', 'padding: 0']) {
      assert.ok(
        block.includes(declaration),
        `.manager-access-list must declare "${declaration}" against Foundry's ul rule`
      );
    }
    assert.match(
      source,
      /\.manager-access-row-item\s*{[^}]*display:\s*flex/,
      'the li wrapper must be a flex block so the 100%-width row button fills it'
    );
  });

  // Issue 884 — the row thumbnail is the recipe's own icon, resolved through the
  // shared helper. It used to prefer the first containing book's artwork.
  itResolvesTheRecipesOwnImage({
    harness,
    mountProps: (imageOverrides) => ({ recipes: [makeRecipe({ id: 'alloy', ...imageOverrides })] }),
    selectImg: (root) => root.querySelector('[data-access-row="alloy"] img.manager-recipe-thumb').getAttribute('src')
  });
});
