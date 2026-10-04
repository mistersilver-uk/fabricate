/**
 * The EDITOR recipe's gap rule and action pair, mounted (issue 1522): between the tab bar and the
 * first card sit only the notices and then the tab's heading block, and every editor header puts
 * Back before Save with Save last.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, tick, unmount } from 'svelte';

import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { createManagerQueries, setInputValue } from '../helpers/manager/managerQueries.js';
import { sourceAstEntriesUnder } from '../helpers/parsedSource.js';
import { importedModules } from '../helpers/svelteStructureContract.js';

import {
  booksScrollsFixtures,
  disposeManagerSuite,
  managerComponent,
  managerComponents,
} from './manager-mounted-shared.js';

const MANAGER = 'src/ui/svelte/apps/manager';

// Importers of the strip that are not under the rule yet, with the reason each is exempt.
const EXEMPT = Object.freeze({
  [`${MANAGER}/knowledge/KnowledgeTabs.svelte`]: 'a browse route, not an editor',
  [`${MANAGER}/EnvironmentEditView.svelte`]: 'its rails convert in issue 1522 P2',
});

let Component;
let mounted;
let target;
let store;

const queries = createManagerQueries(() => target);
const { craftingParent, craftingSubitem, navButton, worldNavItem } = queries;
const { mountManager, openRecipeEditor } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: (nextStore) => {
    store = nextStore;
  },
});

async function settle() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

async function press(element, what) {
  assert.ok(Boolean(element), `${what} did not render`);
  element.click();
  await settle();
}

/** Mount one component of the compiled tree on a fresh host. */
function mountDirect(component, props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(component, { target, props });
  flushSync();
  return target;
}

/** Every `apps/manager` component importing the strip, directly or through a `*EditorTabs` wrapper. */
function derivedEditorSet() {
  return sourceAstEntriesUnder(MANAGER)
    .filter(([path]) => path.endsWith('.svelte') && !path.endsWith('EditorTabs.svelte'))
    .filter(([, ast]) => importedModules(ast).some((name) => /\/\w*EditorTabs\.svelte$/.test(name)))
    .map(([path]) => path)
    .filter((path) => !Object.hasOwn(EXEMPT, path))
    .sort((left, right) => left.localeCompare(right));
}

function worldScopeLeg(records) {
  return {
    available: true,
    seeded: { entities: true, defaults: true, membership: true },
    entities: records.map((record) => ({ ...record })),
    entries: records.map((record) => ({
      id: record.id,
      entity: { ...record },
      defaults: null,
      membershipCount: 1,
      systems: [{ systemId: 'alchemy', member: true, enabled: true }],
    })),
  };
}

async function openScopedEntry(leg, record, leaf) {
  mountManager();
  store.viewState.update((state) => ({
    ...state,
    worldScope: { ...state.worldScope, [leg]: worldScopeLeg([record]) },
  }));
  await settle();
  await press(worldNavItem(leaf), `the ${leaf} rail item`);
  await press(
    target.querySelector(
      `[data-scoped-list-row="${record.id}"] [data-scoped-list-action="open-entry"]`
    ),
    `the ${record.id} open-entry action`
  );
}

async function openComponentEditor(storeOptions = {}) {
  mountManager([], storeOptions);
  await press(navButton('Component Rules'), 'Component Rules');
  await press(target.querySelector('[data-component-edit="c1"]'), 'the c1 edit action');
}

async function openEssenceEditor(storeOptions = {}) {
  mountManager([], storeOptions);
  await press(navButton('Essence Rules'), 'Essence Rules');
  await press(
    target.querySelector(':scope [data-essence-id="water"] [data-essence-edit="water"]'),
    'the water edit action'
  );
}

async function openChecks() {
  mountManager([], { alchemyConfig: { checkMode: 'simple' } });
  await press(navButton('Checks'), 'Checks');
}

async function openToolEditor() {
  mountManager([], {
    gatheringLibraryTools: [
      {
        id: 'tool-catalyst',
        label: 'Artisan Catalyst',
        enabled: true,
        componentId: 'c1',
        requirement: null,
        breakage: { mode: 'limitedUses', maxUses: null },
        onBreak: { mode: 'destroy' },
      },
    ],
    toolDraftValidation: { valid: true, errors: [] },
  });
  await press(navButton('Gathering'), 'Gathering');
  await press(navButton('Tool Rules'), 'Tool Rules');
  await press(
    target.querySelector(':scope [data-manager-tool-id="tool-catalyst"] [data-tool-edit-rules]'),
    'the tool edit action'
  );
}

/** Press the header's primary, which submits the editor's form or saves the root's draft. */
async function pressHeaderSave() {
  await press(
    target.querySelector(':scope .manager-header-actions .fabricate-button.is-primary'),
    'the header Save'
  );
}

// One row per editor: how a GM reaches it, the first card of the tab it opens on, and, where the
// store double can reach one, a run raising the editor's notice and the hook that notice carries.
const EDITORS = {
  [`${MANAGER}/RecipeEditView.svelte`]: {
    open: () => openRecipeEditor([]),
    firstCard: '[data-recipe-tab="overview"] [data-recipe-section="identity"]',
    raise: async () => {
      await openRecipeEditor([], { updateRecipeResult: false });
      setInputValue(
        target.querySelector(':scope .manager-main [data-recipe-field="name"]'),
        'Elixir'
      );
      await settle();
      await pressHeaderSave();
    },
    notice: '[role="alert"]',
  },
  [`${MANAGER}/RecipeItemEditor.svelte`]: {
    open: async () => {
      mountManager([], {
        experimentalFeaturesEnabled: true,
        recipeItemDefinitions: booksScrollsFixtures,
      });
      await press(craftingParent(), 'the Crafting parent');
      await press(craftingSubitem('Books & Scrolls'), 'Books & Scrolls');
      await press(target.querySelector('[data-books-scrolls-edit="ri1"]'), 'the ri1 edit action');
    },
    firstCard: '[data-recipe-item-tab="overview"] .manager-recipe-item-field',
  },
  [`${MANAGER}/ComponentEditView.svelte`]: {
    open: () => openComponentEditor(),
    firstCard: '[data-component-edit-section="category"]',
    raise: async () => {
      await openComponentEditor({ updateComponentResult: false });
      await press(
        target.querySelector('[data-component-edit-tag-toggle="herb"]'),
        'the herb tag toggle'
      );
      await pressHeaderSave();
    },
    notice: '[role="alert"]',
  },
  [`${MANAGER}/EssenceEditView.svelte`]: {
    open: () => openEssenceEditor(),
    firstCard: '#essence-panel-identity .manager-edit-card',
    raise: async () => {
      await openEssenceEditor({ updateEssenceResult: false });
      setInputValue(target.querySelector('#manager-essence-edit-name'), 'Rain');
      await settle();
      await pressHeaderSave();
    },
    notice: '[role="alert"]',
  },
  // The store double's crafting check has no roll formula, so The roll's non-blocking notice is
  // raised on every run of this route.
  [`${MANAGER}/checks/ChecksView.svelte`]: {
    open: openChecks,
    firstCard: '[data-checks-panel] .fabricate-card',
    raise: openChecks,
    notice: '[data-checks-section-notice]',
  },
  [`${MANAGER}/SystemEditView.svelte`]: {
    open: async () => {
      mountManager();
      await press(navButton('System Overview'), 'System Overview');
    },
    firstCard: '#system-panel-settings .manager-edit-card',
    raise: async () => {
      mountManager([], {
        systemValidation: {
          issues: [],
          counts: { critical: 1, warning: 0, info: 0, blockers: 1 },
          blocksSystem: true,
        },
      });
      await press(navButton('System Overview'), 'System Overview');
    },
    notice: '[data-system-edit-blocker]',
  },
  [`${MANAGER}/ToolEditView.svelte`]: {
    open: openToolEditor,
    firstCard: '[data-tool-system-scope]',
  },
  [`${MANAGER}/scoped/WorldComponentEntryPage.svelte`]: {
    open: () =>
      openScopedEntry('component', { id: 'vial', name: 'Glass Vial' }, 'component-catalogue'),
    firstCard: '[data-scoped-entry-identity-card]',
  },
  [`${MANAGER}/scoped/WorldEssenceEntryPage.svelte`]: {
    open: () => openScopedEntry('essence', { id: 'water', name: 'Water' }, 'essence-catalogue'),
    firstCard: '[data-scoped-entry-identity="water"]',
  },
  [`${MANAGER}/scoped/WorldToolEntryPage.svelte`]: {
    open: () => openScopedEntry('tool', { id: 'pick', name: 'Mining Pick' }, 'tool-catalogue'),
    firstCard: '[data-world-tool-entry-card]',
  },
};

/** Every element under `root` in document order, walked by hand rather than by a cached query. */
function elementsUnder(root) {
  return [...root.children].flatMap((child) => [child, ...elementsUnder(child)]);
}

function describeElement(element) {
  const attributes = [...element.attributes]
    .filter((attribute) => attribute.name !== 'style')
    .map((attribute) => `${attribute.name}="${attribute.value.slice(0, 40)}"`)
    .join(' ');
  return `<${element.tagName.toLowerCase()} ${attributes}>`;
}

/**
 * Every maximal element between the tab bar nearest above the first card and that card. Order and
 * containment are read off the hand walk's preorder: happy-dom proxies a `<form>`, so its
 * descendants' `parentElement`, `contains` and `compareDocumentPosition` misread it.
 */
function gapOf(host, firstCardSelector) {
  const firstCard = host.querySelector(firstCardSelector);
  assert.ok(Boolean(firstCard), `the first card ${firstCardSelector} did not render`);
  const ordered = elementsUnder(host);
  const position = new Map(ordered.map((element, index) => [element, index]));
  const last = new Map(
    ordered.map((element, index) => [element, index + elementsUnder(element).length])
  );
  const encloses = (ancestor, node) =>
    position.get(ancestor) <= position.get(node) && position.get(node) <= last.get(ancestor);
  const tablist = ordered
    .filter((element) => element.getAttribute('role') === 'tablist')
    .findLast((element) => position.get(element) < position.get(firstCard));
  assert.ok(Boolean(tablist), 'no tab bar renders above the first card');
  const between = (element) =>
    position.get(element) > position.get(tablist) &&
    position.get(element) < position.get(firstCard) &&
    !encloses(tablist, element) &&
    !encloses(element, firstCard);
  const parentOf = new Map(
    ordered.flatMap((element) => [...element.children].map((child) => [child, element]))
  );
  return ordered.filter((element) => between(element) && !between(parentOf.get(element)));
}

const isNotice = (element) =>
  element.hasAttribute('data-notice-position') || element.classList.contains('fab-notice');

/** The gap rule, element by element, naming what it found when it fails. */
function assertGapRule(host, firstCardSelector) {
  const maximal = gapOf(host, firstCardSelector);
  const found = `found\n  ${maximal.map(describeElement).join('\n  ')}`;
  const headings = maximal.filter((element) => element.hasAttribute('data-tab-heading'));
  assert.ok(
    maximal.every((element) => isNotice(element) || element.hasAttribute('data-tab-heading')),
    `only notices and the heading block sit above the first card; ${found}`
  );
  assert.ok(headings.length <= 1, `one heading block at most; ${found}`);
  assert.ok(
    headings.every((heading) => heading.querySelectorAll('.manager-callout').length <= 1),
    `the heading block holds one callout at most; ${found}`
  );
  assert.ok(
    headings.length === 0 || maximal.findLastIndex(isNotice) < maximal.indexOf(headings[0]),
    `the notices precede the heading block; ${found}`
  );
  return maximal;
}

/** The raised notice, asserted to sit at its editor's notice position. */
function assertNoticeAtPosition(host, firstCardSelector, notice) {
  const positioned = assertGapRule(host, firstCardSelector).filter(isNotice);
  assert.ok(
    positioned.some((element) => element.matches(notice) || element.querySelector(notice)),
    `${notice} renders at the notice position`
  );
}

const RECIPE = Object.freeze({
  id: 'r1',
  name: 'Elixir',
  ingredientSets: [{ id: 's1', name: 'Set', ingredientGroups: [] }],
  resultGroups: [{ id: 'g1', name: 'Group', results: [] }],
});

const RECIPE_TABS = Object.freeze(['overview', 'ingredients', 'results', 'tools']);

/** Mount the recipe editor on its own, with every tab the strip can offer. */
function mountRecipeEditor(RecipeEditView, props = {}) {
  return mountDirect(RecipeEditView, {
    recipe: RECIPE,
    visibilityEffect: { showAccess: true, showBooksScrolls: true },
    ...props,
  });
}

function openRecipeTab(tab) {
  target.querySelector(`[data-recipe-tab-button="${tab}"]`).click();
  flushSync();
}

const recipeFirstCard = (tab) => `[data-recipe-tab="${tab}"] [data-recipe-section]`;

/** Back and Save by what a GM sees: the arrow-left Back, and the primary. */
function assertBackThenSaveLast(host, branch) {
  const buttons = elementsUnder(host).filter((element) => element.tagName === 'BUTTON');
  const back = buttons.findIndex((button) => button.querySelector('.fa-arrow-left'));
  const save = buttons.findIndex((button) => button.classList.contains('is-primary'));
  assert.ok(back !== -1 && save !== -1, `${branch}: Back and Save both render`);
  assert.ok(back < save, `${branch}: Back precedes Save`);
  assert.equal(save, buttons.length - 1, `${branch}: Save is the last action`);
}

describe('the EDITOR recipe (issue 1522)', () => {
  let RecipeEditView;

  before(async () => {
    ({ Component } = await managerComponents());
    RecipeEditView = await managerComponent(`${MANAGER}/RecipeEditView.svelte`);
  });

  afterEach(async () => {
    if (mounted) unmount(mounted);
    mounted = null;
    target?.remove();
    target = null;
    await new Promise((settled) => setImmediate(settled));
  });

  after(disposeManagerSuite);

  it('covers every editor the strip`s importers name, less the stated exemptions', () => {
    const derived = derivedEditorSet();
    assert.ok(derived.length >= 8, `the derivation found only ${derived.length} editors`);
    assert.deepEqual(
      Object.keys(EDITORS).sort((left, right) => left.localeCompare(right)),
      derived
    );
  });

  for (const [file, editor] of Object.entries(EDITORS)) {
    it(`${file}: only notices and the heading block sit above the first card`, async () => {
      await editor.open();
      assertGapRule(target, editor.firstCard);
    });

    if (editor.raise) {
      it(`${file}: and its notice renders at the notice position`, async () => {
        await editor.raise();
        assertNoticeAtPosition(target, editor.firstCard, editor.notice);
      });
    }
  }

  it('the recipe save-failed notice stays at the notice position on another tab', async () => {
    await EDITORS[`${MANAGER}/RecipeEditView.svelte`].raise();
    await press(target.querySelector('[data-recipe-tab-button="ingredients"]'), 'Ingredients');
    assertNoticeAtPosition(target, recipeFirstCard('ingredients'), '[role="alert"]');
  });

  it('the mode callout heads exactly the tabs the mode shapes, in their heading blocks', () => {
    mountRecipeEditor(RecipeEditView, { resolutionMode: 'routedByCheck' });
    for (const tab of RECIPE_TABS) {
      openRecipeTab(tab);
      assertGapRule(target, recipeFirstCard(tab));
      const callouts = target.querySelectorAll('[data-recipe-mode-callout]');
      assert.equal(callouts.length, 1, `${tab} renders the mode callout once`);
      assert.ok(Boolean(callouts[0].closest('[data-tab-heading]')), `${tab}: in its heading block`);
      assert.equal(callouts[0].getAttribute('data-recipe-mode-callout'), 'routedByCheck');
    }
    for (const tab of ['access', 'books-scrolls', 'validation']) {
      openRecipeTab(tab);
      assert.ok(!target.querySelector('[data-recipe-mode-callout]'), `${tab} carries no callout`);
    }
  });

  it('the mode callout is a neutral note whose action routes to Crafting Settings', () => {
    const opened = [];
    mountRecipeEditor(RecipeEditView, {
      onOpenCraftingSettings: () => {
        opened.push(true);
      },
    });
    const callout = target.querySelector('[data-recipe-mode-callout]');
    assert.equal(callout.getAttribute('role'), 'note');
    assert.equal(callout.getAttribute('data-callout-tone'), 'neutral');
    callout.querySelector('[data-recipe-mode-callout-settings]').click();
    assert.equal(opened.length, 1, 'the action calls onOpenCraftingSettings');
  });

  it('the progressive strip sits below the reorder card, directly above the list', () => {
    mountRecipeEditor(RecipeEditView, { progressive: true, resolutionMode: 'progressive' });
    openRecipeTab('results');
    assertGapRule(target, recipeFirstCard('results'));
    const ordered = elementsUnder(target);
    const at = (selector) => ordered.indexOf(target.querySelector(selector));
    assert.ok(
      at('[data-recipe-section="allow-player-result-reorder"]') < at('[data-recipe-info-strip]'),
      'the strip follows the reorder card'
    );
    assert.ok(
      at('[data-recipe-info-strip]') < at('[data-recipe-section="results"]'),
      'and precedes the list it describes'
    );
  });

  it('a collapsed chain states it as lede text in each affected tab`s heading block', () => {
    mountRecipeEditor(RecipeEditView, {
      recipe: {
        ...RECIPE,
        steps: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
    });
    for (const [tab, note] of [
      ['ingredients', '[data-recipe-collapsed-note]'],
      ['results', '[data-recipe-collapsed-results-note]'],
      ['tools', '[data-recipe-collapsed-note]'],
    ]) {
      openRecipeTab(tab);
      const rendered = target.querySelector(`[data-recipe-tab="${tab}"] ${note}`);
      assert.ok(Boolean(rendered?.closest('[data-tab-heading]')), `${tab}: the note is lede text`);
    }
  });

  it('the inert callout is a warning below the modifier grid whose action opens Checks', () => {
    const opened = [];
    mountRecipeEditor(RecipeEditView, {
      craftingModifierOptions: [{ id: 'm1', label: 'Herbalism' }],
      craftingModifierPolicy: 'bySubject',
      craftingModifierInertCause: 'noFormula',
      onOpenChecks: () => {
        opened.push(true);
      },
    });
    assertGapRule(target, recipeFirstCard('overview'));
    const inert = target.querySelector('[data-recipe-modifier-inert="noFormula"]');
    assert.ok(Boolean(inert), 'the inert callout renders');
    assert.equal(inert.getAttribute('data-callout-tone'), 'warning');
    assert.ok(!inert.closest('[data-tab-heading]'), 'outside the heading block');
    const ordered = elementsUnder(target);
    assert.ok(
      ordered.indexOf(target.querySelector('.manager-recipe-overview-selects')) <
        ordered.indexOf(inert),
      'below the modifier grid'
    );
    inert.querySelector('[data-recipe-modifier-inert-checks]').click();
    assert.equal(opened.length, 1, 'the action calls onOpenChecks');
  });

  for (const [branch, unit, props] of [
    ['recipe-edit', 'ManagerHeaderCraftingActions', {}],
    ['recipe-item-edit', 'ManagerHeaderCraftingActions', {}],
    ['component-edit', 'ManagerHeaderCraftingActions', {}],
    ['essence-edit', 'ManagerHeaderCraftingActions', {}],
    ['environment-edit', 'ManagerHeaderGatheringActions', {}],
    [
      'gathering-task-edit',
      'ManagerHeaderGatheringActions',
      { gatheringTaskValidation: { valid: true, errors: [] } },
    ],
    [
      'gathering-event-edit',
      'ManagerHeaderGatheringActions',
      { gatheringEventValidation: { valid: true, errors: [] } },
    ],
  ]) {
    it(`the ${branch} header puts Back before Save, and Save last`, async () => {
      const header = await managerComponent(`${MANAGER}/${unit}.svelte`);
      mountDirect(header, { currentView: branch, text: (key, fallback) => fallback, ...props });
      assertBackThenSaveLast(target, branch);
    });
  }

  it('the tool editor header puts Back before Save, and Save last', async () => {
    await openToolEditor();
    const save = target.querySelector('[data-tool-editor-save]');
    assert.ok(Boolean(target.querySelector('[data-tool-editor-back]')), 'Back renders');
    assertBackThenSaveLast(save.parentElement, 'tool-edit');
  });
});
