import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Standalone fixture constants (NO model imports) so the mounted graph stays on the
// harness allowlist — importing a model would hang the suite as # cancelled.
const ESSENCES = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }];

function inventoryRow(id, name, { available = 2, held = 2, essences = [] } = {}) {
  return { componentId: id, name, img: null, available, held, essences, disabled: available <= 0 };
}

function knownRecipe(id, name) {
  return {
    id,
    name,
    img: null,
    result: null,
    signatureSummary: [{ setId: `${id}-set`, groups: [], essences: [] }]
  };
}

// ---------------------------------------------------------------------------
// ComponentInventoryColumn
// ---------------------------------------------------------------------------

describe('ComponentInventoryColumn (mounted)', () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-alchemy-inventory-',
    rawModules: ['src/ui/svelte/util/foundryBridge.js'],
    compiledModules: [
      'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
      'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
    ],
    componentPath: 'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
  });

  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('renders the name-search input and reports typed input', async () => {
    const calls = [];
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot')],
      hasComponents: true,
      onSearch: (value) => calls.push(value)
    });
    const input = target.querySelector('.alchemy-inventory-search input');
    assert.ok(input, 'the search input renders');
    input.value = 'ash';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.deepEqual(calls, ['ash']);
  });

  it('shows the distinct "no matches" filtered-empty state (NOT the onboarding state)', async () => {
    const target = await harness.mount({ components: [], hasComponents: true, search: 'zzz' });
    assert.ok(target.querySelector('[data-alchemy-inventory-no-matches]'), 'filtered-empty state shown');
    assert.equal(
      target.querySelector('[data-alchemy-empty-inventory]'),
      null,
      'the onboarding empty state is NOT shown when the actor owns components'
    );
  });

  it('shows the onboarding empty state when the actor owns no components', async () => {
    const target = await harness.mount({ components: [], hasComponents: false });
    assert.ok(target.querySelector('[data-alchemy-empty-inventory]'), 'onboarding empty state shown');
    assert.equal(target.querySelector('[data-alchemy-inventory-no-matches]'), null);
  });

  it('renders a drag handle inside the row button and adds on click', async () => {
    const calls = [];
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot')],
      hasComponents: true,
      onAdd: (id) => calls.push(id)
    });
    const row = target.querySelector('[data-alchemy-inventory-row="emberroot"]');
    assert.ok(row.querySelector('.alchemy-inventory-grip i.fa-grip-vertical'), 'grip handle inside the row button');
    row.click();
    assert.deepEqual(calls, ['emberroot']);
  });

  it('renders essence icons + counts on a component row', async () => {
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot', { essences: ESSENCES })],
      hasComponents: true
    });
    const essence = target.querySelector('[data-alchemy-inventory-row="emberroot"] [data-alchemy-essence="fire"]');
    assert.ok(essence, 'the essence chip renders on the row');
    assert.ok(essence.querySelector('i.fa-fire'), 'the essence icon renders');
    assert.ok(essence.textContent.includes('×2'), 'the per-unit essence count renders');
  });
});

// ---------------------------------------------------------------------------
// KnownRecipesColumn
// ---------------------------------------------------------------------------

describe('KnownRecipesColumn (mounted)', () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-alchemy-known-',
    rawModules: ['src/ui/svelte/util/foundryBridge.js'],
    compiledModules: ['src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte'],
    componentPath: 'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte'
  });

  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('places the discipline block (name + Switch) ABOVE the "Known recipes" heading', async () => {
    const target = await harness.mount({
      recipes: [knownRecipe('vigor', 'Elixir of Vigor')],
      knownCount: 1,
      activeSystemName: 'Herbalism',
      canSwitch: true
    });
    const switchBtn = target.querySelector('[data-alchemy-switch]');
    const title = target.querySelector('.alchemy-known-title');
    assert.ok(switchBtn && title, 'both the Switch and the heading render');
    // The switch must precede the heading in document order (block sits above it).
    const relation = switchBtn.compareDocumentPosition(title);
    assert.ok(
      relation & globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the discipline block is above the "Known recipes" heading'
    );
  });

  it('shows the distinct filtered "no matches" state when a search hides every revealed recipe', async () => {
    const target = await harness.mount({ recipes: [], knownCount: 3, search: 'zzz' });
    assert.ok(target.querySelector('[data-alchemy-known-no-matches]'), 'filtered-empty state shown');
    assert.equal(
      target.querySelector('[data-alchemy-zero-known]'),
      null,
      'the onboarding zero-revealed state is NOT shown when recipes exist'
    );
  });

  it('shows the onboarding zero-revealed state when nothing is revealed yet', async () => {
    const target = await harness.mount({ recipes: [], knownCount: 0 });
    assert.ok(target.querySelector('[data-alchemy-zero-known]'), 'onboarding empty state shown');
    assert.equal(target.querySelector('[data-alchemy-known-no-matches]'), null);
  });
});

// ---------------------------------------------------------------------------
// Render-bug (E) structural guard — pin the clip fix beyond screenshots.
//
// The row-clipping bug was `.alchemy-known-list { margin: 0 -4px; overflow-y: auto }`
// (and the mirror in the inventory list): `overflow-y: auto` coerces `overflow-x`
// to auto, clipping the first/last row's focus outline + radius. The fix REMOVES the
// negative horizontal margin and adds `outline-offset` room. This source-text guard
// fails if either regresses.
// ---------------------------------------------------------------------------

describe('Alchemy list clip-fix (source guard)', () => {
  const files = {
    known: 'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte',
    inventory: 'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
  };

  function read(relative) {
    return readFileSync(resolve(repoRoot, relative), 'utf8');
  }

  it('neither alchemy scroll list re-introduces a negative horizontal margin', () => {
    for (const [name, relative] of Object.entries(files)) {
      const source = read(relative);
      assert.ok(
        !/margin:\s*0\s+-\d/.test(source),
        `${name} column must not use a negative horizontal margin (it clips row focus outlines)`
      );
    }
  });

  it('both alchemy columns reserve outline-offset room for focused rows', () => {
    for (const [name, relative] of Object.entries(files)) {
      const source = read(relative);
      assert.ok(source.includes('outline-offset'), `${name} column must reserve outline-offset room`);
    }
  });

  // The card/row buttons must reset Foundry's global <button> styling. Foundry
  // imposes a fixed `height` on buttons (our components never set `height`, only
  // `min-height`), which caps the box: the known-recipe result row spills below
  // the card border and the inventory essence chips push past the row's bottom
  // border. `height: auto` (+ appearance/line-height reset) lets the button grow
  // to its content like a plain flex container. This guard fails if either card
  // button drops the reset.
  it('both alchemy card buttons reset Foundry button height/line-height', () => {
    const cards = {
      'known recipe card (.alchemy-recipe)': {
        relative: files.known,
        selector: '.alchemy-recipe {'
      },
      'inventory row (.alchemy-inventory-row)': {
        relative: files.inventory,
        selector: '.alchemy-inventory-row {'
      }
    };
    for (const [name, { relative, selector }] of Object.entries(cards)) {
      const source = read(relative);
      const start = source.indexOf(selector);
      assert.ok(start >= 0, `${name} rule block not found`);
      const block = source.slice(start, source.indexOf('}', start));
      assert.ok(
        /height:\s*auto/.test(block),
        `${name} must set height: auto to override Foundry's fixed button height`
      );
      assert.ok(
        /appearance:\s*none/.test(block),
        `${name} must reset appearance to override Foundry's button styling`
      );
      assert.ok(
        /line-height:\s*normal/.test(block),
        `${name} must reset line-height to normal`
      );
    }
  });
});
