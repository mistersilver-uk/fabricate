#!/usr/bin/env node
/**
 * `npm run benchmark:compare` — diff two class-2 run records (issue 1071).
 *
 * ## It refuses more often than it reports, on purpose
 *
 * The tool REFUSES to diff two runs whose `nodeVersion`, `cpuModel` or `arch` differ, and says
 * which. A cross-machine millisecond ratio is not a weak number, it is a wrong one, and once
 * printed it gets pasted into an issue where nobody can see where it came from. Refusing is the
 * only behaviour that cannot mislead.
 *
 * ## What it prints
 *
 * A median RATIO with an IQR band, never absolute milliseconds. `> 1.00` is slower. A band
 * straddling 1.0 means the two runs did not separate and the honest reading is "no measured
 * difference", which the output says in those words rather than leaving a 3% ratio to be
 * over-read.
 *
 * ## The A/B procedure this consumes
 *
 * Same machine, alternating, at least 5 reps each:
 *
 *   git worktree add ../base origin/main && (cd ../base && npm ci)
 *   for i in 1 2 3; do
 *     (cd ../base && npm run benchmark:performance -- --reps=5)
 *     npm run benchmark:performance -- --reps=5
 *   done
 *   npm run benchmark:compare -- ../base/.benchmarks/runs/<base>.json .benchmarks/runs/<cand>.json
 *
 * Interleaving the two checkouts is what keeps a background process or a thermal ramp from
 * landing entirely on one side.
 *
 * Usage:
 *   npm run benchmark:compare -- <baseline-run.json> <candidate-run.json>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { COMPARABILITY_FIELDS, assertComparable } from './lib/benchmarkEnvelope.js';
import { medianRatioWithBand } from './lib/benchmarkStats.js';

function readRunRecord(path) {
  const record = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (!record?.envelope || !record?.cases) {
    throw new Error(`"${path}" is not a benchmark run record (missing envelope/cases).`);
  }
  return record;
}

/**
 * Every `<profile>/<caseId>` pair present in BOTH records, plus the ones present in only one.
 *
 * @param {object} baseline
 * @param {object} candidate
 * @returns {{shared: string[][], baselineOnly: string[], candidateOnly: string[]}}
 */
function alignCases(baseline, candidate) {
  const flatten = (record) => {
    const map = new Map();
    for (const [profile, cases] of Object.entries(record.cases)) {
      for (const id of Object.keys(cases)) map.set(`${profile}/${id}`, [profile, id]);
    }
    return map;
  };
  const left = flatten(baseline);
  const right = flatten(candidate);
  const shared = [];
  const baselineOnly = [];
  for (const [key, pair] of left) {
    if (right.has(key)) shared.push(pair);
    else baselineOnly.push(key);
  }
  const candidateOnly = [...right.keys()].filter((key) => !left.has(key));
  return { shared, baselineOnly, candidateOnly };
}

function formatRatio(comparison) {
  const arrow = comparison.ratio > 1 ? 'slower' : 'faster';
  const verdict = comparison.separated ? arrow : 'no measured difference';
  return (
    `${comparison.ratio.toFixed(3)}x ` +
    `[${comparison.bandLow.toFixed(3)}–${comparison.bandHigh.toFixed(3)}] ${verdict}`
  );
}

function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error(
      'usage: npm run benchmark:compare -- <baseline-run.json> <candidate-run.json>\n' +
        'Run records live in the gitignored .benchmarks/runs/ directory.'
    );
    process.exitCode = 2;
    return;
  }

  const baseline = readRunRecord(baselinePath);
  const candidate = readRunRecord(candidatePath);

  const { comparable, reasons } = assertComparable(baseline.envelope, candidate.envelope);
  if (!comparable) {
    console.error('REFUSING to compare: these runs are not from comparable environments.\n');
    for (const reason of reasons) console.error(`  ${reason}`);
    console.error(
      `\nA wall-clock ratio across differing ${COMPARABILITY_FIELDS.join(' / ')} is not a weak ` +
        'number, it is a wrong one. Re-run both sides on the same machine with the same Node.'
    );
    process.exitCode = 1;
    return;
  }

  const describe = (label, record) =>
    `${label} ${record.envelope.commit?.slice(0, 7)} (${record.envelope.branch})` +
    (record.envelope.dirty ? ' [DIRTY]' : '');
  console.log(describe('baseline ', baseline));
  console.log(describe('candidate', candidate));
  console.log(
    `env       node ${baseline.envelope.nodeVersion} · ${baseline.envelope.cpuModel} · ` +
      `${baseline.envelope.arch}\n`
  );

  const { shared, baselineOnly, candidateOnly } = alignCases(baseline, candidate);
  for (const [profile, id] of shared) {
    const comparison = medianRatioWithBand(
      baseline.cases[profile][id].samplesMs,
      candidate.cases[profile][id].samplesMs
    );
    console.log(`${profile}/${id}`.padEnd(72) + ` ${formatRatio(comparison)}`);
  }

  for (const key of baselineOnly) console.log(`(baseline only)  ${key}`);
  for (const key of candidateOnly) console.log(`(candidate only) ${key}`);

  console.log(
    '\nRatios only. Never paste absolute milliseconds into an issue or a PR comment — they do ' +
      'not survive being read on another machine.'
  );
}

main();
