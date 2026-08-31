/**
 * The two scoped-entity list shells, MOUNTED (issue 1380, epic 1357).
 *
 * ── THE EVIDENCE RULE THIS FILE IS WRITTEN AGAINST ────────────────────────────────────────────
 * Several of the mutations these assertions exist to catch ALSO red
 * `tests/components/scoped-entity-patterns-mounted.test.js`, which already asserts the
 * component-no-enabled-switch case and the InheritRow row counts verbatim. A red from that suite
 * is not evidence this one catches anything: it would report `not ok` on a tree where this file
 * does not exist. Every criterion below is therefore written so it fails FROM THIS FILE ALONE.
 *
 * ── THE THREE-MOUNT SHAPE, AND WHY IT IS ONE PROPS FACTORY ────────────────────────────────────
 * The whole reason these shells are one component rather than three is generality across the
 * three entity types, and one screen proves one type. So every differentiation test mounts the
 * SAME props three times, changing only `scope` — which is what makes the pair of answers a
 * comparison rather than two unrelated fixtures. A negative half ("an essence renders no source
 * badge") is worthless without its positive control ("…and it rendered rows at all"), because a
 * shell that rendered NOTHING would satisfy it.
 *
 * ── WHY `createRawSnippet` COMES FROM A PATH AND NOT FROM `svelte` ────────────────────────────
 * The harness drives the compiled components with the client runtime at
 * `node_modules/svelte/src/index-client.js`. A snippet built from a bare `svelte` specifier comes
 * out of a SECOND copy of that runtime and is a different type, so the component refuses to
 * render it. Precedent: `tests/components/bulk-edit-dock-pinning.test.js`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCOPED_RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/migration/worldScopeEntityGrouping.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  'src/utils/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  'src/utils/scopedEntityListModel.js',
];

const FRAME_MODULES = [
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
];

const catalogueHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-catalogue-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    ...FRAME_MODULES,
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
});

const rulesHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-rules-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    ...FRAME_MODULES,
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityRulesListShell.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/EntityRulesListShell.svelte',
});

// ── FIXTURES ────────────────────────────────────────────────────────────────────────────────

/**
 * One identity record, shaped as its type's lifted identity fields actually are.
 *
 * A component and a tool carry `img` and the three source-link fields; an essence carries `icon`
 * — a Font Awesome CLASS, not a path — and `colorToken`, and no source link at all. That is the
 * whole three-way difference the shells read, so the fixture states it rather than giving all
 * three the same keys and hiding it.
 *
 * @param {string} entityType
 * @param {number} index
 * @param {object} [overrides]
 * @returns {object}
 */
function entityOf(entityType, index, overrides = {}) {
  const base = {
    id: `${entityType}-${index}`,
    name: `Ash ${String(index).padStart(2, '0')}`,
    description: `A description for ${entityType} ${index}`,
  };
  if (entityType === 'essence') {
    return { ...base, icon: 'fas fa-flask', colorToken: 'sage', ...overrides };
  }
  return {
    ...base,
    img: `icons/commodities/${entityType}-${index}.webp`,
    originItemUuid: `Item.${entityType}${index}`,
    ...overrides,
  };
}

const ROSTER = [
  { id: 'sys-a', name: 'Mythwright Forge' },
  { id: 'sys-b', name: 'Ironblood' },
  // DROPPED by `projectSystems`, which filters a blank id. It is here so the joined row count and
  // the roster length DIFFER: with a 1:1 fixture, reading the rows off the roster prop instead of
  // off the projection's join produces the same number and the swap is invisible.
  { id: '', name: 'Ghost System' },
];

/**
 * A projection for one entity type, from a corpus this file builds.
 *
 * @param {string} entityType
 * @param {object} [options]
 * @returns {object}
 */
function scopeOf(entityType, { count = 3, systems = ROSTER, membership = null } = {}) {
  const entities = Array.from({ length: count }, (unused, index) => entityOf(entityType, index));
  const records =
    membership ??
    entities.map((entity) => ({
      entityId: entity.id,
      systemId: 'sys-a',
      // An ABSENT `inherit` map reads as inheriting for every section, matching
      // `isSectionInherited`, so every section's count is the member count.
    }));
  return projectWorldScopeEntity({
    entityType,
    corpus: { entities, defaults: [], membership: records },
    seeded: { entities: true, defaults: true, membership: true },
    systems,
  });
}

/** A snippet that renders a marked element, built from the harness's own client runtime. */
function markerSnippet(attribute) {
  return createRawSnippet(() => ({
    render: () => `<span ${attribute}></span>`,
  }));
}

/**
 * A snippet that RECORDS the arguments it was rendered with.
 *
 * `createRawSnippet` hands each parameter as a thunk, so the recorded values are read through
 * `()` rather than taken directly.
 */
function recordingSnippet(sink, attribute) {
  return createRawSnippet((first, second) => {
    sink.push([first?.(), second?.()]);
    return { render: () => `<span ${attribute}></span>` };
  });
}

/**
 * ONE props factory. `scope` is the only thing the differentiation tests vary.
 *
 * @param {string} entityType
 * @param {object} [overrides]
 * @returns {object}
 */
function catalogueProps(entityType, overrides = {}) {
  return {
    scope: scopeOf(entityType),
    actions: {},
    systems: ROSTER,
    hookValue: `world-${entityType}s`,
    title: 'Catalogue',
    subtitle: 'One per world.',
    icon: 'fas fa-cubes-stacked',
    emptyTitle: 'Nothing here yet',
    emptyHint: 'Import or author one.',
    sectionNotes: {
      category: 'Falls back to General.',
      effectSource: 'Falls back to no effect source.',
      macro: 'Falls back to no macro.',
      breakage: 'Falls back to never breaks.',
      onBreak: 'Falls back to nothing happens.',
    },
    inspectorBody: markerSnippet('data-lane-inspector-body'),
    ...overrides,
  };
}

function rulesProps(entityType, overrides = {}) {
  return {
    scope: scopeOf(entityType),
    actions: {},
    systems: ROSTER,
    systemId: 'sys-a',
    systemName: 'Mythwright Forge',
    hookValue: `${entityType}s`,
    title: 'Rules',
    subtitle: 'This system only.',
    icon: 'fas fa-cubes-stacked',
    emptyTitle: 'Nothing here yet',
    emptyHint: 'Add one from the world catalogue.',
    sectionNotes: {
      category: 'Falls back to General.',
      effectSource: 'Falls back to no effect source.',
      macro: 'Falls back to no macro.',
      breakage: 'Falls back to never breaks.',
      onBreak: 'Falls back to nothing happens.',
    },
    ...overrides,
  };
}

const rows = (root) => [...root.querySelectorAll('[data-scoped-list-row]')];

// ── AC-2 · ENTITY-TYPE DIFFERENTIATION ──────────────────────────────────────────────────────

describe('the rules-list shell differentiates by entity type from ONE props factory', () => {
  before(() => rulesHarness.setup());
  after(() => rulesHarness.teardown());
  afterEach(() => rulesHarness.remount());

  it('an ESSENCE renders rows, NO source badge, its own glyph and its colour tint', async () => {
    const root = await rulesHarness.mount(rulesProps('essence'));
    // THE POSITIVE CONTROL FOR THE NEGATIVE BELOW. A shell rendering nothing at all satisfies
    // "zero source badges" perfectly.
    assert.ok(rows(root).length >= 1, 'the essence mount rendered no rows at all');
    assert.equal(
      root.querySelectorAll('[data-scoped-list-source]').length,
      0,
      'an essence identity record carries no source-link field, so a badge would state the ' +
        'absence of something it never had'
    );
    const medallion = rows(root)[0].querySelector('[data-medallion]');
    assert.equal(medallion.getAttribute('data-medallion'), 'glyph', 'an essence lifts `icon`');
    assert.ok(
      Boolean(medallion.querySelector('i.fa-flask')),
      "the glyph is the essence's authored `icon` class, not the shell's fallback"
    );
    assert.equal(
      medallion.getAttribute('data-medallion-tint'),
      'sage',
      'the tint is the essence `colorToken`, reached through `scope.hasColorToken`'
    );
  });

  for (const entityType of ['component', 'tool']) {
    it(`a ${entityType.toUpperCase()} renders one source badge per row and resolves img`, async () => {
      const root = await rulesHarness.mount(rulesProps(entityType));
      const listRows = rows(root);
      assert.ok(listRows.length >= 1);
      assert.equal(
        root.querySelectorAll('[data-scoped-list-source]').length,
        listRows.length,
        'one badge per row'
      );
      const medallion = listRows[0].querySelector('[data-medallion]');
      assert.equal(medallion.getAttribute('data-medallion'), 'image');
      assert.equal(
        medallion.querySelector('img').getAttribute('src'),
        `icons/commodities/${entityType}-0.webp`
      );
      assert.ok(
        !medallion.getAttribute('data-medallion-tint'),
        'neither type carries a colour token, so nothing tints the tile'
      );
    });
  }
});

describe('the catalogue shell labels the inherit counts the descriptor declares', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  const EXPECTED = {
    component: ['category'],
    essence: ['effectSource', 'macro'],
    tool: ['breakage', 'onBreak'],
  };
  const LABELS = {
    category: 'Category',
    effectSource: 'Effect source',
    macro: 'Property macro',
    breakage: 'Breakage',
    onBreak: 'On break',
  };

  for (const [entityType, sections] of Object.entries(EXPECTED)) {
    it(`enumerates exactly the ${entityType}'s ${sections.length} section(s)`, async () => {
      const props = catalogueProps(entityType);
      const first = props.scope.entries[0];
      const root = await catalogueHarness.mount({ ...props, selectedId: first.id });
      const cells = [...root.querySelectorAll('[data-scoped-list-inherit-count]')];
      assert.deepEqual(
        cells.map((cell) => cell.getAttribute('data-scoped-list-inherit-count')),
        Object.keys(first.inheritCounts),
        'the cells enumerate the projection\'s own section keys'
      );
      assert.deepEqual(
        cells.map((cell) => cell.getAttribute('data-scoped-list-inherit-count')),
        sections
      );
      // Labelled through `scopedSectionLabel`, so the five names are read from ONE list.
      assert.deepEqual(
        cells.map((cell) =>
          cell.querySelector('.manager-scoped-catalogue-fact-label').textContent.trim()
        ),
        sections.map((section) => LABELS[section])
      );
      // Each count is the real membership number, not a placeholder: one of the two systems has
      // every entity and the second has none.
      for (const cell of cells) {
        assert.match(cell.textContent, /1 inheriting/);
      }
    });
  }

  it('renders NO group chrome around a ONE-SECTION entity, and a head above a two-section one', async () => {
    const component = await catalogueHarness.mount({
      ...catalogueProps('component'),
      selectedId: 'component-0',
    });
    assert.equal(
      component.querySelectorAll('.manager-scoped-catalogue-facts-head').length,
      0,
      'a header and a divider around a single count costs more space than the count'
    );
    const tool = await catalogueHarness.mount({
      ...catalogueProps('tool'),
      selectedId: 'tool-0',
    });
    assert.equal(
      tool.querySelectorAll('.manager-scoped-catalogue-facts-head').length,
      1,
      'the positive control: the head IS rendered when there is a group to label'
    );
  });

  it('renders each section note the shell was given', async () => {
    const root = await catalogueHarness.mount({
      ...catalogueProps('tool'),
      selectedId: 'tool-0',
    });
    const notes = [...root.querySelectorAll('[data-scoped-list-inherit-note]')];
    assert.equal(notes.length, 2);
    for (const note of notes) {
      assert.ok(note.textContent.trim().length > 0, 'a count that never says WHAT is inherited');
    }
  });
});

describe('the composed selection toolbar wears the frame\'s own clothes', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  it('passes the row class and all five hook names, and inherits no studio default', async () => {
    const root = await catalogueHarness.mount(catalogueProps('component'));
    const toolbar = root.querySelector('[data-scoped-list-selection-toolbar]');
    assert.ok(Boolean(toolbar), 'the toolbar renders unconditionally, at a count of zero');
    // TOKENS, not the whole string: Svelte appends its own scoping hash to the class attribute
    // of every element the primitive renders. The contract is which of the four candidate row
    // classes this root wears, and that no studio's leaked in.
    assert.ok(toolbar.classList.contains('manager-scoped-list-filter-row'));
    assert.ok(toolbar.classList.contains('is-selection'));
    for (const studio of [
      'manager-component-filter-row',
      'manager-recipe-filter-row',
      'manager-essence-filter-row',
    ]) {
      assert.equal(toolbar.classList.contains(studio), false, `${studio} leaked in`);
    }
    assert.ok(Boolean(root.querySelector('[data-scoped-list-select-all-page]')));

    // The Component Studio's five defaults must be nowhere in this tree: inheriting them would
    // retune six scoped screens silently the next time that studio moves.
    for (const inherited of [
      'data-component-selection-toolbar',
      'data-component-select-all-page',
      'data-component-selection-count',
      'data-component-select-all-results',
      'data-component-clear-selection',
    ]) {
      assert.equal(root.querySelectorAll(`[${inherited}]`).length, 0, `${inherited} leaked in`);
    }

    // The remaining three hooks render only once something is selected, so tick a row.
    root.querySelector('[data-scoped-list-select="component-0"]').click();
    await catalogueHarness.setProps({});
    assert.ok(Boolean(root.querySelector('[data-scoped-list-selection-count]')));
    assert.ok(Boolean(root.querySelector('[data-scoped-list-clear-selection]')));
  });
});

// ── AC-3(b) · THE SNIPPET CONTRACT, CAPTURED FROM A RENDER ───────────────────────────────────

describe('every snippet is invoked with the documented parameters', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  const CTX_KEYS = ['scope', 'systems', 'systemId', 'selected', 'member', 'systemRow'];

  it('rowMeta and inspectorBody receive (entry, ctx) with exactly the documented ctx keys', async () => {
    const seen = [];
    const props = catalogueProps('tool', {
      rowMeta: recordingSnippet(seen, 'data-lane-row-meta'),
      inspectorBody: recordingSnippet(seen, 'data-lane-inspector-body'),
      selectedId: 'tool-0',
    });
    const root = await catalogueHarness.mount(props);
    assert.ok(Boolean(root.querySelector('[data-lane-row-meta]')), 'rowMeta rendered');
    assert.ok(Boolean(root.querySelector('[data-lane-inspector-body]')), 'inspectorBody rendered');
    assert.ok(seen.length >= 2, 'no snippet was invoked, so the key sets below are vacuous');
    for (const [entry, ctx] of seen) {
      assert.ok(entry && typeof entry.id === 'string', 'the first parameter is the entry');
      assert.deepEqual(
        Object.keys(ctx).sort(),
        [...CTX_KEYS].sort(),
        'the ctx key set is part of the contract: a lane reaches a conditionally present field ' +
          'through ctx.scope rather than through a new shell prop'
      );
      assert.equal(ctx.systemId, '', 'world scope addresses no system');
      assert.equal(ctx.systemRow, null);
      assert.equal(ctx.member, false);
    }
  });

  it('bulk receives (selectedIds, ctx) with the inert per-row half', async () => {
    const seen = [];
    const root = await catalogueHarness.mount(
      catalogueProps('component', { bulk: recordingSnippet(seen, 'data-lane-bulk') })
    );
    root.querySelector('[data-scoped-list-select="component-1"]').click();
    await catalogueHarness.setProps({});
    assert.ok(Boolean(root.querySelector('[data-lane-bulk]')), 'the bulk body rendered');
    const [ids, ctx] = seen.at(-1);
    assert.deepEqual(ids, ['component-1']);
    assert.deepEqual(Object.keys(ctx).sort(), [...CTX_KEYS].sort());
    assert.equal(ctx.selected, false, 'a bulk body addresses no single row');
    assert.equal(ctx.member, false);
    assert.equal(ctx.systemRow, null);
  });

  it('reaches a conditionally present projection field through ctx.scope', async () => {
    // `toolBreakage` is carried ONLY when the corpus holds one, so it is the field a lane would
    // otherwise ask for a new shell prop to reach.
    const seen = [];
    const scope = projectWorldScopeEntity({
      entityType: 'tool',
      corpus: {
        entities: [entityOf('tool', 0)],
        defaults: [],
        membership: [],
        toolBreakage: { mode: 'toolSpecific' },
      },
      systems: ROSTER,
    });
    await catalogueHarness.mount(
      catalogueProps('tool', { scope, rowMeta: recordingSnippet(seen, 'data-lane-row-meta') })
    );
    assert.equal(seen.at(-1)[1].scope.toolBreakage.mode, 'toolSpecific');
  });
});

// ── AC-4 · THE INHERIT ROW SET AND ITS NOTES ────────────────────────────────────────────────

describe('the rules list draws one inherit row per inheritable section, with its note', () => {
  before(() => rulesHarness.setup());
  after(() => rulesHarness.teardown());
  afterEach(() => rulesHarness.remount());

  const EXPECTED = {
    component: ['category'],
    essence: ['effectSource', 'macro'],
    tool: ['breakage', 'onBreak'],
  };

  for (const [entityType, sections] of Object.entries(EXPECTED)) {
    it(`draws ${sections.length} row(s) for a ${entityType}, from the same props`, async () => {
      const root = await rulesHarness.mount(rulesProps(entityType));
      const firstRow = rows(root)[0];
      assert.deepEqual(
        [...firstRow.querySelectorAll('[data-scoped-inherit-row]')].map((node) =>
          node.getAttribute('data-scoped-inherit-row')
        ),
        sections
      );
      assert.equal(
        firstRow.querySelectorAll('[data-scoped-inherit-row="repairRequirements"]').length,
        0,
        'a SEEDED section has no live parent to fall back to, so it draws no switch'
      );
    });
  }

  it('renders a NON-EMPTY note on every row the shell supplied one for', async () => {
    // A bare row-count criterion passes over every note empty, which is the state where a rules
    // list says "Effect source · Inherited" and never says what is being inherited.
    const root = await rulesHarness.mount(rulesProps('tool'));
    const notes = [...rows(root)[0].querySelectorAll('[data-scoped-inherit-note]')];
    assert.equal(notes.length, 2, 'both sections were given a note');
    for (const note of notes) {
      assert.ok(note.textContent.trim().length > 0);
    }
  });

  it('writes the NEXT inherit value through the action family', async () => {
    const calls = [];
    const root = await rulesHarness.mount(
      rulesProps('tool', {
        actions: { setSectionInherited: (...args) => calls.push(args) },
      })
    );
    rows(root)[0].querySelector('[data-scoped-inherit-toggle="breakage"]').click();
    assert.deepEqual(calls, [['tool-0', 'sys-a', 'breakage', false]]);
  });
});

// ── AC-6 · ROWS COME FROM THE PROJECTION'S JOIN ─────────────────────────────────────────────

describe('the per-system rows come from the join, never from the roster prop', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  it('renders one row per JOINED system, which is one FEWER than the roster', async () => {
    const props = catalogueProps('essence', { selectedId: 'essence-0' });
    const joined = props.scope.entries[0].systems;
    assert.equal(ROSTER.length, 3, 'the roster fixture must carry the dropped ghost entry');
    assert.equal(joined.length, 2, 'projectSystems drops the blank id');
    const root = await catalogueHarness.mount(props);
    const systemRows = [...root.querySelectorAll('[data-scoped-list-system]')];
    assert.equal(systemRows.length, joined.length);
    assert.notEqual(
      systemRows.length,
      ROSTER.length,
      'reading the rows off the roster prop produces this number, and a 1:1 fixture hides it'
    );
    assert.deepEqual(
      systemRows.map((row) => row.getAttribute('data-scoped-list-system')),
      ['sys-a', 'sys-b']
    );
  });

  it('renders per-row content the roster prop structurally cannot supply', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('essence', { selectedId: 'essence-0' })
    );
    const [member, absent] = [...root.querySelectorAll('[data-scoped-list-system]')];
    // `member` — the roster carries no membership at all.
    assert.ok(Boolean(member.querySelector('[data-scoped-membership-copy]')) === false);
    assert.ok(
      Boolean(member.querySelector('[data-arm-token]')),
      'sys-a HAS this essence, so its cluster offers Remove'
    );
    assert.ok(
      Boolean(absent.querySelector('[data-scoped-membership-add]')),
      'sys-b does not, so its cluster offers Add'
    );
    // …and the `enabled`-driven switch, which only an enableable type renders.
    assert.equal(member.querySelectorAll('[data-scoped-membership-enabled]').length, 1);
  });

  it('renders NO enabled switch for a component, whose row carries no such key', async () => {
    const props = catalogueProps('component', { selectedId: 'component-0' });
    assert.equal(
      'enabled' in props.scope.entries[0].systems[0],
      false,
      'the projection omits the key entirely for a component; `false` would be a different state'
    );
    const root = await catalogueHarness.mount(props);
    assert.equal(root.querySelectorAll('[data-scoped-membership-enabled]').length, 0);
    // The positive control: the clusters DID render.
    assert.equal(root.querySelectorAll('[data-scoped-membership-actions]').length, 2);
  });

  it('falls back to the system id when the roster supplies no name', async () => {
    const named = await catalogueHarness.mount({
      ...catalogueProps('component', { selectedId: 'component-0' }),
      scope: scopeOf('component', { systems: [{ id: 'sys-a', name: 'Forge' }] }),
    });
    assert.equal(
      named.querySelector('.manager-scoped-catalogue-system-name').textContent.trim(),
      'Forge'
    );
    const unnamed = await catalogueHarness.mount({
      ...catalogueProps('component', { selectedId: 'component-0' }),
      scope: scopeOf('component', { systems: [{ id: 'sys-a' }] }),
    });
    assert.equal(
      unnamed.querySelector('.manager-scoped-catalogue-system-name').textContent.trim(),
      'sys-a',
      'an allowlist-omitted field reads undefined, and the literal string "undefined" is not a name'
    );
  });
});

// ── AC-7 · THREE NO-CONTENT STATES ──────────────────────────────────────────────────────────

describe('a list has three no-content states, each its own treatment', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  const stateOf = (root) =>
    root.querySelector('[data-scoped-list-state]')?.getAttribute('data-scoped-list-state');

  it('states an UNREADABLE corpus without the no-state hero, and suspends the whole surface', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('component', {
        scope: projectWorldScopeEntity({ entityType: 'component', corpus: null }),
      })
    );
    assert.equal(stateOf(root), 'unavailable');
    assert.equal(
      root.querySelectorAll('.manager-empty').length,
      0,
      'the unavailable panel is its OWN treatment, not the hero with different copy — a ' +
        'hook-value assertion alone passes over a hero wearing this hook'
    );
    // Requirement 10: the whole authoring surface is suspended, so a screen cannot offer a
    // destructive action against a corpus nobody could read.
    for (const suppressed of [
      '[data-scoped-list-search]',
      '[data-scoped-list-membership]',
      '[data-scoped-list-sort]',
      '[data-scoped-list-selection-toolbar]',
      '[data-scoped-membership-add]',
      '[data-arm-token]',
      '[data-scoped-membership-copy]',
    ]) {
      assert.equal(root.querySelectorAll(suppressed).length, 0, `${suppressed} survived`);
    }
  });

  it('states an EMPTY but readable corpus with the hero, and keeps the surface live', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 0 }) })
    );
    assert.equal(stateOf(root), 'empty');
    const panel = root.querySelector('.manager-empty');
    assert.ok(Boolean(panel));
    assert.equal(
      panel.classList.contains('is-filtered'),
      false,
      'an empty world is an absence of content, not a query that matched nothing'
    );
    for (const live of [
      '[data-scoped-list-search]',
      '[data-scoped-list-membership]',
      '[data-scoped-list-sort]',
      '[data-scoped-list-selection-toolbar]',
    ]) {
      assert.ok(Boolean(root.querySelector(live)), `${live} was suppressed on a readable corpus`);
    }
  });

  it('states a query that matched NOTHING with the filtered treatment and a way out', async () => {
    const root = await catalogueHarness.mount(catalogueProps('component'));
    const search = root.querySelector('[data-scoped-list-search]');
    search.value = 'nothing-matches-this';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await catalogueHarness.setProps({});
    assert.equal(stateOf(root), 'filtered');
    const panel = root.querySelector('.manager-empty');
    assert.equal(
      panel.classList.contains('is-filtered'),
      true,
      'without `filtered` reaching EmptyState a GM is told their world is empty when a query ' +
        'matched nothing'
    );
    assert.ok(Boolean(root.querySelector('[data-scoped-list-clear-filters]')));
  });

  it('gives the three states PAIRWISE DISTINCT hook values', async () => {
    const values = new Set();
    values.add(
      stateOf(
        await catalogueHarness.mount(
          catalogueProps('component', {
            scope: projectWorldScopeEntity({ entityType: 'component', corpus: null }),
          })
        )
      )
    );
    values.add(
      stateOf(
        await catalogueHarness.mount(
          catalogueProps('component', { scope: scopeOf('component', { count: 0 }) })
        )
      )
    );
    const filteredRoot = await catalogueHarness.mount(catalogueProps('component'));
    const search = filteredRoot.querySelector('[data-scoped-list-search]');
    search.value = 'zzzz';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await catalogueHarness.setProps({});
    values.add(stateOf(filteredRoot));
    assert.equal(values.size, 3, [...values].join(', '));
  });
});

// ── AC-16 · THE LIST STATE MACHINE ──────────────────────────────────────────────────────────

describe('the shells own the list state machine', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  async function type(root, value) {
    const search = root.querySelector('[data-scoped-list-search]');
    search.value = value;
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await catalogueHarness.setProps({});
  }

  it('drops the inspected row when a filter excludes it', async () => {
    const root = await catalogueHarness.mount(catalogueProps('component', { count: 3 }));
    root.querySelector('[data-scoped-list-inspect="component-0"]').click();
    await catalogueHarness.setProps({});
    assert.equal(
      root.querySelector('[data-scoped-list-inspector-name]').textContent.trim(),
      'Ash 00'
    );
    await type(root, 'Ash 02');
    assert.ok(
      !root.querySelector('[data-scoped-list-inspector-name]'),
      'the inspector must fall to resting rather than render a row the list no longer shows'
    );
    assert.equal(
      root
        .querySelector('[data-scoped-list-inspector-state]')
        .getAttribute('data-scoped-list-inspector-state'),
      'resting'
    );
  });

  it('moves focus to the inspector landmark, which is a target and not a tab stop', async () => {
    const root = await catalogueHarness.mount(catalogueProps('component'));
    const inspector = root.querySelector('[data-scoped-list-inspector]');
    assert.equal(inspector.getAttribute('tabindex'), '-1');
    root.querySelector('[data-scoped-list-inspect="component-1"]').click();
    await catalogueHarness.setProps({});
    assert.equal(
      root.ownerDocument.activeElement,
      root.querySelector('[data-scoped-list-inspector]')
    );
  });

  it('counts the WHOLE selection across pages, ticks only rendered rows, and reaches all results', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 60 }) })
    );
    // Page one only: the tri-state box acts on the RENDERED rows.
    root.querySelector('[data-scoped-list-select-all-page]').click();
    await catalogueHarness.setProps({});
    assert.equal(rows(root).length, 25, 'the default page size');
    assert.match(root.querySelector('[data-scoped-list-selection-count]').textContent, /25 selected/);
    // Page two: the count survives paging, so it is the whole selection rather than the page's
    // intersection with it.
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    assert.match(root.querySelector('[data-scoped-list-selection-count]').textContent, /25 selected/);
    assert.equal(
      root.querySelector('[data-scoped-list-select-all-page]').checked,
      false,
      'page two is unselected, so the page box is not checked'
    );
    // …and the results link reaches the rows the page control cannot.
    root.querySelector('[data-scoped-list-select-all-results]').click();
    await catalogueHarness.setProps({});
    assert.match(root.querySelector('[data-scoped-list-selection-count]').textContent, /60 selected/);
  });

  it('PRUNES the selection when a filter shrinks the list', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 5 }) })
    );
    root.querySelector('[data-scoped-list-select-all-page]').click();
    await catalogueHarness.setProps({});
    assert.match(root.querySelector('[data-scoped-list-selection-count]').textContent, /5 selected/);
    await type(root, 'Ash 0');
    await type(root, 'Ash 03');
    assert.match(root.querySelector('[data-scoped-list-selection-count]').textContent, /1 selected/);
  });

  it('DISARMS on any selection, filter, sort or page change', async () => {
    // The defect this removes ships a staged removal nobody staged: arm Remove on one entity,
    // search, come back, one click.
    const props = catalogueProps('essence', { selectedId: 'essence-0' });
    const root = await catalogueHarness.mount(props);
    const armToken = () => root.querySelector('[data-arm-token][data-armed="true"]');

    const arm = async () => {
      root.querySelector('[data-scoped-list-system="sys-a"] [data-arm-token]').click();
      await catalogueHarness.setProps({});
      assert.ok(Boolean(armToken()), 'the control did not arm, so every disarm below is vacuous');
    };

    await arm();
    await type(root, 'Ash');
    assert.ok(!armToken(), 'a filter change left the control armed');

    await arm();
    const sort = root.querySelector('[data-scoped-list-sort]');
    sort.value = 'name-desc';
    sort.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    await catalogueHarness.setProps({});
    assert.ok(!armToken(), 'a sort change left the control armed');

    await arm();
    root.querySelector('[data-scoped-list-select="essence-1"]').click();
    await catalogueHarness.setProps({});
    assert.ok(!armToken(), 'a selection change left the control armed');

    await arm();
    root.querySelector('[data-scoped-list-inspect="essence-2"]').click();
    await catalogueHarness.setProps({});
    assert.ok(!armToken(), 'inspecting another row left the control armed');
  });
});

// ── AC-17 · THE CLAMP, AND WHAT THE FOOTER READS ────────────────────────────────────────────

describe('the page index is clamped and the footer reads the clamped value', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  it('shows the rows AND a range that agree after a filter shrinks the list', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 60 }) })
    );
    // Page three of three, then a query matching three rows.
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    assert.match(root.querySelector('[data-pagination-page]').textContent, /Page 3 of 3/);

    const search = root.querySelector('[data-scoped-list-search]');
    search.value = 'Ash 0';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await catalogueHarness.setProps({});

    assert.equal(rows(root).length, 10, 'Ash 00–Ash 09');
    assert.match(root.querySelector('[data-pagination-page]').textContent, /Page 1 of 1/);
    assert.match(
      root.querySelector('[data-pagination-summary]').textContent,
      /Showing 1–10 of 10/,
      'a footer fed the frame\'s OWN unclamped index states a range the list does not show, ' +
        'under a filtered set that is not empty and therefore renders no empty state'
    );
    assert.equal(
      root.querySelector('.manager-scoped-list-rows').querySelectorAll('.manager-empty').length,
      0,
      'the filtered set is not empty, so nothing in the LIST region must claim it is'
    );
  });

  it('keeps the pagination footer present below one page of rows', async () => {
    // `Pagination` defaults `persistent` to false, which hides the footer — and a browse screen
    // never hides its disabled arrows.
    const root = await catalogueHarness.mount(catalogueProps('component', { count: 3 }));
    assert.ok(Boolean(root.querySelector('[data-pagination-summary]')));
    assert.ok(Boolean(root.querySelector('[data-pagination-prev]')));
    assert.equal(root.querySelector('[data-pagination-prev]').disabled, true);
  });
});
