/** `tabCountMark` (issue 2491): a count mark whose name states the unit, plural-aware. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import {
  TAB_COUNT_UNITS,
  nameTabCounts,
  tabCountMark,
} from '../../src/ui/svelte/util/tabCountMark.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';

const lang = JSON.parse(readFileSync(new URL('../../lang/en.json', import.meta.url), 'utf8'));
const leaf = (key) => key.split('.').reduce((node, part) => node?.[part], lang);

let env;
before(() => {
  env = installFoundryBridgeEnv({ labels: { localize: (key) => leaf(key) ?? key } });
});
after(() => env.restore());

describe('tabCountMark', () => {
  it('builds a count mark named with the singular at exactly one and the plural otherwise', () => {
    const unit = TAB_COUNT_UNITS.linkedRecipes;
    assert.deepEqual(tabCountMark(1, unit), {
      vehicle: 'count',
      label: 1,
      name: '1 linked recipe',
    });
    assert.equal(tabCountMark(3, unit).name, '3 linked recipes');
    assert.equal(tabCountMark(0, unit).name, '0 linked recipes');
  });

  it('keeps the caller`s extra fields and a numeric label', () => {
    const mark = tabCountMark(0, TAB_COUNT_UNITS.tasks, { suppressZero: false });
    assert.equal(mark.suppressZero, false);
    assert.strictEqual(mark.label, 0);
  });

  it('declares every unit in lang with the English fallback it ships', () => {
    for (const [name, countUnit] of Object.entries(TAB_COUNT_UNITS)) {
      for (const [key, fallback] of [countUnit.one, countUnit.other]) {
        assert.equal(leaf(key), fallback, `${name}: ${key}`);
        assert.match(fallback, /^\{count\} \S/, `${name}: the fallback leads with the number`);
      }
    }
  });
});

describe('nameTabCounts', () => {
  const units = { contents: TAB_COUNT_UNITS.linkedRecipes };

  it('names an unnamed count mark on a mapped tab and passes everything else through', () => {
    const validation = [{ label: '2', tone: 'danger' }];
    const named = { vehicle: 'count', label: 4, name: 'Mine' };
    const out = nameTabCounts(
      { contents: { vehicle: 'count', label: 1 }, validation, other: named },
      units
    );
    assert.deepEqual(out.contents, { vehicle: 'count', label: 1, name: '1 linked recipe' });
    assert.strictEqual(out.validation, validation);
    assert.strictEqual(out.other, named);
    assert.deepEqual(
      nameTabCounts({ contents: [{ vehicle: 'count', label: 2 }, null] }, units).contents,
      [{ vehicle: 'count', label: 2, name: '2 linked recipes' }, null]
    );
    assert.strictEqual(
      nameTabCounts({ contents: named }, units).contents,
      named,
      'a mark that names itself keeps its name'
    );
    assert.deepEqual(nameTabCounts(undefined, units), {});
    assert.deepEqual(
      nameTabCounts({ contents: { vehicle: 'count', value: 2 } }, units).contents,
      { vehicle: 'count', value: 2, label: 2, name: '2 linked recipes' },
      'a mark that spells its numeral `value` is named from it'
    );
  });
});
