/**
 * Issue 560 — 1.16.0 rename of the registered-entry source-uuid fields.
 *
 * Covers acceptance (a) migration (per-kind, idempotent, both-shape tolerant),
 * (d) migration-ordering (deriveToolSourceFromComponents new-named + 1.15.0 upcast
 * old-named in the same sequential pass), and (b) round-trip guard-regression pin
 * (a first-class tool whose OWN refs DIFFER from its linked component round-trips
 * unchanged through migrateExportPayload).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateRenameSourceUuidFields } = await import(
  '../src/migration/migrateRenameSourceUuidFields.js'
);
const { migrateToolsToFirstClass, deriveToolSourceFromComponents } = await import(
  '../src/migration/migrateToolsToFirstClass.js'
);
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');

// ---------------------------------------------------------------------------
// (a) 1.16.0 field rename — per entry kind, idempotent, both-shape tolerant
// ---------------------------------------------------------------------------

test('1.16.0 renames the three source fields on a COMPONENT entry', () => {
  const { systems } = migrateRenameSourceUuidFields([
    {
      id: 'sys',
      components: [
        {
          id: 'c1',
          sourceUuid: 'Item.live',
          sourceItemUuid: 'Compendium.pack.origin',
          fallbackItemIds: ['Item.alias'],
        },
      ],
    },
  ]);
  const comp = systems[0].components[0];
  assert.equal(comp.registeredItemUuid, 'Item.live');
  assert.equal(comp.originItemUuid, 'Compendium.pack.origin');
  assert.deepEqual(comp.aliasItemUuids, ['Item.alias']);
  assert.ok(!('sourceUuid' in comp));
  assert.ok(!('sourceItemUuid' in comp));
  assert.ok(!('fallbackItemIds' in comp));
});

test('1.16.0 renames the three source fields on a RECIPE-ITEM DEFINITION entry', () => {
  const { systems } = migrateRenameSourceUuidFields([
    {
      id: 'sys',
      recipeItemDefinitions: [
        {
          id: 'book',
          sourceUuid: 'Item.book-live',
          sourceItemUuid: 'Compendium.pack.book',
          fallbackItemIds: ['Item.book-alias'],
        },
      ],
    },
  ]);
  const def = systems[0].recipeItemDefinitions[0];
  assert.equal(def.registeredItemUuid, 'Item.book-live');
  assert.equal(def.originItemUuid, 'Compendium.pack.book');
  assert.deepEqual(def.aliasItemUuids, ['Item.book-alias']);
  assert.ok(!('sourceUuid' in def));
  assert.ok(!('sourceItemUuid' in def));
  assert.ok(!('fallbackItemIds' in def));
});

test('1.16.0 renames the three source fields on a TOOL entry', () => {
  const { systems } = migrateRenameSourceUuidFields([
    {
      id: 'sys',
      tools: [
        {
          id: 't1',
          sourceUuid: 'Item.tool-live',
          sourceItemUuid: 'Compendium.pack.tool',
          fallbackItemIds: ['Item.tool-alias'],
        },
      ],
    },
  ]);
  const tool = systems[0].tools[0];
  assert.equal(tool.registeredItemUuid, 'Item.tool-live');
  assert.equal(tool.originItemUuid, 'Compendium.pack.tool');
  assert.deepEqual(tool.aliasItemUuids, ['Item.tool-alias']);
  assert.ok(!('sourceUuid' in tool));
  assert.ok(!('sourceItemUuid' in tool));
  assert.ok(!('fallbackItemIds' in tool));
});

test('1.16.0 is idempotent: migrate(migrate(x)) deep-equals migrate(x)', () => {
  const input = () => [
    {
      id: 'sys',
      components: [{ id: 'c1', sourceUuid: 'Item.a', sourceItemUuid: 'Compendium.a' }],
      recipeItemDefinitions: [{ id: 'book', sourceItemUuid: 'Compendium.book' }],
      tools: [{ id: 't1', sourceUuid: 'Item.t', fallbackItemIds: ['Item.tx'] }],
    },
  ];
  const once = migrateRenameSourceUuidFields(input()).systems;
  const twice = migrateRenameSourceUuidFields(migrateRenameSourceUuidFields(input()).systems).systems;
  assert.deepEqual(twice, once);
});

test('1.16.0 tolerates new-only entries (no old keys) as a no-op', () => {
  const { systems } = migrateRenameSourceUuidFields([
    {
      id: 'sys',
      components: [
        { id: 'c1', registeredItemUuid: 'Item.new', originItemUuid: 'Compendium.new', aliasItemUuids: [] },
      ],
    },
  ]);
  const comp = systems[0].components[0];
  assert.equal(comp.registeredItemUuid, 'Item.new');
  assert.equal(comp.originItemUuid, 'Compendium.new');
  assert.ok(!('sourceUuid' in comp));
});

test('1.16.0 lets the NEW name win when both old and new are present, dropping the old', () => {
  const { systems } = migrateRenameSourceUuidFields([
    {
      id: 'sys',
      components: [
        {
          id: 'c1',
          registeredItemUuid: 'Item.new-wins',
          sourceUuid: 'Item.old-loses',
          sourceItemUuid: 'Compendium.old-loses',
        },
      ],
    },
  ]);
  const comp = systems[0].components[0];
  assert.equal(comp.registeredItemUuid, 'Item.new-wins');
  // originItemUuid was absent, so the old sourceItemUuid maps into it.
  assert.equal(comp.originItemUuid, 'Compendium.old-loses');
  assert.ok(!('sourceUuid' in comp));
  assert.ok(!('sourceItemUuid' in comp));
});

test('1.16.0 does not throw on malformed systems/entries', () => {
  assert.doesNotThrow(() => migrateRenameSourceUuidFields(null));
  assert.doesNotThrow(() => migrateRenameSourceUuidFields([null, 5, { id: 'x' }]));
  assert.doesNotThrow(() =>
    migrateRenameSourceUuidFields([{ id: 'x', components: [null, 'nope'] }])
  );
});

// ---------------------------------------------------------------------------
// (d) migration-ordering: shared deriveToolSourceFromComponents is both-shape
// ---------------------------------------------------------------------------

test('deriveToolSourceFromComponents derives a tool source from a NEW-named component', () => {
  const component = {
    id: 'c1',
    registeredItemUuid: 'Item.new-live',
    originItemUuid: 'Compendium.new-origin',
    aliasItemUuids: ['Item.new-alias'],
  };
  const tool = { id: 't1', componentId: 'c1' };
  const changed = deriveToolSourceFromComponents(tool, [component]);
  assert.equal(changed, true);
  assert.equal(tool.registeredItemUuid, 'Item.new-live');
  assert.equal(tool.originItemUuid, 'Compendium.new-origin');
  assert.deepEqual(tool.aliasItemUuids, ['Item.new-alias']);
});

test('1.15.0 upcasts an OLD-named component AND 1.16.0 renames it, in one sequential runner pass', async () => {
  // A world last migrated at 1.14.0 carries OLD-named components and a legacy
  // componentId-only tool. Running the full runner applies 1.15.0 (derive tool
  // source from the old-named component) THEN 1.16.0 (rename the component fields),
  // proving the shared derive helper tolerated the old names ahead of the rename.
  const store = new Map([
    ['migrationVersion', '1.14.0'],
    [
      'craftingSystems',
      [
        {
          id: 'sys',
          components: [
            { id: 'c1', sourceUuid: 'Item.old-live', sourceItemUuid: 'Compendium.old-origin' },
          ],
          tools: [{ id: 't1', componentId: 'c1' }],
        },
      ],
    ],
  ]);
  const runner = new MigrationRunner({
    getSetting: (k) => store.get(k),
    setSetting: async (k, v) => store.set(k, v),
  });
  const result = await runner.run();
  assert.equal(result.aborted, false);
  assert.equal(store.get('migrationVersion'), '1.17.0');
  const sys = store.get('craftingSystems')[0];
  // 1.16.0 renamed the component fields.
  assert.equal(sys.components[0].registeredItemUuid, 'Item.old-live');
  assert.equal(sys.components[0].originItemUuid, 'Compendium.old-origin');
  assert.ok(!('sourceUuid' in sys.components[0]));
  // 1.15.0 derived the tool source from the (then old-named) component, and 1.16.0
  // left the already-new tool refs untouched.
  assert.equal(sys.tools[0].registeredItemUuid, 'Item.old-live');
  assert.equal(sys.tools[0].originItemUuid, 'Compendium.old-origin');
  assert.ok(!('sourceUuid' in sys.tools[0]));
});

// ---------------------------------------------------------------------------
// (b) round-trip guard-regression pin: a first-class tool whose OWN refs DIFFER
// from its linked component's refs must round-trip UNCHANGED (not re-derived).
// ---------------------------------------------------------------------------

test('migrateExportPayload does NOT overwrite a NEW-named tool whose own refs differ from its component', () => {
  const payload = {
    schemaVersion: 2,
    system: {
      id: 'sys',
      components: [
        {
          id: 'c1',
          registeredItemUuid: 'Item.component-live',
          originItemUuid: 'Compendium.component-origin',
          aliasItemUuids: [],
        },
      ],
      tools: [
        {
          id: 't1',
          componentId: 'c1',
          // The tool's OWN authored refs DIFFER from the component's.
          registeredItemUuid: 'Item.tool-live',
          originItemUuid: 'Compendium.tool-origin',
          aliasItemUuids: ['Item.tool-alias'],
        },
      ],
    },
    recipes: [],
  };
  const out = migrateExportPayload(payload);
  const tool = out.system.tools[0];
  // The guard must recognize the tool as already-first-class by its NEW names and
  // leave its authored refs intact — NOT re-derive them from the linked component.
  assert.equal(tool.registeredItemUuid, 'Item.tool-live');
  assert.equal(tool.originItemUuid, 'Compendium.tool-origin');
  assert.deepEqual(tool.aliasItemUuids, ['Item.tool-alias']);
});

test('migrateExportPayload still upcasts a legacy componentId-only tool from its component', () => {
  const payload = {
    schemaVersion: 2,
    system: {
      id: 'sys',
      components: [
        {
          id: 'c1',
          registeredItemUuid: 'Item.component-live',
          originItemUuid: 'Compendium.component-origin',
          aliasItemUuids: [],
        },
      ],
      tools: [{ id: 't1', componentId: 'c1' }],
    },
    recipes: [],
  };
  const out = migrateExportPayload(payload);
  const tool = out.system.tools[0];
  assert.equal(tool.registeredItemUuid, 'Item.component-live');
  assert.equal(tool.originItemUuid, 'Compendium.component-origin');
});

// migrateToolsToFirstClass (the 1.15.0 world path) upcasts an OLD-named component too.
test('migrateToolsToFirstClass derives a tool source from an OLD-named component', () => {
  const { systems } = migrateToolsToFirstClass([
    {
      id: 'sys',
      components: [
        { id: 'c1', sourceUuid: 'Item.old-live', sourceItemUuid: 'Compendium.old-origin' },
      ],
      tools: [{ id: 't1', componentId: 'c1' }],
    },
  ]);
  const tool = systems[0].tools[0];
  assert.equal(tool.registeredItemUuid, 'Item.old-live');
  assert.equal(tool.originItemUuid, 'Compendium.old-origin');
});
