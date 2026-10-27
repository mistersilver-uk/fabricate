/** The two vocabularies both studios' stage complication lists name a macro and a trigger by (issue 2446). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  complicationMacroNames,
  complicationTriggerLabels,
} from '../src/ui/svelte/apps/manager/complicationVocabularies.js';

describe('complicationMacroNames', () => {
  it('maps each macro uuid to its name, the uuid standing in for a nameless one', () => {
    const names = complicationMacroNames([
      { uuid: 'Macro.burst', name: 'Shrapnel Burst' },
      { uuid: 'Macro.blank', name: '' },
    ]);
    assert.deepEqual(
      [...names],
      [
        ['Macro.burst', 'Shrapnel Burst'],
        ['Macro.blank', 'Macro.blank'],
      ]
    );
  });

  it('drops an option with no uuid, and reads an absent list as empty', () => {
    assert.deepEqual([...complicationMacroNames([null, { name: 'Orphan' }, { uuid: '' }])], []);
    assert.equal(complicationMacroNames(undefined).size, 0);
    assert.equal(complicationMacroNames(null).size, 0);
  });
});

describe('complicationTriggerLabels', () => {
  it('maps each trigger id to its label, the id standing in for an unlabelled one', () => {
    const labels = complicationTriggerLabels([
      { id: 'trig-snap', label: 'the spring snaps', activity: 'crafting' },
      { id: 'trig-bare', activity: 'salvage' },
    ]);
    assert.deepEqual(
      [...labels],
      [
        ['trig-snap', 'the spring snaps'],
        ['trig-bare', 'trig-bare'],
      ]
    );
  });

  it('keeps only the named activity’s triggers, so a shared id takes that activity’s label', () => {
    const options = [
      { id: 'trig-snap', label: 'the spring snaps', activity: 'crafting' },
      { id: 'trig-snap', label: 'the salvage jams', activity: 'salvage' },
      { id: 'trig-gather', label: 'the node crumbles', activity: 'gathering' },
    ];
    assert.deepEqual(
      [...complicationTriggerLabels(options, 'crafting')],
      [['trig-snap', 'the spring snaps']]
    );
    assert.deepEqual(
      [...complicationTriggerLabels(options, 'salvage')],
      [['trig-snap', 'the salvage jams']]
    );
  });

  it('drops an option with no id, and reads an absent list as empty', () => {
    assert.deepEqual([...complicationTriggerLabels([null, { label: 'Orphan' }, { id: '' }])], []);
    assert.equal(complicationTriggerLabels(undefined).size, 0);
  });
});
