/**
 * Source contract: the world-scope DATA seam the shell hands its scoped screens (issue 1374).
 *
 * ── WHY THIS FILE EXISTS AT ALL, STATED PLAINLY ─────────────────────────────────────────
 *
 * Twelve of the thirteen call sites this change touches produce NO OBSERVABLE BEHAVIOUR. The
 * seven world pages are placeholders that declare no props, and the six system-scope views
 * declare none of the four names in the bundle, so a spread that reaches them is inert. There
 * is no DOM to assert and no mounted test that can red on any of it.
 *
 * That is not a reason to ship the wiring untested; it is a reason to say WHAT carries the
 * falsifiability instead of dressing a source scan as a behavioural gate. This file is that
 * carrier, and its four clauses are the whole of it.
 *
 * ── THE COUNT IS TWELVE ACROSS THIRTEEN, AND THAT ASYMMETRY IS THE POINT ────────────────
 *
 * `WorldVocabularyPage` is the thirteenth site and takes NO bundle: the World Vocabulary is
 * not a scoped entity — `### GM World Vocabulary Route` says so in its own requirement — and
 * naming its state `scope` would be the first place in this UI to lose that boundary. A
 * criterion demanding thirteen spreads would therefore red on correct code.
 *
 * ── AND THE ABSENCE HALF OF CLAUSE (b) IS LOAD-BEARING ──────────────────────────────────
 *
 * Asserting only that the RIGHT bundle is spread at each site is satisfied by a mutation that
 * ADDS a wrong bundle rather than replacing one. Svelte spreads are LAST-WINS over identical
 * keys, and all three bundles carry the same four, so `{...toolScopeProps}` written after
 * `{...essenceScopeProps}` on an essence page does not merge the two families — it REPLACES
 * the essence family outright, and the screen silently edits tools. A presence-only check sees
 * its own bundle still spread and passes. So each site asserts the other two are ABSENT.
 *
 * ── CLAUSE (d) IS A DESIGN CONSTRAINT, NOT A HANG DETECTOR ──────────────────────────────
 *
 * `tests/components/manager-mounted.test.js` copies plain `.js` dependencies verbatim from a
 * hand-written array with no validator, and its `.svelte` closure walk follows `.svelte`
 * specifiers only. A missing raw module there is LOUD rather than silent — the suite dies in
 * its `before` hook with `ERR_MODULE_NOT_FOUND` naming the module — so this clause is not
 * there to convert a hang into a failure. It is there because "the root gains no import" is
 * the design constraint that keeps this change a wiring change: the seam is three `$derived`
 * bundles over state the shell already holds, and the moment it needs a new module it has
 * become something else.
 *
 * The set is PINNED as a literal rather than read back from `origin/main` with `git show`,
 * because a test that shells to a remote-tracking ref is a test that fails in a shallow CI
 * checkout for a reason that has nothing to do with the property. The literal below was
 * generated from `origin/main` at `7304be93` and verified identical to the post-change root.
 *
 * ── NON-VACUITY RUNS FIRST ──────────────────────────────────────────────────────────────
 *
 * Every clause here is a parse over hand-written markup, and the cheapest green available to
 * a broken parser is an empty set comparing equal to an empty set. So the counts are asserted
 * BEFORE the equalities: thirteen call sites found, twelve of them spreading a bundle, three
 * bundle declarations of four keys each. Break the parse and this file reds on the counts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/**
 * Every call site the seam reaches, and the bundle each one takes.
 *
 * `null` means "takes no bundle", which is a positive claim about `WorldVocabularyPage` rather
 * than an omission: clause (c) asserts what it takes instead.
 */
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

/**
 * The root's `<script>` module specifiers, pinned from `origin/main` at `7304be93`.
 *
 * Sorted, deduplicated, and asserted as a SET rather than a count: a count is passed by a
 * swap, and a swap is a new dependency wearing an old one's budget.
 */
const ROOT_IMPORT_SPECIFIERS = Object.freeze([
  '../../../../config/currencyProviders.js',
  '../../../../gatheringImageDefaults.js',
  '../../../../systems/characterModifierPrerequisiteCopy.js',
  '../../../../systems/checkModifierResolver.js',
  '../../../../systems/gatheringComposition.js',
  '../../../../systems/progressiveCheckSandbox.js',
  '../../../../utils/categoryIcons.js',
  '../../../../utils/componentBrowserModel.js',
  '../../../../utils/componentBulkEditModel.js',
  '../../../../utils/componentCategories.js',
  '../../../../utils/craftingCheckExpression.js',
  '../../../../utils/essenceBrowserModel.js',
  '../../../../utils/essenceBulkEditModel.js',
  '../../../../utils/failureResultPolicy.js',
  '../../../../utils/recipeBrowserModel.js',
  '../../../../utils/recipeBulkEditModel.js',
  '../../../../utils/recipeCategories.js',
  '../../../../utils/routedOutcomeKeywords.js',
  '../../../../utils/vocabularyUsage.js',
  '../../../managerExtensions.js',
  '../../../navTabBadgeStore.js',
  '../../components/ChanceSlider.svelte',
  '../../components/ManagerButton.svelte',
  '../../components/Medallion.svelte',
  '../../util/announceAfterFocus.js',
  '../../util/componentEditor.js',
  '../../util/craftingImageDefaults.js',
  '../../util/dropUtils.js',
  '../../util/foundryBridge.js',
  './AccessTabView.svelte',
  './BooksScrollsView.svelte',
  './Chip.svelte',
  './ComponentEditView.svelte',
  './ComponentsBrowserView.svelte',
  './CraftingSettingsView.svelte',
  './EmptyState.svelte',
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
  './scoped/WorldComponentCataloguePage.svelte',
  './scoped/WorldComponentEntryPage.svelte',
  './scoped/WorldEssenceCataloguePage.svelte',
  './scoped/WorldEssenceEntryPage.svelte',
  './scoped/WorldToolCataloguePage.svelte',
  './scoped/WorldToolEntryPage.svelte',
  './scoped/WorldVocabularyPage.svelte',
  './scoped/scopedEntryRoutes.js',
  './tools/ToolBrowserInspector.svelte',
  './world/WorldCurrencyTab.svelte',
  './world/WorldModifiersTab.svelte',
  './world/WorldPrerequisitesTab.svelte',
  'svelte',
]);

/**
 * The lines of one element's attribute block, from its opening tag to its closing `/>`.
 *
 * Terminated on a line that is EXACTLY the opening tag's indentation plus `/>`, never on the
 * first `>` character: several of these call sites carry inline arrow functions whose `=>`
 * would end the scan a dozen attributes early.
 *
 * @param {string} componentName
 * @returns {string[]}
 */
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
 *
 * @param {string} componentName
 * @returns {{names: string[], spreads: string[]}}
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

/**
 * The TOP-LEVEL keys of one `const <name> = $derived({ ... });` declaration.
 *
 * Depth-tracked rather than line-matched, so a nested object or a fallback literal inside a
 * value cannot contribute a key.
 *
 * @param {string} declarationName
 * @returns {string[]}
 */
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
  // The World Vocabulary is NOT a scoped entity, so it takes its published state under its own
  // name rather than as a `scope`. Its `actions` leg is wired ahead of the family that fills
  // it, for the same one-way-door reason the read leg was: the shell is closed to the lane
  // that draws this screen.
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

test('every case that RENDERS the shared placeholder body also CLAIMS it, and only those', () => {
  // Criterion 4, as a biconditional rather than as two named cases.
  //
  // NEITHER VIEW-LAB COVERAGE TEST CAN SEE THIS. `ScopedPlaceholderPage` is inside the lab
  // closure through seven routes and is claimed by SOME case whatever happens, so a claim on a
  // route whose body a later lane has replaced goes stale in SILENCE — and then publishes that
  // route's real screen as evidence of a placeholder-body change. That is the failure this
  // assertion exists for, and it is why it needs a home at all.
  //
  // AND WHY IT IS NOT "the claim lives on the longest-lived route". Nominating one case only
  // holds if the four lanes land in a predicted order, and nothing enforces one: PR 7 can ship
  // before 6c. Requiring the claim to track RENDERING removes the ordering assumption — a lane
  // that replaces a body deletes that route's claim in the same change, and this reds if it
  // forgets, in either direction.
  const PLACEHOLDER = 'src/ui/svelte/apps/manager/scoped/ScopedPlaceholderPage.svelte';
  const rendersPlaceholder = (viewCase) =>
    typeof viewCase.expectSelector === 'string' &&
    viewCase.expectSelector.includes('data-scoped-page');
  const claimsPlaceholder = (viewCase) =>
    (viewCase.sourceMatches || []).some((pattern) => pattern.test(PLACEHOLDER));

  const rendering = VIEW_LAB_CASES.filter(rendersPlaceholder).map((entry) => entry.id);
  const claiming = VIEW_LAB_CASES.filter(claimsPlaceholder).map((entry) => entry.id);
  assert.ok(
    rendering.length >= 4,
    `only ${rendering.length} cases render the shared placeholder; the scan is broken`
  );
  assert.deepEqual(
    claiming.slice().sort(),
    rendering.slice().sort(),
    'the set of cases claiming the shared placeholder body is exactly the set that renders it'
  );
});

test('the world-scope write path is supplied FOUR store legs', () => {
  // Criterion 5's source half. The vocabulary leg mints no family today — `WRITE_DESCRIPTORS`
  // declares no `vocabulary` — so it has no behavioural mutation until the vocabulary lane
  // declares one. Its falsifiability is here: delete the leg and this reds, and the lane that
  // needs it would otherwise have to reopen a file requirement 7 closes to it.
  const adminStore = readFileSync(resolve(repoRoot, ADMIN_STORE_PATH), 'utf8');
  const call =
    /const worldScope = createWorldScopeActions\(\{\s*getStores: \{([\s\S]*?)\},\s*\}\);/.exec(
      adminStore
    );
  assert.ok(call, 'createWorldScopeActions is called with an inline getStores map');
  const legs = [...call[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_$]*):/gm)].map((match) => match[1]);
  assert.deepEqual(
    legs.slice().sort(),
    ['component', 'essence', 'tool', 'vocabulary'],
    'the write path reads the same four store legs the read path does'
  );
});
