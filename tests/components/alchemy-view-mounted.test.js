/** The player Alchemy tab's host suite (issue 1514). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  PLAYER_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { assertViewErrorTreatment } from '../helpers/playerViewStateAssertions.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alchemy-view-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
  compiledModules: [
    // The shared not-yet-ready chrome, the standing statement the workbench composes.
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
    'src/ui/svelte/apps/alchemy/AlchemyDisciplineChooser.svelte',
    'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte',
    'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte',
    'src/ui/svelte/apps/alchemy/Workbench.svelte',
    'src/ui/svelte/apps/alchemy/AlchemyView.svelte',
  ],
  // THE PRODUCTION HOST IS THE PLAYER WINDOW, not the manager.
  rootClass: 'fabricate-app',
  componentPath: 'src/ui/svelte/apps/alchemy/AlchemyView.svelte',
});

/** A POJO standing in for the alchemy store, at the branch the caller names. */
function fakeAlchemyStore(overrides = {}) {
  return {
    loading: false,
    loadedOnce: true,
    error: null,
    denied: false,
    needsChooser: false,
    listing: { selectedActorId: 'actor-1', activeSystemName: 'Alchemy' },
    systems: [],
    knownRecipes: [],
    knownCount: 0,
    undiscoveredCount: 0,
    search: '',
    selectedRecipeId: null,
    canSwitch: false,
    mode: 'empty',
    target: null,
    benchChips: [],
    benchEmpty: true,
    benchEssences: [],
    missing: [],
    brewEnabled: false,
    brewInFlight: false,
    lastBrew: null,
    components: [],
    componentSearch: '',
    hasOwnedComponents: false,
    load() {},
    chooseSystem() {},
    setSearch() {},
    selectRecipe() {},
    switchDiscipline() {},
    clear() {},
    add() {},
    removeOne() {},
    removeAll() {},
    brew() {},
    setComponentSearch() {},
    ...overrides,
  };
}

function services(store) {
  return { alchemy: store, craftingSources: null, actorBar: null };
}

describe('AlchemyView mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the loading state before the first load resolves', async () => {
    const target = await harness.mount({
      services: services(fakeAlchemyStore({ loading: true, loadedOnce: false })),
    });

    assert.ok(
      Boolean(target.querySelector('[data-alchemy-state="loading"]')),
      'loading state shown'
    );
    assert.ok(
      !target.querySelector('[data-alchemy-state="workbench"]'),
      'the workbench grid is not rendered while loading'
    );
  });

  it('announces the loading root as busy, and does not once the view is ready', async () => {
    // The criterion this suite was created for. It is asserted on the RENDERED DOM because a
    // composition that declares `aria-busy` and stops rendering it passes every source-text
    // reader, and the negative half is asserted because an attribute that is always present
    // says nothing about the state it is supposed to describe.
    const loadingTarget = await harness.mount({
      services: services(fakeAlchemyStore({ loading: true, loadedOnce: false })),
    });
    const loadingRoot = loadingTarget.querySelector('[data-alchemy-state="loading"]');
    assert.equal(
      loadingRoot.getAttribute('aria-busy'),
      'true',
      'the loading view root carries aria-busy'
    );
    assert.ok(
      loadingRoot.textContent.includes('FABRICATE.App.Alchemy.Loading'),
      'and a VISIBLE label states what is loading, so the busy region has an accessible name'
    );

    harness.remount();
    const readyTarget = await harness.mount({ services: services(fakeAlchemyStore()) });
    const readyRoot = readyTarget.querySelector('[data-alchemy-state="workbench"]');
    assert.ok(Boolean(readyRoot), 'the ready view renders the workbench grid');
    assert.ok(
      !readyTarget.querySelector('[aria-busy]'),
      'nothing in the ready view claims to be busy'
    );
  });

  it('renders the error state when the store reports an error', async () => {
    const target = await harness.mount({
      services: services(fakeAlchemyStore({ error: 'boom' })),
    });

    const root = target.querySelector('[data-alchemy-state="error"]');
    assert.ok(Boolean(root), 'error state shown');
    assert.ok(
      !root.hasAttribute('aria-busy'),
      'a failed load is not a loading state and must not claim to be busy'
    );
    assert.ok(
      root.textContent.includes('FABRICATE.App.Alchemy.Error'),
      'the error sentence is rendered'
    );
    assertViewErrorTreatment(root, { view: 'alchemy view' });
  });

  it('renders the no-actor state when the listing resolves to no actor', async () => {
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({ listing: { selectedActorId: null, activeSystemName: '' } })
      ),
    });

    assert.ok(
      Boolean(target.querySelector('[data-alchemy-state="no-actor"]')),
      'no-actor state shown'
    );
    assert.ok(
      !target.querySelector('[data-alchemy-state="workbench"]'),
      'the workbench grid is not rendered without an actor'
    );
  });

  it('has NO empty branch: a discipline with no known recipes still renders the workbench', async () => {
    // The branch set is per view, which is why the composition takes it as data. A view that
    // was handed the widest vocabulary would have to invent this state.
    const target = await harness.mount({
      services: services(fakeAlchemyStore({ knownRecipes: [], knownCount: 0 })),
    });

    assert.ok(
      Boolean(target.querySelector('[data-alchemy-state="workbench"]')),
      'the workbench grid is shown'
    );
    assert.ok(
      !target.querySelector('[data-alchemy-state="empty"]'),
      'no empty branch is reachable in this view'
    );
  });

  it('renders the discipline chooser ahead of the workbench when one is needed', async () => {
    const target = await harness.mount({
      services: services(
        fakeAlchemyStore({
          needsChooser: true,
          systems: [
            { id: 'sys-a', name: 'Herbalism' },
            { id: 'sys-b', name: 'Poisoncraft' },
          ],
        })
      ),
    });

    assert.ok(
      !target.querySelector('[data-alchemy-state="workbench"]'),
      'the workbench waits for the discipline choice'
    );
    assert.ok(
      target.textContent.includes('Herbalism'),
      'the chooser renders the selectable disciplines'
    );
  });
});
