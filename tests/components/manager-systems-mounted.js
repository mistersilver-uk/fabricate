/** The crafting-system routes: the library, System Settings, System Overview and world rules. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { assertNoElement } from '../helpers/svelte-dom.js';
import { CURRENCY_MACRO_KEYS } from '../../src/systems/currencyProfile.js';
// Issue 1504: a converted control is a shared `<Select>`.
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionLabels,
  selectOptionValues,
} from '../helpers/select-control.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import {
  assertResolutionCard,
  callsWithoutRouteScopedClear,
  createManagerQueries,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { managerComponents, settle, settleBetweenTests, compareStrings } from './manager-mounted-shared.js';

let Component;
let SystemEditViewComponent;
let CraftingSettingsViewComponent;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  assertHeaderBackIsGhost,
  craftingParent,
  gatheringSubitem,
  navButton,
  runRowMenuCommand,
} = queries;
const { mountCurrencyEditor, mountSystemOverviewPage, mountSystemSettings } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerSystemsCases() {
  before(async () => {
    ({
      Component,
      SystemEditViewComponent,
      CraftingSettingsViewComponent,
    } = await managerComponents());
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


  function mountSystemEditView(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(SystemEditViewComponent, { target, props });
    flushSync();
    return target;
  }

  function mountCraftingSettingsView(props) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(CraftingSettingsViewComponent, { target, props });
    flushSync();
    return target;
  }

  it('CraftingSettingsView renders the recipe resolution and flat visibility-mode cards', () => {
    // The recipe resolution + flat visibility-mode controls live on the gated
    // Crafting > Settings page (issue 511, PR-B). Visibility is now a single flat
    // enum (global/restricted/item/knowledge), not the old listMode card.
    const baseSystem = {
      id: 'sys1',
      name: 'System One',
      resolutionMode: 'simple',
      visibilityMode: 'knowledge',
      features: {},
      craftingEffect: {
        showAccess: false,
        showBooksScrolls: true,
        showLimitedUse: false,
        showLearningLimits: true,
        summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryKnowledge',
      },
    };
    mountCraftingSettingsView({ selectedSystem: baseSystem });
    assert.ok(
      target.querySelector('[data-crafting-resolution-mode]'),
      'the resolution-mode card renders on Crafting Settings'
    );
    assert.ok(
      target.querySelector('[data-crafting-visibility-section]'),
      'the flat visibility-mode section renders'
    );
    // All four visibility modes are offered.
    const visibilityOptions = Array.from(
      target.querySelectorAll('[data-crafting-visibility-mode-option]')
    ).map((option) => option.getAttribute('data-crafting-visibility-mode-option'));
    for (const mode of ['global', 'restricted', 'item', 'knowledge']) {
      assert.ok(visibilityOptions.includes(mode), `visibility option "${mode}" is offered`);
    }
    // The effect panel reflects the active mode's conditional surface.
    assert.ok(
      target.querySelector('[data-crafting-settings-context] [data-crafting-effect]'),
      'the effect panel renders alongside the cards'
    );
  });

  it('CraftingSettingsView no longer renders the alchemy check-mode sub-section — it moved to the Checks tab (issue 554)', () => {
    // The alchemy check-mode selector relocated to the top of the Checks tab's
    // Crafting sub-tab, so the Crafting Settings page must not render it even for
    // an alchemy system.
    mountCraftingSettingsView({
      selectedSystem: {
        id: 'sys1',
        name: 'Alchemy System',
        resolutionMode: 'alchemy',
        visibilityMode: 'knowledge',
        alchemy: { checkMode: 'none' },
        features: {},
        craftingEffect: { summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryKnowledge' },
      },
    });
    assert.equal(
      target.querySelector('[data-crafting-alchemy-checkmode-section]'),
      null,
      'the settings page does not render the alchemy check-mode sub-section'
    );
    assert.equal(
      target.querySelector('[data-crafting-alchemy-checkmode]'),
      null,
      'the settings page does not render the alchemy check-mode selector'
    );
    // The Recipe resolution card itself still renders on the settings page.
    assert.ok(
      target.querySelector('[data-crafting-resolution-section]'),
      'the recipe resolution section still renders on the settings page'
    );
  });

  it('SystemEditView: refund-on-player-cancel renders after Time requirements and is disabled while it is off (issue 848)', () => {
    // A player can only cancel a TIMED craft.
    mountSystemEditView({
      selectedSystem: {
        id: 'sys1',
        name: 'System One',
        resolutionMode: 'simple',
        features: { refundOnPlayerCancel: true },
        requirements: { time: { enabled: false } },
      },
    });
    const refund = target.querySelector('[data-system-refund-toggle]');
    assert.ok(refund, 'the refund-on-player-cancel toggle renders');
    assert.equal(refund.disabled, true, 'the toggle is disabled while Time requirements is off');
    const tile = target.querySelector('[data-feature-key="refundOnPlayerCancel"]');
    assert.ok(tile.classList.contains('is-feature-disabled'), 'the tile is greyed while disabled');
    const timeTile = target.querySelector('[data-feature-key="time"]');
    assert.ok(
      timeTile.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the refund tile is rendered AFTER the Time requirements tile'
    );
  });

  it('SystemEditView: refund-on-player-cancel is interactive when Time requirements is on (issue 848)', () => {
    mountSystemEditView({
      selectedSystem: {
        id: 'sys1',
        name: 'System One',
        resolutionMode: 'simple',
        features: { refundOnPlayerCancel: true },
        requirements: { time: { enabled: true } },
      },
    });
    const refund = target.querySelector('[data-system-refund-toggle]');
    assert.ok(refund, 'the refund toggle renders');
    assert.equal(refund.disabled, false, 'the toggle is interactive when Time requirements is on');
  });

  it('renders Systems Library current gathering condition shortcuts for enabled dimensions', () => {
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

    const card = target.querySelector('[data-systems-gathering-conditions]');
    assert.ok(card, 'selected gathering system should show condition shortcut card');
    assert.equal(card.querySelectorAll('[data-systems-gathering-condition]').length, 2);
    assert.ok(card.querySelector('[data-systems-gathering-condition="timeOfDay"]'));
    assert.ok(card.querySelector('[data-systems-gathering-condition="weather"]'));
    assert.ok(card.textContent.includes('Global conditions'));
    assert.ok(card.textContent.includes('Current time of day'));
    assert.ok(card.textContent.includes('Current weather'));
    assert.deepEqual(
      Array.from(card.querySelectorAll('[data-systems-gathering-condition="weather"] option')).map(
        (option) => option.textContent
      ),
      ['Clear Sky', 'Storm Rain']
    );

    const weatherSelect = card.querySelector('[data-systems-gathering-condition="weather"] select');
    weatherSelect.value = 'heavy-rain';
    weatherSelect.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(
      calls.find((call) => call[0] === 'updateGatheringConditions'),
      ['updateGatheringConditions', { weather: 'heavy-rain', systemId: 'alchemy' }]
    );
  });

  it('hides Systems Library condition shortcuts when gathering or both condition dimensions are disabled', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          selectedFeatures: {
            essences: true,
            effectTransfer: true,
            itemTags: true,
            gathering: false,
            recipeCategories: true,
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.equal(target.querySelector('[data-systems-gathering-conditions]'), null);

    unmount(mounted);
    mounted = null;
    target.remove();
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringConfig: {
            systems: {
              alchemy: {
                conditions: {
                  weather: {
                    enabled: false,
                    current: 'clear',
                    values: [{ id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' }],
                  },
                  timeOfDay: {
                    enabled: false,
                    current: 'day',
                    values: [{ id: 'day', label: 'High Day', icon: 'fas fa-sun' }],
                  },
                },
              },
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    assert.equal(target.querySelector('[data-systems-gathering-conditions]'), null);
  });

  it('shows only the enabled Systems Library condition shortcut dimension', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], {
          gatheringConfig: {
            systems: {
              alchemy: {
                conditions: {
                  weather: {
                    enabled: true,
                    current: 'heavy-rain',
                    values: [
                      { id: 'clear', label: 'Clear Sky', icon: 'fas fa-sun' },
                      { id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' },
                    ],
                  },
                  timeOfDay: {
                    enabled: false,
                    current: 'day',
                    values: [{ id: 'day', label: 'High Day', icon: 'fas fa-sun' }],
                  },
                },
              },
            },
          },
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const card = target.querySelector('[data-systems-gathering-conditions]');
    assert.ok(card);
    assert.equal(card.querySelectorAll('[data-systems-gathering-condition]').length, 1);
    assert.ok(card.querySelector('[data-systems-gathering-condition="weather"]'));
    assert.equal(card.querySelector('[data-systems-gathering-condition="timeOfDay"]'), null);
  });

  it('shows the unselected systems library only when no crafting systems exist', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { noSystems: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const navLabels = Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
      label.textContent.trim()
    );
    // 'Parties', 'Travel' and 'Rules & Resources': all three World entries are ungated.
    assert.deepEqual(navLabels, [
      'Component catalogue',
      'Tags & Categories',
      'Essence Catalogue',
      'Tools Catalogue',
      'Parties',
      'Travel',
      'Rules & Resources',
    ]);
    assert.ok(target.textContent.includes('Crafting Systems'));
    assert.ok(target.textContent.includes('No crafting systems yet'));
    assert.ok(target.textContent.includes('Set up your first system'));
    assert.ok(
      target.textContent.includes('Create a system for one crafting discipline or ruleset.')
    );
    assert.ok(target.textContent.includes('Quickstart'));
    assert.equal(target.textContent.includes('Select a system'), false);
    assert.equal(target.querySelectorAll('.manager-setup-card').length, 1);
  });

  it('shows systems loading instead of the empty systems setup while startup is pending', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { noSystems: true, systemsLoading: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    assert.ok(target.textContent.includes('Loading crafting systems...'));
    assert.equal(target.textContent.includes('No crafting systems yet'), false);
    assert.equal(target.textContent.includes('Set up your first system'), false);
    assert.ok(target.querySelector('[data-systems-loading]'));
  });

  it('toggles systems library row status without selecting the row', async () => {
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

    const smithingToggle = target.querySelector('[aria-label="Enable Smithing"]');
    assert.ok(smithingToggle, 'disabled system row should expose an enable toggle');
    assert.equal(smithingToggle.getAttribute('aria-pressed'), 'false');
    assert.ok(smithingToggle.classList.contains('is-off'));

    smithingToggle.click();
    await tick();
    flushSync();

    assert.deepEqual(calls.slice(-1), [['toggleSystemEnabled', 'smithing', true]]);
    // Selection reads as `aria-current` on the `listitem` (issue 1515). `aria-selected` is not
    // valid outside a listbox, and the unselected row carries the attribute at all rather than
    // announcing itself as "not selected".
    assert.equal(
      target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-current'),
      'true'
    );
    assert.equal(
      target.querySelector('[data-system-id="smithing"]').hasAttribute('aria-current'),
      false
    );
    assert.equal(
      target.querySelector('[aria-label="Disable Smithing"]').getAttribute('aria-pressed'),
      'true'
    );

    const alchemyToggle = target.querySelector('[aria-label="Disable Alchemy"]');
    assert.ok(alchemyToggle, 'active system row should expose a disable toggle');
    alchemyToggle.click();
    await tick();
    flushSync();

    assert.deepEqual(calls.slice(-1), [['toggleSystemEnabled', 'alchemy', false]]);
    assert.equal(
      target.querySelector('[aria-label="Enable Alchemy"]').getAttribute('aria-pressed'),
      'false'
    );
  });

  it('feature-gates selected-system placeholder navigation', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { selectedFeatures: {} }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
        label.textContent.trim()
      ),
      [
        'System Overview',
        'Crafting',
        'Component Rules',
        'Tags & Categories',
        'Tool Rules',
        'Checks',
        // The four world scoped-entity leaves (issue 1362).
        'Component catalogue',
        'Tags & Categories',
        'Essence Catalogue',
        'Tools Catalogue',
        // No 'Downtime' (issue 1257): the World > Downtime group is gated behind
        // `fabricate.experimentalFeatures`, which this store fixture leaves at its default off.
        'Parties',
        // World > Travel (issue 1282) and World > Currency (issue 1278) sit under Parties and
        // are UNGATED, unlike Downtime.
        'Travel',
        'Rules & Resources',
      ]
    );

    const environmentFact = target.querySelector('[data-count-id="environments"]');
    assert.equal(
      environmentFact.textContent.trim().replace(/\s+/g, ' '),
      'Gathering environments Off'
    );
    assert.equal(
      environmentFact.querySelector('.manager-fact-label')?.textContent.trim(),
      'Gathering environments'
    );
    assert.equal(environmentFact.querySelector('strong.is-disabled')?.textContent.trim(), 'Off');
  });

  it('routes selected-system breadcrumb to settings and returns to system library without clearing selection', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const recipesNav = craftingParent();
    assert.equal(recipesNav.disabled, false);
    // Parent total = 2 recipes + 2 books & scrolls items in the default fixture (issue 643).
    assert.equal(recipesNav.querySelector('.manager-nav-count')?.textContent.trim(), '4');
    for (const label of ['Graph']) {
      const plannedNav = navButton(label);
      assert.equal(plannedNav.disabled, true);
      assert.equal(plannedNav.querySelector('.manager-nav-planned')?.textContent.trim(), 'Soon');
      // The planned-view word is NOT the record-count vehicle (issue 1515).
      assert.ok(
        !plannedNav.querySelector('.manager-nav-count'),
        'a placeholder row draws no record count'
      );
    }

    craftingParent().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');

    const systemCrumb = Array.from(target.querySelectorAll('.manager-breadcrumbs button')).find(
      (button) => button.textContent.trim() === 'Alchemy'
    );
    systemCrumb.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    assert.ok(target.querySelector('.manager-system-edit-form'));
    // The lone header action on this route.
    assertHeaderBackIsGhost('[data-system-edit-back]', 'system-edit');

    // The rail's crafting-system card SELECTS (issue 643).
    const scopeCard = target.querySelector('.manager-scope-card');
    assert.ok(scopeCard, 'selected system scope card should render');
    const scopeSelect = scopeCard.querySelector('[data-manager-scope-select]');
    assert.ok(scopeSelect, 'the rail card should expose a system select');
    assert.equal(scopeSelect.tagName, 'SELECT');
    assert.equal(scopeSelect.value, 'alchemy', 'the select names the selected system');
    assert.ok(
      Array.from(scopeSelect.options)
        .map((option) => option.value)
        .includes('alchemy'),
      'the select lists the systems the manager knows about'
    );
    assert.equal(
      scopeCard.querySelector('.manager-scope-name'),
      null,
      'the static name span is retired, not merely hidden'
    );

    const returnButton = scopeCard.querySelector('.manager-scope-return');
    assert.ok(returnButton, 'selected system scope should expose a return-to-library button');
    assert.equal(returnButton.getAttribute('aria-label'), 'Return to System Library');
    assert.equal(returnButton.getAttribute('title'), 'Return to System Library');
    assert.match(returnButton.textContent, /All crafting systems/);

    const callsBeforeReturn = callsWithoutRouteScopedClear(calls).length;
    returnButton.click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(
      callsWithoutRouteScopedClear(calls).length,
      callsBeforeReturn,
      'returning to system library should not call selectSystem'
    );
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'systems');
    assert.ok(
      target.querySelector('.manager-scope-card'),
      'selected system scope should remain visible'
    );
    assert.equal(
      target.querySelector('[data-system-id="alchemy"]').getAttribute('aria-current'),
      'true'
    );
    // The Crafting group is still open, and that is the fix rather than a leak (issue 1185):
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-nav-label')).map((label) =>
        label.textContent.trim()
      ),
      [
        'System Overview',
        'Crafting',
        'Recipes',
        'Books & Scrolls',
        'Knowledge',
        'Settings',
        'Component Rules',
        'Tags & Categories',
        'Essence Rules',
        'Tool Rules',
        'Checks',
        'Gathering',
        'Graph',
        // The four world scoped-entity leaves (issue 1362).
        'Component catalogue',
        'Tags & Categories',
        'Essence Catalogue',
        'Tools Catalogue',
        'Parties',
        'Travel',
        'Rules & Resources',
        'Downtime',
      ]
    );
    // The system library's own page copy is the shell's.
    assert.ok(target.textContent.includes('Select a row to view counts and enabled features.'));
  });

  // Creating a crafting system already SELECTED it in the store.
  it('creating a crafting system opens the System Overview of the NEW system', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls, {}), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'systems',
      'pre-condition: the manager opens on the systems library'
    );

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    // The whole point: the NEW system, not whichever one happened to be selected before.
    assert.equal(
      target.querySelector('#manager-system-name')?.value,
      'New Crafting System',
      'the overview shows the system that was just created'
    );
  });

  // …but only when a system was actually created. Backing out of the dirty-environment
  // confirm returns `false`, and navigating anyway would abandon the very edit the GM just
  // chose to keep.
  it('a cancelled crafting-system create stays on the systems library', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { createSystemResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    target.querySelector('.manager-header-actions .manager-button.is-primary').click();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'systems');
  });

  it('shows setup guidance and keeps create routing when a gathering system has no environments', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyEnvironments: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Gathering').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'environments');
    const gatheringItems = Array.from(target.querySelectorAll('.manager-nav-subitem'));
    assert.deepEqual(
      gatheringItems.map((item) => item.querySelector('.manager-nav-label')?.textContent.trim()),
      ['Environments', 'Tasks', 'Events', 'Settings']
    );
    assert.deepEqual(
      gatheringItems.map(
        (item) => item.querySelector('.manager-nav-count')?.textContent.trim() ?? null
      ),
      ['0', '3', '0', null]
    );
    assert.equal(gatheringSubitem('Environments').getAttribute('aria-current'), 'page');
    assert.ok(target.textContent.includes('Prepare gathering building blocks first'));
    assert.ok(
      target.textContent.includes('Define gathering tasks and events before creating environments')
    );
    assert.ok(target.textContent.includes('Review tasks'));
    assert.ok(target.textContent.includes('Review events'));
    assert.ok(target.textContent.includes('Plan gathering content'));
    assert.ok(target.textContent.includes('Define gathering tasks with their checks'));
    assert.ok(target.textContent.includes('Prepare event options'));
    assert.ok(
      target.textContent.includes(
        'Create environments after the gathering task and event libraries are ready to attach.'
      )
    );
    assert.ok(target.textContent.includes('Gathering docs'));
    assert.equal(target.textContent.includes('Select an environment'), false);

    Array.from(target.querySelectorAll('.manager-table-scroll .manager-button'))
      .find((button) => button.textContent.includes('Review tasks'))
      .click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Tasks').getAttribute('aria-current'), 'page');
    assert.ok(target.textContent.includes('Gather Moon Herbs'));
    assert.ok(target.querySelector('[data-gathering-tasks-browser]'));
    assert.ok(target.querySelector('[data-gathering-task-inspector]'));
    assert.equal(
      target.querySelector('.manager-inspector').textContent.includes('Plan gathering content'),
      false
    );

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-table-scroll .manager-button'))
      .find((button) => button.textContent.includes('Review events'))
      .click();
    await tick();
    flushSync();

    assert.equal(gatheringSubitem('Events').getAttribute('aria-current'), 'page');
    assert.ok(
      target.querySelector('[data-gathering-events-browser]'),
      'Review events button should land on the event library'
    );

    gatheringSubitem('Environments').click();
    await tick();
    flushSync();

    target.querySelector('.manager-table-scroll .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'environment-edit'
    );
    assert.ok(calls.some((call) => call[0] === 'createEnvironmentDraft'));
    assertHeaderBackIsGhost('[data-environment-edit-back]', 'environment-edit');
  });

  it('shows create guidance when the gathering task library is empty', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyGatheringTasks: true }),
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

    assert.ok(target.textContent.includes('No gathering tasks yet'));
    assert.ok(
      target.textContent.includes('Create gathering tasks before attaching them to environments.')
    );
    target.querySelector('[data-gathering-tasks-browser] .manager-button.is-primary').click();
    await tick();
    flushSync();

    assert.deepEqual(
      calls.find((call) => call[0] === 'addGatheringLibraryTask'),
      ['addGatheringLibraryTask', 'alchemy']
    );
  });

  it('shows setup guidance when a system has no recipes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyRecipes: true, experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const recipesNav = craftingParent();
    assert.equal(recipesNav.disabled, false);
    // No recipes, but the fixture's 2 books & scrolls items still count toward the
    // Crafting parent total; the setup guidance below is keyed on empty recipes, not
    // this badge (issue 643).
    assert.equal(recipesNav.querySelector('.manager-nav-count')?.textContent.trim(), '2');
    for (const label of ['Graph']) {
      const plannedNav = navButton(label);
      assert.equal(plannedNav.disabled, true);
      assert.equal(plannedNav.querySelector('.manager-nav-planned')?.textContent.trim(), 'Soon');
      // The planned-view word is NOT the record-count vehicle (issue 1515).
      assert.ok(
        !plannedNav.querySelector('.manager-nav-count'),
        'a placeholder row draws no record count'
      );
    }

    craftingParent().click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Set up recipes'));
    assert.ok(
      target.textContent.includes('Choose the recipe structure supported by the selected system.')
    );
    assert.ok(target.textContent.includes('Recipe docs'));
    assert.equal(target.textContent.includes('Select a recipe'), false);

    // The Recipe Editor was removed, so the empty state no longer offers a
    // Create Recipe button.
    assert.equal(
      target.querySelector('.manager-table-scroll .manager-button.is-primary'),
      null,
      'empty recipe state should not offer a create button'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'createRecipe'),
      'createRecipe should no longer be wired'
    );
  });

  it('points empty recipe setup to Components when the system has no components', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          emptyRecipes: true,
          emptyComponents: true,
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(target.textContent.includes('No recipes yet'));
    assert.ok(target.textContent.includes('Add components before creating recipes'));
    assert.ok(
      target.textContent.includes(
        'Open Components and drop world, compendium, pack, or folder items into this system.'
      )
    );
    assert.ok(target.textContent.includes('Add components'));
    assert.equal(
      target.textContent.includes('Choose the recipe structure supported by the selected system.'),
      false
    );

    Array.from(target.querySelectorAll('.manager-setup-links .manager-button'))
      .find((button) => button.textContent.includes('Add components'))
      .click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.ok(target.textContent.includes('No components yet'));
  });

  it('shows setup guidance and keeps import affordance when a system has no components', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyComponents: true }),
        services: {
          openCurrentAdmin: () => {},
          onDropItem: (data) => calls.push(['dropItem', data]),
        },
      },
    });
    flushSync();

    navButton('Component Rules').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'components');
    assert.ok(target.textContent.includes('No components yet'));
    assert.ok(target.textContent.includes('Set up components'));
    assert.ok(
      target.textContent.includes(
        'Drop world, compendium, pack, or folder items into the component browser.'
      )
    );
    assert.ok(target.textContent.includes('Component docs'));
    assert.ok(target.querySelector('.manager-component-drop-zone'));
    assert.equal(target.textContent.includes('Select a component'), false);
  });

  it('shows setup guidance, and offers no create, when a system has no essences', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { emptyEssences: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'essences');
    assert.ok(target.textContent.includes('No essences yet'));
    assert.ok(target.textContent.includes('Set up essences'));
    assert.ok(
      target.textContent.includes('Create an essence with a clear name, icon, and description.')
    );
    assert.ok(target.textContent.includes('Essence docs'));
    assert.equal(target.textContent.includes('Select an essence'), false);

    // AND STILL NO CREATE, EVEN HERE (issue 1372, maintainer parity round 8). An empty system is
    // the one state where a create button on this header is most tempting, and it is still the
    // wrong layer: an essence is a world record, and the route out is the setup card's own copy
    // plus the rail's Essence Catalogue entry.
    assert.ok(
      !target.querySelector('.manager-header-actions .manager-button'),
      'the Essence Rules header carries no action on an empty system either'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'essences',
      'NON-VACUITY: the route is the essence list, so the empty header is a measurement'
    );
  });

  it('supports search, row selection, in-place system edit, and row actions', async () => {
    const calls = [];
    let onEditSystemCalled = false;
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls),
        services: {
          onEditSystem: () => {
            onEditSystemCalled = true;
          },
        },
      },
    });
    flushSync();

    const search = target.querySelector('input[type="search"]');
    search.value = 'smith';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(target.querySelectorAll('.manager-system-row').length, 1);
    assert.ok(target.textContent.includes('Smithing'));

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    flushSync();

    // THE ROW ITSELF IS INERT (issue 1515). It was a `role="row"` `<div>` with a click handler and
    // `tabindex="0"`, so clicking any cell selected the system and Enter on the row did too. It is
    // a `listitem` now: the selecting control is the identity `<button>` inside it, and a click on
    // a plain cell selects nothing. Both halves are exercised, because a check that only presses
    // the new control cannot see the old whole-row handler surviving beside it.
    target.querySelector('[data-system-id="smithing"] .manager-labeled-cell').click();
    await tick();
    flushSync();
    assert.equal(
      callsWithoutRouteScopedClear(calls).some((call) => call[0] === 'selectSystem'),
      false,
      'a click on a non-identity cell should no longer select the row'
    );

    target.querySelector('[data-system-id="smithing"] .manager-system-identity').click();
    await tick();
    flushSync();
    target.querySelector('[data-system-id="smithing"] .manager-system-identity').click();
    await tick();
    flushSync();
    await runRowMenuCommand('[data-system-id="smithing"]', 'Export system');
    target.querySelector('[aria-label="Edit Smithing"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(onEditSystemCalled, false);
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    assert.ok(target.textContent.includes('System Overview'));
    // The Settings tab is the default, so its form renders immediately.
    assert.equal(
      target.querySelector('[data-system-tab="settings"]')?.getAttribute('aria-selected'),
      'true'
    );
    assert.ok(target.querySelector('.manager-system-edit-form'));
    assert.deepEqual(callsWithoutRouteScopedClear(calls).slice(-4), [
      ['selectSystem', 'smithing'],
      ['selectSystem', 'smithing'],
      ['exportSystem', 'smithing'],
      ['selectSystem', 'smithing'],
    ]);
  });

  it('writes system edit controls through existing admin-store callbacks', async () => {
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

    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    const name = target.querySelector('#manager-system-name');
    const description = target.querySelector('#manager-system-description');
    name.value = 'Greater Alchemy';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    description.value = 'Updated potion work';
    description.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // The Unsaved chip lights while the identity form differs from the persisted
    // system and renders BEFORE the Save details button in DOM order.
    const heading = target.querySelector('.manager-edit-card-heading');
    const dirtyChip = heading.querySelector('[data-system-details-dirty]');
    assert.ok(dirtyChip, 'the Unsaved chip lights while the identity form is dirty');
    assert.ok(
      dirtyChip.compareDocumentPosition(heading.querySelector('button[type="submit"]')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      'the chip precedes the Save details button'
    );

    target
      .querySelector('.manager-system-edit-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    flushSync();

    // Resolution mode moved to the gated Crafting > Settings page (issue 511).
    assert.equal(
      target.querySelector('#manager-system-resolution-mode'),
      null,
      'the resolution-mode card is no longer on System Overview'
    );

    target.querySelector('[data-feature-key="gathering"] .manager-status-toggle').click();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'saveSystemDetails' &&
          call[1] === 'Greater Alchemy' &&
          call[2] === 'Updated potion work'
      )
    );
    // Save re-publishes the projection, so the chip clears naturally (no reseed).
    assert.equal(
      target.querySelector('[data-system-details-dirty]'),
      null,
      'the Unsaved chip clears after Save persists'
    );
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleFeature' && call[1] === 'gathering' && call[2] === false
      )
    );
  });

  // Mount the manager, capture its store.
  async function mountSystemEditForDirtyGuard(options = {}) {
    const calls = [];
    const store = createStore(calls, options);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();
    return { calls, store };
  }

  function typeSystemName(value) {
    const name = target.querySelector('#manager-system-name');
    name.value = value;
    name.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    return name;
  }


  it('keeps the dirty system details chip lit when the same system re-publishes', async () => {
    const { store } = await mountSystemEditForDirtyGuard();
    typeSystemName('Greater Alchemy');
    assert.ok(target.querySelector('[data-system-details-dirty]'), 'the chip lights when dirty');

    // The admin store's async phase-2 publish hands down a NEW selectedSystem
    // object with the SAME id and same persisted values; identity-gated seeding
    // must not clobber the in-progress edit.
    store.viewState.update((state) => ({
      ...state,
      selectedSystem: { ...state.selectedSystem },
    }));
    flushSync();

    assert.equal(
      target.querySelector('#manager-system-name').value,
      'Greater Alchemy',
      'the typed name survives the same-id re-publish'
    );
    assert.ok(
      target.querySelector('[data-system-details-dirty]'),
      'the chip stays lit after the re-publish'
    );
  });

  it('reseeds the system details inputs and clears the chip on a system-identity change', async () => {
    const { store } = await mountSystemEditForDirtyGuard();
    typeSystemName('Greater Alchemy');
    assert.ok(target.querySelector('[data-system-details-dirty]'), 'dirty before the switch');

    // A DIFFERENT system id (mirrors selecting another system) must reseed.
    store.viewState.update((state) => ({
      ...state,
      selectedSystem: {
        ...state.selectedSystem,
        id: 'smithing',
        name: 'Smithing',
        description: 'Heavy equipment work',
      },
    }));
    flushSync();

    assert.equal(
      target.querySelector('#manager-system-name').value,
      'Smithing',
      'the inputs reseed to the new system'
    );
    assert.equal(
      target.querySelector('[data-system-details-dirty]'),
      null,
      'the chip clears on the identity change'
    );
  });

  it('does not prompt when navigating away from a clean system details form', async () => {
    const { calls } = await mountSystemEditForDirtyGuard();
    navButton('Component Rules').click();
    await settle();
    assert.ok(
      !calls.some((call) => call[0] === 'confirmDiscardDirtySystemDetailsDraft'),
      'a clean form does not raise the discard prompt'
    );
    assert.equal(
      target.querySelector('.manager-system-edit-form'),
      null,
      'navigation proceeds off the settings form'
    );
  });

  it('prompts and stays put when navigating away from a dirty system details form is cancelled', async () => {
    const { calls } = await mountSystemEditForDirtyGuard({
      confirmDiscardSystemDetailsResult: 'cancel',
    });
    typeSystemName('Greater Alchemy');
    navButton('Component Rules').click();
    await settle();
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtySystemDetailsDraft'),
      'the discard guard prompts'
    );
    assert.ok(
      target.querySelector('.manager-system-edit-form'),
      'Keep editing leaves the GM on the settings form'
    );
    assert.ok(!calls.some((call) => call[0] === 'saveSystemDetails'), 'Keep editing does not save');
  });

  it('saves the lifted system details draft when navigation chooses save', async () => {
    const { calls } = await mountSystemEditForDirtyGuard({
      confirmDiscardSystemDetailsResult: 'save',
    });
    typeSystemName('Greater Alchemy');
    navButton('Component Rules').click();
    await settle();
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'saveSystemDetails' &&
          call[1] === 'Greater Alchemy' &&
          call[2] === 'Potion and essence work'
      ),
      'Save persists the typed name/description from the lifted draft'
    );
    assert.equal(
      target.querySelector('.manager-system-edit-form'),
      null,
      'navigation proceeds after a successful save'
    );
  });

  it('stays on the system details form when a Save-on-navigate fails', async () => {
    const { calls } = await mountSystemEditForDirtyGuard({
      confirmDiscardSystemDetailsResult: 'save',
      saveSystemDetailsResult: false,
    });
    typeSystemName('Greater Alchemy');
    navButton('Component Rules').click();
    await settle();
    assert.ok(
      calls.some((call) => call[0] === 'saveSystemDetails'),
      'a save is attempted'
    );
    assert.ok(
      target.querySelector('.manager-system-edit-form'),
      'a failed save keeps the GM on the settings form (result !== false gate)'
    );
  });

  it('reverts the system details inputs on discard-and-navigate', async () => {
    const { calls } = await mountSystemEditForDirtyGuard({
      confirmDiscardSystemDetailsResult: 'discard',
    });
    typeSystemName('Greater Alchemy');
    navButton('Component Rules').click();
    await settle();
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtySystemDetailsDraft'),
      'discard prompts'
    );
    assert.ok(!calls.some((call) => call[0] === 'saveSystemDetails'), 'discard does not save');
    assert.equal(
      target.querySelector('.manager-system-edit-form'),
      null,
      'navigation proceeds after discard'
    );

    // Re-open the settings form: the inputs show the persisted value again and the
    // chip is clear (the discard bumped the reseed nonce and cleared dirty).
    navButton('System Overview').click();
    await settle();
    assert.equal(
      target.querySelector('#manager-system-name').value,
      'Alchemy',
      'the inputs revert to the persisted value'
    );
    assert.equal(
      target.querySelector('[data-system-details-dirty]'),
      null,
      'the chip is clear on re-entry'
    );
  });

  it('prompts the discard guard when switching systems on a dirty details form', async () => {
    const { calls } = await mountSystemEditForDirtyGuard({
      confirmDiscardSystemDetailsResult: 'cancel',
    });
    typeSystemName('Greater Alchemy');
    const scope = target.querySelector('[data-manager-scope-select]');
    scope.value = 'smithing';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtySystemDetailsDraft'),
      'switching systems on a dirty form raises the same prompt'
    );
  });

  it('does not prompt the discard guard when the blocker link re-enters the same view', async () => {
    const { calls } = await mountSystemEditForDirtyGuard({
      systemValidation: {
        issues: [
          {
            kind: 'system',
            entityId: null,
            entityName: 'Alchemy',
            severity: 'critical',
            blocks: 'system',
            code: 'progressiveNoCheck',
            message: 'Progressive mode requires a configured progressive crafting check.',
            nav: { view: 'system-overview' },
          },
        ],
        counts: { critical: 1, warning: 0, info: 0, blockers: 1 },
        blocksSystem: true,
      },
    });
    typeSystemName('Greater Alchemy');
    assert.ok(target.querySelector('[data-system-details-dirty]'), 'the form is dirty');

    // The blocker link routes through confirmRouteExit('system-edit').
    target.querySelector('[data-system-edit-blocker-link]').click();
    await settle();

    assert.ok(
      !calls.some((call) => call[0] === 'confirmDiscardDirtySystemDetailsDraft'),
      'a same-view navigation does not raise the discard prompt'
    );
    assert.equal(
      target.querySelector('[data-system-tab="validation"]').getAttribute('aria-selected'),
      'true',
      'the Validation tab opens'
    );

    // Back on Settings the typed value and the lit chip are still there.
    target.querySelector('[data-system-tab="settings"]').click();
    await settle();
    assert.equal(
      target.querySelector('#manager-system-name').value,
      'Greater Alchemy',
      'the typed name survives the same-view navigation'
    );
    assert.ok(
      target.querySelector('[data-system-details-dirty]'),
      'the chip is still lit after returning to Settings'
    );
  });

  // A report carrying a system blocker plus a deep-linkable recipe issue.
  const overviewReport = {
    issues: [
      {
        kind: 'system',
        entityId: null,
        entityName: 'Alchemy',
        severity: 'critical',
        blocks: 'system',
        code: 'progressiveNoCheck',
        message: 'Progressive mode requires a configured progressive crafting check.',
        nav: { view: 'system-overview' },
      },
      {
        kind: 'recipe',
        entityId: 'r1',
        entityName: 'Healing Draught',
        severity: 'warning',
        blocks: 'enable',
        code: 'noResultGroup',
        message: 'A step is missing a result group.',
        nav: { view: 'recipe-edit' },
      },
    ],
    counts: { critical: 1, warning: 1, info: 0, blockers: 1 },
    blocksSystem: true,
  };

  it('opens the System Overview page on the Settings tab by default', async () => {
    await mountSystemOverviewPage(overviewReport);

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'system-edit');
    const settingsTab = target.querySelector('[data-system-tab="settings"]');
    const validationTab = target.querySelector('[data-system-tab="validation"]');
    assert.ok(settingsTab, 'Settings tab renders');
    assert.ok(validationTab, 'Validation tab renders');
    assert.equal(settingsTab.getAttribute('aria-selected'), 'true', 'Settings is the default tab');
    assert.equal(validationTab.getAttribute('aria-selected'), 'false');
    assert.ok(target.querySelector('.manager-system-edit-form'), 'the settings form renders');
    assert.ok(
      target.querySelector('[data-system-edit-blocker]'),
      'the system-blocker banner stays on the Settings tab'
    );
    assert.equal(
      target.querySelector('[data-system-overview]'),
      null,
      'the validation list is not rendered while Settings is active'
    );
    // The renamed nav item carries the open-issue badge (critical + warning = 2).
    const navBadge = navButton('System Overview').querySelector('.manager-nav-count');
    assert.equal(navBadge?.textContent.trim(), '2');
    // The Validation tab carries a danger + warning badge of open issues.
    assert.equal(
      validationTab.querySelector('.manager-environment-tab-badge.is-danger')?.textContent.trim(),
      '1'
    );
    assert.equal(
      validationTab.querySelector('.manager-environment-tab-badge.is-warning')?.textContent.trim(),
      '1'
    );
    // AND IN THE ORDER THE SURFACE BENEATH THE TAB READS THEM (issue 1515). The counts row on the
    // validation surface was reconciled to the design system's closed, ordered vocabulary - pass,
    // then warning, then blocking - so a tab strip badging blocking-then-warning above it would
    // state one screen's two figures in two orders. Read as a SEQUENCE of tones rather than by
    // querying each tone in turn, which is what the two clauses above do and is exactly why the
    // wrong order passed them.
    assert.deepEqual(
      [...validationTab.querySelectorAll('.manager-environment-tab-badge')].map((badge) =>
        badge.classList.contains('is-warning') ? 'warning' : 'blocking'
      ),
      ['warning', 'blocking'],
      'the tab badges run warning then blocking, as the counts row below them does'
    );
  });

  it('renders the kind-grouped validation list on the Validation tab and deep-links an issue', async () => {
    const { calls } = await mountSystemOverviewPage(overviewReport);

    target.querySelector('[data-system-tab="validation"]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-system-tab="validation"]').getAttribute('aria-selected'),
      'true'
    );
    assert.ok(
      target.querySelector('[data-system-overview]'),
      'the validation list renders in the Validation panel'
    );
    assert.ok(
      target.querySelector('[data-system-overview-group="system"]'),
      'the system-blocker group renders'
    );
    assert.ok(
      target.querySelector('[data-system-overview-blocker]'),
      'the validation list keeps its blocker note'
    );
    // THE COUNTS STAY ON THE VALIDATION SURFACE.
    const overviewCounts = target.querySelector('[data-system-overview-counts]');
    assert.ok(overviewCounts, 'the warning/blocking summary badges render');
    assert.ok(
      overviewCounts.parentElement?.hasAttribute('data-system-overview'),
      'the counts row is a direct child of the validation surface, not of a page header'
    );
    // THE VOCABULARY IS CLOSED AND THIS SURFACE RENDERS THE SUBSET IT CAN SUPPLY.
    assert.deepEqual(
      [...overviewCounts.querySelectorAll('[data-overview-count]')].map((chip) =>
        chip.getAttribute('data-overview-count')
      ),
      ['warning', 'blocking'],
      'the counts render the spec vocabulary it can supply, in the spec order'
    );
    assert.deepEqual(
      [...target.querySelectorAll('[data-overview-issue]')].map((row) =>
        row.querySelector('[data-overview-severity]')?.getAttribute('data-overview-severity')
      ),
      ['critical', 'warning'],
      'every issue stays listed under its group with its own severity chip, counted or not'
    );

    const recipeLink = target.querySelector(
      '[data-overview-issue="noResultGroup"] [data-overview-link="recipe"]'
    );
    assert.ok(recipeLink, 'the recipe issue exposes a deep-link button');
    recipeLink.click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'the deep link routes to the recipe editor'
    );
  });

  it("switches to the Validation tab when the Settings tab's blocker link is clicked", async () => {
    await mountSystemOverviewPage(overviewReport);

    const blockerLink = target.querySelector('[data-system-edit-blocker-link]');
    assert.ok(blockerLink, 'the blocker banner exposes an open-overview link');
    // Audit row 8's forgotten role (issue 1118). This is a "go and look at that" link inside a
    // callout that already carries the alarm — the triangle, the title and the body copy — and
    // at the base `.manager-button` weight it competed with the sentence explaining it. Ghost
    // is the ruling `component/ComponentEditorHeader.svelte` states for its own Back: a
    // secondary verb beside something that outranks it.
    assert.ok(
      blockerLink.classList.contains('fab-manager-button'),
      `the blocker link renders through the ManagerButton primitive, got ${blockerLink.className}`
    );
    assert.ok(
      blockerLink.classList.contains('is-ghost'),
      `the blocker link takes the ghost role, got ${blockerLink.className}`
    );
    const detailsSave = target.querySelector('[data-system-details-save]');
    assert.ok(Boolean(detailsSave), 'the Identity card renders its Save details submit');
    assert.ok(
      detailsSave.classList.contains('is-primary') && !detailsSave.classList.contains('is-ghost'),
      `and the Save beside it stays the primary, got ${detailsSave.className}`
    );
    assert.equal(
      detailsSave.getAttribute('type'),
      'submit',
      'Save details submits its own form, so the conversion must keep it a submit'
    );
    blockerLink.click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('[data-system-tab="validation"]').getAttribute('aria-selected'),
      'true',
      'the blocker link opens the Validation tab in place'
    );
    assert.ok(target.querySelector('[data-system-overview]'), 'the validation list is shown');
  });

  it('renders the salvage resolution-mode card (simple/progressive/routed) and routes its change', async () => {
    // The resolution cards live on the gated Crafting > Settings page now (issue 511).
    const calls = [];
    mountCraftingSettingsView({
      selectedSystem: {
        id: 'sys1',
        name: 'Alchemy',
        resolutionMode: 'alchemy',
        features: { salvage: true },
        recipeVisibility: { listMode: 'global' },
        showRecipeVisibilityKnowledgeOptions: false,
      },
      onSetSalvageResolutionMode: (mode) => {
        calls.push(['setSalvageResolutionMode', mode]);
        return true;
      },
    });

    const salvageCard = target.querySelector('[data-crafting-salvage-resolution-mode]');
    const rows = assertResolutionCard(salvageCard, {
      optionAttr: 'data-crafting-salvage-resolution-mode-option',
      groupName: 'manager-crafting-salvage-resolution-mode',
      expectedValues: ['simple', 'progressive', 'routed'],
    });
    assert.equal(rows.length, 3, 'salvage card offers exactly three options');

    // Simple is the default, so it is the checked radio for a simple/absent system.
    const checked = salvageCard.querySelector(
      'input[type="radio"][name="manager-crafting-salvage-resolution-mode"]:checked'
    );
    assert.ok(checked, 'a salvage radio is checked for a simple/absent system');
    assert.equal(
      checked.closest('[data-crafting-salvage-resolution-mode-option]').dataset
        .craftingSalvageResolutionModeOption,
      'simple',
      'simple is the default selected salvage mode'
    );

    const routedRadio = salvageCard.querySelector(
      '[data-crafting-salvage-resolution-mode-option="routed"] input[type="radio"]'
    );
    routedRadio.checked = true;
    routedRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'setSalvageResolutionMode' && call[1] === 'routed'),
      'selecting the routed radio persists the canonical routed value'
    );
  });

  it('renders the Salvage feature toggle and routes its change', async () => {
    const { calls } = await mountSystemSettings();
    const tile = target.querySelector('[data-feature-key="salvage"]');
    assert.ok(tile, 'the salvage feature toggle renders in System Settings');
    // The default fixture has salvage on, so toggling sends false.
    tile.querySelector('.manager-status-toggle').click();
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleFeature' && call[1] === 'salvage' && call[2] === false
      ),
      'toggling the salvage tile routes toggleFeature(salvage, false)'
    );
  });

  it('hides the salvage resolution-mode card when the salvage feature is off (toggle stays available)', async () => {
    await mountSystemSettings({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: false,
      },
    });
    assert.equal(
      target.querySelector('[data-system-salvage-resolution-mode]'),
      null,
      'the salvage resolution card is hidden when salvage is off'
    );
    const tile = target.querySelector('[data-feature-key="salvage"]');
    assert.ok(tile, 'the salvage toggle still renders so the GM can turn salvage back on');
    assert.equal(
      tile.querySelector('.manager-status-toggle').getAttribute('aria-pressed'),
      'false',
      'the salvage toggle reads as off'
    );
  });

  it('gives every feature tile an icon chip whose state class tracks the feature', async () => {
    await mountSystemSettings({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: false,
      },
    });

    for (const tile of target.querySelectorAll('[data-feature-key]')) {
      const chip = tile.querySelector('.manager-feature-tile-icon');
      const key = tile.getAttribute('data-feature-key');
      assert.ok(chip, `the ${key} tile renders an icon chip`);
      assert.ok(
        chip.querySelector('i')?.className.trim(),
        `the ${key} chip renders a non-empty icon glyph`
      );
      // The chip is decorative: the toggle already carries the state accessibly.
      assert.equal(chip.getAttribute('aria-hidden'), 'true', `the ${key} chip is hidden from AT`);
    }

    assert.ok(
      target
        .querySelector('[data-feature-key="essences"] .manager-feature-tile-icon')
        .classList.contains('is-on'),
      'an enabled feature reads as on in the chip'
    );
    assert.ok(
      target
        .querySelector('[data-feature-key="salvage"] .manager-feature-tile-icon')
        .classList.contains('is-off'),
      'a disabled feature reads as off in the chip'
    );
  });

  it('flips the feature chip state class when the feature toggles', async () => {
    await mountSystemSettings({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: false,
      },
    });
    const chipClasses = () =>
      target.querySelector('[data-feature-key="salvage"] .manager-feature-tile-icon').classList;
    assert.ok(chipClasses().contains('is-off'), 'the salvage chip starts off');

    await mountSystemSettings({
      selectedFeatures: {
        essences: true,
        itemTags: true,
        recipeCategories: true,
        gathering: true,
        salvage: true,
      },
    });
    assert.ok(
      chipClasses().contains('is-on'),
      'the salvage chip reads on once the feature is enabled'
    );
  });

  it('renders the currency spend-strategy control with three options and routes its change', async () => {
    const { calls } = await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const strategy = '[data-world-currency-strategy-select]';
    assert.ok(target.querySelector(strategy), 'the spend-strategy control should render');
    assert.deepEqual(
      selectOptionValues(target, strategy),
      ['actorProperty', 'actorInventory', 'macro'],
      'three peer spend strategies should be offered, in their pre-conversion order'
    );
    assert.deepEqual(
      selectOptionLabels(target, strategy),
      ['Actor data path', 'Actor inventory', 'Macro'],
      'and the same rendered text the `<option>` elements drew, fallback strings included'
    );
    // THE NAME NARROWED, DELIBERATELY.
    assert.equal(assertSelectHasResolvedName(target, strategy), 'Spend strategy');
    // The single shared strategy hint reflects the selected strategy, and stays where it is.
    assert.ok(
      target.querySelector('[data-world-currency-strategy-hint]'),
      'a strategy hint should render'
    );
    chooseSelectOption(target, strategy, 'macro');
    await tick();
    flushSync();
    assert.ok(calls.some((call) => call[0] === 'setCurrencySpendStrategy' && call[1] === 'macro'));
  });

  it('mounts the macro strategy with a drop zone per macro slot and no inventory-mode select', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'macro',
        providerId: '',
        macros: {},
        units: [],
      },
    });

    const macroRow = target.querySelector('[data-world-currency-macros]');
    assert.ok(macroRow, 'macro zones container should render');
    // The drop zones share one single-row container.
    assert.ok(
      macroRow.classList.contains('manager-currency-macro-row'),
      'the macro drop zones should share the single-row container'
    );
    // Counted from the DECLARED vocabulary rather than from a literal.
    const expected = CURRENCY_MACRO_KEYS.length;
    const dropzones = macroRow.querySelectorAll('[data-world-currency-macro-dropzone]');
    assert.equal(dropzones.length, expected, 'macro strategy should show one zone per macro slot');
    assert.equal(
      target.querySelectorAll('[data-world-currency-macro-dropzone]').length,
      expected,
      'every drop zone lives inside the single-row container'
    );
    assert.deepEqual(
      [...dropzones].map((zone) => zone.getAttribute('data-world-currency-macro-dropzone')).sort(compareStrings),
      [...CURRENCY_MACRO_KEYS].sort(compareStrings),
      'and each zone is bound to a declared slot'
    );
    // The removed nested inventory-mode select must not render.
    assert.equal(target.querySelector('[data-world-currency-inventory-mode-select]'), null);
  });

  it('gives each empty macro drop zone a field-specific accessible name', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'macro',
        providerId: '',
        macros: {},
        units: [],
      },
    });

    const expected = CURRENCY_MACRO_KEYS.length;
    const dropzones = [...target.querySelectorAll('[data-world-currency-macro-dropzone]')];
    assert.equal(dropzones.length, expected, 'macro strategy should show one zone per macro slot');
    const labels = dropzones.map((zone) => zone.getAttribute('aria-label'));
    // Every empty drop zone must expose a non-empty, distinct accessible name (not the shared hint).
    assert.ok(
      labels.every((label) => label && label.length > 0),
      'each drop zone should have an aria-label'
    );
    assert.equal(
      new Set(labels).size,
      expected,
      'the drop-zone aria-labels should be distinct from one another'
    );
  });

  it('shows a no-provider callout for actorInventory on a no-provider system and keeps units editable', async () => {
    // dnd5e has no registered provider.
    await mountCurrencyEditor({
      foundrySystemId: 'dnd5e',
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            denomination: 'gp',
            contains: [],
          },
        ],
      },
    });

    // No provider select is offered; the no-provider callout renders instead.
    assert.equal(
      target.querySelector('[data-world-currency-provider-select]'),
      null,
      'no provider select should render for a no-provider system'
    );
    assert.ok(
      target.querySelector('[data-world-currency-no-provider]'),
      'the no-provider callout should appear, steering the GM to the macro strategy'
    );
    // The removed inventory-mode select must not render.
    assert.equal(
      target.querySelector('[data-world-currency-inventory-mode-select]'),
      null,
      'the nested inventory-mode select should be gone'
    );
    // Units stay GM-editable (not read-only) on a no-provider system.
    assert.ok(
      target.querySelector(
        '.manager-currency-unit-card .manager-character-modifier-card-header-actions'
      ),
      'Add/Seed header actions should remain available for a no-provider system'
    );
  });

  it('removes the sub-unit section under the macro strategy and shows the conversion hint', async () => {
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'macro',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            contains: [{ unitId: 'sp', amount: 10 }],
          },
          {
            id: 'sp',
            label: 'Silver',
            abbreviation: 'sp',
            icon: 'fa-solid fa-coins',
            contains: [],
          },
        ],
      },
    });

    // Expand the gp unit's editor.
    const card = target.querySelector('.manager-currency-unit-card');
    card.querySelector('[data-world-currency-unit="gp"] [aria-label="Edit currency unit"]').click();
    await tick();
    flushSync();

    // No sub-unit section renders (no heading, builder, chips, or warnings) and the macro-conversion
    // hint is shown instead.
    assert.equal(
      card.querySelector('.manager-currency-subunit-section'),
      null,
      'no sub-unit section in macro mode'
    );
    assert.equal(
      card.querySelector('.manager-currency-subunit-builder'),
      null,
      'no add-sub-unit builder in macro mode'
    );
    assert.equal(
      card.querySelectorAll('[data-world-currency-subunit]').length,
      0,
      'no sub-unit chips in macro mode'
    );
    assert.ok(
      card.querySelector('[data-world-currency-unit-macro-note]'),
      'macro-conversion hint should render'
    );
  });

  // Pins the SystemEditView mirror of canAddCurrencySubUnit (currencyCanAddSubUnit /
  // currencyReachableUnitIds) that drives the add-sub-unit <select> options. The shared helper in
  // src/systems/currencyProfile.js is unit-tested, but this UI mirror has no behavioral test, so it
  // could silently drift. The dropdown only renders for the currently expanded unit, so each case
  // mounts the editor in actorProperty mode (sub-unit section editable), expands the target unit via
  // its edit pen, and asserts the actual rendered <option> values (each value is the unit id).
  async function offeredSubUnitOptionIds(units, expandUnitId) {
    if (mounted) unmount(mounted);
    if (target?.parentNode) target.remove();
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units,
      },
    });
    const card = target.querySelector('.manager-currency-unit-card');
    card
      .querySelector(
        `[data-world-currency-unit="${expandUnitId}"] [aria-label="Edit currency unit"]`
      )
      .click();
    await tick();
    flushSync();
    // NEITHER ABSENCE IS AN ANSWER. A missing builder or a missing trigger used to return `[]`,
    // and `[]` satisfies every "must not be offered" clause below — which is the vacuity that let
    // the conversion's own regression sit green until a positive clause caught it. A helper that
    // cannot see the control must SAY SO, because the clauses that read it are negatives and a
    // negative cannot tell "not offered" from "nothing was read".
    assert.ok(
      card.querySelector('.manager-currency-subunit-builder'),
      `expanding ${expandUnitId} rendered no add-sub-unit builder, so every clause reading this ` +
        'helper would pass on an empty list rather than on the option set it is about'
    );
    // THE ROWS OF THE OPEN PANEL, not `<option>` children (issue 1510). This control is the
    // shared `<Select>` now and `SearchablePopover` PORTALS its list onto the application root,
    // so the rows are not descendants of the builder at all. The old query returned an EMPTY
    // array after the conversion, and the three "must not be offered" clauses below passed
    // vacuously on it — the one positive clause is what caught it.
    const trigger = `[data-world-currency-unit="${expandUnitId}"] .manager-currency-subunit-builder .fabricate-select-trigger`;
    assert.ok(
      target.querySelector(trigger),
      `the add-sub-unit builder for ${expandUnitId} rendered no converted trigger to open, so ` +
        'the option set below would be read from a control that is not there'
    );
    return selectOptionValues(target, trigger);
  }

  it('drives the add-sub-unit dropdown from disjoint reachable sets for chain, diamond, and cross-parent cases', async () => {
    // Chain P->A->B->C: editing P must exclude C (deeper descendant), A (already contained).
    const chainUnits = [
      {
        id: 'P',
        label: 'Platinum',
        abbreviation: 'P',
        actorPath: 'system.currency.p',
        contains: [{ unitId: 'A', amount: 10 }],
      },
      {
        id: 'A',
        label: 'Gold',
        abbreviation: 'A',
        actorPath: 'system.currency.a',
        contains: [{ unitId: 'B', amount: 10 }],
      },
      {
        id: 'B',
        label: 'Silver',
        abbreviation: 'B',
        actorPath: 'system.currency.b',
        contains: [{ unitId: 'C', amount: 10 }],
      },
      { id: 'C', label: 'Copper', abbreviation: 'C', actorPath: 'system.currency.c', contains: [] },
      // THE POSITIVE THIS SET OTHERWISE LACKS. Every other clause here is a negative.
      {
        id: 'X',
        label: 'Unrelated',
        abbreviation: 'X',
        actorPath: 'system.currency.x',
        contains: [],
      },
    ];
    const chainOffered = await offeredSubUnitOptionIds(chainUnits, 'P');
    assert.ok(
      chainOffered.includes('X'),
      'chain: X (unrelated to P in either direction) SHOULD be offered when editing P — and it ' +
        'is what makes the three exclusions below claims about an option set rather than about ' +
        'an empty one'
    );
    assert.ok(
      !chainOffered.includes('C'),
      'chain: C (deeper descendant of P) must not be offered when editing P'
    );
    assert.ok(
      !chainOffered.includes('A'),
      'chain: A (already contained by P) must not be offered when editing P'
    );
    assert.ok(
      !chainOffered.includes('B'),
      'chain: B (deeper descendant of P) must not be offered when editing P'
    );

    // Diamond: cp; sp->cp; gp->sp; ep->sp. Editing gp (already reaches gp->sp->cp) must exclude ep
    // (adding ep would create a second gp->sp path) and cp (already reachable).
    const diamondUnits = [
      {
        id: 'cp',
        label: 'Copper',
        abbreviation: 'cp',
        actorPath: 'system.currency.cp',
        contains: [],
      },
      {
        id: 'sp',
        label: 'Silver',
        abbreviation: 'sp',
        actorPath: 'system.currency.sp',
        contains: [{ unitId: 'cp', amount: 10 }],
      },
      {
        id: 'gp',
        label: 'Gold',
        abbreviation: 'gp',
        actorPath: 'system.currency.gp',
        contains: [{ unitId: 'sp', amount: 10 }],
      },
      {
        id: 'ep',
        label: 'Electrum',
        abbreviation: 'ep',
        actorPath: 'system.currency.ep',
        contains: [{ unitId: 'sp', amount: 5 }],
      },
      // The same positive, for the same reason: both exclusions below are negatives.
      {
        id: 'X',
        label: 'Unrelated',
        abbreviation: 'X',
        actorPath: 'system.currency.x',
        contains: [],
      },
    ];
    const diamondOffered = await offeredSubUnitOptionIds(diamondUnits, 'gp');
    assert.ok(
      diamondOffered.includes('X'),
      'diamond: X (unrelated to gp in either direction) SHOULD be offered when editing gp'
    );
    assert.ok(
      !diamondOffered.includes('ep'),
      'diamond: ep must not be offered when editing gp (would create a second gp->sp path)'
    );
    assert.ok(
      !diamondOffered.includes('cp'),
      'diamond: cp must not be offered when editing gp (already reachable gp->sp->cp)'
    );

    // Cross-parent (allowed): a fresh unrelated unit pp (no contains) SHOULD be offered sp.
    const crossParentUnits = [
      ...diamondUnits,
      {
        id: 'pp',
        label: 'Platinum',
        abbreviation: 'pp',
        actorPath: 'system.currency.pp',
        contains: [],
      },
    ];
    const crossParentOffered = await offeredSubUnitOptionIds(crossParentUnits, 'pp');
    assert.ok(
      crossParentOffered.includes('sp'),
      'cross-parent: sp SHOULD be offered when editing the unrelated pp (legitimate shared child)'
    );
  });

  it('renders actorInventory provider units as a read-only provider-managed list', async () => {
    await mountCurrencyEditor({
      foundrySystemId: 'pf2e',
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        providerId: 'pf2e-inventory',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [
          {
            id: 'gp',
            label: 'Gold',
            abbreviation: 'gp',
            icon: 'fa-solid fa-coins',
            denomination: 'gp',
            contains: [{ unitId: 'sp', amount: 10 }],
          },
          {
            id: 'sp',
            label: 'Silver',
            abbreviation: 'sp',
            icon: 'fa-solid fa-coins',
            denomination: 'sp',
            contains: [],
          },
        ],
      },
    });

    // The provider-managed callout renders and the Add/Seed header actions are hidden.
    assert.ok(
      target.querySelector('[data-world-currency-provider-managed]'),
      'provider-managed callout should render'
    );
    assert.equal(
      target.querySelector(
        '.manager-currency-unit-card .manager-character-modifier-card-header-actions'
      ),
      null,
      'Add and Seed header actions should be hidden in provider mode'
    );
    // Units render read-only: no pen/edit, delete, or remove controls, no editable amount inputs.
    const card = target.querySelector('.manager-currency-unit-card');
    assert.ok(card.querySelector('[data-world-currency-unit="gp"]'), 'gp unit should render');
    assert.equal(
      card.querySelectorAll('.manager-currency-provider-managed-summary .manager-icon-button')
        .length,
      0,
      'no edit/delete icon buttons in read-only summary'
    );
    assert.equal(
      card.querySelectorAll('.manager-currency-subunit-amount').length,
      0,
      'no editable amount inputs in read-only mode'
    );
    assert.equal(
      card.querySelectorAll('[data-chip-remove]').length,
      0,
      'no remove-cross controls in read-only mode'
    );
    // Provider read-only units present label / abbreviation / denomination as static field/value
    // pairs and render NO sub-unit chips.
    assert.equal(
      card.querySelectorAll('[data-world-currency-subunit]').length,
      0,
      'no sub-unit chips in provider read-only mode'
    );
    const gpUnit = card.querySelector('[data-world-currency-unit="gp"]');
    assert.equal(
      gpUnit.querySelector('[data-world-currency-readonly-label]').textContent.trim(),
      'Gold'
    );
    assert.equal(
      gpUnit.querySelector('[data-world-currency-abbreviation]').textContent.trim(),
      'gp'
    );
    assert.equal(
      gpUnit.querySelector('[data-world-currency-denomination]').textContent.trim(),
      'gp'
    );
  });

  it('renders the currency feature toggle in Optional features and routes its change', async () => {
    const { calls } = await mountSystemSettings({
      selectedCurrency: {
        enabled: false,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const tile = target.querySelector('[data-feature-key="currency"]');
    assert.ok(tile, 'currency toggle tile should render in Optional features');
    const toggle = tile.querySelector('[data-system-currency-toggle]');
    assert.ok(toggle, 'currency toggle button should render');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'toggle reflects disabled currency');
    assert.ok(tile.querySelector('small'), 'currency tile should include a hint');

    toggle.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleRequirement' && call[1] === 'currency' && call[2] === true
      ),
      'clicking the toggle should enable currency through toggleRequirement'
    );
  });

  it('renders the time-requirements feature toggle in Optional features and routes its change (issue 714)', async () => {
    const { calls } = await mountSystemSettings({
      selectedCurrency: {
        enabled: false,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [],
      },
    });

    const tile = target.querySelector('[data-feature-key="time"]');
    assert.ok(tile, 'time toggle tile should render in Optional features');
    const toggle = tile.querySelector('[data-system-time-toggle]');
    assert.ok(toggle, 'time toggle button should render');
    // Time requirements default ON, so an absent flag reads as enabled.
    assert.equal(
      toggle.getAttribute('aria-pressed'),
      'true',
      'toggle reflects default-on time requirements'
    );
    assert.ok(tile.querySelector('small'), 'time tile should include a hint');

    toggle.click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleRequirement' && call[1] === 'time' && call[2] === false
      ),
      'clicking the on toggle should disable time requirements through toggleRequirement'
    );
  });

  it('counts PARTICIPATING systems in the World Currency subtitle (issue 1278)', async () => {
    // The affordance exists to stop a GM misdiagnosing an unadopted ladder as a broken one.
    await mountCurrencyEditor({
      selectedCurrency: {
        enabled: true,
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: { canAfford: '', increment: '', decrement: '' },
        units: [{ id: 'gp', label: 'Gold' }],
      },
    });

    const subtitle = target.querySelector('.manager-subtitle')?.textContent ?? '';
    assert.match(subtitle, /1 coin/, `the unit count is stated: ${subtitle}`);
    assert.match(subtitle, /used by 1 of 2/, `one of the two fixture systems opts in: ${subtitle}`);
  });

  it('says the ladder is empty rather than counting zero coins', async () => {
    await mountCurrencyEditor();

    const subtitle = target.querySelector('.manager-subtitle')?.textContent ?? '';
    assert.match(subtitle, /No coins yet/, subtitle);
  });

  it('offers NO crafting-system actions on the World Currency page (issue 1278)', async () => {
    // The page-header actions fall through to Import / Export / Create for any route without a
    // branch of its own. Those act on CRAFTING SYSTEMS, so on a route that has no selected system
    // "Create" would create one and "Export" would sit permanently disabled. The route's own two
    // actions live on the card header, where the provider read-only gating that hides them is.
    await mountCurrencyEditor();

    assertNoElement(
      target,
      '.manager-header-actions',
      'the currency page must not offer crafting-system actions'
    );
    assert.ok(
      [...target.querySelectorAll('button')].some((button) =>
        button.textContent.includes('Add currency unit')
      ),
      'its own actions still render, on the card'
    );
  });

  it('renders World Currency full width, with no inspector aside (issue 1278)', async () => {
    // The shell's shared `.manager-inspector` falls through to a generic "Select a system" panel
    // for any route it is not explicitly excluded from. Omitting this route from that exclusion
    // list gave the currency editor a permanent 300px column of unrelated content beside it — on
    // a page that has no selected system at all.
    await mountCurrencyEditor();

    assert.ok(target.querySelector('[data-world-currency-page]'), 'the route rendered');
    assertNoElement(
      target,
      '.manager-body > .manager-inspector',
      'World Currency is full width, like World Parties'
    );
  });

  it('keeps the World Currency ladder ungated by any system\u2019s participation toggle (issue 1278)', async () => {
    // Currency is WORLD scope now. The ladder is authored once, for the whole world.
    for (const enabled of [false, true]) {
      await mountCurrencyEditor({
        selectedCurrency: {
          enabled,
          spendStrategy: 'actorProperty',
          providerId: '',
          macros: { canAfford: '', increment: '', decrement: '' },
          units: [],
        },
      });

      assert.ok(
        target.querySelector('[data-world-currency-units]'),
        `the Currency Units card should render with the system toggle ${enabled ? 'on' : 'off'}`
      );
      // The participation toggle stays on System Settings.
      assertNoElement(
        target,
        '[data-feature-key="currency"]',
        'the per-system currency toggle tile does not belong on the world page'
      );

      if (mounted) {
        unmount(mounted);
        mounted = null;
      }
      target?.remove();
      target = null;
    }
  });

  it('rolls back system edit controls when existing store callbacks reject changes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { resolutionModeResult: false, toggleFeatureResult: false }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(target.querySelector('[data-feature-key="complexRecipes"]'), null);
    assert.equal(target.querySelector('[data-feature-key="craftingChecks"]'), null);
    assert.equal(target.querySelector('[data-feature-key="outcomeRouting"]'), null);

    // Resolution-mode rollback moved to the Crafting Settings page (issue 511).
    const gathering = target.querySelector('[data-feature-key="gathering"] .manager-status-toggle');
    assert.equal(gathering.getAttribute('aria-pressed'), 'true');
    gathering.click();
    await Promise.resolve();
    await tick();
    flushSync();
    assert.equal(gathering.getAttribute('aria-pressed'), 'true');

    assert.ok(
      calls.some(
        (call) => call[0] === 'toggleFeature' && call[1] === 'gathering' && call[2] === false
      )
    );
  });

  it('CraftingSettingsView rolls back the resolution radio when the store rejects the change', async () => {
    // The resolution-mode confirm-then-migrate flow can be cancelled (store returns
    // false); the card must revert to the system's mode (issue 511).
    mountCraftingSettingsView({
      selectedSystem: {
        id: 'sys1',
        name: 'Alchemy',
        resolutionMode: 'alchemy',
        features: {},
        recipeVisibility: { listMode: 'global' },
        showRecipeVisibilityKnowledgeOptions: false,
      },
      onSetResolutionMode: async () => false,
    });

    const modeCard = target.querySelector('#manager-crafting-resolution-mode');
    const activeMode = () =>
      modeCard.querySelector('.manager-resolution-option.is-active')?.dataset
        .craftingResolutionModeOption;
    assert.equal(activeMode(), 'alchemy');

    const progressiveRadio = modeCard.querySelector(
      '[data-crafting-resolution-mode-option="progressive"] input[type="radio"]'
    );
    progressiveRadio.checked = true;
    progressiveRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await tick();
    flushSync();

    assert.equal(activeMode(), 'alchemy', 'a rejected change reverts to the system mode');
    assert.equal(
      modeCard.querySelector('input[type="radio"][name="manager-crafting-resolution-mode"]:checked')
        ?.value,
      'alchemy',
      'the rejected change re-checks the previously-selected radio'
    );
  });
}
