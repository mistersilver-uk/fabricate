/**
 * Combined defects 2 + 3 (issue 675), exercised through a REAL inventoryStore so
 * the post-salvage reload is genuine rather than stubbed:
 *
 *  - Defect 2: after a salvage roll the inspector must STAY on the Salvage tab. The
 *    reload hands the component a new item object with the SAME key; the tab reset
 *    must key on the key, not the object reference, or the player is dropped onto
 *    Info while the success ribbon sits on Salvage.
 *  - Defect 3: after salvaging the LAST copy the header must read honestly ("None
 *    remaining", not a stale "1 total") and the footer must NOT offer "Salvage
 *    again" — there is nothing left to break down. The success ribbon still shows.
 *
 * A real store makes both fall out of the same reload: it holds the salvaged row
 * selected, carries the true post-salvage remaining (0) onto it, and produces a new
 * same-key item object — the exact conditions the two fixes must survive together.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-inventory-salvage-reload-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/recipeItemAccessBadge.js',
    // The REAL store imports these two leaves (unlike the mocked-store suite); they
    // are import-free, so copying them verbatim resolves the compiled store's graph.
    'src/utils/progressiveResultOrder.js',
    'src/utils/progressiveStageThresholds.js',
  ],
  runeModules: ['src/ui/svelte/stores/inventoryStore.svelte.js'],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/inventory/InventoryFilters.svelte',
    'src/ui/svelte/apps/inventory/InventoryGrid.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryDetailPager.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRoutedBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageMisconfiguredBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageToolRequirements.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
    // The multi-system participation selector InventoryComponentDetail now imports (issue
    // 766) — a `.svelte` leaf; an omission HANGS this suite (# cancelled), never fails.
    'src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte',
    'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    // The bulk tree (issue 859). `InventoryView` renders the panel as a SIBLING of
    // `InventoryDetail`, so these are static imports of the view itself; an omission
    // HANGS this suite (# cancelled), and a speculative entry throws outright.
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkSection.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkReport.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte',
    'src/ui/svelte/apps/inventory/InventoryView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/inventory/InventoryView.svelte',
});

let createInventoryStore;

function salvageRow() {
  return {
    key: 'sys:c1',
    componentId: 'c1',
    systemId: 'sys',
    name: 'Iron Ore',
    img: null,
    icon: null,
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    totalQuantity: 1,
    sources: [{ actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 1 }],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    salvage: {
      enabled: true,
      mode: 'simple',
      checkUsable: false,
      misconfigured: false,
      // The builder emits BOTH of these on every salvage projection
      // (`_buildSalvage`), and the bulk partition reads `toolsAvailable` as a blocked
      // reason — an omission here would read as a `toolsUnavailable` row rather than a
      // queueable one.
      toolStates: [],
      toolsAvailable: true,
      allowPlayerResultReorder: true,
      results: [{ id: 'r1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 2 }],
      routedOutcomes: [],
      stages: [],
      awardMode: null,
      targetActorId: 'a1',
    },
  };
}

// A second, unrelated owned item so the listing is never EMPTY after the last copy
// of the salvaged component leaves it (an empty listing would render the no-items
// state and hide the inspector entirely). This mirrors reality and the store's own
// AC10 test.
function otherRow() {
  return {
    key: 'sys:c9',
    componentId: 'c9',
    systemId: 'sys',
    name: 'Zzz Filler',
    img: null,
    icon: null,
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    totalQuantity: 3,
    sources: [{ actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 3 }],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    salvage: null,
  };
}

function makeServices() {
  // Single copy of the salvage row; salvaging it drops it from the listing.
  let rows = [salvageRow(), otherRow()];
  const services = {
    getSelectedCraftingActorId: () => 'hero',
    setSelectedCraftingActorId: () => {},
    getCraftingComponentSourceIds: () => [],
    getProgressiveResultOrder: () => ({}),
    listInventoryForActor: async () => ({ selectedActorId: 'hero', rows }),
    salvageComponent: async () => {
      // The engine consumed the only copy: the salvage row leaves the listing.
      rows = [otherRow()];
      return { success: true, results: [{ name: 'Iron Shard', img: null }], message: 'Salvaged Iron Ore' };
    },
    notify: () => {},
    craftingSources: { load: () => {}, setCraftingActor: () => {}, selectedSourceIds: [] },
    actorBar: { selectedActorId: 'hero' },
    navigateToCraftingRecipe: () => {},
  };
  return services;
}

async function settle() {
  flushSync();
  await tick();
  await tick();
  flushSync();
}

describe('InventoryView — salvage reload keeps the tab and reads the remaining honestly', () => {
  before(async () => {
    await harness.setup();
    ({ createInventoryStore } = await harness.loadRuneModule(
      'src/ui/svelte/stores/inventoryStore.svelte.js'
    ));
  });
  after(harness.teardown);
  afterEach(harness.remount);

  it('stays on Salvage after the roll and shows a depleted, no-"Salvage again" ribbon', async () => {
    const services = makeServices();
    services.inventory = createInventoryStore({ services });
    const target = await harness.mount({ services });
    await settle();

    // Select the salvageable component and open its Salvage tab.
    services.inventory.select('sys:c1');
    await settle();
    const salvageTab = target.querySelector('[data-inventory-detail-tab="salvage"]');
    assert.ok(salvageTab, 'the salvageable component shows a Salvage tab');
    salvageTab.click();
    await settle();
    assert.ok(target.querySelector('[data-inventory-salvage-panel]'), 'the Salvage panel is open');

    // Roll: one press rolls and commits. The store reloads with the copy consumed.
    target.querySelector('[data-inventory-salvage-action]').click();
    await settle();
    await settle();

    // Defect 2: the inspector stayed on Salvage (did NOT jump to Info).
    assert.equal(
      target.querySelector('[data-inventory-detail-tab="salvage"]').getAttribute('aria-selected'),
      'true',
      'the Salvage tab is still the active tab after the roll'
    );
    assert.ok(
      target.querySelector('#inventory-detail-panel-salvage'),
      'the Salvage panel is still the rendered body, not Info'
    );

    // The success ribbon is shown (the player must see what they recovered)...
    assert.ok(target.querySelector('[data-inventory-salvage-ribbon]'), 'the success ribbon shows');
    // Defect 3: ...but there is nothing left to salvage, so no way back to rolling.
    assert.equal(
      target.querySelector('[data-inventory-salvage-again]'),
      null,
      'no "Salvage again" when the last copy is gone'
    );
    assert.ok(
      target.querySelector('[data-inventory-salvage-depleted]'),
      'a depleted note replaces the way back'
    );

    // Defect 3: the header reads "None remaining", not a stale "1 total".
    const total = target.querySelector('.inventory-detail-total');
    assert.ok(total, 'the header total line renders');
    assert.match(total.textContent, /TotalDepleted/, 'the depleted total key, not a count');
    assert.doesNotMatch(total.textContent, /Total:/, 'never the stale counted "N total"');
  });

  // Issue 675 (re-report): the previous fix tried to PREVENT the tab reset, which
  // assumed the inspector instance never remounts. In the real Foundry flow the roll
  // dialog can remount it, and the bounce returned. The robust fix actively OPENS
  // Salvage when a held result is present on a fresh mount — this test tears the tree
  // down and remounts against the SAME store to prove it survives that remount.
  it('reopens Salvage on a REMOUNT while a result is held (survives a dialog-driven remount)', async () => {
    const services = makeServices();
    services.inventory = createInventoryStore({ services });
    let target = await harness.mount({ services });
    await settle();

    services.inventory.select('sys:c1');
    await settle();
    target.querySelector('[data-inventory-detail-tab="salvage"]').click();
    await settle();

    target.querySelector('[data-inventory-salvage-action]').click();
    await settle();
    await settle();
    assert.ok(services.inventory.salvageResult, 'the store holds a result after the roll');

    // Fresh component tree, same store: the remount the maintainer observed.
    harness.remount();
    target = await harness.mount({ services });
    await settle();

    const salvageTab = target.querySelector('[data-inventory-detail-tab="salvage"]');
    assert.ok(salvageTab, 'the held salvageable component still shows its Salvage tab');
    assert.equal(
      salvageTab.getAttribute('aria-selected'),
      'true',
      'a fresh mount with a held result opens Salvage, not Info'
    );
    assert.ok(
      target.querySelector('[data-inventory-salvage-ribbon]'),
      'and the success ribbon is on that reopened tab'
    );
  });

  // -------------------------------------------------------------------------
  // Bulk salvage (issue 859), driven through the SAME real store.
  //
  // The mocked-store suite pins the panel's markup from props; this one pins the
  // GESTURE — shift-click, Shift+Enter and Escape actually moving the real store's
  // selection and the view re-rendering off it. A POJO store cannot show that at all.
  // -------------------------------------------------------------------------

  /** Dispatch a real bubbling event on `node` with the modifier keys set. */
  function fire(node, type, init = {}) {
    const EventClass = type.startsWith('key')
      ? node.ownerDocument.defaultView.KeyboardEvent
      : node.ownerDocument.defaultView.MouseEvent;
    node.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true, ...init }));
  }

  /** Mount the view over a real store with the salvage row already inspected. */
  async function mountWithInspectedRow() {
    const services = makeServices();
    services.inventory = createInventoryStore({ services });
    const target = await harness.mount({ services });
    await settle();
    services.inventory.select('sys:c1');
    await settle();
    return { target, services };
  }

  it('a shift-click enters bulk: the panel renders and the detail body does not', async () => {
    const { target, services } = await mountWithInspectedRow();
    assert.ok(target.querySelector('[data-inventory-detail="sys:c1"]'), 'the inspector is open');

    fire(target.querySelector('[data-inventory-card="sys:c9"] button'), 'click', {
      shiftKey: true,
    });
    await settle();

    // Acceptance 1: the FIRST shift-click promotes the inspected card, so both are in.
    assert.deepEqual(services.inventory.bulkSelectedKeys, ['sys:c1', 'sys:c9']);
    assert.ok(target.querySelector('[data-inventory-bulk-panel]'), 'the panel replaced the body');
    assert.ok(
      !target.querySelector('[data-inventory-detail="sys:c1"]'),
      'and the single-item inspector is gone, not merely hidden behind it'
    );
    assert.ok(
      target.querySelector('[data-inventory-card-bulk-selected]'),
      'the grid marks the selected cards'
    );
  });

  it('Shift+Enter on a card does exactly the same thing', async () => {
    const { target, services } = await mountWithInspectedRow();

    fire(target.querySelector('[data-inventory-card="sys:c9"] button'), 'keydown', {
      key: 'Enter',
      shiftKey: true,
    });
    await settle();

    assert.deepEqual(services.inventory.bulkSelectedKeys, ['sys:c1', 'sys:c9']);
    assert.ok(target.querySelector('[data-inventory-bulk-panel]'));
  });

  it('partitions the selection: the salvageable row queues, the rest is blocked', async () => {
    // `Zzz Filler` carries no salvage config at all, so it is `salvageDisabled` — the
    // blocked half — while `Iron Ore` queues. One gesture, two lists.
    const { target } = await mountWithInspectedRow();
    fire(target.querySelector('[data-inventory-card="sys:c9"] button'), 'click', {
      shiftKey: true,
    });
    await settle();

    assert.ok(target.querySelector('[data-inventory-bulk-queue-row="sys:c1"]'), 'Iron Ore queues');
    assert.ok(
      target.querySelector('[data-inventory-bulk-blocked-row="salvageDisabled"]'),
      'and the unsalvageable row names its reason'
    );
  });

  it('Escape leaves bulk and restores the inspector', async () => {
    const { target, services } = await mountWithInspectedRow();
    fire(target.querySelector('[data-inventory-card="sys:c9"] button'), 'click', {
      shiftKey: true,
    });
    await settle();
    assert.ok(target.querySelector('[data-inventory-bulk-panel]'), 'bulk is active');

    fire(target.querySelector('[data-inventory-grid]'), 'keydown', { key: 'Escape' });
    await settle();

    assert.deepEqual(services.inventory.bulkSelectedKeys, []);
    assert.ok(!target.querySelector('[data-inventory-bulk-panel]'), 'the panel is gone');
    assert.ok(
      target.querySelector('[data-inventory-detail="sys:c1"]'),
      'and Clear/Escape return to the SAME card, because selectedKey is retained'
    );
  });

  it('a plain click leaves bulk and inspects the clicked card', async () => {
    const { target, services } = await mountWithInspectedRow();
    fire(target.querySelector('[data-inventory-card="sys:c9"] button'), 'click', {
      shiftKey: true,
    });
    await settle();

    fire(target.querySelector('[data-inventory-card="sys:c9"] button'), 'click');
    await settle();

    assert.deepEqual(services.inventory.bulkSelectedKeys, []);
    assert.ok(
      target.querySelector('[data-inventory-detail="sys:c9"]'),
      'inspecting the clicked one'
    );
  });

  it('InventoryDetail imports NOTHING from the bulk tree — the router bypass', async () => {
    // The same assertion the mocked-store suite makes, restated HERE because this suite
    // is the one whose `compiledModules` list would have to grow if the bypass were ever
    // routed through `InventoryDetail`: a `{#if}` in a router does not keep a branch out
    // of the compiled module's STATIC imports, so the bulk tree would silently join
    // `recipe-item-editor-mounted` and `manager-mounted`'s graphs too.
    const { readFileSync } = await import('node:fs');
    const detail = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/inventory/InventoryDetail.svelte'),
      'utf8'
    );
    assert.equal(detail.includes('/bulk/'), false, 'no bulk import of any kind');
    assert.equal(detail.includes('InventoryBulk'), false, 'nor a bulk component by name');
  });
});
