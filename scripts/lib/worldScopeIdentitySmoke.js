/** The `1.30.0` world-scope identity-flag smoke fixture (issue 1363, acceptance criterion 6c). */

/** The doubly-nested durable-flag container every role leaf lives under. */
const FLAG_NAMESPACE = 'fabricate';

/** Build the seed plan and the expectations for one world-scope identity smoke run. */
export function planWorldScopeIdentitySmoke({
  systemId,
  oldComponentId,
  newComponentId,
  oldToolId,
  newToolId,
  craftingRunId = 'smoke-crafting-run',
  salvageRunId = 'smoke-salvage-run',
  gatheringRunId = 'smoke-gathering-run',
}) {
  for (const [name, value] of Object.entries({
    systemId,
    oldComponentId,
    newComponentId,
    oldToolId,
    newToolId,
  })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`worldScopeIdentitySmoke: ${name} is required`);
    }
  }
  if (oldComponentId === newComponentId || oldToolId === newToolId) {
    // A map whose image equals its keys proves nothing: the assertions below would pass with the
    // repair never written. The migration itself refuses such a map for the same reason.
    throw new TypeError('worldScopeIdentitySmoke: the old and new ids must DIFFER');
  }

  const rekeyMap = {
    [systemId]: {
      components: { [oldComponentId]: newComponentId },
      tools: { [oldToolId]: newToolId },
    },
  };

  const run = (id, extra) => ({
    id,
    craftingSystemId: systemId,
    status: 'inProgress',
    ...extra,
  });

  return {
    rekeyMap,
    /** `roles[<systemId>].componentId` on an owned copy, at the DOUBLY-nested depth. */
    componentFlag: { key: `roles.${systemId}.componentId`, value: oldComponentId },
    /** `roles[<systemId>].toolId` on an owned tool copy. */
    toolFlag: { key: `roles.${systemId}.toolId`, value: oldToolId },
    /**
     * The LEGACY FLAT SCALAR, which is system-less. This map names the old id in exactly ONE
     * system, so the narrow whole-corpus tie-break is decidable and it must be remapped.
     */
    legacyScalar: { key: 'componentId', value: oldComponentId },
    craftingRuns: {
      key: 'craftingRuns',
      value: {
        active: {
          [craftingRunId]: run(craftingRunId, {
            recipeId: 'smoke-recipe',
            steps: [
              {
                requirements: [{ componentId: oldComponentId, quantity: 1 }],
                toolIds: [oldToolId],
              },
            ],
          }),
        },
        history: [],
      },
    },
    salvageRuns: {
      key: 'salvageRuns',
      value: {
        active: { [salvageRunId]: run(salvageRunId, { componentId: oldComponentId }) },
        history: [],
      },
    },
    /** The SINGLE-scope depth. A pass that assumes one depth silently misses the other. */
    gatheringRuns: {
      key: 'gatheringRuns',
      bare: true,
      value: {
        active: {
          [gatheringRunId]: run(gatheringRunId, {
            environmentId: 'e',
            taskId: 't',
            toolIds: [oldToolId],
          }),
        },
        history: [],
      },
    },
    /**
     * ONE recorded dead end whose re-key CHANGES THE LEXICAL ORDER of its component ids, so a
     * textual substitution produces a key the reader can never match again.
     */
    alchemyDeadEnds: {
      key: 'alchemyDeadEnds',
      value: { [systemId]: [canonicalKey({ [oldComponentId]: 2, 'zz-other': 1 })] },
    },
    expectations: {
      componentFlag: newComponentId,
      toolFlag: newToolId,
      legacyScalar: newComponentId,
      craftingRunComponentId: newComponentId,
      craftingRunToolId: newToolId,
      salvageRunComponentId: newComponentId,
      gatheringRunToolId: newToolId,
      /** REBUILT and RE-SORTED, never substituted. */
      alchemyDeadEndKey: canonicalKey({ [newComponentId]: 2, 'zz-other': 1 }),
      runIds: { craftingRunId, salvageRunId, gatheringRunId },
    },
  };
}

/**
 * The canonical alchemy signature key, spelled the way `src/utils/alchemySignatureKey.js` spells
 * it: component ids sorted lexically, joined `id:count` with `|`.
 */
export function canonicalKey(multiset) {
  return Object.entries(multiset)
    .filter(([id, count]) => id && Number.isFinite(count) && count > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([id, count]) => `${id}:${Math.trunc(count)}`)
    .join('|');
}

/**
 * The flag reads the harness performs, as `(key, bare)` pairs, so the assertion list and the seed
 * list cannot drift apart.
 */
export function seededFlagPaths(plan) {
  return [
    plan.componentFlag,
    plan.toolFlag,
    plan.legacyScalar,
    plan.craftingRuns,
    plan.salvageRuns,
    plan.gatheringRuns,
    plan.alchemyDeadEnds,
  ].map((entry) => ({ key: entry.key, bare: entry.bare === true }));
}

/** The Foundry flag namespace both depths sit under. */
export const WORLD_SCOPE_SMOKE_FLAG_NAMESPACE = FLAG_NAMESPACE;
