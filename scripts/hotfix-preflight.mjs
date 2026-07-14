#!/usr/bin/env node
/**
 * Pre-flight collision guard for cutting a hotfix line (issue #627, task 3.9).
 *
 * Thin CLI over `scripts/lib/hotfixPreflight.js` — the split mirrors `validate-release-tag.mjs`
 * over `lib/releaseTags.js`, keeping the testable logic in a `lib/` module (which may export) while
 * this entry point only wires argv + stdin to a process exit code. See the library module's header
 * for the decision rule, the stdin contract, and why this is defense-in-depth over
 * semantic-release's own `EINVALIDNEXTVERSION`.
 *
 * The remote-tag list is PIPED IN, never spawned (so `git` is never resolved off `PATH`):
 *
 *   git ls-remote --tags origin | node scripts/hotfix-preflight.mjs v1.5.0
 *
 * ZERO DEPENDENCIES, by design: it may run before `npm ci`, exactly like `validate-release-tag.mjs`.
 *
 * Exit codes: 0 clear to cut the hotfix, 1 the next patch tag already exists (route 2 applies),
 *   2 usage error (a non-stable/garbage base tag, or empty/malformed stdin — an unverifiable state).
 */
import process from 'node:process';

import { readStdin, run } from './lib/hotfixPreflight.js';

const argv = process.argv.slice(2);
const baseTag = argv[0];

// Only drain stdin for a real check: a usage/help invocation must not block on a TTY with no pipe.
const needsInput = baseTag !== undefined && !['--help', '-h'].includes(baseTag);
const input = needsInput ? await readStdin(process.stdin) : '';

process.exitCode = run(argv, input);
