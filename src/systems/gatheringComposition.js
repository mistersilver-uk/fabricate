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
 * - `excluded` — automatic mode, explicitly excluded via `disabled*Ids`; wins over a force.
 * - `forceIncluded` — automatic mode, force-added via `forced*Ids`; composes without matching,
 *   unless also excluded.
 * - `includedNotMatching` — manual mode, on `enabled*Ids` but does not currently match; composes
 *   anyway (manual has no match filter — see {@link environmentComposesRecord}), and this state
 *   exists to keep that fact visible to the GM rather than indistinguishable from a matching pick.
 * - `notMatching` — does not match the environment and is not picked (manual) or force-added
 *   (automatic).
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
  'includedNotMatching',
  'notMatching',
  'explicitlyIncluded',
  'candidate',
  'includedByMatch',
]);

/**
 * The states the environment editor shows in its "Included" list and counts in
 * its tab badges. Note that this is a **four**-state set and includes
 * `includedNotMatching`, which is shown to the GM as an included row precisely
 * so a picked record that no longer matches stays visible as such — it composes
 * (see {@link ENVIRONMENT_COMPOSED_COMPOSITION_STATES}), but a GM reading the
 * Included list still needs to know it is not matching.
 *
 * Distinct from {@link ENVIRONMENT_COMPOSED_COMPOSITION_STATES} as a *concept*
 * — "shown in the Included list" and "composes at runtime" are different
 * questions — even though the two sets currently hold the same four members;
 * conflating the two is a silent one-record error in either direction the next
 * time the vocabulary changes shape.
 *
 * @type {Set<string>}
 */
export const ENVIRONMENT_INCLUDED_COMPOSITION_STATES = new Set([
  'includedByMatch',
  'explicitlyIncluded',
  'forceIncluded',
  'includedNotMatching',
]);

/**
 * The states that actually compose into the environment at runtime — the
 * projection of {@link environmentComposesRecord} onto the vocabulary, and the
 * population `runtimeState` is derived from. This is a **four**-state set:
 * `includedNotMatching` composes (manual mode has no match filter — a picked
 * record composes whether or not it currently matches), and the state exists
 * only so the Included list can still flag it as not matching rather than
 * looking identical to a matching pick.
 *
 * @type {Set<string>}
 */
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
 * Force add and exclude belong to **automatic** mode only (maintainer ruling,
 * issue #1315); manual mode has no filter to override, so it has neither.
 *
 * - **automatic**: `(matches ∪ forced*Ids) − disabled*Ids`. Force and exclude are
 *   its two overrides of its own match filter, and they can collide on the same
 *   record — **exclude wins**: a record on both `forced*Ids` and `disabled*Ids`
 *   does not compose. Neither override can act until the record clears the
 *   library-enabled gate below, so a force can never revive a library-disabled
 *   record. `enabled*Ids` is never consulted (a stale manual-mode allow-list
 *   must never suppress or admit a record here).
 * - **manual**: exactly `enabled*Ids`, full stop. No match filter, therefore
 *   nothing to override: `disabled*Ids` and `forced*Ids` are both ignored. A
 *   listed record composes whether or not it currently matches — see
 *   `includedNotMatching` in the module docstring for how that stays visible
 *   to a GM instead of looking identical to a matching pick.
 *
 * Both modes are gated by library-enabled first: `record.enabled === false`
 * composes nowhere, in either mode, before either branch runs.
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
    return idList(environment, keys.enabled).includes(id);
  }
  if (idList(environment, keys.disabled).includes(id)) return false;
  return Boolean(matches) || idList(environment, keys.forced).includes(id);
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
