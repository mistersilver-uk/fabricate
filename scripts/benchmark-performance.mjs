#!/usr/bin/env node
/**
 * `npm run benchmark:performance` — the deterministic, Foundry-free performance harness
 * (issue 1071).
 *
 * No Foundry installation, licence, container or browser is involved. Every profile runs under
 * plain Node against synthetic fixtures generated from `{profile, seed}` alone.
 *
 * Two artefacts come out of one run, and they are deliberately different kinds of thing:
 *
 *   1. `benchmarks/baselines/<profile>.json` — CLASS 1. Counts, sizes and fixture checksums.
 *      Machine-invariant, committed, and asserted by `tests/benchmark-baseline-drift.test.js`.
 *      Written only under `--update-baselines`; verified on every run under `--check`.
 *   2. `.benchmarks/runs/<iso8601>-<shortsha>.json` — CLASS 2. Wall clock and heap, plus the
 *      full envelope. Gitignored, never asserted, and only ever compared to another run from
 *      the SAME machine via `npm run benchmark:compare`.
 *
 * This file is an ENTRY POINT and exports nothing; everything reusable lives in
 * `scripts/lib/benchmark*.js`, which is what the drift test imports.
 *
 * Usage:
 *   npm run benchmark:performance
 *   npm run benchmark:performance -- --profile=held-inventory --reps=9
 *   npm run benchmark:performance -- --check              # fail on class-1 drift
 *   npm run benchmark:performance -- --update-baselines   # re-record class 1
 *   npm run benchmark:performance -- --list
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BENCHMARK_CASES, casesForProfile } from '../tests/helpers/scale/benchmarkCases.js';
import {
  DEFAULT_SEED,
  HARNESS_VERSION,
  SCALE_PROFILES,
  SCALE_PROFILE_NAMES,
  SWEPT_SCALE_PROFILE_NAMES,
} from '../tests/helpers/scale/scaleProfiles.js';

import { diffAgainstBaseline, readBaseline, writeBaseline } from './lib/benchmarkBaselines.js';
import { captureEnvelope, runRecordFilename } from './lib/benchmarkEnvelope.js';
import { measureProfiles } from './lib/benchmarkRunner.js';
import { summarise } from './lib/benchmarkStats.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = join(REPO_ROOT, '.benchmarks', 'runs');

/** Valueless flags. */
const FLAG_SETTERS = {
  '--check': (options) => {
    options.check = true;
  },
  '--update-baselines': (options) => {
    options.updateBaselines = true;
  },
  '--list': (options) => {
    options.list = true;
  },
  '--no-run-record': (options) => {
    options.writeRunRecord = false;
  },
};

/** `--key=value` options. */
const VALUE_SETTERS = {
  '--profile': (options, value) => {
    options.profiles = value.split(',');
  },
  '--seed': (options, value) => {
    options.seed = Number(value);
  },
  '--reps': (options, value) => {
    options.reps = Number(value);
  },
};

function parseArgs(argv) {
  const options = {
    // The SWEPT list, not every registered profile. A foundry-only profile (issue 1255) has no
    // headless cases and no committed baseline by design, so sweeping it would build a fixture,
    // measure nothing, and then fail `--check` reading a baseline that was never meant to exist.
    profiles: [...SWEPT_SCALE_PROFILE_NAMES],
    seed: DEFAULT_SEED,
    reps: 5,
    check: false,
    updateBaselines: false,
    list: false,
    writeRunRecord: true,
  };
  for (const arg of argv) {
    const flag = FLAG_SETTERS[arg];
    if (flag) {
      flag(options);
      continue;
    }
    const separator = arg.indexOf('=');
    const setter = separator === -1 ? null : VALUE_SETTERS[arg.slice(0, separator)];
    if (!setter) throw new Error(`Unknown argument "${arg}"`);
    setter(options, arg.slice(separator + 1));
  }

  const unknown = options.profiles.filter((profile) => !SCALE_PROFILES[profile]);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown profile(s): ${unknown.join(', ')}. Known: ${SCALE_PROFILE_NAMES.join(', ')}`
    );
  }
  // Refused BY NAME rather than silently dropped. A foundry-only profile is a real, buildable
  // fixture, so `--profile=<one>` is a reasonable thing to type; it just has nothing for THIS
  // harness to run, and a run that measured zero cases and reported success would be the least
  // useful possible answer.
  //
  // No profile declares `foundryOnly` today (issue 1265 removed the last one), so this branch is
  // currently unreachable. It stays because the MECHANISM stays: `scaleProfiles.js` still supports
  // the flag and `printList` still reports it, so the next profile to declare it would otherwise be
  // swept in silence — building a fixture, measuring nothing, then failing `--check` against a
  // baseline that was never meant to exist. An unreachable refusal is cheaper than that.
  const foundryOnly = options.profiles.filter(
    (profile) => SCALE_PROFILES[profile].foundryOnly === true
  );
  if (foundryOnly.length > 0) {
    throw new Error(
      `Profile(s) ${foundryOnly.join(', ')} are Foundry-only and have no headless cases. Run ` +
        `them against a live world with "npm run test:foundry:perf -- ` +
        `--fixture=${foundryOnly[0]}". ` +
        `Swept here: ${SWEPT_SCALE_PROFILE_NAMES.join(', ')}`
    );
  }
  if (!Number.isFinite(options.seed)) throw new Error('--seed must be a number');
  if (!Number.isInteger(options.reps) || options.reps < 1) {
    throw new Error('--reps must be a positive integer');
  }
  return options;
}

function printList() {
  for (const profile of SWEPT_SCALE_PROFILE_NAMES) {
    const cases = casesForProfile(profile);
    console.log(`${profile} (${cases.length} cases) — ${SCALE_PROFILES[profile].description}`);
    for (const entry of cases) console.log(`    ${entry.id}`);
  }
  console.log(
    `\n${BENCHMARK_CASES.length} cases across ${SWEPT_SCALE_PROFILE_NAMES.length} profiles.`
  );
  // Listed, not hidden. A registered profile this harness will not run must say so where a
  // reader is already looking for the profile list.
  const foundryOnly = SCALE_PROFILE_NAMES.filter(
    (name) => SCALE_PROFILES[name].foundryOnly === true
  );
  for (const profile of foundryOnly) {
    console.log(`\n${profile} (Foundry-only, 0 headless cases)`);
    console.log(`    ${SCALE_PROFILES[profile].foundryOnlyReason}`);
  }
}

function printHumanReport({ class1ByProfile, class2ByProfile, generationMs }) {
  for (const [profile, payload] of Object.entries(class1ByProfile)) {
    console.log(`\n=== ${profile} ===`);
    console.log(`  ${payload.description}`);
    console.log(`  construction: ${payload.construction}`);
    if (payload.ceiling) console.log(`  ceiling: ${payload.ceiling}`);
    console.log(`  fixture generation: ${generationMs[profile].toFixed(1)} ms (never timed)`);
    for (const [id, entry] of Object.entries(payload.cases)) {
      const stats = summarise(class2ByProfile[profile][id].samplesMs);
      console.log(
        `  ${id.padEnd(52)} median ${stats.median.toFixed(2)} ms ` +
          `[p25 ${stats.p25.toFixed(2)} / p75 ${stats.p75.toFixed(2)}, n=${stats.reps}]`
      );
      const counts = Object.entries(entry.counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      if (counts) console.log(`      counts: ${counts}`);
    }
  }
}

function writeRunRecord(options, measured) {
  const envelope = captureEnvelope({
    repoRoot: REPO_ROOT,
    fixtureProfile: options.profiles.join(','),
    fixtureSeed: options.seed,
    harnessVersion: HARNESS_VERSION,
  });
  mkdirSync(RUN_DIR, { recursive: true });
  const runPath = join(RUN_DIR, runRecordFilename(envelope));
  const record = {
    envelope,
    reps: options.reps,
    generationMs: measured.generationMs,
    cases: measured.class2ByProfile,
  };
  writeFileSync(runPath, JSON.stringify(record, null, 2) + '\n');
  console.log(`\nrun record: ${runPath}`);
}

function reportDrift(measured) {
  let failed = false;
  for (const [profile, payload] of Object.entries(measured.class1ByProfile)) {
    const drift = diffAgainstBaseline(readBaseline(profile), payload);
    if (drift.length > 0) {
      failed = true;
      console.error(`\nCLASS-1 DRIFT in ${profile}:`);
      for (const line of drift) console.error(`  ${line}`);
    }
  }
  if (failed) {
    console.error(
      '\nCommitted counts moved. If the change is intended, re-record with ' +
        '`npm run benchmark:performance -- --update-baselines` IN THE SAME PR and say why.'
    );
    process.exitCode = 1;
    return;
  }
  console.log('\nclass-1 baselines: clean');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    printList();
    return;
  }

  const measured = await measureProfiles({
    profiles: options.profiles,
    seed: options.seed,
    reps: options.reps,
    onProgress: (message) => console.log(message),
  });

  printHumanReport(measured);

  if (options.updateBaselines) {
    for (const [profile, payload] of Object.entries(measured.class1ByProfile)) {
      console.log(`\nwrote ${writeBaseline(profile, payload)}`);
    }
  }

  if (options.writeRunRecord) writeRunRecord(options, measured);
  if (options.check) reportDrift(measured);
}

await main();
