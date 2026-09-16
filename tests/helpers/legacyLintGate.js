/**
 * THE GATE AS IT STOOD BEFORE THE GLOB, FROZEN (issue #1660).
 *
 * `npm run lint` and `npm run format:check` used to name every file they covered. That list is
 * gone — both are globs now — so this is the only record of what the gate actually reached, and
 * `tests/lint-coverage.test.js` uses it to prove the new configuration is a SUPERSET rather than
 * a differently-shaped hole.
 *
 * WHY THE ARGV IS FROZEN HERE AND NOT READ FROM `package.json`
 * -----------------------------------------------------------
 * It cannot be read from `package.json` any more; that is the whole change. And a fixture derived
 * from the NEW configuration would prove nothing at all — it would assert that the new gate covers
 * what the new gate covers. So the argv below is a verbatim copy of the two scripts as they stood
 * at the commit this landed on, and `LEGACY_GATE_FILES` is what that argv actually selected when
 * it was run there.
 *
 * The pair is self-verifying rather than trusted: `deriveLegacyGateFiles()` expands the frozen
 * argv against the working tree, and the test asserts it still yields exactly `LEGACY_GATE_FILES`.
 * A file the legacy gate named that has since been deleted therefore fails HERE, loudly, instead
 * of quietly shrinking the set the superset assertion is measured against.
 *
 * DO NOT UPDATE THIS FILE TO MAKE A TEST PASS. It is a historical record; the only legitimate edit
 * is removing an entry whose file genuinely no longer exists, in the same commit that deletes it.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { byCodePoint } from './ratchetBaseline.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `package.json`'s `lint` script, verbatim, immediately before it became `eslint .`. */
export const LEGACY_LINT_ARGV =
  "eslint \"src/{models,utils,integrations,config,migration,canvas,systems}/**/*.js\" src/toolBreakageRuntime.js scripts/lib/semver.js scripts/lib/releaseTags.js scripts/lib/publishGuard.js scripts/lib/promoteGuards.js scripts/lib/hotfixPreflight.js scripts/lib/forwardPortProvenance.js scripts/lib/foundrySmokeSignal.js scripts/lib/managerLayoutGuards.js scripts/lib/managerRailEntries.js scripts/lib/screenshotCaptureMap.js scripts/lib/foundryCanvasReadiness.js scripts/lib/foundryRunIdentity.js scripts/lib/foundryRunBudget.js scripts/lib/foundryTourSuppression.js scripts/lib/agentModelTiers.js scripts/lib/foundryDataPreparation.js scripts/lib/worldScopeIdentitySmoke.js scripts/lib/smokeSectionFixture.js scripts/lib/svelteComponentFiles.js scripts/lib/svelteCompilerWarnings.js scripts/release-s3.js scripts/validate-release-tag.mjs scripts/hotfix-preflight.mjs scripts/forward-port-provenance.mjs scripts/compare-svelte-render.mjs scripts/check-svelte-warnings.mjs scripts/lib/zipRead.js scripts/lib/foundryImagePin.js scripts/lib/foundryChromeCache.js scripts/lib/foundryChromeSpec.js scripts/lib/designSystemPrimitives.js scripts/lib/componentImporters.js scripts/lib/viewLabCases.js scripts/lib/viewLabLayoutAssertion.js scripts/view-lab-chrome.mjs scripts/view-lab-screenshots.mjs scripts/lib/viewLabIndex.js scripts/view-lab-index.mjs scripts/lib/foundrySmokeArms.js scripts/lib/foundryBrowserBoot.js scripts/foundry-version-assert.mjs scripts/visual-parity/extract.mjs scripts/visual-parity/compare.mjs scripts/visual-parity/inventory.mjs scripts/visual-parity/lib/page-runtime.js scripts/visual-parity/lib/schema.js scripts/visual-parity/lib/inventory.js scripts/visual-parity/lib/subject.js scripts/lib/resolveExecutable.js scripts/lib/benchmarkBaselines.js scripts/lib/benchmarkEnvelope.js scripts/lib/benchmarkStats.js scripts/lib/benchmarkRunner.js scripts/benchmark-performance.mjs scripts/benchmark-compare.mjs scripts/lib/foundryPerfMeasurements.js scripts/lib/foundryPerfSeed.js scripts/lib/foundryPerfPreflight.js scripts/lib/foundryPerfRecord.js scripts/lib/foundryPerfCapture.js scripts/lib/foundryPerfScenarios.js scripts/foundry-perf-run.mjs scripts/visual-parity/lib/view-lab.js scripts/lib/screenshotEvidenceMatching.js scripts/lib/fontAwesomeBundle.js scripts/lib/fontAwesomeCompatibility.js scripts/lib/fontAwesomeSmokeExpectations.js scripts/lib/iconLicensing.js scripts/foundry-icon-bundle-assert.mjs scripts/generate-icon-catalogue.mjs scripts/lib/docsScreenshotMap.js scripts/docs-screenshots.mjs scripts/lib/webpFrames.js scripts/lib/docsScreenshotRun.js scripts/lib/stylesheetLiveClasses.js scripts/lib/stylesheetSelectorCensus.js scripts/stylesheet-selector-census.mjs scripts/lib/releaseZipChunks.js --max-warnings=0";

/** `package.json`'s `format:check` script, verbatim, immediately before it became `prettier --check .`. */
export const LEGACY_FORMAT_ARGV =
  "prettier --check \"src/**/*.svelte\" \"src/{models,utils,integrations,config,migration,canvas,systems}/**/*.js\" src/toolBreakageRuntime.js scripts/lib/semver.js scripts/lib/releaseTags.js scripts/lib/publishGuard.js scripts/lib/promoteGuards.js scripts/lib/hotfixPreflight.js scripts/lib/forwardPortProvenance.js scripts/lib/foundrySmokeSignal.js scripts/lib/managerLayoutGuards.js scripts/lib/managerRailEntries.js scripts/lib/screenshotCaptureMap.js scripts/lib/foundryCanvasReadiness.js scripts/lib/foundryRunIdentity.js scripts/lib/foundryRunBudget.js scripts/lib/foundryTourSuppression.js scripts/lib/agentModelTiers.js scripts/lib/foundryDataPreparation.js scripts/lib/worldScopeIdentitySmoke.js scripts/lib/smokeSectionFixture.js scripts/lib/svelteComponentFiles.js scripts/lib/svelteCompilerWarnings.js scripts/release-s3.js scripts/validate-release-tag.mjs scripts/hotfix-preflight.mjs scripts/forward-port-provenance.mjs scripts/compare-svelte-render.mjs scripts/check-svelte-warnings.mjs scripts/lib/zipRead.js scripts/lib/foundryImagePin.js scripts/lib/foundryChromeCache.js scripts/lib/foundryChromeSpec.js scripts/lib/designSystemPrimitives.js scripts/lib/componentImporters.js scripts/lib/viewLabCases.js scripts/lib/viewLabLayoutAssertion.js scripts/view-lab-chrome.mjs scripts/view-lab-screenshots.mjs scripts/lib/viewLabIndex.js scripts/view-lab-index.mjs scripts/lib/foundrySmokeArms.js scripts/lib/foundryBrowserBoot.js scripts/foundry-version-assert.mjs scripts/visual-parity/extract.mjs scripts/visual-parity/compare.mjs scripts/visual-parity/inventory.mjs scripts/visual-parity/lib/page-runtime.js scripts/visual-parity/lib/schema.js scripts/visual-parity/lib/inventory.js scripts/visual-parity/lib/subject.js scripts/lib/resolveExecutable.js scripts/lib/benchmarkBaselines.js scripts/lib/benchmarkEnvelope.js scripts/lib/benchmarkStats.js scripts/lib/benchmarkRunner.js scripts/benchmark-performance.mjs scripts/benchmark-compare.mjs scripts/lib/foundryPerfMeasurements.js scripts/lib/foundryPerfSeed.js scripts/lib/foundryPerfPreflight.js scripts/lib/foundryPerfRecord.js scripts/lib/foundryPerfCapture.js scripts/lib/foundryPerfScenarios.js scripts/foundry-perf-run.mjs scripts/visual-parity/lib/view-lab.js scripts/lib/screenshotEvidenceMatching.js scripts/lib/fontAwesomeBundle.js scripts/lib/fontAwesomeCompatibility.js scripts/lib/fontAwesomeSmokeExpectations.js scripts/lib/iconLicensing.js scripts/foundry-icon-bundle-assert.mjs scripts/generate-icon-catalogue.mjs scripts/lib/docsScreenshotMap.js scripts/docs-screenshots.mjs scripts/lib/webpFrames.js scripts/lib/docsScreenshotRun.js scripts/lib/stylesheetLiveClasses.js scripts/lib/stylesheetSelectorCensus.js scripts/stylesheet-selector-census.mjs scripts/lib/releaseZipChunks.js eslint.config.js";

/**
 * The 360 files `LEGACY_LINT_ARGV` selected, POSIX, sorted.
 *
 * Captured by running that exact command with `--format json` and reading back the `filePath` of
 * every result — ESLint's own answer to "what did you lint", not a re-implementation of its glob
 * handling.
 *
 * A TEXT FILE rather than a JavaScript array, for the same SonarCloud reason as `eslint-debt.txt`:
 * three hundred and sixty `'src/…',` literals are a long run of near-identical tokens, and Sonar
 * does not analyse `.txt`. It also matches `tests/comment-share-ledger.txt` and its two siblings,
 * which are ledgers of the same shape.
 */
export const LEGACY_GATE_FILES = readFileSync(
  new URL('../legacy-lint-gate.txt', import.meta.url),
  'utf8'
)
  .split('\n')
  .filter((line) => line.trim() !== '');

/**
 * Expand a frozen legacy argv against the working tree.
 *
 * DELIBERATELY NOT A GENERAL GLOB ENGINE. It handles the three token shapes the two frozen
 * commands actually contain and THROWS on anything else, because the alternative — a permissive
 * matcher that shrugs at a shape it does not know — fails in the silent direction: an unrecognised
 * pattern contributes nothing, the derived set comes out smaller, and the superset assertion this
 * feeds gets easier to pass. The shapes are:
 *
 *   1. `dir/{a,b,c}/**\/*.ext` — a braced set of directories, walked recursively.
 *   2. `dir/**\/*.ext` — one directory, walked recursively.
 *   3. A literal path with no glob character.
 *
 * Options (anything starting with `-`) are skipped. So is the tool name in first position.
 *
 * @param {string} argv the frozen command text
 * @returns {string[]} repository-relative POSIX paths, sorted and de-duplicated
 */
export function deriveLegacyGateFiles(argv) {
  const [, ...tokens] = argv.split(/\s+/).filter(Boolean);
  const found = new Set();

  for (const raw of tokens) {
    if (raw.startsWith('-')) continue;
    const token = raw.replaceAll('"', '');

    const braced = /^(?<root>[\w./-]+)\/\{(?<dirs>[\w,-]+)\}\/\*\*\/\*(?<ext>\.\w+)$/u.exec(token);
    if (braced) {
      for (const dir of braced.groups.dirs.split(',')) {
        for (const file of walk(`${braced.groups.root}/${dir}`, braced.groups.ext)) found.add(file);
      }
      continue;
    }

    const recursive = /^(?<root>[\w./-]+)\/\*\*\/\*(?<ext>\.\w+)$/u.exec(token);
    if (recursive) {
      for (const file of walk(recursive.groups.root, recursive.groups.ext)) found.add(file);
      continue;
    }

    if (/[*?{}[\]]/u.test(token)) {
      throw new Error(
        `the frozen-argv expander does not know the pattern ${token}. Teach it that shape — ` +
          'ignoring one would silently shrink the set the superset assertion is measured against.'
      );
    }
    found.add(token);
  }

  return [...found].sort(byCodePoint);
}

/** Every file under `directory` ending in `extension`, repository-relative and POSIX. */
function walk(directory, extension) {
  const absolute = path.join(REPOSITORY_ROOT, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) =>
      [directory, path.relative(absolute, path.join(entry.parentPath, entry.name))]
        .join('/')
        .split(String.fromCodePoint(92))
        .join('/')
    );
}
