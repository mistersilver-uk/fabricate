// The genuinely per-entity rules of Scoped Entity Definitions (issue 1358, part of epic 1357):
// the component category fallback, the additive component tags, the STRUCTURALLY absent component
// `enabled` key, the essence soft disable, the tool requirements seed, and the tool-breakage
// authority pair.
//
// Everything that holds identically for all three entities is asserted once, in the parameterized
// contract helper in `tests/scoped-definitions.test.js`.
import test from 'node:test';
import assert from 'node:assert/strict';

const componentScope = await import('../src/systems/componentScope.js');
const essenceScope = await import('../src/systems/essenceScope.js');
const toolScope = await import('../src/systems/toolScope.js');

const {
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
  resolveComponent,
  resolveComponentCategory,
  resolveComponentTags,
} = componentScope;
const {
  essenceCarriesBehaviour,
  normalizeEssenceMemberships,
  normalizeEssenceWorldDefaults,
  resolveEssence,
} = essenceScope;
const {
  DEFAULT_TOOL_BREAKAGE_AUTHORITY,
  TOOL_BLOCKED,
  normalizeToolMemberships,
  normalizeToolWorldDefaults,
  resolveTool,
  resolveToolBreakageAuthority,
  seedToolRequirements,
  toolAttemptBlockReason,
} = toolScope;

const ENTITY_ID = 'ash-salt';
const SYSTEM_ID = 'blacksmithing';

// --- `enabled` is opt-in per entity, structurally (criterion 3) --------------------------------

test('the component answer OMITS the enabled key, and the essence and tool answers carry it', () => {
  const cases = [
    ['component', resolveComponent, normalizeComponentWorldDefaults, normalizeComponentMemberships, false],
    ['essence', resolveEssence, normalizeEssenceWorldDefaults, normalizeEssenceMemberships, true],
    ['tool', resolveTool, normalizeToolWorldDefaults, normalizeToolMemberships, true],
  ];
  for (const [label, resolve, normalizeWorld, normalizeRecords, carriesEnabled] of cases) {
    const [world] = normalizeWorld([{ id: ENTITY_ID }]);
    const [record] = normalizeRecords([{ entityId: ENTITY_ID, systemId: SYSTEM_ID }]);
    for (const membership of [null, record]) {
      const resolved = resolve(world, membership);
      assert.equal(
        'enabled' in resolved,
        carriesEnabled,
        `${label}: the key is ABSENT rather than false when the entity has no enabled flag`
      );
    }
  }
});

test('the component normalizer DROPS an enabled key from adversarial input', () => {
  const [record] = normalizeComponentMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, enabled: false },
  ]);
  assert.ok(!('enabled' in record), 'a hand-edited enabled flag is dropped, never carried');
  const [world] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, enabled: true }]);
  assert.ok(!('enabled' in world), 'a world default carries no enabled flag at any scope');
});

test('the component path exposes no enable/disable API', () => {
  const enableApis = Object.keys(componentScope).filter((name) => /enabl/i.test(name));
  assert.deepStrictEqual(enableApis, [], 'component membership is binary: present or absent');
});

// --- The component category fallback (criterion 4) ---------------------------------------------

test('an AUTHORED world category wins over the local value when inheriting', () => {
  const [world] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, category: '  ore  ' }]);
  const [record] = normalizeComponentMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, category: 'ingot' },
  ]);
  assert.equal(resolveComponent(world, record).category, 'ore');
  assert.equal(resolveComponentCategory('ore', 'ingot'), 'ore');
});

test('an UNAUTHORED world category falls through to the local value, never resetting to general', () => {
  for (const unauthored of [undefined, null, '', '   ', 0, false, []]) {
    assert.equal(
      resolveComponentCategory(unauthored, 'ingot'),
      'ingot',
      'absence and emptiness both fall through'
    );
  }
  assert.equal(resolveComponentCategory(undefined, undefined), undefined);
  assert.equal(resolveComponentCategory('', ''), undefined, 'a blank is unreachable, not minted');
});

test('a world default with no authored category carries the key ABSENT, so an inheriting system keeps its own', () => {
  const [world] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, tags: ['metal'] }]);
  assert.ok(
    !('category' in world),
    'the normalizer must NOT emit the reserved general bucket for an unauthored category'
  );
  const [record] = normalizeComponentMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, category: 'reagent' },
  ]);
  const resolved = resolveComponent(world, record);
  assert.equal(
    resolved.category,
    'reagent',
    'an authored non-general system category survives the first resolve against an empty world'
  );
  assert.equal(resolved.inherited.category, true, 'the section is still inherited; only the value falls through');
});

test('a world category the GM later deletes reaches the resolver as absence and takes the same path', () => {
  const [before] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, category: 'ore' }]);
  const [record] = normalizeComponentMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, category: 'reagent' },
  ]);
  assert.equal(resolveComponent(before, record).category, 'ore');
  const [after] = normalizeComponentWorldDefaults([{ id: ENTITY_ID }]);
  assert.equal(resolveComponent(after, record).category, 'reagent');
});

// --- Additive component tags (criterion 5) -----------------------------------------------------

test('effective tags are world tags MINUS muted PLUS system-only tags, with no inherit switch', () => {
  const [world] = normalizeComponentWorldDefaults([
    { id: ENTITY_ID, tags: ['metal', 'reagent', 'rare'] },
  ]);
  const [record] = normalizeComponentMemberships([
    {
      entityId: ENTITY_ID,
      systemId: SYSTEM_ID,
      tags: ['  forgeable  ', 'metal', 'forgeable'],
      mutedTags: ['reagent'],
    },
  ]);
  assert.deepStrictEqual(resolveComponent(world, record).tags, [
    'metal',
    'rare',
    'forgeable',
  ]);
  assert.ok(
    !('tags' in record.inherit),
    'tags carries no inherit switch at all: muting is per tag, which one switch cannot express'
  );
  assert.deepStrictEqual(resolveComponentTags(['metal'], null), ['metal']);
  assert.deepStrictEqual(resolveComponentTags(undefined, record), ['forgeable', 'metal']);
  assert.deepStrictEqual(resolveComponent(world, null).tags, ['metal', 'reagent', 'rare']);
});

// --- Essence: the soft disable, preserved verbatim (criteria 2 and 3) --------------------------

test('a disabled essence is a MEMBER that is off and keeps its overrides', () => {
  const [world] = normalizeEssenceWorldDefaults([
    { id: ENTITY_ID, effectSource: { mode: 'transfer' }, macro: { uuid: 'Macro.world' } },
  ]);
  const [record] = normalizeEssenceMemberships([
    {
      entityId: ENTITY_ID,
      systemId: SYSTEM_ID,
      enabled: false,
      inherit: { macro: false },
      macro: { uuid: 'Macro.local' },
    },
  ]);
  const resolved = resolveEssence(world, record);
  assert.equal(resolved.member, true, 'disabled is NOT absent');
  assert.equal(resolved.enabled, false);
  assert.deepStrictEqual(resolved.macro, { uuid: 'Macro.local' }, 'a disabled member keeps its overrides');
  assert.deepStrictEqual(resolved.effectSource, { mode: 'transfer' });
  assert.equal(essenceCarriesBehaviour(resolved), false, 'neither the macro nor the transfer runs');
});

test('essence enabled defaults to TRUE on a record that authored none, and a non-member is off', () => {
  const [record] = normalizeEssenceMemberships([{ entityId: ENTITY_ID, systemId: SYSTEM_ID }]);
  assert.equal(record.enabled, true);
  const resolved = resolveEssence(null, record);
  assert.equal(essenceCarriesBehaviour(resolved), true);
  const absent = resolveEssence(null, null);
  assert.equal(absent.enabled, false, 'a non-member is off because it is NOT A MEMBER');
  assert.equal(essenceCarriesBehaviour(absent), false);
});

test('the two essence inherit switches are independent', () => {
  const [world] = normalizeEssenceWorldDefaults([
    { id: ENTITY_ID, effectSource: { mode: 'world' }, macro: { uuid: 'Macro.world' } },
  ]);
  const [record] = normalizeEssenceMemberships([
    {
      entityId: ENTITY_ID,
      systemId: SYSTEM_ID,
      inherit: { effectSource: false, macro: true },
      effectSource: { mode: 'local' },
      macro: { uuid: 'Macro.local' },
    },
  ]);
  const resolved = resolveEssence(world, record);
  assert.deepStrictEqual(resolved.effectSource, { mode: 'local' });
  assert.deepStrictEqual(resolved.macro, { uuid: 'Macro.world' });
  assert.deepStrictEqual(resolved.inherited, { effectSource: false, macro: true });
});

// --- Tool: the hard block, the requirements seed, and the breakage authority (criteria 2 and 6) -

test('a tool that is absent or disabled blocks the attempt with TOOL_BLOCKED', () => {
  const [record] = normalizeToolMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, enabled: false },
  ]);
  assert.equal(toolAttemptBlockReason(resolveTool(null, record)), TOOL_BLOCKED);
  assert.equal(toolAttemptBlockReason(resolveTool(null, null)), TOOL_BLOCKED);
  const [enabled] = normalizeToolMemberships([{ entityId: ENTITY_ID, systemId: SYSTEM_ID }]);
  assert.equal(toolAttemptBlockReason(resolveTool(null, enabled)), null);
});

test('tool requirements are SEEDED once on add and never re-read from the world defaults', () => {
  const [world] = normalizeToolWorldDefaults([
    { id: ENTITY_ID, requirements: [{ id: 'group-1', options: ['whetstone'] }] },
  ]);
  const seeded = seedToolRequirements(world);
  assert.deepStrictEqual(seeded, [{ id: 'group-1', options: ['whetstone'] }]);
  assert.notEqual(seeded, world.requirements, 'the seed is a COPY, not the world list itself');
  assert.notEqual(seeded[0], world.requirements[0], 'and it is a deep copy');

  const [record] = normalizeToolMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, requirements: seeded },
  ]);
  const [rewrittenWorld] = normalizeToolWorldDefaults([
    { id: ENTITY_ID, requirements: [{ id: 'group-2', options: ['anvil'] }] },
  ]);
  assert.deepStrictEqual(
    resolveTool(rewrittenWorld, record).requirements,
    [{ id: 'group-1', options: ['whetstone'] }],
    'a later world edit never reaches a system that has already been seeded'
  );
  assert.ok(
    !('requirements' in resolveTool(rewrittenWorld, null)),
    'requirements is answered from the membership record alone, never inherited'
  );
  assert.deepStrictEqual(seedToolRequirements(null), []);
  assert.deepStrictEqual(seedToolRequirements({ requirements: 'not a list' }), []);
});

test('tool-breakage authority resolves system-over-world and never re-defaults an unauthored system', () => {
  assert.equal(
    resolveToolBreakageAuthority({ authority: 'checkDriven' }, { authority: 'toolSpecific' }),
    'toolSpecific',
    'the system value wins when authored'
  );
  for (const unauthored of [null, undefined, {}, { authority: '' }, { authority: 'tool' }]) {
    assert.equal(
      resolveToolBreakageAuthority({ authority: 'checkDriven' }, unauthored),
      'checkDriven',
      'an unauthored or unrecognized system value INHERITS rather than re-defaulting'
    );
  }
  assert.equal(
    resolveToolBreakageAuthority(null, null),
    DEFAULT_TOOL_BREAKAGE_AUTHORITY,
    'only when neither scope authors a token does the shipped default apply'
  );
  assert.equal(resolveToolBreakageAuthority({ authority: 'immune' }, null), 'toolSpecific');
  assert.equal(
    resolveToolBreakageAuthority(null, { authority: 'checkDriven' }),
    'checkDriven',
    'a world that authored nothing leaves requirement 21 exactly as it shipped'
  );
});
