/**
 * What a recipe step card reads about one step's iterative configuration: the config itself from
 * `normalizeStepIterative`'s defaults, its allowed actions, and the Counter Instances it can hide or
 * lock. Pure, so the card and its tests share one reading.
 */
import { normalizeStepIterative } from '../../../../../../models/iterativeStepConfig.js';
import { arrayOrEmpty, isPlainObject } from '../../../../../../utils/scalars.js';
import { counterUses } from '../../iterative/iterativeLibraryModel.js';

/** The step's config, or the normalizer's defaults when none is authored. */
export const stepConfigOf = (raw) => normalizeStepIterative(raw) ?? normalizeStepIterative({});

/** `'only'` when the step allows a chosen list, else `'all'`. */
export const actionModeOf = (config) =>
  isPlainObject(config?.actions) && config.actions.mode === 'only' ? 'only' : 'all';

/** The allowed ids as authored, or `[]` when the list does not parse. */
export const allowedIdsOf = (config) =>
  isPlainObject(config?.actions) && Array.isArray(config.actions.actionIds)
    ? config.actions.actionIds
    : [];

/** `{ id, label }` for each Counter Instance, named from the library and else by its id. */
export function instanceSources(instances, libraryCounters) {
  const labels = new Map(arrayOrEmpty(libraryCounters).map((entry) => [entry.id, entry.label]));
  return arrayOrEmpty(instances)
    .filter((entry) => typeof entry?.counterId === 'string')
    .map((entry) => ({
      id: entry.counterId,
      label: labels.get(entry.counterId) || entry.counterId,
      visible: entry.visible !== false,
    }));
}

/**
 * The library actions as `SetPicker` options; `meta` is `idleMeta` for an action no Counter
 * Instance's `counterUses` lists, because it changes nothing in this recipe.
 */
export function actionOptions(library, sources, idleMeta) {
  const active = new Set(
    sources.flatMap((source) => counterUses(library, [], source.id).actions.map((use) => use.id))
  );
  return arrayOrEmpty(library?.actions).map((action) => ({
    id: action.id,
    label: action.label || action.id,
    dataId: action.id,
    ...(!active.has(action.id) && { meta: idleMeta }),
  }));
}

/** `ids` with `id` added when it is absent, else removed. */
export function toggledId(ids, id) {
  const list = arrayOrEmpty(ids);
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}
