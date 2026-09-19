/** The gathering routes: the task and event editors, their pickers and their save failures. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import {
  TOOL_DISPLAY_PRECEDENCE_CASES,
  TOOL_PRECEDENCE_MANAGED_ITEMS,
} from '../helpers/toolDisplayPrecedenceCases.js';
// Issue 1504: a converted control is a shared `<Select>`.
import { chooseSelectOption, selectTriggerText } from '../helpers/select-control.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import {
  createManagerQueries,
  headerSaveButton,
  setInputValue,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import {
  booksScrollsFixtures,
  managerComponents,
  settleBetweenTests,
  settleRouteExit,
  compareStrings,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  assertHeaderBackIsGhost,
  craftingParent,
  craftingSubitem,
  gatheringSubitem,
  navButton,
  worldNavItem,
  worldTravelItem,
} = queries;
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
export function registerGatheringCases() {
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


  // Site 10 (issue 1321): the gathering EVENT browser's "Active environments" fact.
  //   3. The `environment.enabled !== false` scoping filter regressing (covered by the
  //      `env-thorn-disabled` environment below, which composes on every other axis and must
  //      still read zero).
  it('computes the gathering event browser\'s "Active environments" fact through the shared seam', async () => {
    const calls = [];
    const gatheringEventFactEnvironments = [
      {
        id: 'env-thorn-a',
        craftingSystemId: 'alchemy',
        name: 'Stormlit Thicket',
        enabled: true,
        biomes: ['forest'],
        dangerLevel: 'deadly',
        // Unrelated to the active-environment count below: it drives the "used in
        // environments" card instead (issue 1707 phase 2 review).
        enabledEventIds: ['event-storm-omen'],
      },
      {
        id: 'env-thorn-b',
        craftingSystemId: 'alchemy',
        name: 'Ashen Hollow',
        enabled: true,
        biomes: ['forest'],
        dangerLevel: 'extreme',
      },
      // Composes on biome but NOT danger under the real `kind: 'event'` rule (a `deadly`-tagged
      // event needs an environment ranked `deadly` or above). If `'event'` regresses to
      // `'task'`, `includeDanger` goes false, danger stops mismatching, and this environment
      // wrongly joins the count — the failure mode 1 mutation below proves it does.
      {
        id: 'env-thorn-safe',
        craftingSystemId: 'alchemy',
        name: 'Quiet Meadow',
        enabled: true,
        biomes: ['forest'],
        dangerLevel: 'safe',
      },
      // Wrong biome: excluded on every axis.
      {
        id: 'env-thorn-cavern',
        craftingSystemId: 'alchemy',
        name: 'Silent Cavern',
        enabled: true,
        biomes: ['cavern'],
        dangerLevel: 'deadly',
      },
      // Matches biome, danger AND conditions, but is disabled.
      {
        id: 'env-thorn-disabled',
        craftingSystemId: 'alchemy',
        name: 'Fogbound Hollow (disabled)',
        enabled: false,
        biomes: ['forest'],
        dangerLevel: 'deadly',
      },
    ];
    const gatheringEventFactEvent = {
      id: 'event-storm-omen',
      name: 'Storm Omen',
      description: 'A deadly squall drives dangerous game to shelter.',
      img: 'icons/svg/hazard.svg',
      enabled: true,
      dropRate: 15,
      biomes: ['forest'],
      // Non-empty and satisfied only by the overridden current weather below.
      weather: ['heavy-rain'],
      timeOfDay: [],
      dangerTags: ['deadly'],
    };
    // Unreferenced by any environment: the counterpart empty state for the same card.
    const gatheringEventFactUnreferencedEvent = {
      id: 'event-clear-skies',
      name: 'Clear Skies',
      enabled: true,
      dropRate: 15,
      biomes: [],
      weather: [],
      timeOfDay: [],
      dangerTags: [],
    };

    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryEvents: [gatheringEventFactEvent, gatheringEventFactUnreferencedEvent],
          gatheringEventFactEnvironments,
          gatheringEventFactWeather: 'heavy-rain',
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Events').click();
    await tick();
    flushSync();

    assert.ok(
      target.querySelector('[data-gathering-events-browser]'),
      'Events tab should mount the event library browser'
    );
    assert.ok(
      target.textContent.includes('Storm Omen'),
      'the single library event should be auto-selected into the inspector'
    );
    assert.equal(
      target.querySelector('[data-gathering-event-fact="environments"] strong').textContent.trim(),
      '2',
      'the event fact should count only the environments the shared seam composes: matching ' +
        'biome AND danger AND current conditions, scoped to enabled environments in this system'
    );
    assert.ok(
      Boolean(target.querySelector('[data-event-environment-usage-chips]')),
      'Storm Omen is referenced by Stormlit Thicket, so its card renders chips'
    );

    target.querySelector('[data-gathering-event-id="event-clear-skies"] .manager-gathering-event-identity').click();
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector('[data-event-environment-usage-empty]')),
      'Clear Skies is unreferenced, so the same card renders the empty state'
    );
  });

  it('deletes the editing gathering task from the editor toolbar and returns to the task browser', async () => {
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

    navButton('Gathering').click();
    await tick();
    flushSync();

    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();

    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );

    const headerDeleteButton = target.querySelector(
      '.manager-header-actions .manager-button.is-danger'
    );
    assert.ok(headerDeleteButton, 'editor toolbar should expose a destructive delete button');
    assert.ok(headerDeleteButton.textContent.includes('Delete gathering task'));
    headerDeleteButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'deleteGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs'
      ),
      `expected deleteGatheringLibraryTask call for task-herbs, got ${JSON.stringify(calls)}`
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
  });

  it('authors task-owned gathering modes while retaining inactive result sources across save and reload', async () => {
    const calls = [];
    const retainedGroups = [
      {
        id: 'group-rich',
        name: '  Rich Vein ',
        results: [{ id: 'result-ore', componentId: 'c1', quantity: 2 }],
      },
      {
        id: 'group-poor',
        name: 'Poor Vein',
        results: [{ id: 'result-coal', componentId: 'c4', quantity: 1 }],
      },
    ];
    mountManager(calls, {
      taskResultGroups: retainedGroups,
      gatheringResolutionMode: 'progressive',
      gatheringTaskValidation: (task) =>
        task?.resolutionMode === 'straight'
          ? {
              valid: false,
              errors: ['Direct mode requires exactly one non-empty result group'],
              resultErrors: ['Direct mode requires exactly one non-empty result group'],
            }
          : { valid: true, errors: [], resultErrors: [] },
      gatheringCraftingCheck: {
        routed: {
          type: 'relative',
          relativeOutcomes: [
            { id: 'rich', name: 'rich vein', success: true, dc: 5 },
            { id: 'poor', name: 'Poor Vein', success: true, dc: 0 },
          ],
          fixedOutcomes: [],
        },
      },
    });
    await tick();
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();

    const modeGroup = target.querySelector('[data-gathering-task-resolution-mode]');
    assert.ok(modeGroup, 'the task editor exposes its own resolution-mode control');
    assert.equal(
      modeGroup.querySelector('input[value="d100"]').checked,
      true,
      'a task mode is independent of the legacy progressive economy mode'
    );
    assert.ok(target.querySelector('[data-gathering-task-drops-table]'));
    assert.ok(!target.querySelector('[data-gathering-task-results]'));
    assert.ok(target.querySelector('.manager-inspector'), 'd100 keeps the drop inspector');
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, undefined);

    const straight = modeGroup.querySelector('input[value="straight"]');
    straight.checked = true;
    straight.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-gathering-task-results="straight"]'));
    assert.ok(target.querySelector('[data-recipe-result-item]'));
    assert.ok(target.textContent.includes('Iron Ore'), 'straight results are visible after acting');
    assert.ok(!target.querySelector('[data-gathering-task-drops-table]'));
    assert.equal(
      target.querySelector('.manager-inspector'),
      null,
      'Direct suppresses the entire unused inspector'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, 'results');
    assert.ok(
      target
        .querySelector('[data-gathering-task-results-validation]')
        ?.textContent.includes('Direct mode requires exactly one non-empty result group'),
      'the blocking reason is rendered beside Direct results'
    );
    assert.ok(
      !target.querySelector('[data-gathering-task-drop-inspector]'),
      'inactive d100 rows do not keep their inspector active'
    );

    const routed = target.querySelector(
      '[data-gathering-task-resolution-mode] input[value="routed"]'
    );
    routed.checked = true;
    routed.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-gathering-task-results="routed"]'));
    assert.equal(
      target.querySelector('.manager-inspector'),
      null,
      'Check suppresses the entire unused inspector'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.gatheringTaskLayout, 'results');
    assert.deepEqual(
      Array.from(target.querySelectorAll('[data-gathering-routed-tier-status]')).map((row) => [
        row.dataset.gatheringRoutedTierStatus,
        row.dataset.matchCount,
      ]),
      [
        ['rich', '1'],
        ['poor', '1'],
      ],
      'routed tiers match result-group names after trimming and case folding'
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    const saved = calls.find(
      (call) =>
        call[0] === 'updateGatheringLibraryTask' &&
        call[1] === 'alchemy' &&
        call[2] === 'task-herbs' &&
        call[3].resolutionMode === 'routed'
    );
    assert.ok(saved, 'Save persists the selected task resolution mode');
    assert.deepEqual(saved[3].dropRows.map((row) => row.id), ['drop-nightshade']);
    assert.deepEqual(saved[3].resultGroups, retainedGroups);

    target.querySelector('[data-gathering-task-back]').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-gathering-task-resolution-mode] input[value="routed"]').checked,
      true,
      'saved task mode reloads into the selector'
    );
    assert.ok(target.textContent.includes('Iron Ore'));
    assert.ok(target.textContent.includes('Coal'));
  });

  it('defaults an absent task resolution mode to d100 and removes the economy selector', async () => {
    mountManager([], { omitTaskResolutionMode: true, gatheringResolutionMode: 'routed' });
    await tick();
    flushSync();
    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target.querySelector('[aria-label="Edit Gather Moon Herbs"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-gathering-task-resolution-mode] input[value="d100"]').checked,
      true
    );

    target.querySelector('[data-gathering-task-back]').click();
    await tick();
    flushSync();
    gatheringSubitem('Settings').click();
    await tick();
    flushSync();
    assert.ok(!target.querySelector('[data-gathering-resolution-mode]'));
    assert.ok(target.querySelector('[data-economy-mode-card]'));
  });

  it('edits gathering task drop rules from unresolved row through inspector modifiers', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async () => ({ id: 'c2', name: 'Glass Vial' }),
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const knownDropIds = new Set(
      Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(
        (node) => node.dataset.gatheringTaskDropId
      )
    );
    Array.from(target.querySelectorAll('.manager-task-card-header .manager-button'))
      .find((button) => button.textContent.includes('Add drop rule'))
      .click();
    await tick();
    flushSync();

    const addedDropRow = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).find(
      (node) => !knownDropIds.has(node.dataset.gatheringTaskDropId)
    );
    assert.ok(addedDropRow, 'add drop should stage an unresolved selected drop row');
    const addedRow = { id: addedDropRow.dataset.gatheringTaskDropId };
    assert.ok(addedDropRow.querySelector('[data-gathering-task-drop-zone]'));
    assert.ok(addedDropRow.textContent.includes('No Component'));
    assert.ok(addedDropRow.textContent.includes('Create or assign'));
    assert.equal(addedDropRow.textContent.includes('Drop component'), false);
    assert.equal(addedDropRow.textContent.includes('Drop chance'), false);
    assert.equal(addedDropRow.textContent.includes('Quantity'), false);
    assert.equal(addedDropRow.querySelector('[aria-label="Select drop rule"]'), null);
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await tick();
    flushSync();
    assert.ok(
      target
        .querySelector('[data-gathering-task-drop-inspector]')
        .textContent.includes('Nightshade With An Exceptionally Long Localized Component Name')
    );
    addedDropRow.click();
    await tick();
    flushSync();
    assert.equal(
      target
        .querySelector('[data-gathering-task-drop-inspector]')
        .textContent.includes('Drop component'),
      false
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-rate] .manager-drop-rate-percent input'
      ).value,
      '25'
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-inspector] [data-gathering-drop-inspector-count] input'
      ).value,
      '1'
    );
    assert.equal(
      target.querySelector(
        '[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Duplicate"]'
      ),
      null
    );
    assert.equal(
      target.querySelector('[data-gathering-task-drop-id="drop-nightshade"] [aria-label="Delete"]'),
      null
    );

    const inspectorSlider = target.querySelector(
      '[data-gathering-task-drop-inspector] input[type="range"]'
    );
    inspectorSlider.value = '100';
    inspectorSlider.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Duplicate"]').click();
    await tick();
    flushSync();
    const unresolvedDropsAtRate100 = Array.from(
      target.querySelectorAll('[data-gathering-task-drop-id]')
    ).filter((node) => node.textContent.includes('No Component'));
    assert.ok(
      unresolvedDropsAtRate100.length >= 2,
      'duplicate should stage a second unresolved drop row'
    );
    target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`).click();
    await tick();
    flushSync();
    target.querySelector('[data-gathering-task-drop-inspector] [aria-label="Delete"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector(`[data-gathering-task-drop-id="${addedRow.id}"]`),
      null,
      'delete should stage removal of the row'
    );
  });

  it('browses and drags managed components inside the gathering task editor', async () => {
    const calls = [];
    const importedDrops = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          extendedComponentCards: true,
          taskDropRows: [
            {
              id: 'drop-empty',
              componentId: '',
              itemUuid: '',
              systemItemId: '',
              name: '',
              quantity: 1,
              dropRate: 25,
              enabled: false,
            },
            {
              id: 'drop-stale',
              componentId: 'c3',
              itemUuid: 'Item.stale',
              systemItemId: 'legacy-system-item',
              name: 'Legacy Name',
              quantity: 1,
              dropRate: 40,
              enabled: true,
            },
          ],
        }),
        services: {
          openCurrentAdmin: () => {},
          importSingleManagedItemFromDrop: async (data) => {
            importedDrops.push(data);
            return { id: 'c1', name: 'Iron Ore' };
          },
        },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const browser = target.querySelector('[data-gathering-task-component-browser]');
    const dropsCard = target.querySelector('.manager-task-drops-card');
    assert.ok(browser, 'component browser should render in the task editor');
    assert.equal(
      Boolean(browser.compareDocumentPosition(dropsCard) & Node.DOCUMENT_POSITION_FOLLOWING),
      true,
      'component browser should render above drop rules'
    );
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'component browser should default to six cards per page'
    );
    assert.ok(browser.textContent.includes('Iron Ore'));
    assert.equal(
      browser.textContent.includes('River Salt'),
      false,
      'seventh component should start on the next page'
    );

    const nameSearch = target.querySelector('[aria-label="Search component names"]');
    nameSearch.value = 'coal';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 1);
    assert.ok(browser.textContent.includes('Coal'));

    nameSearch.value = 'fuel';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      0,
      'component browser name search should not match descriptions'
    );

    nameSearch.value = '';
    nameSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const tagSearch = target.querySelector('[aria-label="Search component tags"]');
    tagSearch.value = 'her';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('[data-gathering-component-tag-suggestion]'))
      .find((button) => button.textContent.includes('herb'))
      .click();
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('[data-gathering-component-card]').length, 3);
    assert.ok(browser.textContent.includes('Nightshade'));
    assert.ok(browser.textContent.includes('Moon Fern'));
    assert.ok(browser.textContent.includes('Sun Petal'));

    tagSearch.value = 'moo';
    tagSearch.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    Array.from(target.querySelectorAll('[data-gathering-component-tag-suggestion]'))
      .find((button) => button.textContent.includes('moon'))
      .click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      1,
      'selected component tags should require all tags'
    );
    assert.ok(browser.textContent.includes('Moon Fern'));
    const selectedTagPills = Array.from(
      target.querySelectorAll('[data-gathering-component-tag-pill]')
    );
    assert.ok(
      selectedTagPills.every((pill) => pill.classList.contains('manager-selected-tag-pill')),
      'selected component tags should render as removable pills'
    );

    for (const pill of Array.from(
      target.querySelectorAll('[data-gathering-component-tag-pill] button')
    )) {
      pill.click();
      await tick();
      flushSync();
    }

    function dragPayloadFrom(card) {
      let raw = '';
      const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(dragStart, 'dataTransfer', {
        value: {
          setData: (type, value) => {
            if (type === 'text/plain') raw = value;
          },
          effectAllowed: '',
        },
      });
      card.dispatchEvent(dragStart);
      return raw;
    }

    function dropPayloadOn(row, raw) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { getData: (type) => (type === 'text/plain' ? raw : '') },
      });
      row.dispatchEvent(dropEvent);
    }

    const emptyRow = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    const glassPayload = dragPayloadFrom(
      target.querySelector('[data-gathering-component-card="c2"]')
    );
    assert.deepEqual(JSON.parse(glassPayload), {
      type: 'FabricateManagedComponent',
      componentId: 'c2',
    });
    dropPayloadOn(emptyRow, glassPayload);
    await tick();
    flushSync();
    const emptyRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-empty"]');
    assert.ok(
      emptyRowAfter && emptyRowAfter.textContent.includes('Glass Vial'),
      'managed-component drag should stage the new component on the drop row'
    );

    const staleRow = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    const coalPayload = dragPayloadFrom(
      target.querySelector('[data-gathering-component-card="c4"]')
    );
    dropPayloadOn(staleRow, coalPayload);
    await tick();
    flushSync();
    const staleRowAfter = target.querySelector('[data-gathering-task-drop-id="drop-stale"]');
    assert.ok(
      staleRowAfter && !staleRowAfter.textContent.includes('Legacy Name'),
      'managed-component drag onto a stale row should stage the replacement'
    );

    dropPayloadOn(staleRow, JSON.stringify({ type: 'Item', uuid: 'Item.imported' }));
    await Promise.resolve();
    await tick();
    flushSync();
    assert.deepEqual(
      importedDrops,
      [{ type: 'Item', uuid: 'Item.imported' }],
      'non-managed drops should keep using the import flow'
    );
  });

  it('keeps the component browser per-page selector after a page size fits everything on one page', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { extendedComponentCards: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const footer = target.querySelector('.manager-task-component-browser-footer');
    const sizeSelect = () => footer.querySelector('[data-pagination-size]');
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'component browser should default to six cards per page'
    );
    assert.ok(sizeSelect(), 'per-page selector should render while multiple pages exist');
    assert.ok(
      footer.querySelector('[data-pagination-next]'),
      'next-page control should render while multiple pages exist'
    );

    // Selecting 9 fits all seven components on a single page. The per-page selector must
    // survive so the user can still switch back — the prev/next nav is the only part that
    // should disappear once there is a single page.
    chooseSelectOption(target, '[data-pagination-size]', 9);
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      8,
      'choosing nine per page should show every component on one page'
    );
    assert.ok(
      sizeSelect(),
      'per-page selector must remain visible when the chosen size fits everything on one page'
    );
    // THE CONTROL STATES ITS VALUE AS A LABEL NOW (issue 1504). A native `<select>` carried it in
    // `.value`; the converted trigger renders the chosen option's label, so what a GM reads is
    // `9` as text rather than `9` as an attribute.
    assert.equal(
      selectTriggerText(target, '[data-pagination-size]'),
      '9',
      'per-page selector should reflect the chosen page size'
    );
    assert.equal(
      footer.querySelector('[data-pagination-next]'),
      null,
      'prev/next nav should hide when there is only one page'
    );

    // Recoverability: the surviving selector still works to reduce the page size again.
    chooseSelectOption(target, '[data-pagination-size]', 6);
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('[data-gathering-component-card]').length,
      6,
      'the per-page selector should switch back to six per page'
    );
  });

  it('caps gathering task drop modifiers at four labels and redirects to the selected rule beyond', async () => {
    const fourModifiers = Array.from({ length: 4 }, (_, index) => ({
      id: `four-${index}`,
      conditionId: `four-${index}`,
      value: index + 1,
    }));
    const fiveModifiers = Array.from({ length: 5 }, (_, index) => ({
      id: `five-${index}`,
      conditionId: `five-${index}`,
      value: index + 1,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          taskDropRows: [
            {
              id: 'drop-four-modifiers',
              componentId: 'c1',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fourModifiers, weather: [] },
            },
            {
              id: 'drop-five-modifiers',
              componentId: 'c3',
              quantity: 1,
              dropRate: 25,
              enabled: true,
              conditionModifiers: { timeOfDay: fiveModifiers, weather: [] },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const fourModifierRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-four-modifiers"]'
    );
    const fiveModifierRow = target.querySelector(
      '[data-gathering-task-drop-id="drop-five-modifiers"]'
    );
    // Up to four modifiers render as chips (which scroll within the cell if long names wrap);
    // five or more are capped and redirect to the selected rule's inspector.
    assert.equal(fourModifierRow.querySelectorAll('.manager-drop-modifier-pill').length, 4);
    assert.equal(fourModifierRow.textContent.includes('See selected rule for modifiers'), false);
    assert.equal(fiveModifierRow.querySelectorAll('.manager-drop-modifier-pill').length, 0);
    assert.ok(fiveModifierRow.querySelector('.manager-drop-modifier-overflow'));
    assert.ok(fiveModifierRow.textContent.includes('See selected rule for modifiers'));
  });

  it('colours gathering task drop chance sliders by rarity threshold', async () => {
    const rarityRows = [
      ['drop-guaranteed', 100, 'is-guaranteed', 'var(--fab-drop-rate-guaranteed)'],
      ['drop-common', 70, 'is-common', 'var(--fab-drop-rate-common)'],
      ['drop-uncommon', 69, 'is-uncommon', 'var(--fab-drop-rate-uncommon)'],
      ['drop-rare', 15, 'is-rare', 'var(--fab-drop-rate-rare)'],
      ['drop-very-rare', 5, 'is-very-rare', 'var(--fab-drop-rate-very-rare)'],
      ['drop-legendary', 4, 'is-legendary', 'var(--fab-drop-rate-legendary)'],
      ['drop-zero', 0, 'is-none', 'var(--fab-drop-rate-none)'],
    ];
    const dropRows = rarityRows.map(([id, dropRate]) => ({
      id,
      componentId: 'c1',
      quantity: 1,
      dropRate,
      enabled: true,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    function assertRenderedRarityRows(rows) {
      for (const [id, dropRate, tierClass, color] of rows) {
        const control = target.querySelector(
          `[data-gathering-task-drop-id="${id}"] .manager-drop-rate-control`
        );
        assert.ok(control.classList.contains(tierClass), `${id} should use ${tierClass}`);
        assert.ok(
          control.getAttribute('style').includes(`--fab-drop-rate-value: ${dropRate}%;`),
          `${id} should expose its slider fill value`
        );
        assert.ok(
          control.getAttribute('style').includes(`--fab-drop-rate-color: ${color};`),
          `${id} should expose ${color}`
        );
      }
    }

    assertRenderedRarityRows(rarityRows.slice(0, 5));
    target.querySelector('.manager-task-drops-card [data-pagination-next]').click();
    await tick();
    flushSync();
    assertRenderedRarityRows(rarityRows.slice(5));
  });

  it('paginates gathering task editor drop rules without snapping back to the selected row', async () => {
    const dropRows = Array.from({ length: 12 }, (_, index) => ({
      id: `drop-page-${index + 1}`,
      componentId: index % 2 === 0 ? 'c1' : 'c3',
      quantity: 1,
      dropRate: 10 + index,
      enabled: true,
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const dropRulesCard = target.querySelector('.manager-task-drops-card');
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'));
    assert.equal(
      dropRulesCard.querySelectorAll('[data-gathering-task-drop-id]').length,
      5,
      'drop rules should default to five rows per page'
    );
    assert.equal(
      dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 1 of 3'
    );
    dropRulesCard.querySelector('[data-pagination-next]').click();
    await tick();
    flushSync();

    assert.equal(
      dropRulesCard.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 2 of 3'
    );
    assert.equal(target.querySelector('[data-gathering-task-drop-id="drop-page-1"]'), null);
    assert.ok(target.querySelector('[data-gathering-task-drop-id="drop-page-6"]'));
  });

  it('shows the drop rank column with boundary-aware reorder buttons under highestRankedDrop mode', async () => {
    const dropRows = [
      { id: 'drop-rank-1', componentId: 'c1', quantity: 1, dropRate: 90, enabled: true },
      { id: 'drop-rank-2', componentId: 'c1', quantity: 1, dropRate: 60, enabled: true },
      { id: 'drop-rank-3', componentId: 'c1', quantity: 1, dropRate: 30, enabled: true },
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          taskDropRows: dropRows,
          rewardSelectionMode: 'highestRankedDrop',
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.ok(
      table.classList.contains('is-ranked-mode'),
      'drop table should opt into ranked-mode layout'
    );
    const rankCells = table.querySelectorAll('[data-gathering-task-drop-rank-cell]');
    assert.equal(rankCells.length, 3, 'every visible drop row should expose a rank cell');
    const ranks = Array.from(rankCells).map((cell) =>
      cell.querySelector('[data-gathering-task-drop-rank]').textContent.trim()
    );
    assert.deepEqual(
      ranks,
      ['#1', '#2', '#3'],
      'rank labels should reflect 1-indexed position in dropRows'
    );

    const firstRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-1"]');
    const lastRow = target.querySelector('[data-gathering-task-drop-id="drop-rank-3"]');
    assert.equal(
      firstRow.querySelector('[data-gathering-task-drop-move="up"]').disabled,
      true,
      'first row should not be movable up'
    );
    assert.equal(
      lastRow.querySelector('[data-gathering-task-drop-move="down"]').disabled,
      true,
      'last row should not be movable down'
    );

    firstRow.querySelector('[data-gathering-task-drop-move="down"]').click();
    await tick();
    flushSync();

    const reorderedIds = Array.from(target.querySelectorAll('[data-gathering-task-drop-id]')).map(
      (node) => node.dataset.gatheringTaskDropId
    );
    assert.deepEqual(
      reorderedIds,
      ['drop-rank-2', 'drop-rank-1', 'drop-rank-3'],
      'moving the top row down should swap it with its neighbor in dropRows'
    );
    const updatedRanks = Array.from(target.querySelectorAll('[data-gathering-task-drop-rank]')).map(
      (node) => node.textContent.trim()
    );
    assert.deepEqual(
      updatedRanks,
      ['#1', '#2', '#3'],
      'rank labels should re-derive from the new array order'
    );
  });

  it('hides the drop rank column when the reward selection mode is not highestRankedDrop', async () => {
    const dropRows = [
      { id: 'drop-unranked-1', componentId: 'c1', quantity: 1, dropRate: 70, enabled: true },
      { id: 'drop-unranked-2', componentId: 'c1', quantity: 1, dropRate: 40, enabled: true },
    ];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { taskDropRows: dropRows, rewardSelectionMode: 'allDrops' }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const table = target.querySelector('[data-gathering-task-drops-table]');
    assert.equal(
      table.classList.contains('is-ranked-mode'),
      false,
      'allDrops mode should not opt into ranked layout'
    );
    assert.equal(
      table.querySelectorAll('[data-gathering-task-drop-rank-cell]').length,
      0,
      'allDrops mode should not render rank cells'
    );
  });

  it('renders the Required Tools picker in the gathering task editor and adds/removes references', async () => {
    const calls = [];
    const toolLabel = 'Pickaxe — ' + 'exceptionally long required tool name '.repeat(12);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [
            {
              id: 'tool-pickaxe',
              label: toolLabel,
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-lantern',
              label: 'Lantern',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
          taskInitialToolIds: ['tool-pickaxe'],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    assert.ok(section, 'required tools section should render in the task editor');

    const attached = section.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(attached.length, 1);
    assert.equal(
      attached[0].getAttribute('data-gathering-task-required-tool-pill'),
      'tool-pickaxe'
    );
    assert.ok(attached[0].textContent.includes('Pickaxe'));
    assert.ok(attached[0].classList.contains('is-truncated'));
    assert.equal(attached[0].getAttribute('title'), toolLabel.trim());
    const toolContent = attached[0].querySelector('.manager-required-tool-content');
    assert.ok(toolContent, 'the thumbnail and name share one shrinkable row');
    assert.equal(toolContent.querySelector('img').getAttribute('alt'), '');
    assert.equal(
      toolContent.querySelector('.manager-required-tool-name').textContent,
      toolLabel.trim()
    );
    assert.equal(
      attached[0].querySelector('[data-chip-remove]').getAttribute('aria-label'),
      `Remove ${toolLabel.trim()} from required tools`
    );

    const resultCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(resultCards.length, 1);
    assert.equal(
      resultCards[0].getAttribute('data-gathering-task-required-tools-card'),
      'tool-lantern'
    );

    resultCards[0].click();
    await tick();
    flushSync();

    const afterAddPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterAddPills.length, 2);
    const afterAddPillIds = Array.from(afterAddPills).map((node) =>
      node.getAttribute('data-gathering-task-required-tool-pill')
    );
    assert.deepEqual(afterAddPillIds.sort(compareStrings), ['tool-lantern', 'tool-pickaxe']);
    assert.equal(
      target.querySelectorAll('[data-gathering-task-required-tools-card]').length,
      0,
      'attached tools should be removed from the result grid'
    );

    const lanternPill = Array.from(afterAddPills).find(
      (node) => node.getAttribute('data-gathering-task-required-tool-pill') === 'tool-pickaxe'
    );
    lanternPill.querySelector('[data-chip-remove]').click();
    await tick();
    flushSync();
    const afterRemovePills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(afterRemovePills.length, 1);
    assert.equal(
      afterRemovePills[0].getAttribute('data-gathering-task-required-tool-pill'),
      'tool-lantern'
    );
    assert.ok(
      document.activeElement === afterRemovePills[0].querySelector('[data-chip-remove]'),
      'removing the long-label member hands focus to the remaining remover'
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          Array.isArray(call[3].toolIds) &&
          call[3].toolIds.length === 1 &&
          call[3].toolIds[0] === 'tool-lantern'
      ),
      `expected Save to persist toolIds: ['tool-lantern'], got ${JSON.stringify(calls.filter((c) => c[0] === 'updateGatheringLibraryTask'))}`
    );
  });

  // Issue 976. The gathering task editor carried the same defect as the recipe editor:
  it('resolves every tool-display precedence case in the gathering task tool picker', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          managedItemOptions: TOOL_PRECEDENCE_MANAGED_ITEMS,
          gatheringLibraryTools: TOOL_DISPLAY_PRECEDENCE_CASES.map((testCase) => ({
            ...testCase.tool,
            enabled: true,
            requirement: null,
            breakage: { mode: 'limitedUses', maxUses: null },
            onBreak: { mode: 'destroy' },
          })),
          taskInitialToolIds: [],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    assert.ok(section, 'the required tools section renders');

    for (const testCase of TOOL_DISPLAY_PRECEDENCE_CASES) {
      const card = section.querySelector(
        `[data-gathering-task-required-tools-card="${testCase.tool.id}"]`
      );
      assert.ok(card, `${testCase.id}: a picker card renders`);
      assert.equal(
        card.querySelector('strong').textContent.trim(),
        testCase.expectedName === null ? 'Unnamed tool' : testCase.expectedName,
        `${testCase.id}: ${testCase.summary}`
      );
      assert.equal(
        card.querySelector('img').getAttribute('src'),
        testCase.expectedImg,
        `${testCase.id}: the card renders the expected image`
      );
      assert.equal(
        card.querySelector('.manager-task-component-card-copy span').textContent.trim(),
        testCase.expectedDescription || 'No description has been added.',
        `${testCase.id}: the card renders the expected description`
      );
    }
  });

  it('renders a stale chip for task toolIds whose library entry is missing and lets the user clear it', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringLibraryTools: [],
          taskInitialToolIds: ['tool-ghost'],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const stalePill = section.querySelector(
      '[data-gathering-task-required-tool-pill="tool-ghost"]'
    );
    assert.ok(stalePill, 'stale tool reference should render as a pill');
    assert.ok(stalePill.classList.contains('is-stale'));
    assert.ok(stalePill.textContent.includes('Deleted tool'));

    assert.ok(
      section.querySelector('[data-gathering-task-required-tools-library-empty]'),
      'library-empty placeholder should render when no tools exist'
    );
    assert.equal(
      section.querySelector('[data-gathering-task-required-tools-search]'),
      null,
      'search input should hide when library is empty'
    );

    stalePill.querySelector('[data-chip-remove]').click();
    await tick();
    flushSync();

    const afterClearPills = target.querySelectorAll('[data-gathering-task-required-tool-pill]');
    assert.equal(
      afterClearPills.length,
      0,
      'removing the stale chip should clear the dangling reference'
    );
    assert.ok(
      target
        .querySelector('[data-gathering-task-required-tools]')
        .textContent.includes('No tools required')
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'updateGatheringLibraryTask' &&
          call[1] === 'alchemy' &&
          call[2] === 'task-herbs' &&
          Array.isArray(call[3].toolIds) &&
          call[3].toolIds.length === 0
      ),
      'saving after stale-chip removal should persist toolIds: []'
    );
  });

  it('filters required-tools results by the search input', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringLibraryTools: [
            {
              id: 'tool-pickaxe',
              label: 'Pickaxe',
              enabled: true,
              componentId: 'c1',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
            {
              id: 'tool-lantern',
              label: 'Lantern',
              enabled: true,
              componentId: 'c2',
              requirement: null,
              breakage: { mode: 'limitedUses', maxUses: null },
              onBreak: { mode: 'destroy' },
            },
          ],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();
    gatheringSubitem('Tasks').click();
    await tick();
    flushSync();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await tick();
    flushSync();

    const section = target.querySelector('[data-gathering-task-required-tools]');
    const initialCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(initialCards.length, 2);

    const searchInput = section.querySelector('[data-gathering-task-required-tools-search] input');
    searchInput.value = 'lant';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    const filteredCards = section.querySelectorAll('[data-gathering-task-required-tools-card]');
    assert.equal(filteredCards.length, 1);
    assert.equal(
      filteredCards[0].getAttribute('data-gathering-task-required-tools-card'),
      'tool-lantern'
    );
  });

  // --- Failed-save alerts in the editor toolbars (issue 919) -----------------------

  const SAVE_FAILED_MESSAGE = 'Save failed. Try again.';

  const gatheringEventLibraryFixtures = [
    {
      id: 'event-thorns',
      name: 'Thorn Snare',
      description: 'Tangled thorns snap shut around a careless gatherer.',
      img: 'icons/svg/hazard.svg',
      enabled: true,
      dropRate: 10,
      biomes: [],
      weather: [],
      timeOfDay: [],
      dangerTags: [],
    },
  ];

  // Two ticks: the save handlers await a store promise.
  async function settleSaveAttempt() {
    await tick();
    await tick();
    flushSync();
  }

  async function clickHeaderSave() {
    headerSaveButton(target).click();
    await settleSaveAttempt();
  }

  async function clickRecipeItemSave() {
    target.querySelector('[data-recipe-item-save]').click();
    await settleSaveAttempt();
  }

  // Every one of these alerts is asserted THROUGH the toolbar.
  function saveErrorNode(selector) {
    return target.querySelector(`.manager-header-actions ${selector}`);
  }

  function assertSaveErrorRendered(selector) {
    const alert = saveErrorNode(selector);
    assert.ok(alert, `expected the failed-save alert ${selector} in the header toolbar`);
    assert.equal(alert.getAttribute('role'), 'alert', 'the failed-save alert is a live region');
    assert.equal(
      alert.textContent.trim(),
      SAVE_FAILED_MESSAGE,
      'the failed-save alert renders its localized message, not an empty element'
    );
  }

  function assertSaveErrorAbsent(selector, why) {
    assert.equal(target.querySelector(selector), null, why);
    assert.equal(
      target.textContent.includes(SAVE_FAILED_MESSAGE),
      false,
      `${why} (the message text is gone from the surface too)`
    );
  }

  async function openDirtyGatheringTaskEditor(calls, storeOptions) {
    mountManager(calls, storeOptions);
    navButton('Gathering').click();
    await settleSaveAttempt();
    gatheringSubitem('Tasks').click();
    await settleSaveAttempt();
    target
      .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
      .click();
    await settleSaveAttempt();
    setInputValue(target.querySelector('[data-gathering-task-field="name"]'), 'Gather Sun Herbs');
    await settleSaveAttempt();
  }

  async function openDirtyGatheringEventEditor(calls, storeOptions) {
    Object.assign(storeOptions, { gatheringLibraryEvents: gatheringEventLibraryFixtures });
    mountManager(calls, storeOptions);
    navButton('Gathering').click();
    await settleSaveAttempt();
    gatheringSubitem('Events').click();
    await settleSaveAttempt();
    target
      .querySelector('[data-gathering-event-id="event-thorns"] [aria-label="Edit Thorn Snare"]')
      .click();
    await settleSaveAttempt();
    setInputValue(target.querySelector('[data-gathering-event-field="name"]'), 'Bramble Snare');
    await settleSaveAttempt();
  }

  for (const [kind, openEditor] of [
    ['task', openDirtyGatheringTaskEditor],
    ['event', openDirtyGatheringEventEditor],
  ]) {
    it(`${kind} availability restores field-sized empties after pointer and keyboard selection`, async () => {
      await openEditor([], {});
      for (const field of ['biomes', 'timeOfDay', 'weather']) {
        const host = target.querySelector(`[data-gathering-${kind}-field="${field}"]`);
        const trigger = host.querySelector('.manager-condition-menu-button');
        const pillSelector = `[data-gathering-${kind}-availability-pill="${field}"]`;
        for (const remover of host.querySelectorAll(`${pillSelector} [data-chip-remove]`)) {
          remover.click();
          await settleSaveAttempt();
        }
        for (const keyboard of [false, true]) {
          assert.ok(host.querySelector('.manager-empty.is-inline.is-field'), `${field} starts empty`);
          trigger.click();
          await settleSaveAttempt();
          if (keyboard) {
            trigger.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
            );
            await settleSaveAttempt();
            trigger.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
            );
          } else {
            document
              .querySelector(`[data-gathering-${kind}-availability-option="${field}"]`)
              .click();
          }
          await settleSaveAttempt();
          assert.ok(!host.querySelector('.manager-empty'), 'selection replaces the placeholder');
          const remover = host.querySelector(`${pillSelector} [data-chip-remove]`);
          assert.ok(remover, 'the selected condition has an accessible removal action');
          assert.ok(remover.getAttribute('aria-label'));
          remover.focus();
          remover.click();
          await settleSaveAttempt();
          assert.ok(!host.querySelector(pillSelector));
          assert.ok(host.querySelector('.manager-empty.is-inline.is-field'));
          assert.ok(document.activeElement === trigger, 'last removal returns focus to the dropdown');
        }
      }
    });
  }

  // Every destination this guard walks is a WORLD route since issue 1282 — Parties.
  const WORLD_EXIT_DESTINATION_VIEWS = Object.freeze({
    parties: 'world',
    downtime: 'world-downtime',
    realms: 'world-travel',
    map: 'world-travel',
  });

  async function attemptDirtyGatheringWorldExit(kind, outcome, destination) {
    const calls = [];
    const title = kind === 'task' ? 'Task' : 'Event';
    const storeOptions = {
      gatheringRealmsEnabled: true,
      // The `downtime` destination below is experimental-gated (issue 1257).
      experimentalFeaturesEnabled: true,
      [`confirmDiscardGathering${title}Result`]: outcome.action,
    };
    if (outcome.saveResult === false) {
      storeOptions[`updateGatheringLibrary${title}Result`] = false;
    }
    if (outcome.rejectSave) {
      storeOptions[`updateGatheringLibrary${title}Reject`] = true;
    }
    if (kind === 'task') await openDirtyGatheringTaskEditor(calls, storeOptions);
    else await openDirtyGatheringEventEditor(calls, storeOptions);

    if (!['parties', 'downtime'].includes(destination)) {
      target.querySelector('#manager-travel-toggle').click();
      await tick();
      flushSync();
      assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'true');
      assert.equal(
        calls.some((call) => call[0] === `confirmDiscardDirtyGathering${title}Draft`),
        false,
        `${kind} ${outcome.name} disclosure must not consume the dirty-route guard`
      );
    }

    const activateDestination = async () => {
      (['parties', 'downtime'].includes(destination)
        ? worldNavItem(destination)
        : worldTravelItem(destination)
      ).click();
      await settleRouteExit();
    };
    if (outcome.rejectSave) await withSilencedConsoleError(activateDestination);
    else await activateDestination();

    const expectedView = outcome.proceeds
      ? WORLD_EXIT_DESTINATION_VIEWS[destination]
      : `gathering-${kind}-edit`;
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      expectedView,
      `${kind} ${outcome.name} should ${outcome.proceeds ? '' : 'not '}leave the editor; rendered: ${JSON.stringify(Array.from(target.querySelectorAll('.fabricate-manager')).map((node) => node.dataset.managerView))}; calls: ${JSON.stringify(calls)}`
    );
    assert.equal(
      (['parties', 'downtime'].includes(destination)
        ? worldNavItem(destination)
        : worldTravelItem(destination)
      ).getAttribute('aria-current'),
      outcome.proceeds ? 'page' : null,
      `${kind} ${outcome.name} ${destination} must not leave a hidden active navigation control`
    );
    assert.ok(
      calls.some((call) => call[0] === `confirmDiscardDirtyGathering${title}Draft`),
      `${kind} ${outcome.name} routes through its dirty-exit confirmation`
    );
    const saveCalls = calls.filter((call) => call[0] === `updateGatheringLibrary${title}`);
    assert.equal(
      saveCalls.length > 0,
      outcome.action === 'save',
      `${kind} ${outcome.name} ${outcome.action === 'save' ? 'does' : 'does not'} save`
    );
  }

  it('guards dirty gathering task and event exits through World Parties, Downtime, and a Travel child', async () => {
    const outcomes = [
      { name: 'cancel', action: 'cancel', proceeds: false },
      { name: 'save false', action: 'save', saveResult: false, proceeds: false },
      { name: 'rejected save', action: 'save', rejectSave: true, proceeds: false },
      { name: 'successful save', action: 'save', proceeds: true },
      { name: 'discard', action: 'discard', proceeds: true },
    ];

    for (const destination of ['parties', 'downtime', 'realms']) {
      for (const kind of ['task', 'event']) {
        for (const outcome of outcomes) {
          await attemptDirtyGatheringWorldExit(kind, outcome, destination);
          unmount(mounted);
          mounted = null;
          target.remove();
          target = null;
        }
      }
    }
  });

  async function openDirtyRecipeItemEditor(calls, storeOptions) {
    Object.assign(storeOptions, {
      experimentalFeaturesEnabled: true,
      recipeItemDefinitions: booksScrollsFixtures,
    });
    mountManager(calls, storeOptions);
    craftingParent().click();
    await settleSaveAttempt();
    craftingSubitem('Books & Scrolls').click();
    await settleSaveAttempt();
    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await settleSaveAttempt();
    target.querySelector('[data-recipe-item-enabled]').click();
    await settleSaveAttempt();
  }

  // The retry case: a GM whose save fails, changes nothing.
  async function assertRepeatFailureReAnnounces(selector, save = clickHeaderSave) {
    await save();
    assertSaveErrorRendered(selector);
    const firstAlert = saveErrorNode(selector);

    await save();
    assertSaveErrorRendered(selector);
    assert.notStrictEqual(
      saveErrorNode(selector),
      firstAlert,
      'a second identical failure re-inserts the alert rather than leaving the first node in place'
    );
    assert.equal(
      firstAlert.isConnected,
      false,
      'the first alert node left the DOM, so the re-insertion is a real announcement'
    );
  }

  // The counterpart constraint, and the reason the pre-attempt clear sits AFTER the
  // composition-loss confirmation rather than at the top of the save: cancelling that
  // confirmation makes no new attempt at all, so a failure the GM has not yet dealt with has to
  // stay exactly where it is. Clearing first would delete the alert node with nothing put in its
  // place — and a removal, unlike an insertion, is typically not announced at all, so the GM
  // would be left with strictly less than they started with.
  async function assertCancelledConfirmKeepsSaveError(selector, storeOptions, cancelKey) {
    await clickHeaderSave();
    assertSaveErrorRendered(selector);
    const standingAlert = saveErrorNode(selector);

    storeOptions[cancelKey] = false;
    await clickHeaderSave();
    assertSaveErrorRendered(selector);
    assert.strictEqual(
      saveErrorNode(selector),
      standingAlert,
      'a cancelled confirmation leaves the standing failure alert in place, untouched'
    );
  }

  // The two gathering rejection paths log through console.error before they surface the
  // alert, so silence just that call rather than dumping an expected stack into the run.
  async function withSilencedConsoleError(run) {
    const original = console.error;
    console.error = () => {};
    try {
      await run();
    } finally {
      console.error = original;
    }
  }

  it('surfaces a gathering-task save that returns false, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryTaskResult: false };
    await openDirtyGatheringTaskEditor(calls, storeOptions);

    assertSaveErrorAbsent(
      '[data-gathering-task-save-error]',
      'no alert before a save has been attempted'
    );

    await clickHeaderSave();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    assertSaveErrorRendered('[data-gathering-task-save-error]');

    storeOptions.updateGatheringLibraryTaskResult = true;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-task-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('surfaces a gathering-task save that rejects, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryTaskReject: true };
    await openDirtyGatheringTaskEditor(calls, storeOptions);

    await withSilencedConsoleError(clickHeaderSave);
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-task-edit'
    );
    assertSaveErrorRendered('[data-gathering-task-save-error]');

    storeOptions.updateGatheringLibraryTaskReject = false;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-task-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('re-announces a gathering-task save that fails the same way twice', async () => {
    await openDirtyGatheringTaskEditor([], { updateGatheringLibraryTaskResult: false });
    await assertRepeatFailureReAnnounces('[data-gathering-task-save-error]');
  });

  it('keeps a standing gathering-task save error when the composition-loss warning is cancelled', async () => {
    const storeOptions = { updateGatheringLibraryTaskResult: false };
    await openDirtyGatheringTaskEditor([], storeOptions);
    await assertCancelledConfirmKeepsSaveError(
      '[data-gathering-task-save-error]',
      storeOptions,
      'confirmGatheringLibraryTaskCompositionLossResult'
    );
  });

  it('surfaces a gathering-event save that returns false, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryEventResult: false };
    await openDirtyGatheringEventEditor(calls, storeOptions);
    assertHeaderBackIsGhost('[data-gathering-event-back]', 'gathering-event-edit');

    assertSaveErrorAbsent(
      '[data-gathering-event-save-error]',
      'no alert before a save has been attempted'
    );

    await clickHeaderSave();
    assert.ok(
      calls.some((call) => call[0] === 'updateGatheringLibraryEvent' && call[2] === 'event-thorns'),
      'Save routes through updateGatheringLibraryEvent'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-event-edit'
    );
    assertSaveErrorRendered('[data-gathering-event-save-error]');

    storeOptions.updateGatheringLibraryEventResult = true;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-event-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  // The event half of the shared panel, asserted through the root (issue 1707): only the rendered
  // hook name can prove the shell still asks for the event subject at this call site.
  it('renders the shared modifier panel at the event subject on the event editor route', async () => {
    await openDirtyGatheringEventEditor([], {});

    const stack = target.querySelector('[data-gathering-event-inspector-stack]');
    assert.ok(Boolean(stack), 'the event editor route renders its inspector stack');
    for (const kind of ['biome', 'timeOfDay', 'weather']) {
      assert.ok(
        Boolean(stack.querySelector(`[data-gathering-event-condition-modifiers="${kind}"]`)),
        `the ${kind} condition-modifier card renders under the event prefix`
      );
      assert.ok(
        Boolean(stack.querySelector(`[data-gathering-event-condition-modifier-picker="${kind}"]`)),
        `the ${kind} condition picker renders under the event prefix`
      );
    }
    assert.ok(
      Boolean(stack.querySelector('[data-gathering-event-character-modifiers]')),
      'the character-modifier card renders under the event prefix'
    );
    assert.ok(
      Boolean(stack.querySelector('[data-gathering-event-character-modifier-search]')),
      'the character-modifier search renders under the event prefix'
    );
    assert.ok(
      !stack.querySelector('[data-gathering-drop-condition-modifiers="biome"]'),
      'the event route must not render the drop prefix: the two call sites pass different subjects'
    );
    assert.ok(
      !stack.querySelector('[data-gathering-drop-character-modifiers]'),
      'the event route must not render the drop prefix'
    );
  });

  // The drop half acted on through the root (issue 1707): its writers arrive pre-bound to
  // `selectedGatheringDrop.id`, so only a click proves the row they reach is the selected one.
  it('adds and steps a drop condition modifier on the selected drop row', async () => {
    const calls = [];
    await openDirtyGatheringTaskEditor(calls, {});
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await settleSaveAttempt();

    const biomeCard = target.querySelector('[data-gathering-drop-condition-modifiers="biome"]');
    assert.ok(Boolean(biomeCard), 'the drop inspector renders the biome condition-modifier card');
    assert.equal(
      biomeCard.querySelectorAll('[data-gathering-drop-modifier-id]').length,
      1,
      'the fixture drop starts with its one seeded biome modifier'
    );

    biomeCard
      .querySelector('[data-gathering-drop-condition-modifier-picker="biome"] button')
      .click();
    await settleSaveAttempt();

    const attached = [...biomeCard.querySelectorAll('[data-gathering-drop-modifier-id]')];
    assert.equal(attached.length, 2, 'the add control attaches a second modifier to this drop');
    const added = attached.find(
      (row) => row.getAttribute('data-gathering-drop-modifier-id') !== 'forest-penalty'
    );
    assert.ok(
      added.textContent.includes('Crystal Cavern'),
      'the added row names the condition the picker had selected'
    );
    assert.ok(added.classList.contains('is-zero'), 'a freshly attached modifier reads zero');

    added
      .querySelector('.manager-condition-modifier-value input')
      .dispatchEvent(
        new globalThis.KeyboardEvent('keydown', {
          key: 'ArrowUp',
          bubbles: true,
          cancelable: true,
        })
      );
    await settleSaveAttempt();
    const addedId = added.getAttribute('data-gathering-drop-modifier-id');
    assert.ok(
      biomeCard
        .querySelector(`[data-gathering-drop-modifier-id="${addedId}"]`)
        .classList.contains('is-positive'),
      'Arrow stepping rewrites the stored value, not only the input the key landed in'
    );

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryTask');
    assert.equal(saved[2], 'task-herbs', 'the save carries the task being edited');
    const savedRow = saved[3].dropRows.find((row) => row.id === 'drop-nightshade');
    assert.ok(Boolean(savedRow), 'the drop row the panel was bound to survives the save');
    const savedBiomes = savedRow.conditionModifiers.biome;
    assert.equal(savedBiomes.length, 2, 'both writes landed on this drop row, by its real id');
    assert.deepEqual(
      savedBiomes
        .filter((modifier) => modifier.conditionId === 'cavern')
        .map((modifier) => [modifier.operator, modifier.value]),
      [['+', 1]],
      'the added modifier persists on the selected drop with its stepped value'
    );
  });

  // The task leaf's own controls (issue 1707 phase 2): the count field and the duplicate action
  // are handed writers pre-bound to the selected drop inside the leaf, so only a gesture proves
  // the row they reach is the selected one rather than the first.
  it('persists a drop count typed into the selected drop inspector', async () => {
    const calls = [];
    await openDirtyGatheringTaskEditor(calls, {});
    target.querySelector('[data-gathering-task-drop-id="drop-nightshade"]').click();
    await settleSaveAttempt();

    const countField = target.querySelector('[data-gathering-drop-inspector-count]');
    assert.ok(Boolean(countField), 'the drop inspector renders the count field');
    const countInput = countField.querySelector('input');
    assert.equal(countInput.value, '2', 'the count field reads the fixture drop\'s own quantity');
    setInputValue(countInput, '7');
    await settleSaveAttempt();

    const duplicate = [...target.querySelectorAll('.manager-drop-editor-actions button')].find(
      (button) => button.getAttribute('aria-label') === 'Duplicate'
    );
    assert.ok(Boolean(duplicate), 'the drop header renders its duplicate action');
    duplicate.click();
    await settleSaveAttempt();

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryTask');
    assert.equal(saved[2], 'task-herbs', 'the save carries the task being edited');
    const typed = saved[3].dropRows.filter((row) => row.id === 'drop-nightshade');
    assert.equal(typed.length, 1, 'the drop the inspector was bound to is still one row');
    assert.equal(typed[0].quantity, 7, 'the typed count landed on that row, by its real id');
    const copies = saved[3].dropRows.filter((row) => row.componentId === typed[0].componentId);
    assert.equal(copies.length, 2, 'duplicating the selected drop added a second copy of it');
    assert.deepEqual(
      copies.map((row) => row.quantity),
      [7, 7],
      'the copy was taken from the selected row after the typed count, not from the first row'
    );
  });

  // The event half's glue: its pick writer is bound to `editingGatheringEvent` at that call site.
  it('persists a character modifier picked from the event editor suggestions', async () => {
    const calls = [];
    await openDirtyGatheringEventEditor(calls, {
      modifiers: [
        { id: 'mod-herbalism', label: 'Herbalism Training', expression: '@skills.nat.total' },
      ],
    });

    const search = target.querySelector('[data-gathering-event-character-modifier-search]');
    assert.ok(Boolean(search), 'the event editor renders the character-modifier search');
    assert.ok(
      !target.querySelector('[data-gathering-event-character-modifier-ref]'),
      'the fixture event starts with no character modifiers attached'
    );

    setInputValue(search.querySelector('input'), 'herbal');
    await settleSaveAttempt();
    const suggestion = target.querySelector(
      '[data-gathering-event-character-modifier-suggestion="mod-herbalism"]'
    );
    assert.ok(Boolean(suggestion), 'the typed term suggests the one library modifier');
    suggestion.click();
    await settleSaveAttempt();

    const ref = target.querySelector('[data-gathering-event-character-modifier-ref]');
    assert.ok(Boolean(ref), 'picking a suggestion attaches a reference row to the event');
    assert.ok(
      ref.textContent.includes('Herbalism Training'),
      'the reference row names the library modifier it points at'
    );

    await clickHeaderSave();
    const saved = calls.findLast((call) => call[0] === 'updateGatheringLibraryEvent');
    assert.equal(saved[2], 'event-thorns', 'the save carries the event being edited');
    assert.deepEqual(
      saved[3].characterModifiers.map((entry) => entry.modifierId),
      ['mod-herbalism'],
      'the picked reference persists on this event, so the pick reached its own record'
    );
  });

  it('surfaces a gathering-event save that rejects, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { updateGatheringLibraryEventReject: true };
    await openDirtyGatheringEventEditor(calls, storeOptions);

    // Before issue 919 `saveGatheringEventDraft` had no `catch` at all.
    await withSilencedConsoleError(clickHeaderSave);
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'gathering-event-edit'
    );
    assertSaveErrorRendered('[data-gathering-event-save-error]');

    storeOptions.updateGatheringLibraryEventReject = false;
    await clickHeaderSave();
    assertSaveErrorAbsent(
      '[data-gathering-event-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('re-announces a gathering-event save that fails the same way twice', async () => {
    await openDirtyGatheringEventEditor([], { updateGatheringLibraryEventResult: false });
    await assertRepeatFailureReAnnounces('[data-gathering-event-save-error]');
  });

  it('keeps a standing gathering-event save error when the composition-loss warning is cancelled', async () => {
    const storeOptions = { updateGatheringLibraryEventResult: false };
    await openDirtyGatheringEventEditor([], storeOptions);
    await assertCancelledConfirmKeepsSaveError(
      '[data-gathering-event-save-error]',
      storeOptions,
      'confirmGatheringLibraryEventCompositionLossResult'
    );
  });

  it('surfaces a recipe-item save that returns false, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { saveRecipeItemResult: false };
    await openDirtyRecipeItemEditor(calls, storeOptions);

    assertSaveErrorAbsent(
      '[data-recipe-item-save-error]',
      'no alert before a save has been attempted'
    );

    await clickRecipeItemSave();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );
    assertSaveErrorRendered('[data-recipe-item-save-error]');

    storeOptions.saveRecipeItemResult = true;
    await clickRecipeItemSave();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assertSaveErrorAbsent(
      '[data-recipe-item-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  it('surfaces a recipe-item save that rejects, and clears it on the next success', async () => {
    const calls = [];
    const storeOptions = { saveRecipeItemReject: true };
    await openDirtyRecipeItemEditor(calls, storeOptions);

    await clickRecipeItemSave();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );
    assertSaveErrorRendered('[data-recipe-item-save-error]');

    storeOptions.saveRecipeItemReject = false;
    await clickRecipeItemSave();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assertSaveErrorAbsent(
      '[data-recipe-item-save-error]',
      'a successful save clears the failed-save alert'
    );
  });

  // `saveRecipeItemDraft` already reset `recipeItemSaveFailed` before its awaited store call.
  it('re-announces a recipe-item save that fails the same way twice', async () => {
    await openDirtyRecipeItemEditor([], { saveRecipeItemResult: false });
    await assertRepeatFailureReAnnounces('[data-recipe-item-save-error]', clickRecipeItemSave);
  });
}
