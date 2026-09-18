/** The two scoped-entity list shells, MOUNTED (issue 1380, epic 1357). */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
// Issue 1504: a converted control is a shared `<Select>`.
import { chooseSelectOption, openSelectPanel } from '../helpers/select-control.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  STATUS_TONE_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCOPED_RAW_MODULES = [
  // Issue 1506: the one tone map the converted status pills read at a dynamic site.
  ...STATUS_TONE_RAW_MODULES,
  // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
  ...SEARCHABLE_POPOVER_RAW_MODULES,
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
  // per-entry references now, so its own static closure reaches the vocabulary core and the
  // shipped counter. The harness validates this closure and names the miss, unlike the
  // hand-rolled trees elsewhere.
  'src/systems/worldVocabulary.js',
  'src/ui/model/vocabularyUsage.js',
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/utils/recipeCategories.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  'src/systems/worldScopeEntityGrouping.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  'src/ui/model/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  'src/ui/model/scopedEntityListModel.js',
  // The frame's lifted view-state (issue 1438). Omitting a declared dependency here
  // THROWS in `before()`, which reports its tests as `# cancelled`, never `# fail`.
  'src/ui/model/managerBrowserViewState.js',
];

const FRAME_MODULES = [
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  // Select's own compiled closure (issue 1504) is spread beside this list wherever it is used
  // (`...FRAME_MODULES, ...SELECT_COMPILED_MODULES`), not folded in here.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
  // THE MEMBERSHIP FILTER IS A SEGMENTED TRACK SINCE ISSUE 1373, not a `<select>`.
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
];

const catalogueHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-catalogue-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    ...FRAME_MODULES,
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
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
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityRulesListShell.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/EntityRulesListShell.svelte',
});

// ── FIXTURES ────────────────────────────────────────────────────────────────────────────────

/**
 * One identity record, shaped as its type's lifted identity fields actually are.
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
  // EACH ENTRY IS LINKED BY A DIFFERENT ONE OF THE THREE SOURCE-LINK FIELDS.
  const link = [
    { originItemUuid: `Item.${entityType}${index}` },
    { registeredItemUuid: `Item.${entityType}${index}` },
    { aliasItemUuids: [`Item.${entityType}${index}`] },
  ][index % 3];
  return {
    ...base,
    img: `icons/commodities/${entityType}-${index}.webp`,
    ...link,
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
      // An ABSENT `inherit` map reads as inheriting for every section.
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

/** A snippet that RECORDS the arguments it was rendered with. */
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
      prerequisites: 'Falls back to anyone may use it.',
      bonus: 'Falls back to no check bonus.',
      essences: 'Falls back to no essence values.', // issue 1371 r18 (M31)
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
      prerequisites: 'Falls back to anyone may use it.',
      bonus: 'Falls back to no check bonus.',
      essences: 'Falls back to no essence values.', // issue 1371 r18 (M31)
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
      // `>= 3`, NOT `>= 1`. The badge assertion below depends on the fixture rotating all three
      // source-link fields, which needs three rows — it gets them only from `scopeOf`'s default
      // `count = 3`. At `>= 1` a later two-row fixture would silently stop exercising
      // `aliasItemUuids` while this guard went on passing.
      assert.ok(
        listRows.length >= 3,
        `only ${listRows.length} row(s): the source-link rotation needs three to reach all three fields`
      );
      assert.equal(
        root.querySelectorAll('[data-scoped-list-source]').length,
        listRows.length,
        'one badge per row'
      );
      // EVERY ROW READS AS LINKED, and the fixture links each one through a DIFFERENT field.
      assert.deepEqual(
        [...root.querySelectorAll('[data-scoped-list-source]')].map((node) =>
          node.getAttribute('data-scoped-list-source')
        ),
        listRows.map(() => 'linked'),
        'each of the three source-link fields must count, not just the first'
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
    component: ['category', 'essences'], // issue 1371 r18 (M31): the world record's second section
    essence: ['effectSource', 'macro'],
    // FOUR since `1.31.0` (issue 1373).
    tool: ['breakage', 'onBreak', 'prerequisites', 'bonus'],
  };
  const LABELS = {
    category: 'Category',
    effectSource: 'Effect source',
    macro: 'Property macro',
    breakage: 'Breakage',
    onBreak: 'On break',
    prerequisites: 'Prerequisites',
    bonus: 'Check bonus',
    essences: 'Essence values', // issue 1371 r18 (M31)
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
        "the cells enumerate the projection's own section keys"
      );
      assert.deepEqual(
        cells.map((cell) => cell.getAttribute('data-scoped-list-inherit-count')),
        sections
      );
      // THE CARD TITLE IS THE LANE'S, WITH `scopedSectionLabel` AS THE FALLBACK (issue 1372).
      // The prototype's world-default cards title themselves after the VALUE the default
      // resolves to — `Effects from Ember Brand` — and put the inherit arithmetic underneath
      // (`essences.png`). So a lane that supplies `sectionTitles` decides the words, and this
      // harness supplies none: what it measures is that the FALLBACK is still the one shared
      // section-name list, which is the property this case was written for.
      assert.deepEqual(
        cells.map((cell) =>
          cell.querySelector('.manager-scoped-catalogue-card-title').textContent.trim()
        ),
        sections.map((section) => LABELS[section])
      );
      // THE CARD'S SECOND LINE IS THE LANE'S NOTE, AND THE COUNT IS ITS FALLBACK.
      for (const cell of cells) {
        assert.match(cell.textContent, /Falls back to /);
      }
      const bare = await catalogueHarness.mount({
        ...props,
        selectedId: first.id,
        sectionNotes: {},
      });
      for (const cell of bare.querySelectorAll('[data-scoped-list-inherit-count]')) {
        assert.match(
          cell.textContent,
          /1 inheriting/,
          'with no lane note the card states the projection count itself'
        );
      }
    });
  }

  it('heads the world-defaults stack once, whatever the section count', async () => {
    // ── A REVERSAL, AND THE PROTOTYPE IS THE REASON ────────────────────────────────────────────
    // This case used to assert the opposite: NO group head above a one-section entity, on the
    // reading that a header and a divider around a single number cost more than the number. That
    // held while the region was a run of `label · N inheriting` lines with no other chrome.
    for (const entityType of ['component', 'essence', 'tool']) {
      const props = catalogueProps(entityType);
      const root = await catalogueHarness.mount({
        ...props,
        selectedId: props.scope.entries[0].id,
      });
      assert.equal(
        root.querySelectorAll('[data-scoped-list-defaults] .manager-kicker').length,
        1,
        `${entityType}: the world-defaults stack carries exactly one head`
      );
    }
  });

  it('heads the system list and states members over roster beside it', async () => {
    // `SYSTEM RULES 13 / 24` (`essences.png`). The pair is the fact.
    const props = catalogueProps('essence');
    const root = await catalogueHarness.mount({
      ...props,
      selectedId: props.scope.entries[0].id,
    });
    const count = root.querySelector('[data-scoped-list-system-count]');
    assert.ok(count, 'the system section states its count');
    assert.match(
      count.textContent.trim(),
      /^\d+ \/ \d+$/,
      'as members over the roster, not as one number'
    );
  });

  it('renders each section note the shell was given', async () => {
    const root = await catalogueHarness.mount({
      ...catalogueProps('tool'),
      selectedId: 'tool-0',
    });
    const notes = [...root.querySelectorAll('[data-scoped-list-inherit-note]')];
    assert.equal(notes.length, 4);
    for (const note of notes) {
      assert.ok(note.textContent.trim().length > 0, 'a count that never says WHAT is inherited');
    }
  });
});

describe("the composed selection toolbar wears the frame's own clothes", () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  it('passes the row class and all five hook names, and inherits no studio default', async () => {
    const root = await catalogueHarness.mount(catalogueProps('component'));

    // ── AT REST THE REGISTER IS NOT ON THE SCREEN AT ALL (issue 1373, round 4) ────────────────
    // It used to render unconditionally, so a resting catalogue carried a select-all box in its
    // filter row. `proto:1970` draws no selection affordance in that row in any state and
    // `proto:591` gates the whole band on `selActive`, so the register is a state the screen
    // enters. A GM opens it from a ROW's own box, which is the design's entry point too
    // (`proto:603`) and is asserted below rather than assumed.
    assert.ok(
      !root.querySelector('[data-scoped-list-selection-toolbar]'),
      'the selection band renders before anything is selected, so the resting filter row still ' +
        'carries a control the reference does not have'
    );
    assert.ok(
      !root.querySelector('[data-scoped-list-select-all-page]'),
      'the `All` box survives at a count of zero'
    );
    const rowBox = root.querySelector('[data-scoped-list-select="component-0"]');
    assert.ok(
      Boolean(rowBox),
      'no row checkbox, so a selection cannot be started from scratch at all'
    );

    rowBox.click();
    await catalogueHarness.setProps({});

    const toolbar = root.querySelector('[data-scoped-list-selection-toolbar]');
    assert.ok(Boolean(toolbar), 'ticking a row produced no selection band');
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

    // The Component Studio's five defaults must be nowhere in this tree.
    for (const inherited of [
      'data-component-selection-toolbar',
      'data-component-select-all-page',
      'data-component-selection-count',
      'data-component-select-all-results',
      'data-component-clear-selection',
    ]) {
      assert.equal(root.querySelectorAll(`[${inherited}]`).length, 0, `${inherited} leaked in`);
    }

    // THE REGISTER IS INSIDE THE BAND.
    for (const hook of [
      'data-scoped-list-select-all-page',
      'data-scoped-list-selection-count',
      'data-scoped-list-select-all-results',
      'data-scoped-list-clear-selection',
    ]) {
      assert.equal(
        toolbar.querySelectorAll(`[${hook}]`).length,
        root.querySelectorAll(`[${hook}]`).length,
        `${hook} renders outside the selection band`
      );
    }
    for (const required of [
      'data-scoped-list-select-all-page',
      'data-scoped-list-selection-count',
      'data-scoped-list-clear-selection',
    ]) {
      assert.ok(Boolean(toolbar.querySelector(`[${required}]`)), `${required} never rendered`);
    }
  });

  it('points at the inspector rather than restating what the panel there offers', async () => {
    // `proto:594`. The band and the bulk panel BOTH state the count.
    const root = await catalogueHarness.mount(
      catalogueProps('component', { bulk: markerSnippet('data-lane-bulk-body') })
    );
    root.querySelector('[data-scoped-list-select="component-0"]').click();
    await catalogueHarness.setProps({});
    const band = root.querySelector('[data-scoped-list-selection-toolbar]');
    assert.ok(Boolean(band), 'no band, so there is nothing to carry the sentence');
    assert.match(
      band.textContent,
      /Bulk actions are in the inspector/,
      'the band states a count and two actions and never says where the bulk verbs live'
    );

    const noBulk = await catalogueHarness.mount(catalogueProps('component'));
    noBulk.querySelector('[data-scoped-list-select="component-0"]').click();
    await catalogueHarness.setProps({});
    const bareBand = noBulk.querySelector('[data-scoped-list-selection-toolbar]');
    assert.ok(Boolean(bareBand), 'the band is gated on the bulk snippet rather than on a count');
    assert.ok(
      !/Bulk actions are in the inspector/.test(bareBand.textContent),
      'a catalogue with no bulk panel still points a GM at one'
    );
  });
});

// ── AC-3(b) · THE SNIPPET CONTRACT, CAPTURED FROM A RENDER ───────────────────────────────────

describe('every snippet is invoked with the documented parameters', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  // `clearSelection` joined the set at issue 1373's maintainer feedback round.
  const CTX_KEYS = [
    'scope',
    'systems',
    'systemId',
    'selected',
    'member',
    'systemRow',
    'clearSelection',
  ];

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
    // AND THE ONE CALLABLE KEY ACTUALLY CLEARS. Asserted as an EFFECT rather than as a typeof:
    assert.equal(typeof ctx.clearSelection, 'function', 'the bulk body can reach the set owner');
    ctx.clearSelection();
    await catalogueHarness.setProps({});
    assert.ok(
      !root.querySelector('[data-lane-bulk]'),
      'the bulk body still renders, so ctx.clearSelection did not reach the frame selection'
    );
  });

  it('reaches a conditionally present projection field through ctx.scope', async () => {
    // `toolBreakage` is carried ONLY when the corpus holds one.
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
    component: ['category', 'essences'], // issue 1371 r18 (M31): the world record's second section
    essence: ['effectSource', 'macro'],
    // FOUR since `1.31.0` (issue 1373). The row set is derived from the descriptor rather than
    // listed, so this moves with `TOOL_SECTIONS` and nothing else had to change.
    tool: ['breakage', 'onBreak', 'prerequisites', 'bonus'],
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
    // A bare row-count criterion passes over every note empty.
    // list says "Effect source · Inherited" and never says what is being inherited.
    const root = await rulesHarness.mount(rulesProps('tool'));
    const notes = [...rows(root)[0].querySelectorAll('[data-scoped-inherit-note]')];
    assert.equal(notes.length, 4, 'all four tool sections were given a note');
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
      named.querySelector('.manager-scoped-roster-system-name').textContent.trim(),
      'Forge'
    );
    const unnamed = await catalogueHarness.mount({
      ...catalogueProps('component', { selectedId: 'component-0' }),
      scope: scopeOf('component', { systems: [{ id: 'sys-a' }] }),
    });
    assert.equal(
      unnamed.querySelector('.manager-scoped-roster-system-name').textContent.trim(),
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
    // Requirement 10: the whole authoring surface is suspended.
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
    // THE SELECTION BAND IS NOT ON THIS LIST.
    for (const live of [
      '[data-scoped-list-search]',
      '[data-scoped-list-membership]',
      '[data-scoped-list-sort]',
    ]) {
      assert.ok(Boolean(root.querySelector(live)), `${live} was suppressed on a readable corpus`);
    }
    assert.ok(
      !root.querySelector('[data-scoped-list-selection-toolbar]'),
      'an empty catalogue draws a selection band, which can only act on rows it does not have'
    );
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
    // THE PAGE BOX IS INSIDE THE BAND NOW.
    root.querySelector('[data-scoped-list-select="component-0"]').click();
    await catalogueHarness.setProps({});
    assert.match(
      root.querySelector('[data-scoped-list-selection-count]').textContent,
      /1 selected/,
      'ticking a row selected nothing, so the band below is not the state this case measures'
    );
    // Page one only: the tri-state box acts on the RENDERED rows.
    root.querySelector('[data-scoped-list-select-all-page]').click();
    await catalogueHarness.setProps({});
    assert.equal(rows(root).length, 10, 'the default page size');
    assert.match(
      root.querySelector('[data-scoped-list-selection-count]').textContent,
      /10 selected/
    );
    // Page two: the count survives paging.
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    assert.match(
      root.querySelector('[data-scoped-list-selection-count]').textContent,
      /10 selected/
    );
    assert.equal(
      root.querySelector('[data-scoped-list-select-all-page]').checked,
      false,
      'page two is unselected, so the page box is not checked'
    );
    // …and the results link reaches the rows the page control cannot.
    root.querySelector('[data-scoped-list-select-all-results]').click();
    await catalogueHarness.setProps({});
    assert.match(
      root.querySelector('[data-scoped-list-selection-count]').textContent,
      /60 selected/
    );
  });

  it('PRUNES the selection when a filter shrinks the list', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 5 }) })
    );
    // A row's own box first, because the band that carries `All` renders only under a selection
    // (issue 1373, round 4). See the case above.
    root.querySelector('[data-scoped-list-select="component-0"]').click();
    await catalogueHarness.setProps({});
    root.querySelector('[data-scoped-list-select-all-page]').click();
    await catalogueHarness.setProps({});
    assert.match(
      root.querySelector('[data-scoped-list-selection-count]').textContent,
      /5 selected/
    );
    await type(root, 'Ash 0');
    await type(root, 'Ash 03');
    assert.match(
      root.querySelector('[data-scoped-list-selection-count]').textContent,
      /1 selected/
    );
  });

  it('DISARMS on any selection, filter, sort or page change', async () => {
    // The defect this removes ships a staged removal nobody staged.
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
    // `systems`, not the `name-desc` this asked for before issue 1504. A native `<select>` set
    // to a value it does not offer falls back to the empty string and still fires `change`, so
    // this step used to disarm the control by staging a sort key that does not exist. The
    // converted control offers what it offers, and `systems` is the real second key.
    chooseSelectOption(root, '[data-scoped-list-sort]', 'systems');
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

  it('clamps when the CORPUS shrinks under a GM sitting on a later page', async () => {
    // THE FILTER PATH DOES NOT REACH THE CLAMP, and finding that out is what this test is for.
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 60 }) })
    );
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    assert.match(
      root.querySelector('[data-pagination-page]').textContent,
      /Page 3 of 6/,
      'the fixture never reached page three, so nothing below has a stale index to clamp'
    );

    // ── (1) CLAMPED INTO A CORPUS THAT IS STILL MULTI-PAGE, where the FOOTER is the observation.
    // 15 rows at the ten-row default page size is two pages, so the bar renders and states the
    // clamped index directly. This half is here because the foot pager is `multiPageOnly` since
    // issue 1372: the shorter-corpus case below no longer draws one, and a clamp gate that only
    // ever measured the no-footer case would stop covering the footer-reads-the-clamped-value
    // half of `ui-integration/spec.md`'s list-shell requirement 13 altogether.
    await catalogueHarness.setProps({ scope: scopeOf('component', { count: 15 }) });
    assert.equal(
      rows(root).length,
      5,
      'an unclamped index slices past the end of the shorter corpus and renders ZERO rows — ' +
        'under a set that is not empty, and therefore with no empty state to explain it'
    );
    assert.match(root.querySelector('[data-pagination-page]').textContent, /Page 2 of 2/);
    assert.match(
      root.querySelector('[data-pagination-summary]').textContent,
      /Showing 11–15 of 15/,
      'the footer states a range the list does not show'
    );

    // ── (2) CLAMPED INTO A ONE-PAGE CORPUS, where the ROW SLICE is the observation.
    await catalogueHarness.setProps({ scope: scopeOf('component', { count: 8 }) });
    assert.ok(
      !root.querySelector('[data-pagination-summary]'),
      'eight rows on a ten-row page is ONE page, so this half is measuring the no-footer ' +
        'case it exists for'
    );
    assert.deepEqual(
      rows(root).map((row) => row.getAttribute('data-scoped-list-row')),
      Array.from({ length: 8 }, (unused, index) => `component-${index}`),
      'the list does not show the whole eight-record corpus from its first row, so the stale ' +
        'page index was not clamped back to zero'
    );
    assert.equal(
      root.querySelector('.manager-scoped-list-rows').querySelectorAll('.manager-empty').length,
      0,
      'the corpus is not empty, so nothing in the LIST region must claim it is'
    );
  });

  it('resets the page itself on a filter change, which is why the case above shrinks the corpus', async () => {
    // Stated as its own assertion rather than left as a comment.
    const root = await catalogueHarness.mount(
      catalogueProps('component', { scope: scopeOf('component', { count: 60 }) })
    );
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    assert.match(root.querySelector('[data-pagination-page]').textContent, /Page 2 of 6/);
    const search = root.querySelector('[data-scoped-list-search]');
    search.value = 'Ash 0';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await catalogueHarness.setProps({});
    // The filtered set is `Ash 00`-`Ash 09` and it is ONE page at the ten-row default.
    assert.deepEqual(
      rows(root).map((row) => row.getAttribute('data-scoped-list-row')),
      Array.from({ length: 10 }, (unused, index) => `component-${index}`),
      'Ash 00–Ash 09, from the first of them: the filter did not reset the page index'
    );
    assert.ok(
      !root.querySelector('[data-pagination-summary]'),
      'the filtered set is one page, so this half is measuring the no-footer case it exists for'
    );
  });

  it('HIDES the pagination footer at one page of rows and restores it at two', async () => {
    // THE MAINTAINER'S RULING, IN BOTH DIRECTIONS (issue 1372, parity round 4). The prototype's
    // catalogue draws no foot pager under its six rows (`essences.png`), and this shipped a
    // full-width `Showing 1–6 of 6 · Page 1 of 1 · Per page 25` band there — a control with no
    // reachable second state. `design-system/spec.md`'s browse recipe now permits exactly that
    // suppression and requires the bar back the moment a second page exists.
    const root = await catalogueHarness.mount(catalogueProps('component'));
    assert.equal(
      rows(root).length,
      3,
      'the fixture rendered no rows at all, so the absence asserted next is vacuous'
    );
    assert.ok(
      !root.querySelector('[data-pagination-summary]'),
      'three rows on a ten-row page is ONE page, and a bar that can only say ' +
        '"Page 1 of 1" states nothing the rows do not'
    );

    // ELEVEN, WHICH IS THE MAINTAINER'S OWN PAIR (issue 1373, feedback round 2). The window was
    // twenty-five, so an eleven-tool world catalogue was one page and drew no bar at all - twelve
    // tools as one unbounded scroll. Three must still show none and eleven must now show one, and
    // this case is where both halves of that ruling are stated against one mount.
    await catalogueHarness.setProps({ scope: scopeOf('component', { count: 11 }) });
    assert.ok(
      Boolean(root.querySelector('[data-pagination-summary]')),
      'eleven rows is two pages at the default window, and the browse recipe requires the bar'
    );
    assert.ok(Boolean(root.querySelector('[data-pagination-prev]')));
    assert.equal(
      root.querySelector('[data-pagination-prev]').disabled,
      true,
      'and where it renders it never hides its disabled arrows'
    );
  });
});

// ── THE INSPECTED ROW IS CONTROLLABLE BY THE OWNER ──────────────────────────────────────────

describe('the owner can drive the inspected row at any time', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  const inspected = (root) =>
    root.querySelector('[data-scoped-list-inspector-name]')?.textContent.trim() ?? null;

  it('CONTROL: an owner change propagates when the GM has clicked nothing', async () => {
    // The control is what makes the two cases below measurements rather than harness artifacts:
    const root = await catalogueHarness.mount(catalogueProps('component'));
    assert.equal(inspected(root), null, 'nothing is inspected on a bare mount');
    await catalogueHarness.setProps({ selectedId: 'component-1' });
    assert.equal(inspected(root), 'Ash 01');
  });

  it('the owner can MOVE the selection after the GM has clicked a row', async () => {
    // The defect this replaces: the internal click state was never cleared and was read first,
    // so one click made the prop dead for the lifetime of the mount. Every consumer that needs
    // to DRIVE inspection loses — a deep link, a route parameter restored on re-entry, a
    // re-selection after a create or a delete, and the sharp one, a page whose route-exit guard
    // refused a navigation and has to put the selection back.
    const root = await catalogueHarness.mount(catalogueProps('component'));
    root.querySelector('[data-scoped-list-inspect="component-1"]').click();
    await catalogueHarness.setProps({});
    assert.equal(inspected(root), 'Ash 01', 'the click must land, or the case below is vacuous');
    await catalogueHarness.setProps({ selectedId: 'component-2' });
    assert.equal(inspected(root), 'Ash 02');
  });

  it('the owner can CLEAR the selection back to resting', async () => {
    // A falsy value is a real instruction, not an absent one.
    const root = await catalogueHarness.mount(
      catalogueProps('component', { selectedId: 'component-1' })
    );
    assert.equal(inspected(root), 'Ash 01');
    root.querySelector('[data-scoped-list-inspect="component-2"]').click();
    await catalogueHarness.setProps({});
    assert.equal(inspected(root), 'Ash 02');
    await catalogueHarness.setProps({ selectedId: '' });
    assert.equal(inspected(root), null, 'the inspector falls back to its resting panel');
    assert.ok(Boolean(root.querySelector('[data-scoped-list-inspector-state="resting"]')));
  });

  it('a row click still drives it when the owner never sets the prop', async () => {
    const root = await catalogueHarness.mount(catalogueProps('component'));
    root.querySelector('[data-scoped-list-inspect="component-2"]').click();
    await catalogueHarness.setProps({});
    assert.equal(inspected(root), 'Ash 02', 'the internal click is still the default driver');
  });
});

// ── THE OUTWARD CALLBACKS, WHICH ARE THE HALF THE CONSUMING LANES WIRE ──────────────────────

describe('every callback the shells expose is actually invoked', () => {
  // THIS PR SHIPS NO SCREEN, so its outward API is four callbacks and nothing else exercises
  // them. Pinning the prop NAMES and the snippet invocations leaves the callbacks unmeasured,
  // and one edit to the row action handler silently turns every pen and globe on every row of
  // every scoped list into decoration while both shells stay green.
  describe('catalogue', () => {
    before(() => catalogueHarness.setup());
    after(() => catalogueHarness.teardown());
    afterEach(() => catalogueHarness.remount());

    it('calls onSelect with the entity id when a row identity is clicked', async () => {
      const selected = [];
      const root = await catalogueHarness.mount(
        catalogueProps('component', { onSelect: (id) => selected.push(id) })
      );
      root.querySelector('[data-scoped-list-inspect="component-1"]').click();
      assert.deepEqual(selected, ['component-1']);
    });

    it('calls onOpenEntry with the entity id when the row pen is clicked', async () => {
      const opened = [];
      const root = await catalogueHarness.mount(
        catalogueProps('component', { onOpenEntry: (id) => opened.push(id) })
      );
      const pen = rows(root)[1].querySelector('[data-scoped-list-action="open-entry"]');
      assert.ok(Boolean(pen), 'the row renders no open-entry action at all');
      pen.click();
      assert.deepEqual(opened, ['component-1']);
    });
  });

  describe('rules list', () => {
    before(() => rulesHarness.setup());
    after(() => rulesHarness.teardown());
    afterEach(() => rulesHarness.remount());

    it('calls onSelect, onOpenEditor and onOpenWorldEntry with the entity id', async () => {
      const calls = { select: [], editor: [], world: [] };
      const root = await rulesHarness.mount(
        rulesProps('tool', {
          onSelect: (id) => calls.select.push(id),
          onOpenEditor: (id) => calls.editor.push(id),
          onOpenWorldEntry: (id) => calls.world.push(id),
        })
      );
      const row = rows(root)[2];
      row.querySelector('[data-scoped-list-inspect="tool-2"]').click();
      row.querySelector('[data-scoped-list-action="open-editor"]').click();
      row.querySelector('[data-scoped-list-action="open-world-entry"]').click();
      assert.deepEqual(calls, { select: ['tool-2'], editor: ['tool-2'], world: ['tool-2'] });
    });
  });
});

// ── COPY-FROM IS SUPPRESSED, AND THE SUPPRESSION IS THE ASSERTION ──────────────────────────

describe('the catalogue offers no copy-from it cannot complete', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  it('renders NO copy affordance even when another system holds the entity', async () => {
    // The fixture is deliberately the one where the shipped `MembershipActions` WOULD offer it:
    const scope = projectWorldScopeEntity({
      entityType: 'component',
      corpus: {
        entities: [entityOf('component', 0)],
        defaults: [],
        membership: [
          { entityId: 'component-0', systemId: 'sys-a' },
          { entityId: 'component-0', systemId: 'sys-b' },
        ],
      },
      systems: ROSTER,
      seeded: { entities: true, defaults: true, membership: true },
    });
    const root = await catalogueHarness.mount({
      ...catalogueProps('component'),
      scope,
      selectedId: 'component-0',
    });
    const clusters = [...root.querySelectorAll('[data-scoped-membership-actions]')];
    assert.equal(clusters.length, 2, 'both systems render a cluster, so the negative has teeth');
    for (const cluster of clusters) {
      assert.ok(
        Boolean(cluster.querySelector('[data-arm-token]')),
        'each cluster is in its member branch, which is where Copy would render'
      );
    }
    assert.equal(
      root.querySelectorAll('[data-scoped-membership-copy]').length,
      0,
      'a Copy button with no source chooser either refuses every click in silence or guesses ' +
        'the source and writes the wrong overrides onto the record'
    );
  });
});

// ── AC-16(e), THE PAGE HALF ────────────────────────────────────────────────────────────────

describe('a PAGE change disarms too, which the other four cases do not reach', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  const armed = (root) => Boolean(root.querySelector('[data-arm-token][data-armed="true"]'));

  it('clears the armed token on a page change and on a page-SIZE change', async () => {
    const root = await catalogueHarness.mount({
      ...catalogueProps('essence'),
      scope: scopeOf('essence', { count: 60 }),
      selectedId: 'essence-0',
    });
    const arm = async () => {
      root.querySelector('[data-scoped-list-system="sys-a"] [data-arm-token]').click();
      await catalogueHarness.setProps({});
      assert.equal(armed(root), true, 'the control did not arm, so the disarm below is vacuous');
    };

    await arm();
    root.querySelector('[data-pagination-next]').click();
    await catalogueHarness.setProps({});
    assert.equal(armed(root), false, 'a page change left the control armed');

    await arm();
    chooseSelectOption(root, '[data-pagination-size]', '50');
    await catalogueHarness.setProps({});
    assert.equal(armed(root), false, 'a page-size change left the control armed');
  });
});

describe('QE PROBE: the route-exit guard case the spec names', () => {
  before(() => catalogueHarness.setup());
  after(() => catalogueHarness.teardown());
  afterEach(() => catalogueHarness.remount());

  const inspected = (root) =>
    root.querySelector('[data-scoped-list-inspector-name]')?.textContent.trim() ?? null;

  it('the owner RE-ASSERTS the value it last pushed, after a click it never adopted', async () => {
    // ── WHY THIS IS THE HARD CASE AND THE OTHER FOUR ARE NOT ────────────────────────────────
    // A page that REFUSES a navigation never adopted the refused id — refusing is exactly not
    // adopting it — so its own state still holds the PREVIOUS value. "Putting the selection
    // back" therefore means writing the value it last pushed, which against a frame holding
    // separate internal state is a no-op: the prop never changed, so nothing re-runs.
    const root = await catalogueHarness.mount(
      catalogueProps('component', { selectedId: 'component-0' })
    );
    assert.equal(inspected(root), 'Ash 00');

    // The GM clicks another row. The page is running its route-exit confirm.
    root.querySelector('[data-scoped-list-inspect="component-1"]').click();
    await catalogueHarness.setProps({});
    assert.equal(inspected(root), 'Ash 01', 'the click must land, or this case is vacuous');

    // The confirm is REFUSED. The page puts the selection back to the value it still holds.
    await catalogueHarness.setProps({ selectedId: 'component-0' });
    assert.equal(
      inspected(root),
      'Ash 00',
      'the guard could not put the selection back: `selectedId` is bindable and the click ' +
        'writes it, so the owner holds `component-1` after the click and this restore is a ' +
        'genuine change rather than a no-op'
    );
  });
});

// THE LANE FILTER'S FIRST GATE (issue 1504)
describe('EntityListInspectorFrame lane filters (issue 1504)', () => {
  before(catalogueHarness.setup);
  after(catalogueHarness.teardown);
  afterEach(catalogueHarness.remount);

  /** One lane filter over a field the fixture rotates, so a value really partitions the corpus. */
  const HALF_FILTER = Object.freeze({
    id: 'half',
    label: 'Half',
    options: [
      { value: 'all', label: 'Either half' },
      { value: 'first', label: 'First half' },
      { value: 'second', label: 'Second half' },
    ],
    // Keyed on the entry's ID rather than on a display field.
    matches: (entry, value) =>
      value === 'first' ? entry.id !== 'essence-2' : entry.id === 'essence-2',
  });

  const PARITY_FILTER = Object.freeze({
    id: 'parity',
    label: 'Parity',
    options: [
      { value: 'all', label: 'Either parity' },
      { value: 'even', label: 'Even' },
      { value: 'odd', label: 'Odd' },
    ],
    matches: (entry, value) =>
      value === 'even' ? entry.id !== 'essence-1' : entry.id === 'essence-1',
  });

  const laneScope = () => scopeOf('essence', { count: 3 });

  const rowIds = (root) =>
    [...root.querySelectorAll('[data-scoped-list-row]')].map((row) =>
      row.getAttribute('data-scoped-list-row')
    );

  it('filters the row set from the app`s own option list, per lane', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('essence', { scope: laneScope(), filters: [HALF_FILTER] })
    );

    assert.deepEqual(rowIds(root), ['essence-0', 'essence-1', 'essence-2'], 'the whole corpus');

    chooseSelectOption(root, '[data-scoped-list-filter="half"]', 'second');
    await catalogueHarness.setProps({});
    assert.deepEqual(
      rowIds(root),
      ['essence-2'],
      'choosing a lane value narrowed the list, so the control`s onChange reached the model'
    );

    // AND `all` IS INERT BY THE MODEL'S RULE, not by an absence of a click.
    chooseSelectOption(root, '[data-scoped-list-filter="half"]', 'all');
    await catalogueHarness.setProps({});
    assert.deepEqual(rowIds(root), ['essence-0', 'essence-1', 'essence-2'], 'and released it');
  });

  it('stamps the lane`s own id on every lane control, so N lanes are N addressable filters', async () => {
    const root = await catalogueHarness.mount(
      catalogueProps('essence', { scope: laneScope(), filters: [HALF_FILTER, PARITY_FILTER] })
    );

    assert.deepEqual(
      [...root.querySelectorAll('[data-scoped-list-filter]')].map((control) =>
        control.getAttribute('data-scoped-list-filter')
      ),
      ['half', 'parity'],
      'the hook carries the DESCRIPTOR`s id, in declaration order — one control per lane, each ' +
        'addressable on its own, which is what a capture step and a smoke step need'
    );

    // The two are independent axes rather than one control rendered twice.
    chooseSelectOption(root, '[data-scoped-list-filter="half"]', 'first');
    await catalogueHarness.setProps({});
    chooseSelectOption(root, '[data-scoped-list-filter="parity"]', 'even');
    await catalogueHarness.setProps({});
    assert.deepEqual(rowIds(root), ['essence-0'], 'both axes applied, not just the last');
  });

  it('keeps the tick, because a lane`s values are close cousins the trigger shows one of', async () => {
    // The judgement is the LIST's rather than the component's (`design-system/spec.md`).
    const root = await catalogueHarness.mount(
      catalogueProps('essence', { scope: laneScope(), filters: [HALF_FILTER] })
    );
    const panel = openSelectPanel(root, '[data-scoped-list-filter="half"]');
    assert.ok(
      panel.className.split(/\s+/).includes('fabricate-select-popover-ticked'),
      'the lane filter keeps its tick column'
    );
    assert.equal(
      panel.querySelectorAll('.fabricate-select-tick').length,
      3,
      'on EVERY row rather than only the live one, so the label column does not go ragged'
    );
  });
});
