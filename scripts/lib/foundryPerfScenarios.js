/**
 * The Foundry perf profile's scenarios: the walk that produces one number per declared measurement
 * (issue 1073).
 */

import { PERF_BRIDGE_KEY } from './foundryPerfCapture.js';

/** How many timed repetitions a repeatable scenario takes, after one untimed warm-up. */
export const DEFAULT_REPS = 3;

/** Page-side scratch slots. */
export const MANAGER_HANDLE = '__fabricatePerfManagerApp';
export const PROPAGATION_HANDLE = '__fabricatePerfPropagation';

/** Selectors this walk depends on, named once so a rename has one place to land. */
export const PERF_SELECTORS = Object.freeze({
  managerRoot: '#fabricate-crafting-system-manager .fabricate-manager',
  managerNav: '.fabricate-manager .manager-nav-button',
  playerRoot: '#fabricate-app',
  playerNavItem: '.fabricate-app-nav-item',
  actorBarReady: '[data-actor-bar-state="ready"]',
  actorBarTrigger: '.fabricate-app-actor-bar button[aria-haspopup]',
  // The picker is `SearchablePopover` now (issue 1475), so its rows are the primitive's
  // `.manager-travel-option` and the panel is portaled out of the bar onto the player window's
  // frame.
  actorBarOption: '.actor-bar-popover .manager-travel-option',
  craftingBrowser: '[data-crafting-browser]',
  craftingSearch: '[data-crafting-browser] input[type="search"], [data-crafting-browser] input',
  craftingRow: '[data-crafting-browser] [data-recipe-id]',
  paginationNext: '[data-pagination-next]',
  paginationSummary: '[data-pagination-summary]',
  sourcesBar: '[data-crafting-sources]',
  sourceEntry: '[data-crafting-sources] [data-source-id]',
});

/** Time one asynchronous operation, repeatedly, returning a class-2 sample set. */
export async function timeOperation(operation, { reps = DEFAULT_REPS, reset = null } = {}) {
  const coldStart = Date.now();
  await operation();
  const coldMs = Date.now() - coldStart;

  const samplesMs = [];
  for (let rep = 0; rep < reps; rep += 1) {
    if (reset) await reset();
    const started = Date.now();
    await operation();
    samplesMs.push(Date.now() - started);
  }
  return { coldMs, samplesMs };
}

/**
 * Stamp the scenario name onto the page-side bridge so long tasks and heap samples are attributed.
 */
async function setScenario(page, scenario) {
  await page
    .evaluate(
      ({ key, name }) => {
        const bridge = globalThis[key];
        if (bridge) bridge.scenario = name;
        bridge?.sampleHeap?.(name === null ? 'idle' : `${name}:start`);
      },
      { key: PERF_BRIDGE_KEY, name: scenario }
    )
    .catch(() => {});
}

/** Open the GM manager and wait for its Svelte root to mount. */
async function openManager(page) {
  await page.evaluate(async (handle) => {
    const AppClass = await game.fabricate.api.loadCraftingSystemManagerAppClass();
    Reflect.set(globalThis, handle, AppClass.show());
  }, MANAGER_HANDLE);
  await page.locator(PERF_SELECTORS.managerRoot).first().waitFor({ state: 'visible' });
}

/** Close every open Fabricate application through its own window control. */
async function closeFabricateApps(page) {
  await page
    .evaluate((handle) => {
      for (const app of Object.values(globalThis.ui?.windows ?? {})) app?.close?.();
      for (const app of globalThis.foundry?.applications?.instances?.values?.() ?? []) {
        if (String(app?.id ?? '').startsWith('fabricate-')) app?.close?.();
      }
      Reflect.set(globalThis, handle, null);
    }, MANAGER_HANDLE)
    .catch(() => {});
  await page
    .locator(`${PERF_SELECTORS.managerRoot}, ${PERF_SELECTORS.playerRoot}`)
    .first()
    .waitFor({ state: 'detached' })
    .catch(() => {});
}

/** Call one method on the live manager app's admin store. */
async function callAdminStore(page, method, args = []) {
  return page.evaluate(
    async ({ handle, name, values }) => {
      const store = Reflect.get(globalThis, handle)?._adminStore;
      return store?.[name]?.(...values) ?? null;
    },
    { handle: MANAGER_HANDLE, name: method, values: args }
  );
}

/** Open the shared player app on a named tab and wait for its actor bar to settle. */
async function openPlayerApp(page, tab = 'crafting') {
  await page.evaluate((target) => game.fabricate.api.getFabricateAppClass().show(target), tab);
  const shell = page.locator(PERF_SELECTORS.playerRoot).first();
  await shell.waitFor({ state: 'visible' });
  await shell.locator(PERF_SELECTORS.actorBarReady).first().waitFor({ state: 'visible' });
}

/** The scenarios, in walk order. */
export const PERF_SCENARIOS = Object.freeze([
  {
    id: 'startup-phases',
    measurementId: 'startup-phases',
    // Durations are class 2. The corpus the spans loaded is class 1 and is what makes a later run's
    // durations interpretable at all.
    run: async ({ startupMeasures, corpus }) => ({
      timing: { samplesMs: [], ...startupMeasures },
      invariant: corpus,
    }),
  },

  {
    id: 'first-page-ready',
    measurementId: 'first-page-ready',
    run: async ({ readiness }) => ({
      timing: { samplesMs: [readiness.fabricateReadyMs], ...readiness },
    }),
  },

  {
    id: 'long-tasks',
    measurementId: 'long-tasks',
    // Populated by the runner AFTER the walk, from the bridge, because a long-task summary taken
    // mid-walk would only cover the scenarios that had run by then.
    deferredToRunner: true,
  },

  {
    id: 'heap-samples',
    measurementId: 'heap-samples',
    deferredToRunner: true,
  },

  {
    id: 'manager-open',
    measurementId: 'manager-open',
    async run({ page }) {
      await setScenario(page, 'manager-open');
      const timing = await timeOperation(() => openManager(page), {
        reset: () => closeFabricateApps(page),
      });
      const invariant = await page.evaluate(() => ({
        systems: game.fabricate.getCraftingSystemManager().getSystems().length,
        recipes: game.fabricate.getRecipeManager().getRecipes().length,
      }));
      await closeFabricateApps(page);
      return { timing, invariant };
    },
  },

  {
    id: 'manager-recipes',
    measurementId: 'manager-recipes',
    async run({ page, systemId }) {
      await setScenario(page, 'manager-recipes');
      await openManager(page);
      const select = async () => {
        await callAdminStore(page, 'selectSystem', [systemId]);
        await callAdminStore(page, 'setTab', ['recipes']);
      };
      const timing = await timeOperation(select, {
        reset: () => callAdminStore(page, 'setTab', ['items']),
      });
      const invariant = await readManagerRowCensus(page);
      await closeFabricateApps(page);
      return { timing, invariant };
    },
  },

  {
    id: 'manager-components',
    measurementId: 'manager-components',
    async run({ page, systemId }) {
      await setScenario(page, 'manager-components');
      await openManager(page);
      const select = async () => {
        await callAdminStore(page, 'selectSystem', [systemId]);
        await callAdminStore(page, 'setTab', ['items']);
      };
      const timing = await timeOperation(select, {
        reset: () => callAdminStore(page, 'setTab', ['recipes']),
      });
      const invariant = await readManagerRowCensus(page);
      await closeFabricateApps(page);
      return { timing, invariant };
    },
  },

  {
    id: 'manager-search-page',
    measurementId: 'manager-search-page',
    async run({ page, systemId }) {
      await setScenario(page, 'manager-search-page');
      await openManager(page);
      await callAdminStore(page, 'selectSystem', [systemId]);
      await callAdminStore(page, 'setTab', ['recipes']);

      const search = () => callAdminStore(page, 'setRecipeSearch', ['Bench Recipe 4']);
      const timing = await timeOperation(search, {
        reset: () => callAdminStore(page, 'setRecipeSearch', ['']),
      });
      const invariant = await readManagerRowCensus(page);
      await closeFabricateApps(page);
      return {
        timing,
        invariant: {
          ...invariant,
          // Stated in the artefact so a reader is not left wondering why paging is absent here.
          gmPaging: 'not implemented in the GM browser today; issue 1081 owns it',
        },
      };
    },
  },

  {
    id: 'player-open',
    measurementId: 'player-open',
    async run({ page }) {
      await setScenario(page, 'player-open');
      const timing = await timeOperation(() => openPlayerApp(page, 'crafting'), {
        reset: () => closeFabricateApps(page),
      });
      const invariant = await page.evaluate(
        (selectors) => ({
          listedRows: document.querySelectorAll(selectors.craftingRow).length,
          paginationSummary:
            document.querySelector(selectors.paginationSummary)?.textContent?.trim() ?? null,
        }),
        PERF_SELECTORS
      );
      return { timing, invariant };
    },
  },

  {
    id: 'player-tabs',
    measurementId: 'player-tabs',
    async run({ page }) {
      await setScenario(page, 'player-tabs');
      await openPlayerApp(page, 'crafting');
      const shell = page.locator(PERF_SELECTORS.playerRoot).first();

      const perTab = {};
      const unavailable = [];
      for (const label of ['Inventory', 'Journal', 'Alchemy']) {
        const tab = shell.locator(`${PERF_SELECTORS.playerNavItem}:has-text("${label}")`).first();
        if ((await tab.count()) === 0) {
          // The Alchemy tab is conditional on an enabled alchemy system holding recipes. Absent is
          // not slow, and must never be recorded as a duration.
          unavailable.push(label);
          continue;
        }
        const started = Date.now();
        await tab.click();
        await shell
          .locator(`${PERF_SELECTORS.playerNavItem}.active:has-text("${label}")`)
          .first()
          .waitFor({ state: 'visible' });
        perTab[label] = Date.now() - started;
        await shell.locator(`${PERF_SELECTORS.playerNavItem}:has-text("Crafting")`).first().click();
      }

      return {
        timing: { samplesMs: Object.values(perTab), perTab },
        invariant: { tabsMeasured: Object.keys(perTab), tabsUnavailable: unavailable },
        unavailable: unavailable.length > 0 ? `tabs not present: ${unavailable.join(', ')}` : null,
      };
    },
  },

  {
    id: 'player-actor-switch',
    measurementId: 'player-actor-switch',
    async run({ page }) {
      await setScenario(page, 'player-actor-switch');
      await openPlayerApp(page, 'crafting');
      const shell = page.locator(PERF_SELECTORS.playerRoot).first();
      const trigger = shell.locator(PERF_SELECTORS.actorBarTrigger).first();

      if ((await trigger.count()) === 0) {
        return { unavailable: 'the actor bar exposed no selection control' };
      }
      await trigger.click();
      const options = shell.locator(PERF_SELECTORS.actorBarOption);
      const optionCount = await options.count();
      if (optionCount < 2) {
        return {
          unavailable: `only ${optionCount} selectable actor(s); an actor switch needs two`,
          invariant: { selectableActors: optionCount },
        };
      }

      const started = Date.now();
      await options.nth(1).click();
      await shell.locator(PERF_SELECTORS.actorBarReady).first().waitFor({ state: 'visible' });
      const switchMs = Date.now() - started;

      const invariant = await page.evaluate(
        (selectors) => ({
          listedRows: document.querySelectorAll(selectors.craftingRow).length,
          componentSources: document.querySelectorAll(selectors.sourceEntry).length,
        }),
        PERF_SELECTORS
      );

      // The paging half of "search/filter/page/actor/source switching" lives here, because this is
      // where paging exists.
      const next = shell.locator(PERF_SELECTORS.paginationNext).first();
      let pageMs = null;
      if ((await next.count()) > 0 && (await next.isEnabled())) {
        const pageStarted = Date.now();
        await next.click();
        await shell.locator(PERF_SELECTORS.craftingRow).first().waitFor({ state: 'visible' });
        pageMs = Date.now() - pageStarted;
      }

      return {
        timing: { samplesMs: [switchMs], switchMs, pageMs },
        invariant: { ...invariant, selectableActors: optionCount },
      };
    },
  },

  {
    id: 'definition-edit',
    measurementId: 'definition-edit',
    async run({ page, systemId }) {
      await setScenario(page, 'definition-edit');
      await closeFabricateApps(page);
      const result = await page.evaluate(async (id) => {
        const recipeManager = game.fabricate.getRecipeManager();
        const systemManager = game.fabricate.getCraftingSystemManager();
        const recipe = recipeManager.getRecipes({ craftingSystemId: id })[0] ?? null;
        const system = systemManager.getSystem(id) ?? null;
        if (!recipe || !system) return { unavailable: 'seeded system or recipe not found' };

        // Serialize FIRST: this is the class-1 number the write-amplification argument rests on,
        // and it is what one single-field edit rewrites in full.
        const recipesBytes = JSON.stringify(
          recipeManager.getRecipes().map((entry) => entry.toJSON())
        ).length;
        const systemsBytes = JSON.stringify(systemManager.getSystems()).length;

        const recipeStarted = performance.now();
        await recipeManager.updateRecipe(
          recipe.id,
          { name: `${recipe.name} *` },
          { notify: false }
        );
        const recipeEditMs = performance.now() - recipeStarted;

        const component = (system.components ?? [])[0] ?? null;
        let componentEditMs = null;
        if (component) {
          const componentStarted = performance.now();
          // `updateItem`, not `updateComponent`: components are the manager's "items". Verified
          // against CraftingSystemManager on this checkout rather than assumed from the UI wording.
          await systemManager.updateItem(id, component.id, { name: `${component.name} *` });
          componentEditMs = performance.now() - componentStarted;
        }

        return {
          recipeEditMs,
          componentEditMs,
          recipesBytes,
          systemsBytes,
          recipesSaved: recipeManager.getRecipes().length,
          componentsSaved: (systemManager.getSystem(id)?.components ?? []).length,
        };
      }, systemId);

      if (result.unavailable) return { unavailable: result.unavailable };
      return {
        timing: {
          samplesMs: [result.recipeEditMs, result.componentEditMs].filter((value) =>
            Number.isFinite(value)
          ),
          recipeEditMs: result.recipeEditMs,
          componentEditMs: result.componentEditMs,
        },
        invariant: {
          recipesBytes: result.recipesBytes,
          systemsBytes: result.systemsBytes,
          recipesSaved: result.recipesSaved,
          componentsSaved: result.componentsSaved,
        },
      };
    },
  },

  {
    id: 'system-import',
    measurementId: 'system-import',
    async run({ page, systemId, importRecipeLimit }) {
      await setScenario(page, 'system-import');
      await closeFabricateApps(page);
      const result = await page.evaluate(
        async ({ id, limit }) => {
          const exported = game.fabricate.exportSystem(id);
          // Bounded on purpose. Import is quadratic today (issue 1086: one whole-corpus save per
          // imported item), so an unbounded import of a 10,000-recipe corpus would not finish.
          const trimmed = {
            ...exported,
            system: { ...exported.system, id: `${id}-imported` },
            recipes: (exported.recipes ?? []).slice(0, limit),
          };
          const started = performance.now();
          // `importFromPack` is the public import entry point; there is no `importSystem`. It
          // routes to `CompendiumImporter.importFromPackData`, which is the quadratic path.
          await game.fabricate.importFromPack(trimmed, { overwriteExisting: false });
          return {
            importMs: performance.now() - started,
            recipesImported: trimmed.recipes.length,
            componentsImported: (trimmed.system.components ?? []).length,
          };
        },
        { id: systemId, limit: importRecipeLimit }
      );
      return {
        timing: { samplesMs: [result.importMs] },
        invariant: {
          recipesImported: result.recipesImported,
          componentsImported: result.componentsImported,
          bound: `capped at ${importRecipeLimit} recipes; import is quadratic (issue 1086)`,
        },
      };
    },
  },

  {
    id: 'propagation-hydrated',
    measurementId: 'propagation-hydrated',
    async run({ page, playerPage, systemId }) {
      if (!playerPage) return { unavailable: 'no second client joined' };
      await setScenario(page, 'propagation-hydrated');

      // Arm the receiver before the write.
      await playerPage.evaluate((slot) => {
        const observed = { armedAt: Date.now(), hits: [] };
        Reflect.set(globalThis, slot, observed);
        Hooks.on('fabricate.recipesChanged', () => {
          observed.hits.push({ at: Date.now(), source: 'fabricate.recipesChanged' });
        });
        Hooks.on('updateSetting', (setting) => {
          if (String(setting?.key ?? '').includes('recipes')) {
            observed.hits.push({ at: Date.now(), source: 'updateSetting' });
          }
        });
      }, PROPAGATION_HANDLE);

      const sentAt = await page.evaluate(async (id) => {
        const recipeManager = game.fabricate.getRecipeManager();
        const recipe = recipeManager.getRecipes({ craftingSystemId: id })[0] ?? null;
        if (!recipe) return null;
        const at = Date.now();
        await recipeManager.updateRecipe(
          recipe.id,
          { name: `${recipe.name} ~${at}` },
          { notify: false }
        );
        return at;
      }, systemId);

      if (sentAt === null) return { unavailable: 'seeded system had no recipe to edit' };

      await playerPage
        .waitForFunction(
          (slot) => (Reflect.get(globalThis, slot)?.hits.length ?? 0) > 0,
          PROPAGATION_HANDLE,
          { timeout: 60_000 }
        )
        .catch(() => {});

      const received = await playerPage.evaluate(
        (slot) => Reflect.get(globalThis, slot) ?? { hits: [] },
        PROPAGATION_HANDLE
      );
      const firstHit = received.hits[0] ?? null;

      return {
        timing: {
          samplesMs: firstHit ? [firstHit.at - sentAt] : [],
          // Cross-MACHINE clocks would make this meaningless, but both contexts here are the same
          // browser on the same host, so the subtraction is legitimate.
          clockBasis: 'single host, single browser process',
        },
        invariant: {
          hookDeliveries: received.hits.length,
          hookSources: [...new Set(received.hits.map((hit) => hit.source))],
          receiverHydration:
            'not applicable on the settings backend — issue 1088 Q4 confirmed every world ' +
            'setting replicates in full to every client at connect, so there is no un-hydrated ' +
            'receiver to distinguish',
        },
      };
    },
  },
]);

/** Read the GM browser's row census from the manager store's own view state. */
async function readManagerRowCensus(page) {
  return page.evaluate((handle) => {
    const store = Reflect.get(globalThis, handle)?._adminStore;
    let state = null;
    // A Svelte store calls its subscriber synchronously on subscribe and returns the unsubscribe,
    // so this reads the CURRENT value and immediately detaches.
    store?.viewState?.subscribe?.((value) => {
      state = value;
    })?.();
    return {
      // `recipes` and `itemCards` are the store's OWN key names — components are "items" here.
      // Verified against adminStore's viewState publish on this checkout.
      recipeRows: state?.recipes?.length ?? null,
      componentRows: state?.itemCards?.length ?? null,
      recipeSearchTerm: state?.recipeSearchTerm ?? null,
    };
  }, MANAGER_HANDLE);
}

/** Every scenario id, in walk order. */
export const PERF_SCENARIO_IDS = Object.freeze(
  PERF_SCENARIOS.map((scenario) => scenario.measurementId)
);
