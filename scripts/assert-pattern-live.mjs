#!/usr/bin/env node
/**
 * Prove a mechanical acceptance grep is live: every top-level `|` alternative of an
 * extended regex must match at least one line in the given files.
 *
 * Usage: node scripts/assert-pattern-live.mjs 'foo|bar' $(git ls-files 'src/**\/*.js')
 *
 * Exits 1 naming each alternative that matches nothing, and also when no file is given
 * (a glob that matched nothing would otherwise pass vacuously). Exits 2 on bad usage
 * or an unreadable file or invalid alternative.
 *
 * Alternatives are compiled with JS `RegExp`, which is close to `grep -E` but differs:
 * POSIX classes such as `[[:alpha:]]` are not supported, `\<` `\>` word anchors are not,
 * `\d \w \s` ARE supported (GNU grep accepts them too), `(?:...)` and lookaround exist
 * only in JS, ERE leftmost-longest matching is irrelevant to a match/no-match question,
 * and a `]` first in a class is handled by the splitter but JS reads `[]` as empty.
 */
import { readFileSync } from 'node:fs';

import { findDeadAlternatives } from './lib/patternLiveness.js';

const [pattern, ...files] = process.argv.slice(2);

if (pattern === undefined) {
  console.error('usage: assert-pattern-live.mjs <ERE pattern> <files...>');
  process.exit(2);
}
if (files.length === 0) {
  console.error('assert-pattern-live: no files given; a glob that matched nothing proves nothing.');
  process.exit(1);
}

let dead;
try {
  dead = findDeadAlternatives(
    pattern,
    files.map((file) => readFileSync(file, 'utf8'))
  );
} catch (error) {
  console.error(`assert-pattern-live: ${error.message}`);
  process.exit(2);
}

if (dead.length > 0) {
  for (const alternative of dead) {
    console.error(`dead alternative (matches no line in ${files.length} file(s)): ${alternative}`);
  }
  process.exit(1);
}
console.log(`all alternatives live across ${files.length} file(s)`);
