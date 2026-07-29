/**
 * KNOWN_UNGATED_SCRIPTS — ratchet baseline for tests/scripts-lint-gate-coverage.test.js.
 *
 * `npm run lint` and `npm run format:check` do not glob `scripts/`; they name each file they
 * cover, one by one. That enumeration is the trap issue #933 was filed about: a script added
 * without a matching entry is linted by nothing, and the miss surfaces at the slowest possible
 * point — SonarCloud, after push. (#932 added two such files; Sonar answered with a BUG and a
 * VULNERABILITY that ESLint would have caught locally.)
 *
 * These are the `scripts/**` files that the `lint` script still does not name. They are
 * ACKNOWLEDGED DEBT, not exemptions, and the guard ratchets in both directions:
 *
 *   - A newly added ungated script is NOT here, so `npm test` fails until it is added to the
 *     `lint`/`format`/`format:check` lists. The gate list can no longer be forgotten silently.
 *   - Gating a file listed here, or deleting it, makes its entry STALE, which the test also
 *     fails on. So this list can only shrink.
 *   - And it cannot quietly grow instead: the test caps its length at MAX_ACKNOWLEDGED_UNGATED,
 *     so writing a new script down here rather than gating it means raising a number in
 *     `tests/scripts-lint-gate-coverage.test.js` — a visible act needing its own justification,
 *     not a one-line append lost in a fifteen-line array.
 *
 * Paths are POSIX (forward slash) always: the test enumerates with `fs.readdirSync`, which yields
 * `lib\zip.js` on Windows and `lib/zip.js` on the `ubuntu-latest` runner, and normalises to POSIX
 * before comparing. A backslash entry here would therefore match nothing and be red EVERYWHERE,
 * not just on one platform — the normalisation is what removes the platform split, and it is
 * applied to the enumeration, which is the side that can actually carry a separator. An entry here
 * is hard to get wrong by accident anyway: a lone `\` in a JS string literal is an escape, so only
 * a written `\\` would trip the guard.
 *
 * The two entries worth naming, because they are why the gate is not simply widened to a glob:
 *
 *   - `scripts/foundry-test-run.mjs` — the Foundry smoke harness, and the real blocker. It reports
 *     844 of the 993 ESLint findings across `scripts/**` at this commit (999 before this change,
 *     which cleared six in `scripts/compare-svelte-render.mjs` — both numbers are correct at their
 *     own commit), and its Phase D0 pins selectors by class, `.nth(N)` index and visible button
 *     text with no unit coverage over any of them.
 *   - `scripts/lib/zip.js` — 6 findings, and the blocker `eslint.config.js` has recorded for
 *     longer. Its autofixes land on the Windows `Compress-Archive` path that builds the published
 *     artefact, again untested.
 *
 * 15 entries, which is also the cap (issue #933 gated four of the previous 19). Do not grow it.
 */
export const KNOWN_UNGATED_SCRIPTS = [
  'scripts/foundry-fetch-systems.mjs',
  'scripts/foundry-setup-data.mjs',
  'scripts/foundry-test-down.mjs',
  'scripts/foundry-test-run.mjs',
  'scripts/foundry-test-up.mjs',
  'scripts/foundry-test.mjs',
  'scripts/foundry/create-mythwright-dnd5e.js',
  'scripts/latest-module-versions.mjs',
  'scripts/lib/zip.js',
  'scripts/release.js',
  'scripts/setup-dev-module.mjs',
  'scripts/ui-pr-screenshot-evidence.mjs',
  'scripts/validate-agent-bindings.mjs',
  'scripts/verify-manager-chunk-split.mjs',
  'scripts/vite-foundry-proxy.js',
];
