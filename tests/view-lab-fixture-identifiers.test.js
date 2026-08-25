/**
 * Every fixture identifier a case names must exist in the lab world.
 *
 * `tests/view-lab-cases.test.js` checks that a selector's HOOKS exist in `src/` — the class names
 * and attribute names — and it deliberately strips attribute VALUES before doing so, because those
 * values are fixture ids and live here rather than in `src/`. Nothing then checked them there. That
 * left the registry's largest hand-maintained mirror unguarded: roughly fifty component, recipe,
 * tool, task, event, environment and actor ids, plus every `query.system`.
 *
 * A renamed fixture id is caught today only by a capture run — which needs harvested Foundry chrome,
 * so it does not run on a fork PR, does not run without credentials, and is not part of `npm test`.
 * Between the rename and the next successful capture, the case silently cannot reach its state.
 *
 * The check is exact-value, not substring: `sm-longsword` must BE an id in the world, not merely
 * appear somewhere in the file. Substring matching is how the sibling guard in `view-lab-cases`
 * passed over six broken selectors before it was tightened.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';
import { buildLabContent, LAB_SYSTEM_IDS } from './view-lab/world/labContent.js';
import { buildLabActors } from './view-lab/world/labActors.js';

const content = buildLabContent();
const actors = buildLabActors(content);

/**
 * The run ids `buildLabRunStates` authors, read from its source.
 *
 * Every `lab-` run id, not only the `lab-run-` crafting ones. The gathering and salvage containers
 * use their own prefixes, so a `lab-run-` regex left `[data-run-id="lab-gathering-blind-waiting"]`
 * — the selector the two issue-901 blind Journal cases click — checked against nothing.
 *
 * The blind run's id is declared as an exported CONSTANT rather than inline, because its secret
 * half lives in a world setting written by `labWorld.js`; the constant is matched here too.
 *
 * @returns {string[]} Every `lab-…` run id literal in the module.
 */
function labRunIds() {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'view-lab', 'world', 'labRunStates.js'),
    'utf8'
  );
  return [...source.matchAll(/(?:id|RUN_ID) = ?'(lab-[\w-]+)'|id: '(lab-[\w-]+)'/g)].map(
    (match) => match[1] ?? match[2]
  );
}

/**
 * Every modifier-library entry id the lab world declares.
 *
 * READ FROM THE AUTHORED SHAPE, not from `system.modifiers`. The fixture authors the library
 * where the pre-`1.23.0` world carried it — `craftingCheck.checkModifiers` — and the lab boot
 * runs every migration over it, so the key the DOM is eventually built from does not exist in
 * `buildLabContent()` at all. Deriving from `system.modifiers` produced an EMPTY set, which
 * then rejected every id a case legitimately names.
 *
 * @returns {string[]}
 */
function modifierLibraryIds() {
  return content.systems.flatMap((system) =>
    [
      ...(system.modifiers ?? []),
      ...(system.checkModifiers ?? []),
      ...(system.craftingCheck?.checkModifiers ?? []),
    ].map((entry) => entry.id)
  );
}

/** Attribute name -> the set of values the lab world actually contains. */
const IDENTITY_SOURCES = {
  'data-component-id': new Set(content.components.map((entry) => entry.id)),
  'data-recipe-id': new Set(content.recipes.map((entry) => entry.id)),
  'data-manager-tool-id': new Set(content.tools.map((entry) => entry.id)),
  'data-gathering-task-id': new Set(content.gatheringConfig.tasks.map((entry) => entry.id)),
  'data-task-id': new Set(content.gatheringConfig.tasks.map((entry) => entry.id)),
  'data-gathering-event-id': new Set(content.gatheringConfig.events.map((entry) => entry.id)),
  'data-environment-id': new Set(content.environments.map((entry) => entry.id)),
  'data-knowledge-actor': new Set(actors.map((entry) => entry.id)),

  // The ten below were the gap this file's own header describes and did not actually close. Each
  // pins a fixture id in a selector, so a rename is caught only by a capture run — which does not
  // run on fork PRs, and which is the slowest possible place to learn about a typo.
  'data-recipe-edit': new Set(content.recipes.map((entry) => entry.id)),
  'data-component-select': new Set(content.components.map((entry) => entry.id)),
  // The recipe browser's bulk selection control (issue 1010) — the exact mirror of
  // `data-component-select` above, and unguarded until now: the three
  // `manager-recipes-bulk-edit*` cases pin fixture ids in their row clicks, so a rename
  // would otherwise surface only in a capture run.
  'data-recipe-select': new Set(content.recipes.map((entry) => entry.id)),
  'data-system-id': new Set(content.systems.map((entry) => entry.id)),
  // The system Modifiers card's per-entry row and its roll note (issue 1118). Both pin a
  // library entry id, and `manager-system-edit-modifier-rolls` opens one by id in its steps and
  // asserts the note by id in its `expectSelector` — so a renamed entry would break the case in
  // two places and be caught by neither until a capture run.
  'data-world-modifier': new Set(modifierLibraryIds()),
  'data-world-modifier-roll-note': new Set(modifierLibraryIds()),
  // The essence browser's bulk selection control (issue 1036) — the exact mirror of
  // `data-component-select` and `data-recipe-select` above. The essence bulk-edit case pins
  // fixture ids in its row ticks, so a rename would otherwise surface only in a capture run.
  // Derived from the SYSTEM's declared vocabulary for the same reason `data-essence-id` is:
  // deriving it from the essences components happen to carry would falsely reject a
  // declared-but-uncarried essence.
  'data-essence-select': new Set(
    content.systems.flatMap((system) =>
      (system.essenceDefinitions ?? []).map((essence) => essence.id)
    )
  ),
  // From the SYSTEM's declared vocabulary, which is what `adminStore` builds the browser's rows
  // from and therefore what `EssenceBrowserView` writes into the attribute. Deriving these from the
  // essences components happen to carry passes today only because the two coincide: it would
  // falsely reject a declared-but-uncarried essence (the fixture authors exactly that deliberately
  // for the `runic` TAG) and falsely accept an essence key typo'd onto a component.
  'data-essence-id': new Set(
    content.systems.flatMap((system) =>
      (system.essenceDefinitions ?? []).map((essence) => essence.id)
    )
  ),
  // Also system-declared. `content.recipeItems` is the herbalism list alone, so smithing's
  // inline `sm-book` was missing from the set and a case naming it would have been rejected.
  'data-books-scrolls-edit': new Set(
    content.systems.flatMap((system) =>
      (system.recipeItemDefinitions ?? []).map((entry) => entry.id)
    )
  ),
  // Run ids are literals inside `buildLabRunStates`, which needs a built actor to call. Reading
  // them out of the source text keeps the guard free of that setup while still failing on a rename.
  'data-history-run-id': new Set(labRunIds()),
  // The ACTIVE-run counterpart, carried by `RunCard`. Unguarded until issue 901's blind Journal
  // cases needed it, which is the same gap `labRunIds` above describes from the other end.
  'data-run-id': new Set(labRunIds()),
  // Composite keys. The listing builds these itself, so the guard has to build them the same way
  // or it would reject the very values the DOM carries.
  'data-inventory-card': new Set(
    content.systems.flatMap((system) =>
      (system.components ?? []).map((component) => `${system.id}:${component.id}`)
    )
  ),
  // The carrier's key is `item.uuid || item.id`, and an owned item's uuid is the component's
  // `originItemUuid` — which `component()` DEFAULTS to `Item.<id>` but two components override to
  // a shared uuid. Rebuilding the default instead of reading the field admitted a value the DOM
  // never carries and rejected the one it does.
  'data-essence-carrier': new Set(
    content.components.map((entry) => entry.originItemUuid ?? `Item.${entry.id}`)
  ),
};

/** Every `key="value"` pair in a selector, in source order. */
function attributePairs(selector) {
  return [...selector.matchAll(/\[([a-z][\w-]*)\s*=\s*"([^"]*)"\]/g)].map((match) => ({
    name: match[1],
    value: match[2],
  }));
}

/**
 * The identifier pins in a selector that `IDENTITY_SOURCES` recognises, each marked with whether
 * its value exists in the lab world.
 *
 * A pin whose attribute name `IDENTITY_SOURCES` does not recognise, or whose value is empty, is not
 * returned at all — the caller never sees it, exactly as the original step loop silently skipped it.
 * Both the step sweep and the `expectSelector` sweep below call this so their extraction and
 * matching cannot drift apart.
 *
 * @param {string} selector
 * @returns {{name: string, value: string, known: boolean}[]}
 */
function identifierPins(selector) {
  const pins = [];
  for (const { name, value } of attributePairs(selector)) {
    const source = IDENTITY_SOURCES[name];
    if (!source || value === '') continue;
    pins.push({ name, value, known: source.has(value) });
  }
  return pins;
}

// `data-popover-option` is deliberately absent from IDENTITY_SOURCES, on a forward-looking rather
// than a current-state ground. Today the attribute has one producer, `SearchablePopover.svelte`,
// which stamps it only for an option carrying a `dataId`, and exactly one caller supplies one —
// `RecipeBulkEditPanel.svelte`, with `dataId: book.id` — so its whole value space is recipe book ids.
// The Travel tab's region-override and move-to-party pickers are `SearchablePopover` consumers that
// do not stamp `dataId` yet, and the component's own contract names them as the intended adopters:
// an option needs an identity handle because "without one the only handle is the display label,
// which is localized and therefore not a selector". When they adopt it the same attribute will also
// carry region ids and actor ids, and a source set defined from recipe book ids alone would then
// falsely reject the picker cases that legitimately name those (issue #1021).
//
// Twenty of the twenty-five `expectSelector`-bearing cases key on an attribute IDENTITY_SOURCES does
// not recognise — `data-bulk-book-state`, `data-essence-view`, `data-inventory-bulk-panel`,
// `data-inventory-bulk-queue-row`, and others — and fall through `identifierPins`'s skip for the
// same reason a step naming one of those attributes would. Widening IDENTITY_SOURCES to cover them
// is out of scope here (issue #1021); this sweep only guards the five that already resolve.

test('every query.system names a real lab crafting system', () => {
  const known = new Set(Object.values(LAB_SYSTEM_IDS));
  const unknown = [];
  for (const viewCase of VIEW_LAB_CASES) {
    const system = viewCase.query?.system;
    if (system && !known.has(system)) unknown.push(`${viewCase.id}: ${system}`);
  }
  assert.deepEqual(
    unknown,
    [],
    'these cases open on a crafting system the lab world does not define, so the manager falls back ' +
      'to whichever system it had and the case photographs the wrong one:\n  ' +
      unknown.join('\n  ')
  );
});

test('every fixture id a selector names exists in the lab world', () => {
  const unknown = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const step of viewCase.steps ?? []) {
      if (typeof step !== 'object') continue;
      for (const pin of identifierPins(step.selector)) {
        if (!pin.known) unknown.push(`${viewCase.id}: [${pin.name}="${pin.value}"]`);
      }
    }
  }
  assert.deepEqual(
    unknown,
    [],
    'these selectors name a fixture the lab world does not contain, so the step matches nothing and ' +
      'the case cannot reach its state. Either the fixture was renamed or the case was:\n  ' +
      unknown.join('\n  ')
  );
});

test('every fixture id an expectSelector names exists in the lab world', () => {
  const unknown = [];
  let recognized = 0;
  for (const viewCase of VIEW_LAB_CASES) {
    if (typeof viewCase.expectSelector !== 'string') continue;
    for (const pin of identifierPins(viewCase.expectSelector)) {
      recognized++;
      if (!pin.known) unknown.push(`${viewCase.id}: [${pin.name}="${pin.value}"]`);
    }
  }

  // This sweep is prospective: today every recognised expectSelector pin duplicates a value its own
  // case's steps already pinned, so a rename is caught by the step sweep first. A guard that
  // currently catches nothing needs a guard of its own, because one wired to the wrong field or run
  // over an always-empty collection passes exactly as loudly as a correct one. Counting the pins
  // the loop above actually visited, rather than recomputing them here, is what makes that visible.
  assert.ok(
    recognized > 0,
    'this sweep visited no expectSelector pin IDENTITY_SOURCES recognises, so the assertion below ' +
      'would pass even if every case were pinned to a nonexistent fixture'
  );

  assert.deepEqual(
    unknown,
    [],
    "these expectSelectors (not steps) name a fixture the lab world does not contain, so the case's " +
      'own state assertion matches nothing even after the case reaches it. Either the fixture was ' +
      'renamed or the expectSelector was:\n  ' +
      unknown.join('\n  ')
  );
});

test('the identity sources are populated, so the checks above are not vacuous', () => {
  // A builder that returned nothing would make every assertion above pass by matching an empty set
  // against an empty set — the shape of failure this whole file exists to catch, turned on itself.
  for (const [name, values] of Object.entries(IDENTITY_SOURCES)) {
    assert.ok(values.size > 0, `no lab fixture supplies values for ${name}`);
  }
  assert.ok(Object.values(LAB_SYSTEM_IDS).length >= 5, 'expected one system per resolution mode');
});
