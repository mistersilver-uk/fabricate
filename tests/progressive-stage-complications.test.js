import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { gmComplications } from '../src/systems/complicationRuntime.js';
import { InventoryListingBuilder } from '../src/systems/InventoryListingBuilder.js';
import {
  attachStageComplications,
  checkTriggerIdsOf,
  markFiredStageComplications,
} from '../src/utils/progressiveStageComplications.js';

import { authoredComplication } from './helpers/complicationFixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The shared authored-complication fixture, with a per-test id and name. */
const complication = ({ id, name = id, ...rest } = {}) =>
  authoredComplication({ id, name, description: `${name} description`, ...rest });

function componentIndex(components) {
  return new Map(components.map((component) => [component.id, component]));
}

/** A stage row in the shape both listing builders publish. */
function stage(id, componentId) {
  return { id, componentId, name: componentId, img: null, difficulty: 1, threshold: 1 };
}

// ---------------------------------------------------------------------------
// The pure boundary
// ---------------------------------------------------------------------------

describe('1286: attachStageComplications — the player forecast', () => {
  const shrapnel = complication({ id: 'x1', name: 'Shrapnel' });
  const curse = complication({ id: 'x2', name: 'Curse', visibility: 'gmOnly' });
  const components = [
    { id: 'iron', name: 'Iron', complications: [shrapnel, curse] },
    { id: 'coal', name: 'Coal' },
  ];

  it('drops a gmOnly complication that the GM projection still carries', () => {
    const [row] = attachStageComplications([stage('r1', 'iron')], {
      componentById: componentIndex(components),
      activity: 'salvage',
    });
    assert.deepEqual(
      row.complications.map((entry) => entry.name),
      ['Shrapnel'],
      'the player sees only the visible one'
    );

    // The SAME authored record, read through the GM-facing projection, still carries it —
    // so this is a redaction of the player view and not a loss of the GM's data.
    const gmView = gmComplications([
      { componentId: 'iron', complicationId: 'x2', complication: curse, buckets: ['halted'] },
    ]);
    assert.deepEqual(
      gmView.map((entry) => entry.name),
      ['Curse']
    );
  });

  it('never emits when, rollCondition, effectRoll or macroUuid', () => {
    const [row] = attachStageComplications([stage('r1', 'iron')], {
      componentById: componentIndex(components),
      activity: 'salvage',
    });
    for (const key of ['when', 'rollCondition', 'effectRoll', 'macroUuid', 'activities', 'match']) {
      assert.ok(!(key in row.complications[0]), `the player projection leaked ${key}`);
    }
    assert.deepEqual(Object.keys(row.complications[0]).sort(), [
      'description',
      'fired',
      'id',
      'name',
      'severity',
      'visibility',
    ]);
  });

  it('is ADDITIVE: an untouched list comes back by identity, row objects included', () => {
    const stages = [stage('r1', 'coal'), stage('r2', 'coal')];
    const attached = attachStageComplications(stages, {
      componentById: componentIndex(components),
      activity: 'salvage',
    });
    assert.equal(attached, stages, 'the same array, so a caller cannot observe a rebuild');

    // And row-by-row when only SOME stages carry any.
    const mixed = [stage('r1', 'coal'), stage('r2', 'iron')];
    const out = attachStageComplications(mixed, {
      componentById: componentIndex(components),
      activity: 'salvage',
    });
    assert.notEqual(out, mixed);
    assert.equal(out[0], mixed[0], 'the complication-less row is the SAME object');
    assert.notEqual(out[1], mixed[1]);
  });

  it('respects the activity: a salvage-only complication is absent from a crafting forecast', () => {
    const salvageOnly = complication({ id: 'x3', name: 'Slip' });
    salvageOnly.activities = { crafting: false, salvage: true, gathering: false };
    const byId = componentIndex([{ id: 'iron', name: 'Iron', complications: [salvageOnly] }]);

    const salvage = attachStageComplications([stage('r1', 'iron')], {
      componentById: byId,
      activity: 'salvage',
    });
    assert.equal(salvage[0].complications.length, 1);

    const rows = [stage('r1', 'iron')];
    const crafting = attachStageComplications(rows, { componentById: byId, activity: 'crafting' });
    assert.equal(crafting, rows, 'nothing attached, so the identity contract holds');
    assert.ok(!('complications' in crafting[0]), 'and no key at all on the wrong activity');
  });

  it('excludes a complication that provably cannot fire', () => {
    const inert = complication({ id: 'x4', name: 'Inert', when: {} });
    const foreign = complication({ id: 'x5', name: 'Foreign', when: { checkTrigger: 'other' } });
    const owned = complication({ id: 'x6', name: 'Owned', when: { checkTrigger: 'mine' } });
    const byId = componentIndex([
      { id: 'iron', name: 'Iron', complications: [inert, foreign, owned] },
    ]);

    const [row] = attachStageComplications([stage('r1', 'iron')], {
      componentById: byId,
      activity: 'salvage',
      checkBreakage: { triggers: [{ id: 'mine' }, { id: '  ' }] },
    });
    assert.deepEqual(
      row.complications.map((entry) => entry.name),
      ['Owned'],
      'no enabled clause, and a foreign trigger id, both drop out'
    );
  });

  it('reads a check block trigger ids, trimmed, ignoring the unusable ones', () => {
    assert.deepEqual(
      checkTriggerIdsOf({ triggers: [{ id: ' a ' }, { id: '' }, {}, { id: 'b' }] }),
      ['a', 'b']
    );
    assert.deepEqual(checkTriggerIdsOf(null), []);
  });
});

describe('1286: markFiredStageComplications — the resolved tense', () => {
  const shrapnel = complication({ id: 'x1', name: 'Shrapnel' });
  const curse = complication({ id: 'x2', name: 'Curse', visibility: 'gmOnly' });
  const byId = componentIndex([{ id: 'iron', name: 'Iron', complications: [shrapnel, curse] }]);

  /** The same component staged twice — the case the whole per-entry rule exists for. */
  function twice() {
    return attachStageComplications([stage('r1', 'iron'), stage('r2', 'iron')], {
      componentById: byId,
      activity: 'salvage',
    });
  }

  it('forecasts per RESULT ENTRY but fires ONCE, on the occurrence the record names', () => {
    const stages = twice();
    assert.deepEqual(
      stages.map((row) => row.complications.map((entry) => entry.name)),
      [['Shrapnel'], ['Shrapnel']],
      'a component listed twice is warned about on both entries'
    );

    const marked = markFiredStageComplications(stages, [
      { resultId: 'r2', componentId: 'iron', complicationId: 'x1' },
    ]);
    assert.deepEqual(
      marked.map((row) => row.complications.map((entry) => entry.fired)),
      [[false], [true]],
      'the second occurrence fired; the first did not'
    );
  });

  it('distinguishes fired from forecast after a resolution that fired nothing', () => {
    const stages = twice();
    assert.deepEqual(
      stages.map((row) => row.complications[0].fired),
      [false, false],
      'the pre-roll forecast claims nothing'
    );
    const marked = markFiredStageComplications(stages, [
      { resultId: 'r1', componentId: 'iron', complicationId: 'x1' },
    ]);
    assert.equal(marked[0].complications[0].fired, true);
    assert.equal(marked[1].complications[0].fired, false);
  });

  it('falls back to the first occurrence when the record names no stage', () => {
    const marked = markFiredStageComplications(twice(), [
      { resultId: null, componentId: 'iron', complicationId: 'x1' },
    ]);
    assert.deepEqual(
      marked.map((row) => row.complications[0].fired),
      [true, false]
    );
  });

  it('marks once for two records naming the same (componentId, complicationId)', () => {
    const marked = markFiredStageComplications(twice(), [
      { resultId: 'r1', componentId: 'iron', complicationId: 'x1' },
      { resultId: 'r2', componentId: 'iron', complicationId: 'x1' },
    ]);
    assert.deepEqual(
      marked.map((row) => row.complications[0].fired),
      [true, false],
      'the dedupe key is the runtime firing key, not the stage'
    );
  });

  it('MARKS but never ADDS: an unredacted gmOnly record surfaces nothing', () => {
    const stages = twice();
    const marked = markFiredStageComplications(stages, [
      { resultId: 'r1', componentId: 'iron', complicationId: 'x2', name: 'Curse' },
    ]);
    assert.equal(marked, stages, 'nothing matched, so the input comes back by identity');
    assert.deepEqual(
      marked.flatMap((row) => row.complications.map((entry) => entry.name)),
      ['Shrapnel', 'Shrapnel'],
      'the gmOnly complication is still absent'
    );
  });

  it('leaves a runless list alone, by identity', () => {
    const stages = twice();
    assert.equal(markFiredStageComplications(stages, null), stages);
    assert.equal(markFiredStageComplications(stages, []), stages);
  });
});

// ---------------------------------------------------------------------------
// InventoryListingBuilder — the player salvage view-model
// ---------------------------------------------------------------------------

const OWNED_ITEM = { name: 'Anvil', system: { quantity: 1 } };

function salvageSystemWith({ complications = [], results, trigger = null } = {}) {
  return {
    id: 'sys-1',
    name: 'Smithing',
    features: { salvage: true },
    salvageResolutionMode: 'progressive',
    // The RECIPE block, deliberately carrying a DIFFERENT trigger id space: a forecast
    // filtered against it would drop the salvage complication below.
    craftingCheck: { progressive: { rollFormula: '1d20', checkBreakage: { triggers: [] } } },
    salvageCraftingCheck: {
      progressive: {
        rollFormula: '1d20 + 4',
        awardMode: 'equal',
        ...(trigger ? { checkBreakage: { triggers: [{ id: trigger }] } } : {}),
      },
    },
    tools: [],
    components: [
      {
        id: 'anvil',
        name: 'Anvil',
        img: 'icons/anvil.webp',
        essences: {},
        difficulty: 5,
        salvage: {
          enabled: true,
          resultGroups: [
            {
              id: 'g1',
              results: results ?? [
                { id: 'r1', componentId: 'iron' },
                { id: 'r2', componentId: 'iron' },
                { id: 'r3', componentId: 'coal' },
              ],
            },
          ],
        },
      },
      {
        id: 'iron',
        name: 'Iron',
        img: 'icons/iron.webp',
        essences: {},
        difficulty: 2,
        complications,
      },
      { id: 'coal', name: 'Coal', img: 'icons/coal.webp', essences: {}, difficulty: 3 },
    ],
  };
}

function salvageViewModel(system) {
  const builder = new InventoryListingBuilder({
    recipeManager: { getRecipes: () => [], toolMatchesItem: () => false },
    craftingSystemManager: { getSystems: () => [system] },
  });
  const listing = builder.buildListing({
    craftingActor: { id: 'a1', name: 'Akra', items: [OWNED_ITEM] },
    // A GM VIEWER, deliberately. The redaction below is keyed on the complication's
    // authored audience and never on the acting user's role, so asserting it against the
    // most privileged viewer is what proves the filter is not an `isGM` test wearing a
    // different name — the exact leak `publicComplications` documents.
    viewer: { isGM: true, id: 'gm' },
  });
  return listing.rows.find((row) => row.componentId === 'anvil')?.salvage ?? null;
}

describe('1286: InventoryListingBuilder publishes the player complication forecast', () => {
  it('attaches the forecast to the stage that produces the component', () => {
    const salvage = salvageViewModel(
      salvageSystemWith({ complications: [complication({ id: 'x1', name: 'Shrapnel' })] })
    );
    assert.equal(salvage.mode, 'progressive');
    assert.deepEqual(
      salvage.stages.map((row) => [row.id, (row.complications ?? []).map((c) => c.name)]),
      [
        ['r1', ['Shrapnel']],
        ['r2', ['Shrapnel']],
        ['r3', []],
      ],
      'both Iron entries are warned; the Coal entry has no key at all'
    );
    assert.ok(!('complications' in salvage.stages[2]));
    assert.equal(salvage.stages[0].complications[0].fired, false, 'pre-roll, nothing has fired');
  });

  it('filters the forecast with SALVAGE own trigger ids, not the recipe block', () => {
    const clause = complication({ id: 'x1', name: 'Shrapnel', when: { checkTrigger: 'salv-1' } });
    const owned = salvageViewModel(
      salvageSystemWith({ complications: [clause], trigger: 'salv-1' })
    );
    assert.equal(owned.stages[0].complications.length, 1);

    const foreign = salvageViewModel(
      salvageSystemWith({ complications: [clause], trigger: 'something-else' })
    );
    assert.ok(!('complications' in foreign.stages[0]), 'a foreign trigger id cannot fire');
  });

  it('is byte-identical for a component with no PLAYER-VISIBLE complication', () => {
    const none = salvageViewModel(salvageSystemWith({}));
    const gmOnly = salvageViewModel(
      salvageSystemWith({
        complications: [complication({ id: 'x1', name: 'Curse', visibility: 'gmOnly' })],
      })
    );
    assert.equal(
      JSON.stringify(gmOnly),
      JSON.stringify(none),
      'authoring a gmOnly complication changes the player view-model by not one byte'
    );
    assert.deepEqual(
      Object.keys(none.stages[0]),
      ['id', 'componentId', 'name', 'img', 'difficulty', 'threshold'],
      'and the stage row carries exactly the pre-1286 key set'
    );
  });

  it('publishes no forecast for a non-progressive salvage, which cannot fire one', () => {
    const system = salvageSystemWith({
      complications: [complication({ id: 'x1', name: 'Shrapnel' })],
    });
    system.salvageResolutionMode = 'simple';
    system.salvageCraftingCheck = { simple: { rollFormula: '1d20', dc: 12 } };
    const salvage = salvageViewModel(system);
    assert.equal(salvage.mode, 'simple');
    assert.deepEqual(salvage.stages, [], 'no stages, and so nothing to attach a forecast to');
  });
});

// ---------------------------------------------------------------------------
// BulkSalvageService — the pre-run "what could go wrong" forecast
// ---------------------------------------------------------------------------

function bulkService(system, { getPlayerResultOrder = null } = {}) {
  return new BulkSalvageService({
    salvage: async () => ({ success: true }),
    getCraftingSystem: (id) => (id === system.id ? system : null),
    getPlayerResultOrder,
    maxItems: 2,
  });
}

/** A system with TWO salvageable components, so the cap can refuse a whole group. */
function twoSalvageableSystem() {
  const system = salvageSystemWith({
    complications: [complication({ id: 'x1', name: 'Shrapnel' })],
    results: [{ id: 'r1', componentId: 'iron' }],
  });
  system.components.push({
    id: 'crucible',
    name: 'Crucible',
    img: null,
    essences: {},
    difficulty: 4,
    salvage: {
      enabled: true,
      resultGroups: [{ id: 'g2', results: [{ id: 'r9', componentId: 'iron' }] }],
    },
  });
  return system;
}

function target(actorId, componentId = 'anvil') {
  return {
    actorId,
    actorUuid: `Actor.${actorId}`,
    actorName: actorId,
    systemId: 'sys-1',
    componentId,
  };
}

describe('1286: BulkSalvageService.forecast — the pre-run projection', () => {
  const shrapnel = complication({ id: 'x1', name: 'Shrapnel' });
  const curse = complication({ id: 'x2', name: 'Curse', visibility: 'gmOnly' });

  it('groups per component and counts each warning once, however often it is staged', () => {
    const system = salvageSystemWith({ complications: [shrapnel, curse] });
    const forecast = bulkService(system).forecast([target('a1')]);

    assert.equal(forecast.components.length, 1, 'one group per queued component');
    assert.deepEqual(
      forecast.components[0].complications.map((entry) => [entry.componentName, entry.name]),
      [['Iron', 'Shrapnel']],
      'Iron is staged twice, so the warning is deduped on the runtime firing key'
    );
    assert.equal(forecast.count, 1);
    assert.equal(forecast.components[0].name, 'Anvil');
  });

  it('collapses two rows of one component, and a duplicate row, into one group', () => {
    const system = salvageSystemWith({ complications: [shrapnel] });
    const forecast = bulkService(system).forecast([target('a1'), target('a2'), target('a1')]);
    assert.equal(forecast.components.length, 1, 'two actors and a duplicate are one warning');
    assert.equal(forecast.count, 1);
  });

  it('respects the selection cap, refusing by POSITION exactly as the run does', () => {
    const system = twoSalvageableSystem();
    // maxItems is 2, so the THIRD queued row is refused whatever it would have yielded.
    const inside = bulkService(system).forecast([target('a1', 'anvil'), target('a1', 'crucible')]);
    assert.deepEqual(
      inside.components.map((group) => group.componentId),
      ['anvil', 'crucible'],
      'both fit under the cap, in queue order'
    );

    const capped = bulkService(system).forecast([
      target('a1', 'anvil'),
      target('a2', 'anvil'),
      target('a1', 'crucible'),
    ]);
    assert.deepEqual(
      capped.components.map((group) => group.componentId),
      ['anvil'],
      'the crucible sits at position 3 and is refused before anything is forecast for it'
    );
    assert.equal(capped.count, 1);
  });

  it('reads the stages in the PLAYER saved order, under the engine order key', () => {
    const seen = [];
    const system = salvageSystemWith({
      results: [
        { id: 'r1', componentId: 'coal' },
        { id: 'r2', componentId: 'iron' },
      ],
      complications: [shrapnel],
    });
    system.components[2].complications = [complication({ id: 'x9', name: 'Choking Dust' })];

    const authored = bulkService(system).forecast([target('a1')]);
    assert.deepEqual(
      authored.components[0].complications.map((entry) => entry.name),
      ['Choking Dust', 'Shrapnel'],
      'authored order when the player stored none'
    );

    const reordered = bulkService(system, {
      getPlayerResultOrder: (entry) => {
        seen.push(entry);
        return ['r2', 'r1'];
      },
    }).forecast([target('a1')]);
    assert.deepEqual(
      reordered.components[0].complications.map((entry) => entry.name),
      ['Shrapnel', 'Choking Dust'],
      'the roll is spent down the player order, so the warnings read in it'
    );
    assert.deepEqual(seen, [{ scope: 'salvage', id: 'sys-1:anvil' }]);
  });

  it('honours a GM-pinned order rather than the stored one', () => {
    const system = salvageSystemWith({
      results: [
        { id: 'r1', componentId: 'coal' },
        { id: 'r2', componentId: 'iron' },
      ],
      complications: [shrapnel],
    });
    system.components[2].complications = [complication({ id: 'x9', name: 'Choking Dust' })];
    system.components[0].salvage.allowPlayerResultReorder = false;

    const forecast = bulkService(system, {
      getPlayerResultOrder: () => ['r2', 'r1'],
    }).forecast([target('a1')]);
    assert.deepEqual(
      forecast.components[0].complications.map((entry) => entry.name),
      ['Choking Dust', 'Shrapnel']
    );
  });

  it('forecasts nothing for a non-progressive selection', () => {
    const system = salvageSystemWith({ complications: [shrapnel] });
    system.salvageResolutionMode = 'simple';
    system.salvageCraftingCheck = { simple: { rollFormula: '1d20', dc: 12 } };
    assert.deepEqual(bulkService(system).forecast([target('a1')]), { count: 0, components: [] });
  });
});

// ---------------------------------------------------------------------------
// The leaf assertion
// ---------------------------------------------------------------------------

describe('1286: progressiveStageComplications.js stays a leaf', () => {
  it('imports the pure player projection and nothing else', () => {
    // Load-bearing, not tidiness. The salvage view-model this module decorates is read by
    // player stores, and every mounted Svelte suite that loads one declares its module
    // closure verbatim — so a runtime import acquired here would drag `checkRoll.js`'s
    // sixteen-module closure into each of them, and an omission from a harness allowlist
    // HANGS the suite (`# cancelled`) rather than failing it. Same guard, same reason, as
    // the allowlist pinned on `complicationPlan.js` itself.
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(join(root, 'src/utils/progressiveStageComplications.js'), 'utf8');
    const specifiers = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(
      (match) => match[1]
    );
    assert.deepEqual(specifiers, ['./complicationPlan.js']);
    assert.ok(!/\bimport\s*\(/.test(source), 'and no dynamic import evades that list');
  });
});
