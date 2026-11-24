/**
 * The equivalence pin for the deterministic expression reader: a golden over a hand-written corpus
 * and a generated token sweep. The reader's accept and refuse behaviour is frozen wherever it lives.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  firstUnresolvedPath,
  resolveDeterministicExpression,
} from '../src/systems/checkEvaluation.js';
import { createExpressionReader, readStrictPath } from '../src/systems/expressionReader.js';

import {
  ROLL_DATA,
  ROWS,
  SWEEP_MAX_LENGTH,
  SWEEP_ROLL_DATA_NAME,
  SWEEP_TOKENS,
  sweepSources,
} from './helpers/expressionReaderCorpus.js';

const GOLDEN_URL = new URL('fixtures/expressionReaderCorpus.golden.json', import.meta.url);
const RECORD_ENV = 'UPDATE_EXPRESSION_READER_GOLDEN';
const REGENERATE = `${RECORD_ENV}=1 node --conditions=browser --test tests/expression-reader-corpus.test.js`;

const MODES = Object.freeze({
  strict: undefined,
  foundry: Object.freeze({ pathMode: 'foundry' }),
});

/** The recorded form of a result: what survives a JSON round trip, so `-0` and `0` agree. */
const recorded = (value) => JSON.parse(JSON.stringify(value ?? null));

function resultsFor(row) {
  const data = ROLL_DATA[row.data];
  const out = { resolve: {}, firstUnresolved: {} };
  for (const [mode, options] of Object.entries(MODES)) {
    out.resolve[mode] = recorded(resolveDeterministicExpression(row.expression, data, options));
    out.firstUnresolved[mode] = recorded(firstUnresolvedPath(row.expression, data, options));
  }
  return out;
}

function sweepResults() {
  const data = ROLL_DATA[SWEEP_ROLL_DATA_NAME];
  const out = {};
  for (const [mode, options] of Object.entries(MODES)) {
    const hash = createHash('sha256');
    let rows = 0;
    let accepts = 0;
    for (const source of sweepSources()) {
      const result = resolveDeterministicExpression(source, data, options);
      rows += 1;
      if (result.ok) accepts += 1;
      hash.update(result.ok ? `ok:${String(result.value)}\n` : `no:${result.reason}\n`);
    }
    out[mode] = { rows, accepts, sha256: hash.digest('hex') };
  }
  return out;
}

function computeGolden() {
  return { rows: ROWS.map(resultsFor), sweep: sweepResults() };
}

if (process.env[RECORD_ENV] === '1') {
  writeFileSync(GOLDEN_URL, `${JSON.stringify(computeGolden(), null, 2)}\n`);
}

const golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8'));

test('the corpus holds at least 200 hand-written rows and a sweep over about 14 tokens', () => {
  assert.ok(ROWS.length >= 200, `${ROWS.length} rows`);
  assert.equal(SWEEP_TOKENS.length, 14);
  assert.equal(SWEEP_MAX_LENGTH, 4);
  for (const row of ROWS) assert.ok(row.data in ROLL_DATA, row.data);
});

test(`every hand-written row resolves as the golden records (${REGENERATE})`, () => {
  assert.equal(golden.rows.length, ROWS.length);
  for (const [index, row] of ROWS.entries()) {
    assert.deepEqual(resultsFor(row), golden.rows[index], `${index}: ${String(row.expression)}`);
  }
});

test('the generated token sweep keeps its row count, accept count and result stream', () => {
  const sweep = sweepResults();
  for (const mode of Object.keys(MODES)) {
    assert.deepEqual(sweep[mode], golden.sweep[mode], mode);
  }
  let expectedRows = 0;
  for (let length = 1; length <= SWEEP_MAX_LENGTH; length += 1) {
    expectedRows += SWEEP_TOKENS.length ** length;
  }
  assert.equal(golden.sweep.strict.rows, expectedRows);
  assert.equal(golden.sweep.foundry.rows, expectedRows);
});

test('the default reader agrees with every golden row it can read', () => {
  let accepted = 0;
  let refused = 0;
  for (const [index, row] of ROWS.entries()) {
    if (typeof row.expression !== 'string' || !row.expression.trim()) continue;
    const expected = golden.rows[index].resolve.strict;
    if (!expected.ok && expected.reason !== 'invalid') continue;
    const data = ROLL_DATA[row.data];
    const reader = createExpressionReader(row.expression.trim(), {
      readPath: (token) => readStrictPath(token, data),
    });
    let value;
    let stoppedShort = false;
    let threw = false;
    try {
      value = reader.parseExpression();
      stoppedShort = !reader.atEnd();
    } catch {
      threw = true;
    }
    if (expected.ok) {
      accepted += 1;
      assert.equal(threw || stoppedShort, false, row.expression);
      assert.deepEqual(recorded(value), expected.value, row.expression);
    } else {
      refused += 1;
      assert.equal(threw || stoppedShort, true, row.expression);
    }
  }
  assert.ok(accepted >= 50 && refused >= 50, `${accepted} accepted, ${refused} refused`);
});
