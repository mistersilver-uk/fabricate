import { Tool } from './models/Tool.js';

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
 */
export function readToolUsage(item) {
  return item?.getFlag?.('fabricate', 'toolUsage')
    ?? item?.getFlag?.('fabricate', 'fabricate.toolUsage')
    ?? globalThis.foundry?.utils?.getProperty?.(item, 'flags.fabricate.toolUsage')
    ?? globalThis.foundry?.utils?.getProperty?.(item, 'flags.fabricate.fabricate.toolUsage')
    ?? { timesUsed: 0 };
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
      replacementComponentId: tool.onBreak.replacementComponentId
    };
  }
  return { action: 'none' };
}

function stringOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value);
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
  createReplacement
} = {}) {
  await tool.applyUsage(item);
  const itemRef = typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null;
  const breakageResult = planned
    ? { mode: planned.mode, broken: planned.broken, evidence: planned.evidence }
    : await evaluateToolBreakagePlan(tool, { actor, item, evaluateExpression });
  const entry = {
    componentId: tool.componentId,
    itemRef,
    mode: breakageResult.mode,
    broken: breakageResult.broken,
    evidence: breakageResult.evidence
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
 * @param {Function} [deps.evaluateExpression]
 * @param {Function} [deps.planKey]                   - ({ actor, task }) => string (defaults to actor:task)
 * @returns {{ plan: Function, apply: Function }}
 */
export function createToolBreakageRuntime({
  matchTools,
  buildItemRef,
  resolveReplacementSource,
  evaluateExpression,
  planKey
} = {}) {
  const pendingPlans = new Map();
  const keyOf = typeof planKey === 'function'
    ? planKey
    : ({ actor, task } = {}) => `${actor?.uuid ?? actor?.id ?? 'actor'}:${task?.id ?? 'task'}`;

  function makeCreateReplacement(actor, system) {
    if (typeof resolveReplacementSource !== 'function') return undefined;
    return async ({ actor: replacementActor, componentId }) => {
      const source = resolveReplacementSource({ componentId, system });
      if (!source || typeof replacementActor?.createEmbeddedDocuments !== 'function') return;
      const itemData = source.toObject?.() ?? {
        name: source.name ?? 'Replacement Item',
        img: source.img ?? 'icons/svg/item-bag.svg',
        type: source.type ?? 'loot',
        system: source.system
          ? globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system }
          : {}
      };
      itemData.system ??= {};
      if (itemData.system.quantity !== undefined) itemData.system.quantity = 1;
      if (source.uuid) {
        globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
      }
      await replacementActor.createEmbeddedDocuments('Item', [itemData]);
    };
  }

  return {
    async plan({ actor, system, task, tools = [] } = {}) {
      const matched = matchTools({ actor, system, task, tools });
      const planned = [];
      for (const { tool, item } of matched.items) {
        const model = tool instanceof Tool ? tool : Tool.fromJSON(tool);
        const breakageResult = await evaluateToolBreakagePlan(model, { actor, item, evaluateExpression });
        const entry = {
          componentId: model.componentId,
          itemRef: typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null,
          mode: breakageResult.mode,
          broken: breakageResult.broken,
          evidence: breakageResult.evidence
        };
        if (breakageResult.broken) {
          entry.onBreak = plannedToolBreakageOutcome(model);
        }
        planned.push(entry);
      }
      pendingPlans.set(keyOf({ actor, task }), planned);
      return planned;
    },

    async apply({ actor, system, task, tools = [] } = {}) {
      const matched = matchTools({ actor, system, task, tools });
      const key = keyOf({ actor, task });
      const plannedByItem = new Map((pendingPlans.get(key) || [])
        .map(entry => [stringOrEmpty(entry?.itemRef?.itemUuid), entry]));
      pendingPlans.delete(key);
      const evidence = [];
      for (const { tool: toolData, item } of matched.items) {
        const tool = toolData instanceof Tool ? toolData : Tool.fromJSON(toolData);
        const itemRef = typeof buildItemRef === 'function' ? buildItemRef(actor, item) : null;
        const planned = plannedByItem.get(stringOrEmpty(itemRef?.itemUuid));
        const entry = await applyToolUsageAndBreakage({
          tool,
          actor,
          item,
          planned,
          evaluateExpression,
          buildItemRef,
          createReplacement: makeCreateReplacement(actor, system)
        });
        evidence.push(entry);
      }
      return evidence;
    }
  };
}
