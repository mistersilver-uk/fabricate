/** THE CONSUMER SWEEP'S BEHAVIOURAL CONTRACT (issue 1370, epic 1357, PR 8a). */

import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { getMatchHandler } from '../src/models/match/matchTypes.js';
import {
  buildWorldIdentityDriftNotice,
  describeWorldIdentityDrift,
} from '../src/systems/worldScopeEntityNotice.js';
import { reportWorldIdentityDrift } from '../src/systems/worldIdentityDrift.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

// The entry and the `src/bootstrap/` modules it split into (issue 1715), read through ONE call.
const FABRICATE_ENTRY_SOURCES = collectSources(resolve(repoRoot, 'src'), { extensions: ['.js'] });
const FABRICATE_ENTRY_SOURCE = Object.keys(FABRICATE_ENTRY_SOURCES)
  .filter((file) => file.startsWith('src/bootstrap/') || file === 'src/main.js')
  .sort()
  .map((file) => FABRICATE_ENTRY_SOURCES[file])
  .join('\n');

import {
  resolvedComponentsFor,
  resolvedEssencesFor,
  resolvedToolsFor,
} from '../src/systems/scopedEntityReads.js';

import {
  installFoundryStubs,
  makeManagerWithScope,
  makeScopeStore,
} from './helpers/worldScopeCorpus.js';

installFoundryStubs();

/** `src/main.js` statically imports CSS and cannot load under `node --test`. */
const MAIN_SOURCE = FABRICATE_ENTRY_SOURCE;
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

const SYSTEM_ID = 'sys-a';

/** A world scope payload naming one entity that `SYSTEM_ID` is a member of. */
function scopePayload(entity, { membership = {}, worldDefault = null } = {}) {
  return {
    entities: [entity],
    defaults: worldDefault ? { [entity.id]: { id: entity.id, ...worldDefault } } : {},
    membership: {
      [`${entity.id}|${SYSTEM_ID}`]: {
        entityId: entity.id,
        systemId: SYSTEM_ID,
        inherit: {},
        ...membership,
      },
    },
  };
}

/** A manager wired to one seeded component scope and nothing else. */
function componentManager(entity, options) {
  return makeManagerWithScope(CraftingSystemManager, { componentScope: scopePayload(entity, options) });
}

// Criterion 1(b) — ROW ORDER and ROW SET are the in-system array's

describe('the read union answers the in-system row set, in the in-system order', () => {
  it('emits the second system’s rows in ITS order, not the world roster’s', () => {
    // The world roster is ordered by the migration's grouping — oldest contributing system first —
    // so a union built from the roster re-ranks every FIRST-WINS resolution tier (`buildIndex`
    // keeps the first record per id, the first per name, and the earliest position per source
    // reference). Here the roster order is the REVERSE of the second system's own order.
    const manager = makeManagerWithScope(CraftingSystemManager, {
      componentScope: {
        entities: [{ id: 'first-authored' }, { id: 'second-authored' }],
        defaults: {},
        membership: {
          [`first-authored|${SYSTEM_ID}`]: {
            entityId: 'first-authored',
            systemId: SYSTEM_ID,
            inherit: {},
          },
          [`second-authored|${SYSTEM_ID}`]: {
            entityId: 'second-authored',
            systemId: SYSTEM_ID,
            inherit: {},
          },
        },
      },
    });
    const system = {
      id: SYSTEM_ID,
      components: [
        { id: 'second-authored', name: 'Second' },
        { id: 'first-authored', name: 'First' },
      ],
    };

    const read = manager.resolveScopedComponents(system);

    assert.deepEqual(
      read.map((entry) => entry.id),
      ['second-authored', 'first-authored'],
      'the ORDER is the in-system array’s'
    );
    assert.deepEqual(
      new Set(read.map((entry) => entry.id)),
      new Set(system.components.map((entry) => entry.id)),
      'and the ROW SET is equal to it as a set'
    );
  });
});

// Criteria 2 and 3 — a post-migration identity edit survives, and so does an absence

describe('identity is re-derived from the in-system record on every read', () => {
  it('does NOT revert a post-migration identity edit', () => {
    // The snapshot was equal at migration time by construction.
    const manager = componentManager({
      id: 'comp-1',
      name: 'Ash Salt',
      img: 'stale.png',
      description: 'the snapshot blurb',
    });
    const system = {
      id: SYSTEM_ID,
      components: [
        { id: 'comp-1', name: 'Ashen Salt', img: 'fresh.png', description: 'the GM’s blurb' },
      ],
    };

    const [row] = manager.resolveScopedComponents(system);

    assert.equal(row.name, 'Ashen Salt');
    assert.equal(row.img, 'fresh.png');
    assert.equal(row.description, 'the GM’s blurb');
  });

  it('re-derives an ABSENCE too, so a cleared field stays cleared', () => {
    // ABSENCE IS A VALUE, and a spread cannot express it: without the DELETE half the snapshot's
    // `description` survives on a record the GM has since cleared, and criterion 2 passes anyway.
    const manager = componentManager({
      id: 'comp-1',
      name: 'Ash Salt',
      description: 'the snapshot blurb',
      registeredItemUuid: 'Item.stale',
    });
    const system = { id: SYSTEM_ID, components: [{ id: 'comp-1', name: 'Ash Salt' }] };

    const [row] = manager.resolveScopedComponents(system);

    assert.equal('description' in row, false);
    assert.equal('registeredItemUuid' in row, false);
    assert.equal(row.name, 'Ash Salt', 'a field the record DOES carry is untouched');
  });

  it('re-derives an ABSENCE for an ESSENCE too', () => {
    // `WORLD_IDENTITY_FIELDS` is keyed per entity type, so the DELETE half is a DIFFERENT field
    // list for each of the three.
    const manager = makeManagerWithScope(CraftingSystemManager, {
      essenceScope: scopePayload({
        id: 'fire',
        name: 'Fire',
        icon: 'fas fa-fire',
        colorToken: 'rose',
        description: 'the snapshot blurb',
      }),
    });
    const system = { id: SYSTEM_ID, essenceDefinitions: [{ id: 'fire', name: 'Fire' }] };

    const [row] = manager.resolveScopedEssences(system);

    assert.equal('description' in row, false);
    assert.equal('icon' in row, false);
    assert.equal('colorToken' in row, false);
    assert.equal(row.name, 'Fire');
  });

  it('re-derives an ABSENCE for a TOOL too', () => {
    const manager = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload({
        id: 'hammer',
        name: 'Hammer',
        img: 'stale.png',
        description: 'the snapshot blurb',
        originItemUuid: 'Item.stale',
        registeredItemUuid: 'Item.stale',
        aliasItemUuids: ['Item.alias'],
      }),
    });
    const system = { id: SYSTEM_ID, tools: [{ id: 'hammer', name: 'Hammer' }] };

    const [row] = manager.resolveScopedTools(system);

    for (const field of ['img', 'description', 'originItemUuid', 'registeredItemUuid', 'aliasItemUuids']) {
      assert.equal(field in row, false, `${field} must be deleted, not supplied by the world half`);
    }
    assert.equal(row.name, 'Hammer');
  });
});

// Criterion 4 — an UNKNOWN world half returns the SAME OBJECT, in BOTH spellings

describe('an unknown world half returns the in-system array ITSELF', () => {
  beforeEach(() => {
    globalThis.game = globalThis.game ?? {};
    delete globalThis.game.fabricate;
  });

  /** Both spellings of the same read, so a change to one that misses the other is visible. */
  function bothSpellings(manager, system) {
    return [
      ['the shared read seam', resolvedComponentsFor(system)],
      ['the manager accessor', manager.resolveScopedComponents(system)],
    ];
  }

  it('with NO store at all', () => {
    const manager = new CraftingSystemManager({ getRecipes: () => [] });
    const system = { id: SYSTEM_ID, components: [{ id: 'c1' }] };
    for (const [label, answer] of bothSpellings(manager, system)) {
      assert.equal(answer, system.components, `${label} must answer the SAME object`);
    }
  });

  it('with a store whose roster is EMPTY', () => {
    const manager = makeManagerWithScope(CraftingSystemManager, {
      componentScope: { entities: [], defaults: {}, membership: {} },
    });
    const system = { id: SYSTEM_ID, components: [{ id: 'c1' }] };
    assert.equal(manager.resolveScopedComponents(system), system.components);
  });

  it('with a store that THROWS', () => {
    globalThis.game.fabricate = {
      getComponentScopeStore: () => {
        throw new Error('unreadable setting');
      },
    };
    const system = { id: SYSTEM_ID, components: [{ id: 'c1' }] };
    assert.equal(
      resolvedComponentsFor(system),
      system.components,
      'a store that throws degrades to "no world half", it never takes a read down'
    );
  });

  it('with a record that carries NO id', () => {
    // The manager's retired `if (!record?.id) return []` branch would blank a whole system's
    // library here, where every reader this seam replaces answered `system.components`.
    const manager = componentManager({ id: 'comp-1', name: 'Ash Salt' });
    const system = { components: [{ id: 'c1' }, { id: 'c2' }] };
    for (const [label, answer] of bothSpellings(manager, system)) {
      assert.equal(answer, system.components, `${label} must not blank an id-less record`);
    }
  });

  it('keeps EVERY row of a legacy array a null-corpus union would have reshaped', () => {
    // A null-corpus `unionScopedDefinitions` used to drop id-less entries, de-duplicate first-wins
    // and collapse a whitespace-padded id against its trimmed twin.
    const manager = new CraftingSystemManager({ getRecipes: () => [] });
    const system = {
      id: SYSTEM_ID,
      components: [
        { id: 'a', name: 'A' },
        { name: 'no id at all' },
        { id: 'b', name: 'B first' },
        { id: 'b', name: 'B second' },
        { id: '  b  ', name: 'B padded' },
        { id: 'c', name: 'C' },
      ],
    };
    for (const [label, answer] of bothSpellings(manager, system)) {
      assert.equal(answer.length, 6, `${label} must keep all six rows`);
      assert.equal(answer, system.components, `${label} must not reallocate`);
    }
  });
});

// THE PRODUCTION BRANCH — the lazy global probe every leaf reader actually takes

describe('the seam resolves its world half through the global store probe', () => {
  // WHY THIS EXISTS. `resolveScopedEntityRead` takes its corpus either from an explicitly passed
  // argument or, when none is passed, from
  // `globalThis.game?.fabricate?.<accessor>?.()?.corpus?.()`.
  const SEEDED = 'probe-comp';

  function seededStores() {
    const payload = scopePayload(
      { id: SEEDED, name: 'World Probe', description: 'from the world half' },
      { worldDefault: { category: 'ore' } }
    );
    return {
      getComponentScopeStore: () => makeScopeStore('components', payload),
      getEssenceScopeStore: () => makeScopeStore('essences', scopePayload({ id: SEEDED })),
      getToolScopeStore: () => makeScopeStore('tools', scopePayload({ id: SEEDED })),
    };
  }

  beforeEach(() => {
    globalThis.game = globalThis.game ?? {};
    globalThis.game.fabricate = seededStores();
  });

  afterEach(() => {
    delete globalThis.game.fabricate;
  });

  it('returns a MERGED row with one argument, so the accessor and the method are both right', () => {
    const system = { id: SYSTEM_ID, components: [{ id: SEEDED, name: 'In-System Probe' }] };

    const [row] = resolvedComponentsFor(system);

    // `member` is stamped by the three-layer resolver and appears on NO stored record, so it can
    // only be here if the world half was actually read.
    assert.equal(row.member, true, 'the probe must reach the store and its published corpus');
    assert.equal(row.category, 'ore', 'and resolve the world default the record does not carry');
    assert.equal(row.name, 'In-System Probe', 'while the in-system record still decides its keys');
  });

  it('drives the same branch for essences and tools', () => {
    const essence = { id: SYSTEM_ID, essenceDefinitions: [{ id: SEEDED, name: 'In-System' }] };
    const tool = { id: SYSTEM_ID, tools: [{ id: SEEDED, name: 'In-System' }] };
    assert.equal(resolvedEssencesFor(essence)[0].member, true);
    assert.equal(resolvedToolsFor(tool)[0].member, true);
  });

  it('still degrades to the in-system array when the probe finds no store', () => {
    // The negative half, on the SAME fixture, so the positive arm above cannot be passing for the
    // reason the passthrough would pass for.
    delete globalThis.game.fabricate;
    const system = { id: SYSTEM_ID, components: [{ id: SEEDED, name: 'In-System Probe' }] };
    const answer = resolvedComponentsFor(system);
    assert.equal(answer, system.components, 'the SAME object');
    assert.equal('member' in answer[0], false, 'and no resolver stamp, because nothing resolved');
  });
});

// Criterion 5 — the basis, the duplicate id, and the row that must NOT come back

describe('a repointed reader never narrows a Valid Id Basis', () => {
  const MANAGER_SOURCE = new URL('../src/systems/CraftingSystemManager.js', import.meta.url);

  it('leaves _scopeBasis reading the RAW arrays', () => {
    const source = readFileSync(MANAGER_SOURCE, 'utf8');
    const start = source.indexOf('  _scopeBasis(system) {');
    assert.notEqual(start, -1, 'src/systems/CraftingSystemManager.js still declares _scopeBasis');
    const body = source.slice(start, source.indexOf('\n  }', start));
    assert.ok(body.includes('system?.components'), 'non-vacuity: the slice IS the basis derivation');
    for (const seam of [
      'resolveScopedComponents',
      'resolvedComponentsFor',
      'getComponentsForSystem',
      'resolveScopedEntityRead',
    ]) {
      assert.equal(
        body.includes(seam),
        false,
        `wiring ${seam} into the basis makes an UNKNOWN half prunable, which deletes real data`
      );
    }
  });

  it('still answers a world id the in-system array does not carry', () => {
    const manager = componentManager({ id: 'w-only', name: 'World Only' });
    const system = { id: SYSTEM_ID, components: [{ id: 'legacy-only' }] };

    const { componentIds } = manager._scopeBasis(system);

    assert.equal(componentIds.has('w-only'), true, 'an absent record is a REFUSAL, never a PRUNE');
    assert.equal(
      manager.resolveScopedComponents(system).some((entry) => entry.id === 'w-only'),
      false,
      'and the READ union still does not carry it'
    );
  });
});

describe('a duplicate id resolves exactly as it did before the repoint', () => {
  it('keeps BOTH rows, in in-system order, so first-wins still answers the FIRST', () => {
    // The retired two-pass build keyed the in-system records into a LAST-WINS map on the claim that
    // "both shipped index builders are". `itemById` is last-wins; `buildIndex` is FIRST-wins.
    const manager = componentManager({ id: 'dup', name: 'World Dup' });
    const system = {
      id: SYSTEM_ID,
      components: [
        { id: 'dup', name: 'FIRST record' },
        { id: 'dup', name: 'SECOND record' },
      ],
    };

    const read = manager.resolveScopedComponents(system);

    // A LITERAL expected list, never one derived from the map under test.
    assert.deepEqual(
      read.map((entry) => entry.name),
      ['FIRST record', 'SECOND record']
    );
  });
});

describe('a row the in-system array no longer carries does NOT come back', () => {
  it('after a delete leaves the world entity and its membership behind', () => {
    // `_deleteComponentSet` removes the in-system record, leaves the world entity and membership in
    // place, and DISABLES the referencing recipes.
    const manager = componentManager({ id: 'deleted', name: 'Deleted Component' });
    const system = { id: SYSTEM_ID, components: [{ id: 'survivor' }] };

    const read = manager.resolveScopedComponents(system);

    assert.equal(
      read.some((entry) => entry.id === 'deleted'),
      false
    );
    assert.deepEqual(new Set(read.map((entry) => entry.id)), new Set(['survivor']));
  });

  it('after a keep-mode import creates a membered-but-recordless pair with no delete involved', () => {
    // The import path persists world rosters and membership unions while building the SYSTEM from
    // the in-system arrays, so it can produce the same pair without any deletion.
    const manager = makeManagerWithScope(CraftingSystemManager, {
      toolScope: {
        entities: [{ id: 'imported-tool', name: 'Imported Tool' }],
        defaults: {},
        membership: {
          [`imported-tool|${SYSTEM_ID}`]: {
            entityId: 'imported-tool',
            systemId: SYSTEM_ID,
            inherit: {},
          },
        },
      },
    });
    const system = { id: SYSTEM_ID, tools: [{ id: 'authored-tool', name: 'Authored Tool' }] };

    const read = manager.resolveScopedTools(system);

    assert.deepEqual(
      read.map((entry) => entry.id),
      ['authored-tool']
    );
  });
});

// Criterion 6 — the behaviour keys, split by whether they are a SECTION (issue 1372)

describe('the NON-SECTION behaviour keys are re-derived from the in-system record', () => {
  // THE SUITE SPLITS ALONG THE SECTION LINE, and issue 1372 is what drew the line.
  it('(a) keeps the in-system tags, and the tag matcher expands over them', () => {
    // `resolveComponent` emits `tags` UNCONDITIONALLY, so before the inversion a GM's tag edit
    // was reverted whether or not any scope had authored tags.
    const manager = componentManager(
      { id: 'comp-1', name: 'Ash Salt' },
      { worldDefault: { tags: ['stale-tag'] } }
    );
    const system = {
      id: SYSTEM_ID,
      components: [{ id: 'comp-1', name: 'Ash Salt', tags: ['reagent', 'fresh-tag'] }],
    };

    const read = manager.resolveScopedComponents(system);

    assert.deepEqual(read[0].tags, ['reagent', 'fresh-tag']);
    assert.deepEqual(
      [...getMatchHandler({ type: 'tags' }).expandToComponentIds({ type: 'tags', tags: ['fresh-tag'] }, read)],
      ['comp-1'],
      'the tag matcher expands over the ANSWER, so a reverted tag silently unmatches an ingredient'
    );
  });

  it('(e) keeps the in-system repair requirements', () => {
    const manager = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload(
        { id: 'tool-1' },
        { worldDefault: { repairRequirements: { components: [] } } }
      ),
    });
    const system = {
      id: SYSTEM_ID,
      tools: [{ id: 'tool-1', repairRequirements: { components: [{ id: 'whetstone' }] } }],
    };

    assert.deepEqual(manager.resolveScopedTools(system)[0].repairRequirements, {
      components: [{ id: 'whetstone' }],
    });
  });

  it('(f) keeps a GM-DISABLED essence disabled', () => {
    // `resolveScopedDefinition` emits `enabled` unconditionally for an enableable scope, so a
    // disabled essence read back USABLE whether or not any membership record authored anything.
    const manager = makeManagerWithScope(CraftingSystemManager, {
      essenceScope: scopePayload({ id: 'fire', name: 'Fire' }),
    });
    const system = {
      id: SYSTEM_ID,
      essenceDefinitions: [{ id: 'fire', name: 'Fire', enabled: false }],
    };

    assert.equal(manager.resolveScopedEssences(system)[0].enabled, false);
    // NOT asserted 'through the seam' here: with no `game.fabricate` the seam takes the
    // unknown-half passthrough and hands back this fixture's own literal, which would pass
    // against a completely broken probe. The probe has its own describe below.
  });

  it('(g) keeps a GM-DISABLED tool disabled', () => {
    const manager = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload({ id: 'tool-1', name: 'Hammer' }),
    });
    const system = { id: SYSTEM_ID, tools: [{ id: 'tool-1', name: 'Hammer', enabled: false }] };

    assert.equal(manager.resolveScopedTools(system)[0].enabled, false);
  });

  it('(h) emits member and inherited, which no shipped record carries and so cannot contest', () => {
    const manager = componentManager({ id: 'comp-1' }, { membership: { inherit: { category: false } } });
    const system = { id: SYSTEM_ID, components: [{ id: 'comp-1', name: 'Ash Salt' }] };

    const [row] = manager.resolveScopedComponents(system);

    assert.equal(row.member, true);
    // Both component sections since issue 1371 r18-store (M31); the omitted `essences` switch inherits.
    assert.deepEqual(row.inherited, { category: false, essences: true });
  });
});

// Criteria 7(c) and 8(a) — the drift report, and the detector's purity

/**
 * A corpus in which ONE component's world snapshot has drifted from its in-system record on TWO
 * fields, and a second field is ABSENT in-system while present in the snapshot.
 */
function driftedCorpus() {
  return {
    craftingSystems: [
      {
        id: SYSTEM_ID,
        components: [{ id: 'comp-1', name: 'Ashen Salt', img: 'fresh.png' }],
      },
    ],
    scopeCorpus: {
      components: {
        entities: [
          { id: 'comp-1', name: 'Ash Salt', img: 'fresh.png', description: 'snapshot blurb' },
        ],
        membership: [{ entityId: 'comp-1', systemId: SYSTEM_ID }],
      },
    },
  };
}

describe('the world identity drift report', () => {
  it('names every diverged (entityId, field), against a LITERAL expected list', () => {
    const { craftingSystems, scopeCorpus } = driftedCorpus();

    const report = reportWorldIdentityDrift(craftingSystems, scopeCorpus);

    // A LITERAL, never one derived from `WORLD_IDENTITY_FIELDS` — a list derived from the same
    // constant the detector reads cannot see the detector reading the wrong constant.
    assert.deepEqual(report, [
      {
        systemId: SYSTEM_ID,
        entityType: 'components',
        entityId: 'comp-1',
        field: 'name',
        systemValue: 'Ashen Salt',
        worldValue: 'Ash Salt',
      },
      {
        systemId: SYSTEM_ID,
        entityType: 'components',
        entityId: 'comp-1',
        field: 'description',
        systemValue: undefined,
        worldValue: 'snapshot blurb',
      },
    ]);
    assert.ok(report.length >= 2, 'NON-EMPTY, and carrying two fields for ONE entity');
  });

  it('composes a notice that NAMES the records and fields, never a bare count', () => {
    const { craftingSystems, scopeCorpus } = driftedCorpus();

    const message = buildWorldIdentityDriftNotice(
      reportWorldIdentityDrift(craftingSystems, scopeCorpus),
      null
    );

    assert.equal(
      message,
      "Fabricate's world catalogue snapshot is out of date for 1 record(s) across 2 field(s): " +
        'comp-1 (components: name, description) in sys-a. ' +
        "Each crafting system's own copy is what every reader answers from, so nothing is wrong " +
        'and nothing has been changed - this is identity only (names, images, descriptions and ' +
        'source links), not behaviour.'
    );
  });

  it('CAPS the enumeration and says how many it withheld', () => {
    // A notification is not a report surface: core's `.notification` has no `max-height` and no
    // `overflow` and carries `pointer-events: all`, so an uncapped join over a bulk edit to a
    // 200-component library overflows the viewport and swallows pointer events for five seconds.
    const drift = [];
    for (let index = 0; index < 12; index += 1) {
      drift.push({
        systemId: SYSTEM_ID,
        entityType: 'components',
        entityId: `comp-${index}`,
        field: 'name',
      });
    }

    const message = buildWorldIdentityDriftNotice(drift, null);

    assert.match(message, /out of date for 12 record\(s\) across 12 field\(s\)/, 'counts stay EXACT');
    assert.match(message, /\.\.\.and 7 more/, 'and the remainder is stated rather than dropped');
    assert.equal(message.includes('comp-4'), true, 'the first five records are NAMED');
    assert.equal(message.includes('comp-5'), false, 'the sixth is not');
    assert.ok(message.length < 1000, `the toast stays bounded; got ${message.length} characters`);
  });

  it('hands the UNCAPPED list to the console dump the toast points at', () => {
    // The copy says "the full list is in the console". This is the half that makes it true.
    const drift = [];
    for (let index = 0; index < 12; index += 1) {
      drift.push({
        systemId: SYSTEM_ID,
        entityType: 'components',
        entityId: `comp-${index}`,
        field: 'name',
      });
    }

    const detail = describeWorldIdentityDrift(drift);

    assert.equal(detail.split('; ').length, 12, 'every record, uncapped');
    for (let index = 0; index < 12; index += 1) {
      assert.ok(detail.includes(`comp-${index}`), `comp-${index} must be named`);
    }
    assert.equal(describeWorldIdentityDrift([]), '', 'and nothing to say when there is no drift');
  });

  it('LOGS that list in src/main.js at `info`, and raises NO toast for it', () => {
    // The drift report is CONSOLE ONLY (maintainer, 2026-09-06): the toast this used to raise
    // repeated the whole drifted list in the notification bar and read as an alarm for a state its
    // own copy called harmless.
    const dump = MAIN_SOURCE.indexOf('describeWorldIdentityDrift(worldIdentityDrift)');
    assert.notEqual(dump, -1, 'src/main.js must compose the uncapped list');
    const after = MAIN_SOURCE.slice(dump, dump + 600);
    // THE LEVEL IS PART OF THE PROMISE: `console.debug` maps to DevTools' VERBOSE level, which
    // Chromium's default filter excludes, so a GM who presses F12 would not see the dump at all
    // (issue 1737).
    assert.match(
      after,
      /logMigrationNoticeDetail\('world identity drift', driftDetail\)/,
      'the dump must go through the info-level detail helper'
    );
    assert.doesNotMatch(after, /console\.(debug|info)\(/, 'no bare console statement');
    assert.equal(
      MAIN_SOURCE.includes('ui.notifications?.info?.(driftNotice)'),
      false,
      'the drift report must not reach the notification bar'
    );
    assert.equal(
      MAIN_SOURCE.includes('buildWorldIdentityDriftNotice('),
      false,
      'src/main.js composes no drift toast at all'
    );
  });

  it('says nothing at all when there is no drift', () => {
    assert.equal(buildWorldIdentityDriftNotice([], null), '');
    assert.equal(buildWorldIdentityDriftNotice(null, null), '');
  });

  it('is PURE: reported twice, and the reader still answers the in-system value', () => {
    // NARROWER THAN IT LOOKS, and the limit is stated: `reportWorldIdentityDrift` is a shipped pure
    // function this PR does not modify, so calling it twice only reds if a repair went INSIDE the
    // detector.
    const { craftingSystems, scopeCorpus } = driftedCorpus();

    const first = reportWorldIdentityDrift(craftingSystems, scopeCorpus);
    const second = reportWorldIdentityDrift(craftingSystems, scopeCorpus);

    assert.ok(first.length > 0, 'non-vacuity: the corpus really has drifted');
    assert.deepEqual(second, first);

    const manager = makeManagerWithScope(CraftingSystemManager, {
      componentScope: {
        entities: scopeCorpus.components.entities,
        defaults: {},
        membership: { [`comp-1|${SYSTEM_ID}`]: scopeCorpus.components.membership[0] },
      },
    });
    assert.equal(
      manager.resolveScopedComponents(craftingSystems[0])[0].name,
      'Ashen Salt',
      'the union still answers the in-system value it just reported as diverged'
    );
  });
});

// Criterion 10 — the deliberate exclusions, asserted by SOURCE CONTRACT

/**
 * The five reads PR 8a deliberately did NOT repoint, each pinned so a later lane "finishing the
 * sweep" has to argue with a test rather than with a comment. THE LAST ONE IS THE ONE THAT CANNOT
 * BE PINNED ANYWHERE ELSE.
 */
describe('the deliberate exclusions are unchanged', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const SEAM_NAMES = [
    'resolvedComponentsFor',
    'resolvedEssencesFor',
    'resolvedToolsFor',
    'resolveScopedEntityRead',
  ];

  /** The lines of `source` between `open` and the next line that closes at `closeIndent`. */
  function bodyAfter(source, open, closeIndent = '  ') {
    const start = source.indexOf(open);
    assert.notEqual(start, -1, `the anchor \`${open}\` is gone`);
    const end = source.indexOf(`\n${closeIndent}}`, start);
    assert.notEqual(end, -1, `the anchor \`${open}\` has no closing brace`);
    return source.slice(start, end);
  }

  it('getItems still answers the PERSISTED record, because it is the authoring accessor', () => {
    const body = bodyAfter(read('src/systems/CraftingSystemManager.js'), "  getItems(systemId, search = '') {");
    assert.ok(body.includes('const managedItems = system.components || [];'));
    for (const seam of SEAM_NAMES) assert.equal(body.includes(seam), false);
  });

  it('the durable-identity restamp still reads the in-system arrays', () => {
    const source = read('src/systems/SourceIdentityService.js');
    assert.ok(source.includes("bucket: 'components',"), 'non-vacuity: the restamp kinds exist');
    assert.ok(source.includes('definitions: system.components || [],'));
    assert.ok(source.includes('definitions: (system.tools || []).filter('));
  });

  it('the pre-persist alchemy injector still validates the PROPOSED record', () => {
    const body = bodyAfter(
      read('src/systems/CraftingSystemManager.js'),
      '  _assertNoAlchemySignatureCollisions(system) {'
    );
    assert.ok(body.includes('const components = Array.isArray(system.components) ? system.components : [];'));
    for (const seam of SEAM_NAMES) assert.equal(body.includes(seam), false);
  });

  it('resolvePresentIds still decides presence by comparing SYSTEM IDS', () => {
    // Re-expressed as membership it must DENY on an unknown corpus - widening presence would let
    // a station satisfy a tool gate the GM never granted - so it is 8b's change, not 8a's.
    const source = read('src/gatheringToolRuntime.js');
    const body = bodyAfter(source, 'function resolvePresentIds({ presentTools, systemId, key }) {', '');
    assert.ok(body.includes('toolSystemId !== scopeSystemId'), 'the scope guard is still an id compare');
    assert.equal(body.includes('.tools'), false, 'and it still reads no entity array at all');
    assert.equal(source.includes('scopedEntityReads'), false);
  });

  it('the drift detector still reads the RAW setting through its computed key', () => {
    const source = read('src/systems/worldIdentityDrift.js');
    assert.ok(
      source.includes('for (const record of arrayOf(system[ENTITY_FIELDS[entityType]])) {'),
      'a migration-class reader reads the RAW corpus by construction'
    );
    assert.equal(
      source.includes('scopedEntityReads'),
      false,
      'repointing it would have the detector compare the union against the world corpus, report ' +
        'zero drift every session, and void the disclosure obligation entirely'
    );
  });
});

// Criterion 6b — the three SECTION keys follow the inherit switch (issue 1372)

describe('the SECTION keys follow the inherit switch, through the manager seam', () => {
  // THROUGH THE MANAGER, not through `unionScopedDefinitions` directly, and that is the point of
  // repeating three assertions this file's neighbour also makes: `resolveScopedComponents` and
  // its siblings are what every non-UI reader enters, so a rule proved only on the pure function
  // says nothing about whether a seeded store, a memoized union and the unknown-half passthrough
  // still deliver it. `scopePayload` defaults `inherit` to `{}`, which reads as INHERITING.

  it('(b) an INHERITING component takes the world category, and an OVERRIDING one does not', () => {
    const inheriting = componentManager(
      { id: 'comp-1' },
      { worldDefault: { category: 'world-category' } }
    );
    const system = { id: SYSTEM_ID, components: [{ id: 'comp-1', category: 'reagent' }] };
    assert.equal(inheriting.resolveScopedComponents(system)[0].category, 'world-category');

    const overriding = componentManager(
      { id: 'comp-1' },
      { worldDefault: { category: 'world-category' }, membership: { inherit: { category: false } } }
    );
    assert.equal(
      overriding.resolveScopedComponents(system)[0].category,
      'reagent',
      'an OVERRIDING section is the system\u2019s own value, which is where the GM\u2019s edits land'
    );
  });

  it('(c) an INHERITING tool takes the world breakage mode, and an OVERRIDING one does not', () => {
    const system = {
      id: SYSTEM_ID,
      tools: [{ id: 'tool-1', breakage: { mode: 'onFailure', chance: 25 } }],
    };
    const inheriting = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload({ id: 'tool-1' }, { worldDefault: { breakage: { mode: 'none' } } }),
    });
    assert.deepEqual(inheriting.resolveScopedTools(system)[0].breakage, { mode: 'none' });

    const overriding = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload(
        { id: 'tool-1' },
        { worldDefault: { breakage: { mode: 'none' } }, membership: { inherit: { breakage: false } } }
      ),
    });
    assert.deepEqual(overriding.resolveScopedTools(system)[0].breakage, {
      mode: 'onFailure',
      chance: 25,
    });
  });

  it('(d) an INHERITING tool takes the world onBreak action, and an OVERRIDING one does not', () => {
    const system = { id: SYSTEM_ID, tools: [{ id: 'tool-1', onBreak: { action: 'replace' } }] };
    const inheriting = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload({ id: 'tool-1' }, { worldDefault: { onBreak: { action: 'delete' } } }),
    });
    assert.deepEqual(inheriting.resolveScopedTools(system)[0].onBreak, { action: 'delete' });

    const overriding = makeManagerWithScope(CraftingSystemManager, {
      toolScope: scopePayload(
        { id: 'tool-1' },
        { worldDefault: { onBreak: { action: 'delete' } }, membership: { inherit: { onBreak: false } } }
      ),
    });
    assert.deepEqual(overriding.resolveScopedTools(system)[0].onBreak, { action: 'replace' });
  });

  it('(g) an INHERITING essence takes the world effect source and macro, on the SHIPPED names', () => {
    // The essence sections are the two that need a PROJECTION: `effectSource` and `macro` are new
    // names, and every consumer reads `sourceComponentId` and `propertyMacroUuid`.
    const manager = makeManagerWithScope(CraftingSystemManager, {
      essenceScope: scopePayload(
        { id: 'fire', name: 'Fire' },
        {
          worldDefault: {
            effectSource: { sourceComponentId: 'world-comp' },
            macro: 'Macro.world',
          },
        }
      ),
    });
    const system = {
      id: SYSTEM_ID,
      essenceDefinitions: [
        {
          id: 'fire',
          name: 'Fire',
          sourceComponentId: 'system-comp',
          propertyMacroUuid: 'Macro.system',
        },
      ],
    };
    const read = manager.resolveScopedEssences(system)[0];
    assert.equal(read.sourceComponentId, 'world-comp');
    assert.equal(read.propertyMacroUuid, 'Macro.world');
  });
});
