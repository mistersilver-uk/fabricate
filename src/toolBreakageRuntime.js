import { stampItemDataRoleIdentity } from './config/flags.js';
import { Tool } from './models/Tool.js';
import { setStackQuantity } from './systems/itemStackQuantity.js';
import { resolvedToolsFor } from './systems/scopedEntityReads.js';
import { effectiveToolBreakageAuthority } from './systems/toolBreakageAuthority.js';

/**
 * Stamp a broken-tool REPLACEMENT grant's durable identity onto its item data BEFORE creation
 * (issue 780), ALWAYS the replacement component id — the replacement IS that component.
 * `roles[system.id].toolId` is co-stamped ONLY when EXACTLY ONE first-class tool links that
 * component: the matcher reads `toolId`, so a componentId-only stamp would leave a replacement that
 * is itself a working tool unmatchable, while zero or several linking tools is ambiguous.
 * Shared by BOTH replacement creators, so their stamping cannot drift.
 */
export function stampReplacementComponentIdentity(itemData, system, componentId) {
  const systemId = system?.id;
  stampItemDataRoleIdentity(itemData, systemId, 'componentId', componentId);
  const linkingTools = resolvedToolsFor(system).filter((tool) => tool?.componentId === componentId);
  if (linkingTools.length === 1) {
    stampItemDataRoleIdentity(itemData, systemId, 'toolId', linkingTools[0].id);
  }
}

function replacementItemData(source) {
  if (!source || typeof source !== 'object') return null;
  const fromDocument = source.toObject?.();
  const itemData =
    fromDocument && typeof fromDocument === 'object'
      ? fromDocument
      : {
          name: source.name ?? 'Replacement Item',
          img: source.img ?? 'icons/svg/item-bag.svg',
          type: source.type ?? 'loot',
          system: source.system
            ? (globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system })
            : {},
        };
  itemData.system ??= {};
  setStackQuantity(itemData, 1);
  if (source.uuid) {
    globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
  }
  return itemData;
}

/** The single lossless Tool replacement creator crafting, salvage and gathering all share. */
export function createToolReplacementCreator({
  system = null,
  resolveComponentSource,
  resolveItemUuid,
} = {}) {
  return async ({ actor, target } = {}) => {
    if (typeof actor?.createEmbeddedDocuments !== 'function') return null;

    let source;
    let componentId = null;
    try {
      if (target?.type === 'component') {
        componentId = typeof target.componentId === 'string' ? target.componentId.trim() : '';
        if (!componentId || typeof resolveComponentSource !== 'function') return null;
        source = await resolveComponentSource({ componentId, system });
      } else if (target?.type === 'item') {
        const itemUuid = typeof target.itemUuid === 'string' ? target.itemUuid.trim() : '';
        if (!itemUuid || typeof resolveItemUuid !== 'function') return null;
        source = await resolveItemUuid(itemUuid);
        if (source?.documentName !== 'Item') return null;
      } else {
        return null;
      }

      if (!source) return null;
      const itemData = replacementItemData(source);
      if (!itemData) return null;
      if (componentId) stampReplacementComponentIdentity(itemData, system, componentId);

      const created = await actor.createEmbeddedDocuments('Item', [itemData]);
      const createdItem = Array.isArray(created) ? created[0] : null;
      return createdItem?.documentName === 'Item' ? createdItem : null;
    } catch {
      return null;
    }
  };
}

/**
 * The shared Tool breakage PLAN/APPLY runtime, consumed by the gathering engine and `CraftingEngine`
 * alike so decision and side effects stay in lockstep. Deliberately matcher-agnostic — `matchTools`,
 * `buildItemRef`, `resolveReplacementSource`, `resolveItemUuid` and `evaluateExpression` are all
 * injected — and USAGE SEMANTICS ARE EXACT: only `limitedUses` tools write item flags.
 */

/**
 * Read the persisted tool-usage flag, tolerant of the historical shapes and of no Foundry. CATALYST
 * FALLBACK: absent `toolUsage`, the pre-0.6.0 `catalystItemUsage` is read so an item already degraded
 * as a catalyst keeps its count. Writes always go to the authoritative `toolUsage`.
 */
export function readToolUsage(item) {
  const toolUsage =
    item?.getFlag?.('fabricate', 'toolUsage') ??
    item?.getFlag?.('fabricate', 'fabricate.toolUsage') ??
    globalThis.foundry?.utils?.getProperty?.(item, 'flags.fabricate.toolUsage') ??
    globalThis.foundry?.utils?.getProperty?.(item, 'flags.fabricate.fabricate.toolUsage');
  if (toolUsage) return toolUsage;

  const catalystUsage =
    item?.getFlag?.('fabricate', 'catalystItemUsage') ??
    item?.getFlag?.('fabricate', 'fabricate.catalystItemUsage') ??
    globalThis.foundry?.utils?.getProperty?.(item, 'flags.fabricate.catalystItemUsage') ??
    globalThis.foundry?.utils?.getProperty?.(item, 'flags.fabricate.fabricate.catalystItemUsage');
  if (catalystUsage) return catalystUsage;

  return { timesUsed: 0 };
}

/**
 * Decide whether a tool breaks on this attempt WITHOUT mutating the item: `limitedUses` projects the
 * post-increment `timesUsed`, every other mode defers to `Tool#evaluateBreakage`.
 */
export async function evaluateToolBreakagePlan(tool, { actor, item, evaluateExpression } = {}) {
  if (tool.breakage?.mode === 'limitedUses') {
    const usage = readToolUsage(item);
    const timesUsed = Number(usage?.timesUsed || 0) + 1;
    const maxUses = tool.breakage.maxUses;
    const broken = maxUses !== null && Number.isFinite(maxUses) && timesUsed >= maxUses;
    return { broken, mode: 'limitedUses', evidence: { timesUsed, maxUses } };
  }
  return tool.evaluateBreakage({ actor, item, evaluateExpression });
}

/** Project the on-break outcome shape used in plan entries; no side effects. */
export function plannedToolBreakageOutcome(tool) {
  if (tool.onBreak?.mode === 'destroy') return { action: 'destroyed' };
  if (tool.onBreak?.mode === 'flagBroken') return { action: 'flagged' };
  if (tool.onBreak?.mode === 'replaceWith') {
    return {
      action: 'replaced',
      replacementTarget: tool.onBreak.replacementTarget
        ? { ...tool.onBreak.replacementTarget }
        : null,
    };
  }
  return { action: 'none' };
}

function stringOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value);
}

/** Compare two numbers with one of the DSL operators. */
function compareNumeric(actual, operator, expected) {
  switch (operator) {
    case '==': {
      return actual === expected;
    }
    case '<=': {
      return actual <= expected;
    }
    case '>=': {
      return actual >= expected;
    }
    case '<': {
      return actual < expected;
    }
    case '>': {
      return actual > expected;
    }
    default: {
      return false;
    }
  }
}

/**
 * Reduce a dice group's per-die `results[]` to the value an aggregate targets, `null` when per-die
 * faces are needed but absent so the trigger fails open — except `total`, read off the group `sum`.
 */
function aggregateDiceGroup(group, aggregate) {
  if (aggregate === 'total') {
    const sum = Number(group?.sum);
    return Number.isFinite(sum) ? sum : null;
  }
  const results = Array.isArray(group?.results) ? group.results : [];
  if (results.length === 0) return null; // fail-open: no per-die data
  switch (aggregate) {
    case 'anyDie':
    case 'allDice': {
      // any/all compare per-die against the operator; the array signals that path to the caller.
      return results;
    }
    case 'lowestDie': {
      return Math.min(...results);
    }
    case 'highestDie': {
      return Math.max(...results);
    }
    default: {
      return null;
    }
  }
}

/**
 * Evaluate one `checkBreakage` condition against a checkResult, exported so the check-roll runners
 * reuse the SAME matching: that path passes a synthetic `{ value, data }` and skips `outcomeTier`
 * conditions, the routed tier not yet being known.
 */
export function evaluateCheckBreakageCondition(condition, checkResult) {
  if (!condition || typeof condition !== 'object') return false;
  const data = checkResult?.data || {};
  switch (condition.type) {
    case 'rollTotal': {
      const total = Number(data.total);
      if (!Number.isFinite(total)) return false;
      return compareNumeric(total, condition.operator, condition.value);
    }
    case 'progressiveValue': {
      // Only meaningful on progressive checks. Absent (non-progressive) → no match.
      const value = Number(checkResult?.value);
      if (!Number.isFinite(value)) return false;
      return compareNumeric(value, condition.operator, condition.value);
    }
    case 'outcomeTier': {
      const tierIds = Array.isArray(condition.tierIds) ? condition.tierIds : [];
      const outcomeKeys = Array.isArray(condition.outcomeKeys) ? condition.outcomeKeys : [];
      const outcomeId = data.outcomeId ?? null;
      const outcome =
        typeof checkResult?.outcome === 'string' ? checkResult.outcome.trim().toLowerCase() : null;
      if (outcomeId !== null && tierIds.includes(String(outcomeId))) return true;
      if (outcome !== null && outcomeKeys.includes(outcome)) return true;
      return false;
    }
    case 'diceGroup': {
      const groups = Array.isArray(data.diceGroups) ? data.diceGroups : [];
      const group = groups.find((entry) => Number(entry?.groupId) === Number(condition.groupId));
      if (!group) return false;
      const reduced = aggregateDiceGroup(group, condition.aggregate);
      if (reduced === null) return false; // fail-open
      if (Array.isArray(reduced)) {
        // anyDie / allDice: per-die comparison against the operator.
        const matches = reduced.map((face) =>
          compareNumeric(face, condition.operator, condition.value)
        );
        return condition.aggregate === 'allDice' ? matches.every(Boolean) : matches.some(Boolean);
      }
      return compareNumeric(reduced, condition.operator, condition.value);
    }
    default: {
      return false;
    }
  }
}

/**
 * Decide whether the active check forces every required tool to break (issue 419) — the one shared
 * trigger evaluator all three activities route through, and PURE, the side effect staying in the
 * engine's `apply`. Only an engine-evaluated result (`engineEvaluated === true`) can force-break,
 * the legacy per-tier `data.breakTools` is an implicit always-on trigger, and a configured trigger
 * fires only when it both opts in and matches.
 */
export function evaluateCheckBreakage({ checkBreakage, checkResult } = {}) {
  const none = { forceBreak: false, triggerId: null, reason: null };
  // Only engine-evaluated roll-formula results carry the authored-engine
  // `breakTools`/`checkBreakage` concepts; any other result is passed through verbatim.
  if (checkResult?.engineEvaluated !== true) return none;

  // Legacy implicit trigger: a routed per-tier `data.breakTools` flag always force-breaks.
  if (checkResult?.data?.breakTools === true) {
    return {
      forceBreak: true,
      triggerId: 'legacyBreakTools',
      reason: 'Critical / tier breakage',
    };
  }

  const triggers = Array.isArray(checkBreakage?.triggers) ? checkBreakage.triggers : [];
  for (const trigger of triggers) {
    if (
      trigger?.breakTools === true &&
      evaluateCheckBreakageCondition(trigger?.condition, checkResult)
    ) {
      return {
        forceBreak: true,
        triggerId: trigger.id ?? null,
        reason: 'Check breakage',
      };
    }
  }
  return none;
}

/**
 * Apply usage and, when broken, the on-break side effects to one owned tool item, answering the run's
 * evidence entry. `applyUsage` is a no-op outside `limitedUses`, so presence-only stamps nothing.
 */
export async function applyToolUsageAndBreakage({
  tool,
  actor,
  item,
  planned,
  authority = 'toolSpecific',
  evaluateExpression,
  buildItemRef,
  createReplacement,
} = {}) {
  if (authority !== 'checkDriven') {
    await tool.applyUsage(item);
  }
  const itemRef = typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null;
  // Under tool-specific authority `applyUsage` has already incremented `timesUsed`, so an unplanned
  // decision reads the POST-increment count; check-driven callers supply a planned decision instead.
  const breakageResult = planned
    ? { mode: planned.mode, broken: planned.broken, evidence: planned.evidence }
    : await tool.evaluateBreakage({ actor, item, evaluateExpression });
  const entry = {
    componentId: tool.componentId,
    toolId: tool.id ?? null,
    itemRef,
    mode: breakageResult.mode,
    broken: breakageResult.broken,
    evidence: breakageResult.evidence,
  };
  if (breakageResult.broken) {
    entry.onBreak = await tool.applyBreakage({ item, actor, createReplacement });
  }
  return entry;
}

/** A reusable breakage plan/apply pair, every surface-specific resolution injected. */
export function createToolBreakageRuntime({
  matchTools,
  buildItemRef,
  resolveReplacementSource,
  resolveItemUuid,
  evaluateExpression,
  planKey,
} = {}) {
  const pendingPlans = new Map();
  const keyOf =
    typeof planKey === 'function'
      ? planKey
      : ({ actor, task } = {}) => `${actor?.uuid ?? actor?.id ?? 'actor'}:${task?.id ?? 'task'}`;

  function makeCreateReplacement(system) {
    return createToolReplacementCreator({
      system,
      resolveComponentSource: resolveReplacementSource,
      resolveItemUuid,
    });
  }

  // The system's EFFECTIVE breakage authority (issue 419; world-scoped at 1363). It must NOT
  // re-default to `toolSpecific`, which would make an authored world authority inert at this reader.
  function resolveAuthority(system) {
    return effectiveToolBreakageAuthority(system);
  }

  return {
    async plan({
      actor,
      system,
      task,
      tools = [],
      presentTools = null,
      checkResult = null,
      checkBreakage = null,
    } = {}) {
      const matched = matchTools({ actor, system, task, tools, presentTools });
      const authority = resolveAuthority(system);
      // Under checkDriven authority the active check decides. `checkBreakable === false` excludes a
      // Tool; legacy `breakage.mode: 'immune'` reads forward as that and is never written.
      const decision =
        authority === 'checkDriven'
          ? evaluateCheckBreakage({ checkBreakage, checkResult })
          : { forceBreak: false, triggerId: null, reason: null };
      const checkId = checkResult?.data?.checkId ?? checkResult?.checkId ?? null;
      const planned = [];
      for (const { tool, item, virtual, breakable } of matched.items) {
        const model = tool instanceof Tool ? tool : Tool.fromJSON(tool);
        // A presence-only match (durable-identity gate, issue 557) owns an item but must NOT be
        // consumed or destroyed, so it is treated like a virtual match.
        const spared = breakable === false && !virtual && !!item;
        // A virtual match has no owned item; under checkDriven both are recorded as skipped.
        if (virtual || !item || spared) {
          if (authority === 'checkDriven') {
            planned.push({
              componentId: model.componentId,
              toolId: model.id ?? null,
              itemRef: null,
              mode: model.breakage?.mode ?? null,
              broken: false,
              evidence: spared ? { authority, spared: true } : { authority, virtual: true },
              authority,
              ...(spared ? { spared: true } : { virtual: true }),
            });
          }
          continue;
        }
        const itemRef = typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null;
        const isImmune = model.checkBreakable === false || model.breakage?.mode === 'immune';
        let breakageResult;
        let extra = {};
        if (authority === 'checkDriven') {
          if (isImmune) {
            // Excluded tools never break and are recorded as skipped-immune.
            breakageResult = { mode: 'immune', broken: false, evidence: { authority } };
            extra = { authority, skippedImmune: true };
          } else if (decision.forceBreak) {
            breakageResult = { mode: 'forced', broken: true, evidence: { authority } };
            extra = {
              authority,
              checkId,
              triggerId: decision.triggerId,
              reason: decision.reason,
            };
          } else {
            breakageResult = { mode: 'forced', broken: false, evidence: { authority } };
            extra = { authority };
          }
        } else {
          breakageResult = await evaluateToolBreakagePlan(model, {
            actor,
            item,
            evaluateExpression,
          });
        }
        const entry = {
          componentId: model.componentId,
          toolId: model.id ?? null,
          itemRef,
          mode: breakageResult.mode,
          broken: breakageResult.broken,
          evidence: breakageResult.evidence,
          ...extra,
        };
        if (breakageResult.broken) {
          entry.onBreak = plannedToolBreakageOutcome(model);
        }
        planned.push(entry);
      }
      pendingPlans.set(keyOf({ actor, task }), planned);
      return planned;
    },

    async apply({
      actor,
      system,
      task,
      tools = [],
      presentTools = null,
      checkResult = null,
      checkBreakage = null,
    } = {}) {
      const matched = matchTools({ actor, system, task, tools, presentTools });
      const key = keyOf({ actor, task });
      const plannedByItem = new Map(
        (pendingPlans.get(key) || []).map((entry) => [
          stringOrEmpty(entry?.itemRef?.itemUuid),
          entry,
        ])
      );
      pendingPlans.delete(key);
      const authority = resolveAuthority(system);
      const decision =
        authority === 'checkDriven'
          ? evaluateCheckBreakage({ checkBreakage, checkResult })
          : { forceBreak: false, triggerId: null, reason: null };
      const checkId = checkResult?.data?.checkId ?? checkResult?.checkId ?? null;
      const evidence = [];
      for (const { tool: toolData, item, virtual, breakable } of matched.items) {
        const tool = toolData instanceof Tool ? toolData : Tool.fromJSON(toolData);
        // A presence-only match (durable-identity gate, issue 557) owns an item but must NOT be
        // consumed or destroyed, so it is treated like a virtual match.
        const spared = breakable === false && !virtual && !!item;
        // A virtual match has no owned item; under checkDriven both are recorded as skipped.
        if (virtual || !item || spared) {
          if (authority === 'checkDriven') {
            evidence.push({
              componentId: tool.componentId,
              toolId: tool.id ?? null,
              itemRef: null,
              mode: tool.breakage?.mode ?? null,
              broken: false,
              evidence: spared ? { authority, spared: true } : { authority, virtual: true },
              authority,
              ...(spared ? { spared: true } : { virtual: true }),
            });
          }
          continue;
        }
        const itemRef = typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null;
        // `checkBreakable === false` is canonical; legacy `immune` is read-forward only.
        const isImmune = tool.checkBreakable === false || tool.breakage?.mode === 'immune';
        let planned = plannedByItem.get(stringOrEmpty(itemRef?.itemUuid));
        let extra = {};
        if (authority === 'checkDriven') {
          if (isImmune) {
            // Excluded tools never break and are recorded as skipped-immune.
            planned = { mode: 'immune', broken: false, evidence: { authority } };
            extra = { authority, skippedImmune: true };
          } else if (decision.forceBreak) {
            planned = { mode: 'forced', broken: true, evidence: { authority } };
            extra = {
              authority,
              checkId,
              triggerId: decision.triggerId,
              reason: decision.reason,
            };
          } else {
            planned = { mode: 'forced', broken: false, evidence: { authority } };
            extra = { authority };
          }
        }
        const entry = await applyToolUsageAndBreakage({
          tool,
          actor,
          item,
          planned,
          authority,
          evaluateExpression,
          buildItemRef,
          createReplacement: makeCreateReplacement(system),
        });
        evidence.push({ ...entry, ...extra });
      }
      return evidence;
    },
  };
}
