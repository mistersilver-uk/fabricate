/**
 * Run the startup housekeeping passes, isolating each one's failure (issue 970).
 *
 * These passes exist to tidy state that names deleted content — runs whose recipe
 * or system is gone, learned entries for a deleted recipe, stale preferences. None
 * of them is a precondition for Fabricate working, but all of them WRITE, so any
 * can reject.
 *
 * Before this guard a single rejection propagated out of `Fabricate#initialize`,
 * `ready` was never set, and every facade method then threw through
 * `_requireReady()` for the rest of the session — while the ready hook's remaining
 * steps (world-time processing and the flag auto-stamps) were skipped too. One
 * stale entry Foundry declined to clean took the whole module down for that client.
 *
 * A failure is reported and the remaining passes still run: they are independent,
 * and a world that cannot clean its salvage runs can still clean its learned
 * recipes.
 *
 * @param {Array<[string, () => Promise<unknown>]>} passes Labelled thunks, run in order.
 * @param {object} [options]
 * @param {(message: string, error: unknown) => void} [options.log] Failure reporter.
 * @returns {Promise<string[]>} The labels of the passes that failed, in order.
 */
export async function runStartupMaintenance(passes, { log = console.error } = {}) {
  const failed = [];
  for (const [label, run] of passes || []) {
    try {
      await run();
    } catch (error) {
      failed.push(label);
      log(`Fabricate | Startup cleanup failed for ${label}; continuing.`, error);
    }
  }
  return failed;
}
