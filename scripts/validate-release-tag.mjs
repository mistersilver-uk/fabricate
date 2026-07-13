#!/usr/bin/env node
/**
 * Validate a Fabricate release tag against the shared patterns in `scripts/lib/releaseTags.js`.
 *
 * This replaces the `grep -E '^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$'` literal that used to be
 * hand-copied into four workflow steps — every copy of which rejected `-beta.N`.
 *
 * ZERO DEPENDENCIES, by design: workflows run it straight after `actions/checkout`, on the
 * runner's preinstalled Node, BEFORE `npm ci`. (It imports `./lib/releaseTags.js`, a `.js` file
 * that parses as ESM only because the root `package.json` declares `"type": "module"` — that
 * declaration is load-bearing for a pre-`npm ci` run, so do not drop it or relocate these files
 * under a directory with its own `package.json`.)
 *
 * Usage:
 *   node scripts/validate-release-tag.mjs <tag> [--kind beta|stable|any] [--print version|base|tag]
 *   git tag --points-at HEAD -l 'v*-*' | node scripts/validate-release-tag.mjs --filter --kind beta
 *
 * Modes:
 *   default  Validate one tag and print one field of it to stdout, so a workflow can capture it:
 *            `VERSION=$(node scripts/validate-release-tag.mjs "$TAG" --kind beta)`.
 *              --print version  the bare version, `v` stripped (default) — `1.4.0-beta.3`
 *              --print base     the version a prerelease promotes to        — `1.4.0`
 *              --print tag      the tag as given                            — `v1.4.0-beta.3`
 *   --filter Read newline-delimited tags on stdin and echo the VALID TAGS (unchanged, `v` intact)
 *            to stdout — a drop-in replacement for the `grep -E` it retires. Exits 0 whatever the
 *            input CONTAINS; it exits non-zero only when the invocation itself is wrong. A caller
 *            piping into it MUST set `shell: bash` (for `-o pipefail`), or GitHub's default
 *            `bash -e {0}` will discard that failure and hand the step `sort`'s exit status.
 *
 * Exit codes: 0 valid, 1 invalid tag, 2 usage error.
 */
import process from 'node:process';

import { RELEASE_TAG_KINDS, assertReleaseTagKind, validateReleaseTag } from './lib/releaseTags.js';

const PRINTABLE_FIELDS = ['version', 'base', 'tag'];

const USAGE = `Usage:
  node scripts/validate-release-tag.mjs <tag> [--kind beta|stable|any] [--print version|base|tag]
  <tag stream> | node scripts/validate-release-tag.mjs --filter [--kind beta|stable|any]

Options:
  --kind <kind>    Required tag kind: ${[...RELEASE_TAG_KINDS, 'any'].join(', ')} (default: any)
  --print <field>  Field to print on success: ${PRINTABLE_FIELDS.join(', ')} (default: version)
  --filter         Read tags from stdin and print the valid ones
  --quiet          Suppress the failure message
  --help           Show this help`;

/**
 * @param {string[]} args
 * @returns {{tag?: string, kind: string, print: string, filter: boolean, quiet: boolean,
 *   help: boolean}}
 */
function parseArgs(args) {
  const options = { kind: 'any', print: 'version', filter: false, quiet: false, help: false };

  const valueFor = (flag, value) => {
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--help':
      case '-h': {
        options.help = true;
        break;
      }
      case '--filter': {
        options.filter = true;
        break;
      }
      case '--quiet': {
        options.quiet = true;
        break;
      }
      case '--kind': {
        options.kind = valueFor(arg, args[index + 1]);
        index += 1;
        break;
      }
      case '--print': {
        options.print = valueFor(arg, args[index + 1]);
        index += 1;
        break;
      }
      default: {
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        if (options.tag !== undefined) throw new Error(`Unexpected argument: ${arg}`);
        options.tag = arg;
      }
    }
  }

  return options;
}

/**
 * @param {import('node:stream').Readable} stream
 * @returns {Promise<string>}
 */
async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {string} message
 */
function reportError(message) {
  // `::error::` is a GitHub Actions annotation; harmless noise anywhere else.
  console.error(`::error::${message}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return;
  }

  // EAGER validation of the invocation, before any input is read. `--filter` used to check the
  // kind lazily, per input line — so a typo'd `--kind` with the normal empty-stdin case (no new
  // tag at HEAD) would have exited 0 and reported "no tags", silently.
  assertReleaseTagKind(options.kind);
  if (!PRINTABLE_FIELDS.includes(options.print)) {
    throw new Error(
      `Unknown --print field '${options.print}'. Expected one of: ` +
        `${PRINTABLE_FIELDS.join(', ')}.`
    );
  }

  if (options.filter) {
    const input = await readAll(process.stdin);
    for (const line of input.split('\n')) {
      const tag = line.trim();
      if (tag && validateReleaseTag(tag, options.kind).ok) console.log(tag);
    }
    return;
  }

  // An EMPTY tag is a bad tag (exit 1), not a bad invocation: `workflow_dispatch` will hand us an
  // empty string for a blank input box. Only a wholly absent argument is a usage error (exit 2).
  if (options.tag === undefined) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const result = validateReleaseTag(options.tag, options.kind);
  if (!result.ok) {
    if (!options.quiet) reportError(result.error);
    process.exitCode = 1;
    return;
  }

  console.log(result[options.print]);
}

try {
  await main();
} catch (error) {
  // A usage error (unknown --kind or --print, missing value) is exit 2 — never a "tag is fine" 0.
  reportError(`validate-release-tag: ${error.message}`);
  process.exitCode = 2;
}
