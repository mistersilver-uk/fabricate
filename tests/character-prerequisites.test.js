import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PREREQUISITE_OPERATORS,
  DEFAULT_PREREQUISITE_OPERATOR,
  isValuelessOperator,
  resolveRollDataPath,
  evaluatePrerequisite,
  evaluatePrerequisites,
  prerequisitePreview,
  normalizeCharacterPrerequisite,
  normalizeCharacterPrerequisiteList,
} from '../src/systems/characterPrerequisites.js';
import {
  DND5E_CHARACTER_PREREQUISITE_PRESETS,
  PF2E_CHARACTER_PREREQUISITE_PRESETS,
  getCharacterPrerequisitePresetsForFoundrySystem,
  seedCharacterPrerequisitePresets,
} from '../src/config/characterPrerequisitePresets.js';

const silent = { warn: () => {} };

test('operator table: nine operators, three valueless', () => {
  assert.equal(PREREQUISITE_OPERATORS.length, 9);
  const valueless = PREREQUISITE_OPERATORS.filter((o) => o.valueless).map((o) => o.id);
  assert.deepEqual(valueless, ['isTrue', 'isFalse', 'exists']);
  assert.ok(isValuelessOperator('exists'));
  assert.ok(!isValuelessOperator('gte'));
  assert.ok(!isValuelessOperator('bogus'));
});

test('resolveRollDataPath: nested read, @ affordance, missing segments', () => {
  const rollData = { skills: { cra: { rank: 2 } }, flags: { attuned: true } };
  assert.equal(resolveRollDataPath(rollData, 'skills.cra.rank'), 2);
  assert.equal(resolveRollDataPath(rollData, '@skills.cra.rank'), 2);
  assert.equal(resolveRollDataPath(rollData, 'flags.attuned'), true);
  assert.equal(resolveRollDataPath(rollData, 'skills.arc.rank'), undefined);
  assert.equal(resolveRollDataPath(rollData, 'skills.cra.rank.deeper'), undefined);
  assert.equal(resolveRollDataPath(null, 'skills.cra.rank'), undefined);
  assert.equal(resolveRollDataPath(rollData, ''), undefined);
});

test('numeric operators compare coerced values', () => {
  const rollData = { skills: { cra: { rank: 2 } } };
  const at = (op, value) => evaluatePrerequisite(rollData, { path: 'skills.cra.rank', op, value }, silent);
  assert.ok(at('gte', 2));
  assert.ok(at('gte', 1));
  assert.ok(!at('gte', 3));
  assert.ok(at('gt', 1));
  assert.ok(!at('gt', 2));
  assert.ok(at('lte', 2));
  assert.ok(at('lt', 3));
  assert.ok(at('eq', 2));
  assert.ok(!at('eq', 3));
  assert.ok(at('neq', 3));
  // string comparand coerces
  assert.ok(evaluatePrerequisite(rollData, { path: 'skills.cra.rank', op: 'gte', value: '2' }, silent));
});

test('boolean operators coerce; exists checks presence', () => {
  const rollData = { flags: { attuned: true, cursed: false }, count: 0 };
  assert.ok(evaluatePrerequisite(rollData, { path: 'flags.attuned', op: 'isTrue' }, silent));
  assert.ok(!evaluatePrerequisite(rollData, { path: 'flags.attuned', op: 'isFalse' }, silent));
  assert.ok(evaluatePrerequisite(rollData, { path: 'flags.cursed', op: 'isFalse' }, silent));
  assert.ok(evaluatePrerequisite(rollData, { path: 'flags.attuned', op: 'exists' }, silent));
  assert.ok(!evaluatePrerequisite(rollData, { path: 'flags.missing', op: 'exists' }, silent));
  // 0 exists (present but falsy)
  assert.ok(evaluatePrerequisite(rollData, { path: 'count', op: 'exists' }, silent));
});

test('unknown path never throws: falls back to 0 / false and warns', () => {
  const warnings = [];
  const warn = (path) => warnings.push(path);
  // numeric: unknown -> 0
  assert.ok(!evaluatePrerequisite({}, { path: 'skills.cra.rank', op: 'gte', value: 1 }, { warn }));
  assert.ok(evaluatePrerequisite({}, { path: 'skills.cra.rank', op: 'lt', value: 1 }, { warn }));
  // boolean: unknown -> false
  assert.ok(!evaluatePrerequisite({}, { path: 'flags.x', op: 'isTrue' }, { warn }));
  assert.ok(evaluatePrerequisite({}, { path: 'flags.x', op: 'isFalse' }, { warn }));
  assert.ok(warnings.length >= 3);
  // exists on a missing path does not warn (a legitimate negative)
  const existsWarnings = [];
  assert.ok(!evaluatePrerequisite({}, { path: 'flags.x', op: 'exists' }, { warn: (p) => existsWarnings.push(p) }));
  assert.equal(existsWarnings.length, 0);
});

test('malformed op falls back to the default operator', () => {
  const rollData = { skills: { cra: { rank: 2 } } };
  assert.equal(DEFAULT_PREREQUISITE_OPERATOR, 'gte');
  assert.ok(evaluatePrerequisite(rollData, { path: 'skills.cra.rank', op: 'nonsense', value: 2 }, silent));
});

test('evaluatePrerequisites: AND semantics with failure previews', () => {
  const rollData = { skills: { cra: { rank: 2 } }, flags: { attuned: false } };
  const pass = evaluatePrerequisites(
    rollData,
    [
      { id: 'a', name: 'Expert', path: 'skills.cra.rank', op: 'gte', value: 2 },
      { id: 'b', name: 'Rank exists', path: 'skills.cra.rank', op: 'exists' },
    ],
    silent
  );
  assert.ok(pass.passed);
  assert.equal(pass.failures.length, 0);

  const fail = evaluatePrerequisites(
    rollData,
    [
      { id: 'a', name: 'Expert', path: 'skills.cra.rank', op: 'gte', value: 3 },
      { id: 'b', name: 'Attuned', path: 'flags.attuned', op: 'isTrue' },
    ],
    silent
  );
  assert.ok(!fail.passed);
  assert.equal(fail.failures.length, 2);
  assert.equal(fail.failures[0].name, 'Expert');
  assert.equal(fail.failures[0].preview, '@skills.cra.rank ≥ 3');
  assert.equal(fail.failures[1].preview, '@flags.attuned is true');

  // empty list passes vacuously
  assert.ok(evaluatePrerequisites(rollData, [], silent).passed);
  assert.ok(evaluatePrerequisites(rollData, null, silent).passed);
});

test('prerequisitePreview: valued and valueless shapes', () => {
  assert.equal(prerequisitePreview({ path: 'skills.cra.rank', op: 'gte', value: 2 }), '@skills.cra.rank ≥ 2');
  assert.equal(prerequisitePreview({ path: '@tools.smith.value', op: 'gte', value: 1 }), '@tools.smith.value ≥ 1');
  assert.equal(prerequisitePreview({ path: 'flags.attuned', op: 'isTrue' }), '@flags.attuned is true');
  assert.equal(prerequisitePreview({ path: 'flags.x', op: 'exists' }), '@flags.x exists');
  assert.equal(prerequisitePreview({ path: '', op: 'gte', value: 2 }), '@… ≥ 2');
});

test('normalizeCharacterPrerequisite: defaults, id fallback, valueless nulls value', () => {
  const n = normalizeCharacterPrerequisite(
    { id: ' p1 ', name: '  Expert Crafter  ', path: '@skills.cra.rank', op: 'gte', value: ' 2 ' },
    () => 'gen'
  );
  assert.deepEqual(n, {
    id: 'p1',
    name: 'Expert Crafter',
    icon: 'fa-solid fa-user-shield',
    path: 'skills.cra.rank',
    op: 'gte',
    value: '2',
  });

  // valueless op forces value to null even when supplied
  const bool = normalizeCharacterPrerequisite({ id: 'b', op: 'isTrue', path: 'flags.x', value: '9' });
  assert.equal(bool.value, null);

  // empty-string value -> null
  const empty = normalizeCharacterPrerequisite({ id: 'e', op: 'gte', path: 'x', value: '' });
  assert.equal(empty.value, null);

  // no id and no generator -> dropped
  assert.equal(normalizeCharacterPrerequisite({ name: 'x' }), null);
  // generator supplies id
  assert.equal(normalizeCharacterPrerequisite({ name: 'x' }, () => 'gen').id, 'gen');

  // defaults for a bare entry
  const bare = normalizeCharacterPrerequisite({ id: 'z' });
  assert.equal(bare.name, 'Prerequisite');
  assert.equal(bare.op, 'gte');
  assert.equal(bare.path, '');
});

test('normalizeCharacterPrerequisiteList: drops unassignable, keeps order', () => {
  const list = normalizeCharacterPrerequisiteList(
    [{ id: 'a', op: 'gte', path: 'x', value: 1 }, { name: 'no id' }, { id: 'b', op: 'exists', path: 'y' }],
    () => ''
  );
  assert.deepEqual(list.map((e) => e.id), ['a', 'b']);
  assert.equal(normalizeCharacterPrerequisiteList('nope').length, 0);
});

test('presets: bundles keyed by foundry system id', () => {
  assert.ok(DND5E_CHARACTER_PREREQUISITE_PRESETS.length > 0);
  assert.ok(PF2E_CHARACTER_PREREQUISITE_PRESETS.length > 0);
  assert.equal(getCharacterPrerequisitePresetsForFoundrySystem('dnd5e'), DND5E_CHARACTER_PREREQUISITE_PRESETS);
  assert.equal(getCharacterPrerequisitePresetsForFoundrySystem('pf2e'), PF2E_CHARACTER_PREREQUISITE_PRESETS);
  assert.deepEqual(getCharacterPrerequisitePresetsForFoundrySystem('cyberpunk'), []);
  // every preset entry is a well-formed prerequisite
  for (const preset of [...DND5E_CHARACTER_PREREQUISITE_PRESETS, ...PF2E_CHARACTER_PREREQUISITE_PRESETS]) {
    const normalized = normalizeCharacterPrerequisite(preset);
    assert.equal(normalized.id, preset.id);
    assert.ok(normalized.path.length > 0);
  }
});

test('seedCharacterPrerequisitePresets: idempotent merge preserves existing ids', () => {
  const first = seedCharacterPrerequisitePresets({ presets: DND5E_CHARACTER_PREREQUISITE_PRESETS, currentLibrary: [] });
  assert.equal(first.added.length, DND5E_CHARACTER_PREREQUISITE_PRESETS.length);
  assert.equal(first.skipped.length, 0);

  // second call over the seeded library adds nothing
  const second = seedCharacterPrerequisitePresets({
    presets: DND5E_CHARACTER_PREREQUISITE_PRESETS,
    currentLibrary: first.next,
  });
  assert.equal(second.added.length, 0);
  assert.equal(second.skipped.length, DND5E_CHARACTER_PREREQUISITE_PRESETS.length);
  assert.equal(second.next.length, first.next.length);

  // an edited existing entry survives re-seeding untouched
  const edited = first.next.map((e) => ({ ...e, name: `${e.name} (edited)` }));
  const third = seedCharacterPrerequisitePresets({
    presets: DND5E_CHARACTER_PREREQUISITE_PRESETS,
    currentLibrary: edited,
  });
  assert.ok(third.next.every((e) => e.name.endsWith('(edited)')));
});
