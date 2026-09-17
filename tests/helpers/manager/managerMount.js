/**
 * Mount the manager root against the store double and land on one route (issue 1669, extracted
 * from `tests/components/manager-mounted.test.js`).
 *
 * The suite owns `mounted`, `target` and `mountedStore` so its `afterEach` can tear a mount down
 * whether the case passed or threw, so this factory hands each new mount BACK through `adopt` and
 * `adoptStore` rather than keeping the authoritative copy here, which would leave two sources of
 * truth for one DOM tree.
 *
 * `tests/helpers/` is outside the `npm test` glob; `tests/helpers-manager.test.js` proves this
 * module from inside it.
 */
import { flushSync, mount, tick } from 'svelte';

import { act } from './managerQueries.js';
import { createStore } from './managerStoreFake.js';

/**
 * @param {object} wiring
 * @param {() => object} wiring.component Reads the compiled root, which the suite's `before` imports.
 * @param {object} wiring.queries The suite's `createManagerQueries` result.
 * @param {(mounted: object, target: HTMLElement) => void} wiring.adopt Hands back a new mount.
 * @param {(store: object) => void} wiring.adoptStore Hands back the store `mountManager` built.
 * @returns {object} The mount and route helpers, under the names the suites already use.
 */
export function createManagerMounts({ component, queries, adopt, adoptStore }) {
  const { craftingParent, navButton } = queries;
  let mounted;
  let target;
  let mountedStore;

  /**
   * Mount the manager with the World > Downtime surface UNLOCKED (issue 1257).
   *
   * The route and its rail group are gated behind `fabricate.experimentalFeatures` until the
   * premium Downtime Studio ships, and the harness's `createStore` defaults that projection to
   * `false` — deliberately, because the Graph placeholder's own gate is asserted from the same
   * default. So every Downtime case opts in, and it does so through ONE named helper rather
   * than 28 copies of the same store option: the gate is then stated once, and removing it when
   * the Studio releases is one deletion rather than a sweep.
   *
   * @param {Array} [calls] Store call log, as `mountManager` takes it.
   * @param {object} [storeOptions] Store options; may override the flag to assert the gate.
   * @param {object} [services] Injected services.
   * @param {object} [rootProps] Extra root props, e.g. `managerExtensions`.
   * @returns {HTMLElement} The mounted target.
   */
  function mountDowntimeManager(calls = [], storeOptions = {}, services = {}, rootProps = {}) {
    return mountManager(
      calls,
      { experimentalFeaturesEnabled: true, ...storeOptions },
      services,
      rootProps
    );
  }


  // Mount the manager against a fresh store on a fresh host element. Assigns the
  // module-level `mounted`/`target` (so afterEach can clean up) and returns the target,
  // so the routing helpers below differ only in where they navigate afterwards.
  function mountManager(calls = [], storeOptions = {}, services = {}, rootProps = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mountedStore = createStore(calls, storeOptions);
    adoptStore(mountedStore);
    mounted = mount(component(), {
      target,
      props: {
        store: mountedStore,
        services: { openCurrentAdmin: () => {}, ...services },
        ...rootProps,
      },
    });
    adopt(mounted, target);
    flushSync();
    return target;
  }

  // Mount the manager, route to Recipes, and open the recipe-edit route for r1.
  // Returns the mounted target for the caller to query.
  async function openRecipeEditor(calls, storeOptions = {}) {
    mountManager(calls, { experimentalFeaturesEnabled: true, ...storeOptions });
    await act(craftingParent());
    // The Edit action moved to the inspector (issue 643): SELECT the row by clicking its
    // identity, which drives the shell inspector, then click the inspector's Edit action.
    target.querySelector('[data-recipe-id="r1"] .manager-recipe-identity').click();
    await tick();
    flushSync();
    target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="edit"]').click();
    await tick();
    flushSync();
    return target;
  }

  // Mount the manager and route to the Tags & Categories screen. Returns the mounted target.
  async function openTagsScreen(calls = [], storeOptions = {}) {
    mountManager(calls, storeOptions);
    await act(navButton('Tags & Categories'));
    return target;
  }

  // Mount the manager against a store double, click through to one page, and settle the DOM. The
  // tests below repeat this exact mount + navigate + flush dance and differ only in the
  // `createStore` options and the page they open, so it lives here instead of being inlined per
  // test. Assigns the shared `mounted`/`target` so the suite's `afterEach` tears them down.
  // Returns the captured `calls`.
  async function mountManagerRoute(storeOptions, openRoute) {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(component(), {
      target,
      props: {
        store: createStore(calls, storeOptions),
        services: { openCurrentAdmin: () => {} },
      },
    });
    adopt(mounted, target);
    flushSync();
    openRoute(target);
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();
    return { calls };
  }

  // Open the Alchemy crafting system's editor, which lands on its System Settings tab.
  async function mountSystemSettings(storeOptions) {
    return mountManagerRoute(storeOptions, (root) =>
      root.querySelector('[aria-label="Edit Alchemy"]').click()
    );
  }

  // Open WORLD > RULES & RESOURCES > CURRENCY, which is where the currency ladder is authored
  // since issue 1278 and where it was grouped with the two character libraries in issue 1311. It
  // used to be a card on System Settings; the route needs no selected crafting system, because the
  // config it edits is world scope. Activating the group parent lands on Currency, so one click
  // still suffices — which is itself worth pinning, since the parent must not open a blank group.
  async function mountCurrencyEditor(storeOptions) {
    return mountManagerRoute(storeOptions, (root) =>
      root.querySelector('[data-world-nav-item="rules"]').click()
    );
  }

  // Open one of the other two Rules & Resources destinations. Two clicks: the parent opens the
  // group and lands on Currency, then the sub-item moves to the requested page.
  async function mountWorldRulesDestination(storeOptions, destination) {
    return mountManagerRoute(storeOptions, (root) => {
      root.querySelector('[data-world-nav-item="rules"]').click();
      flushSync();
      root.querySelector(`[data-world-rules-item="${destination}"]`).click();
    });
  }

  // Mount the manager and open the tabbed System Overview page for Alchemy with an
  // injected validation report. Mirrors `mountCurrencyEditor`: the same mount +
  // "Edit Alchemy" + flush dance, shared `mounted`/`target` so `afterEach` cleans up.
  async function mountSystemOverviewPage(systemValidation) {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(component(), {
      target,
      props: {
        // experimentalFeaturesEnabled keeps the recipe route available so a recipe
        // deep link from the Validation tab resolves to the recipe editor.
        store: createStore(calls, { systemValidation, experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    adopt(mounted, target);
    flushSync();
    target.querySelector('[aria-label="Edit Alchemy"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await tick();
    flushSync();
    return { calls };
  }

  return {
      mountCurrencyEditor,
      mountDowntimeManager,
      mountManager,
      mountManagerRoute,
      mountSystemOverviewPage,
      mountSystemSettings,
      mountWorldRulesDestination,
      openRecipeEditor,
      openTagsScreen,
  };
}
