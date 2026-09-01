/**
 * The four ESSENCE world-scope screens: the decisions that are decidable without a DOM
 * (issue 1372, epic 1357).
 *
 * ── WHAT THIS FILE OWNS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────────────────
 * Everything here is either a PURE model answer (the store's write semantics, the projection's
 * counts, the addressability filter, the validation check set) or a SOURCE CONTRACT that no
 * mounted render can express (which prop names each screen declares). The rendered half — the
 * absent source affordance, the three-state indicator, the inherited-section lock — is
 * `tests/components/essence-world-scope-screens-mounted.test.js`, because each of those is a
 * question about the DOM.
 *
 * ── EVERY ASSERTION CARRIES ITS OWN NON-VACUITY ───────────────────────────────────────────────
 * Several of these are ABSENCE claims — "the picker offers no system-local id", "no other
 * membership record was touched" — and an absence claim over an empty set is the cheapest green
 * there is. Each one is therefore paired with the positive half that proves the set it is
 * measuring is real.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { declaredPropNames } from './helpers/sveltePropsDeclaration.js';
import {
  ESSENCE_SYSTEM_STATES,
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
import { projectWorldScopeEntity } from '../src/ui/svelte/stores/worldScopeProjection.js';
import {
  ESSENCE_VALIDATION_CHECKS,
  essenceEditorValidation,
} from '../src/utils/essenceValidation.js';
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

/**
 * A world essence corpus, from records this file states outright.
 *
 * @param {object} [options]
 * @returns {{entities: object[], defaults: object[], membership: object[]}}
 */
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

/**
 * The attribute names one call site passes, read off the root's own markup.
 *
 * The scan is TERMINATED on the closing `/>` at the opening tag's own indentation, never on the
 * first `>`: every one of these sites carries an inline arrow function whose `=>` would end the
 * scan a dozen attributes early.
 *
 * @param {string} componentName
 * @returns {string[]}
 */
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

// ── (1b) THE REQUIREMENT-7 CORRECTION, EVIDENCED ON THE REOPENING CHANGE'S OWN DIFF ───────────
//
// `### GM World Scoped Entity Routes` requirement 7 closes `CraftingSystemManagerRoot.svelte` to
// this epic's later lanes, and its own amendment says the closure "is void for a seam the
// enumeration does not name": reopening the file to supply a NAMED missing seam is a correction,
// reopening it to build a screen is a violation, and "the distinction is not decidable from a
// diff's file names, so a correction claim is EVIDENCED on the reopening change's own diff — by
// an unchanged-render or import-surface assertion".
//
// The seam the enumeration missed is the inspector's deep link to the world definition
// (`proto:1676`-`1678`): `EssenceBrowserInspector` is rendered by the shell with explicit props
// and no bundle spread, so — unlike every scoped page — a prop declared on it would take its
// default forever and no lane outside this file could reach it.
//
// THERE ARE NOW TWO SEAMS, and each carries its own bounded evidence.
//
// SEAM 1 is the inspector's deep link. Its evidence is the pair below: the render change is one
// attribute on one child that was already rendered here, and the callback delegates to a shell
// function this file already owns and already calls at three other sites.
//
// SEAM 2 (issue 1372) is the page header's `+ New essence` action. The prototype puts one button
// in the header band, right-aligned on the title line (`essences.png`), where the screen shipped a
// full-width name-field band above the list — and the header band is rendered HERE, by the
// `.manager-header-actions` chain, so no page can reach it.
//
// SEAM 2 GROWS THE IMPORT SURFACE BY EXACTLY ONE SPECIFIER, and that is why the assertion below
// is a bound rather than an equality with the shipped nine. `mintEssenceId` slugs a new record's
// id and resolves a collision by suffix; the alternative to importing it was a second copy of that
// logic in the gateway, which is the failure the one-implementation rule exists to prevent. The
// bound is what keeps the reopening honest: the leaf is `scoped/essenceScoped.js`, which imports
// nothing itself, the import is NAMED rather than a namespace, and the handler composes two things
// this file already owns.
//
// SEAM 3 (issue 1372, maintainer parity round 4) is the entry editor's EXPLICIT SAVE. The screen
// buffers its edit now, and the two things that act on a buffered edit are renderable only here:
// the header's `← Back` / `Save essence` pair, because `.manager-header` is a sibling of
// `.manager-main` and no page can render into it, and the unsaved-changes prompt, because leaving
// by the rail or the breadcrumb never reaches the page at all.
//
// ITS BOUND IS THE SAME SHAPE AS SEAM 2's. The render is ONE shared component in the header-actions
// chain rather than a hand-rolled pair, so the world tool entry takes it verbatim; the flush and
// the guard delegate to `scoped/scopedEntryDraft.js`, which imports nothing itself; and the prompt
// is the SHIPPED three-way essence one rather than a new dialog — a second prompt saying the same
// thing in different words is how two screens end up disagreeing about one verb.

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
        '../../../../utils/essenceBrowserModel.js',
        '../../../../utils/essenceBulkEditModel.js',
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
    // leaf would be reachable from the gateway with no diff here at all. The named form makes the
    // next thing the gateway wants from that module a visible edit to this file and to this test.
    //
    // `essenceShortValueName` joined `mintEssenceId` at the round-8 parity pass: the editor rail's
    // macro card is titled after its VALUE now, and a macro stored as a uuid whose document has
    // not resolved has to fall back to its terminal segment — the same trim the list row's summary
    // line prints — or the card reads `No macro` for a macro that is configured.
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
    // The RENDER bound, pinned to a literal. It is still ONE existing child with no new element,
    // no new branch and no new screen — what moved is the prop set, and the pin is what makes a
    // silent addition to a gateway call site visible.
    //
    // `onDuplicate` is GONE (issue 1372, maintainer parity round 8): duplicating wrote a second
    // `system.essenceDefinitions` entry with its own name, icon and colour — a system-owned
    // essence — from the same rail whose banner says identity is the Essence Catalogue's.
    //
    // The six that arrived are the two layers the reference states on this rail and could not:
    // `systemName` and `inherited` are what turn the `ON CRAFT` list into `ON CRAFT IN <system>`
    // with a provenance per card, and `systemRows` / `memberCount` / `rosterSize` /
    // `membershipActions` / `onOpenSystemRules` are the `SYSTEM RULES n / m` panel's, which is
    // the catalogue's own `SystemRulesRoster` composed here rather than a second copy.
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
    // The RENDER bound: ONE ELEMENT PER WORLD ENTRY ROUTE, each in its own branch, and never a
    // pair of buttons a screen spells out for itself. A hand-rolled copy is exactly the recipe
    // drift `design-system/spec.md` orders "back before save" to prevent.
    //
    // The count is TWO because the world tool entry took this component next (issue 1373),
    // which is what this seam was extracted for. It is asserted rather than left unbounded so
    // that a THIRD site - the world component entry, when that lane lands - has to come here
    // and say so, and so that a second pair inside one branch still reds.
    assert.equal(
      [...rootSource.matchAll(/<ScopedEntryHeaderActions\b/g)].length,
      2,
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
    // THE HALF A MOUNT CANNOT REACH. `setView` is the shell's, and the rail, the breadcrumb and
    // the header's own Back all pass through it — so an editor whose guard is wired only to its
    // own Back button loses an unsaved edit on the other two ways out, silently, and every
    // mounted assertion about the page stays green.
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
    // HANGS a suite rather than failing it. A stated list is a MIRROR, and a mirror rots silently:
    // a field added to the world identity set and not to this one is simply never editable, on the
    // one screen that exists to edit it, with every other test green.
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

// ── (1c) THE ENTRY EDITOR'S LIVE-PREVIEW FOOTER ───────────────────────────────────────────────
//
// `EssenceBehaviorPreview` renders the footer strip, and it is no longer optional. The reference
// draws it at the foot of the entry editor's preview panel (`proto:3537`) as it does on all six
// of its editors (`proto:6138`, `6155`, `6209`).
//
// THE SUPPRESSION PROP IS GONE WITH ITS ONE CALLER (issue 1372, maintainer parity round 8). The
// browser inspector was the site that passed `showLiveNote={false}`, and it no longer renders
// this component at all — it draws the reference's `ON CRAFT IN <system>` cards, which answer a
// different question. Both remaining callers are editors whose preview recomputes on every
// keystroke, so both say so and neither has a choice to make.
//
// A source assertion rather than a mount, and the pairing is what makes it non-vacuous: a check
// that the entry page merely lacks the prop would pass just as well if the note had been deleted
// from the primitive, so the primitive's own unconditional render is asserted in the same breath.

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
 * MAPS, NOT ARRAYS, and that is the store's contract rather than a convenience: `persistedShape`
 * reads `defaults` and `membership` as objects keyed by entity id and by `membershipKey`, and an
 * array fixture normalises to EMPTY there — every write would then report success against a
 * corpus that had silently lost its records, and every "nothing else was touched" assertion
 * would pass over two empty maps.
 *
 * @param {{defaults?: object[], membership?: object[]}} corpus in the PROJECTION's array shape,
 *   which this converts, so one fixture literal drives both halves of the file.
 * @returns {{actions: object, read: () => object}}
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
    // NON-VACUITY IN BOTH DIRECTIONS. Without the world roster the first candidate is refused
    // too, which proves the roster is what admits it rather than the shape test admitting
    // everything; and every candidate is admitted once each is world-addressable, which proves
    // the filter is not simply dropping the third by position.
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
    // THE TRAP THIS CATCHES: `essenceValidationPresentation` FILTERS before it maps, precisely so
    // a check the evaluator did not return is dropped rather than rendered from a half-object. A
    // check registered in `ESSENCE_VALIDATION_CHECKS` but omitted from `CHECK_PRESENTATION` — or
    // returned by the evaluator but never grouped — therefore disappears in SILENCE. Only a
    // presence assertion catches it, and asserting "nothing threw" catches none of it.
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
    // must go on reporting exactly the seven checks it always did. Without this the eight new
    // rows would land on a screen that cannot answer any of them.
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
