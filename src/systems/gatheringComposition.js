/**
 * Shared, single-home composition rules for gathering library records.
 *
 * "Does this environment compose this library task/event?" was answered
 * independently by the runtime service, the admin store, the environment enable
 * gate, two Manager V2 browser facts and two test fixtures, and those answers
 * did not agree. This module is the one definition, alongside `gatheringMatch.js`
 * (which owns the *matching* half of the same question and frames itself the
 * same way).
 *
 * **The engine's chain is the definition.** `GatheringRichStateService.composeEnvironment`
 * is what actually runs for players, so `environmentComposesRecord` reproduces its
 * filter chain — `enabled !== false`, then `matches || forced`, then the
 * composition-mode include gate (`_recordIsForced` + `_environmentIncludesLibraryRecord`) —
 * as one predicate rather than three collaborating filters. Any disagreement between
 * this module and that chain is a defect in this module.
 *
 * **Condition gating is deliberately outside the predicate.** Weather and
 * time-of-day are runtime gates, not composition criteria: a record with the
 * right biome/danger but the wrong current weather is still composed, and merely
 * unavailable right now (see `gatheringMatch.js`). `environmentComposesRecord`
 * therefore never looks at conditions. The `activeEnvironmentsForRecord` seam
 * layers `conditionsMet` on top, because the GM-facing "active environments"
 * facts ask the runtime question rather than the composition one.
 *
 * **`matches` and `compositionMode` are caller-resolved.** The predicate takes
 * both as inputs instead of deriving them, because several consumers already
 * hold them: the admin store's row classifier evaluates the match once and reads
 * five other facts off the same evidence, and the engine resolves the mode once
 * per environment rather than once per record. Resolve them with
 * `evaluateEnvironmentMatch` and `resolveGatheringCompositionMode`.
 *
 * **This module owns the settings-to-current conditions conversion.**
 * `conditionSettingsToCurrent` lived as two byte-equivalent private copies (one
 * in `GatheringRichStateService.js`, one in `adminStore.js` as
 * `_gatheringCurrentConditions`); both are replaced by this export. The
 * `DEFAULT_*` condition constants in those two files stay where they are — they
 * have many unrelated settings-normalisation uses — so this module keeps its own
 * private default rather than exporting a third name for the same pair of words.
 *
 * @typedef {'task' | 'event'} GatheringRecordKind
 * @typedef {'automatic' | 'manual'} GatheringCompositionMode
 * @typedef {{ enabled?: boolean, current?: string }} GatheringConditionSetting
 * @typedef {{ weather?: GatheringConditionSetting, timeOfDay?: GatheringConditionSetting }} GatheringConditionSettings
 * @typedef {{ weather: string, timeOfDay: string }} GatheringCurrentConditions
 */

import { evaluateEnvironmentMatch } from './gatheringMatch.js';

/**
 * Applied by `conditionSettingsToCurrent` when a system has no current weather
 * or time-of-day recorded. Intentionally not exported: `DEFAULT_CONDITIONS`
 * (`GatheringRichStateService.js`) and `DEFAULT_GATHERING_CONDITIONS`
 * (`adminStore.js`) both survive for their own settings-normalisation reads, and
 * a third exported name for the same value would invite exactly the mirror this
 * module exists to remove. Assert it through the conversion instead.
 */
const DEFAULT_CONDITIONS = Object.freeze({ weather: 'clear', timeOfDay: 'day' });

/**
 * The complete composition-state vocabulary a library record can be classified
 * into for one environment, as produced by the admin store's row classifier.
 * Every consumer that switches, filters, or renders on a composition state must
 * be reachable from this set — a state added without updating a consumer is the
 * silent-drift failure this module exists to prevent.
 *
 * - `libraryDisabled` — the record is disabled in the library, so no environment composes it.
 * - `excluded` — automatic mode, explicitly excluded via `disabled*Ids`.
 * - `forceIncluded` — manual mode, force-added via `forced*Ids`; composes without matching.
 * - `includedButUnavailable` — manual mode, on `enabled*Ids` but no longer matching; NOT composed.
 * - `notMatching` — does not match the environment and is not force-added.
 * - `explicitlyIncluded` — manual mode, matching and on `enabled*Ids`.
 * - `candidate` — manual mode, matching but not listed; composable if the GM adds it.
 * - `includedByMatch` — automatic mode, matching and not excluded.
 *
 * @type {Set<string>}
 */
export const ENVIRONMENT_COMPOSITION_STATES = new Set([
  'libraryDisabled',
  'excluded',
  'forceIncluded',
  'includedButUnavailable',
  'notMatching',
  'explicitlyIncluded',
  'candidate',
  'includedByMatch',
]);

/**
 * The states the environment editor shows in its "Included" list and counts in
 * its tab badges. Note that this is a **four**-state set and includes
 * `includedButUnavailable`, which is shown to the GM as an included row (so the
 * stale entry is visible and fixable) but is NOT composed at runtime.
 *
 * Distinct from {@link ENVIRONMENT_COMPOSED_COMPOSITION_STATES}; conflating the
 * two is a silent one-record error in either direction.
 *
 * @type {Set<string>}
 */
export const ENVIRONMENT_INCLUDED_COMPOSITION_STATES = new Set([
  'includedByMatch',
  'explicitlyIncluded',
  'forceIncluded',
  'includedButUnavailable',
]);

/**
 * The states that actually compose into the environment at runtime — the
 * projection of {@link environmentComposesRecord} onto the vocabulary, and the
 * population `runtimeState` is derived from. This is a **three**-state set:
 * `includedButUnavailable` is deliberately absent, because a stale `enabled*Ids`
 * entry for a record that no longer matches is displayed but not composed.
 *
 * @type {Set<string>}
 */
export const ENVIRONMENT_COMPOSED_COMPOSITION_STATES = new Set([
  'includedByMatch',
  'explicitlyIncluded',
  'forceIncluded',
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

/**
 * Resolve an environment's composition mode. Anything other than the literal
 * `'manual'` is automatic, which is the default for a new environment and the
 * shape a record written before the mode existed carries.
 *
 * @param {object} [environment]
 * @returns {GatheringCompositionMode}
 */
export function resolveGatheringCompositionMode(environment) {
  return environment?.compositionMode === 'manual' ? 'manual' : 'automatic';
}

/**
 * Convert a system's condition **settings** — `{ weather: { enabled, current }, … }`,
 * the shape stored on `gatheringConfig.systems[id].conditions` — into the
 * **current** shape `{ weather, timeOfDay }` that `evaluateEnvironmentMatch`
 * takes as its third positional argument, substituting the defaults for an
 * empty `current`.
 *
 * The two shapes are easy to confuse and the mistake is silent: passing the
 * settings object straight through makes `normalizeConditionId` read
 * `.id ?? .value ?? .label` off an object, return `''`, and fail `conditionsMet`
 * for every record with a non-empty weather or time-of-day list.
 *
 * Note that the settings object is ALSO needed by `evaluateEnvironmentMatch`
 * itself, as `options.conditionSettings`, which is where the per-dimension
 * *enabled* gates are read from — the current shape carries no `enabled` flag,
 * so omitting the option hard-codes both gates to `true`. See
 * `activeEnvironmentsForRecord`, which passes both.
 *
 * @param {GatheringConditionSettings | null} [settings]
 * @returns {GatheringCurrentConditions}
 */
export function conditionSettingsToCurrent(settings) {
  return {
    weather: settings?.weather?.current || DEFAULT_CONDITIONS.weather,
    timeOfDay: settings?.timeOfDay?.current || DEFAULT_CONDITIONS.timeOfDay,
  };
}

/**
 * Whether `environment` composes the library `record` — the one definition,
 * reproducing `GatheringRichStateService.composeEnvironment`'s filter chain.
 *
 * - **automatic**: `matches − disabled*Ids`. Bounded by no id list at all: it
 *   consults neither `enabled*Ids` (a stale allow-list left over from manual
 *   mode must never suppress matching records) nor `forced*Ids` (forces are a
 *   manual-mode affordance). Automatic means "everything matching unless
 *   explicitly excluded".
 * - **manual**: `enabled*Ids ∪ forced*Ids`. A force-add composes whether or not
 *   the record matches; an `enabled*Ids` entry composes only while the record
 *   still matches (otherwise it is `includedButUnavailable` — shown, not
 *   composed). `disabled*Ids` is stale in this mode and is ignored.
 *
 * Conditions are NOT consulted (see the module docstring); a composed record
 * whose weather or time-of-day does not currently apply is composed and
 * unavailable, not absent.
 *
 * @param {object} environment Environment record (raw or composed).
 * @param {object} record Library task or event.
 * @param {GatheringRecordKind} kind
 * @param {GatheringCompositionMode} compositionMode Caller-resolved via {@link resolveGatheringCompositionMode}.
 * @param {boolean} matches Caller-resolved via `evaluateEnvironmentMatch(...).matches`.
 * @returns {boolean}
 */
export function environmentComposesRecord(environment, record, kind, compositionMode, matches) {
  if (!record || record.enabled === false) return false;
  const id = String(record.id ?? '');
  const keys = idKeysFor(kind);
  if (compositionMode === 'manual') {
    if (idList(environment, keys.forced).includes(id)) return true;
    return Boolean(matches) && idList(environment, keys.enabled).includes(id);
  }
  return Boolean(matches) && !idList(environment, keys.disabled).includes(id);
}

/**
 * The environments, **in input order**, that compose `record` and whose current
 * conditions it satisfies — the shared seam behind the Manager V2 "Active
 * environments" facts on the gathering task and event browsers.
 *
 * It returns the environments rather than a count so that callers can render
 * `.length` while tests and reports compare *membership*: a record can gain one
 * environment and lose another, leaving the integer unchanged while the answer
 * changed completely.
 *
 * One `evaluateEnvironmentMatch` call per environment yields both `matches` and
 * `conditionsMet`, and `conditionSettings` is passed **twice** — converted, as
 * the third positional (the current weather/time the record is tested against),
 * and raw, as `options.conditionSettings` (where the per-dimension *enabled*
 * gates are read from). This mirrors `GatheringRichStateService.composeEnvironment`.
 *
 * A record disabled in the library composes nowhere, so this returns `[]` for
 * `record.enabled === false` without inspecting any environment.
 *
 * Scoping is the caller's: this applies neither `environment.enabled === false`
 * nor a `craftingSystemId` filter, because those answer "which environments is
 * this GM looking at", not "does this record compose".
 *
 * @param {object} record Library task or event.
 * @param {object[]} environments Environments to test, already scoped by the caller.
 * @param {GatheringRecordKind} kind `'event'` applies danger matching; `'task'` does not.
 * @param {{ conditionSettings?: GatheringConditionSettings | null }} [options]
 * @returns {object[]} The composing environments, in input order.
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
