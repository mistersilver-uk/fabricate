/**
 * The full-width decision, asserted as ONE thing in two files (issue 1362, epic 1357). IT MUST FAIL
 * LOUD
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// The parsers, the anchor and the aside assertion are SHARED with the two recipe-edit suites
// through this helper (issue 1362 review S4).
import {
  assertAsideBuiltFromSet,
  assertPredicatesMatchTheirIds,
  declaration,
  isManagerBodySubject,
  namesManagerBody,
  parseFullWidthViews,
  routeIdOf,
  splitTopLevel,
  topLevelRules,
  trackCount,
} from './helpers/fullWidthRoute.js';

const ROOT = resolve(import.meta.dirname, '..');
const CSS_PATH = 'styles/fabricate.css';
const ROOT_COMPONENT_PATH = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';

const css = readFileSync(resolve(ROOT, CSS_PATH), 'utf8');
const rootSource = readFileSync(resolve(ROOT, ROOT_COMPONENT_PATH), 'utf8');

/** The routes that suppress the aside AND keep three tracks. */
const SELF_OWNED_THREE_TRACK = new Set(['tool-edit', 'knowledge']);

/** The three baseline members every parsed set must contain before the equality runs. */
const BASELINE_MEMBERS = Object.freeze([
  '.fabricate-manager[data-manager-view^="checks"] .manager-body::full-width-2-track',
  '.fabricate-manager[data-manager-view="world"][data-world-travel-tab="parties"] .manager-body::full-width-2-track',
  '.fabricate-manager[data-manager-view="tool-edit"] .manager-body::self-owned-3-track',
]);

/** The base rule every route shares, which proves the parser saw the unscoped declaration. */
const SHARED_BASELINE = '.fabricate-manager .manager-body::shared-3-track';

/**
 * The stylesheet's own classification of every top-level `.manager-body` grid rule.
 *
 * @returns {Map<string, {layoutClass: string, plain: boolean, collapsed: boolean}>} Keyed by
 *   the BASE selector — the collapsed sibling folded onto it.
 */
function classifyStylesheet() {
  const bases = new Map();
  for (const rule of topLevelRules(css)) {
    if (!namesManagerBody(rule.prelude)) continue;
    const columns = declaration(rule.declarations, 'grid-template-columns');
    if (!columns) continue;
    const tracks = trackCount(columns);
    for (const selector of splitTopLevel(rule.prelude, ',')) {
      if (!isManagerBodySubject(selector)) continue;
      const collapsed = selector.includes('.is-rail-collapsed');
      const base = selector
        .replaceAll('.is-rail-collapsed', '')
        .replaceAll(/\s+/g, ' ');
      const routeId = routeIdOf(base);
      let layoutClass = 'shared-3-track';
      if (tracks === 2) layoutClass = 'full-width-2-track';
      else if (SELF_OWNED_THREE_TRACK.has(routeId)) layoutClass = 'self-owned-3-track';
      const record = bases.get(base) ?? { layoutClass, plain: false, collapsed: false };
      record.layoutClass = layoutClass;
      if (collapsed) record.collapsed = true;
      else record.plain = true;
      bases.set(base, record);
    }
  }
  return bases;
}

const STYLESHEET_BASES = classifyStylesheet();
// Parsed through the helper, so this suite and the two recipe-edit suites resolve the set
// from ONE anchor. It carries each entry's `predicate` source text as well.
const REGISTRY = parseFullWidthViews(rootSource);

const stylesheetSet = new Set(
  [...STYLESHEET_BASES]
    .filter(([, record]) => record.layoutClass !== 'shared-3-track')
    .map(([base, record]) => `${base}::${record.layoutClass}`)
);
const registrySet = new Set(REGISTRY.map((entry) => `${entry.selector}::${entry.layoutClass}`));

test('both parsed sets are non-empty and carry the three named baseline members', () => {
  // THE CHEAPEST GREEN AVAILABLE TO A BROKEN PARSE IS TWO EMPTY SETS COMPARING EQUAL, so
  // this runs BEFORE the equality and is what a broken selector prefix reds on.
  assert.ok(
    stylesheetSet.size >= 15,
    `the stylesheet parse found ${stylesheetSet.size} aside-suppressing rules; the parser is ` +
      'probably matching nothing'
  );
  assert.ok(
    registrySet.size >= 15,
    `the registry parse found ${registrySet.size} entries; the FULL_WIDTH_VIEWS scan is probably ` +
      'matching nothing'
  );
  for (const member of BASELINE_MEMBERS) {
    assert.ok(stylesheetSet.has(member), `the stylesheet parse lost the baseline member ${member}`);
    assert.ok(registrySet.has(member), `the registry parse lost the baseline member ${member}`);
  }
  // And the THIRD class is present too, which is what proves the parser read the unscoped base
  // rule rather than only the route-scoped ones.
  const shared = [...STYLESHEET_BASES]
    .filter(([, record]) => record.layoutClass === 'shared-3-track')
    .map(([base, record]) => `${base}::${record.layoutClass}`);
  assert.ok(shared.includes(SHARED_BASELINE), `the parse lost the shared base rule`);
  assert.ok(
    shared.some((entry) => entry.includes('[data-manager-view="tools"]')),
    'the Tool Studio library is a route-scoped shared-3-track: it re-widths the third column ' +
      'and KEEPS its inspector, so it must be classified shared rather than self-owned'
  );
});

test('the aside-suppressing routes and the released columns are the same set', () => {
  assert.deepEqual(
    [...stylesheetSet].sort(),
    [...registrySet].sort(),
    'a route released in `styles/fabricate.css` but not declared in `FULL_WIDTH_VIEWS` wraps an ' +
      'empty aside to a new grid row; one declared but not released renders against a ~300px ' +
      'dead strip. Fix both halves together.'
  );
});

test('every released route declares its collapsed sibling at equal specificity', () => {
  const missing = [];
  for (const [base, record] of STYLESHEET_BASES) {
    if (!record.plain) missing.push(`${base} declares only its .is-rail-collapsed form`);
    if (!record.collapsed) missing.push(`${base} declares no .is-rail-collapsed sibling`);
  }
  assert.ok(STYLESHEET_BASES.size >= 8, 'the base scan found almost nothing');
  assert.deepEqual(
    missing,
    [],
    '`.manager-body.is-rail-collapsed` out-specifies a single-class rule, so a released column ' +
      'with no collapsed sibling silently snaps back to three tracks the moment the GM ' +
      'collapses the rail:\n  ' + missing.join('\n  ')
  );
});

test('the aside chain is BUILT from the set rather than restating it', () => {
  // The twelve-clause chain this replaced is how the two halves drifted twice. A restated
  // condition would satisfy every assertion above and still render the wrong strip.
  assertAsideBuiltFromSet(rootSource);
  // Needles from the RETIRED chain specifically, not fragments that also occur in the
  // header-actions chain a few hundred lines above: a needle that matched both would have
  // failed on a correct conversion, which is how a guard gets loosened until it proves nothing.
  for (const dead of [
    "currentView !== 'component-edit' && currentView !== 'recipe-edit'",
    "currentView !== 'tool-edit' && currentView !== 'knowledge'",
    '!isWorldPartiesRoute && !isWorldDowntimeRoute',
  ]) {
    assert.equal(
      rootSource.includes(dead),
      false,
      `the old aside chain clause ${JSON.stringify(dead)} is still restated in the root`
    );
  }
});

test('every entry\'s PREDICATE answers for its own id', () => {
  // THE FIELD THAT SHIPS THE DEFECT, and the one this gate could not see (issue 1362 review M1).
  assertPredicatesMatchTheirIds(rootSource);
});

test('the gathering task editor releases its inspector track only for result-group modes', () => {
  const entry = REGISTRY.find(candidate => candidate.id === 'gathering-task-edit');
  assert.ok(entry, 'gathering-task-edit should have a mode-dependent full-width entry');
  assert.equal(entry.predicate, 'isGatheringTaskFullWidth');
  assert.match(
    rootSource,
    /function isGatheringTaskFullWidth\(view, context\) \{\s*return view === 'gathering-task-edit' && context\.resultGroupTaskMode === true;/,
    'the gathering-task predicate should require the editor route and result-group mode'
  );
  assert.match(
    rootSource,
    /resultGroupTaskMode:\s*isGatheringResultGroupMode\(gathering\.gatheringTaskResolutionMode\)/,
    'the full-width derivation should receive the selected task mode'
  );
  assert.match(
    rootSource,
    /data-gathering-task-layout=\{fullWidthLayout\?\.id === 'gathering-task-edit'\s*\? 'results'/,
    'the stylesheet selector should be driven by the same fullWidthLayout decision'
  );
});

test('every registry entry names a route the router can actually reach', () => {
  // A registry entry whose selector names a `data-manager-view` value no route ever sets is a
  // rule that can never match — green here, invisible in the browser.
  const ids = REGISTRY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'FULL_WIDTH_VIEWS carries a duplicate id');
  for (const entry of REGISTRY) {
    assert.equal(
      routeIdOf(entry.selector) === '' ? entry.id : routeIdOf(entry.selector),
      entry.id === 'world-parties' ? 'world' : entry.id,
      `${entry.id}: the entry's selector scopes to a different route than its id names`
    );
  }
});
