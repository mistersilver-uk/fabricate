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
import { buildLabRunStates, installLabRunStates } from './labRunStates.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './labContent.js';
import { installFoundryShim, settingsKey } from '../foundry/installFoundryShim.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

const FABRICATE_NAMESPACE = 'fabricate';

/** 14 days into the world's calendar, so relative timestamps render as something. */
export const LAB_WORLD_TIME = 1_209_600;

function seedSettings(content, actors, managedSystemId, experimentalFeatures) {
  const settings = new Map();
  const put = (key, value) => settings.set(settingsKey(FABRICATE_NAMESPACE, key), value);

  // With the smoke seed enabled the lab's own three systems would sit ALONGSIDE the smoke's, which
  // is not a 1:1 comparison - the system library would show seven rows where the smoke shows its
  // own set. Start empty and let the replayed seed be the only source of crafting data.
  put('craftingSystems', content.systems);
  put('recipes', content.recipes);
  put('gatheringEnvironments', content.environments);
  put('gatheringConfig', content.gatheringConfig);
  put('gatheringParties', [
    {
      id: 'lab-party',
      name: 'The Ashfall Company',
      craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
      // `GatheringPartyStore._normalizeParty` reads `memberActorUuids` and `enabled`, and it takes
      // UUIDs rather than ids. This was authored as `memberActorIds` with bare ids and
      // `travelActorUuid: null`, so every field normalised away and the Travel tab rendered
      // "Disabled · 0 members" — the ninth instance of the same defect class on this branch: a
      // shape production does not read, degrading to a default that looks like a rendered state.
      enabled: true,
      memberActorUuids: actors.map((actor) => actor.uuid),
      // A party cannot enable without one. The mule carries the load, which is also why he holds
      // the multi-source stock the crafting frames draw from.
      travelActorUuid: actors[2]?.uuid ?? actors[0].uuid,
    },
  ]);
  // Selection preferences, so the player app opens on a populated actor and system rather than on
  // an empty-state prompt that says nothing about the UI.
  put('lastCraftingActor', actors[0].id);
  put('lastGatheringActor', actors[0].id);
  put(
    'lastComponentSources',
    actors.map((actor) => actor.id)
  );
  put('lastManagedCraftingSystem', managedSystemId ?? LAB_SYSTEM_IDS.SMITHING);
  put('lastAlchemySystem', LAB_SYSTEM_IDS.ALCHEMY);
  put('favouriteRecipes', ['sm-r-longsword', 'hb-r-healing']);
  put('progressiveResultOrder', {});
  put('gatheringHideUnavailableEnvironments', false);
  put('managerRailCollapsed', false);
  // The smoke world runs with experimental features on, and the manager rail advertises its Graph
  // placeholder only behind that toggle. Leaving it off gives the lab an eight-row rail where the
  // smoke has nine - a structural difference in every manager frame.
  put('experimentalFeatures', experimentalFeatures);
  return settings;
}

/**
 * Build the lab world and boot the real Fabricate facade against it.
 *
 * @param {object} [options] Options.
 * @param {number} [options.seed] Determinism seed.
 * @returns {Promise<object>} The world, with `fabricate`, `shim`, and `content` attached.
 */
export async function buildLabWorld({
  seed = 20_260_601,
  managedSystemId = null,
  experimentalFeatures = true,
} = {}) {
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const documents = buildDocumentIndex(content, actors);
  const localize = await createLocalizer();

  const world = {
    seed,
    content,
    settings: seedSettings(content, actors, managedSystemId, experimentalFeatures),
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
  const runtime = await import('../../../src/main.js');
  const fabricate = runtime.default;
  await fabricate.initialize();
  globalThis.game.fabricate = fabricate;

  // The rest of `Hooks.once('ready')`, called directly.
  //
  // `initialize()` is not the whole startup. The ready body also matures world time and runs four
  // flag auto-stamps, and those are what populate the tier-1 `roles` identity that `sourceUuid.js`
  // resolves against FIRST — without them every tool and component fell through to the
  // name-matching tier that production never reaches on a stamped world.
  //
  // Called individually rather than by dispatching the `ready` event, which was tried and reverted:
  // the same body reaches `addModuleButtonsToItemsDirectory`, which injects into Foundry's Items
  // sidebar and errors when it is absent. The lab has no sidebar by design, and satisfying it would
  // mean drawing a facsimile of Foundry chrome. Naming the five functions gets the startup work
  // without the sidebar integration the lab can never honestly satisfy.
  //
  // Order matches `src/main.js`: the tool stamp reads refs the component stamp and the migration
  // runner write, and the owned-item restamp reads what the component stamp produced.
  await runtime.processFabricateWorldTime();
  await runtime.runRecipeItemFlagAutoStamp();
  await runtime.runComponentFlagAutoStamp();
  await runtime.runToolFlagAutoStamp();
  await runtime.runOwnedItemComponentIdentityRestamp();
  world.fabricate = fabricate;

  if (!fabricate.craftingSystemManager?.initialized) {
    throw new Error(
      'view lab: CraftingSystemManager did not initialize; the fixture world is unusable'
    );
  }
  if (!fabricate.recipeManager?.initialized) {
    throw new Error('view lab: RecipeManager did not initialize; the fixture world is unusable');
  }

  // Journal runs. Written after the crafting data exists, because each run resolves to a real
  // recipe - a run pointing at a recipe that is not there renders as a redacted stub and proves
  // nothing about how the journal draws a failed or time-gated run.
  // Only recipes the PLAYER can see. A run pointing at a recipe the viewer has no access to renders
  // as "Hidden recipe" — correct behaviour, but it tells you nothing about how a failed or
  // time-gated run draws, which is the whole point of the journal frames.
  const rememberedIdForVisibility =
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastCraftingActor')) ??
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastGatheringActor'));
  const visibilityActor = globalThis.game.actors.get(rememberedIdForVisibility) ?? actors[0];
  const allRecipes = fabricate.getRecipeManager().getRecipes({ enabled: true }) ?? [];
  const visibility = fabricate.recipeVisibilityService;
  const playerViewer = { id: 'user-lab-player', isGM: false };
  const journalRecipes = allRecipes.filter((recipe) => {
    try {
      return (
        visibility?.evaluateRecipeAccess?.({
          recipe,
          viewer: playerViewer,
          craftingActor: visibilityActor,
          componentSourceActors: [visibilityActor],
        })?.visible === true
      );
    } catch {
      return false;
    }
  });
  // Onto the actor the JOURNAL resolves, not the lab's own first actor. Under the smoke seed the
  // crafter is an imported hero and the seed points `lastCraftingActor` at it, so writing runs onto
  // the lab actor puts them somewhere the journal never looks - it renders empty and nothing says why.
  const rememberedId =
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastCraftingActor')) ??
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastGatheringActor'));
  const journalActor = globalThis.game.actors.get(rememberedId) ?? actors[0];
  // If the viewer can see none of them, fall back to the full set: a journal of redacted rows still
  // shows how each STATUS renders, where an empty journal shows nothing at all.
  const runRecipes = journalRecipes.length > 0 ? journalRecipes : allRecipes;
  if (runRecipes.length > 0) {
    installLabRunStates(
      journalActor,
      buildLabRunStates({ actor: journalActor, userId: 'user-lab-player', recipes: runRecipes })
    );
    // The run managers memoise each actor's container the first time they read it, and
    // `initialize()` reads it — so a container written afterwards is invisible until the cache is
    // dropped. The symptom is a journal with runs on the actor and none on screen.
    for (const manager of [
      fabricate.craftingRunManager,
      fabricate.salvageRunManager,
      fabricate.gatheringRunManager,
    ]) {
      manager?.invalidateCache?.();
    }
  }

  return world;
}
