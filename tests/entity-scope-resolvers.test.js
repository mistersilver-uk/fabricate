// The genuinely per-entity rules of Scoped Entity Definitions (issue 1358, part of epic 1357):
// the component category fallback, the additive component tags, the STRUCTURALLY absent component
// `enabled` key, the essence soft disable, the tool repairRequirements seed, and the tool-breakage
// authority pair.
//
// Everything that holds identically for all three entities is asserted once, in the parameterized
// contract helper in `tests/scoped-definitions.test.js`.
import { readFile } from 'node:fs/promises';
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
  TOOL_SCOPE,
  TOOL_SEEDED_SECTIONS,
  normalizeToolMemberships,
  normalizeToolWorldDefaults,
  resolveTool,
  resolveToolBreakageAuthority,
  seedToolRepairRequirements,
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
  // A NAMING TRIPWIRE, not the enforcement. It scans exported names, so an API spelled
  // `setComponentAvailability` would sail past it; what actually holds the line is the behavioural
  // leg above — the resolver OMITS the key and the normalizer DROPS an authored one. This is kept
  // because the cheap way to reintroduce the ruled-out toggle is to name it after `enabled`.
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

test('BOTH normalizers coerce the category, so the overriding branch is as matchable as the inheriting one', () => {
  // The r1 asymmetry this pins: `resolveComponentCategory` trims, but it only runs on the
  // INHERITING branch. An overriding record's category was handed back verbatim, so `'  ingot  '`
  // resolved untrimmed and could never match `CraftingSystem.componentCategories`.
  const [world] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, category: '  ore  ' }]);
  assert.equal(world.category, 'ore', 'the world default is trimmed at the normalizer');

  const [padded] = normalizeComponentMemberships([
    {
      entityId: ENTITY_ID,
      systemId: SYSTEM_ID,
      inherit: { category: false },
      category: '  ingot  ',
    },
  ]);
  assert.equal(padded.category, 'ingot', 'and so is an OVERRIDING record');
  assert.equal(padded.inherit.category, false, 'the record really is on the overriding branch');
  assert.equal(
    resolveComponent(world, padded).category,
    'ingot',
    'the overriding branch answers a token componentCategories can match'
  );

  for (const notACategory of [42, {}, [], '   ', null, true]) {
    const [worldEntry] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, category: notACategory }]);
    assert.ok(
      !('category' in worldEntry),
      `a non-string or blank world category (${JSON.stringify(notACategory)}) normalizes to ABSENCE`
    );
    const [record] = normalizeComponentMemberships([
      {
        entityId: ENTITY_ID,
        systemId: SYSTEM_ID,
        inherit: { category: false },
        category: notACategory,
      },
    ]);
    assert.ok(!('category' in record), 'and so does a membership record it was authored on');
    assert.equal(
      resolveComponent(world, record).category,
      'ore',
      'a coerced-away section is not an override, so the world value shows'
    );
  }
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

test('an AUTHORED EMPTY tag list normalizes to ABSENT, so no reader can tell it from absence', () => {
  // The `complications` doctrine (`## Component` requirement 20): an empty list carries no meaning
  // distinct from absence, so persisting one would mint a difference the domain does not have.
  const [world] = normalizeComponentWorldDefaults([{ id: ENTITY_ID, tags: [] }]);
  assert.ok(!('tags' in world), 'an authored empty world tag list is ABSENT, not []');
  const [record] = normalizeComponentMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, tags: ['   ', ''], mutedTags: [] },
  ]);
  assert.ok(!('tags' in record), 'a list whose every entry trims away is ABSENT too');
  assert.ok(!('mutedTags' in record), 'and so is an empty muted list');
  assert.deepStrictEqual(resolveComponent(world, record).tags, [], 'the resolved set is still a list');
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

// --- Tool: the hard block, the repairRequirements seed, the breakage authority (criteria 2, 6) -

test('the SEEDED sections are disjoint from the inherited ones, and stay that way', () => {
  // Three world-default sections, TWO of them inherited. `repairRequirements` is the third and is
  // a SEED (`seedToolRepairRequirements`), so promoting it into TOOL_SECTIONS would silently give
  // it an inherit switch, a live world parent, and a UI row for a value the world scope cannot
  // even address — a repair recipe names ingredient groups over the OWNING SYSTEM's components.
  assert.deepStrictEqual([...TOOL_SEEDED_SECTIONS], ['repairRequirements']);
  for (const seeded of TOOL_SEEDED_SECTIONS) {
    assert.ok(
      !TOOL_SCOPE.sections.includes(seeded),
      `${seeded} is SEEDED, so it must never appear in the resolver's section list`
    );
  }
  const overlap = TOOL_SCOPE.sections.filter((section) => TOOL_SEEDED_SECTIONS.includes(section));
  assert.deepStrictEqual(overlap, [], 'the two lists are disjoint in both directions');
  assert.equal(
    TOOL_SCOPE.sections.length + TOOL_SEEDED_SECTIONS.length,
    3,
    'three world-default sections in total'
  );
});

test('a non-list repairRequirements value is DROPPED rather than persisted', () => {
  for (const notAList of ['not a list', 42, {}, null, true]) {
    const [world] = normalizeToolWorldDefaults([{ id: ENTITY_ID, repairRequirements: notAList }]);
    assert.ok(
      !('repairRequirements' in world),
      `a ${typeof notAList} repairRequirements value never reaches disk as one`
    );
    const [record] = normalizeToolMemberships([
      { entityId: ENTITY_ID, systemId: SYSTEM_ID, repairRequirements: notAList },
    ]);
    assert.ok(!('repairRequirements' in record), 'and the same holds on a membership record');
    assert.ok(
      !('repairRequirements' in resolveTool(world, record)),
      'so the resolver answers no repairRequirements rather than a value nothing can iterate'
    );
  }
});

test('TOOL_BLOCKED matches the code the two shipped consumers already write as a bare literal', async () => {
  // A hand-maintained mirror guard. Neither consumer is imported here: GatheringEngine drags the
  // Foundry runtime in, and gatheringBlockedReasons is a player-app UI leaf — and the point of
  // this module is that nothing depends on it yet. Epic 1357's consumer sweep (PR 8) converges
  // them onto this export; until then, a rename here fails loudly instead of silently forking the
  // vocabulary into two codes that mean the same refusal.
  const mirrors = [
    ['src/systems/GatheringEngine.js', /^\s{2}TOOL_BLOCKED: 'FABRICATE\.Gathering\.Blocked\./m],
    [
      'src/ui/svelte/apps/gathering/gatheringBlockedReasons.js',
      /^\s{2}TOOL_BLOCKED: 'FABRICATE\.App\.Gathering\./m,
    ],
  ];
  assert.equal(TOOL_BLOCKED, 'TOOL_BLOCKED', 'the constant carries the shipped code verbatim');
  for (const [file, shippedEntry] of mirrors) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, shippedEntry, `${file} still keys its blocked-reason map on this code`);
    assert.match(
      source,
      new RegExp(`^\\s{2}${TOOL_BLOCKED}: '`, 'm'),
      `${file} agrees with TOOL_BLOCKED, composed from the constant rather than re-typed`
    );
  }
});

test('a tool that is absent or disabled blocks the attempt with TOOL_BLOCKED', () => {
  const [record] = normalizeToolMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, enabled: false },
  ]);
  assert.equal(toolAttemptBlockReason(resolveTool(null, record)), TOOL_BLOCKED);
  assert.equal(toolAttemptBlockReason(resolveTool(null, null)), TOOL_BLOCKED);
  const [enabled] = normalizeToolMemberships([{ entityId: ENTITY_ID, systemId: SYSTEM_ID }]);
  assert.equal(toolAttemptBlockReason(resolveTool(null, enabled)), null);
});

test('tool repairRequirements are SEEDED once on add and never re-read from the world defaults', () => {
  const [world] = normalizeToolWorldDefaults([
    { id: ENTITY_ID, repairRequirements: [{ id: 'group-1', options: ['whetstone'] }] },
  ]);
  const seeded = seedToolRepairRequirements(world);
  assert.deepStrictEqual(seeded, [{ id: 'group-1', options: ['whetstone'] }]);
  assert.notEqual(seeded, world.repairRequirements, 'the seed is a COPY, not the world list itself');
  assert.notEqual(seeded[0], world.repairRequirements[0], 'and it is a deep copy');

  const [record] = normalizeToolMemberships([
    { entityId: ENTITY_ID, systemId: SYSTEM_ID, repairRequirements: seeded },
  ]);
  const [rewrittenWorld] = normalizeToolWorldDefaults([
    { id: ENTITY_ID, repairRequirements: [{ id: 'group-2', options: ['anvil'] }] },
  ]);
  assert.deepStrictEqual(
    resolveTool(rewrittenWorld, record).repairRequirements,
    [{ id: 'group-1', options: ['whetstone'] }],
    'a later world edit never reaches a system that has already been seeded'
  );
  assert.ok(
    !('repairRequirements' in resolveTool(rewrittenWorld, null)),
    'repairRequirements is answered from the membership record alone, never inherited'
  );
  assert.deepStrictEqual(seedToolRepairRequirements(null), []);
  assert.deepStrictEqual(seedToolRepairRequirements({ repairRequirements: 'not a list' }), []);
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
