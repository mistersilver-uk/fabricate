/**
 * Phase D0's world-scope identity remap check (acceptance criterion 6c) and its fixture trio. It is
 * not a `D0_SKIPPABLE_SECTIONS` entry: it always runs, and it is the only arm of criterion 6 that
 * can fail on a live world.
 */

import { runFixturedScreenshotSection } from '../../lib/smokeSectionFixture.js';
import {
  WORLD_SCOPE_SMOKE_FLAG_NAMESPACE,
  planWorldScopeIdentitySmoke,
  seededFlagPaths,
} from '../../lib/worldScopeIdentitySmoke.js';

/**
 * Seed the pre-repair world state acceptance criterion 6c describes: an owned copy stamped with a
 * role flag naming the old id, the legacy flat scalar, one in-flight run of each kind at both flag
 * depths, one recorded alchemy dead end, and the persisted re-key map that drives the repair.
 */
async function setupWorldScopeIdentityFixture(page, { systemId, actorId }) {
  const plan = planWorldScopeIdentitySmoke({
    systemId,
    oldComponentId: 'zzz-smoke-old-component',
    newComponentId: 'aaa-smoke-new-component',
    oldToolId: 'zzz-smoke-old-tool',
    newToolId: 'aaa-smoke-new-tool',
  });
  const seeded = seededFlagPaths(plan);
  return page.evaluate(
    async ({ plan, seeded, actorId, namespace }) => {
      const actor = game.actors.get(actorId);
      if (!actor) throw new Error(`world-scope identity fixture requires actor ${actorId}`);
      const item = actor.items.contents[0];
      if (!item) throw new Error('world-scope identity fixture requires one owned item');

      const before = {
        rekeyMap: game.settings.get('fabricate', 'worldScopeRekeyMap'),
        actorFlags: {},
        itemFlags: {},
      };
      const readBack = (document, key, bare) =>
        document.getFlag(namespace, bare ? key : `fabricate.${key}`) ?? null;
      for (const entry of seeded) {
        const target =
          entry.key.startsWith('roles.') || entry.key === 'componentId'
            ? 'itemFlags'
            : 'actorFlags';
        const document = target === 'itemFlags' ? item : actor;
        before[target][entry.key] = readBack(document, entry.key, entry.bare);
      }

      const write = (document, entry) =>
        document.setFlag(namespace, entry.bare ? entry.key : `fabricate.${entry.key}`, entry.value);
      await write(item, plan.componentFlag);
      await write(item, plan.toolFlag);
      await write(item, plan.legacyScalar);
      await write(actor, plan.craftingRuns);
      await write(actor, plan.salvageRuns);
      await write(actor, plan.gatheringRuns);
      await write(actor, plan.alchemyDeadEnds);
      await game.settings.set('fabricate', 'worldScopeRekeyMap', plan.rekeyMap);

      return { plan, seeded, actorId, itemId: item.id, before, namespace };
    },
    { plan, seeded, actorId, namespace: WORLD_SCOPE_SMOKE_FLAG_NAMESPACE }
  );
}

/** Run the real repair and assert every FLAG value it must have rewritten. */
async function verifyWorldScopeIdentityRemap(page, { fixture }) {
  const failures = await page.evaluate(
    async ({ fixture }) => {
      const { plan, actorId, itemId, namespace } = fixture;
      const summary = await game.fabricate.remapWorldScopeIdentityFlags();
      if (!summary) return ['the repair reported nothing, so the re-key map was not pending'];

      const actor = game.actors.get(actorId);
      const item = actor?.items?.get(itemId);
      const read = (document, key, bare) =>
        document?.getFlag(namespace, bare ? key : `fabricate.${key}`);
      const expected = plan.expectations;
      const problems = [];
      const check = (label, actual, want) => {
        if (JSON.stringify(actual) !== JSON.stringify(want)) {
          problems.push(
            `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`
          );
        }
      };

      check('roles.componentId', read(item, plan.componentFlag.key, false), expected.componentFlag);
      check('roles.toolId', read(item, plan.toolFlag.key, false), expected.toolFlag);
      check('legacy componentId scalar', read(item, 'componentId', false), expected.legacyScalar);

      const crafting = read(actor, 'craftingRuns', false)?.active?.[expected.runIds.craftingRunId];
      check(
        'craftingRuns requirement componentId',
        crafting?.steps?.[0]?.requirements?.[0]?.componentId,
        expected.craftingRunComponentId
      );
      check('craftingRuns step toolIds', crafting?.steps?.[0]?.toolIds, [
        expected.craftingRunToolId,
      ]);

      const salvage = read(actor, 'salvageRuns', false)?.active?.[expected.runIds.salvageRunId];
      check('salvageRuns componentId', salvage?.componentId, expected.salvageRunComponentId);

      // THE OTHER DEPTH. `gatheringRuns` is written with a bare `setFlag`, so a pass that assumes
      // the doubly-nested depth silently misses it and this assertion is the only thing that sees.
      const gathering = read(actor, 'gatheringRuns', true)?.active?.[
        expected.runIds.gatheringRunId
      ];
      check('gatheringRuns toolIds (single-scope depth)', gathering?.toolIds, [
        expected.gatheringRunToolId,
      ]);

      const [systemId] = Object.keys(plan.rekeyMap);
      check('alchemyDeadEnds', read(actor, 'alchemyDeadEnds', false)?.[systemId], [
        expected.alchemyDeadEndKey,
      ]);
      return problems;
    },
    { fixture }
  );

  if (failures.length > 0) {
    throw new Error(`world-scope identity remap did not rewrite: ${failures.join('; ')}`);
  }
}

/** Remove every flag and setting the fixture wrote, restoring what was there before. */
async function restoreWorldScopeIdentityFixture(page, { fixture }) {
  if (!fixture) return;
  await page.evaluate(
    async ({ fixture }) => {
      const { seeded, actorId, itemId, before, namespace } = fixture;
      const actor = game.actors.get(actorId);
      const item = actor?.items?.get(itemId);
      for (const entry of seeded) {
        const document =
          entry.key.startsWith('roles.') || entry.key === 'componentId' ? item : actor;
        if (!document) continue;
        const key = entry.bare ? entry.key : `fabricate.${entry.key}`;
        const previous = (
          entry.key.startsWith('roles.') || entry.key === 'componentId'
            ? before.itemFlags
            : before.actorFlags
        )[entry.key];
        // Unset first, always.
        await document.unsetFlag(namespace, key);
        if (previous !== null && previous !== undefined) {
          await document.setFlag(namespace, key, previous);
        }
      }
      await game.settings.set('fabricate', 'worldScopeRekeyMap', before.rekeyMap ?? {});
    },
    { fixture }
  );
}

export default {
  id: 'world-scope-identity',
  phase: 'phase-D0',
  section: null,
  publishes: [],
  consumes: ['cleanup', 'craftingSetup'],
  async run(ctx) {
    const { page, results } = ctx;
    const { cleanup, craftingSetup } = ctx.shared;
    await runFixturedScreenshotSection({
      results,
      step: 'world-scope-identity-remap',
      rethrow: true,
      setup: () =>
        setupWorldScopeIdentityFixture(page, {
          systemId: craftingSetup.systemId,
          actorId: cleanup.crafterId,
        }),
      exercise: (fixture) => verifyWorldScopeIdentityRemap(page, { fixture }),
      restore: (fixture) => restoreWorldScopeIdentityFixture(page, { fixture }),
    });
  },
};
