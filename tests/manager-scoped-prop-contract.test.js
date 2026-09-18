/** Source contract: the world-scope DATA seam the shell hands its scoped screens (issue 1374). */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_PATH = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const ADMIN_STORE_PATH = 'src/ui/svelte/stores/adminStore.js';

const rootLines = readFileSync(resolve(repoRoot, ROOT_PATH), 'utf8').split('\n');

/** The four names every bundle carries, and the whole of what a scoped screen is handed. */
const BUNDLE_KEYS = Object.freeze(['actions', 'scope', 'systemId', 'systems']);

/** The three bundle declarations, by the entity type each serves. */
const BUNDLES = Object.freeze({
  component: 'componentScopeProps',
  essence: 'essenceScopeProps',
  tool: 'toolScopeProps',
});

/** Every call site the seam reaches, and the bundle each one takes. */
const CALL_SITES = Object.freeze([
  Object.freeze({ component: 'WorldComponentCataloguePage', bundle: 'component' }),
  Object.freeze({ component: 'WorldComponentEntryPage', bundle: 'component' }),
  Object.freeze({ component: 'WorldEssenceCataloguePage', bundle: 'essence' }),
  Object.freeze({ component: 'WorldEssenceEntryPage', bundle: 'essence' }),
  Object.freeze({ component: 'WorldToolCataloguePage', bundle: 'tool' }),
  Object.freeze({ component: 'WorldToolEntryPage', bundle: 'tool' }),
  Object.freeze({ component: 'WorldVocabularyPage', bundle: null }),
  Object.freeze({ component: 'ToolsBrowserView', bundle: 'tool' }),
  Object.freeze({ component: 'ToolEditView', bundle: 'tool' }),
  Object.freeze({ component: 'EssenceBrowserView', bundle: 'essence' }),
  Object.freeze({ component: 'EssenceEditView', bundle: 'essence' }),
  Object.freeze({ component: 'ComponentEditView', bundle: 'component' }),
  Object.freeze({ component: 'ComponentsBrowserView', bundle: 'component' }),
]);

/** The props `WorldVocabularyPage` takes, exactly — no bundle, and its state under its own name. */
const VOCABULARY_PROPS = Object.freeze(['actions', 'systems', 'vocabulary']);

/** The root's `<script>` module specifiers, pinned from `origin/main` at `7304be93`. */
const ROOT_IMPORT_SPECIFIERS = Object.freeze([
  '../../../../config/currencyProviders.js',
  // ADDED BY ISSUE 1373, and deliberately: the world Tool entry's `Preview as` region resolves its
  // Tool's world-default prerequisites against ONE actor, and the roster it offers is the shared,
  // GM-configurable player-character predicate rather than a second `type === 'character'` test.
  '../../../../gatheringImageDefaults.js',
  '../../../../systems/characterModifierPrerequisiteCopy.js',
  '../../../../systems/checkModifierResolver.js',
  '../../../../systems/gatheringComposition.js',
  '../../../../systems/progressiveCheckSandbox.js',
  '../../../../utils/categoryIcons.js',
  '../../../../utils/componentCategories.js',
  '../../../../utils/craftingCheckExpression.js',
  '../../../../utils/failureResultPolicy.js',
  '../../../../utils/recipeCategories.js',
  '../../../../utils/routedOutcomeKeywords.js',
  // ADDED BY ISSUE 1373, and legitimately under the message below.
  '../../../../utils/sourceReferenceUnion.js',
  '../../../managerExtensions.js',
  '../../../model/componentBrowserModel.js',
  '../../../model/componentBulkEditModel.js',
  '../../../model/essenceBrowserModel.js',
  '../../../model/essenceBulkEditModel.js',
  // Issue 1438 lifted the remaining browse surfaces' filter/search state onto one root-owned
  // record, which the root mints from this factory.
  '../../../model/managerBrowserViewState.js',
  '../../../model/recipeBrowserModel.js',
  '../../../model/recipeBulkEditModel.js',
  '../../../model/vocabularyUsage.js',
  '../../../navTabBadgeStore.js',
  // THE SHIPPED TWO-STEP DESTRUCTIVE CONTROL, for the world Tool entry's HEADER `Delete` (issue
  // 1373's parity round).
  '../../components/ArmedDangerButton.svelte',
  '../../components/ChanceSlider.svelte',
  // MOVED BY ISSUE 1506, not added.
  '../../components/Chip.svelte',
  // Moved by issue 1710, not added.
  '../../components/EmptyState.svelte',
  // ADDED BY ISSUE 1515 (decision D12), under the message below and not as drift.
  '../../components/Kicker.svelte',
  '../../components/ManagerButton.svelte',
  '../../components/Medallion.svelte',
  '../../util/announceAfterFocus.js',
  '../../util/componentEditor.js',
  '../../util/craftingImageDefaults.js',
  '../../util/dropUtils.js',
  '../../util/foundryBridge.js',
  './AccessTabView.svelte',
  './BooksScrollsView.svelte',
  './ComponentEditView.svelte',
  './ComponentsBrowserView.svelte',
  './CraftingSettingsView.svelte',
  './EnvironmentEditView.svelte',
  './EnvironmentsBrowserView.svelte',
  './EssenceBrowserView.svelte',
  './EssenceEditView.svelte',
  './ExplainerCard.svelte',
  './GatheringEventEditView.svelte',
  './GatheringMapLinksTab.svelte',
  './GatheringRealmsTab.svelte',
  './GatheringTaskEditView.svelte',
  './GrantAccessInspector.svelte',
  './ImportFolderMappingModal.svelte',
  './ImportReportModal.svelte',
  './ItemPageInspector.svelte',
  './KnowledgeView.svelte',
  './RealmNameField.svelte',
  './RecipeEditView.svelte',
  './RecipeItemEditor.svelte',
  './RecipesBrowserView.svelte',
  './SystemEditView.svelte',
  './SystemsBrowserView.svelte',
  './TagsCategoriesView.svelte',
  './ToolEditView.svelte',
  './ToolsBrowserView.svelte',
  './checks/ChecksView.svelte',
  './checks/checkTriggerSummary.js',
  './checks/checksCopy.js',
  './checks/checksNav.js',
  './checks/checksReadiness.js',
  './component/ComponentEditorHeader.svelte',
  './components/ComponentBrowserInspector.svelte',
  './components/ComponentBulkEditPanel.svelte',
  './crafting/craftingNav.js',
  './crafting/craftingVisibility.js',
  './downtime/WorldDowntimeExtensionHost.svelte',
  './downtime/routeChromeChannel.js',
  './downtime/worldDowntimePreviewProvider.js',
  './environment/CharacterModifierBoundsRow.svelte',
  './environment/GatheringRuleLimitStepper.svelte',
  './essences/EssenceBehaviorPreview.svelte',
  './essences/EssenceBrowserInspector.svelte',
  './essences/EssenceBulkEditPanel.svelte',
  './recipes/RecipeBrowserInspector.svelte',
  './recipes/RecipeBulkEditPanel.svelte',
  // ADDED BY ISSUE 1371's D6 HEADER SUBTITLE.
  './resolutionModeOptions.js',
  // ADDED BY ISSUE 1372's HEADER-SAVE SEAM (maintainer parity round 4); sorted here rather than
  // beside its sibling below because this list is asserted SORTED.
  './scoped/ComponentAddFromCatalogueDialog.svelte',
  './scoped/ScopedEntryHeaderActions.svelte',
  './scoped/WorldComponentCataloguePage.svelte',
  './scoped/WorldComponentEntryPage.svelte',
  './scoped/WorldEssenceCataloguePage.svelte',
  './scoped/WorldEssenceEntryPage.svelte',
  './scoped/WorldToolCataloguePage.svelte',
  './scoped/WorldToolEntryPage.svelte',
  './scoped/WorldVocabularyPage.svelte',
  // ADDED BY ISSUE 1371's C1/D1 HEADER SUBTITLES.
  './scoped/componentScoped.js',
  // ADDED BY ISSUE 1372's HEADER-CREATE SEAM.
  './scoped/essenceScoped.js',
  // ADDED BY ISSUE 1372's HEADER-SAVE SEAM (maintainer parity round 4).
  './scoped/scopedEntryDraft.js',
  './scoped/scopedEntryRoutes.js',
  './tools/ToolBrowserInspector.svelte',
  './world/WorldCurrencyTab.svelte',
  './world/WorldModifiersTab.svelte',
  './world/WorldPrerequisitesTab.svelte',
  'svelte',
]);

/** The lines of one element's attribute block, from its opening tag to its closing `/>`. */
function attributeLines(componentName) {
  const openTag = `<${componentName}`;
  const openings = rootLines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.trim() === openTag);
  assert.equal(
    openings.length,
    1,
    `${componentName} opens at ${openings.length} sites; this parser resolves exactly one`
  );
  const { line, index } = openings[0];
  const indent = line.slice(0, line.length - line.trimStart().length);
  const end = rootLines.findIndex((candidate, at) => at > index && candidate === `${indent}/>`);
  assert.ok(end > index, `${componentName} never closes on its own indentation`);
  return rootLines.slice(index + 1, end);
}

/**
 * The prop names one call site declares: every `name={...}`, every `{name}` shorthand, every
 * `bind:name={...}` and every `{...bundle}` spread, the last under the bundle's identifier.
 */
function siteProps(componentName) {
  const names = [];
  const spreads = [];
  for (const line of attributeLines(componentName)) {
    const trimmed = line.trim();
    const spread = /^\{\.\.\.([A-Za-z0-9_$]+)\}$/.exec(trimmed);
    if (spread) {
      spreads.push(spread[1]);
      continue;
    }
    const bound = /^bind:([A-Za-z][A-Za-z0-9_$]*)=/.exec(trimmed);
    if (bound) {
      names.push(`bind:${bound[1]}`);
      continue;
    }
    const named = /^([A-Za-z][A-Za-z0-9_:-]*)=/.exec(trimmed);
    if (named) {
      names.push(named[1]);
      continue;
    }
    const shorthand = /^\{([A-Za-z][A-Za-z0-9_$]*)\}$/.exec(trimmed);
    if (shorthand) names.push(shorthand[1]);
  }
  return { names, spreads };
}

/** The TOP-LEVEL keys of one `const <name> = $derived({ ... });` declaration. */
function derivedObjectKeys(declarationName) {
  const start = rootLines.findIndex(
    (line) => line.trim() === `const ${declarationName} = $derived({`
  );
  assert.ok(start >= 0, `${declarationName} is not declared as a $derived object literal`);
  const keys = [];
  let depth = 1;
  for (let index = start + 1; index < rootLines.length; index += 1) {
    const trimmed = rootLines[index].trim();
    if (trimmed === '});') break;
    if (depth === 1) {
      const key = /^([A-Za-z][A-Za-z0-9_$]*):/.exec(trimmed);
      if (key) keys.push(key[1]);
    }
    depth += (trimmed.match(/[{[(]/g) || []).length - (trimmed.match(/[}\])]/g) || []).length;
  }
  return keys;
}

const bundleNames = () => Object.values(BUNDLES);

test('NON-VACUITY: thirteen call sites, twelve bundle spreads, three bundles of four keys', () => {
  // Asserted before every equality below, because the cheapest green available to a broken
  // parser is an empty set comparing equal to an empty set.
  assert.equal(CALL_SITES.length, 13, 'the seam reaches thirteen call sites');
  assert.equal(
    CALL_SITES.filter((site) => site.bundle !== null).length,
    12,
    'twelve of them take a bundle'
  );
  let foundSpreads = 0;
  for (const site of CALL_SITES) {
    const { names, spreads } = siteProps(site.component);
    assert.ok(
      names.length > 0 || spreads.length > 0,
      `${site.component} parsed an empty attribute block, which no call site here has`
    );
    foundSpreads += spreads.filter((name) => bundleNames().includes(name)).length;
  }
  assert.equal(foundSpreads, 12, 'exactly twelve bundle spreads are rendered in the shell');
  for (const declaration of bundleNames()) {
    assert.equal(derivedObjectKeys(declaration).length, 4, `${declaration} declares four keys`);
  }
});

test('(a) each bundle declares exactly scope, actions, systems and systemId', () => {
  // The key set IS the contract. A screen reads `scope` for the published corpus, `actions`
  // for its own entity type's write path, `systems` for the copy-from and add-to-system
  // pickers, and `systemId` for the system a membership row is authored against.
  for (const declaration of bundleNames()) {
    assert.deepEqual(
      derivedObjectKeys(declaration).slice().sort(),
      BUNDLE_KEYS.slice(),
      `${declaration} carries exactly the four bundle keys`
    );
  }
});

test('(b) each site spreads its own bundle AND NEITHER of the other two', () => {
  // The absence half is what a presence-only check cannot see: an ADDITIVE wrong-bundle
  // mutation leaves the right one in place and hands the screen a second entity type's action
  // family, whose key set is the thing the per-type split protects.
  for (const site of CALL_SITES.filter((candidate) => candidate.bundle !== null)) {
    const expected = BUNDLES[site.bundle];
    const { spreads } = siteProps(site.component);
    assert.deepEqual(
      spreads.filter((name) => bundleNames().includes(name)),
      [expected],
      `${site.component} takes ${expected} and no other bundle`
    );
    for (const other of bundleNames().filter((name) => name !== expected)) {
      assert.ok(
        !spreads.includes(other),
        `${site.component} must not be handed ${other}: a screen addresses only the entity type it edits`
      );
    }
  }
});

test('(c) WorldVocabularyPage takes vocabulary, actions and systems, and no bundle', () => {
  // The World Vocabulary is NOT a scoped entity, so it takes its published state under its own name
  // rather than as a `scope`.
  const { names, spreads } = siteProps('WorldVocabularyPage');
  assert.deepEqual(
    names.slice().sort(),
    VOCABULARY_PROPS.slice(),
    'the vocabulary page receives exactly its three props'
  );
  assert.deepEqual(spreads, [], 'and no bundle spread at all');
});

test('(d) the root gains no import: its script specifier set is unchanged', () => {
  const open = rootLines.findIndex((line) => line.trim() === '<script>');
  const close = rootLines.findIndex((line) => line.trim() === '</script>');
  assert.ok(open >= 0 && close > open, 'the root has a parseable script block');
  const script = rootLines.slice(open + 1, close).join('\n');
  const specifiers = [
    ...new Set([...script.matchAll(/\bfrom\s+'([^']+)'/g)].map((match) => match[1])),
  ];
  assert.ok(specifiers.length > 50, `only ${specifiers.length} specifiers parsed; the scan broke`);
  assert.deepEqual(
    specifiers.sort(),
    ROOT_IMPORT_SPECIFIERS.slice(),
    'this is a wiring change: the shell reads state it already holds and imports nothing new. ' +
      'If YOUR change legitimately adds one, this pin is not a verdict on it — add the ' +
      'specifier to ROOT_IMPORT_SPECIFIERS above and say so in your commit'
  );
});

test('every case whose PAGE renders the shared placeholder body also claims it, and only those', () => {
  // Criterion 4, as a biconditional over what the PAGE SOURCE actually renders. The first version
  // of this asked whether a case's `expectSelector` names `data-scoped-page`.
  const PLACEHOLDER = 'src/ui/svelte/apps/manager/scoped/ScopedPlaceholderPage.svelte';
  const SCOPED_DIR = 'src/ui/svelte/apps/manager/scoped';

  // Route token → the page that owns it.
  const pageByRoute = new Map();
  for (const file of readdirSync(resolve(repoRoot, SCOPED_DIR)).filter((n) => n.endsWith('.svelte'))) {
    const source = readFileSync(resolve(repoRoot, SCOPED_DIR, file), 'utf8');
    for (const [, token] of source.matchAll(/(?:pageId|data-scoped-page)="([a-z][a-z-]*)"/g)) {
      assert.ok(!pageByRoute.has(token), `route ${token} is owned by two pages; the map is ambiguous`);
      // `delegates` is derived from the SHAPE of the page — a page that hands its body to the
      // shared component passes `pageId="<token>"` to it — and never from the component's NAME.
      pageByRoute.set(token, { file, source, delegates: /pageId="/.test(source) });
    }
  }
  assert.equal(pageByRoute.size, 7, 'the seven world scoped routes each resolve to exactly one page');

  // THE IMPORT LITERAL IS PINNED TO THE SHAPE, SO A RENAME CANNOT SILENCE THIS. Two hand-maintained
  // spellings of one component name drive the biconditional below: the `PLACEHOLDER` path and the
  // `import ScopedPlaceholderPage` probe.
  assert.deepEqual(
    [...pageByRoute.entries()].filter(([, page]) => page.delegates).map(([token]) => token).sort(),
    [...pageByRoute.entries()]
      .filter(([, page]) => /import ScopedPlaceholderPage/.test(page.source))
      .map(([token]) => token)
      .sort(),
    'a page delegates its body if and only if it imports the shared one. If these disagree the ' +
      'import literal above has gone stale — most likely the component was renamed — and the ' +
      'biconditional below is comparing an empty set to an empty set'
  );

  const routeOf = (viewCase) => /data-scoped-page="([a-z][a-z-]*)"/.exec(viewCase.expectSelector || '')?.[1];
  const rendersPlaceholder = (viewCase) => {
    const route = routeOf(viewCase);
    if (!route) return false;
    const page = pageByRoute.get(route);
    assert.ok(page, `case ${viewCase.id} asserts route ${route}, which no page under ${SCOPED_DIR} owns`);
    return /import ScopedPlaceholderPage/.test(page.source);
  };
  const claimsPlaceholder = (viewCase) =>
    (viewCase.sourceMatches || []).some((pattern) => pattern.test(PLACEHOLDER));

  const rendering = VIEW_LAB_CASES.filter(rendersPlaceholder).map((entry) => entry.id);
  const claiming = VIEW_LAB_CASES.filter(claimsPlaceholder).map((entry) => entry.id);

  // NON-VACUITY IS ASSERTED ON THE SCAN, NOT ON THE ANSWER.
  const scopedCases = VIEW_LAB_CASES.filter((entry) => routeOf(entry));
  assert.ok(
    scopedCases.length >= 4,
    `only ${scopedCases.length} cases assert a world scoped route; the scan is broken`
  );
  assert.deepEqual(
    claiming.slice().sort(),
    rendering.slice().sort(),
    'the set of cases claiming the shared placeholder body is exactly the set whose PAGE still ' +
      'imports it. A body replaced without dropping its claim publishes that route\u2019s real ' +
      'screen as evidence of a placeholder change; a claim dropped while the body still ' +
      'delegates leaves the component unclaimed by that route'
  );
});

test('the world-scope write path is supplied FOUR store legs', () => {
  // Criterion 5's source half. The vocabulary leg mints no family today — `WRITE_DESCRIPTORS`
  // declares no `vocabulary` — so it has no behavioural mutation until the vocabulary lane declares
  // one.
  const adminStore = readFileSync(resolve(repoRoot, ADMIN_STORE_PATH), 'utf8');
  // THE BINDING IS `worldScopeFamilies`, NOT `worldScope` (issue 1372, maintainer parity round 8).
  const call =
    /const worldScopeFamilies = createWorldScopeActions\(\{\s*getStores: \{([\s\S]*?)\},\s*\}\);/.exec(
      adminStore
    );
  assert.ok(call, 'createWorldScopeActions is called with an inline getStores map');
  const legs = [...call[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_$]*):/gm)].map((match) => match[1]);
  assert.deepEqual(
    legs.slice().sort(),
    ['component', 'essence', 'tool', 'vocabulary'],
    'the write path reads the same four store legs the read path does'
  );
  // TWO verbs are overridden PER COMPOSED FAMILY: a spread of the generic families with an override
  // on each (issue 1372).
  assert.match(
    adminStore,
    /essence: \{\s*\.\.\.worldScopeFamilies\.essence,\s*addToSystem: joinEssenceToSystem,\s*removeFromSystem: partEssenceFromSystem,\s*\},/,
    'the published write path composes the two essence verbs that have an in-system half'
  );
  // THE ESSENCE FAMILY IS NO LONGER THE ONLY COMPOSED ONE (issue 1371). IT IS PINNED HERE BECAUSE
  // NOTHING ELSE CAN SEE IT.
  assert.match(
    adminStore,
    // `bulkEditRules` joined the two membership verbs in issue 1371 r16-cat (maintainer ruling M25):
    // the world bulk panel's essence axis writes per-system RULES — the same kind of verb, whose
    // second half lives in `CraftingSystemManager`.
    /component: \{\s*\.\.\.worldScopeFamilies\.component,\s*addToSystem: joinComponentToSystem,\s*removeFromSystem: partComponentFromSystem,\s*(?:\/\/[^\n]*\n\s*)*bulkEditRules: bulkEditComponentRules,\s*\},/,
    'the published write path composes the two component verbs that have an in-system half, plus the rules write'
  );
  // AND EVERY FAMILY IS WRAPPED so a write that lands re-publishes (issue 1372).
  assert.match(
    adminStore,
    /const worldScope = Object\.fromEntries\(\s*Object\.entries\(\{[\s\S]*?\}\)\.map\(\(\[entityType, family\]\) => \[entityType, _republishingFamily\(family\)\]\)\s*\);/,
    'every world-scope family is published through the republishing wrapper'
  );
});
