/**
 * The Journal listing of the iterative workbench's lab runs (issue 3011): the `workpiece` world's
 * runs, built by the real `RunJournalBuilder` over a fake run source and localized from the real
 * `lang/en.json`, so a test can read a state's run exactly as the Journal does.
 */
import { Recipe } from '../../src/models/Recipe.js';
import { ResolutionModeService } from '../../src/systems/ResolutionModeService.js';
import { RunJournalBuilder } from '../../src/ui/presenters/RunJournalBuilder.js';
import { LAB_SYSTEM_IDS, buildLabContent } from '../view-lab/world/labContent.js';
import { seedIterativeState } from '../view-lab/world/labIterative.js';
import { ITERATIVE_SCENARIOS } from '../view-lab/world/labIterativeRuns.js';

import { installFoundryUtilsEnv } from './foundryEnv.js';
import { createLangBackedI18n } from './langBackedI18n.js';
import { repoRoot } from './sourceScan.js';

export const WORKPIECE_NOW = 1_209_600;
export const WORKPIECE_PLAYER = Object.freeze({ id: 'user-lab-player', isGM: false });
export const WORKPIECE_GM = Object.freeze({ id: 'user-lab-gm', isGM: true });
export const WORKPIECE_ACTOR = Object.freeze({
  id: 'lab-workpiece',
  uuid: 'Actor.lab-workpiece',
  name: 'Akra',
  img: 'icons/a.webp',
  isOwner: true,
  getRollData: () => ({}),
  items: [
    {
      id: 'lab-bars',
      uuid: 'Actor.lab-workpiece.Item.lab-bars',
      name: 'Iron bar',
      componentId: 'iw-iron-bar',
      system: { quantity: 6 },
    },
  ],
});

const LANG = createLangBackedI18n(repoRoot);

/** The builder's `localize`: a key read from `lang/en.json`, interpolated when it carries data. */
export const workpieceLocalize = (key, data) =>
  data ? LANG.format(key, data) : LANG.localize(key);

/** The `foundry.utils` and empty `game` a `Recipe` reads while the lab recipes are built. */
export function installWorkpieceEnv() {
  installFoundryUtilsEnv();
  Object.assign(globalThis, { game: globalThis.game ?? {} });
}

/** The lab content with the `workpiece` Ironworks seeded, and its Ironworks system. */
export function workpieceContent() {
  const content = buildLabContent();
  seedIterativeState(content, 'workpiece');
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  return { content, system };
}

/** The run containers a matrix state persists, `{ craftingRuns: { active, history } }`. */
export function workpieceRuns(state) {
  return ITERATIVE_SCENARIOS[state].build({
    actorUuid: WORKPIECE_ACTOR.uuid,
    userId: WORKPIECE_PLAYER.id,
  }).craftingRuns;
}

/**
 * The listing for `active` and `history` runs. `hidden` names the recipes the viewer may not see,
 * `missing` the ones that no longer resolve, and `edit(system)` changes Ironworks before the build.
 */
export function workpieceListing({
  active = [],
  history = [],
  viewer = WORKPIECE_PLAYER,
  actor = WORKPIECE_ACTOR,
  hidden = [],
  missing = [],
  authority = null,
  now = WORKPIECE_NOW,
  edit = () => {},
} = {}) {
  const { content, system } = workpieceContent();
  edit(system);
  const recipes = content.recipes
    .filter((entry) => !missing.includes(entry.id))
    .map((entry) => new Recipe(entry));
  const getSystem = (id) => content.systems.find((entry) => entry.id === id) ?? null;
  const builder = new RunJournalBuilder({
    craftingRunManager: { getActiveRuns: () => active, getRunHistory: () => history },
    recipeManager: {
      getRecipe: (id) => recipes.find((recipe) => recipe.id === id) ?? null,
      ingredientMatchesItem: (_recipe, option, item) =>
        item?.componentId === option?.match?.componentId,
    },
    recipeVisibility: {
      evaluateRecipeAccess: ({ recipe }) => ({ visible: !hidden.includes(recipe?.id) }),
    },
    resolutionModeService: new ResolutionModeService({ getSystem }),
    getSystem,
    getComponent: (systemId, id) =>
      getSystem(systemId)?.components?.find((entry) => entry.id === id) ?? null,
    getJournalActionAvailability: authority ? () => authority : null,
    localize: workpieceLocalize,
    nowWorldTime: () => now,
  });
  return builder.buildListing({ actor, viewer });
}

/** The model of a state's selected run, after `mutate(run)` edits the persisted run. */
export function workpieceModel(state, { mutate = () => {}, ...options } = {}) {
  const { active, history } = workpieceRuns(state);
  const runId = ITERATIVE_SCENARIOS[state].runId;
  const run = active[runId] ?? history.find((entry) => entry.id === runId);
  mutate(run);
  const listing = workpieceListing({ active: Object.values(active), history, ...options });
  return [...listing.activeRuns, ...listing.history].find((entry) => entry.id === runId);
}
