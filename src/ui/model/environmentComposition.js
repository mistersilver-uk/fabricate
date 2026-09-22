/**
 * The environment composition projection: which library tasks and events an environment composes,
 * why, and each row's drop-rate adjustment. Every collaborator arrives as an argument, so the
 * gathering library's confirms read it without reaching into a store (issue 1708).
 */
import {
  DEFAULT_GATHERING_CONDITIONS,
  ENVIRONMENT_COMPOSED_COMPOSITION_STATES,
  conditionSettingsToCurrent,
  environmentComposesRecord,
  resolveGatheringCompositionMode,
} from '../../systems/gatheringComposition.js';
import { evaluateEnvironmentMatch } from '../../systems/gatheringMatch.js';

import {
  normalizeDraftDropRateAdjustmentMap,
  normalizeDraftEventDropRateAdjustmentsEnabled,
  normalizeDraftTaskDropRateAdjustments,
  normalizeDraftTaskDropRateAdjustmentsEnabled,
} from './environmentValidation.js';

export function gatheringLibraryRecordMatchesEnvironment(
  record,
  environment,
  conditions,
  includeDanger = false,
  conditionSettings = null
) {
  return evaluateEnvironmentMatch(record, environment, conditions, {
    includeDanger,
    conditionSettings,
  }).matches;
}

/**
 * Classify every library task/event for the environment into a `CompositionState` +
 * `RuntimeState` plus match evidence, honoring `compositionMode`.
 */
export function buildEnvironmentCompositionViewModel(
  environment,
  {
    defaultSystemId = '',
    gatheringConfig = () => ({}),
    managedItemOptionsFor = () => [],
    localize = null,
  } = {}
) {
  const empty = {
    compositionMode: 'automatic',
    conditions: { ...DEFAULT_GATHERING_CONDITIONS },
    tasks: [],
    events: [],
    counts: emptyCompositionCounts(),
  };
  if (!environment || typeof environment !== 'object') return empty;
  const systemId = String(environment.craftingSystemId || defaultSystemId || '');
  if (!systemId) return empty;

  const config = gatheringConfig();
  const system = config.systems?.[systemId] || {};
  const managedItemById = new Map(
    managedItemOptionsFor(systemId).map((item) => [String(item.id || ''), item])
  );
  const conditionSettings = system.conditions || null;
  const conditions = conditionSettingsToCurrent(conditionSettings);
  const compositionMode = environment.compositionMode === 'manual' ? 'manual' : 'automatic';

  const tasks = classifyCompositionRecords({
    records: Array.isArray(system.tasks) ? system.tasks : [],
    environment,
    conditions,
    conditionSettings,
    compositionMode,
    kind: 'task',
    includeDanger: false,
    order: environment.taskOrder,
    managedItemById,
    localize,
  });
  const events = classifyCompositionRecords({
    records: Array.isArray(system.events) ? system.events : [],
    environment,
    conditions,
    conditionSettings,
    compositionMode,
    kind: 'event',
    includeDanger: true,
    order: environment.eventOrder,
    localize,
  });

  return {
    compositionMode,
    conditions,
    tasks,
    events,
    counts: compositionCounts(tasks, events),
  };
}

export function classifyCompositionRecords({
  records,
  environment,
  conditions,
  conditionSettings,
  compositionMode,
  kind,
  includeDanger,
  order,
  managedItemById = new Map(),
  localize = null,
}) {
  const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
  const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
  const forcedKey = kind === 'event' ? 'forcedEventIds' : 'forcedTaskIds';
  const enabled = Array.isArray(environment?.[enabledKey])
    ? environment[enabledKey].map(String)
    : [];
  const disabled = Array.isArray(environment?.[disabledKey])
    ? environment[disabledKey].map(String)
    : [];
  const forced = Array.isArray(environment?.[forcedKey]) ? environment[forcedKey].map(String) : [];
  const orderIndex = new Map(
    (Array.isArray(order) ? order : []).map((id, index) => [String(id), index])
  );

  const classified = (Array.isArray(records) ? records : []).map((record, index) => {
    const id = String(record?.id || '');
    const libraryEnabled = record?.enabled !== false;
    const { matches, conditionsMet, evidence } = evaluateEnvironmentMatch(
      record,
      environment,
      conditions,
      { includeDanger, conditionSettings }
    );
    // Exclude and force are automatic-mode overrides of the match filter (maintainer ruling,
    // issue 1315); manual mode has no filter to override, so it has neither.
    const excluded = compositionMode !== 'manual' && disabled.includes(id);
    const explicitlyIncluded = enabled.includes(id);
    const forceIncluded = compositionMode !== 'manual' && forced.includes(id);

    let compositionState;
    if (!libraryEnabled) compositionState = 'libraryDisabled';
    // Exclude is checked before force so the two can collide on the same record without a
    // branch order bug deciding it silently: exclude wins.
    else if (excluded) compositionState = 'excluded';
    else if (forceIncluded) compositionState = 'forceIncluded';
    // Manual mode composes exactly `enabled*Ids` with no match filter (maintainer ruling), so a
    // picked non-matching record still composes as `includedNotMatching` — distinct from
    // `notMatching` so the Included list can flag it.
    else if (!matches)
      compositionState =
        compositionMode === 'manual' && explicitlyIncluded ? 'includedNotMatching' : 'notMatching';
    else if (compositionMode === 'manual')
      compositionState = explicitlyIncluded ? 'explicitlyIncluded' : 'candidate';
    else compositionState = 'includedByMatch';

    // A record is runtime-available only when its composition state would compose it and current
    // weather/time satisfy its required conditions. `composed` projects `environmentComposesRecord`
    // onto the shared four-state vocabulary in `gatheringComposition.js`.
    const composed = ENVIRONMENT_COMPOSED_COMPOSITION_STATES.has(compositionState);
    const runtimeState = composed && conditionsMet ? 'available' : 'unavailable';
    const orderRank = orderIndex.has(id) ? orderIndex.get(id) : Number.MAX_SAFE_INTEGER;
    const dropRateAdjustment = dropRateAdjustmentSummary({
      kind,
      record,
      environment,
      managedItemById,
      localize,
    });
    return {
      id,
      record,
      kind,
      libraryEnabled,
      matches,
      conditionsMet,
      evidence,
      excluded,
      explicitlyIncluded,
      compositionState,
      runtimeState,
      orderRank,
      _index: index,
      ...dropRateAdjustment,
    };
  });

  return classified.sort((a, b) =>
    a.orderRank === b.orderRank ? a._index - b._index : a.orderRank - b.orderRank
  );
}

function effectiveDropRate(baseDropRate, adjustment) {
  const base = Number.isFinite(Number(baseDropRate)) ? Math.floor(Number(baseDropRate)) : 0;
  const delta = Number.isFinite(Number(adjustment)) ? Math.floor(Number(adjustment)) : 0;
  return Math.min(100, Math.max(0, base + delta));
}

function dropRowDisplay(row, managedItemById = new Map(), localize = null) {
  const componentId = String(row?.componentId || row?.systemItemId || '');
  const item = componentId ? managedItemById.get(componentId) : null;
  const itemUuid = String(row?.itemUuid || '');
  const unresolvedKey = 'FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop';
  const unresolved = localize?.(unresolvedKey);
  const fallbackName = unresolved && unresolved !== unresolvedKey ? unresolved : 'Unresolved drop';
  return {
    name: String(row?.name || item?.name || itemUuid || fallbackName),
    img: String(row?.img || item?.img || 'icons/svg/item-bag.svg'),
  };
}

function dropRateAdjustmentSummary({
  kind,
  record,
  environment,
  managedItemById = new Map(),
  localize = null,
}) {
  const id = String(record?.id || '');
  if (!id)
    return {
      hasDropRateAdjustment: false,
      dropRateAdjustment: 0,
      dropRateAdjustmentsEnabled: true,
      dropRateAdjustmentRows: [],
    };
  if (kind === 'event') {
    const adjustments = normalizeDraftDropRateAdjustmentMap(environment?.eventDropRateAdjustments);
    const adjustment = adjustments[id] || 0;
    const eventEnabledMap = normalizeDraftEventDropRateAdjustmentsEnabled(
      environment?.eventDropRateAdjustmentsEnabled
    );
    const dropRateAdjustmentsEnabled = eventEnabledMap[id] !== false;
    const appliedAdjustment = dropRateAdjustmentsEnabled ? adjustment : 0;
    const baseDropRate = Number.isFinite(Number(record?.dropRate))
      ? Math.floor(Number(record.dropRate))
      : 1;
    return {
      hasDropRateAdjustment: dropRateAdjustmentsEnabled && adjustment !== 0,
      hasStoredDropRateAdjustment: adjustment !== 0,
      dropRateAdjustment: adjustment,
      dropRateAdjustmentsEnabled,
      baseDropRate,
      effectiveDropRate: effectiveDropRate(baseDropRate, appliedAdjustment),
      dropRateAdjustmentRows: [],
    };
  }

  const taskAdjustments = normalizeDraftTaskDropRateAdjustments(
    environment?.taskDropRateAdjustments
  );
  const taskAdjustmentEnabledMap = normalizeDraftTaskDropRateAdjustmentsEnabled(
    environment?.taskDropRateAdjustmentsEnabled
  );
  const dropRateAdjustmentsEnabled = taskAdjustmentEnabledMap[id] !== false;
  const rowAdjustments = taskAdjustments[id] || {};
  const rows = (
    Array.isArray(record?.dropRows ?? record?.itemDrops)
      ? (record.dropRows ?? record.itemDrops)
      : []
  ).map((row) => {
    const rowId = String(row?.id || '');
    const adjustment = rowAdjustments[rowId] || 0;
    const appliedAdjustment = dropRateAdjustmentsEnabled ? adjustment : 0;
    const baseDropRate = Number.isFinite(Number(row?.dropRate))
      ? Math.floor(Number(row.dropRate))
      : 1;
    const display = dropRowDisplay(row, managedItemById, localize);
    return {
      id: rowId,
      name: display.name,
      img: display.img,
      componentId: String(row?.componentId || row?.systemItemId || ''),
      itemUuid: String(row?.itemUuid || ''),
      quantity:
        Number.isFinite(Number(row?.quantity)) && Number(row.quantity) > 0
          ? Number(row.quantity)
          : 1,
      baseDropRate,
      adjustment,
      effectiveDropRate: effectiveDropRate(baseDropRate, appliedAdjustment),
      hasDropRateAdjustment: dropRateAdjustmentsEnabled && adjustment !== 0,
      hasStoredDropRateAdjustment: adjustment !== 0,
    };
  });
  const hasStoredDropRateAdjustment = rows.some((row) => row.hasStoredDropRateAdjustment);
  return {
    hasDropRateAdjustment: dropRateAdjustmentsEnabled && hasStoredDropRateAdjustment,
    hasStoredDropRateAdjustment,
    dropRateAdjustmentsEnabled,
    dropRateAdjustment: dropRateAdjustmentsEnabled
      ? rows.reduce((sum, row) => sum + row.adjustment, 0)
      : 0,
    dropRateAdjustmentRows: rows,
  };
}

function emptyCompositionCounts() {
  return {
    availableTasks: 0,
    excludedTasks: 0,
    candidateTasks: 0,
    includedNotMatchingTasks: 0,
    availableEvents: 0,
    excludedEvents: 0,
    candidateEvents: 0,
    includedNotMatchingEvents: 0,
    diagnosticTasks: 0,
    diagnosticEvents: 0,
    requiredTools: 0,
  };
}

/**
 * Distinct tool ids required by the tasks available right now — the same
 * `runtimeState === 'available'` population `availableTasks` counts, so the fact is weather- and
 * time-dependent exactly like its neighbours (issue 1321, a deliberate trade).
 */
function requiredToolCount(tasks) {
  const toolIds = new Set();
  for (const row of tasks) {
    if (row.runtimeState !== 'available') continue;
    for (const toolId of Array.isArray(row.record?.toolIds) ? row.record.toolIds : []) {
      // Trimmed before counting: an untrimmed pair would count ' pick ' and 'pick' as two tools.
      const trimmed = String(toolId ?? '').trim();
      if (trimmed) toolIds.add(trimmed);
    }
  }
  return toolIds.size;
}

function compositionCounts(tasks, events) {
  const tally = (records) => {
    const available = records.filter((r) => r.runtimeState === 'available').length;
    const excluded = records.filter((r) => r.compositionState === 'excluded').length;
    const candidate = records.filter((r) => r.compositionState === 'candidate').length;
    // `includedNotMatching` composes (ruling 2, issue 1315), so these records are runtime
    // available whenever conditions are met.
    const includedNotMatching = records.filter(
      (r) => r.compositionState === 'includedNotMatching'
    ).length;
    const diagnostic = records.filter(
      (r) => r.compositionState === 'notMatching' || r.compositionState === 'libraryDisabled'
    ).length;
    return { available, excluded, candidate, includedNotMatching, diagnostic };
  };
  const t = tally(tasks);
  const h = tally(events);
  return {
    availableTasks: t.available,
    excludedTasks: t.excluded,
    candidateTasks: t.candidate,
    includedNotMatchingTasks: t.includedNotMatching,
    diagnosticTasks: t.diagnostic,
    availableEvents: h.available,
    excludedEvents: h.excluded,
    candidateEvents: h.candidate,
    includedNotMatchingEvents: h.includedNotMatching,
    diagnosticEvents: h.diagnostic,
    requiredTools: requiredToolCount(tasks),
  };
}

/**
 * Whether `environment` currently composes the library task/event `record`, through the shared
 * `environmentComposesRecord` predicate, so it mirrors the runtime chain by construction.
 */
export function environmentComposesGatheringRecord(environment, record, kind, conditionSettings) {
  if (!record?.id) return false;
  const includeDanger = kind === 'event';
  const matches = gatheringLibraryRecordMatchesEnvironment(
    record,
    environment,
    {},
    includeDanger,
    conditionSettings
  );
  return environmentComposesRecord(
    environment,
    record,
    kind,
    resolveGatheringCompositionMode(environment),
    matches
  );
}
