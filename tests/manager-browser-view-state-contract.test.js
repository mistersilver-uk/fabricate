/**
 * Source contract: WHICH manager state is lifted, which is deliberately not, and who owns it (issue
 * 1438). WHY A SOURCE CONTRACT BESIDE THE BEHAVIOURAL TESTS
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManagerBrowserViewStates } from '../src/ui/model/managerBrowserViewState.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANAGER_DIR = 'src/ui/svelte/apps/manager';
const ROOT_PATH = `${MANAGER_DIR}/CraftingSystemManagerRoot.svelte`;

function sourceOf(repoRelativePath) {
  return readFileSync(resolve(repoRoot, repoRelativePath), 'utf8');
}

const rootSource = sourceOf(ROOT_PATH);

/** Every `managerBrowserState.<key>` the root BINDS, with the prop name it binds it to. */
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
    // `browserState ?? ownBrowserState` is what makes an UNBOUND mount — every isolated component
    // suite in `tests/components/` — keep its controls reactive.
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
      // The three studios issues 643, 676 and 1036 lifted before this one.
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
      // The shared vocabulary panel (issue 1915) is a pass-through on BOTH routes: it sorts
      // from the slot and hands the same object to `VocabularyPanel`, which owns the search.
      [`${MANAGER_DIR}/VocabularyShellPanel.svelte`, 'browserState'],
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

/** State that MUST die with its mount, and the reason it must. */
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
    // Prove the matcher can FAIL before trusting eleven passes from it.
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
    // The one axis of `EntityListInspectorFrame` deliberately left behind.
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
  // AND THE COUNTER-CLAIM THE BRIEF FOR THIS CHANGE CARRIED: neither is world state.
  assert.ok(
    !/(setSetting|services\.setSetting)\([^)]*(itemSearch|recipeSearch)/.test(store),
    'neither search term may be persisted to a setting'
  );
});
