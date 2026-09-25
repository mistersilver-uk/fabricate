/**
 * The four ESSENCE world-scope screens: the decisions that are decidable without a DOM (issue 1372,
 * epic 1357).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { get } from 'svelte/store';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from './helpers/adminStoreServices.js';
import { defineStructureContract } from './helpers/structureContract.js';
import {
  ESSENCE_SYSTEM_STATES,
  essenceEffectSourceReferent,
  essenceInheritCounts,
  essenceInheritLine,
  essenceSectionNote,
  essenceSystemState,
  essenceValueSuffix,
  isWorldAddressableEffectSource,
  mintEssenceId,
  worldAddressableEffectSources,
} from '../src/ui/svelte/apps/manager/scoped/essenceScoped.js';
import { ROUTE_EXIT_GUARDS } from '../src/ui/svelte/apps/manager/routeExitGuards.js';
import { WORLD_IDENTITY_FIELDS } from '../src/systems/worldScopeEntityGrouping.js';
import { membershipKey } from '../src/systems/scopedDefinitions.js';
import { createWorldScopeActions } from '../src/ui/svelte/stores/worldScopeActions.js';
import {
  buildWorldScopeState,
  projectWorldScopeEntity,
} from '../src/ui/svelte/stores/worldScopeProjection.js';
import {
  ESSENCE_VALIDATION_CHECKS,
  essenceEditorValidation,
} from '../src/ui/model/essenceValidation.js';
import { essenceValidationPresentation } from '../src/ui/svelte/apps/manager/essences/essenceStudio.js';

const MANAGER = 'src/ui/svelte/apps/manager';
const ROOT = `${MANAGER}/CraftingSystemManagerRoot.svelte`;
// The page header's action ladder is its own unit since issue 1720, so the seams below are rendered
// there while the gateway still declares their handlers.
const HEADER_ACTIONS = `${MANAGER}/ManagerHeaderActions.svelte`;
const PAGE_HEADER = `${MANAGER}/ManagerPageHeader.svelte`;
const CATALOGUE_PAGE = `${MANAGER}/scoped/WorldEssenceCataloguePage.svelte`;
const ENTRY_PAGE = `${MANAGER}/scoped/WorldEssenceEntryPage.svelte`;
const EDIT_VIEW = `${MANAGER}/EssenceEditView.svelte`;
const ESSENCE_PAIR = {
  at: 'ScopedEntryHeaderActions',
  where: ['backAttribute', 'data-world-essence-back'],
};
const CREATE_BUTTON = { at: 'ManagerButton', where: ['data-world-essence-create', true] };

const ROSTER = [
  { id: 'sys-a', name: 'Mythwright Forge' },
  { id: 'sys-b', name: 'Ironblood' },
  { id: 'sys-c', name: 'Emberwatch' },
];

/** A world essence corpus, from records this file states outright. */
function corpusOf({ membership = [], defaults = [] } = {}) {
  return {
    entities: [
      { id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'ember', description: 'Cinders' },
      { id: 'brine', name: 'Brine', icon: 'fas fa-water', colorToken: 'tide', description: 'Salt' },
    ],
    defaults,
    membership,
  };
}

// (1b) THE REQUIREMENT-7 CORRECTION. `## GM World Scoped Entity Routes` requirement 7 closes
// `CraftingSystemManagerRoot.svelte` to this epic's later lanes except to supply a NAMED missing
// seam, and a correction claim is evidenced by an unchanged-render or import-surface assertion
// (issue 1372).

describe('requirement 7 correction — the reopened gateway grew a seam, not a dependency', () => {
  defineStructureContract('IMPORT SURFACE: the essence-family set is exactly this', ROOT, {
    importSpecifiers: [
      [
        'essence',
        [
          '../../../model/essenceBrowserModel.js',
          '../../../model/essenceBulkEditModel.js',
          './EssenceBrowserView.svelte',
          './EssenceEditView.svelte',
          './essences/EssenceBehaviorPreview.svelte',
          './essences/EssenceBrowserInspector.svelte',
          './essences/EssenceBulkEditPanel.svelte',
          './scoped/WorldEssenceCataloguePage.svelte',
          './scoped/WorldEssenceEntryPage.svelte',
          './scoped/essenceScoped.js',
        ],
      ],
    ],
    // A NAMESPACE import would be a permanent door: the leaf's next export reachable, no diff here.
    contains: ["import { essenceShortValueName, mintEssenceId } from './scoped/essenceScoped.js';"],
  });

  defineStructureContract(
    'SEAM 2 takes its helpers from a leaf that imports nothing itself',
    `${MANAGER}/scoped/essenceScoped.js`,
    { importSpecifiers: [['', []]], exports: ['mintEssenceId', 'essenceShortValueName'] }
  );

  defineStructureContract(
    'SEAM 2 renders ONE header control, and it is the shipped button primitive',
    HEADER_ACTIONS,
    {
      rendersTimes: [[{ where: CREATE_BUTTON.where }, 1]],
      gives: [
        { ...CREATE_BUTTON, attribute: 'role', is: 'primary' },
        { ...CREATE_BUTTON, attribute: 'onclick', is: 'createWorldEssence' },
      ],
    }
  );

  defineStructureContract(
    'SEAM 2 writes through the essence family, mints against the retired ids, and navigates ' +
      'through the shell function the other sites call',
    { file: ROOT, fn: 'createWorldEssence' },
    {
      contains: [
        'store?.worldScope?.essence?.createEntity',
        "openWorldScopedEntry('world-essence-entry', id)",
        // Issue 1654: the live roster AND the retired ids, or a retired id is reissued.
        'mintEssenceId(name, worldScopeState.essence?.entities ?? [], ' +
          'worldScopeState.essence?.retiredIds ?? [])',
      ],
    }
  );

  defineStructureContract(
    'the navigation the deep link delegates to passes the route-exit gate',
    { file: ROOT, fn: 'openWorldScopedEntry' },
    { calls: ['confirmRouteExit', 'afterTruthyResult'] }
  );

  defineStructureContract('the inspector call site changed, and adds no element or branch', ROOT, {
    attributeOrder: [
      {
        at: 'EssenceBrowserInspector',
        names: [
          'essence',
          'showSourceUi',
          'showPropertyMacroUi',
          'managedItemOptions',
          'sourceUuid',
          'systemName',
          'inherited',
          'systemRows',
          'memberCount',
          'rosterSize',
          'onOpenSystemRules',
          'onEdit',
          'onOpenWorldDefinition',
          'onDelete',
          'onEditComponent',
          'onCopySource',
          'onUnlinkSource',
          'onSourceDrop',
          'onSourceSelect',
        ],
      },
    ],
    gives: [
      {
        at: 'EssenceBrowserInspector',
        attribute: 'onOpenWorldDefinition',
        is: "(id) => openWorldScopedEntry('world-essence-entry', id)",
      },
      {
        at: 'EssenceBrowserInspector',
        attribute: 'onOpenSystemRules',
        is: '(entityId, systemId) => openSystemEssenceRules(entityId, systemId)',
      },
    ],
  });

  defineStructureContract('the world essence pages reach the shell handlers they name', ROOT, {
    gives: [
      {
        at: 'WorldEssenceCataloguePage',
        attribute: 'onOpenSystemRules',
        is: '(entityId, systemId) => openSystemEssenceRules(entityId, systemId)',
      },
      { at: 'WorldEssenceEntryPage', attribute: 'onDirtyChange', is: 'handleWorldEssenceEntryDirty' },
    ],
  });

  // SEAM 3: one element per world entry route, configured by props alone, and the per-site
  // selectors the capture registry and the mounted suites name rendered BY THIS FILE.
  defineStructureContract('SEAM 3 renders the action pair through ONE component', HEADER_ACTIONS, {
    rendersTimes: [['ScopedEntryHeaderActions', 3]],
    attributeOrder: [
      {
        ...ESSENCE_PAIR,
        names: [
          'backAttribute',
          'saveAttribute',
          'backLabel',
          'saveLabel',
          'saveDisabled',
          'saving',
          'onBack',
          'onSave',
        ],
      },
    ],
    attributes: [
      ['saveAttribute', 'data-world-essence-save'],
      ['backAttribute', 'data-world-tool-back'],
      ['saveAttribute', 'data-world-tool-save'],
    ],
    // A button never disabled cannot say whether the last edit landed.
    gives: [
      { ...ESSENCE_PAIR, attribute: 'saveDisabled', is: '!worldEssenceEntryDirty' },
      { ...ESSENCE_PAIR, attribute: 'saving', is: 'worldEssenceEntrySaving' },
    ],
  });

  it('SEAM 3 puts the editor in the route-exit chain, so the rail and the breadcrumb prompt too', () => {
    const guard = ROUTE_EXIT_GUARDS.find((row) => row.view === 'world-essence-entry');
    assert.ok(Boolean(guard), 'the shell declares no world-entry route-exit guard');
    assert.equal(
      ROUTE_EXIT_GUARDS.indexOf(guard),
      0,
      'the guard is declared but never reached from the cascade every navigation passes through'
    );
    // The three-way answer, the save-gated navigation and the clean path: `scopedEntryDraft.js`.
    assert.equal(
      guard.finish,
      'scoped-entry',
      'the guard hand-rolls the three-way prompt shape instead of taking the shared one'
    );
  });

  defineStructureContract(
    'the prompt is the shipped essence one, not a second dialog saying the same thing',
    { file: ROOT, constant: 'routeExitGuards', property: ['world-essence-entry', 'confirm'] },
    { contains: ['() => store?.confirmDiscardDirtyEssenceDraft?.()'] }
  );

  defineStructureContract(
    'SEAM 3 gates navigation on the SAVE landing, so a refused write does not navigate',
    { file: ROOT, fn: 'saveWorldEssenceEntry' },
    { contains: ['return (await worldEssenceEntryHandle.save()) !== false;'] }
  );
});

// ── (1d) THE ENTRY EDITOR'S BUFFERED IDENTITY FIELD LIST IS A MIRROR ──────────────────────────
// `WorldEssenceEntryPage` states the list rather than importing it, because its dependency graph is
// copied into three hand-rolled mounted trees, where an omission HANGS a suite rather than failing.

defineStructureContract(
  'the entry editor buffers exactly `WORLD_IDENTITY_FIELDS.essences`, in the same order',
  { file: ENTRY_PAGE, constant: 'IDENTITY_FIELDS' },
  { contains: [`Object.freeze(${JSON.stringify([...WORLD_IDENTITY_FIELDS.essences])})`] }
);

// (1c) THE ENTRY EDITOR'S LIVE-PREVIEW FOOTER. `EssenceBehaviorPreview` renders the footer strip,
// and it is no longer optional (issue 1372).

describe('the world essence entry editor keeps the live-preview note', () => {
  defineStructureContract('the entry renders the preview, never the retired switch', ENTRY_PAGE, {
    renders: ['EssenceBehaviorPreview'],
    writesNo: ['showLiveNote'],
    spellsNo: ['showLiveNote'],
  });
  defineStructureContract(
    'and the preview offers no such prop, while still rendering the note',
    `${MANAGER}/essences/EssenceBehaviorPreview.svelte`,
    { namesNo: ['showLiveNote'], writes: ['data-essence-preview-live'] }
  );
});

// A name declared that the site does not pass falls THROUGH to the spread, so every reader of it
// subscribes to `essenceScopeProps`, a new object on every world-corpus publish, for `undefined`.
describe('criterion 3 — no essence screen declares a prop its call site does not supply', () => {
  for (const [component, file] of [
    ['WorldEssenceCataloguePage', CATALOGUE_PAGE],
    ['WorldEssenceEntryPage', ENTRY_PAGE],
    ['EssenceBrowserView', `${MANAGER}/EssenceBrowserView.svelte`],
    ['EssenceEditView', EDIT_VIEW],
  ]) {
    defineStructureContract(`${component} declares only what its call site supplies`, ROOT, {
      suppliesProps: [{ component, file }],
    });
    // The positive half: a declared name never read is dead configuration that reads like a prop.
    defineStructureContract(`${component} READS every name it declares`, file, {
      propsUnread: [[]],
    });
  }
});

// ── (2) THE STORE'S WRITE SEMANTICS ───────────────────────────────────────────────────────────

/**
 * A world essence action family over an in-memory corpus in the store's PERSISTED shape.
 *
 * @param {{defaults?: object[], membership?: object[]}} corpus in the PROJECTION's array shape,
 * which this converts, so one fixture literal drives both halves of the file.
 */
function actionsOver(corpus) {
  const toPersisted = (source) => ({
    entities: source.entities.map((entity) => ({ ...entity })),
    defaults: Object.fromEntries(source.defaults.map((record) => [record.id, { ...record }])),
    membership: Object.fromEntries(
      source.membership.map((record) => [
        membershipKey(record.entityId, record.systemId),
        { ...record },
      ])
    ),
  });
  let state = toPersisted(corpus);
  const store = {
    get: () => JSON.parse(JSON.stringify(state)),
    async save(next) {
      state = JSON.parse(JSON.stringify(next));
      return true;
    },
  };
  const family = createWorldScopeActions({ getStores: { essence: () => store } });
  return {
    actions: family.essence,
    read: () => ({
      entities: state.entities,
      defaults: Object.values(state.defaults),
      membership: Object.values(state.membership),
    }),
  };
}

describe('criterion 6 — removing an essence from a system deletes only that record', () => {
  it('leaves the world entity, the world defaults and every other record byte-identical', async () => {
    const corpus = corpusOf({
      defaults: [{ id: 'ash', effectSource: 'Item.ember', macro: 'Macro.burn' }],
      membership: [
        { entityId: 'ash', systemId: 'sys-a', enabled: true, inherit: {}, effectSource: 'local-a' },
        { entityId: 'ash', systemId: 'sys-b', enabled: false, inherit: {}, macro: 'Macro.local-b' },
        { entityId: 'brine', systemId: 'sys-a', enabled: true, inherit: {} },
      ],
    });
    const { actions, read } = actionsOver(corpus);
    const before = read();

    assert.equal(await actions.removeFromSystem('ash', 'sys-a'), true);
    const after = read();

    assert.deepEqual(after.entities, before.entities, 'the world roster is untouched');
    assert.deepEqual(after.defaults, before.defaults, 'the world defaults are untouched');
    const survivors = after.membership.map((record) => `${record.entityId}|${record.systemId}`);
    assert.deepEqual(survivors.sort(), ['ash|sys-b', 'brine|sys-a']);
    // NON-VACUITY: the record that was removed really was there, and the survivors kept their
    // OWN authored overrides rather than merely their keys.
    assert.equal(before.membership.length, 3);
    assert.equal(
      after.membership.find((record) => record.systemId === 'sys-b').macro,
      'Macro.local-b'
    );
  });
});

describe('criterion 7 — re-inheriting RETAINS the dormant override', () => {
  it('restores the original local value and re-seeds nothing from the world', async () => {
    const corpus = corpusOf({
      defaults: [{ id: 'ash', effectSource: 'Item.world-ember' }],
      membership: [{ entityId: 'ash', systemId: 'sys-a', enabled: true, inherit: {} }],
    });
    const { actions, read } = actionsOver(corpus);

    // OVERRIDE, then author a value that is NOT the world's, so a re-seed is distinguishable
    // from a retention. A test that left the seeded copy in place could not tell them apart.
    assert.equal(await actions.setSectionInherited('ash', 'sys-a', 'effectSource', false), true);
    assert.equal(await actions.updateMembershipSection('ash', 'sys-a', 'effectSource', 'Item.local'), true);
    const overridden = read().membership[0];
    assert.equal(overridden.inherit.effectSource, false);
    assert.equal(overridden.effectSource, 'Item.local');

    // INHERIT ON: the switch flips and the override stays on disk, dormant.
    assert.equal(await actions.setSectionInherited('ash', 'sys-a', 'effectSource', true), true);
    const inheriting = read().membership[0];
    assert.equal(inheriting.inherit.effectSource, true);
    assert.equal(inheriting.effectSource, 'Item.local', 'the dormant override is retained');

    // INHERIT OFF AGAIN: the retained value is what comes back, NOT a fresh copy of the world's.
    assert.equal(await actions.setSectionInherited('ash', 'sys-a', 'effectSource', false), true);
    assert.equal(read().membership[0].effectSource, 'Item.local');
  });
});

describe('criterion 8 — the inherit count counts MEMBERS ONLY', () => {
  it('counts one inheriting system across two members and three systems', () => {
    const scope = projectWorldScopeEntity({
      entityType: 'essence',
      corpus: corpusOf({
        defaults: [{ id: 'ash', effectSource: 'Item.world-ember' }],
        membership: [
          // INHERITING: an absent `inherit` key reads as inheriting, matching `isSectionInherited`.
          { entityId: 'ash', systemId: 'sys-a', enabled: true, inherit: {} },
          // A MEMBER THAT OVERRIDES.
          {
            entityId: 'ash',
            systemId: 'sys-b',
            enabled: true,
            inherit: { effectSource: false },
            effectSource: 'Item.local',
          },
          // `sys-c` is NOT a member and must not be counted as inheriting.
        ],
      }),
      systems: ROSTER,
    });
    const entry = scope.entries.find((candidate) => candidate.id === 'ash');
    assert.equal(entry.membershipCount, 2);
    assert.equal(entry.inheritCounts.effectSource, 1);
    // NON-VACUITY: all three systems really are in the join, so "one of two" is a count over a
    // roster that could have said three.
    assert.equal(entry.systems.length, 3);
    assert.deepEqual(essenceInheritCounts(entry, 'effectSource'), {
      members: 2,
      inheriting: 1,
      overriding: 1,
    });
  });
});

// ── (3) THE PICKER'S ADDRESSABILITY RULE ──────────────────────────────────────────────────────

describe('criterion 9 — the world-defaults effectSource picker refuses a system-local id', () => {
  const CANDIDATES = [
    { id: 'wc-ember', name: 'World Ember' },
    { id: 'Item.kTz9QpLm2xR4vB1a', name: 'Ember Infusion' },
    { id: 'sm-c-iron', name: 'Iron (Smithing only)' },
  ];
  const WORLD_COMPONENTS = [{ id: 'wc-ember' }];

  it('offers the world component id and the document UUID, and NOT the system-local id', () => {
    const offered = worldAddressableEffectSources(CANDIDATES, WORLD_COMPONENTS).map((c) => c.id);
    assert.deepEqual(offered, ['wc-ember', 'Item.kTz9QpLm2xR4vB1a']);
    // NON-VACUITY IN BOTH DIRECTIONS.
    assert.deepEqual(worldAddressableEffectSources(CANDIDATES, []).map((c) => c.id), [
      'Item.kTz9QpLm2xR4vB1a',
    ]);
    assert.equal(worldAddressableEffectSources(CANDIDATES, [{ id: 'sm-c-iron' }]).length, 2);
  });

  it('answers the predicate directly for each of the three shapes', () => {
    assert.equal(isWorldAddressableEffectSource('wc-ember', ['wc-ember']), true);
    assert.equal(isWorldAddressableEffectSource('Actor.abc.Item.def', []), true);
    assert.equal(isWorldAddressableEffectSource('Compendium.world.items.abc', []), true);
    assert.equal(isWorldAddressableEffectSource('sm-c-iron', []), false);
    assert.equal(isWorldAddressableEffectSource('', ['']), false);
  });
});

// ── (4) THE VALIDATION MODEL ──────────────────────────────────────────────────────────────────

describe('criterion 11 — the system-scope pass BLOCKS with no membership record', () => {
  it('reports the no-rules check as a block and counts it', () => {
    const { groups, counts } = essenceValidationPresentation(
      { name: 'Ash', icon: 'fas fa-fire', description: 'Cinders' },
      { membershipKnown: true, member: false, systemName: 'Mythwright Forge' }
    );
    const systemGroup = groups.find((group) => group.id === 'system');
    assert.ok(systemGroup, 'the system group renders');
    const blocking = systemGroup.rows.filter((row) => row.status === 'block').map((row) => row.id);
    assert.deepEqual(blocking, ['systemRules']);
    assert.ok(counts.blocking >= 1, 'and it is counted');
    // AND IT RETURNS: the four membership checks are OMITTED rather than reported as passes,
    // because their subject is a record that does not exist.
    assert.deepEqual(systemGroup.rows.map((row) => row.id), ['systemRules']);
    assert.match(systemGroup.rows[0].detail, /Mythwright Forge/);
  });

  it('renders all five system rows once the record exists, so the omission above is a measurement', () => {
    const { groups } = essenceValidationPresentation(
      { name: 'Ash', icon: 'fas fa-fire', description: 'Cinders' },
      {
        membershipKnown: true,
        member: true,
        enabledHere: true,
        sectionInherited: { effectSource: true, macro: false },
        resolvedEffectSource: 'Item.ember',
        resolvedMacro: 'Macro.burn',
        componentCarrierCount: 2,
        systemName: 'Mythwright Forge',
      }
    );
    const systemGroup = groups.find((group) => group.id === 'system');
    assert.deepEqual(systemGroup.rows.map((row) => row.id), [
      'systemRules',
      'systemEnabled',
      'systemEffectSource',
      'systemMacro',
      'systemCarrier',
    ]);
  });
});

describe('criterion 12 — every added validation check actually RENDERS', () => {
  const ADDED = [
    'worldEffectSource',
    'worldMacro',
    'worldUsage',
    'systemRules',
    'systemEnabled',
    'systemEffectSource',
    'systemMacro',
    'systemCarrier',
  ];

  it('registers all eight in the pure check list', () => {
    for (const id of ADDED) {
      assert.ok(ESSENCE_VALIDATION_CHECKS.includes(id), `${id} is not a registered check`);
    }
  });

  it('renders each one as a PRESENT row in its own group, not merely without throwing', () => {
    // THE TRAP THIS CATCHES: `essenceValidationPresentation` FILTERS before it maps, precisely so a
    // check the evaluator did not return is dropped rather than rendered from a half-object.
    const essence = { name: 'Ash', icon: 'fas fa-fire', description: 'Cinders' };
    const rendered = new Set();
    for (const context of [
      { scope: 'world', memberSystemCount: 2, worldEffectSource: 'Item.x', worldMacro: 'Macro.y' },
      {
        membershipKnown: true,
        member: true,
        enabledHere: true,
        sectionInherited: { effectSource: true, macro: false },
        resolvedEffectSource: 'Item.x',
        resolvedMacro: 'Macro.y',
        componentCarrierCount: 1,
        systemName: 'Mythwright Forge',
      },
    ]) {
      for (const group of essenceValidationPresentation(essence, context).groups) {
        for (const row of group.rows) rendered.add(row.id);
      }
    }
    const missing = ADDED.filter((id) => !rendered.has(id));
    assert.deepEqual(missing, [], `these checks are registered but never render: ${missing}`);
  });

  it('leaves the SHIPPED seven-check tab byte-identical when no scope context is supplied', () => {
    // The shipped essence editor supplies neither `scope: 'world'` nor `membershipKnown`, and it
    // must go on reporting exactly the seven checks it always did.
    const shipped = essenceEditorValidation(
      { name: 'Ash', icon: 'fas fa-fire', description: 'Cinders' },
      {}
    );
    assert.deepEqual(shipped.checks.map((check) => check.id), [
      'name',
      'icon',
      'colour',
      'description',
      'macro',
      'source',
      'usage',
    ]);
  });
});

// ── (5) THE PRESENTATION LEAF ─────────────────────────────────────────────────────────────────

describe('the effectSource SECTION is a block, and every screen that names it reads one', () => {
  // THE DEFECT THIS PINS ────────────────────────────────────────────────────────────────
  // `effectSource` is the only section stored as a BLOCK over three shipped field names, and
  // `essenceSectionValueName` reads a section value as a string or as `{id, name}` (issue 1372).

  it('answers the referent a block names, preferring the component id', () => {
    assert.equal(
      essenceEffectSourceReferent({
        sourceComponentId: 'sm-ruby',
        sourceItemUuid: 'Item.ruby',
        associatedSystemItemId: 'sm-ruby',
      }),
      'sm-ruby',
      'the component id is the referent a GM picked; the uuid is derived from it'
    );
    assert.equal(
      essenceEffectSourceReferent({ sourceItemUuid: 'Item.ruby' }),
      'Item.ruby',
      'and a uuid-only block still names something'
    );
    assert.equal(
      essenceEffectSourceReferent({ associatedSystemItemId: 'sm-ruby' }),
      'sm-ruby',
      'the derived id is last, but it is not nothing'
    );
  });

  it('answers `` for the states that really are unset', () => {
    // An AUTHORED EMPTY BLOCK is what `buildMembershipRecord` writes for a system with no source,
    // and `null`-valued fields are what `_sourceFieldsForEssenceSelection` writes when a GM
    // unlinks one. Both mean "no source", and both must read as unset rather than as a referent.
    assert.equal(essenceEffectSourceReferent({}), '');
    assert.equal(
      essenceEffectSourceReferent({
        sourceComponentId: null,
        sourceItemUuid: null,
        associatedSystemItemId: null,
      }),
      ''
    );
    assert.equal(essenceEffectSourceReferent({ sourceComponentId: '   ' }), '');
    assert.equal(essenceEffectSourceReferent(null), '');
    assert.equal(essenceEffectSourceReferent(undefined), '');
    assert.equal(essenceEffectSourceReferent([]), '');
  });

  it('tolerates a bare string, because a hand-authored or imported value may be one', () => {
    assert.equal(essenceEffectSourceReferent('Item.ruby'), 'Item.ruby');
  });


  // A MIRROR GUARD: a fourth reader that reads the block as a scalar reports an authored default
  // as unset, and nothing reds.
  for (const [reader, call] of [
    [CATALOGUE_PAGE, 'essenceEffectSourceReferent(defaults?.effectSource)'],
    [ENTRY_PAGE, 'essenceEffectSourceReferent(defaults?.effectSource)'],
    [EDIT_VIEW, 'essenceEffectSourceReferent(worldEntry?.defaults?.effectSource)'],
  ]) {
    defineStructureContract(`${reader} reads the effectSource block through the referent`, reader, {
      contains: [call],
    });
  }

  // The `World default` pill sat over the two fields the UNLOCKED card edits, so a locked card
  // labelled this system's own value as the world's.
  defineStructureContract(
    'and the locked cards render the WORLD layer rather than the draft',
    `${MANAGER}/essences/EssenceOnCraftTab.svelte`,
    {
      declaresProp: ['worldDefaults'],
      contains: [
        "const lockedSourceName = $derived(String(worldDefaults?.sourceName ?? '').trim());",
        "const lockedMacroName = $derived(String(worldDefaults?.macroName ?? '').trim());",
        "lockedSourceName || text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None')",
        'lockedMacroName || lockedMacroUuid || ' +
          "text('FABRICATE.Admin.Manager.Essence.Macro.Unnamed', 'the linked property macro')",
      ],
    }
  );
  defineStructureContract('and the editor supplies the world layer', EDIT_VIEW, {
    gives: [{ at: 'EssenceOnCraftTab', attribute: 'worldDefaults', is: 'worldDefaultCards' }],
  });
});

describe('the essence world-scope presentation leaf', () => {
  const format = (key, fallback, data) =>
    Object.entries(data ?? {}).reduce(
      (copy, [token, value]) => copy.replaceAll(`{${token}}`, String(value)),
      fallback
    );
  const text = (key, fallback) => fallback;

  it('answers the three cell states from `member` FIRST, never from `enabled` alone', () => {
    // `buildSystemRow` answers `enabled: false` for a NON-member, so a cell that read `enabled`
    // first would paint every non-member as "disabled" — the one reading a GM cannot act on.
    assert.equal(essenceSystemState({ member: false, enabled: false }), 'absent');
    assert.equal(essenceSystemState({ member: true, enabled: false }), 'disabled');
    assert.equal(essenceSystemState({ member: true, enabled: true }), 'enabled');
    assert.deepEqual([...ESSENCE_SYSTEM_STATES], ['absent', 'disabled', 'enabled']);
  });

  it('states the no-member case as its own sentence rather than "0 of 0"', () => {
    const line = essenceInheritLine({ membershipCount: 0, inheritCounts: {} }, 'macro', format);
    assert.match(line, /No crafting system has rules/);
    assert.doesNotMatch(line, /0 of 0/);
  });

  it('appends the override clause only when there IS one', () => {
    const both = essenceInheritLine(
      { membershipCount: 3, inheritCounts: { macro: 1 } },
      'macro',
      format
    );
    assert.equal(both, '1 of 3 systems inherit this default · 2 override it locally');
    const clean = essenceInheritLine(
      { membershipCount: 3, inheritCounts: { macro: 3 } },
      'macro',
      format
    );
    assert.equal(clean, '3 of 3 systems inherit this default');
  });

  it('says "fall back", never "discard", and names the value that will be used', () => {
    const overridden = essenceSectionNote({ inherited: false, worldName: 'Ember', format });
    assert.match(overridden, /fall back to Ember/);
    assert.doesNotMatch(overridden, /discard/i);
    assert.match(essenceSectionNote({ inherited: true, worldName: 'Ember', format }), /Ember/);
    assert.match(
      essenceSectionNote({ inherited: true, worldName: '', format }),
      /unset/,
      'an unset world default is named as unset rather than rendered as a blank'
    );
  });

  it('distinguishes the two value suffixes', () => {
    assert.equal(essenceValueSuffix(true, text), 'world default');
    assert.equal(essenceValueSuffix(false, text), 'overridden here');
  });

  it('slugs a new essence id and resolves a collision by suffix rather than refusing', () => {
    // `createEntity` refuses a duplicate id and reports NOTHING, so a minter that returned a
    // taken id would ship a button that silently did nothing on its second press.
    assert.equal(mintEssenceId('Ember Dust', []), 'ember-dust');
    assert.equal(mintEssenceId('Ember Dust', [{ id: 'ember-dust' }]), 'ember-dust-2');
    assert.equal(
      mintEssenceId('Ember Dust', [{ id: 'ember-dust' }, { id: 'ember-dust-2' }]),
      'ember-dust-3'
    );
    assert.equal(mintEssenceId('  ***  ', []), 'essence');
  });
});

// ── (13) A retired essence id is never reissued (issue 1654) ──────────────────────────────────

/**
 * `1.34.0` retires the losers' ids when it merges equivalent world essences, and the references it
 * deliberately leaves pointing at a retired id are harmless only while that id matches no
 * definition.
 */
describe('a retired essence id is never reissued', () => {
  it('treats a retired id as taken even though no live entity holds it', () => {
    assert.equal(mintEssenceId('Ember Dust', [], ['ember-dust']), 'ember-dust-2');
    assert.equal(
      mintEssenceId('New essence', [{ id: 'new-essence' }], ['new-essence-2']),
      'new-essence-3'
    );
  });

  it('and the same mint WITHOUT the retired leg reclaims it, which is what this guard changes', () => {
    // Non-vacuity for the pair above: the ids asserted refused are exactly the ids the shipped
    // two-argument minter hands back, so neither assertion can be passing on an unrelated slug.
    assert.equal(mintEssenceId('Ember Dust', []), 'ember-dust');
    assert.equal(mintEssenceId('New essence', [{ id: 'new-essence' }]), 'new-essence-2');
  });

  it('defaults to none, so a world that never merged mints exactly as it did before', () => {
    assert.equal(mintEssenceId('Ember Dust', [{ id: 'ember-dust' }]), 'ember-dust-2');
    assert.equal(mintEssenceId('Ember Dust', [{ id: 'ember-dust' }], []), 'ember-dust-2');
  });

  it('takes either roster as a Set and writes to neither', () => {
    // `worldEntityIdSet` hands a Set back as given rather than copying it, so a minter that
    // unioned the two would mutate the live roster a picker is still rendering.
    const live = new Set(['ash']);
    const retired = new Set(['ash-2']);
    assert.equal(mintEssenceId('Ash', live, retired), 'ash-3');
    assert.deepEqual([...live], ['ash']);
    assert.deepEqual([...retired], ['ash-2']);
  });

  it('publishes the retired KEY SET on the essence leg the shell already holds', () => {
    const { worldScope } = buildWorldScopeState({
      stores: { essence: { corpus: () => corpusOf({}) } },
      systems: ROSTER,
      essenceMergeMap: {
        retired: {
          cinder: { name: 'Cinder', icon: 'fas fa-fire', colorToken: '', description: '' },
          soot: { name: 'Soot', icon: 'fas fa-cloud', colorToken: '', description: '' },
        },
      },
    });
    assert.deepEqual(worldScope.essence.retiredIds, ['cinder', 'soot']);
    // Non-vacuity: the leg carrying it is the real projection of the real corpus, not an empty
    // state that would answer `[]` to anything asked of it.
    assert.deepEqual(
      worldScope.essence.entities.map((entity) => entity.id),
      ['ash', 'brine'],
      'and the live roster beside it is the corpus this publish actually read'
    );
  });

  it('reads every shape an unmerged or hand-edited world can hold as "no retired ids"', () => {
    // A world that never merged has no setting, a migration that found nothing to merge leaves
    // `{}`, and a hand-edited setting may hold anything.
    const shapes = [undefined, null, {}, { retired: null }, { retired: [] }, { retired: 'ash' }, 7];
    for (const essenceMergeMap of shapes) {
      const { worldScope } = buildWorldScopeState({ systems: ROSTER, essenceMergeMap });
      assert.deepEqual(
        worldScope.essence.retiredIds,
        [],
        `${JSON.stringify(essenceMergeMap) ?? 'undefined'} reads as no retired ids`
      );
    }
    assert.deepEqual(
      buildWorldScopeState().worldScope.essence.retiredIds,
      [],
      'as does a publish that was handed no merge map at all'
    );
  });
});

// ── (14) The shared-definition callout names the world record (issue 1654) ────────────────────
// `World definition` was true by construction while the `1.30.0` lift was 1:1; after `1.34.0` one
// world entity backs N in-system records whose `icon` is outside the equivalence key. Maintainer
// ruling M29: `colorToken` is the one identity field the world overlay carries into the in-system
// projection, so the tint stays on it.

const CALLOUT = 'SharedDefinitionCallout';

defineStructureContract('the shared-definition callout names the world record', EDIT_VIEW, {
  gives: [
    {
      at: CALLOUT,
      attribute: 'pillLabel',
      is: "text('FABRICATE.Admin.Manager.Scoped.Essence.WorldDefinitionPill', 'World definition')",
    },
    { at: CALLOUT, attribute: 'name', is: "worldEntry?.entity?.name ?? essence?.name ?? ''" },
    {
      at: CALLOUT,
      attribute: 'icon',
      is: 'normalizeEssenceIcon(worldEntry?.entity?.icon || essence?.icon || DEFAULT_ESSENCE_ICON)',
    },
    { at: CALLOUT, attribute: 'tint', is: "normalizeEssenceColorToken(essence?.colorToken) || ''" },
  ],
});

/**
 * The rules route draws two medallions for one essence — this callout and the page header's
 * `Medallion` + `<h1>`, whose name the breadcrumb repeats — and requirement 13 makes sourcing
 * them from different layers a defect. `essenceRulesWorldEntry` is null for a create draft and
 * for a corpus that cannot answer, so the draft stays in the chain, after the world record.
 */
describe('the rules route header draws the same layer the callout below it does', () => {
  for (const [binding, field, fallback] of [
    ['essenceEditName', 'name', "''"],
    ['essenceEditIcon', 'icon', "'fas fa-mortar-pestle'"],
  ]) {
    defineStructureContract(
      `${binding} leads with the WORLD record, then the draft`,
      { file: ROOT, constant: binding },
      {
        contains: [
          `$derived(essenceRulesWorldEntry?.entity?.${field} || essenceEditDraft?.${field} || ` +
            `selectedEssenceStrict?.${field} || ${fallback})`,
        ],
      }
    );
  }
  defineStructureContract(
    'the TINT takes no world read: the projection already carries the world colour',
    { file: ROOT, constant: 'essenceEditTint' },
    { namesNo: ['essenceRulesWorldEntry'], names: ['essenceEditDraft'] }
  );
  defineStructureContract('and the header and breadcrumb render those derivations', PAGE_HEADER, {
    gives: [
      {
        at: 'Medallion',
        where: ['icon', 'essenceEditIcon'],
        attribute: 'tint',
        is: 'essenceEditTint',
      },
      { at: 'h1', where: ['title', 'essenceEditName'], attribute: 'class', is: 'manager-title' },
    ],
  });
});

// ── (15) The gateway line that makes the guard reachable (issue 1654) ─────────────────────────

/**
 * Driven through the real store rather than the leaf: every assertion in section (13) passes its
 * own `essenceMergeMap`, so deleting the one argument `adminStore.js` supplies leaves this file
 * green while the product publishes `retiredIds: []` on every world forever — the failure
 * `tests/world-vocabulary-admin-store-composition.test.js` already records against this call.
 */
describe('the gateway hands the merge map to the projection', () => {
  /**
   * The manager's published `worldScope`, through the real store.
   *
   * @param {(key: string) => unknown} getSetting the world settings registry, doubled.
   */
  async function publishedWorldScope(getSetting) {
    const store = createAdminStore(createServices(makeSystem(), [], [], { getSetting }));
    try {
      // The publish is the tail of an async refresh, so a synchronous read sees the pre-publish
      // shape. Selecting the fixture's system is what every adminStore suite drives it with.
      await store.selectSystem('sys1');
      return get(store.viewState).worldScope;
    } finally {
      store.destroy?.();
    }
  }

  it('reads the setting and publishes its key set on the essence leg', async () => {
    const reads = [];
    const worldScope = await publishedWorldScope((key) => {
      reads.push(key);
      if (key === 'worldEssenceMergeMap') {
        return { retired: { cinder: { name: 'Cinder' }, soot: { name: 'Soot' } } };
      }
      return key === 'lastManagedCraftingSystem' ? 'sys1' : '';
    });

    assert.ok(reads.includes('worldEssenceMergeMap'), 'the gateway reads the merge-map setting');
    assert.deepEqual(
      worldScope.essence.retiredIds,
      ['cinder', 'soot'],
      'and the value reaches the published essence leg the shell mints against'
    );
  });

  it('publishes no retired ids rather than THROWING when the setting is unregistered', async () => {
    // The shape a services double answering only the keys it knows produces.
    const worldScope = await publishedWorldScope((key) => {
      if (key === 'worldEssenceMergeMap') throw new Error('is not a registered game setting');
      return key === 'lastManagedCraftingSystem' ? 'sys1' : '';
    });

    assert.deepEqual(worldScope.essence.retiredIds, []);
    // Non-vacuity: a store that had died on the way would also answer nothing here, so the
    // publish this read is taken from has to be a real one with its other legs intact.
    assert.equal(worldScope.essence.entityType, 'essence', 'the publish completed');
    assert.ok(worldScope.component, 'with every other world leg on it');
  });
});
