/**
 * The result-side choice group's authoring edits (issue 1773): each writes only what its cell reads,
 * every chooser × strategy cell the header can author saves through `Result` and reads back
 * unchanged, and the ladder problems the range cells and the Validation tab report.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Result } from '../src/models/Result.js';
import { awardRoutedResults } from '../src/systems/choiceGroupAward.js';
import {
  convertToGroup,
  keepingRange,
  groupProblems,
  rangeProblems,
  withAlternative,
  withChooser,
  withCount,
  withRange,
  withRepeats,
  withSelection,
  withStrategy,
  withoutAlternative,
} from '../src/ui/svelte/apps/manager/recipe/resultGroupEdits.js';

import { scriptedFormulaRoll } from './helpers/scriptedFormulaRoll.js';

const ROW = Object.freeze({ id: 'r1', componentId: 'ore', quantity: 2, quantityFormula: '1d4' });
const converted = () => convertToGroup(ROW, 'currency', 'm1', 'm2');
const ranged = (group, ...ranges) => ({
  ...group,
  alternatives: group.alternatives.map((member, i) => withRange(member, ranges[i])),
});

describe('convert and unwrap', () => {
  it('converts a row in place: its id becomes the group’s, its pick the first alternative', () => {
    assert.deepEqual(converted(), {
      id: 'r1',
      alternatives: [
        { id: 'm1', componentId: 'ore', quantity: 2, quantityFormula: '1d4' },
        { id: 'm2', kind: 'currency', unit: '', quantity: 1 },
      ],
    });
    const saved = new Result(converted());
    assert.equal(saved.chooser, 'playerChooses', 'the default cell is the player’s');
    assert.equal(saved.awardStrategy, 'anyOne');
  });

  it('appends an empty alternative of the chosen kind', () => {
    const grown = withAlternative(converted(), 'knowledge', 'm3');
    assert.deepEqual(grown.alternatives[2], {
      id: 'm3',
      kind: 'knowledge',
      recipeId: '',
      quantity: 1,
    });
  });

  it('unwraps a group left with one member into that member, without settings or range', () => {
    const group = withRepeats(
      withSelection(
        withStrategy(
          withChooser(ranged(converted(), { from: 1, to: 3 }, { from: 4, to: 6 }), 'rolled'),
          'upTo'
        ),
        '1d6'
      ),
      true
    );
    assert.deepEqual(withoutAlternative(group, 1), {
      id: 'm1',
      componentId: 'ore',
      quantity: 2,
      quantityFormula: '1d4',
    });
    assert.equal(withoutAlternative({ id: 'g', alternatives: [ROW] }, 0), null, 'none left');
    const three = withAlternative(group, 'component', 'm3');
    assert.equal(withoutAlternative(three, 0).alternatives.length, 2, 'two left stay a group');
  });
});

describe('the header’s settings', () => {
  it('rolled writes the chooser alone; the player hides the rest, and back restores it', () => {
    const rolled = withChooser(converted(), 'rolled');
    assert.deepEqual(rolled, { ...converted(), chooser: 'rolled' });
    const authored = withRepeats(
      withSelection(
        withStrategy(ranged(rolled, { from: 1, to: 2 }, { from: 3, to: 4 }), 'upTo'),
        '1d4'
      ),
      true
    );
    const { chooser: _chooser, ...hidden } = authored;
    const player = withChooser(authored, 'playerChooses');
    assert.deepEqual(player, hidden, 'the expression, every range and repeats stay in the draft');
    assert.deepEqual(withChooser(player, 'rolled'), authored, 'switching back restores them');
  });

  it('switching to rolled keeps a rolled N', () => {
    const counted = withCount(withStrategy(converted(), 'upTo'), { quantityFormula: '1d3' });
    assert.deepEqual(withChooser(counted, 'rolled'), { ...counted, chooser: 'rolled' });
  });

  it('up to N opens on a fixed two; any one of drops N and repeats', () => {
    const upTo = withStrategy(converted(), 'upTo');
    assert.deepEqual(upTo, { ...converted(), awardStrategy: 'upTo', awardCount: 2 });
    const rolled = withRepeats(
      withChooser(withCount(upTo, { quantityFormula: '1d3' }), 'rolled'),
      true
    );
    assert.deepEqual(withStrategy(rolled, 'anyOne'), { ...converted(), chooser: 'rolled' });
    assert.equal(withStrategy(rolled, 'upTo'), rolled, 're-picking up to N is no edit');
    const plain = converted();
    assert.equal(withStrategy(plain, 'anyOne'), plain, 'an absent strategy is any one of');
  });

  it('N is exactly one of a fixed count of two or more and an expression', () => {
    const upTo = withStrategy(converted(), 'upTo');
    assert.equal(withCount(upTo, { quantity: 1 }).awardCount, 2, 'held at two');
    assert.equal(withCount(upTo, { quantity: 5 }).awardCount, 5);
    const rolled = withCount(upTo, { quantityFormula: '1d3' });
    assert.equal(rolled.awardCountFormula, '1d3');
    assert.equal(Object.hasOwn(rolled, 'awardCount'), false);
    assert.equal(withCount(rolled, { quantityFormula: undefined }).awardCount, 2, 'Fixed restores');
    assert.equal(
      Object.hasOwn(withCount(rolled, { quantityFormula: ' ' }), 'awardCountFormula'),
      false
    );
  });

  it('repeats and the selection are written only while set', () => {
    const rolled = withStrategy(withChooser(converted(), 'rolled'), 'upTo');
    assert.equal(
      Object.hasOwn(withRepeats(withRepeats(rolled, true), false), 'withReplacement'),
      false
    );
    assert.equal(Object.hasOwn(withSelection(rolled, '  '), 'selectionFormula'), false);
    assert.equal(withSelection(rolled, '1d20 + 2').selectionFormula, '1d20 + 2');
  });

  it('a member’s own row edit, a retype included, keeps its range', () => {
    const member = { id: 'm', componentId: 'ore', selectionRange: { from: 1, to: 4 } };
    const retyped = { id: 'm', kind: 'currency', unit: '', quantity: 1 };
    assert.deepEqual(keepingRange(member, retyped), {
      ...retyped,
      selectionRange: member.selectionRange,
    });
    assert.equal(keepingRange({ id: 'm' }, retyped), retyped, 'nothing to keep');
  });

  it('a range with neither end is no range', () => {
    const [member] = converted().alternatives;
    assert.deepEqual(withRange(member, { from: 1, to: null }).selectionRange, {
      from: 1,
      to: null,
    });
    assert.equal(
      Object.hasOwn(
        withRange({ ...member, selectionRange: { from: 1, to: 2 } }, {}),
        'selectionRange'
      ),
      false
    );
  });
});

describe('every cell saves and reads back unchanged', () => {
  const rolledBase = () =>
    withSelection(
      ranged(withChooser(converted(), 'rolled'), { from: 1, to: 10 }, { from: 11, to: 20 }),
      '1d20'
    );
  const named = (group) => ({
    ...group,
    alternatives: group.alternatives.map((member) =>
      member.kind === 'currency' ? { ...member, unit: 'gp' } : member
    ),
  });
  const CELLS = {
    'player, any one of': () => converted(),
    'player, up to N': () => withStrategy(converted(), 'upTo'),
    'rolled, any one of': () => rolledBase(),
    'rolled, up to N with repeats': () => withRepeats(withStrategy(rolledBase(), 'upTo'), true),
    'rolled, up to a rolled N': () =>
      withCount(withStrategy(rolledBase(), 'upTo'), { quantityFormula: '1d2' }),
  };

  for (const [cell, build] of Object.entries(CELLS)) {
    it(cell, () => {
      const draft = named(build());
      const saved = Result.fromJSON(draft);
      assert.deepEqual(saved.validate().errors, [], 'the authored cell is valid');
      const json = JSON.stringify(saved.toJSON());
      assert.equal(JSON.stringify(Result.fromJSON(JSON.parse(json)).toJSON()), json);
      for (const key of [
        'chooser',
        'awardStrategy',
        'awardCount',
        'awardCountFormula',
        'withReplacement',
        'selectionFormula',
      ]) {
        if (Object.hasOwn(draft, key)) {
          assert.deepEqual(saved.toJSON()[key], draft[key], `${cell} keeps ${key}`);
        }
      }
    });
  }

  it('a player group saved with the roll’s settings hidden in its draft writes none of them', () => {
    const repeats = named(withRepeats(withStrategy(rolledBase(), 'upTo'), true));
    const json = Result.fromJSON(withChooser(repeats, 'playerChooses')).toJSON();
    assert.equal(Object.hasOwn(json, 'withReplacement'), false);
    assert.equal(Object.hasOwn(json, 'selectionFormula'), false);
    assert.ok(json.alternatives.every((member) => !Object.hasOwn(member, 'selectionRange')));
    assert.deepEqual(Result.fromJSON(json).validate().errors, []);
  });
});

describe('the engine reads an edited group as authored', () => {
  const crafter = { getRollData: () => ({}) };
  const rolledBase = () =>
    withSelection(
      ranged(withChooser(converted(), 'rolled'), { from: 1, to: 10 }, { from: 11, to: 20 }),
      '1d20'
    );
  const award = async (draft, script) => {
    const awarded = [];
    const saved = Result.fromJSON(draft).toJSON();
    const answer = await awardRoutedResults([{ id: 'set', results: [saved] }], {
      actor: crafter,
      Roll: scriptedFormulaRoll(script).Roll,
      awardOne: async (result, carrier) => awarded.push([result.id, carrier?.id ?? null]),
    });
    return { ...answer, awarded };
  };

  it('a player group whose draft hides ranges becomes one pending choice of both members', async () => {
    const hidden = withChooser(withStrategy(rolledBase(), 'upTo'), 'playerChooses');
    const { pendingAwardChoices, awarded } = await award(hidden, {});
    assert.deepEqual(awarded, []);
    assert.equal(pendingAwardChoices.length, 1);
    const [choice] = pendingAwardChoices;
    assert.deepEqual([choice.awardStrategy, choice.count], ['upTo', 2]);
    assert.deepEqual(
      choice.alternatives.map((member) => member.id),
      ['m1', 'm2']
    );
  });

  it('a rolled group under a rolled N draws its count, then a selection per award', async () => {
    const draft = withCount(withStrategy(rolledBase(), 'upTo'), { quantityFormula: '1d2' });
    const { awarded, groupAwards } = await award(draft, { '1d2': [2], '1d20': [15, 3] });
    assert.deepEqual(awarded, [
      ['m2', 'r1'],
      ['m1', 'r1'],
    ]);
    assert.equal(groupAwards[0].count, 2);
  });
});

describe('the ladder’s problems', () => {
  const ladder = (...ranges) =>
    ranges.map((selectionRange, i) => ({ id: `m${i}`, selectionRange }));

  it('names the other range an overlap shares, a backwards range, and nothing for a clean one', () => {
    assert.deepEqual(rangeProblems(ladder({ from: 1, to: 10 }, { from: 10, to: 20 })), [
      { code: 'overlap', with: 1 },
      { code: 'overlap', with: 0 },
    ]);
    assert.deepEqual(rangeProblems(ladder({ from: 1, to: 9 }, { from: 15, to: 12 })), [
      null,
      { code: 'inverted' },
    ]);
    assert.deepEqual(rangeProblems(ladder({ from: 1, to: 3 }, { from: 5, to: 6 })), [null, null]);
    assert.deepEqual(rangeProblems(ladder(undefined, { from: 1, to: 2 })), [null, null]);
  });

  it('reports what blocks a save by code', () => {
    assert.deepEqual(groupProblems(converted()), []);
    assert.deepEqual(groupProblems({ id: 'g', alternatives: [ROW] }), ['tooFew']);
    assert.deepEqual(groupProblems(withChooser(converted(), 'rolled')), ['selection', 'ranges']);
    const overlapping = withSelection(
      ranged(withChooser(converted(), 'rolled'), { from: 1, to: 5 }, { from: 5, to: 6 }),
      '1d6'
    );
    assert.deepEqual(groupProblems(overlapping), ['ranges']);
    assert.deepEqual(groupProblems({ ...converted(), awardStrategy: 'upTo' }), ['count']);
    assert.deepEqual(
      groupProblems(withCount(withStrategy(converted(), 'upTo'), { quantityFormula: '1d3' })),
      []
    );
  });
});
