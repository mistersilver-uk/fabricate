/**
 * The four ESSENCE world-scope screens: the decisions that are decidable without a DOM (issue 1372,
 * epic 1357).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { get } from 'svelte/store';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from './helpers/adminStoreServices.js';
import { declaredPropNames } from './helpers/sveltePropsDeclaration.js';
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
import { WORLD_IDENTITY_FIELDS } from '../src/migration/worldScopeEntityGrouping.js';
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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_PATH = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const rootSource = readFileSync(resolve(repoRoot, ROOT_PATH), 'utf8');

/** The four keys `essenceScopeProps` supplies at every one of its call sites. */
const BUNDLE_KEYS = ['actions', 'scope', 'systemId', 'systems'];

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

// ── (1) THE SOURCE CONTRACT: NO SCREEN DECLARES A PROP ITS CALL SITE DOES NOT SUPPLY ──────────

/** The attribute names one call site passes, read off the root's own markup. */
function staticAttributesAt(componentName) {
  const lines = rootSource.split('\n');
  const index = lines.findIndex((line) => line.trim() === `<${componentName}`);
  assert.ok(index >= 0, `${componentName} is not rendered by the manager root`);
  const indent = lines[index].slice(0, lines[index].length - lines[index].trimStart().length);
  const end = lines.findIndex((line, at) => at > index && line === `${indent}/>`);
  assert.ok(end > index, `${componentName} never closes on its own indentation`);
  const names = [];
  for (const line of lines.slice(index + 1, end)) {
    const trimmed = line.trim();
    const bound = /^bind:([A-Za-z][A-Za-z0-9_$]*)=/.exec(trimmed);
    if (bound) {
      names.push(bound[1]);
      continue;
    }
    const named = /^([A-Za-z][A-Za-z0-9_$]*)=/.exec(trimmed);
    if (named) {
      names.push(named[1]);
      continue;
    }
    const shorthand = /^\{([A-Za-z][A-Za-z0-9_$]*)\}$/.exec(trimmed);
    if (shorthand) names.push(shorthand[1]);
  }
  return names;
}

// (1b) THE REQUIREMENT-7 CORRECTION, EVIDENCED ON THE REOPENING CHANGE'S OWN DIFF. `### GM World
// Scoped Entity Routes` requirement 7 closes `CraftingSystemManagerRoot.svelte` to this epic's
// later lanes, and its own amendment says the closure "is void for a seam the enumeration does not
// name": reopening the file to supply a NAMED missing seam is a correction, reopening it to build a
// screen is a violation, and "the distinction is not decidable from a diff's file names, so a
// correction claim is EVIDENCED on the reopening change's own diff — by an unchanged-render or
// import-surface assertion" (issue 1372).

describe('requirement 7 correction — the reopened gateway grew a seam, not a dependency', () => {
  /** Every module specifier the gateway imports, in source order. */
  function gatewayImportSpecifiers() {
    return [...rootSource.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  }

  it('IMPORT SURFACE: the essence-family dependency set grows by exactly one pure leaf', () => {
    const specifiers = gatewayImportSpecifiers();
    // NON-VACUITY first: an empty match set would make the equality below assert nothing.
    assert.ok(specifiers.length > 50, 'the gateway import scan found no imports at all');
    assert.deepEqual(
      specifiers.filter((specifier) => /essence/i.test(specifier)).sort(),
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
      'a correction that had to import a COMPONENT would be building here, not carrying a seam'
    );
  });

  it('SEAM 2 imports NAMED helpers from a leaf that imports nothing itself', () => {
    // A NAMESPACE import would turn this line into a permanent door: every future addition to the
    // leaf would be reachable from the gateway with no diff here at all.
    assert.match(
      rootSource,
      /import \{ essenceShortValueName, mintEssenceId \} from '\.\/scoped\/essenceScoped\.js';/,
      'the gateway takes exactly those two, by name'
    );
    const leaf = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/essenceScoped.js'),
      'utf8'
    );
    assert.ok(leaf.length > 500, 'the leaf source read produced nothing, so the scan below is empty');
    assert.deepEqual(
      [...leaf.matchAll(/^import\s/gm)].map((match) => match[0]),
      [],
      'and that leaf still imports nothing, so the gateway inherits no new dependency through it'
    );
  });

  it('SEAM 2 renders ONE header control and composes two things the shell already owns', () => {
    // The RENDER bound: one branch, one button, in the header-actions chain — no new element type,
    // no new region, no screen.
    const branches = [...rootSource.matchAll(/data-world-essence-create/g)];
    assert.equal(branches.length, 1, 'the header carries exactly one create control');
    assert.match(
      rootSource,
      /<ManagerButton role="primary" data-world-essence-create onclick=\{createWorldEssence\}>/,
      'and it is the shipped button primitive, not hand-rolled markup'
    );
    // The HANDLER bound: the write is the store family the pages are already handed, and the
    // navigation is the same route-exit-gated function the row's pen uses.
    assert.match(
      rootSource,
      /store\?\.worldScope\?\.essence\?\.createEntity\?\./,
      'the write goes through the essence write family, not a new path'
    );
    assert.match(
      rootSource,
      /openWorldScopedEntry\('world-essence-entry', id\)/,
      'and the navigation is the shell function three other sites already call'
    );
  });

  it('the deep link is wired from a shell function that already served three other sites', () => {
    assert.ok(
      /function openWorldScopedEntry\(/.test(rootSource),
      'the navigation the seam delegates to is the shell’s own, declared in this file'
    );
    const attributes = staticAttributesAt('EssenceBrowserInspector');
    assert.ok(
      attributes.includes('onOpenWorldDefinition'),
      'the inspector call site carries the one callback the seam needs'
    );
    // The RENDER bound, pinned to a literal (issue 1372).
    assert.deepEqual(
      attributes,
      [
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
        'membershipActions',
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
      'the reopening changes an existing call site and adds no element, branch or screen'
    );
    // And the callback actually navigates, rather than being a declared-but-inert prop.
    assert.match(
      rootSource,
      /onOpenWorldDefinition=\{\(id\) => openWorldScopedEntry\('world-essence-entry', id\)\}/,
      'the seam routes to the world essence entry through the shared route-exit gate'
    );
  });

  it('SEAM 3 renders the action pair through ONE shared component, not a hand-rolled pair', () => {
    // The RENDER bound: ONE ELEMENT PER WORLD ENTRY ROUTE, each in its own branch, and never a pair
    // of buttons a screen spells out for itself (issue 1373).
    assert.equal(
      [...rootSource.matchAll(/<ScopedEntryHeaderActions\b/g)].length,
      3,
      'one scoped-entry action pair per world entry route, and no route carrying two'
    );
    const attributes = staticAttributesAt('ScopedEntryHeaderActions');
    assert.deepEqual(
      attributes,
      [
        'backAttribute',
        'saveAttribute',
        'backLabel',
        'saveLabel',
        'saveDisabled',
        'saving',
        'onBack',
        'onSave',
      ],
      'the pair is configured by props alone; a per-screen tweak here would be a second pair'
    );
    // The two hooks the capture registry and the mounted suites name are still rendered, and are
    // rendered BY THIS FILE — the component takes them as props precisely so it cannot rename a
    // selector out from under a site.
    assert.match(rootSource, /backAttribute="data-world-essence-back"/);
    assert.match(rootSource, /saveAttribute="data-world-essence-save"/);
    // The tool entry's own two, for the same reason: they are per-site selectors the capture
    // registry and the mounted suites name, and the component takes them as props so that a
    // shared change cannot rename one site out from under the other.
    assert.match(rootSource, /backAttribute="data-world-tool-back"/);
    assert.match(rootSource, /saveAttribute="data-world-tool-save"/);
  });

  it('SEAM 3 puts the editor in the route-exit chain, so the rail and the breadcrumb prompt too', () => {
    // THE HALF A MOUNT CANNOT REACH.
    assert.match(
      rootSource,
      /function confirmWorldEssenceEntryRouteExit\(/,
      'the shell declares no world-entry route-exit guard'
    );
    assert.match(
      rootSource,
      /const worldEntryConfirmed = confirmWorldEssenceEntryRouteExit\(nextView, nextRouteId\);/,
      'the guard is declared but never reached from `confirmRouteExitGuards`, which is the ' +
        'cascade every navigation in this shell passes through'
    );
    // …and it delegates rather than restating the shape: the three-way answer, the save-gated
    // navigation and the synchronous clean path are all `scopedEntryDraft.js`'s.
    assert.match(
      rootSource,
      /return confirmScopedEntryExit\(\{/,
      'the guard hand-rolls the three-way prompt shape instead of taking the shared one'
    );
    assert.match(
      rootSource,
      /confirm: \(\) => store\?\.confirmDiscardDirtyEssenceDraft\?\.\(\),/,
      'the prompt is the shipped essence one, not a second dialog saying the same thing'
    );
  });

  it('SEAM 3 gates navigation on the SAVE landing, and disables the button when nothing is dirty', () => {
    // Both halves are one-line reads and both are the difference between a Save control and a
    // decoration: a guard that ignored the result navigates away from work nothing persisted, and
    // a button that is never disabled says nothing about whether the last edit landed.
    assert.match(
      rootSource,
      /return \(await worldEssenceEntryHandle\.save\(\)\) !== false;/,
      'the shell discards what the flush answered, so a refused write still navigates'
    );
    assert.match(
      rootSource,
      /saveDisabled=\{!worldEssenceEntryDirty\}/,
      'the Save button is never disabled, so it cannot say whether there is anything to save'
    );
  });
});

// ── (1d) THE ENTRY EDITOR'S BUFFERED IDENTITY FIELD LIST IS A MIRROR ──────────────────────────

describe('the entry editor buffers exactly the identity fields an essence lifts to world scope', () => {
  it('declares the SAME list as `WORLD_IDENTITY_FIELDS.essences`, in the same order', () => {
    // `WorldEssenceEntryPage` states the list rather than importing it, because its dependency
    // graph is copied module by module into three hand-rolled mounted trees and an omission there
    // HANGS a suite rather than failing it.
    const entrySource = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte'),
      'utf8'
    );
    const declaration = /const IDENTITY_FIELDS = Object\.freeze\(\[([^\]]*)\]\)/.exec(entrySource);
    assert.ok(declaration, 'the entry editor declares no frozen IDENTITY_FIELDS list');
    const declared = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.ok(declared.length > 0, 'the declaration parsed to an empty list, so the equality below is vacuous');
    assert.deepEqual(
      declared,
      [...WORLD_IDENTITY_FIELDS.essences],
      'the entry editor buffers a different set of identity fields from the one an essence ' +
        'actually lifts to world scope, so at least one of them is uneditable or unsaveable'
    );
  });
});

// (1c) THE ENTRY EDITOR'S LIVE-PREVIEW FOOTER. `EssenceBehaviorPreview` renders the footer strip,
// and it is no longer optional (issue 1372).

describe('the world essence entry editor keeps the live-preview note', () => {
  const entrySource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte'),
    'utf8'
  );
  const previewSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte'),
    'utf8'
  );

  it('does not suppress it, and the primitive offers no way to', () => {
    assert.ok(
      entrySource.includes('<EssenceBehaviorPreview'),
      'NON-VACUITY: the entry page renders the preview at all'
    );
    assert.ok(
      !entrySource.includes('showLiveNote'),
      'the editor whose preview recomputes on every keystroke is the one that must say so'
    );
    // The prop is gone with its one former caller. The comment naming the three retired props
    // is the only surviving mention, so the check is against a DECLARATION rather than the name.
    assert.ok(
      !/showLiveNote\s*=/.test(previewSource),
      'and the prop is gone with its one former caller, so no site can suppress it silently'
    );
    assert.ok(
      previewSource.includes('data-essence-preview-live'),
      'while the note itself is still rendered, unconditionally'
    );
  });
});

describe('criterion 3 — no essence screen declares a prop its call site does not supply', () => {
  const SCREENS = [
    ['WorldEssenceCataloguePage', 'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte'],
    ['WorldEssenceEntryPage', 'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte'],
    ['EssenceBrowserView', 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte'],
    ['EssenceEditView', 'src/ui/svelte/apps/manager/EssenceEditView.svelte'],
  ];

  it('NON-VACUITY: each site parses a real attribute list and each file a real destructure', () => {
    // The cheapest green available to a broken parser is an empty set being a subset of anything.
    for (const [component, path] of SCREENS) {
      assert.ok(
        staticAttributesAt(component).length > 0,
        `${component}'s call site parsed no attributes at all`
      );
      assert.ok(
        declaredPropNames(readFileSync(resolve(repoRoot, path), 'utf8')).length > 0,
        `${path} parsed no declared props at all`
      );
    }
  });

  for (const [component, path] of SCREENS) {
    it(`${component} declares a SUBSET of the four bundle keys plus its own attributes`, () => {
      // THE HAZARD THIS MEASURES, in the root's own words at `CraftingSystemManagerRoot.svelte`:
      // a name declared here that the site does not pass makes the lookup fall THROUGH to the
      // spread, and every reader of it becomes a live subscriber to `essenceScopeProps` — a new
      // object on every world-corpus publish — for a value that is always `undefined`.
      const known = new Set([...BUNDLE_KEYS, ...staticAttributesAt(component)]);
      const declared = declaredPropNames(readFileSync(resolve(repoRoot, path), 'utf8'));
      const unsupplied = declared.filter((name) => !known.has(name));
      assert.deepEqual(
        unsupplied,
        [],
        `${path} declares ${unsupplied.join(', ')}, which neither the bundle nor its call site ` +
          'supplies'
      );
    });

    it(`${component} READS every name it declares, so the subset check is over a real set`, () => {
      // The positive half. A file that declared nothing would satisfy the subset clause above
      // vacuously, and a file that declared a name it never reads is dead configuration that
      // reads exactly like a live prop.
      const source = readFileSync(resolve(repoRoot, path), 'utf8');
      const declared = declaredPropNames(source);
      const start = source.indexOf('let {');
      const body = source.slice(source.indexOf('} = $props();', start));
      const unread = declared.filter(
        (name) => !new RegExp(`\\b${name}\\b`).test(body)
      );
      assert.deepEqual(unread, [], `${path} declares ${unread.join(', ')} and never reads them`);
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

  it('is what all THREE world-default readers call for this section', () => {
    // A MIRROR GUARD. Each of these is a single call in a `.svelte`, and the failure it catches is
    // a fourth reader added later that goes back to reading the block as a scalar — which is
    // silent, because the screen then reports an authored default as unset and nothing reds.
    const readers = [
      'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte',
      'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte',
      'src/ui/svelte/apps/manager/EssenceEditView.svelte',
    ];
    for (const reader of readers) {
      const source = readFileSync(resolve(repoRoot, reader), 'utf8');
      assert.match(
        source,
        /essenceEffectSourceReferent\(/,
        `${reader} must read the effectSource block through the shared referent reader`
      );
      // NON-VACUITY: it also has to be reached for the effectSource section specifically, not
      // merely imported.
      assert.match(source, /essenceEffectSourceReferent\([^)]*effectSource/);
    }
  });

  it('and the locked cards render the WORLD layer rather than the draft', () => {
    // The `World default` pill sat over the two fields the UNLOCKED card edits — the draft's own
    // source and macro — so a locked card labelled this system's own value as the world's.
    const tab = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/essences/EssenceOnCraftTab.svelte'),
      'utf8'
    );
    assert.match(tab, /worldDefaults = \{\}/, 'the tab takes the world layer as a prop');
    assert.match(tab, /lockedSourceName \|\|/, 'and the locked source card renders it');
    assert.match(tab, /lockedMacroName \|\|\s*lockedMacroUuid/, 'as does the locked macro card');
    const editor = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceEditView.svelte'),
      'utf8'
    );
    assert.match(editor, /worldDefaults=\{worldDefaultCards\}/, 'and the editor supplies it');
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

  it('is WIRED — the guard is unreachable unless the shell mints against it', () => {
    // Matched as a live statement, never as a substring: a bare `match` is satisfied by the call
    // commented out, which is the shape a bisect or a revert produces, so the pin would certify a
    // shell that mints a hardcoded id and reclaims a retired one on the next press.
    const [, args] =
      rootSource.match(/\n {4}const id = mintEssenceId\(([\s\S]*?)\n {4}\);/) ?? [];
    assert.ok(args, 'the shell mints the new world essence id from a LIVE statement');
    assert.match(args, /worldScopeState\.essence\?\.entities/, 'against the live roster');
    assert.match(args, /worldScopeState\.essence\?\.retiredIds/, 'AND the retired ids');
  });
});

// ── (14) The shared-definition callout names the world record (issue 1654) ────────────────────

describe('the shared-definition callout names the record its pill claims', () => {
  const editorSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/EssenceEditView.svelte'),
    'utf8'
  );
  const [calloutSource] = editorSource.match(/<SharedDefinitionCallout[\s\S]*?\/>/) ?? [];

  it("draws name and icon from the world entry rather than this system's projection", () => {
    // `World definition` and "Name, icon and colour are world vocabulary" were true by construction
    // while the `1.30.0` lift was 1:1; after `1.34.0` one world entity backs N in-system records
    // whose `icon` is outside the equivalence key, so the caption could carry a per-system glyph.
    assert.ok(calloutSource, 'the rules tab renders the callout');
    assert.match(calloutSource, /World definition/, 'under the world-definition pill');
    assert.match(calloutSource, /name=\{worldEntry\?\.entity\?\.name/);
    assert.match(calloutSource, /icon=\{normalizeEssenceIcon\(\s*worldEntry\?\.entity\?\.icon/);
  });

  it('and keeps the in-system colorToken as the tint, because THAT one is the world value', () => {
    // Maintainer ruling M29: `colorToken` is the single identity field the world overlay carries
    // into the in-system projection, so re-routing it through `worldEntry` would swap one correct
    // read for another and make the expression look uniform at the cost of saying less.
    assert.match(calloutSource, /tint=\{normalizeEssenceColorToken\(essence\?\.colorToken\)/);
  });
});

/**
 * The rules route draws two medallions for one essence — this callout and the page header's
 * `Medallion` + `<h1>`, whose name the breadcrumb repeats — rendered from different files, and
 * requirement 13 makes sourcing them from different layers a defect.
 */
describe('the rules route header draws the same layer the callout below it does', () => {
  /**
   * One whole top-level `$derived` declaration from the shell, or `''`.
   *
   * @returns {string} the statement text, closing paren included.
   */
  function shellDerived(name) {
    const pattern = new RegExp(`\\n {2}const ${name} = \\$derived\\(([\\s\\S]*?)\\n {2}\\);`);
    return rootSource.match(pattern)?.[1] ?? '';
  }

  it('leads the name and the glyph with the WORLD record, not this system’s projection', () => {
    for (const binding of ['essenceEditName', 'essenceEditIcon']) {
      const body = shellDerived(binding);
      assert.ok(body, `${binding} is declared as a live \`$derived\` in the shell`);
      const world = body.indexOf('essenceRulesWorldEntry?.entity?.');
      const draft = body.indexOf('essenceEditDraft?.');
      assert.ok(world >= 0, `${binding} reads the world entry the callout reads`);
      assert.ok(draft >= 0, `${binding} still carries its draft fallback`);
      assert.ok(world < draft, `${binding} lets the WORLD record win, not the in-system copy`);
    }
  });

  it('still leads with the DRAFT on a create, because there is no world record to contradict', () => {
    // `essenceRulesWorldEntry` is null for exactly two states — a create draft and a world corpus
    // that cannot answer — and in both the in-system record is the record, so the fix is the order
    // of one chain rather than a branch. Remove the draft term and a create heading prints empty.
    assert.match(shellDerived('essenceEditName'), /essenceEditDraft\?\.name/);
    assert.match(shellDerived('essenceEditIcon'), /essenceEditDraft\?\.icon/);
    // Non-vacuity for the whole describe: the derivation this precedence is measured against is
    // the one the header and the breadcrumb actually render.
    assert.match(rootSource, /<Medallion icon=\{essenceEditIcon\} tint=\{essenceEditTint\}/);
    assert.match(rootSource, /<h1 class="manager-title" title=\{essenceEditName\}>/);
  });

  it('leaves the TINT reading the in-system projection, because M29 already put the world colour there', () => {
    // `adminStore` overlays the world `colorToken` onto the in-system row, so routing the tint
    // through `essenceRulesWorldEntry` would swap one correct read for another.
    const tint = shellDerived('essenceEditTint');
    assert.ok(tint, 'the tint is declared as a live `$derived` too');
    assert.ok(
      !tint.includes('essenceRulesWorldEntry'),
      'the tint takes no world read of its own; the projection already carries the world colour'
    );
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
