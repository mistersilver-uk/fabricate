#!/usr/bin/env node
/** Validate a Fabricate release tag against the shared patterns in `scripts/lib/releaseTags.js`. */
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

  // Eager validation of the invocation, before any input is read.
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
