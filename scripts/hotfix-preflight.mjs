#!/usr/bin/env node
/** Pre-flight collision guard for cutting a hotfix line (issue #627, task 3.9). */
import process from 'node:process';

import { readStdin, run } from './lib/hotfixPreflight.js';

const argv = process.argv.slice(2);
const baseTag = argv[0];

// Only drain stdin for a real check: a usage/help invocation must not block on a TTY with no pipe.
const needsInput = baseTag !== undefined && !['--help', '-h'].includes(baseTag);
const input = needsInput ? await readStdin(process.stdin) : '';

process.exitCode = run(argv, input);
