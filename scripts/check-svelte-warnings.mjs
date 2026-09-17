#!/usr/bin/env node
/** Fail on any Svelte compiler warning, across every component — not just the reachable ones. */
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

/** Every component under `root`, as paths relative to `root`'s own parent chain. */
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
