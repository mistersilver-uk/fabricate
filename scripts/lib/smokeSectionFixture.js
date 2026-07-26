/**
 * smokeSectionFixture.js
 *
 * The one parameterised setup → exercise → restore lifecycle shared by every
 * fixtured screenshot SECTION of the live-Foundry walk in
 * `scripts/foundry-test-run.mjs` (the Tool Studio section, issue #784, and the GM
 * Knowledge section, issue 785).
 *
 * WHY it lives here rather than being copy-adapted per section: SonarCloud counts
 * `scripts/**` exactly like `src/`, and the snapshot/seed/restore scaffold is
 * identical across sections — only the callbacks differ. A second hand-written copy
 * of the try/catch/finally + `results.steps.push` block is new duplicated code and
 * fails the new-code duplication gate, so the scaffold is extracted ONCE and each
 * section supplies its own `setup` / `exercise` / `restore`.
 *
 * The restore runs in a `finally`, which is the load-bearing part: these fixtures
 * write real actor flags, create world Items and delete owned Items in a PERSISTED
 * Foundry world, so a section that fails half-way through must still leave the world
 * exactly as it found it. A skipped restore poisons every later smoke run — including
 * unrelated PRs — because the smoke world is reused.
 *
 * Nothing here imports playwright or Foundry, so
 * `tests/screenshot-capture-scoping.test.js` exercises the same decision logic the
 * harness runs at smoke time without booting Chromium.
 */

/**
 * Run one fixtured capture section: seed, exercise, and ALWAYS restore.
 *
 * The step outcome is recorded on the shared `results.steps` ledger under `step` so a
 * section failure is visible in `summary.json` whether or not it aborts the phase.
 *
 * `rethrow` is the per-section policy for a failure:
 * - `true` (the default, and what the Tool Studio section has always done) aborts the
 *   phase — the section owns behavioural assertions whose failure is a real product
 *   regression that must not be reported as a green run.
 * - `false` records the failed step and lets the walk continue, which is the right
 *   choice for a purely evidential section: losing one section's frames should not
 *   also cost every later section's frames.
 *
 * @param {object} options
 * @param {{steps: {step: string, passed: boolean, error?: string}[]}} options.results
 *   The run's step ledger.
 * @param {string} options.step The step name recorded on that ledger.
 * @param {() => Promise<*>} options.setup Seeds the fixture and returns its handle.
 * @param {(fixture: *) => Promise<void>} options.exercise Drives the walk/captures.
 * @param {(fixture: *) => Promise<void>} options.restore Undoes everything `setup` did.
 *   Receives `null` when `setup` itself threw, so it must tolerate a missing handle.
 * @param {boolean} [options.rethrow=true] Whether a failure aborts the caller.
 * @returns {Promise<{fixture: *, passed: boolean, error: Error|null}>}
 */
export async function runFixturedScreenshotSection({
  results,
  step,
  setup,
  exercise,
  restore,
  rethrow = true,
}) {
  let fixture = null;
  try {
    fixture = await setup();
    await exercise(fixture);
    results?.steps?.push({ step, passed: true });
    return { fixture, passed: true, error: null };
  } catch (error) {
    results?.steps?.push({ step, passed: false, error: error.message });
    if (rethrow) throw error;
    return { fixture, passed: false, error };
  } finally {
    // Deliberately unguarded: a restore that throws must surface, because a silently
    // swallowed restore failure is exactly the leak this whole module exists to stop.
    await restore(fixture);
  }
}
