import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBulkPromptData, promptBulkCheckRoll } from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';

const subjects = [
  { name: 'Ore', need: { kind: 'dc', dc: 17 } },
  { name: 'Scrap', need: { kind: 'noCheck' } },
  { name: 'Map', need: { kind: 'noSingleTarget' } },
];

async function open(args, answer) {
  const surface = stubPromptSurface(() => answer);
  try {
    const result = await promptBulkCheckRoll(args);
    return { view: surface.view, result };
  } finally {
    surface.restore();
  }
}

describe('bulk roll prompt adapter', () => {
  it('preserves one decision for a mixed batch', async () => {
    const { view, result } = await open(
      { count: 3, subjects },
      { confirmed: true, bonus: '+3', rollMode: 'blindroll', advantage: 'normal' }
    );
    assert.equal(view.kind, 'bulk');
    assert.equal(view.allowAdvantage, false);
    assert.deepEqual(
      view.subjects,
      subjects.map((subject, index) => ({ ...subject, needText: ['DC 17', 'No check', 'No single target'][index] })),
      'each need arrives formatted beside its raw shape'
    );
    assert.equal(view.dcText, '', 'a batch has no single DC');
    assert.deepEqual(result, { confirmed: true, bonus: '3', rollMode: 'blindroll', advantage: 'normal' });
  });

  it('formats a roll-under row as a target', async () => {
    const { view } = await open({ count: 1, subjects: [{ name: 'Gear', need: { kind: 'target', target: 12 } }] }, null);
    assert.equal(view.subjects[0].needText, 'Target 12');
  });

  it('counts the batch, not the rows, and names the activity and one actor when known', () => {
    assert.equal(buildBulkPromptData({ count: 25, subjects }).subtitle, '25 items');
    assert.equal(buildBulkPromptData({ subjects: [...subjects, subjects[0]] }).subtitle, '4 items');
    const fallback = buildBulkPromptData({ count: 3 });
    assert.equal(fallback.title, 'Bulk check');
    assert.deepEqual(fallback.subjects, []);
    const named = buildBulkPromptData({ count: 3, subjects, activity: 'Salvage', actorName: 'Brenna' });
    assert.equal(named.title, 'Salvage checks');
    assert.equal(named.subtitle, 'Brenna · 3 items');
    assert.equal(buildBulkPromptData({ count: 2, activity: '$&', actorName: '$1' }).subtitle, '$1 · 2 items');
  });

  it('computes direction from the rows: all-target is under, otherwise over', () => {
    const under = [{ need: { kind: 'target', target: 12 } }, { need: { kind: 'target', target: 9 } }];
    const mixed = [{ need: { kind: 'target', target: 12 } }, { need: { kind: 'dc', dc: 15 } }];
    assert.equal(buildBulkPromptData({ subjects: under }).direction, 'under');
    assert.equal(buildBulkPromptData({ subjects: mixed }).direction, 'over');
    assert.equal(buildBulkPromptData({ subjects: [] }).direction, 'over');
  });

  it('gives an all-target batch the roll-under bonus help; a mixed batch keeps roll-over copy', async () => {
    const under = [
      { name: 'Tempered Blade', need: { kind: 'target', target: 12 } },
      { name: 'Fitted Hilt', need: { kind: 'target', target: 9 } },
    ];
    const mixed = [
      { name: 'Tempered Blade', need: { kind: 'target', target: 12 } },
      { name: 'Ore', need: { kind: 'dc', dc: 17 } },
    ];
    const { view: underView } = await open({ subjects: under }, null);
    assert.equal(
      underView.labels.bonusHelp,
      'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    const { view: mixedView } = await open({ subjects: mixed }, null);
    assert.equal(
      mixedView.labels.bonusHelp,
      'A bonus adds to the total. A rolled bonus such as 1d4 is rolled with the check.'
    );
  });

  it('keeps count-only companion calls operable without subjects', async () => {
    const { view, result } = await open({ count: 3 }, { confirmed: true, bonus: '' });
    assert.deepEqual(view.subjects, []);
    assert.equal(view.subtitle, '3 items');
    assert.deepEqual(result, { confirmed: true, bonus: null, rollMode: 'publicroll', advantage: 'normal' });
  });

  it('offers the unchanged three advantage results', async () => {
    const { view, result } = await open(
      { allowAdvantage: true, subjects },
      { confirmed: true, advantage: 'advantage' }
    );
    assert.equal(view.allowAdvantage, true);
    assert.equal(result.advantage, 'advantage');
    assert.ok(!Object.hasOwn(result, 'chosenModifierIds'), 'a batch offers no modifier choice');
  });

  it('normalizes dismissal and confirms headlessly', async () => {
    assert.deepEqual((await open({ subjects }, null)).result, { confirmed: false });
    assert.deepEqual(await promptBulkCheckRoll({ count: 3 }), {
      confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal',
    });
  });
});
