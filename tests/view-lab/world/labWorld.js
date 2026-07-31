/**
 * Assemble the View Lab's world and boot the REAL Fabricate runtime against it.
 *
 * The important design decision lives here. The lab does not reimplement Fabricate's read side —
 * it seeds `game.settings` with the same shapes production persists, installs the Foundry globals,
 * and then imports `src/main.js` and calls the real `Fabricate.initialize()`. From that point the
 * lab is rendering through the real `CraftingSystemManager`, the real `RecipeManager`, the real
 * `CraftingListingBuilder` / `InventoryListingBuilder` / `AlchemyListingBuilder`, and the real
 * craftability evaluation.
 *
 * That matters for a screenshot specifically: a hand-authored listing payload can only ever show
 * what its author remembered to include, so the frame proves the fixture, not the code. Booting the
 * real facade means a broken projection shows up as a broken frame.
 *
 * Ordering is load-bearing:
 *   1. build the fixture data (pure),
 *   2. install the Foundry globals,
 *   3. ONLY THEN dynamically import `src/main.js` — it registers a dozen hooks at module scope and
 *      would throw against a bare realm,
 *   4. initialize as GM (initialization migrates and writes),
 *   5. flip the viewer for player frames.
 */
import { buildLabActors, buildDocumentIndex } from './labActors.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './labContent.js';
import { installFoundryShim, settingsKey } from '../foundry/installFoundryShim.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

const FABRICATE_NAMESPACE = 'fabricate';

/** 14 days into the world's calendar, so relative timestamps render as something. */
export const LAB_WORLD_TIME = 1_209_600;

function seedSettings(content, actors, managedSystemId) {
  const settings = new Map();
  const put = (key, value) => settings.set(settingsKey(FABRICATE_NAMESPACE, key), value);

  put('craftingSystems', content.systems);
  put('recipes', content.recipes);
  put('gatheringEnvironments', content.environments);
  put('gatheringConfig', content.gatheringConfig);
  put('gatheringParties', [
    {
      id: 'lab-party',
      name: 'The Ashfall Company',
      craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
      memberActorIds: actors.map((actor) => actor.id),
      travelActorUuid: null,
    },
  ]);
  // Selection preferences, so the player app opens on a populated actor and system rather than on
  // an empty-state prompt that says nothing about the UI.
  put('lastCraftingActor', actors[0].id);
  put('lastGatheringActor', actors[0].id);
  put('lastComponentSources', actors.map((actor) => actor.id));
  put('lastManagedCraftingSystem', managedSystemId ?? LAB_SYSTEM_IDS.SMITHING);
  put('lastAlchemySystem', LAB_SYSTEM_IDS.ALCHEMY);
  put('favouriteRecipes', ['sm-r-longsword', 'hb-r-healing']);
  put('progressiveResultOrder', {});
  put('gatheringHideUnavailableEnvironments', false);
  put('managerRailCollapsed', false);
  // The smoke world runs with experimental features on, and the manager rail advertises its Graph
  // placeholder only behind that toggle. Leaving it off gives the lab an eight-row rail where the
  // smoke has nine - a structural difference in every manager frame.
  put('experimentalFeatures', true);
  return settings;
}

/**
 * Build the lab world and boot the real Fabricate facade against it.
 *
 * @param {object} [options] Options.
 * @param {number} [options.seed] Determinism seed.
 * @returns {Promise<object>} The world, with `fabricate`, `shim`, and `content` attached.
 */
export async function buildLabWorld({ seed = 20_260_601, managedSystemId = null } = {}) {
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const documents = buildDocumentIndex(content, actors);
  const localize = await createLocalizer();

  const world = {
    seed,
    content,
    settings: seedSettings(content, actors, managedSystemId),
    documents,
    actorList: actors,
    scenes: [{ id: 'lab-scene', uuid: 'Scene.lab-map', name: 'The Verdant Reach', regions: [] }],
    worldTime: LAB_WORLD_TIME,
    i18n: toI18nStub(localize),
    localize,
  };

  const shim = installFoundryShim(world);
  world.shim = shim;

  // Dynamic, and only now: `src/main.js` registers hooks at module scope.
  const runtime = await import('/src/main.js');
  const fabricate = runtime.default;
  await fabricate.initialize();
  globalThis.game.fabricate = fabricate;
  world.fabricate = fabricate;

  if (!fabricate.craftingSystemManager?.initialized) {
    throw new Error('view lab: CraftingSystemManager did not initialize; the fixture world is unusable');
  }
  if (!fabricate.recipeManager?.initialized) {
    throw new Error('view lab: RecipeManager did not initialize; the fixture world is unusable');
  }

  return world;
}
