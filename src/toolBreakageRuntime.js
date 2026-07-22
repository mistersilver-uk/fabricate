import { stampItemDataRoleIdentity } from './config/flags.js';
import { Tool } from './models/Tool.js';

/**
 * Stamp a broken-tool REPLACEMENT grant's durable identity onto its item-data payload
 * BEFORE creation (issue 780). ALWAYS stamps the replacement component id at
 * `flags.fabricate.roles[system.id].componentId` — the replacement IS that component — so
 * every downstream component consumer (inventory display, salvage, crafting ingredient
 * matching, the gathering stack-guard) resolves it by durable identity once #601 removes
 * the name-fallback tier.
 *
 * ADDITIONALLY co-stamps `roles[system.id].toolId` with the linking tool's id ONLY when
 * EXACTLY ONE first-class tool in `system.tools` links the replacement component
 * (`tool.componentId === componentId`) — the componentId-linked "whetstone" case the `Tool`
 * model documents. The tool matcher (`resolveToolForItem` / `itemIsToolByDurableIdentity`)
 * reads `roles[systemId].toolId`, NOT `componentId`, so a componentId-only stamp would not
 * keep a replacement that is itself a working tool matchable once the name tier is gone. On
 * ZERO or MULTIPLE linking tools the `toolId` co-stamp is skipped (ambiguous); when the
 * component does not resolve `componentId` is nullish and the shared writer stamps nothing.
 *
 * Shared by BOTH replacement creators — `CraftingEngine._makeToolReplacementCreator` and
 * {@link makeCreateReplacement} below — so their stamping logic cannot drift.
 *
 * @param {object} itemData - the plain replacement item-data about to be created
 * @param {{ id?: string, tools?: Array<object> }|null|undefined} system
 * @param {string|null|undefined} componentId - the resolved replacement component id
 */
export function stampReplacementComponentIdentity(itemData, system, componentId) {
  const systemId = system?.id;
  stampItemDataRoleIdentity(itemData, systemId, 'componentId', componentId);
  const linkingTools = (Array.isArray(system?.tools) ? system.tools : []).filter(
    (tool) => tool?.componentId === componentId
  );
  if (linkingTools.length === 1) {
    stampItemDataRoleIdentity(itemData, systemId, 'toolId', linkingTools[0].id);
  }
}

function replacementItemData(source) {
  if (!source || typeof source !== 'object') return null;
  const fromDocument = source.toObject?.();
  const itemData = fromDocument && typeof fromDocument === 'object'
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
  itemData.system.quantity = 1;
  if (source.uuid) {
    globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
  }
  return itemData;
}

/**
 * Build the single lossless Tool replacement creator used by crafting, salvage,
 * and gathering breakage consumers.
 *
 * @param {object} dependencies
 * @param {object|null} dependencies.system
 * @param {(args: {componentId: string, system: object}) => object|Promise<object|null>}
 *   [dependencies.resolveComponentSource]
 * @param {(uuid: string) => Promise<object|null>} [dependencies.resolveItemUuid]
 * @returns {(args: {actor: object, target: object}) => Promise<object|null>}
 */
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
 * Shared Tool breakage PLAN/APPLY runtime.
 *
 * Both the gathering engine (`src/main.js` `createGatheringToolBreakage`) and the
 * crafting engine (`src/systems/CraftingEngine.js`) consume this single
 * implementation so the breakage decision and on-break side effects stay in
 * lockstep across surfaces.
 *
 * The runtime is deliberately matcher-agnostic: callers inject
 *   - `matchTools`      — resolves required tools to owned `{ tool, item }` pairs
 *   - `buildItemRef`    — builds a run-record `{ actorUuid, itemUuid, quantity }`
 *   - `resolveReplacementSource` — resolves a `replaceWith` componentId to a
 *     source item/component (optional; only needed for the `replaceWith` mode)
 *   - `evaluateExpression` — async dice/expression evaluator (optional)
 *
 * Usage (`limitedUses`) semantics are preserved exactly: only `limitedUses`
 * tools write `flags.fabricate.toolUsage`; the other breakage modes never touch
 * item flags.
 */

/**
 * Read the persisted tool-usage flag, tolerant of the several historical flag
 * shapes (nested namespace, dotted path) and the absence of a Foundry runtime.
 *
 * Catalyst→Tool migration fallback: when no `toolUsage` flag exists, fall back to the
 * legacy `flags.fabricate.catalystItemUsage` written before the 0.6.0 migration, so an item
 * already degraded as a catalyst keeps its used count under the unified Tool runtime. This
 * is meaningful only for migrated `limitedUses` tools; presence-only tools never read usage.
 * Writes always go to `toolUsage` (authoritative); `catalystItemUsage` is never back-filled.
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
 * Decide whether a tool breaks on this attempt WITHOUT mutating the item.
 *
 * For `limitedUses` this projects the post-increment `timesUsed` (so the plan
 * reflects the usage that {@link applyToolUsageAndBreakage} will record) by
 * reading the current usage and adding one. Other modes defer to
 * {@link Tool#evaluateBreakage}.
 *
 * @param {Tool} tool
 * @param {{ actor?: object, item?: object, evaluateExpression?: Function }} params
 * @returns {Promise<{ broken: boolean, mode: string, evidence: object }>}
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

/**
 * Project the on-break outcome shape used in plan entries (no side effects).
 */
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

/**
 * Compare two numbers with one of the DSL operators.
 * @private
 */
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
 * Reduce a dice group's per-die `results[]` to the value an aggregate targets.
 * Returns `null` when the aggregate needs per-die faces but none are present
 * (fail-open: the trigger does not match), EXCEPT `total`, which uses the group
 * `sum` and is always available.
 * @private
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
      // any/all are evaluated per-die against the operator (handled by the caller);
      // returning the array signals the per-die comparison path.
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
 * Evaluate one `checkBreakage` condition against a checkResult.
 *
 * Exported so the check-roll runners ({@link module:src/systems/checkRoll}) can
 * reuse the SAME condition-matching logic for forced-outcome resolution, instead
 * of duplicating it. The forced-outcome path passes a synthetic `checkResult`
 * carrying just `{ value, data: { total, diceGroups } }` and skips `outcomeTier`
 * conditions (the routed tier is not yet known when the outcome is being forced).
 * @returns {boolean}
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
 * Decide whether the active check forces every required tool to break (issue 419).
 *
 * This is the single shared trigger-evaluator seam that crafting, salvage, and
 * gathering all route through, so the decision cannot drift between surfaces. It is
 * a PURE decision (no side effects); the side-effect point stays in the engine /
 * runtime `apply`.
 *
 * - Only engine-evaluated roll-formula check results (`engineEvaluated === true`) can
 *   force-break; any other result never force-breaks (the legacy guard formerly in
 *   `CraftingEngine._checkForcesToolBreak`).
 * - The legacy `data.breakTools` (the routed per-tier `outcome.breakTools` bridge) is
 *   honoured as an implicit always-on trigger, so existing tier flags keep working
 *   without separate persistence.
 * - Each configured trigger force-breaks all required tools (triggers are ORed) only
 *   when it both opts into breakage (`breakTools === true`) AND its condition matches
 *   the checkResult.
 *
 * @param {object} params
 * @param {{ triggers?: Array<object> }} [params.checkBreakage]
 * @param {object} [params.checkResult]
 * @returns {{ forceBreak: boolean, triggerId: string|null, reason: string|null }}
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
 * Apply usage and (if planned/decided broken) on-break side effects to a single
 * owned tool item. Returns the evidence entry recorded against the run.
 *
 * `applyUsage` is a no-op for non-`limitedUses` modes (see {@link Tool#applyUsage}),
 * so presence-only tools never stamp an item flag.
 *
 * @param {object} params
 * @param {Tool} params.tool
 * @param {object} params.actor
 * @param {object} params.item
 * @param {object} [params.planned]                - prior plan entry for this item, if any
 * @param {Function} [params.evaluateExpression]
 * @param {Function} [params.buildItemRef]         - (actor, item) => itemRef
 * @param {Function} [params.createReplacement]    - async ({ actor, componentId }) => void
 * @returns {Promise<object>} evidence entry
 */
export async function applyToolUsageAndBreakage({
  tool,
  actor,
  item,
  planned,
  evaluateExpression,
  buildItemRef,
  createReplacement,
} = {}) {
  await tool.applyUsage(item);
  const itemRef = typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null;
  // `applyUsage` has already incremented the persisted `timesUsed`, so the
  // breakage decision must read the POST-increment count via `Tool#evaluateBreakage`
  // (its documented contract). Using the plan-phase projector `evaluateToolBreakagePlan`
  // here would add a second +1 on top of the applied increment and break `limitedUses`
  // tools one use early (e.g. maxUses:2 breaking on the first craft).
  const breakageResult = planned
    ? { mode: planned.mode, broken: planned.broken, evidence: planned.evidence }
    : await tool.evaluateBreakage({ actor, item, evaluateExpression });
  const entry = {
    componentId: tool.componentId,
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

/**
 * Create a reusable tool breakage plan/apply pair.
 *
 * Mirrors the prior gathering-only implementation but with all surface-specific
 * resolution injected, so the crafting engine and the gathering engine share one
 * breakage runtime.
 *
 * @param {object} deps
 * @param {Function} deps.matchTools                  - ({ actor, system, task, tools }) => { items: [{ tool, item }], missing }
 * @param {Function} deps.buildItemRef                - (actor, item) => itemRef
 * @param {Function} [deps.resolveReplacementSource]  - ({ componentId, system }) => source|null
 * @param {Function} [deps.resolveItemUuid]            - async (uuid) => Item|null
 * @param {Function} [deps.evaluateExpression]
 * @param {Function} [deps.planKey]                   - ({ actor, task }) => string (defaults to actor:task)
 * @returns {{ plan: Function, apply: Function }}
 */
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

  // Resolve the system's breakage authority (issue 419). Unknown / missing →
  // `toolSpecific` (today's behaviour).
  function resolveAuthority(system) {
    return system?.toolBreakage?.authority === 'checkDriven' ? 'checkDriven' : 'toolSpecific';
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
      // Under checkDriven authority, the active check decides whether ALL required
      // tools break for this attempt; per-tool modes are ignored except `immune`.
      const decision =
        authority === 'checkDriven'
          ? evaluateCheckBreakage({ checkBreakage, checkResult })
          : { forceBreak: false, triggerId: null, reason: null };
      const checkId = checkResult?.data?.checkId ?? checkResult?.checkId ?? null;
      const planned = [];
      for (const { tool, item, virtual, breakable } of matched.items) {
        const model = tool instanceof Tool ? tool : Tool.fromJSON(tool);
        // A presence-only match (durable-identity gate, issue 557) has an owned item
        // but must NOT be consumed or destroyed; treat it like a virtual match.
        const spared = breakable === false && !virtual && !!item;
        // Virtual-present (canvas-tool) matches have no owned item to break/use.
        // Under checkDriven both are still recorded as skipped evidence.
        if (virtual || !item || spared) {
          if (authority === 'checkDriven') {
            planned.push({
              componentId: model.componentId,
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
            // Immune tools never break and are recorded as skipped-immune.
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
        // A presence-only match (durable-identity gate, issue 557) has an owned item
        // but must NOT be consumed or destroyed; treat it like a virtual match.
        const spared = breakable === false && !virtual && !!item;
        // Virtual-present (canvas-tool) matches have no owned item to break/use;
        // under checkDriven both are recorded as skipped evidence (not mutated).
        if (virtual || !item || spared) {
          if (authority === 'checkDriven') {
            evidence.push({
              componentId: tool.componentId,
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
        const isImmune = tool.checkBreakable === false || tool.breakage?.mode === 'immune';
        let planned = plannedByItem.get(stringOrEmpty(itemRef?.itemUuid));
        let extra = {};
        if (authority === 'checkDriven') {
          if (isImmune) {
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
