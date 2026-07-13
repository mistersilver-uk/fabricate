#!/usr/bin/env node
/**
 * Validate a Fabricate release tag against the shared patterns in `scripts/lib/releaseTags.js`.
 *
 * This replaces the `grep -E '^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$'` literal that used to be
 * hand-copied into four workflow steps — every copy of which rejected `-beta.N`.
 *
 * ZERO DEPENDENCIES, by design: workflows run it straight after `actions/checkout`, on the
 * runner's preinstalled Node, BEFORE `npm ci`.
 *
 * Usage:
 *   node scripts/validate-release-tag.mjs <tag> [--kind beta|stable|any] [--quiet]
 *   git tag --points-at HEAD -l 'v*-*' | node scripts/validate-release-tag.mjs --filter --kind beta
 *
 * Modes:
 *   default  Validate one tag. Prints the BARE VERSION (the `v` stripped) to stdout on success,
 *            so a workflow can capture it: `VERSION=$(node scripts/validate-release-tag.mjs …)`.
 *   --filter Read newline-delimited tags on stdin and echo the VALID TAGS (unchanged, `v` intact)
 *            to stdout — a drop-in replacement for the `grep -E` it retires. Always exits 0.
 *
 * Exit codes: 0 valid, 1 invalid tag, 2 usage error.
 */
import process from 'node:process';

import { RELEASE_TAG_KINDS, validateReleaseTag } from './lib/releaseTags.js';

const USAGE = `Usage:
  node scripts/validate-release-tag.mjs <tag> [--kind beta|stable|any] [--quiet]
  <tag stream> | node scripts/validate-release-tag.mjs --filter [--kind beta|stable|any]

Options:
  --kind <kind>   Required tag kind: ${[...RELEASE_TAG_KINDS, 'any'].join(', ')} (default: any)
  --filter        Read tags from stdin and print the valid ones (always exits 0)
  --quiet         Suppress the failure message
  --help          Show this help`;

/**
 * @param {string[]} args
 * @returns {{tag?: string, kind: string, filter: boolean, quiet: boolean, help: boolean}}
 */
function parseArgs(args) {
  const options = { kind: 'any', filter: false, quiet: false, help: false };

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
        const value = args[index + 1];
        if (!value || value.startsWith('--')) throw new Error('--kind requires a value');
        options.kind = value;
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

  if (options.filter) {
    const input = await readAll(process.stdin);
    for (const line of input.split('\n')) {
      const tag = line.trim();
      if (!tag) continue;
      if (validateReleaseTag(tag, options.kind).ok) console.log(tag);
    }
    return;
  }

  if (!options.tag) {
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

  // The bare version — never the tag. See scripts/lib/releaseTags.js.
  console.log(result.version);
}

try {
  await main();
} catch (error) {
  // A usage error (unknown --kind, missing value) is exit 2 — never a "this tag is fine" 0.
  reportError(`validate-release-tag: ${error.message}`);
  process.exitCode = 2;
}
