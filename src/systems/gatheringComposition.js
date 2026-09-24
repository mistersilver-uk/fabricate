/**
 * The one definition of "does this environment compose this library task or event", beside
 * `gatheringMatch.js`, which owns the matching half. It reproduces the filter chain of
 * `GatheringRichStateService.composeEnvironment`, so any disagreement is a defect here. Weather
 * and time of day are runtime gates, not composition: a composed record whose conditions fail is
 * unavailable, not absent. `matches` and the mode are resolved by the caller, through
 * `evaluateEnvironmentMatch` and `resolveGatheringCompositionMode`. Contract:
 * `gathering-and-harvesting/spec.md`.
 */

import { evaluateEnvironmentMatch } from './gatheringMatch.js';

/** The fallback weather and time of day, shared rather than mirrored (issue 1708). */
export const DEFAULT_GATHERING_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });

/**
 * Every state the admin store's row classifier assigns a library record per environment; each
 * consumer must handle every one. Automatic: `includedByMatch`, `forceIncluded`, `excluded`
 * (beats a force). Manual: `explicitlyIncluded` (listed, matching), `includedNotMatching` (listed,
 * composes, shown as not matching), `candidate` (matching, unlisted). Either mode: `notMatching`,
 * `libraryDisabled`.
 */
export const ENVIRONMENT_COMPOSITION_STATES = new Set([
  'libraryDisabled',
  'excluded',
  'forceIncluded',
  'includedNotMatching',
  'notMatching',
  'explicitlyIncluded',
  'candidate',
  'includedByMatch',
]);

/**
 * The states the editor's Included list shows and badges count. A different question from
 * {@link ENVIRONMENT_COMPOSED_COMPOSITION_STATES}, though both hold the same four today.
 */
export const ENVIRONMENT_INCLUDED_COMPOSITION_STATES = new Set([
  'includedByMatch',
  'explicitlyIncluded',
  'forceIncluded',
  'includedNotMatching',
]);

/** The states that compose at runtime, projecting {@link environmentComposesRecord}. */
export const ENVIRONMENT_COMPOSED_COMPOSITION_STATES = new Set([
  'includedByMatch',
  'explicitlyIncluded',
  'forceIncluded',
  'includedNotMatching',
]);

const TASK_ID_KEYS = Object.freeze({
  enabled: 'enabledTaskIds',
  disabled: 'disabledTaskIds',
  forced: 'forcedTaskIds',
});

const EVENT_ID_KEYS = Object.freeze({
  enabled: 'enabledEventIds',
  disabled: 'disabledEventIds',
  forced: 'forcedEventIds',
});

function idKeysFor(kind) {
  return kind === 'event' ? EVENT_ID_KEYS : TASK_ID_KEYS;
}

function idList(environment, key) {
  const value = environment?.[key];
  return Array.isArray(value) ? value.map(String) : [];
}

/** Anything but the literal `'manual'` is automatic, including a record predating the mode. */
export function resolveGatheringCompositionMode(environment) {
  return environment?.compositionMode === 'manual' ? 'manual' : 'automatic';
}

/**
 * Stored condition settings (`{ weather: { enabled, current } }`) to the current
 * `{ weather, timeOfDay }` that `evaluateEnvironmentMatch` takes positionally. Passing the settings
 * there instead fails every condition silently; they belong in `options.conditionSettings`.
 */
export function conditionSettingsToCurrent(settings) {
  return {
    weather: settings?.weather?.current || DEFAULT_GATHERING_CONDITIONS.weather,
    timeOfDay: settings?.timeOfDay?.current || DEFAULT_GATHERING_CONDITIONS.timeOfDay,
  };
}

/**
 * Whether `environment` composes `record`. A library-disabled record composes nowhere. Automatic is
 * `(matches ∪ forced*Ids) − disabled*Ids`, exclude winning; manual is exactly `enabled*Ids`,
 * matching or not (issue 1315). Conditions are not consulted.
 */
export function environmentComposesRecord(environment, record, kind, compositionMode, matches) {
  if (!record || record.enabled === false) return false;
  const id = String(record.id ?? '');
  const keys = idKeysFor(kind);
  if (compositionMode === 'manual') {
    return idList(environment, keys.enabled).includes(id);
  }
  if (idList(environment, keys.disabled).includes(id)) return false;
  return Boolean(matches) || idList(environment, keys.forced).includes(id);
}

/**
 * The environments, in input order, that compose `record` and meet its current conditions, for
 * the "Active environments" facts; membership, not a count, is the answer. `conditionSettings`
 * goes in twice, as `composeEnvironment` does; scoping by enabled or system is the caller's.
 */
export function activeEnvironmentsForRecord(record, environments, kind, options = {}) {
  if (!record || record.enabled === false) return [];
  const { conditionSettings = null } = options;
  const includeDanger = kind === 'event';
  const conditions = conditionSettingsToCurrent(conditionSettings);
  const candidates = Array.isArray(environments) ? environments : [];
  return candidates.filter((environment) => {
    const { matches, conditionsMet } = evaluateEnvironmentMatch(record, environment, conditions, {
      includeDanger,
      conditionSettings,
    });
    if (!conditionsMet) return false;
    return environmentComposesRecord(
      environment,
      record,
      kind,
      resolveGatheringCompositionMode(environment),
      matches
    );
  });
}
