import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import {
  salvageCheckNeed,
  salvageCheckTarget,
  salvageDisplayDc,
  withSalvageCountBands,
} from '../src/ui/presenters/salvageCheckNeed.js';
import { fill } from '../src/utils/fillPlaceholders.js';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { countEvaluation } from './helpers/countFixtures.js';

test('display DC shares override and fallback arithmetic with the listing', () => {
  assert.equal(salvageDisplayDc({ mode: 'simple', config: { dc: 16 }, component: { salvage: { dcOverride: 21.8 } } }), 21);
  assert.equal(salvageDisplayDc({ mode: 'routed', routedType: 'relative', config: {} }), 15);
  assert.equal(salvageDisplayDc({ mode: 'routed', routedType: 'fixed', config: { dc: 16 } }), null);
});

test('prompt need distinguishes usable DC, no check, and no single target', () => {
  assert.deepEqual(salvageCheckNeed({ mode: 'simple', config: {}, checkUsable: false }), { kind: 'noCheck' });
  assert.deepEqual(salvageCheckNeed({ mode: 'simple', config: { dc: 18 }, checkUsable: true }), { kind: 'dc', dc: 18 });
  assert.deepEqual(salvageCheckNeed({ mode: 'routed', config: { type: 'relative', dc: 12 }, checkUsable: true }), { kind: 'dc', dc: 12 });
  assert.deepEqual(salvageCheckNeed({ mode: 'routed', config: { type: 'fixed', dc: 12 }, checkUsable: true }), { kind: 'noSingleTarget' });
  assert.deepEqual(salvageCheckNeed({ mode: 'progressive', config: {}, checkUsable: true }), { kind: 'noSingleTarget' });
});

test('a count check shows no DC: it grades successes, not its retained DC (issue 2004)', () => {
  const config = { dc: 15, evaluation: { product: 'count', direction: 'over', pool: { required: 3 } } };
  assert.equal(salvageDisplayDc({ mode: 'simple', config, component: { salvage: { dcOverride: 9 } } }), null);
  const need = (mode, component, extra = {}) =>
    salvageCheckNeed({ mode, config: { ...config, ...extra }, checkUsable: true, component });
  assert.deepEqual(need('simple'), { kind: 'successes', count: 3, destination: 'pool' }, "the pool's required count");
  assert.deepEqual(
    need('simple', { salvage: { dcOverride: 9, successesOverride: 5 } }),
    { kind: 'successes', count: 5, destination: 'pool' },
    "the component's successes override wins, and its DC override is never read"
  );
  assert.deepEqual(need('simple', { salvage: { successesOverride: 0 } }), { kind: 'successes', count: 0, destination: 'pool' });
  assert.deepEqual(need('simple', { salvage: { successesOverride: null } }), { kind: 'successes', count: 3, destination: 'pool' });
  assert.deepEqual(need('routed', null, { type: 'relative' }), { kind: 'successes', count: 3, destination: 'pool' });
  assert.deepEqual(need('routed', null, { type: 'fixed' }), { kind: 'noSingleTarget' }, 'net ranges');
  assert.deepEqual(need('progressive'), { kind: 'noSingleTarget' }, 'a budget, not a count to reach');
  assert.deepEqual(salvageCheckNeed({ mode: 'simple', config, checkUsable: false }), { kind: 'noCheck' });
  assert.deepEqual(
    need('simple', null, { evaluation: { ...config.evaluation, pool: { required: 3, modifierDestination: 'threshold' } } }),
    { kind: 'successes', count: 3, destination: 'threshold' },
    'the row names where its modifiers go, so an all-count batch can word its bonus help'
  );
});

test('a summed roll-under row names its fixed target, and a character value has no single one', () => {
  const need = (evaluation, config = {}) =>
    salvageCheckNeed({ mode: 'simple', config: { dc: 12, ...config, evaluation }, checkUsable: true });
  assert.deepEqual(need({ product: 'sum', direction: 'under' }), { kind: 'target', target: 12 });
  assert.deepEqual(
    salvageCheckNeed({
      mode: 'routed', config: { type: 'relative', evaluation: { direction: 'under' } }, checkUsable: true,
      component: { salvage: { dcOverride: 9 } },
    }),
    { kind: 'target', target: 9 },
    'the component override and the fallback arithmetic still apply'
  );
  for (const direction of ['over', 'under']) {
    assert.deepEqual(
      need({ direction, target: { source: 'attribute', expression: '@skill' } }),
      { kind: 'noSingleTarget', direction },
      'a character value keeps its direction for the bulk help'
    );
  }
  assert.deepEqual(need({ direction: 'over' }), { kind: 'dc', dc: 12 }, 'sum/over fixed is unchanged');
  assert.deepEqual(
    need({ product: 'count', direction: 'under', pool: { required: 2 } }),
    { kind: 'successes', count: 2, destination: 'pool' },
    'a count row names its successes, not a DC (issue 2004)'
  );
  assert.deepEqual(
    salvageCheckNeed({ mode: 'progressive', config: { evaluation: { direction: 'under' } }, checkUsable: true }),
    { kind: 'noSingleTarget' }
  );
});

test('a routed FIXED tier bands its authored [start, end] through the shared netRange formatter (issue 2152)', () => {
  const rows = [
    { id: 'o1', name: 'Fail', success: false, threshold: null, start: -2, end: -1, results: [] },
    { id: 'o2', name: 'Pass', success: true, threshold: null, start: 10, end: 20, results: [] },
    { id: 'o3', name: 'Even', success: true, threshold: null, start: 5, end: 5, results: [] },
    { id: 'o4', name: 'Open', success: true, threshold: null, start: null, end: null, results: [] },
  ];
  const config = { type: 'fixed' };
  const banded = withSalvageCountBands(rows, { config, component: null, localize: () => '' });
  assert.deepEqual(
    banded.map((row) => row.band),
    ['−2 – −1', '10–20', '5', null],
    'a negative-ended range spaces its dash from the true minus; a positive one stays tight; ' +
      'a single-value range collapses; a row missing a bound bands nothing'
  );
  // A non-counting (summed) fixed check reaches the same branch and is banded identically:
  // fixed routing never reads a DC either way, so there is nothing to discriminate on.
  assert.equal(
    withSalvageCountBands(
      [{ id: 'o1', success: true, threshold: null, start: -2, end: -1, results: [] }],
      { config: { type: 'fixed', evaluation: { product: 'sum', direction: 'over' } }, component: null, localize: () => '' }
    )[0].band,
    '−2 – −1'
  );
});

test('a count check names its successes needed and the salvager\'s per-die test (issue 2006)', () => {
  const localize = (key, data) => fill(shippedLocalize(key), data ?? {});
  const actor = { getRollData: () => ({ skills: { craft: { value: 7 } } }) };
  const target = (pool, { mode = 'simple', component = null, thresholdMode = 'meet' } = {}) =>
    salvageCheckTarget({
      mode,
      config: { thresholdMode, evaluation: normalizeCheckEvaluation(countEvaluation(pool)) },
      component,
      actor,
      localize,
    });
  const rule = 'Roll to break this down. The count must reach the successes needed to recover the materials below.';
  assert.deepEqual(target({ threshold: '@skills.craft.value', required: 2 }), {
    rule,
    direction: 'over',
    text: 'Salvage check · 2 successes needed · d10s, success on ≥ 7',
  });
  assert.equal(
    target({ direction: 'under', die: 6 }, { component: { salvage: { successesOverride: 1 } }, thresholdMode: 'exceed' }).text,
    'Salvage check · 1 success needed · d6s, success on < 8',
    "the component's override, singular, and the per-die strictness"
  );
  assert.deepEqual(target({ threshold: '@skills.none.value' }), {
    rule,
    unresolved: 'Salvage check could not read a number for its target from this character.',
  });
  assert.equal(target({}, { mode: 'progressive' }), null, 'a budget has no count to reach');
});
