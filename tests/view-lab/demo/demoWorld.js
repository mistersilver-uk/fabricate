/** Assemble the hero-demo world (issue 2571) and boot the real Fabricate runtime against it. */
import { settingsKey } from '../foundry/installFoundryShim.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';
import { buildCastActors, buildDocumentIndex } from '../world/labActors.js';
import { seedFabricateFlag } from '../world/labFlags.js';
import { bootLabRuntime, LAB_WORLD_TIME } from '../world/labWorld.js';

import { buildDemoContent, DEMO_ACTORS, DEMO_SEED, DEMO_SYSTEM_IDS } from './demoContent.js';

/**
 * The demo world's persisted settings, keyed as `game.settings` holds them.
 *
 * @param {object} content Output of `buildDemoContent()`.
 * @param {object[]} actors The demo cast; the first is the crafter.
 * @param {string|null} [managedSystemId] The system the manager opens on.
 * @returns {Map<string, unknown>} The seeded settings.
 */
export function buildDemoSettings(content, actors, managedSystemId = null) {
  const settings = new Map();
  const put = (key, value) => settings.set(settingsKey('fabricate', key), value);
  put('craftingSystems', content.systems);
  put('recipes', content.recipes);
  put('gatheringEnvironments', content.environments);
  put('gatheringConfig', content.gatheringConfig);
  put('gatheringParties', []);
  put('lastCraftingActor', actors[0].id);
  put('lastGatheringActor', actors[0].id);
  // The smith alone, so the journey adds the still-keeper's pack as a source on screen.
  put('lastComponentSources', [actors[0].id]);
  put('lastManagedCraftingSystem', managedSystemId ?? DEMO_SYSTEM_IDS.FORGE);
  put('lastAlchemySystem', DEMO_SYSTEM_IDS.STILL);
  put('favouriteRecipes', ['ed-r-longsword']);
  put('managerRailCollapsed', false);
  // Off, so the manager rail advertises no unfinished placeholder.
  put('experimentalFeatures', false);
  return settings;
}

/**
 * @param {object} [options] Options.
 * @param {string|null} [options.managedSystemId] The system the manager opens on.
 * @param {number} [options.seed] The roll stream, overridden only to re-tune the journey.
 * @returns {Promise<object>} The world, with `fabricate`, `shim` and `content` attached.
 */
export async function buildDemoWorld({ managedSystemId = null, seed = DEMO_SEED } = {}) {
  const content = buildDemoContent();
  const actors = buildCastActors(content, DEMO_ACTORS);
  // The still-keeper knows two of the still's three brews, for the GM Knowledge view. The smith
  // knows none, so her bench starts with no known recipe and the experiment teaches her one.
  seedFabricateFlag(actors[1], ['fabricate', 'learnedRecipes'], {
    'hm-r-mending': { sourceItemUuid: null, learnedAt: LAB_WORLD_TIME - 86_400 },
    'hm-r-fire': { sourceItemUuid: null, learnedAt: LAB_WORLD_TIME - 3600 },
  });
  const localize = await createLocalizer();
  const world = {
    seed,
    content,
    settings: buildDemoSettings(content, actors, managedSystemId),
    documents: buildDocumentIndex(content, actors),
    actorList: actors,
    macros: [],
    scenes: [],
    worldTime: LAB_WORLD_TIME,
    i18n: toI18nStub(localize),
    localize,
  };
  await bootLabRuntime(world);
  return world;
}
