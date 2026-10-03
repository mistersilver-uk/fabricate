/** `recordPickerOptions` (issue 1521): the two record pickers' option list and trigger label. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recordPickerOptions } from '../../src/ui/svelte/apps/manager/recordPickerOptions.js';

const RECORDS = [
  { id: 'a', name: 'Ashlands', enabled: true },
  { id: 'b', name: 'Barrows', enabled: false },
  { id: 'c', name: 'Coldmere' },
  { id: 'd', name: '', enabled: true },
];

const build = (value) =>
  recordPickerOptions({
    records: RECORDS,
    value,
    leading: { label: 'Auto', icon: 'fas fa-lead' },
    recordIcon: 'fas fa-record',
    disabledSuffix: '(disabled)',
    staleLabel: 'Unknown realm',
  });

describe('recordPickerOptions', () => {
  it('leads with the clear option, then one option per record in order', () => {
    const { options } = build('');
    assert.deepEqual(options[0], { id: '', label: 'Auto', icon: 'fas fa-lead' });
    assert.deepEqual(
      options.slice(1).map((option) => [option.id, option.label, option.icon]),
      RECORDS.map((record) => [record.id, record.name, 'fas fa-record'])
    );
  });

  it('trails the disabled suffix on every record not enabled, an unset flag included', () => {
    assert.deepEqual(
      build('').options.map((option) => option.trailing),
      [undefined, '', '(disabled)', '(disabled)', '']
    );
  });

  it('labels the trigger with the leading label when no value is set', () => {
    assert.equal(build(null).selectedName, 'Auto');
    assert.equal(build('').selectedName, 'Auto');
  });

  it('labels the trigger with the chosen record, or the stale label for a nameless one', () => {
    assert.equal(build('b').selectedName, 'Barrows');
    assert.equal(build('d').selectedName, 'Unknown realm');
  });

  it('labels an unknown id stale and never adds it to the options', () => {
    const { options, selectedName } = build('gone');
    assert.equal(selectedName, 'Unknown realm');
    assert.ok(
      options.every((option) => option.id !== 'gone'),
      'a stale id is not offered'
    );
    assert.equal(options.length, RECORDS.length + 1);
  });
});
