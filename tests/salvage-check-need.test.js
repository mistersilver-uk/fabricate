import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salvageCheckNeed, salvageDisplayDc } from '../src/ui/presenters/salvageCheckNeed.js';

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
