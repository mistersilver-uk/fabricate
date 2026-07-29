#!/usr/bin/env node
/**
 * Fail on ANY Svelte compiler warning, across EVERY component — not just the reachable ones.
 *
 * WHY THIS EXISTS ALONGSIDE `onwarn`
 * ----------------------------------
 * `svelte.config.js` carries an `onwarn` hook, so `npm run build` fails on a warning too, and
 * that is the fast local signal. It is not sufficient on its own: a Vite build compiles the
 * ENTRY GRAPH, and this repository has components that nothing under `src/` imports
 * (`GatheringTravelView.svelte`, issue 927). A warning in one of those would never reach
 * `onwarn`, and a gate that silently skips files is the failure mode this whole static-analysis
 * programme exists to remove — the same graph-blindness that made an earlier baseline in it
 * unsound.
 *
 * So this walks the component tree directly, with `scripts/lib/svelteComponentFiles.js` — the
 * same walker `compare-svelte-render.mjs` and `tests/prettier-svelte-scope.test.js` use, so
 * "every component" means one thing across every gate — and compiles each one with the build's
 * own options, read out of `svelte.config.js` by `scripts/lib/svelteCompilerWarnings.js`. That
 * shared read is what makes a disagreement between this and `onwarn` diagnostic: it can only be
 * graph reachability, never drift in `compilerOptions`.
 *
 * One seam sits outside that read and is closed by assertion instead: `emitCss` is a
 * `vite-plugin-svelte` option, and `emitCss: false` makes the plugin drop every
 * `css_unused_selector` before `onwarn` ever sees it — the build half would go quiet on a class
 * this sweep still reports. `tests/svelte-warning-scope.test.js` pins it at its default.
 *
 * A DISAGREEMENT WITH `onwarn` IS A BUG HERE, NOT A REASON TO OVERRIDE IT. If this sweep is
 * clean while the build fails, the sweep has stopped seeing something; repair it rather than
 * treating "exhaustive" as automatically "authoritative".
 *
 * USAGE
 *   node scripts/check-svelte-warnings.mjs [--root <dir>] [--json]
 *
 *   --root <dir>   source root to walk (default: `src`, resolved against the repository root).
 *                  Exists so `tests/svelte-warning-scope.test.js` can drive the REAL command
 *                  against a fixture tree and prove it both catches a warning and passes a
 *                  clean one — a gate whose detection is never exercised is one assertion away
 *                  from vacuous.
 *   --json         emit the findings as JSON instead of the human report.
 *
 * EXIT CODES
 *   0   every component compiled with no warning
 *   1   at least one warning (or a component that failed to compile)
 *   2   the run could not check — bad arguments, an unreadable root, or NO COMPONENTS FOUND.
 *       Finding nothing is a failure, not a clean sweep: a walker that stopped recursing, or a
 *       root that moved, would otherwise report success while inspecting zero files.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatWarning,
  formatWarningSummary,
  scanComponentWarnings,
} from './lib/svelteCompilerWarnings.js';
import { listSvelteComponents, toRepositoryPaths } from './lib/svelteComponentFiles.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const options = { root: 'src', json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--root': {
        options.root = argv[++index];
        break;
      }
      case '--json': {
        options.json = true;
        break;
      }
      default: {
        throw new Error(`unknown argument: ${arg}`);
      }
    }
  }
  if (!options.root) throw new Error('--root needs a directory');
  return options;
}

/**
 * Every component under `root`, as paths relative to `root`'s own parent chain.
 *
 * Reported relative to the repository root so a finding names the file the way the rest of the
 * tooling does, and reads identically on Windows and on the CI runner.
 */
function collectComponents(root) {
  const absoluteRoot = path.resolve(repoRoot, root);
  return {
    absoluteRoot,
    files: toRepositoryPaths(repoRoot, listSvelteComponents(absoluteRoot)),
  };
}

/** The human-readable report: the summary line, then one line per warning, then the verdict. */
function printReport(result) {
  console.log(formatWarningSummary(result));
  for (const warning of result.warnings) console.log(formatWarning(warning));
  if (result.warnings.length === 0) return;
  console.error(
    `\ncheck-svelte-warnings: ${result.warnings.length} Svelte compiler warning(s) across` +
      ` ${result.files} component(s). The bar is zero. Fix the code rather than suppressing the` +
      ' warning: five of the seven this gate was installed for were real accessibility defects' +
      ' and one was a focus ring the compiler had silently pruned out of every shipped build' +
      ' (issue 924).'
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  let components;
  try {
    components = collectComponents(options.root);
  } catch (error) {
    console.error(`check-svelte-warnings: cannot walk "${options.root}": ${error.message}`);
    return 2;
  }

  if (components.files.length === 0) {
    console.error(
      `check-svelte-warnings: found no *.svelte under ${components.absoluteRoot}. A run that` +
        ' compiles nothing cannot detect a warning, so it fails rather than reporting clean.'
    );
    return 2;
  }

  const result = scanComponentWarnings({
    files: components.files,
    readSource: (file) => readFileSync(path.join(repoRoot, file), 'utf8'),
  });

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printReport(result);

  return result.warnings.length > 0 ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`check-svelte-warnings: ${error.message}`);
  console.error('usage: node scripts/check-svelte-warnings.mjs [--root <dir>] [--json]');
  process.exitCode = 2;
}
