/** Issue 1687 — the loop helpers every per-system migration walks its crafting-systems array with. */
import test from 'node:test';
import assert from 'node:assert/strict';

const { forEachSystem, mapSystems } = await import('../src/migration/migrationHelpers.js');

const NON_ARRAYS = [null, undefined, 'systems', 42, { systems: [] }];
const NON_OBJECTS = [null, 'x', []];

/** A spy recording every `(system, index)` pair it was called with. */
function spy(result = (system) => system) {
  const calls = [];
  const fn = (system, index) => {
    calls.push({ system, index });
    return result(system, index);
  };
  return { fn, calls };
}

test('a non-array input visits nothing and maps to an empty array', () => {
  for (const systems of NON_ARRAYS) {
    const walk = spy();
    assert.strictEqual(
      forEachSystem(systems, walk.fn),
      undefined,
      `forEachSystem must return undefined for ${JSON.stringify(systems) ?? 'undefined'}`
    );
    assert.deepStrictEqual(walk.calls, [], 'a non-array must not be walked');

    const mapped = spy();
    assert.deepStrictEqual(
      mapSystems(systems, mapped.fn),
      [],
      `mapSystems must return [] for ${JSON.stringify(systems) ?? 'undefined'}`
    );
    assert.deepStrictEqual(mapped.calls, [], 'a non-array must not be mapped');
  }
});

test('a non-object entry is skipped, and mapSystems passes it through by reference', () => {
  const systems = [...NON_OBJECTS, { id: 'sys' }];
  const walk = spy();
  forEachSystem(systems, walk.fn);
  assert.deepStrictEqual(
    walk.calls.map((call) => call.index),
    [3],
    'only the plain-object entry is visited'
  );

  const mapped = spy(() => ({ id: 'rebuilt' }));
  const result = mapSystems(systems, mapped.fn);
  assert.deepStrictEqual(
    mapped.calls.map((call) => call.index),
    [3],
    'only the plain-object entry is mapped'
  );
  for (let index = 0; index < NON_OBJECTS.length; index += 1) {
    assert.strictEqual(
      result[index],
      systems[index],
      'a non-object entry passes through by reference, not as a copy'
    );
  }
  assert.deepStrictEqual(result[3], { id: 'rebuilt' }, 'and the plain object goes through fn');
});

test('index is the original position, across one and across two consecutive skipped entries', () => {
  const first = { id: 'a' };
  const last = { id: 'b' };
  for (const [systems, expected] of [
    [[first, null, last], [0, 2]],
    [[first, null, 'x', last], [0, 3]],
    [[null, 'x', first, [], last], [2, 4]],
  ]) {
    const walk = spy();
    forEachSystem(systems, walk.fn);
    assert.deepStrictEqual(
      walk.calls.map((call) => call.index),
      expected,
      'a skipped entry still advances the index'
    );

    const mapped = spy();
    mapSystems(systems, mapped.fn);
    assert.deepStrictEqual(
      mapped.calls.map((call) => call.index),
      expected,
      'mapSystems reports the same positions'
    );
  }
});

test('entries are visited in strictly ascending position order', () => {
  const systems = [{ id: 'a' }, null, { id: 'b' }, 'x', { id: 'c' }, { id: 'd' }];
  const walk = spy();
  forEachSystem(systems, walk.fn);

  assert.deepStrictEqual(
    walk.calls.map((call) => call.system.id),
    ['a', 'b', 'c', 'd'],
    'the first enabled system a migration takes depends on this order'
  );
  const positions = walk.calls.map((call) => call.index);
  assert.deepStrictEqual(positions, [0, 2, 4, 5], 'and each position is the original one');
  for (let step = 1; step < positions.length; step += 1) {
    assert.ok(positions[step] > positions[step - 1], 'positions must strictly ascend');
  }
});

test('neither helper clones: fn receives the entry itself and its writes land on the input', () => {
  const systems = [{ id: 'a' }, { id: 'b' }];
  forEachSystem(systems, (system, index) => {
    assert.strictEqual(system, systems[index], 'forEachSystem hands over the entry itself');
    system.walked = true;
  });
  assert.deepStrictEqual(
    systems.map((system) => system.walked),
    [true, true],
    'a mutation fn performs is visible on the caller’s own entry'
  );

  mapSystems(systems, (system, index) => {
    assert.strictEqual(system, systems[index], 'mapSystems hands over the entry itself');
    system.mapped = true;
    return system;
  });
  assert.deepStrictEqual(
    systems.map((system) => system.mapped),
    [true, true],
    'and so is one performed under mapSystems'
  );
});

test('mapSystems returns a new array and writes nothing back into the caller’s', () => {
  const systems = [{ id: 'a' }, null, { id: 'b' }];
  const before = [...systems];

  const identity = mapSystems(systems, (system) => system);
  assert.notStrictEqual(identity, systems, 'the result is a new array');
  for (let index = 0; index < systems.length; index += 1) {
    assert.strictEqual(identity[index], systems[index], 'every element is the input element');
  }

  const rebuilt = mapSystems(systems, (system) => ({ ...system, rebuilt: true }));
  for (let index = 0; index < before.length; index += 1) {
    assert.strictEqual(
      systems[index],
      before[index],
      'the input array must be left alone — MigrationRunner detects change by comparing it'
    );
  }
  assert.deepStrictEqual(rebuilt[0], { id: 'a', rebuilt: true }, 'the rebuild lands in the result');
  assert.strictEqual(rebuilt[1], null, 'and the skipped entry is still there');
});
