/**
 * The one parameterised setup → exercise → restore lifecycle shared by every fixtured screenshot
 * section of the live-Foundry walk in `scripts/foundry-test-run.mjs` (the Tool Studio section,
 * issue #784, and the GM Knowledge section, issue 785).
 */

/** Run one fixtured capture section: seed, exercise, and always restore. */
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
