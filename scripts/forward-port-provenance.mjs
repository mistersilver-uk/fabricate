#!/usr/bin/env node
/** Change-provenance verifier for the forward-port's content gate (issue #1418). */
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { run } from './lib/forwardPortProvenance.js';

process.exitCode = run(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, 'utf8'),
});
