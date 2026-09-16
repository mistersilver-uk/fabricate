/**
 * worldScopeIdentitySmoke.js
 *
 * The `1.30.0` WORLD-SCOPE IDENTITY-FLAG SMOKE fixture (issue 1363, acceptance criterion 6c).
 *
 * ## Why this section exists when every other runtime observation is green without it
 *
 * A stale `flags.fabricate.fabricate.roles[<systemId>].componentId` names an id absent from the
 * re-keyed candidate set, so tier 1 returns null and resolution falls through to tier 3 — the
 * source-reference tier, which the `1.30.0` change does not touch. "Owned copies still resolve",
 * "a craft, a salvage and a gather succeed" and "every Manager browser lists the same entities"
 * are therefore ALL TRUE with `remapWorldScopeIdentityFlags` never written.
 *
 * **Only an assertion on the FLAG VALUE ITSELF carries falsifiability**, and that is what this
 * section asserts: after the repair, `roles[<systemId>].componentId` equals the NEW id.
 *
 * Deleting the source world Item does NOT isolate tiers 1-2: `getItemSourceReferences` reads only
 * the owned copy's own `uuid`, `compendiumSource` and `duplicateSource`, and the definition index
 * is built from the corpus alone, so tier 3 still answers. Where this section asserts RESOLUTION
 * rather than a flag value it does so on an owned copy carrying no source reference present in
 * any candidate definition AND a name matching no candidate's name — both halves, because the
 * SALVAGE path falls through to `matchComponentByName` with no identity-flag suppression, so a
 * same-named copy resolves there regardless.
 *
 * ## Why the logic is HERE rather than inline in the harness
 *
 * `scripts/**` counts against the SonarCloud new-code duplication gate exactly as `src/` does,
 * and — more importantly — nothing inside `scripts/foundry-test-run.mjs` can be executed by a
 * unit test: it exports nothing and runs `main()` on import. The SEED PLAN and the EXPECTATIONS
 * are pure data derived from one input, so they are computed here and asserted by
 * `tests/world-scope-identity-smoke-plan.test.js` without booting Chromium. What stays in the
 * harness is the Foundry edge: creating documents, calling the repair, and reading flags back.
 */

/** The doubly-nested durable-flag container every role leaf lives under. */
const FLAG_NAMESPACE = 'fabricate';

/**
 * Build the seed plan and the expectations for one world-scope identity smoke run.
 *
 * PURE. Given the ids the harness has already created in the world, it answers exactly what to
 * write and exactly what must be true afterwards, so the harness never decides either.
 *
 * @param {object} options
 * @param {string} options.systemId The crafting system the owned copies belong to.
 * @param {string} options.oldComponentId The id the corpus held BEFORE the re-key.
 * @param {string} options.newComponentId The id the world entity claimed.
 * @param {string} options.oldToolId
 * @param {string} options.newToolId
 * @param {string} [options.craftingRunId]
 * @param {string} [options.salvageRunId]
 * @param {string} [options.gatheringRunId]
 * @returns {{rekeyMap: object, componentFlag: object, toolFlag: object, legacyScalar: object,
 *   craftingRuns: object, salvageRuns: object, gatheringRuns: object, alchemyDeadEnds: object,
 *   expectations: object}}
 */
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
 * it: component ids sorted LEXICALLY, joined `id:count` with `|`.
 *
 * A GUARDED MIRROR — `tests/world-scope-identity-smoke-plan.test.js` pins it against the shipped
 * helper — because `scripts/**` must not import from `src/**`.
 *
 * @param {Record<string, number>} multiset
 * @returns {string}
 */
export function canonicalKey(multiset) {
  return Object.entries(multiset)
    .filter(([id, count]) => id && Number.isFinite(count) && count > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([id, count]) => `${id}:${Math.trunc(count)}`)
    .join('|');
}

/**
 * The flag reads the harness performs, as `(key, bare)` pairs, so the assertion list and the
 * seed list cannot drift apart.
 *
 * @param {ReturnType<typeof planWorldScopeIdentitySmoke>} plan
 * @returns {Array<{key: string, bare: boolean}>}
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
