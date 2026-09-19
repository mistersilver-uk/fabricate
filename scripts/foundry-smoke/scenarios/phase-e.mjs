/**
 * Phase E: the player-facing craft walk. Its two body halves share one `try`, so a throw in either
 * records the same `craft-item-phase` failure and the same `craft-failure` frame. It skips after a
 * tolerated D0 teardown (issue #807): the shared app cannot open on a torn-down page.
 */

import { runPhaseEAlchemyAndJournal } from './phase-e-alchemy-journal.mjs';
import { runPhaseEInventoryGatheringAndCrafting } from './phase-e-inventory-gathering-crafting.mjs';

export default {
  id: 'phase-e',
  phase: 'phase-E',
  section: null,
  publishes: [],
  consumes: [
    'cleanup',
    'craftingSetup',
    'executionFixtures',
    'alchemyFixtures',
    'd0TeardownTolerated',
  ],
  async run(ctx) {
    const { page, results, screenshot, shouldRunScreenshotPhase } = ctx;
    if (!shouldRunScreenshotPhase('phase-E')) {
      // Scoped `screenshots` run whose target set has no phase-E (player/craft/ journal) label.
      process.stdout.write('Phase E: skipped (screenshots scope has no phase-E labels).\n');
      results.steps.push({ step: 'craft-item-phase', passed: true, skipped: true });
    } else if (page.isClosed?.() || ctx.shared.d0TeardownTolerated) {
      process.stdout.write('Phase E: skipped (renderer teardown tolerated in Phase D0).\n');
      results.steps.push({ step: 'craft-item-phase', passed: true, skipped: true });
    } else {
      process.stdout.write('Phase E: Crafting a Healing Potion...\n');
      try {
        const { appShell } = await runPhaseEInventoryGatheringAndCrafting(ctx);
        await runPhaseEAlchemyAndJournal(ctx, { appShell });
        results.steps.push({ step: 'craft-item-phase', passed: true });
        process.stdout.write('Phase E complete.\n');
      } catch (error) {
        results.steps.push({ step: 'craft-item-phase', passed: false, error: error.message });
        process.stderr.write(`Phase E failed: ${error.message}\n`);
        // Issue #807: wrap the failure screenshot (mirroring journal-failure).
        try {
          await screenshot(page, 'craft-failure');
        } catch {
          /* page may already be gone — a gone-page screenshot must not throw */
        }
      }
    }
  },
};
