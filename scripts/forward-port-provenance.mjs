#!/usr/bin/env node
/**
 * Change-provenance verifier for the forward-port's content gate (issue #1418).
 *
 * Thin CLI over `scripts/lib/forwardPortProvenance.js` — the split mirrors `hotfix-preflight.mjs`
 * over `lib/hotfixPreflight.js`, keeping the testable logic in a `lib/` module while this entry
 * point only wires argv and file reads to a process exit code. See the library module's header for
 * the acceptance predicate, why REST's `merged_at` is the only merged-ness evidence, and why every
 * unverifiable input fails closed.
 *
 * Evidence crosses on ARGV as FILE PATHS, not on stdin. `hotfix-preflight.mjs` reads one stream;
 * this tool needs three independent inputs, and assembling them into one JSON document inside a
 * bash heredoc is a known corruption hazard here. That satisfies what the stdin contract exists for
 * — `javascript:S4036` flags spawning a bare command name resolved through `PATH`, and reading a
 * file is not spawning. This tool runs `git` and calls the API exactly never;
 * `scripts/forward-port-content-gate.sh` collects the evidence into the files it reads.
 *
 *   node scripts/forward-port-provenance.mjs commits.txt diffs/ pulls/ --repository=owner/name
 *
 * ZERO DEPENDENCIES, by design: the content gate provisions Node without running `npm ci`.
 *
 * Exit codes: 0 every commit accounted for, 1 at least one refused, 2 usage error or unverifiable
 *   input (empty, malformed, unreadable, an API error payload, or an unexpected range shape).
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { run } from './lib/forwardPortProvenance.js';

process.exitCode = run(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, 'utf8'),
});
