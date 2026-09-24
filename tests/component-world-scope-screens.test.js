/**
 * The world Component screens' SOURCE contract (issue 1371, epic 1357). the GATEWAY CORRECTION's
 * evidence.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { termRowText } from '../scripts/lib/domainGlossary.js';
import { scopedEntryRoute } from '../src/ui/svelte/apps/manager/scoped/scopedEntryRoutes.js';
import { defineStructureContract } from './helpers/structureContract.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const MANAGER = 'src/ui/svelte/apps/manager';
const SCOPED = `${MANAGER}/scoped`;
const ROOT = `${MANAGER}/CraftingSystemManagerRoot.svelte`;
// The page header's action ladder is its own unit since issue 1720, so the header seams below are
// rendered by these two while the gateway still declares their handlers.
const HEADER_ACTIONS = `${MANAGER}/ManagerHeaderActions.svelte`;
const CRAFTING_ACTIONS = `${MANAGER}/ManagerHeaderCraftingActions.svelte`;
const ADMIN_STORE = 'src/ui/svelte/stores/adminStore.js';
const BROWSER_VIEW = `${MANAGER}/ComponentsBrowserView.svelte`;
const EDIT_VIEW = `${MANAGER}/ComponentEditView.svelte`;
const ADD_BUTTON = { at: 'ManagerButton', where: ['data-component-add-from-catalogue', true] };

/** EVERY route token the gateway enumerated on `origin/main`, pinned as a literal list. */
const ROUTE_TOKENS = Object.freeze([
  'access',
  'books-scrolls',
  'component-edit',
  'components',
  'crafting-settings',
  'environment-edit',
  'environments',
  'essence-edit',
  'essences',
  'gathering-event-edit',
  'gathering-task-edit',
  'knowledge',
  'recipe-edit',
  'recipe-item-edit',
  'recipes',
  'system-edit',
  'systems',
  'tags',
  'tool-edit',
  'tools',
  'world',
  'world-component-entry',
  'world-components',
  'world-currency',
  'world-downtime',
  'world-essence-entry',
  'world-essences',
  'world-modifiers',
  'world-prerequisites',
  'world-tool-entry',
  'world-tools',
  'world-travel',
  'world-vocabulary',
]);

describe('requirement 7 correction — the reopened gateways grew seams, not screens', () => {
  // AC-18. A correction and a violation are not distinguishable by file name, so the requirement
  // asks for evidence rather than a file list.
  defineStructureContract(
    'IMPORT SURFACE: the component-family set is exactly this, no namespace',
    ROOT,
    {
      // A namespace import would be listed as `* as <specifier>`, and fail this set: one line would
      // become a permanent door, every later addition reachable with no diff here.
      importSpecifiers: [
        [
          'component',
          [
            '../../../../utils/componentCategories.js',
            '../../../model/componentBrowserModel.js',
            '../../../model/componentBulkEditModel.js',
            // Moved by issue 1509's file move, and it is neither a screen nor a new dependency.
            '../../components/ArmedDangerButton.svelte',
            // `ChanceSlider.svelte` left in issue 1707 phase 2 with the drop-rate slider that imported
            // it; `EmptyState` moved by issue 1710's file move.
            '../../components/EmptyState.svelte',
            // `Kicker.svelte` and `Medallion.svelte` left in issue 1720 with the page header.
            '../../components/ManagerButton.svelte',
            '../../util/componentEditor.js',
            './ComponentEditView.svelte',
            './ComponentsBrowserView.svelte',
            // `./component/ComponentEditorHeader.svelte` left in issue 1720 with the action ladder.
            './components/ComponentBrowserInspector.svelte',
            './components/ComponentBulkEditPanel.svelte',
            // THE `Add from catalogue` PICKER (revision 8, M9).
            './scoped/ComponentAddFromCatalogueDialog.svelte',
            './scoped/WorldComponentCataloguePage.svelte',
            './scoped/WorldComponentEntryPage.svelte',
            // A string leaf that exports no component and mounts nothing.
            './scoped/componentScoped.js',
          ],
        ],
      ],
    }
  );

  // `bulkEditRules` joined the two membership verbs in issue 1371 r16-cat (maintainer ruling M25):
  // a world-scope instruction whose second half lives in `CraftingSystemManager`.
  defineStructureContract(
    'PUBLISHED SURFACE: the component family keeps its membership keys, and every family is wrapped',
    { file: ADMIN_STORE, constant: 'worldScope' },
    {
      contains: [
        '({ ...worldScopeFamilies.component, addToSystem: joinComponentToSystem, ' +
          'removeFromSystem: partComponentFromSystem, bulkEditRules: bulkEditComponentRules })',
        '([entityType, family]) => [entityType, _republishingFamily(family)]',
      ],
      calls: ['fromEntries'],
    }
  );

  // RE-PINNED TO LANE STORE'S SHARED LIBRARY READ (revision 8): two of three legs were wired and
  // the third answered 0 recipes for every world component in the world.
  defineStructureContract(
    'the usage argument gains a component leg, and the legs share one read of each corpus',
    { file: ADMIN_STORE, fn: 'buildWorldScopeState' },
    {
      contains: [
        // The cohort cache is minted per projection call, never as a module-level memo.
        'const recipeCache = new Map();',
        // The world library is read ONCE per publish and bound to a name.
        'const worldRecipes = _allRecipes();',
        '({ component: _worldComponentUsage(recipeCache), essence: ' +
          '_worldEssenceUsage(worldRecipes), tool: _worldToolUsage(recipeCache) })',
      ],
    }
  );
  defineStructureContract(
    'and the projection input takes that binding rather than calling the reader again',
    { file: ADMIN_STORE, fn: 'buildWorldScopeState', property: 'recipes' },
    { contains: ['worldRecipes'] }
  );

  // A seam may carry a value into an existing route and may not mint one. The page-header model
  // resolves every route; the shell tests each but `systems`, its default.
  defineStructureContract(
    'ROUTE ENUMERATION: the header model mints no route',
    `${MANAGER}/headerModel.svelte.js`,
    {
      comparedLiterals: [['currentView', ROUTE_TOKENS]],
    }
  );
  defineStructureContract('ROUTE ENUMERATION: and neither does the gateway', ROOT, {
    comparedLiterals: [['currentView', ROUTE_TOKENS.filter((token) => token !== 'systems')]],
  });
});

// AC-4, ONE DIRECTION ONLY: the component bundle spreads four keys and a screen legitimately
// declares three of them. The spread's keys are RESOLVED off `componentScopeProps`, not restated.
describe('the two world component pages declare only what their call site passes', () => {
  for (const [component, file, exempt] of [
    ['WorldComponentCataloguePage', `${SCOPED}/WorldComponentCataloguePage.svelte`, []],
    ['WorldComponentEntryPage', `${SCOPED}/WorldComponentEntryPage.svelte`, []],
    ['ComponentsBrowserView', BROWSER_VIEW, []],
    // The one PRE-EXISTING declared-but-unpassed prop, named rather than tolerated. The claim
    // fails if it is passed or no longer declared, so the exemption cannot outlive what it excuses.
    ['ComponentEditView', EDIT_VIEW, ['random']],
  ]) {
    defineStructureContract(`${component} declares nothing its mount omits`, ROOT, {
      suppliesProps: [{ component, file, exempt }],
    });
  }
});

// THE ENTRY WIRES THE GATEWAY OWNS AND NO MOUNT OF THE PAGE CAN SEE (issue 1371 r19-entry2,
// quality Q1 and Q8). The page's own mounted suite mounts the PAGE.
describe('the world component entry’s gateway-owned wires are pinned', () => {
  defineStructureContract(
    'names the two header hooks the capture registry and the mounted suites press',
    HEADER_ACTIONS,
    {
      attributes: [
        ['backAttribute', 'data-world-component-back'],
        ['saveAttribute', 'data-world-component-save'],
      ],
    }
  );
  // The wrong list draws `[data-scoped-entry-essences-empty]` on the card the section exists for.
  defineStructureContract(
    'hands the entry the WORLD essence roster, which fills the M31 card',
    ROOT,
    {
      gives: [
        { at: 'WorldComponentEntryPage', attribute: 'worldEssences', is: 'worldEssenceOptions' },
      ],
    }
  );
});

describe('the `Add from catalogue` header action opens a picker and navigates nowhere (M9)', () => {
  // Revision 5's control read `openWorldScopedEntry('world-component-' + 'catalogue', '')`, with a
  // comment claiming the handler widened the list's membership filter, which it never did.
  const DEAD_TOKEN = `world-component-${'catalogue'}`;

  for (const file of [ROOT, CRAFTING_ACTIONS]) {
    defineStructureContract(`${file} names the dead token nowhere, comments included`, file, {
      mentionsNo: [DEAD_TOKEN],
    });
  }
  // NON-VACUITY: the token IS a live capture-case id, so the scan above is about the gateway.
  defineStructureContract(
    'the case registry still owns it',
    { dir: 'scripts/lib/view-lab-cases' },
    {
      spells: [DEAD_TOKEN],
    }
  );

  defineStructureContract(
    'the header action presses one gateway handler, at the rung the reference draws it at',
    CRAFTING_ACTIONS,
    {
      gives: [
        { ...ADD_BUTTON, attribute: 'onclick', is: 'openComponentAddFromCatalogue' },
        // UX F-A (r9): `proto:1046` draws `+ Add from catalogue` at the published 38px rung.
        { ...ADD_BUTTON, attribute: 'size', is: '38' },
      ],
      mentionsNo: ['ManagerButton` has NO size prop yet'],
    }
  );

  // FOUNDRY 2 (r9): the picker was claimed to close on an outside click; the effect replaced it.
  defineStructureContract(
    'the handler only opens the picker, and leaving the route closes it',
    ROOT,
    {
      contains: [
        'function openComponentAddFromCatalogue() { componentAddFromCatalogueOpen = true; }',
        "$effect(() => { if (currentView !== 'components') componentAddFromCatalogueOpen = false; })",
      ],
      mentionsNo: ['dismisses on an outside click, and every nav control is outside it'],
    }
  );

  // The COMPOSED adoption, answering a strict boolean (reviewer 5, r9), into the system the run
  // was started against — the dialog's second argument, never the live selection (r17).
  defineStructureContract('the picker is mounted with the composed write', ROOT, {
    gives: [
      {
        at: 'ComponentAddFromCatalogueDialog',
        attribute: 'onAdd',
        is:
          'async (entityId, targetSystemId) => ' +
          '(await store?.worldScope?.component?.addToSystem?.(entityId, targetSystemId)) === true',
      },
      {
        at: 'ComponentAddFromCatalogueDialog',
        attribute: 'open',
        is: 'componentAddFromCatalogueOpen',
      },
      {
        at: 'ComponentAddFromCatalogueDialog',
        attribute: 'systemId',
        is: "selectedSystemId || ''",
      },
    ],
  });
});

describe('the deep link into a system’s Component Rules is a capability, not just a wire', () => {
  // QE 5: replacing the handler's body with `return false;` left 628 tests green. The selection is
  // committed through the shared guard and the route set INSIDE it, so a refused selection leaves
  // the view where it was.
  defineStructureContract(
    'it selects the system FIRST and commits the route only if that succeeded',
    { file: ROOT, fn: 'openSystemComponentRules' },
    {
      contains: [
        'if (!systemId) return false;',
        "return afterTruthyResult(selectSystem(systemId, 'components'), () => { " +
          "resetComponentSelectionFor(systemId, String(entityId ?? '')); " +
          "activeView = 'components'; });",
      ],
    }
  );

  // A mount left defaulted is silently inert, and a mounted test would pass against the default.
  // The rules list is handed the RAW selection, so its auto-select can see an empty one: the
  // derived `selectedComponent?.id` carries the `itemCards[0]` fallback.
  defineStructureContract(
    'both world screens reach it, and the rules list gets the raw selection',
    ROOT,
    {
      gives: ['WorldComponentCataloguePage', 'WorldComponentEntryPage']
        .map((at) => ({
          at,
          attribute: 'onOpenSystemRules',
          is: '(entityId, systemId) => openSystemComponentRules(entityId, systemId)',
        }))
        .concat({
          at: 'ComponentsBrowserView',
          attribute: 'selectedComponentId',
          is: 'selectedComponentId',
        }),
    }
  );

  // The switch effect is the helper with no component, so the two paths cannot drift; the helper
  // stamps the system sentinel so the effect does not wipe a deep-linked seed.
  defineStructureContract(
    'the system-switch reset and the deep link seed the selection through ONE helper',
    { file: ROOT, fn: 'resetComponentSelectionFor' },
    { contains: ['selectedComponentId = componentId;', 'lastComponentSystemId = systemId;'] }
  );
  defineStructureContract('and the switch effect calls that helper with no component', ROOT, {
    contains: [
      '$effect(() => { if (selectedSystemId === lastComponentSystemId) return; ' +
        'resetComponentSelectionFor(selectedSystemId); })',
    ],
  });
});

// AC-3. A page that hand-rolled the frame's filter, pager or bulk bar would render the same pixels
// and be a third copy of a composition three lanes share.
describe('the catalogue composes the shell and inlines nothing', () => {
  const INLINED = ['BulkSelectionToolbar', 'Pagination', 'EmptyState'];
  defineStructureContract(
    'renders exactly one EntityCatalogueShell and none of the frame internals',
    `${SCOPED}/WorldComponentCataloguePage.svelte`,
    {
      rendersTimes: [['EntityCatalogueShell', 1]],
      rendersNo: [...INLINED, 'SelectionCheckbox'],
    }
  );
  defineStructureContract(
    'and the zero counts are a MEASUREMENT: the frame renders each',
    `${SCOPED}/EntityListInspectorFrame.svelte`,
    {
      renders: INLINED,
    }
  );
});

// AC-16. The issue body named `world-component-edit`, which is in no route table: the breadcrumb
// would lose its middle crumb and the navigation land on nothing.
describe('the deep link names a route that resolves, and the gateway wires it', () => {
  for (const file of [BROWSER_VIEW, EDIT_VIEW]) {
    defineStructureContract(
      `${file} names the shipped route token`,
      { file, constant: 'WORLD_ENTRY_ROUTE' },
      {
        contains: ["'world-component-entry'"],
      }
    );
    defineStructureContract(`${file} does not name the issue body's token`, file, {
      spellsNo: ['world-component-edit'],
    });
  }

  it('and that token is a route the shell actually enumerates', () => {
    assert.ok(scopedEntryRoute('world-component-entry'), 'the entry route table carries the token');
    assert.equal(scopedEntryRoute('world-component-edit'), null, 'and not the dead one');
  });

  // A navigation prop left unwired is silently inert, and the shipped callback beside it defaults
  // to a no-op in the props block.
  defineStructureContract(
    'the gateway WIRES the exit on both mounts, rather than leaving it defaulted',
    ROOT,
    {
      gives: ['ComponentsBrowserView', 'ComponentEditView'].map((at) => ({
        at,
        attribute: 'onOpenWorldEntry',
        is: '(route, entityId) => openWorldScopedEntry(route, entityId)',
      })),
    }
  );
});

/** Every world scoped-entity page file, by name. */
const worldPages = () =>
  readdirSync(resolve(repoRoot, SCOPED)).filter(
    (entry) => entry.startsWith('World') && entry.endsWith('.svelte')
  );

describe('no new scoped file trips either naming gate', () => {
  // AC-2. The catalogue's bulk panel is a `scoped/` sibling, so both gates reach it (issue 1371).
  const WORLD_CHILDREN = [
    'WorldComponentEntryPreviewRail.svelte',
    'WorldComponentEntrySourceCard.svelte',
    'WorldComponentEntrySystemsCard.svelte',
  ];

  it('the World-prefixed file count matches the seven pages plus their named children', () => {
    const worldFiles = worldPages();
    assert.equal(
      worldFiles.length,
      7 + WORLD_CHILDREN.length,
      'a new file named World… must be a page or one of the declared children'
    );
    for (const child of WORLD_CHILDREN) {
      assert.ok(worldFiles.includes(child), `${child} is one of them`);
    }
  });

  // The route→page map matches those attribute NAMES literally against every file in this
  // directory, COMMENTS INCLUDED, so a child mentioning one claims a route a page owns.
  const HOOKS = ['data-scoped-page', 'data-scoped-placeholder'];
  for (const child of [
    'ComponentCatalogueBulkPanel.svelte',
    'ComponentAddFromCatalogueDialog.svelte',
    ...WORLD_CHILDREN,
  ]) {
    defineStructureContract(
      `${child} carries NEITHER route-hook attribute name`,
      `${SCOPED}/${child}`,
      {
        writesNo: HOOKS,
        mentionsNo: HOOKS,
      }
    );
  }
  defineStructureContract(
    'while a page does carry one, so the absence above is measured',
    `${SCOPED}/WorldComponentCataloguePage.svelte`,
    {
      writes: ['data-scoped-page'],
    }
  );
});

describe('the reachability banner names exactly the entity types still unreachable', () => {
  // AC-24, and it is the mechanism epic 1357 assigned to this lane. The paragraph was stale for
  // TOOLS for a whole release: prose is not a gate, and nothing detected it.
  const SPEC = 'openspec/specs/data-models/spec.md';

  it('the WALK resolves the whole world page set, so an empty answer is not a broken scan', () => {
    const pages = worldPages();
    assert.ok(pages.length >= 7, `the walk resolved ${pages.length} world scoped pages`);
  });

  // THIS WAS `['WorldVocabularyPage.svelte']` UNTIL ISSUE 1392 LANDED ON `main`.
  for (const page of worldPages()) {
    defineStructureContract(
      `${page} delegates to no shared placeholder page`,
      `${SCOPED}/${page}`,
      {
        importSpecifiers: [['ScopedPlaceholderPage', []]],
      }
    );
  }

  it('the banner PARAGRAPH is matched by a named anchor rather than by a bare regex over prose', () => {
    const spec = read(SPEC);
    const anchor = '**REACHABILITY, DERIVED RATHER THAN ASSERTED.**';
    assert.ok(
      spec.includes(anchor),
      `the banner paragraph is addressed by "${anchor}"; a rewrite that dropped it would make ` +
        'every assertion below vacuous, which is why the anchor is asserted before it is used'
    );
    const paragraph = spec.slice(spec.indexOf(anchor), spec.indexOf(anchor) + 1200);
    // THE DERIVED SET IS EMPTY (the rows above), and the banner says so.
    assert.match(
      paragraph,
      /is EMPTY/,
      'and the banner states an empty set rather than naming a type'
    );
    assert.match(
      paragraph,
      /world-vocabulary/,
      'still naming `world-vocabulary` and why it is outside the set: it is the one route the ' +
        'banner has to account for separately, because it renders a world screen without being ' +
        'a scoped-entity corpus at all'
    );
  });

  it('the banner still states that a reachable WRITER is not a consumed corpus', () => {
    // The other half of what this paragraph is for.
    const spec = read(SPEC);
    assert.match(spec, /A REACHABLE WRITER DOES NOT MAKE THE CORPUS CONSUMED/);
  });
});

describe('DOMAIN.md no longer claims nothing writes the world identity snapshot', () => {
  // AC-25. Without the positive half below, DELETING the whole row would pass.
  const row = termRowText('World Identity Snapshot', {
    domain: read('DOMAIN.md'),
    readNote: (f) => (existsSync(resolve(repoRoot, f)) ? read(f) : null),
  });

  it('the row still exists and still names its detector', () => {
    assert.ok(Boolean(row), 'the World Identity Snapshot row is still in the glossary');
    assert.match(row, /reportWorldIdentityDrift/, 'and still names the detector that reports it');
  });

  it('and it no longer says nothing writes it', () => {
    assert.ok(
      !row.includes('NOTHING WRITES THEREAFTER'),
      'the world Component entry editor writes the snapshot, so the claim is false'
    );
    assert.match(row, /IT HAS A WRITER/, 'and the row says which direction changed');
  });
});
