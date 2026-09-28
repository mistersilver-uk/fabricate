import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSignedStep } from '../src/utils/checkAdjustmentFormat.js';
import { fill } from '../src/utils/fillPlaceholders.js';

test('fill substitutes in one pass, so a value naming a later token is inserted literally', () => {
  const template = '{label} {formula} rolled {total}, raising the target';
  assert.equal(
    fill(template, { label: 'Lucky {total}', formula: '1d4', total: 3 }),
    'Lucky {total} 1d4 rolled 3, raising the target'
  );
  assert.equal(
    fill(template, { label: 'Aid {formula}', formula: '1d4', total: 3 }),
    'Aid {formula} 1d4 rolled 3, raising the target'
  );
});

test('fill keeps an unknown token and inserts replacement patterns literally', () => {
  assert.equal(fill('{a} and {b}', { a: '$&$1' }), '$&$1 and {b}');
  assert.equal(fill('{toString}', {}), '{toString}');
});

test('a signed step reads +0, +n or the true minus sign', () => {
  assert.deepEqual([0, 3, -2].map(formatSignedStep), ['+0', '+3', '−2']);
});
