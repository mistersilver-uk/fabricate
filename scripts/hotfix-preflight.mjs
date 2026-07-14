#!/usr/bin/env node
/**
 * Pre-flight collision guard for cutting a hotfix line (issue #627, task 3.9).
 *
 * Thin CLI over `scripts/lib/hotfixPreflight.js` — the split mirrors `validate-release-tag.mjs`
 * over `lib/releaseTags.js`, keeping the testable logic in a `lib/` module (which may export) while
 * this entry point only wires argv to a process exit code. See the library module's header for the
 * decision rule and why this is defense-in-depth over semantic-release's own `EINVALIDNEXTVERSION`.
 *
 * ZERO DEPENDENCIES, by design: it may run before `npm ci`, exactly like `validate-release-tag.mjs`.
 *
 * Usage:
 *   node scripts/hotfix-preflight.mjs <base-public-tag>   # e.g. v1.5.0
 *
 * Exit codes: 0 clear to cut the hotfix, 1 the next patch tag already exists (route 2 applies),
 *   2 usage error (a non-stable or garbage base tag, or `git ls-remote` failed).
 */
import process from 'node:process';

import { run } from './lib/hotfixPreflight.js';

process.exitCode = run(process.argv.slice(2));
