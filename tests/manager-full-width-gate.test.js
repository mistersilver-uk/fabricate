/**
 * The full-width decision, asserted as ONE thing in two files (issue 1362, epic 1357).
 *
 * Suppressing `<aside class="manager-inspector">` in `CraftingSystemManagerRoot.svelte` and
 * releasing the third grid column in `styles/fabricate.css` are one decision expressed twice.
 * Doing only the first leaves a ~300px empty box holding the strip open; doing only the second
 * wraps the (empty) aside to an implicit grid row underneath the editor. Both halves have
 * shipped alone before — `checks` (issue 1096) and `world-currency` (issue 1311) each rendered
 * against a dead strip for a release — so the pairing is checked mechanically here.
 *
 * ── WHY IT IS NOT A SET OF ROUTE TOKENS ─────────────────────────────────────────────────
 *
 * Three of the shipped exclusions are not route tokens: `checks` is a FAMILY matched by a
 * prefix selector, World > Parties is a route+SUBSTATE matched by a compound attribute
 * selector, and the world-rules clause spans three tokens. So the registry carries the
 * stylesheet SELECTOR, and this gate compares selector strings.
 *
 * ── AND WHY IT IS A THREE-STATE CLASSIFICATION ──────────────────────────────────────────
 *
 * There are THREE layout states in the sheet, not two. `tool-edit` and `knowledge` suppress
 * the aside AND keep three tracks, repurposing the third column for their own content. A gate
 * asserting "aside excluded equals column released" is therefore UNSATISFIABLE on `main`, and
 * every loosening of it is vacuous. Each rule is classified by RESOLVED TRACK COUNT into
 * `shared-3-track`, `full-width-2-track` or `self-owned-3-track`, with `tool-edit` and
 * `knowledge` NAMED as the members of the self-owned class rather than excluded from scope.
 *
 * ── IT MUST FAIL LOUD ───────────────────────────────────────────────────────────────────
 *
 * The house helper for reading a rule out of this stylesheet (`blockFor` in
 * `tests/components/manager-layout.test.js`) answers `''` on no match, so the cheapest green
 * available to a broken parse is two empty sets comparing equal. Both parsed sets are
 * therefore asserted NON-EMPTY and asserted to contain three NAMED baseline members — one per
 * exclusion shape, spanning both aside-suppressing classes — BEFORE the equality runs.
 *
 * ── AND AT-RULE AWARE ───────────────────────────────────────────────────────────────────
 *
 * `.manager-body` is re-declared inside `@container fabricate-manager (max-width: 1120px)`,
 * where it stacks to one column. A flat scan reads those as "every route released"; this
 * parser tracks brace depth and only classifies rules opened at depth 0.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// The parsers, the anchor and the aside assertion are SHARED with the two recipe-edit
// suites through this helper (issue 1362 review S4). Two copies of an anchor are two
// things to keep in step, which is the whole reason the helper exists — and the copy that
// lived here was byte-identical to the helper's, at SonarCloud's ten-line duplication floor.
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

/**
 * The routes that suppress the aside AND keep three tracks. NAMED rather than inferred: the
 * track count alone cannot separate them from `tools`, which also declares three tracks and
 * keeps its inspector.
 *
 * @type {ReadonlySet<string>}
 */
const SELF_OWNED_THREE_TRACK = new Set(['tool-edit', 'knowledge']);

/**
 * The three baseline members every parsed set must contain before the equality runs. One per
 * exclusion SHAPE — a prefix-matched family, a route+substate compound, an ordinary token —
 * and spanning both aside-suppressing classes.
 *
 * @type {readonly string[]}
 */
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
      const base = selector.replaceAll('.is-rail-collapsed', '');
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
  // THE FIELD THAT SHIPS THE DEFECT, and the one this gate could not see (issue 1362 review
  // M1). `fullWidthLayout` derives from `predicate` and from nothing else; `id` and `selector`
  // are read at runtime by nothing at all. Swapping two routes' predicates — the inspector
  // suppressed on the wrong screen — left ALL FIVE tests here green, plus manager-contract,
  // manager-layout, view-lab-cases and view-lab-source-coverage. The equivalent SELECTOR swap
  // reds the selector-to-id test below, so the gate was built to catch this class of edit and
  // missed the only field that decides anything.
  //
  // The two non-token predicates are NAMED with their exact expected text rather than skipped,
  // mirroring how `SELF_OWNED_THREE_TRACK` above names its members: an exemption that merely
  // skipped them would let either be rewritten into anything.
  assertPredicatesMatchTheirIds(rootSource);
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
