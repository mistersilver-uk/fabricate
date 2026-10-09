/** Resume pairing of a stage's planned tool items with its Tools (issue 2265). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { pairPlannedTools } from '../src/systems/plannedToolPairs.js';

const tool = (id) => ({ id });
const item = (uuid, ...toolIds) => ({ uuid, toolIds });

// Identity matching only: an item matches each Tool id it is stamped with.
function manager(tools) {
  return {
    getToolsForSet: () => tools,
    toolMatchesItemByIdentity: (_recipe, candidate, owned) => owned.toolIds.includes(candidate.id),
    toolMatchesItem: () => false,
  };
}

const pair = (tools, items, applied = false) =>
  pairPlannedTools(manager(tools), {}, {}, { items, applied });
const shape = (pairs) =>
  pairs.map((entry) => [entry.tool.id, entry.item?.uuid ?? null, entry.virtual === true]);

test('a Tool with no planned item is the virtual station Tool it was planned as', () => {
  const [station, anvil] = [tool('station'), tool('anvil')];
  const owned = item('Item.anvil', 'anvil');
  assert.deepEqual(shape(pair([station], [])), [['station', null, true]], 'station only');
  assert.deepEqual(shape(pair([station, anvil], [owned])), [
    ['station', null, true],
    ['anvil', 'Item.anvil', false],
  ]);
  assert.deepEqual(shape(pair([anvil, station], [owned])), [
    ['anvil', 'Item.anvil', false],
    ['station', null, true],
  ]);
});

test('owned Tools pair by match in Tool order, duplicates included', () => {
  const tools = [tool('hammer'), tool('tongs'), tool('file')];
  const items = [item('Item.h', 'hammer'), item('Item.t', 'tongs'), item('Item.f', 'file')];
  assert.deepEqual(shape(pair(tools, items)), [
    ['hammer', 'Item.h', false],
    ['tongs', 'Item.t', false],
    ['file', 'Item.f', false],
  ]);
  // Two Tools satisfied by one kind of item each take their own planned occurrence.
  const both = item('Item.kit', 'left', 'right');
  assert.deepEqual(shape(pair([tool('left'), tool('right')], [both, both])), [
    ['left', 'Item.kit', false],
    ['right', 'Item.kit', false],
  ]);
});

test('an unmatched planned item is refused, never handed a station-supplied Tool', () => {
  const tools = [tool('station'), tool('anvil')];
  const stray = item('Item.stray');
  assert.throws(
    () => pair(tools, [stray]),
    (error) => error.code === 'STAGE_RECONSTRUCTION_FAILED',
    'a plan still to apply refuses rather than breaking the station Tool through the stray item'
  );
  assert.throws(() => pair(tools, [null]), { code: 'STAGE_RECONSTRUCTION_FAILED' });
});

test('an applied tool effect replays from its receipt, so a destroyed item is not refused', () => {
  const pairs = pair([tool('anvil')], [item('Item.destroyed')], true);
  assert.equal(pairs.length, 1, 'the Tool still yields a pair, so the effect is rebuilt');
  assert.ok(pairs.every((entry) => entry.item?.uuid !== 'Item.destroyed'));
});
