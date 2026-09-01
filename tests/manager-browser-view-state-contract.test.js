/**
 * Source contract: WHICH manager state is lifted, which is deliberately not, and who owns it
 * (issue 1438).
 *
 * ── WHY A SOURCE CONTRACT BESIDE THE BEHAVIOURAL TESTS ──────────────────────────────────
 *
 * `tests/components/manager-mounted.test.js` walks the real round-trip for eight surfaces: it
 * types into the real search box, takes the trip that unmounts the surface, comes back and
 * finds the term. That is the acceptance bar and this file does not restate it.
 *
 * What a mounted walk cannot cover is the part that is invisible when it is wrong:
 *
 *   (a) A slot minted in the registry but never BOUND at the root. The surface still works —
 *       it falls back to its own local state, exactly as it did before the lift — so no test
 *       reds, no error is thrown, and the only symptom is the original defect, unfixed. Three
 *       of the thirteen slots reach their surface through an intermediate component, so the
 *       binding is two hops from the registry and easy to half-write.
 *
 *   (b) The NEGATIVE. Some state MUST die with its mount, and nothing about a passing lift
 *       says so. A future change that quietly lifts an armed delete confirmation, or an
 *       editor's own picker, breaks a rule no failing test announces — the surface keeps
 *       working, and the damage is a destructive action re-confirmed against a row the GM is
 *       no longer looking at.
 *
 * ── THE NEGATIVE ROSTER CARRIES ITS REASON, PER ENTRY ───────────────────────────────────
 *
 * A bare list of names would be a list somebody deletes an entry from during a refactor with
 * no way to tell whether that was the point of the refactor. Each entry states why that state
 * is session-scoped, so removing one is a decision a reviewer can see and argue with.
 *
 * ── NON-VACUITY RUNS FIRST ──────────────────────────────────────────────────────────────
 *
 * Every clause here is a parse over hand-written Svelte, and the cheapest green available to a
 * broken parser is an empty set comparing equal to an empty set. So counts are asserted BEFORE
 * equalities, and the declaration scan is proved against a string it must NOT match.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManagerBrowserViewStates } from '../src/utils/managerBrowserViewState.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANAGER_DIR = 'src/ui/svelte/apps/manager';
const ROOT_PATH = `${MANAGER_DIR}/CraftingSystemManagerRoot.svelte`;

function sourceOf(repoRelativePath) {
  return readFileSync(resolve(repoRoot, repoRelativePath), 'utf8');
}

const rootSource = sourceOf(ROOT_PATH);

/**
 * Every `managerBrowserState.<key>` the root BINDS, with the prop name it binds it to.
 *
 * Matched on `bind:` specifically. A plain attribute would still hand the object down and the
 * surface would still work, so this is not pedantry about syntax — it is the same `bind:` the
 * three shipped studios use, and keeping the whole family on one idiom is what stops the next
 * reader having to work out whether the difference meant something.
 */
function boundSlots(source) {
  return [...source.matchAll(/bind:([A-Za-z]+)=\{managerBrowserState\.([A-Za-z]+)\}/g)].map(
    (match) => ({ prop: match[1], slot: match[2] })
  );
}

describe('the lifted manager browser view-state is wired end to end (issue 1438)', () => {
  it('mints a registry whose every slot is a plain object with no shared identity', () => {
    const first = createManagerBrowserViewStates();
    const second = createManagerBrowserViewStates();
    const keys = Object.keys(first);

    assert.ok(keys.length >= 13, `the registry minted only ${keys.length} slots; the scan broke`);
    for (const key of keys) {
      assert.equal(
        Object.getPrototypeOf(first[key]),
        Object.prototype,
        `${key} must be a plain object so a caller can wrap it in $state() and proxy it`
      );
      // TWO CALLS, TWO OBJECTS. A factory that returned a module-level literal would give every
      // manager instance the same view-state — one GM's filter bar reaching another window —
      // and every assertion above would still pass.
      assert.notEqual(first[key], second[key], `${key} is shared between two registries`);
    }
  });

  it('binds every registry slot at the root exactly once', () => {
    const bound = boundSlots(rootSource);
    assert.ok(bound.length >= 13, `only ${bound.length} bindings parsed; the scan broke`);

    const boundNames = bound.map((entry) => entry.slot);
    const duplicates = boundNames.filter((name, index) => boundNames.indexOf(name) !== index);
    assert.deepEqual(duplicates, [], 'a slot bound twice would let two surfaces share one filter');

    // THE CLAUSE THAT CATCHES THE SILENT HALF. A minted-but-unbound slot leaves its surface on
    // the local fallback — working, untested, and still carrying the defect this change exists
    // to remove.
    assert.deepEqual(
      [...boundNames].sort((a, b) => a.localeCompare(b)),
      Object.keys(createManagerBrowserViewStates()).sort((a, b) => a.localeCompare(b)),
      'every slot the registry mints must be bound at the root, and nothing else'
    );
  });

  it('reads the bound object through the same fallback idiom at every surface', () => {
    // `browserState ?? ownBrowserState` is what makes an UNBOUND mount — every isolated
    // component suite in `tests/components/` — keep its controls reactive. A surface that read
    // `browserState` alone would throw on a null in exactly those suites; one that read
    // `ownBrowserState` alone would ignore the root's object and silently keep the defect.
    const READERS = [
      `${MANAGER_DIR}/SystemsBrowserView.svelte`,
      `${MANAGER_DIR}/ToolsBrowserView.svelte`,
      `${MANAGER_DIR}/EnvironmentsBrowserView.svelte`,
      `${MANAGER_DIR}/GatheringTasksBrowserView.svelte`,
      `${MANAGER_DIR}/GatheringEventsBrowserView.svelte`,
      `${MANAGER_DIR}/GatheringRealmsTab.svelte`,
      `${MANAGER_DIR}/RealmEnvironmentsEditor.svelte`,
      `${MANAGER_DIR}/VocabularyPanel.svelte`,
      `${MANAGER_DIR}/KnowledgeView.svelte`,
      `${MANAGER_DIR}/GrantAccessInspector.svelte`,
      `${MANAGER_DIR}/scoped/EntityListInspectorFrame.svelte`,
      // The three studios issues 643, 676 and 1036 lifted before this one. They are asserted
      // here rather than left implicit: the whole point of this change is that there is now ONE
      // mechanism, and a list that quietly excused the originals would let them drift back out.
      `${MANAGER_DIR}/ComponentsBrowserView.svelte`,
      `${MANAGER_DIR}/EssenceBrowserView.svelte`,
      `${MANAGER_DIR}/RecipesBrowserView.svelte`,
    ];
    assert.equal(READERS.length, 14, 'the reader roster changed without this count changing');
    for (const path of READERS) {
      const source = sourceOf(path);
      assert.ok(
        source.includes('browserState = $bindable(null)'),
        `${path} must declare browserState as a bindable prop`
      );
      assert.ok(
        source.includes('$derived(browserState ?? ownBrowserState)'),
        `${path} must fall back to its own state when unbound`
      );
    }
  });

  it('passes the slot through every intermediate that does not own it', () => {
    // Three surfaces are two hops from the root, and a pass-through is the one link in this
    // chain with no visible failure mode: the intermediate renders, the child renders, and the
    // child simply falls back to its local state.
    const PASS_THROUGH = [
      [`${MANAGER_DIR}/EnvironmentsBrowserView.svelte`, 'gatheringTasksBrowserState'],
      [`${MANAGER_DIR}/EnvironmentsBrowserView.svelte`, 'gatheringEventsBrowserState'],
      [`${MANAGER_DIR}/GatheringRealmsTab.svelte`, 'realmEnvironmentsBrowserState'],
      [`${MANAGER_DIR}/TagsCategoriesView.svelte`, 'recipeCategoryBrowserState'],
      [`${MANAGER_DIR}/TagsCategoriesView.svelte`, 'componentCategoryBrowserState'],
      [`${MANAGER_DIR}/TagsCategoriesView.svelte`, 'componentTagBrowserState'],
      [`${MANAGER_DIR}/scoped/EntityCatalogueShell.svelte`, 'browserState'],
      [`${MANAGER_DIR}/scoped/EntityRulesListShell.svelte`, 'browserState'],
      [`${MANAGER_DIR}/scoped/WorldEssenceCataloguePage.svelte`, 'browserState'],
    ];
    for (const [path, prop] of PASS_THROUGH) {
      const source = sourceOf(path);
      assert.ok(
        source.includes(`${prop} = $bindable(null)`),
        `${path} must declare ${prop} so the root's object reaches its child`
      );
      assert.ok(
        source.includes(`bind:${prop}`) || source.includes(`bind:browserState={${prop}}`),
        `${path} declares ${prop} but never hands it on, which is inert`
      );
    }
  });
});

/**
 * State that MUST die with its mount, and the reason it must.
 *
 * Read as `[component, declaration, why]`. The declaration is matched as the literal `$state`
 * line, so a change that moves it onto the lifted object — the exact quiet lift this guards
 * against — fails here rather than shipping.
 */
const SESSION_SCOPED_STATE = [
  [
    'GatheringTaskEditView',
    'searchTerm',
    'the drop-rule picker inside ONE task editing session; the next task is a different question',
  ],
  ['GatheringTaskEditView', 'componentSearchTerm', 'the component picker, same session, same rule'],
  ['GatheringTaskEditView', 'componentTagSearchTerm', 'the tag picker, same session, same rule'],
  ['GatheringTaskEditView', 'toolSearchTerm', 'the tool picker, same session, same rule'],
  [
    'EnvironmentsBrowserView',
    'weatherInput',
    'a half-typed vocabulary entry on the add form, not a filter over anything',
  ],
  ['EnvironmentsBrowserView', 'timeOfDayInput', 'the same add form, the same half-typed entry'],
  ['EnvironmentsBrowserView', 'biomeInput', 'the same add form, the same half-typed entry'],
  [
    'VocabularyPanel',
    'pendingRemovalId',
    'an ARMED destructive confirmation naming one row; an arm that outlives its surface is a delete nobody re-confirmed',
  ],
  [
    'KnowledgeView',
    'armedToken',
    'the same armed-confirmation rule on the Knowledge surface, where the action erases a character record',
  ],
  [
    'ToolsBrowserView',
    'autoSelectedToolId',
    'the "nothing is selected, pick the first row" guard for one mount, never a GM choice',
  ],
  [
    'EssenceBrowserView',
    'membershipFilter',
    'issue 1372 ruled it component-local: returning to a list showing entities the edited system does not hold reads as data loss',
  ],
];

describe('state that must NOT be lifted stays with its mount (issue 1438)', () => {
  it('detects a lifted declaration, so the clauses below are not vacuous', () => {
    // Prove the matcher can FAIL before trusting eleven passes from it. The mutated line is the
    // shape a quiet lift produces — the name moved onto the shared object — and the matcher must
    // not find the local declaration in it.
    const local = "  let armedToken = $state('');";
    const lifted = '  const armedToken = $derived(ui.armedToken);';
    const declares = (source, name) => source.includes(`let ${name} = $state(`);
    assert.ok(declares(local, 'armedToken'), 'the matcher cannot see a local declaration');
    assert.ok(!declares(lifted, 'armedToken'), 'the matcher passes a LIFTED declaration');
  });

  for (const [component, name, why] of SESSION_SCOPED_STATE) {
    it(`${component}.${name} stays component-local — ${why}`, () => {
      const path =
        component === 'EntityListInspectorFrame'
          ? `${MANAGER_DIR}/scoped/${component}.svelte`
          : `${MANAGER_DIR}/${component}.svelte`;
      const source = sourceOf(path);
      assert.ok(
        source.includes(`let ${name} = $state(`),
        `${component}.${name} is no longer a component-local $state: ${why}`
      );
    });
  }

  it("keeps the scoped list's bulk selection out of the lifted object", () => {
    // The one axis of `EntityListInspectorFrame` deliberately left behind. A selection is an
    // in-progress action over a SET, not a filter over rows, and its terminal actions belong to
    // the lane that supplies the `bulk` descriptor — so it must not outlive the list it names.
    const frame = sourceOf(`${MANAGER_DIR}/scoped/EntityListInspectorFrame.svelte`);
    assert.ok(
      frame.includes('let selectedIds = $state(new Set())'),
      'the bulk selection must stay component-local'
    );
    assert.ok(
      !frame.includes('ui.selectedIds'),
      'the bulk selection must not be read or written through the lifted object'
    );
    const registry = createManagerBrowserViewStates();
    assert.ok(
      !('selectedIds' in registry.worldEssenceCatalogue),
      'the registry must not mint a slot for the bulk selection'
    );
  });
});

test('the two store-backed searches stay in the store, because they are not view filters', () => {
  // The decision this change had to make, pinned where a future "tidy-up" will read it.
  //
  // `itemSearch` and `recipeSearch` look like the eleven terms lifted here and are NOT the same
  // thing: they are QUERY PARAMETERS the store's own data assembly consumes. `setItemSearch`
  // awaits `refresh()`, and the refresh threads the term into `buildItemCards(…, itemSearchTerm,
  // …)` → `systemManager.getItems(systemId, search)`. The term selects the COHORT that is
  // fetched, hydrated and memoised, so moving it onto a view-state object would move cohort
  // selection out of the store — a behaviour change, not a lift.
  const store = sourceOf('src/ui/svelte/stores/adminStore.js');
  assert.ok(
    store.includes("const itemSearch = writable('')"),
    'itemSearch must stay a store writable'
  );
  assert.ok(
    store.includes("const recipeSearch = writable('')"),
    'recipeSearch must stay a store writable'
  );
  assert.ok(
    /async function setItemSearch\(term\) \{\s*itemSearch\.set\(term\);\s*await refresh\(\);/.test(
      store
    ),
    'setItemSearch must still trigger the refresh that rebuilds the cohort; without it the term ' +
      'is an ordinary view filter and this whole justification lapses'
  );
  assert.ok(
    store.includes('get(itemSearch)'),
    'the refresh must still read the term when it assembles item cards'
  );
  // AND THE COUNTER-CLAIM THE BRIEF FOR THIS CHANGE CARRIED: neither is world state. Both are
  // per-`createAdminStore` in-memory writables, never written to a Foundry setting, so the
  // choice between the two mechanisms is about ROLE and not about persistence.
  assert.ok(
    !/(setSetting|services\.setSetting)\([^)]*(itemSearch|recipeSearch)/.test(store),
    'neither search term may be persisted to a setting'
  );
});
