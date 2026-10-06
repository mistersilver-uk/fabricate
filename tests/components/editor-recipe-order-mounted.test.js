/**
 * The EDITOR recipe's gap rule and action pair, mounted (issue 1522): between the tab bar and the
 * first card sit only the notices and then the tab's heading block, on every tab of every editor,
 * and every editor header puts Back before Save with Save last.
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
  [`${MANAGER}/downtime/WorldDowntimeTabs.svelte`]:
    'the World > Downtime route`s strip, over a companion preview rather than a record editor',
});

let Component;
let mounted;
let target;
let store;

const queries = createManagerQueries(() => target);
const { craftingParent, craftingSubitem, gatheringSubitem, navButton, worldNavItem } = queries;
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

const TAB_STRIP = /\/\w*EditorTabs\.svelte$/;

/** A module's static imports and re-exports, read off its program body. */
const moduleSources = (program) =>
  program.body.filter((node) => node.source).map((node) => node.source.value);

/** Every source under `root` importing or re-exporting the strip or a `*EditorTabs` wrapper. */
function stripImporters(root) {
  return sourceAstEntriesUnder(root)
    .filter(([path]) => !path.endsWith('EditorTabs.svelte'))
    .filter(([path, ast]) =>
      (path.endsWith('.svelte') ? importedModules(ast) : moduleSources(ast)).some((name) =>
        TAB_STRIP.test(name)
      )
    )
    .map(([path]) => path);
}

/** Every `apps/manager` component importing the strip, less the stated exemptions. */
function derivedEditorSet() {
  return stripImporters(MANAGER)
    .filter((path) => path.endsWith('.svelte') && !Object.hasOwn(EXEMPT, path))
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

async function openRecipeItemEditor(storeOptions = {}) {
  mountManager([], {
    experimentalFeaturesEnabled: true,
    recipeItemDefinitions: booksScrollsFixtures,
    ...storeOptions,
  });
  await press(craftingParent(), 'the Crafting parent');
  await press(craftingSubitem('Books & Scrolls'), 'Books & Scrolls');
  await press(target.querySelector('[data-books-scrolls-edit="ri1"]'), 'the ri1 edit action');
}

async function openChecks() {
  mountManager([], { alchemyConfig: { checkMode: 'simple' } });
  await press(navButton('Checks'), 'Checks');
}

async function openToolEditor(storeOptions = {}) {
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
    ...storeOptions,
  });
  await press(navButton('Gathering'), 'Gathering');
  await press(navButton('Tool Rules'), 'Tool Rules');
  await press(
    target.querySelector(':scope [data-manager-tool-id="tool-catalyst"] [data-tool-edit-rules]'),
    'the tool edit action'
  );
}

async function openTaskEditor(storeOptions = {}) {
  mountManager([], storeOptions);
  await press(navButton('Gathering'), 'Gathering');
  await press(gatheringSubitem('Tasks'), 'Tasks');
  await press(target.querySelector('[aria-label="Edit Gather Moon Herbs"]'), 'the herbs editor');
}

/** Press the header's primary, which submits the editor's form or saves the root's draft. */
async function pressHeaderSave() {
  await press(
    target.querySelector(':scope .manager-header-actions .fabricate-button.is-primary'),
    'the header Save'
  );
}

// One row per editor: how a GM reaches it, the cards its tabs open on (a tab's first card is the
// first match in its panel outside the heading block and the notices), and, where the store double
// can reach one, a run raising the editor's notice, that notice's hook and its position.
const VALIDATION = '[data-editor-validation-surface]';
const EDITORS = {
  [`${MANAGER}/RecipeEditView.svelte`]: {
    open: () => openRecipeEditor([]),
    cards: `[data-recipe-section], ${VALIDATION}`,
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
    position: 'page',
  },
  [`${MANAGER}/RecipeItemEditor.svelte`]: {
    open: () => openRecipeItemEditor(),
    cards:
      '.manager-recipe-item-field, .manager-recipe-item-contents-heading, ' +
      `[data-recipe-item-limits-card], ${VALIDATION}`,
    raise: async () => {
      await openRecipeItemEditor({ saveRecipeItemResult: false });
      await press(target.querySelector('[data-recipe-item-enabled]'), 'the enabled toggle');
      await pressHeaderSave();
    },
    notice: '[data-recipe-item-save-error][role="alert"]',
    position: 'page',
  },
  [`${MANAGER}/ComponentEditView.svelte`]: {
    open: () => openComponentEditor(),
    cards: `.manager-component-rules-card, ${VALIDATION}`,
    raise: async () => {
      await openComponentEditor({ updateComponentResult: false });
      await press(
        target.querySelector('[data-component-edit-tag-toggle="herb"]'),
        'the herb tag toggle'
      );
      await pressHeaderSave();
    },
    notice: '[role="alert"]',
    position: 'page',
  },
  [`${MANAGER}/EssenceEditView.svelte`]: {
    open: () => openEssenceEditor(),
    cards: `.manager-edit-card, .fabricate-card, .fabricate-toggle-card, ${VALIDATION}`,
    raise: async () => {
      await openEssenceEditor({ updateEssenceResult: false });
      setInputValue(target.querySelector('#manager-essence-edit-name'), 'Rain');
      await settle();
      await pressHeaderSave();
    },
    notice: '[role="alert"]',
    position: 'page',
  },
  // The store double's crafting check has no roll formula, so The roll's non-blocking notice is
  // raised on every run of this route.
  [`${MANAGER}/checks/ChecksView.svelte`]: {
    open: openChecks,
    cards: '[data-checks-panel] .fabricate-card, [data-check-triggers]',
    raise: openChecks,
    notice: '[data-checks-section-notice]',
    position: 'stack',
  },
  [`${MANAGER}/SystemEditView.svelte`]: {
    open: async () => {
      mountManager();
      await press(navButton('System Overview'), 'System Overview');
    },
    cards: '.manager-edit-card, [data-system-overview]',
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
    notice: '[data-system-edit-blocker][role="status"]',
    position: 'stack',
  },
  [`${MANAGER}/ToolEditView.svelte`]: {
    open: () => openToolEditor(),
    cards: `[data-tool-system-scope], [data-tool-rule-card], ${VALIDATION}`,
    // A refused save routes to Validation, whose panel states the failure at its head.
    raise: async () => {
      await openToolEditor({ saveToolDraftResult: false, toolDraftSaveError: 'save' });
      setInputValue(target.querySelector('[data-tool-label]'), 'Changed');
      await settle();
      await press(target.querySelector('[data-tool-editor-save]'), 'the Tool Save');
    },
    notice: '[data-tool-save-error][role="alert"]',
    position: 'page',
  },
  // A Direct task whose result set fails validation raises the save-blocking notice on Results.
  [`${MANAGER}/GatheringTaskEditView.svelte`]: {
    open: () => openTaskEditor(),
    cards:
      '.manager-task-core-card, .manager-task-availability-card, .manager-task-results-card, ' +
      `.manager-task-component-browser-card, ${VALIDATION}`,
    raise: async () => {
      await openTaskEditor({
        taskResolutionMode: 'straight',
        gatheringTaskValidation: () => ({
          valid: false,
          errors: ['Direct mode requires exactly one result group'],
          resultErrors: ['Direct mode requires exactly one result group'],
        }),
      });
      await press(target.querySelector('[data-gathering-task-tab="results"]'), 'Results');
    },
    notice: '[data-gathering-task-results-validation][role="alert"]',
    position: 'page',
  },
  [`${MANAGER}/EnvironmentEditView.svelte`]: {
    open: async () => {
      mountManager();
      await press(navButton('Gathering'), 'Gathering');
      await press(gatheringSubitem('Environments'), 'Environments');
      await press(target.querySelector('[aria-label="Edit Quiet Cavern"]'), 'the cavern editor');
    },
    cards: `[data-overview-section], .manager-environment-comp, ${VALIDATION}`,
  },
  [`${MANAGER}/scoped/WorldComponentEntryPage.svelte`]: {
    open: () =>
      openScopedEntry('component', { id: 'vial', name: 'Glass Vial' }, 'component-catalogue'),
    cards: `.fabricate-card, ${VALIDATION}`,
  },
  [`${MANAGER}/scoped/WorldEssenceEntryPage.svelte`]: {
    open: () => openScopedEntry('essence', { id: 'water', name: 'Water' }, 'essence-catalogue'),
    cards: `[data-scoped-entry-identity], ${VALIDATION}`,
  },
  [`${MANAGER}/scoped/WorldToolEntryPage.svelte`]: {
    open: () => openScopedEntry('tool', { id: 'pick', name: 'Mining Pick' }, 'tool-catalogue'),
    cards: `.manager-world-tool-entry-card, [data-world-tool-entry-card], ${VALIDATION}`,
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
 * Every maximal element between the tab bar nearest above the first card and that card, less any
 * that renders nothing. Order and containment are read off the hand walk's preorder: happy-dom
 * proxies a `<form>`, so its descendants' `parentElement`, `contains` and
 * `compareDocumentPosition` misread it.
 */
function gapOf(host, firstCard) {
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
  return ordered.filter(
    (element) =>
      between(element) &&
      !between(parentOf.get(element)) &&
      (element.children.length > 0 || element.textContent.trim() !== '')
  );
}

/** A notice carrying its position, or a position wrapping nothing but notices. */
const isNotice = (element) =>
  element.matches('.fab-notice[data-notice-position]') ||
  (element.matches('[data-notice-position]') &&
    element.children.length > 0 &&
    [...element.children].every((child) => child.matches('.fab-notice')));

const isHeading = (element) => element.hasAttribute('data-tab-heading');

const CALLOUT = '.manager-callout, .manager-checks-mode-callout, .manager-environment-comp-callout';
const NOTICE_LIKE = '.fab-notice, [data-notice-position], [role="alert"], [role="status"]';

/** The gap rule, element by element, naming what it found when it fails. */
function assertGapRule(host, firstCard) {
  const card = typeof firstCard === 'string' ? host.querySelector(firstCard) : firstCard;
  assert.ok(Boolean(card), `the first card ${firstCard} did not render`);
  const maximal = gapOf(host, card);
  const found = `found\n  ${maximal.map(describeElement).join('\n  ')}`;
  const headings = maximal.filter(isHeading);
  const positions = maximal.filter(isNotice).map((notice) => notice.dataset.noticePosition);
  assert.ok(
    maximal.every((element) => isNotice(element) || isHeading(element)),
    `only notices and the heading block sit above the first card; ${found}`
  );
  assert.ok(headings.length <= 1, `one heading block at most; ${found}`);
  for (const heading of headings) {
    assert.ok(
      heading.querySelectorAll(CALLOUT).length <= 1,
      `the heading block holds one callout at most; ${found}`
    );
    assert.ok(!heading.querySelector(NOTICE_LIKE), `no notice inside the heading block; ${found}`);
  }
  assert.ok(
    headings.length === 0 || maximal.findLastIndex(isNotice) < maximal.indexOf(headings[0]),
    `the notices precede the heading block; ${found}`
  );
  assert.ok(
    !positions.includes('stack') || positions.lastIndexOf('page') < positions.indexOf('stack'),
    `the page notice precedes the stacking region; ${found}`
  );
  return maximal;
}

/** The selected tab of the last tab bar whose selection names a rendered panel, and that panel. */
function activeTab(host) {
  const panelOf = (tab) => host.querySelector(`[role="tabpanel"][aria-labelledby="${tab.id}"]`);
  const active = elementsUnder(host)
    .filter((element) => element.getAttribute('role') === 'tablist')
    .map((tabs) => ({ tabs, tab: tabs.querySelector('[role="tab"][aria-selected="true"]') }))
    .findLast(({ tab }) => tab && panelOf(tab));
  assert.ok(Boolean(active), 'no selected tab names a rendered panel');
  return { ...active, panel: panelOf(active.tab) };
}

/** The first of `cards` in the active panel, outside its heading block and its notices. */
function firstCardOf(host, cards) {
  const { tab, panel } = activeTab(host);
  const shielded = new Set(
    elementsUnder(panel).flatMap((element) =>
      isHeading(element) || element.matches('[data-notice-position]')
        ? [element, ...elementsUnder(element)]
        : []
    )
  );
  const card = elementsUnder(panel).find(
    (element) => element.matches(cards) && !shielded.has(element)
  );
  assert.ok(Boolean(card), `${tab.id} renders none of ${cards}`);
  return card;
}

/** Open every tab of the editor's strip in turn, asserting the gap rule on each. */
async function assertGapRuleOnEveryTab(host, cards) {
  const count = activeTab(host).tabs.querySelectorAll('[role="tab"]').length;
  assert.ok(count >= 2, 'the editor offers more than one tab');
  for (let index = 0; index < count; index += 1) {
    const tab = activeTab(host).tabs.querySelectorAll('[role="tab"]')[index];
    await press(tab, `tab ${index}`);
    assert.equal(activeTab(host).tab.id, tab.id, `${tab.id} opens its panel`);
    assertGapRule(host, firstCardOf(host, cards));
  }
}

/** The raised notice, asserted to sit at its editor's notice position, in the named one. */
function assertNoticeAtPosition(host, cards, notice, where) {
  const raised = assertGapRule(host, firstCardOf(host, cards))
    .filter(isNotice)
    .find((element) => element.matches(notice) || element.querySelector(notice));
  assert.ok(Boolean(raised), `${notice} renders at the notice position`);
  assert.equal(raised.dataset.noticePosition, where, `${notice} takes the ${where} position`);
}

const RECIPE = Object.freeze({
  id: 'r1',
  name: 'Elixir',
  ingredientSets: [{ id: 's1', name: 'Set', ingredientGroups: [] }],
  resultGroups: [{ id: 'g1', name: 'Group', results: [] }],
});

const RECIPE_TABS = Object.freeze(['overview', 'ingredients', 'results', 'tools']);
const RECIPE_CARDS = EDITORS[`${MANAGER}/RecipeEditView.svelte`].cards;

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

  it('exempts only importers of the strip, and no module re-exports it', () => {
    const importers = stripImporters(MANAGER);
    for (const path of Object.keys(EXEMPT)) {
      assert.ok(importers.includes(path), `${path} no longer imports the strip; drop it`);
    }
    assert.deepEqual(
      stripImporters('src/ui/svelte').filter((path) => !path.endsWith('.svelte')),
      [],
      'a module re-exporting the strip hides its importers from the derivation'
    );
  });

  for (const [file, editor] of Object.entries(EDITORS)) {
    it(`${file}: only notices and the heading block sit above every tab's first card`, async () => {
      await editor.open();
      await assertGapRuleOnEveryTab(target, editor.cards);
    });

    if (editor.raise) {
      it(`${file}: and its notice renders at its notice position`, async () => {
        await editor.raise();
        assertNoticeAtPosition(target, editor.cards, editor.notice, editor.position);
      });
    }
  }

  async function openEssenceRules(storeOptions = {}) {
    mountManager([], storeOptions);
    store.viewState.update((state) => ({
      ...state,
      worldScope: { ...state.worldScope, essence: worldScopeLeg([{ id: 'water', name: 'Water' }]) },
    }));
    await settle();
    await press(navButton('Essence Rules'), 'Essence Rules');
    await press(
      target.querySelector(':scope [data-essence-id="water"] [data-essence-edit="water"]'),
      'the water edit action'
    );
  }

  it('the essence editor`s world rules tabs head their cards with the shared definition', async () => {
    await openEssenceRules();
    const [heading] = assertGapRule(target, '[data-recipe-section="enabled"]');
    assert.ok(heading?.hasAttribute('data-scoped-shared-definition'), 'the heading is the record');
    await assertGapRuleOnEveryTab(target, EDITORS[`${MANAGER}/EssenceEditView.svelte`].cards);
  });

  it('the essence save-failed notice offers name advice only where the name is editable', async () => {
    const detail = () =>
      target.querySelector(':scope [role="alert"] .fab-notice-detail')?.textContent;
    await EDITORS[`${MANAGER}/EssenceEditView.svelte`].raise();
    assert.match(detail(), /already have this name/, 'the three-tab editor refuses duplicates');
    unmount(mounted);
    target.remove();
    await openEssenceRules({ updateEssenceResult: false });
    await press(target.querySelector('[data-recipe-field="essence-enabled"]'), 'Enabled');
    await pressHeaderSave();
    assert.ok(Boolean(detail()), 'the rules screen raises its notice');
    assert.doesNotMatch(detail(), /name/, 'the rules screen edits no name');
  });

  it('the recipe save-failed notice stays at the notice position on another tab', async () => {
    await EDITORS[`${MANAGER}/RecipeEditView.svelte`].raise();
    await press(target.querySelector('[data-recipe-tab-button="ingredients"]'), 'Ingredients');
    assertNoticeAtPosition(target, RECIPE_CARDS, '[role="alert"]', 'page');
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
      assertGapRule(target, firstCardOf(target, RECIPE_CARDS));
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
