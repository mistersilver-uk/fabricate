/** The manager page header: its trail, identity heading and action ladder, per route (issue 1720). */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick, unmount } from 'svelte';

import { createManagerExtensionsRegistry } from '../../src/ui/managerExtensions.js';
import { useShippedLocalization } from '../helpers/manager/managerLocalization.js';
import { downtimeProvider } from '../helpers/manager/managerStoreFake.js';
import {
  createManagerQueries,
  headerSaveButton,
  setInputValue,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { censusDelta, censusOf, writeCensus } from '../helpers/domCensus.js';
import {
  booksScrollsFixtures,
  managerComponents,
  settleBetweenTests,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;
let store;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const { craftingParent, craftingSubitem, gatheringSubitem, navButton, worldNavItem, worldTravelItem } =
  queries;
const { mountDowntimeManager, mountManager, openRecipeEditor } = createManagerMounts({
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

// ── The page header's rendered DOM, pinned per reachable state (issue 1720) ──────────────────
// The extraction lifts a 1,100-line header out of the root and hands each child its props by
// hand, so the defect it can produce is a correctly-shaped element fed the wrong prop; only a
// census of attribute values sees that. The walk, the delta and the literal writer are
// `tests/helpers/domCensus.js`, shared with the nav rail's census.
const CENSUS_REGENERATE =
  'UPDATE_HEADER_CENSUS=1 node --conditions=browser --test tests/components/manager-mounted.test.js';
const CENSUS_FILE = resolve(import.meta.dirname, 'manager-header-mounted.js');
const CENSUS_NAME = 'header';
// The state every other is pinned as a difference from; it must be the first entry of
// `CENSUS_STATES`, because `writeCensus` emits the baseline before the deltas taken against it.
const CENSUS_BASE_STATE = 'the system library, which is the route a fresh manager opens on';

/** Settle a route move: the guards it awaits, then the effect flush that renders the result. */
async function settleHeader() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;

/**
 * The one `<header>` on screen. The Tool Studio route draws its own, under the same stem plus
 * `manager-tools-context-header`, so the selector reaches both and the count is what says which.
 */
function headerCensus(host) {
  const headers = host.querySelectorAll('header.manager-header');
  assert.equal(headers.length, 1, `the census found ${headers.length} page headers, not one`);
  const lines = censusOf(headers[0]);
  assert.ok(lines.length > 4, `the census walked ${lines.length} elements; the scan broke`);
  return lines;
}

// NAMED world records, one corpus per leg: a heading is about a name, so an id-only corpus is
// mute. `water` matches the in-system essence the store double publishes, which is what puts the
// essence rules editor into its world-backed branch.
const WORLD_ESSENCES = Object.freeze([
  Object.freeze({ id: 'water', name: 'Water', icon: 'fas fa-droplet', colorToken: 'azure' }),
  Object.freeze({ id: 'earth', name: 'Earth' }),
]);
const WORLD_TOOLS = Object.freeze([Object.freeze({ id: 'pick', name: 'Mining Pick' })]);
const WORLD_COMPONENTS = Object.freeze([Object.freeze({ id: 'vial', name: 'Glass Vial' })]);
// The store double publishes an EMPTY event library by default, and an empty library offers no
// row to open the event editor by.
const GATHERING_EVENTS = Object.freeze([
  Object.freeze({ id: 'event-thorns', name: 'Thorn Snare', enabled: true, dropRate: 10 }),
]);
// The two world rules libraries, non-empty and of DIFFERENT sizes, because each page's lede is a
// count of its own library and an equal pair would agree with the other's derivation.
const WORLD_PREREQUISITES = Object.freeze([
  Object.freeze({ id: 'pre-trained', name: 'Trained', path: 'skills.cra.rank', op: 'gte', value: 2 }),
  Object.freeze({ id: 'pre-expert', name: 'Expert', path: 'skills.cra.rank', op: 'gte', value: 4 }),
]);
const WORLD_MODIFIERS = Object.freeze([
  Object.freeze({ id: 'mod-herbalism', label: 'Herbalism', expression: '@skills.nature.value' }),
  Object.freeze({ id: 'mod-forge', label: 'Forge', expression: '@skills.smithing.value' }),
  Object.freeze({ id: 'mod-lore', label: 'Lore', expression: '@skills.arcana.value' }),
]);
// FOUR counts, all different: the hub's lede reads party total, enabled, assigned and the world's
// player characters in one sentence, so equal readings let a swapped thunk pass.
const WORLD_HUB_PARTIES = Object.freeze([
  Object.freeze({
    id: 'party-one',
    name: 'Wayfarers',
    enabled: true,
    memberCount: 1,
    memberActorUuids: Object.freeze(['Actor.member']),
    memberCards: Object.freeze([{ uuid: 'Actor.member', name: 'Mira', img: '', stale: false }]),
    travelActorUuid: 'Actor.marker',
    travelActor: Object.freeze({ uuid: 'Actor.marker', name: 'Mira', img: '' }),
  }),
  ...['party-two', 'party-three', 'party-four'].map((id, index) =>
    Object.freeze({
      id,
      name: `Watch ${index + 1}`,
      // Three more parties, two of them enabled: four parties, three enabled, one character
      // assigned, two player characters in the world.
      enabled: index < 2,
      memberCount: 0,
      memberActorUuids: Object.freeze([]),
      memberCards: Object.freeze([]),
      travelActorUuid: null,
      travelActor: null,
    })
  ),
]);

/**
 * A world-scope leg, in the shape `adminStore` publishes and the root reads: the corpus under
 * `entities`, and one projected `entry` per record carrying the record itself under `entity`.
 */
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

/** Publish a world-scope corpus onto the mounted store, which is how the entry routes get rows. */
async function seedWorldScope(legs) {
  store.viewState.update((state) => ({
    ...state,
    worldScope: { ...state.worldScope, ...legs },
  }));
  await settleHeader();
}

/** Open one world catalogue row's entry editor the way a GM does: rail leaf, then the row's pen. */
async function openScopedEntry(leaf, rowId) {
  worldNavItem(leaf).click();
  await settleHeader();
  const open = target.querySelector(
    `[data-scoped-list-row="${rowId}"] [data-scoped-list-action="open-entry"]`
  );
  assert.ok(Boolean(open), `the ${leaf} catalogue rendered no open-entry action for \`${rowId}\``);
  open.click();
  await settleHeader();
}

/** Open the fixture component's editor from the Component Rules catalogue. */
async function openComponentEditor() {
  navButton('Component Rules').click();
  await settleHeader();
  target.querySelector('[data-component-edit="c1"]').click();
  await settleHeader();
}

/** Open one of World > Rules & Resources' three pages: the rail parent, then its leaf. */
async function openWorldRulesPage(destination) {
  worldNavItem('rules').click();
  await settleHeader();
  target.querySelector(`[data-world-rules-item="${destination}"]`).click();
  await settleHeader();
}

/** Open the selected system's essence rules editor on `water`, from the rail. */
async function openSystemEssenceEditor() {
  navButton('Essence Rules').click();
  await settleHeader();
  target.querySelector('[data-essence-id="water"] [data-essence-edit="water"]').click();
  await settleHeader();
}

/** Land on the Gathering route and switch to one of its rail tabs. */
async function openGatheringTab(label) {
  navButton('Gathering').click();
  await settleHeader();
  gatheringSubitem(label).click();
  await settleHeader();
}

/** Open the fixture gathering task's editor and dirty its name, which is what enables Save. */
async function openGatheringTaskEditor() {
  await openGatheringTab('Tasks');
  target
    .querySelector('[data-gathering-task-id="task-herbs"] [aria-label="Edit Gather Moon Herbs"]')
    .click();
  await settleHeader();
  setInputValue(target.querySelector('[data-gathering-task-field="name"]'), 'Gather Sun Herbs');
  await settleHeader();
}

/** The companion chrome the premium Downtime state is dressed by, drill-down included. */
const COMPANION_CHROME = Object.freeze({
  title: 'Marn the Quartermaster',
  subtitle: 'Crew member · two projects in flight',
  breadcrumb: 'Marn',
  actionsLabel: 'Crew member actions',
  image: 'icons/commodities/treasure/token-gold-gem.webp',
  status: { label: 'Unsaved', tone: 'warning' },
  actions: Object.freeze([
    { id: 'back', label: 'Back to crew', tone: 'ghost', icon: 'fas fa-arrow-left', onSelect: () => {} },
    { id: 'guide', label: 'Guide', href: 'https://example.invalid/guide', icon: 'fas fa-book' },
    { id: 'save', label: 'Save', tone: 'primary', disabled: true, onSelect: () => {} },
  ]),
});

/** Mount the Downtime route over a registered companion, and hand back its mount contexts. */
async function mountCompanionDowntime() {
  const registry = createManagerExtensionsRegistry();
  const mounts = [];
  registry.publicApi.registerWorldNavProvider(
    downtimeProvider({
      prefix: 'Guild',
      ids: ['ledger', 'crew'],
      tab: (id) => ({
        title: `${id} title`,
        subtitle: `${id} subtitle`,
        breadcrumb: `${id} crumb`,
        actionsLabel: `${id} actions`,
        actions: [{ id: 'new', label: 'New entry', tone: 'primary', onSelect: () => {} }],
      }),
      mount: ({ context }) => {
        mounts.push(context);
      },
    })
  );
  mountDowntimeManager([], {}, {}, { managerExtensions: registry });
  worldNavItem('downtime').click();
  await settleHeader();
  assert.equal(mounts.length, 1, 'the companion never mounted, so its chrome is unreachable');
  return mounts;
}

/** A save the store never answers, which is how the saving state holds still to be pinned. */
const NEVER_SETTLES = () => new Promise(() => {});

/** Two errors, so the Save tooltip's join is pinned as a join rather than as one sentence. */
const TASK_INVALID = () => ({
  valid: false,
  errors: ['Name a gathering task', 'Give the task at least one drop'],
  resultErrors: [],
});

const hook = (selector, why) => assert.ok(Boolean(target.querySelector(selector)), why);

/** The heading is what distinguishes the states one route reaches through its own tab strip. */
const titled = (expected, why) =>
  assert.equal(target.querySelector('.manager-title').textContent.trim(), expected, why);

/** And the Save tooltip is what distinguishes a valid draft from a refused one. */
const saveTitled = (expected, why) => assert.equal(headerSaveButton(target).title, expected, why);

/**
 * Every state the header draws, as `{ view, open, prove }`. `view` is asserted against the
 * rendered route token and `prove` against the hook that distinguishes this state from its
 * siblings, BEFORE the census is taken: a navigation that silently went nowhere, or a keystroke
 * that never dirtied a draft, would otherwise freeze one state under another's name and thirty
 * such rows would agree with each other.
 */
const CENSUS_STATES = {
  [CENSUS_BASE_STATE]: {
    view: 'systems',
    open: () => {
      mountManager();
    },
  },
  'Crafting > Recipes, the browse route with its create action': {
    view: 'recipes',
    open: async () => {
      mountManager();
      craftingParent().click();
      await settleHeader();
    },
  },
  'the recipe editor, clean, whose heading names the record rather than the route': {
    view: 'recipe-edit',
    open: async () => {
      await openRecipeEditor([]);
    },
  },
  'the recipe editor with a dirty draft, which adds the unsaved chip': {
    view: 'recipe-edit',
    open: async () => {
      await openRecipeEditor([]);
      setInputValue(target.querySelector('.manager-main [data-recipe-field="name"]'), 'Elixir');
      await settleHeader();
    },
    prove: () => hook('.manager-header-actions .manager-chip', 'the draft never went dirty'),
  },
  'the recipe editor mid-save, which spins its Save glyph': {
    view: 'recipe-edit',
    open: async () => {
      await openRecipeEditor([], { updateRecipeResult: NEVER_SETTLES() });
      setInputValue(target.querySelector('.manager-main [data-recipe-field="name"]'), 'Elixir');
      await settleHeader();
      headerSaveButton(target).click();
      await settleHeader();
    },
    prove: () => hook('.manager-header-actions .fa-spinner', 'the save resolved, so nothing spins'),
  },
  'the recipe item editor, dirty, after a save the store refused': {
    view: 'recipe-item-edit',
    open: async () => {
      mountManager([], {
        experimentalFeaturesEnabled: true,
        recipeItemDefinitions: booksScrollsFixtures,
        saveRecipeItemReject: true,
      });
      craftingParent().click();
      await settleHeader();
      craftingSubitem('Books & Scrolls').click();
      await settleHeader();
      target.querySelector('[data-books-scrolls-edit="ri1"]').click();
      await settleHeader();
      target.querySelector('[data-recipe-item-enabled]').click();
      await settleHeader();
      target.querySelector('[data-recipe-item-save]').click();
      await settleHeader();
    },
    prove: () => hook('[data-recipe-item-save-error]', 'the refused save announced nothing'),
  },
  'Component Rules, whose catalogue action is the 38px icon button': {
    view: 'components',
    open: async () => {
      mountManager();
      navButton('Component Rules').click();
      await settleHeader();
    },
  },
  'the component editor, which draws the shared editor header actions': {
    view: 'component-edit',
    open: async () => {
      mountManager();
      await openComponentEditor();
    },
    prove: () => hook('[data-component-edit-heading]', 'the identity heading did not render'),
  },
  'the component editor with a dirty draft, which adds the unsaved chip and enables Save': {
    view: 'component-edit',
    open: async () => {
      mountManager();
      await openComponentEditor();
      // The component editor has no name field: its identity is the linked item's. Its draft is
      // the tag, category, essence, salvage and complication set, so a tag the fixture does not
      // carry is the shortest edit that dirties it.
      target.querySelector('[data-component-edit-tag-toggle="herb"]').click();
      await settleHeader();
    },
    prove: () => hook('.manager-header-actions .manager-chip', 'the draft never went dirty'),
  },
  'Knowledge, the first of the routes whose action group renders empty': {
    view: 'knowledge',
    open: async () => {
      mountManager([], { experimentalFeaturesEnabled: true });
      craftingParent().click();
      await settleHeader();
      craftingSubitem('Knowledge').click();
      await settleHeader();
    },
  },
  'Tags & Categories, the second empty action group': {
    view: 'tags',
    open: async () => {
      mountManager();
      navButton('Tags & Categories').click();
      await settleHeader();
    },
  },
  'Essence Rules, the third empty action group': {
    view: 'essences',
    open: async () => {
      mountManager();
      navButton('Essence Rules').click();
      await settleHeader();
    },
  },
  'the essence editor on the system rules route, with no world record behind it': {
    view: 'essence-edit',
    open: async () => {
      mountManager();
      await openSystemEssenceEditor();
    },
  },
  'the essence editor with a dirty draft, which adds the unsaved chip and enables Save': {
    view: 'essence-edit',
    open: async () => {
      mountManager();
      await openSystemEssenceEditor();
      setInputValue(target.querySelector('#manager-essence-edit-name'), 'Rain');
      await settleHeader();
    },
    prove: () => hook('[data-essence-edit-dirty]', 'the draft never went dirty'),
  },
  'the essence editor in world rules mode, which heads the screen with the world record': {
    view: 'essence-edit',
    open: async () => {
      mountManager();
      await seedWorldScope({ essence: worldScopeLeg(WORLD_ESSENCES) });
      await openSystemEssenceEditor();
    },
    prove: () => hook('[data-essence-edit-heading]', 'the world rules heading did not render'),
  },
  'Checks, whose Save is disabled until the draft is dirty': {
    view: 'checks-crafting',
    open: async () => {
      mountManager([], { alchemyConfig: { checkMode: 'simple' } });
      navButton('Checks').click();
      await settleHeader();
    },
  },
  'Checks with a staged edit, which adds the unsaved chip and enables Save': {
    view: 'checks-crafting',
    open: async () => {
      mountManager([], { alchemyConfig: { checkMode: 'simple' } });
      navButton('Checks').click();
      await settleHeader();
      target.querySelector('[data-checks-active-toggle]').click();
      await settleHeader();
    },
    prove: () => hook('[data-checks-save]:not([disabled])', 'the toggle staged nothing'),
  },
  'Gathering > Environments, the tab the page titles itself after': {
    view: 'environments',
    open: async () => {
      mountManager();
      navButton('Gathering').click();
      await settleHeader();
    },
    prove: () => titled('Gathering environments', 'the Environments tab never came up'),
  },
  'Gathering > Tasks, the same route under the tab with its own create action': {
    view: 'environments',
    open: async () => {
      mountManager();
      await openGatheringTab('Tasks');
    },
    prove: () => titled('Gathering Tasks', 'the Tasks tab never came up'),
  },
  'Gathering > Events, the encounters tab, whose create action is a different one': {
    view: 'environments',
    open: async () => {
      mountManager([], { gatheringLibraryEvents: [...GATHERING_EVENTS] });
      await openGatheringTab('Events');
    },
    prove: () => titled('Gathering events', 'the Events tab never came up'),
  },
  'the environment editor with a dirty draft, which is where the status pills render': {
    view: 'environment-edit',
    open: async () => {
      mountManager([], { environmentDraftDirty: true });
      navButton('Gathering').click();
      await settleHeader();
      target.querySelector('[aria-label="Edit Quiet Cavern"]').click();
      await settleHeader();
    },
    prove: () => hook('[data-environment-status-pills]', 'the editor drew no status pills'),
  },
  'the gathering task editor, dirty and valid, whose Save carries an empty title': {
    view: 'gathering-task-edit',
    open: async () => {
      mountManager();
      await openGatheringTaskEditor();
    },
    prove: () => saveTitled('', 'the draft never validated, so Save carries its error join'),
  },
  'the gathering task editor whose Save titles itself with the joined validation errors': {
    view: 'gathering-task-edit',
    open: async () => {
      mountManager([], { gatheringTaskValidation: TASK_INVALID });
      await openGatheringTaskEditor();
    },
    prove: () =>
      saveTitled(
        TASK_INVALID().errors.join('\n'),
        'the refused draft left Save untitled'
      ),
  },
  'the gathering event editor, dirty': {
    view: 'gathering-event-edit',
    open: async () => {
      mountManager([], { gatheringLibraryEvents: [...GATHERING_EVENTS] });
      await openGatheringTab('Events');
      target
        .querySelector('[data-gathering-event-id="event-thorns"] [aria-label="Edit Thorn Snare"]')
        .click();
      await settleHeader();
      setInputValue(target.querySelector('[data-gathering-event-field="name"]'), 'Bramble Snare');
      await settleHeader();
    },
    prove: () => hook('.manager-header-actions .manager-chip', 'the draft never went dirty'),
  },
  'the Tool Studio, which is the OTHER header element': {
    view: 'tools',
    open: async () => {
      mountManager();
      navButton('Gathering').click();
      await settleHeader();
      navButton('Tool Rules').click();
      await settleHeader();
    },
    prove: () => hook('[data-tool-library-context]', 'the Tool Studio drew the ordinary header'),
  },
  'the System Overview route, whose trail ends on its own crumb': {
    view: 'system-edit',
    open: async () => {
      mountManager();
      navButton('System Overview').click();
      await settleHeader();
    },
    prove: () => hook('[data-system-edit-back]', 'the route drew no Back to library'),
  },
  'the World hub, whose trail is the bare world crumb': {
    view: 'world',
    open: async () => {
      mountManager([], { travelParties: WORLD_HUB_PARTIES });
      worldNavItem('parties').click();
      await settleHeader();
    },
    prove: () =>
      titled('World Parties', 'the rail did not land on the hub the subtitle counts for'),
  },
  'World > Travel on its realms tab': {
    view: 'world-travel',
    open: async () => {
      mountManager([], { gatheringRealmsEnabled: true });
      worldTravelItem('travel').click();
      await settleHeader();
    },
    prove: () => titled('Realms', 'the realms tab never came up'),
  },
  'World > Travel on its map tab, whose action group renders empty': {
    view: 'world-travel',
    open: async () => {
      mountManager([], { gatheringRealmsEnabled: true });
      worldTravelItem('travel').click();
      await settleHeader();
      worldTravelItem('map').click();
      await settleHeader();
    },
    prove: () => titled('Map Region Links', 'the map tab never came up'),
  },
  'World > Rules & Resources on its currency page, which is outside the actions gate': {
    view: 'world-currency',
    open: async () => {
      mountManager();
      worldNavItem('rules').click();
      await settleHeader();
    },
  },
  'World > Rules & Resources on its character prerequisites page': {
    view: 'world-prerequisites',
    open: async () => {
      mountManager([], { characterPrerequisites: WORLD_PREREQUISITES });
      await openWorldRulesPage('prerequisites');
    },
    prove: () => titled('Character prerequisites', 'the rules rail never reached prerequisites'),
  },
  'World > Rules & Resources on its modifiers page': {
    view: 'world-modifiers',
    open: async () => {
      mountManager([], { modifiers: WORLD_MODIFIERS });
      await openWorldRulesPage('modifiers');
    },
    prove: () => titled('Modifiers', 'the rules rail never reached modifiers'),
  },
  'the world essence catalogue, the one world scoped route back inside the actions gate': {
    view: 'world-essences',
    open: async () => {
      mountManager();
      await seedWorldScope({ essence: worldScopeLeg(WORLD_ESSENCES) });
      worldNavItem('essence-catalogue').click();
      await settleHeader();
    },
  },
  'the world essence entry editor, clean': {
    view: 'world-essence-entry',
    open: async () => {
      mountManager();
      await seedWorldScope({ essence: worldScopeLeg(WORLD_ESSENCES) });
      await openScopedEntry('essence-catalogue', 'water');
    },
    prove: () => hook('[data-world-essence-entry-heading]', 'the entry heading did not render'),
  },
  'the world tool entry editor': {
    view: 'world-tool-entry',
    open: async () => {
      mountManager();
      await seedWorldScope({ tool: worldScopeLeg(WORLD_TOOLS) });
      await openScopedEntry('tool-catalogue', 'pick');
    },
    prove: () => hook('[data-world-tool-entry-heading]', 'the entry heading did not render'),
  },
  'the world component entry editor, unsaved, which draws the dot marker': {
    view: 'world-component-entry',
    open: async () => {
      mountManager();
      await seedWorldScope({ component: worldScopeLeg(WORLD_COMPONENTS) });
      await openScopedEntry('component-catalogue', 'vial');
      setInputValue(target.querySelector('[data-scoped-entry-name]'), 'Cracked Vial');
      await settleHeader();
    },
    prove: () => hook('[data-world-component-entry-unsaved]', 'the entry never went dirty'),
  },
  'World > Downtime on the core fallback, whose action is the premium link': {
    view: 'world-downtime',
    open: async () => {
      mountDowntimeManager();
      worldNavItem('downtime').click();
      await settleHeader();
    },
    prove: () => hook('[data-downtime-unlock]', 'the core fallback drew no premium link'),
  },
  'World > Downtime dressed by a companion drill-down: status chip, link and button': {
    view: 'world-downtime',
    open: async () => {
      const mounts = await mountCompanionDowntime();
      mounts[0].setRouteChrome(COMPANION_CHROME);
      await settleHeader();
    },
    prove: () => hook('[data-downtime-chrome-status]', 'the companion chrome never landed'),
  },
};

const HEADER_CENSUS = Object.freeze({
  /* header-census:start */
  base: [
    "0 header class=\"manager-header\"",
    "1 div class=\"manager-heading\"",
    "2 nav aria-label=\"Breadcrumbs\" class=\"manager-breadcrumbs\"",
    "3 button type=\"button\" | Crafting Systems",
    "2 div class=\"manager-page-kicker\"",
    "3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
    "2 h1 class=\"manager-title\" | Crafting systems",
    "2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
    "1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
    "2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
    "3 span | Import",
    "2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
    "3 span | Export",
    "2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
    "3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
    "3 span | Create",
  ],
  deltas: {
    "Crafting > Recipes, the browse route with its create action": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Crafting",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Recipes",
      "+ 2 h1 class=\"manager-title\" | Recipes",
      "+ 2 p class=\"manager-subtitle\" | Manage recipes for the selected crafting system.",
      "+ 1 div aria-label=\"Recipe actions\" class=\"manager-header-actions\"",
      "- 3 span | Create",
      "+ 3 span | Create recipe",
    ],
    "the recipe editor, clean, whose heading names the record rather than the route": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Crafting",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Recipes",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Healing Draught",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-recipe-edit-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"image\" style=\"width: 44px; height: 44px;\"",
      "+ 4 img alt=\"\" class=\"fab-medallion-img svelte-1jh7cl8\" src=\"icons/consumables/potions/potion-bottle-corked-red.webp\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Healing Draught\" | Healing Draught",
      "+ 4 p class=\"manager-subtitle\" data-recipe-edit-subline=\"\" | potions · Alchemy",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to recipes",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-keyboard-focus=\"true\" title=\"Delete recipe\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete recipe",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save recipe",
    ],
    "the recipe editor with a dirty draft, which adds the unsaved chip": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Crafting",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Recipes",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Elixir",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-recipe-edit-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"image\" style=\"width: 44px; height: 44px;\"",
      "+ 4 img alt=\"\" class=\"fab-medallion-img svelte-1jh7cl8\" src=\"icons/consumables/potions/potion-bottle-corked-red.webp\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Elixir\" | Elixir",
      "+ 4 p class=\"manager-subtitle\" data-recipe-edit-subline=\"\" | potions · Alchemy",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 2 span class=\"manager-chip is-warning is-truncated is-action svelte-1vupdsz\" title=\"Unsaved\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to recipes",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-keyboard-focus=\"true\" title=\"Delete recipe\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete recipe",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save recipe",
    ],
    "the recipe editor mid-save, which spins its Save glyph": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Crafting",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Recipes",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Elixir",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-recipe-edit-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"image\" style=\"width: 44px; height: 44px;\"",
      "+ 4 img alt=\"\" class=\"fab-medallion-img svelte-1jh7cl8\" src=\"icons/consumables/potions/potion-bottle-corked-red.webp\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Elixir\" | Elixir",
      "+ 4 p class=\"manager-subtitle\" data-recipe-edit-subline=\"\" | potions · Alchemy",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 2 span class=\"manager-chip is-warning is-truncated is-action svelte-1vupdsz\" title=\"Unsaved\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-keyboard-focus=\"true\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to recipes",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-keyboard-focus=\"true\" disabled=\"\" title=\"Delete recipe\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete recipe",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-spinner fa-spin\"",
      "+ 3 span | Saving...",
    ],
    "the recipe item editor, dirty, after a save the store refused": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Crafting",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Books & Scrolls",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Alchemist Cook Book\" | Alchemist Cook Book",
      "+ 2 h1 class=\"manager-title\" | Edit recipe item",
      "+ 2 p class=\"manager-subtitle\" | Link a world item and recipes, then set its use and learn caps.",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 2 span class=\"manager-chip is-warning is-truncated is-action svelte-1vupdsz\" data-recipe-item-dirty=\"true\" title=\"Unsaved\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-keyboard-focus=\"true\" data-recipe-item-back=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to Books & Scrolls",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-keyboard-focus=\"true\" data-recipe-item-delete=\"true\" title=\"Delete recipe item\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete recipe item",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" data-recipe-item-save=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save recipe item",
      "+ 2 p class=\"manager-header-save-error\" data-recipe-item-save-error=\"\" role=\"alert\" | Save failed. Try again.",
    ],
    "Component Rules, whose catalogue action is the 38px icon button": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Component Rules",
      "+ 2 h1 class=\"manager-title\" | Component Rules",
      "+ 2 p class=\"manager-subtitle\" | Component rules in Alchemy · Simple salvage · the world category resolves in; tags, essences, salvage and overrides are this system’s own.",
      "+ 1 div aria-label=\"Component actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary is-size-38\" data-component-add-from-catalogue=\"true\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 span | Create",
      "+ 3 span | Add from catalogue",
    ],
    "the component editor, which draws the shared editor header actions": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Component Rules",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Iron Ore",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-component-edit-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"image\" style=\"width: 44px; height: 44px;\"",
      "+ 4 img alt=\"\" class=\"fab-medallion-img svelte-1jh7cl8\" src=\"icons/commodities/metal/ore-chunk-grey.webp\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Iron Ore\" | Iron Ore",
      "+ 4 p class=\"manager-subtitle\" data-component-edit-subline=\"\" | Alchemy rules · Reagent · Simple",
      "+ 1 div aria-label=\"Component actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-component-edit-back=\"\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-component-edit-save=\"\" data-keyboard-focus=\"true\" disabled=\"\" form=\"manager-component-edit-form\" type=\"submit\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save rules",
    ],
    "the component editor with a dirty draft, which adds the unsaved chip and enables Save": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Component Rules",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Iron Ore",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-component-edit-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"image\" style=\"width: 44px; height: 44px;\"",
      "+ 4 img alt=\"\" class=\"fab-medallion-img svelte-1jh7cl8\" src=\"icons/commodities/metal/ore-chunk-grey.webp\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Iron Ore\" | Iron Ore",
      "+ 4 p class=\"manager-subtitle\" data-component-edit-subline=\"\" | Alchemy rules · Reagent · Simple",
      "+ 1 div aria-label=\"Component actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning svelte-1vupdsz\" data-component-edit-dirty=\"\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-component-edit-back=\"\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-component-edit-save=\"\" data-keyboard-focus=\"true\" form=\"manager-component-edit-form\" type=\"submit\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save rules",
    ],
    "Knowledge, the first of the routes whose action group renders empty": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Crafting",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Knowledge",
      "+ 2 h1 class=\"manager-title\" | Knowledge",
      "+ 2 p class=\"manager-subtitle\" | Audit and correct what each character carries and has learned in the selected crafting system.",
      "+ 1 div aria-label=\"Knowledge actions\" class=\"manager-header-actions\"",
    ],
    "Tags & Categories, the second empty action group": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Tags & Categories",
      "+ 2 h1 class=\"manager-title\" | Tags & Categories",
      "+ 2 p class=\"manager-subtitle\" | Manage recipe category and item tag vocabulary for the selected crafting system.",
      "+ 1 div aria-label=\"Tags and categories actions\" class=\"manager-header-actions\"",
    ],
    "Essence Rules, the third empty action group": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Essence Rules",
      "+ 2 h1 class=\"manager-title\" | Essence Rules",
      "+ 2 p class=\"manager-subtitle\" | What each essence does on craft in Alchemy. Disabling stops the crafting effect — ingredient matching still sees the value. Names, icons and colours come from the Essence Catalogue.",
      "+ 1 div aria-label=\"Essence actions\" class=\"manager-header-actions\"",
    ],
    "the essence editor on the system rules route, with no world record behind it": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Essence Rules",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Water\" | Water",
      "+ 2 h1 class=\"manager-title\" | Edit essence",
      "+ 2 p class=\"manager-subtitle\" | Update identity, icon, and source linkage for this essence.",
      "+ 1 div aria-label=\"Essence actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-essence-edit-back=\"\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-essence-edit-save=\"\" data-keyboard-focus=\"true\" disabled=\"\" form=\"manager-essence-edit-form\" type=\"submit\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save essence",
    ],
    "the essence editor with a dirty draft, which adds the unsaved chip and enables Save": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Essence Rules",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Rain\" | Rain",
      "+ 2 h1 class=\"manager-title\" | Edit essence",
      "+ 2 p class=\"manager-subtitle\" | Update identity, icon, and source linkage for this essence.",
      "+ 1 div aria-label=\"Essence actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning svelte-1vupdsz\" data-essence-edit-dirty=\"\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-essence-edit-back=\"\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-essence-edit-save=\"\" data-keyboard-focus=\"true\" form=\"manager-essence-edit-form\" type=\"submit\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save essence",
    ],
    "the essence editor in world rules mode, which heads the screen with the world record": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Essence Rules",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Water\" | Water",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-essence-edit-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"glyph\" style=\"width: 44px; height: 44px; --fab-medallion-glyph: 22px;\"",
      "+ 4 i aria-hidden=\"true\" class=\"fas fa-droplet svelte-1jh7cl8\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Water\" | Water",
      "+ 4 p class=\"manager-subtitle\" data-essence-edit-subline=\"\" | Alchemy rules · disabled",
      "+ 1 div aria-label=\"Essence actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-essence-edit-back=\"\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-essence-edit-save=\"\" data-keyboard-focus=\"true\" disabled=\"\" form=\"manager-essence-edit-form\" type=\"submit\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save rules",
    ],
    "Checks, whose Save is disabled until the draft is dirty": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Checks",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Crafting",
      "+ 2 h1 class=\"manager-title\" | Crafting check",
      "+ 2 p class=\"manager-subtitle\" | Configure how crafting, salvage, and gathering attempts are checked for the selected crafting system.",
      "+ 1 div aria-label=\"Checks actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-checks-save=\"true\" data-keyboard-focus=\"true\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save checks",
    ],
    "Checks with a staged edit, which adds the unsaved chip and enables Save": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Checks",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Crafting",
      "+ 2 h1 class=\"manager-title\" | Crafting check",
      "+ 2 p class=\"manager-subtitle\" | Configure how crafting, salvage, and gathering attempts are checked for the selected crafting system.",
      "+ 1 div aria-label=\"Checks actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning is-action svelte-1vupdsz\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-checks-save=\"true\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save checks",
    ],
    "Gathering > Environments, the tab the page titles itself after": [
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-gathering-tab=\"environments\" | Environments",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Alchemy",
      "+ 2 h1 class=\"manager-title\" | Gathering environments",
      "+ 2 p class=\"manager-subtitle\" | Browse scene-linked gathering environments and open the existing editor for task authoring.",
      "+ 1 div aria-label=\"Environment actions\" class=\"manager-header-actions\"",
      "- 3 span | Create",
      "+ 3 span | Create environment",
    ],
    "Gathering > Tasks, the same route under the tab with its own create action": [
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-gathering-tab=\"tasks\" | Tasks",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Alchemy",
      "+ 2 h1 class=\"manager-title\" | Gathering Tasks",
      "+ 2 p class=\"manager-subtitle\" | Browse gathering tasks before attaching them to environments.",
      "+ 1 div aria-label=\"Gathering task actions\" class=\"manager-header-actions\"",
      "- 3 span | Create",
      "+ 3 span | Create gathering task",
    ],
    "Gathering > Events, the encounters tab, whose create action is a different one": [
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-gathering-tab=\"encounters\" | Events",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Alchemy",
      "+ 2 h1 class=\"manager-title\" | Gathering events",
      "+ 2 p class=\"manager-subtitle\" | Browse reusable events before attaching them to environments.",
      "+ 1 div aria-label=\"Environment actions\" class=\"manager-header-actions\"",
      "- 3 span | Create",
      "+ 3 span | Create gathering event",
    ],
    "the environment editor with a dirty draft, which is where the status pills render": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Environments",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Quiet Cavern\" | Quiet Cavern",
      "+ 2 h1 class=\"manager-title\" | Edit environment",
      "+ 2 p class=\"manager-subtitle\" | Edit scene linkage, identity, tasks, events, tools, and validation for the selected environment.",
      "+ 2 div class=\"manager-environment-header-pills\" data-environment-status-pills=\"\"",
      "+ 3 span class=\"manager-chip is-neutral svelte-1vupdsz\" data-status-pill=\"active\" | Off",
      "+ 3 span class=\"manager-chip is-info svelte-1vupdsz\" data-status-pill=\"selection\" | Blind",
      "+ 3 span class=\"manager-chip is-info svelte-1vupdsz\" data-status-pill=\"composition\" | Automatic",
      "+ 1 div aria-label=\"Environment actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-environment-edit-back=\"true\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to environments",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-action=\"delete-environment\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete environment",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save",
    ],
    "the gathering task editor, dirty and valid, whose Save carries an empty title": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Tasks",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Gather Sun Herbs\" | Gather Sun Herbs",
      "+ 2 h1 class=\"manager-title\" | Edit gathering task",
      "+ 2 p class=\"manager-subtitle\" | Edit identity, availability, resolution, and results for the selected gathering task.",
      "+ 1 div aria-label=\"Environment actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning is-action svelte-1vupdsz\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-gathering-task-back=\"true\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to task library",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-gathering-task-delete=\"true\" data-keyboard-focus=\"true\" title=\"Delete gathering task\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete gathering task",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" title=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save task",
    ],
    "the gathering task editor whose Save titles itself with the joined validation errors": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Tasks",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Gather Sun Herbs\" | Gather Sun Herbs",
      "+ 2 h1 class=\"manager-title\" | Edit gathering task",
      "+ 2 p class=\"manager-subtitle\" | Edit identity, availability, resolution, and results for the selected gathering task.",
      "+ 1 div aria-label=\"Environment actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning is-action svelte-1vupdsz\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-gathering-task-back=\"true\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to task library",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-gathering-task-delete=\"true\" data-keyboard-focus=\"true\" title=\"Delete gathering task\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete gathering task",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" disabled=\"\" title=\"Name a gathering task\\nGive the task at least one drop\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save task",
    ],
    "the gathering event editor, dirty": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Gathering",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Events",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span title=\"Bramble Snare\" | Bramble Snare",
      "+ 2 h1 class=\"manager-title\" | Edit gathering event",
      "+ 2 p class=\"manager-subtitle\" | Edit identity, availability, danger, and modifiers for the selected event.",
      "+ 1 div aria-label=\"Environment actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning is-action svelte-1vupdsz\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-gathering-event-back=\"true\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to event library",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-danger\" data-keyboard-focus=\"true\" title=\"Delete event\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete event",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" title=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-save\"",
      "+ 3 span | Save event",
    ],
    "the Tool Studio, which is the OTHER header element": [
      "- 0 header class=\"manager-header\"",
      "+ 0 header class=\"manager-header manager-tools-context-header\" data-tool-library-context=\"\"",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Tool Rules",
      "+ 2 h1 class=\"manager-title\" | Tool Rules",
      "+ 2 p class=\"manager-subtitle\" | Which Tools this system uses, and where it departs from the world defaults. Identity, art and description stay in the world catalogue.",
    ],
    "the System Overview route, whose trail ends on its own crumb": [
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button type=\"button\" | Alchemy",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | System Overview",
      "+ 2 h1 class=\"manager-title\" | Alchemy",
      "+ 2 p class=\"manager-subtitle\" | Edit base settings and review validation issues for the selected crafting system.",
      "+ 1 div aria-label=\"System edit actions\" class=\"manager-header-actions\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-ghost\" data-keyboard-focus=\"true\" data-system-edit-back=\"true\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to systems",
    ],
    "the World hub, whose trail is the bare world crumb": [
      "- 3 button type=\"button\" | Crafting Systems",
      "+ 3 span data-breadcrumb-world=\"\" | World",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | WORLD / every system",
      "+ 2 h1 class=\"manager-title\" | World Parties",
      "+ 2 p class=\"manager-subtitle\" | 4 parties · 3 enabled · 1 of 2 characters assigned",
      "+ 1 div aria-label=\"World party actions\" class=\"manager-header-actions\"",
      "- 3 span | Create",
      "+ 3 span | New party",
    ],
    "World > Travel on its realms tab": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Travel",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-travel-tab=\"realms\" | Realms",
      "+ 2 h1 class=\"manager-title\" | Realms",
      "+ 2 p class=\"manager-subtitle\" | Author the world’s realms · shared by every crafting system that enables Travel & Realms.",
      "+ 1 div aria-label=\"Realm actions\" class=\"manager-header-actions\"",
      "- 3 span | Create",
      "+ 3 span | Create realm",
    ],
    "World > Travel on its map tab, whose action group renders empty": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Travel",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-travel-tab=\"map\" | Map Region Links",
      "+ 2 h1 class=\"manager-title\" | Map Region Links",
      "+ 2 p class=\"manager-subtitle\" | Link the active scene’s Foundry Scene Regions to the world’s realms.",
      "+ 1 div aria-label=\"Map region link actions\" class=\"manager-header-actions\"",
    ],
    "World > Rules & Resources on its currency page, which is outside the actions gate": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Rules & Resources",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-rules-tab=\"currency\" | World Currency",
      "+ 2 h1 class=\"manager-title\" | World Currency",
      "+ 2 p class=\"manager-subtitle\" | No coins yet · world-level, shared by every crafting system that enables currency",
    ],
    "World > Rules & Resources on its character prerequisites page": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Rules & Resources",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-rules-tab=\"prerequisites\" | Character prerequisites",
      "+ 2 h1 class=\"manager-title\" | Character prerequisites",
      "+ 2 p class=\"manager-subtitle\" | 2 prerequisites · shared by every crafting system",
    ],
    "World > Rules & Resources on its modifiers page": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Rules & Resources",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-rules-tab=\"modifiers\" | Modifiers",
      "+ 2 h1 class=\"manager-title\" | Modifiers",
      "+ 2 p class=\"manager-subtitle\" | 3 modifiers · shared by every crafting system",
    ],
    "the world essence catalogue, the one world scoped route back inside the actions gate": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-scoped=\"world-essences\" | Essence Catalogue",
      "+ 2 h1 class=\"manager-title\" | Essence Catalogue",
      "+ 2 p class=\"manager-subtitle\" | One definition per quality — name, icon, colour. What an essence does on craft is set by rules in each system that uses it.",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" data-world-essence-create=\"true\" type=\"button\"",
      "- 3 span | Create",
      "+ 3 span | New essence",
    ],
    "the world essence entry editor, clean": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button data-breadcrumb-world-scoped-catalogue=\"world-essences\" type=\"button\" | Essence Catalogue",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-scoped=\"world-essence-entry\" title=\"Water\" | Water",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-world-essence-entry-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"glyph\" data-medallion-tint=\"azure\" style=\"width: 44px; height: 44px; --fab-medallion-glyph: 22px; --fab-medallion-tint: var(--fab-tag-azure);\"",
      "+ 4 i aria-hidden=\"true\" class=\"fas fa-droplet svelte-1jh7cl8\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Water\" | Water",
      "+ 4 p class=\"manager-subtitle\" data-world-essence-entry-subline=\"\" | World definition · used by 1 of 1 systems",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-world-essence-back=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" data-world-essence-save=\"\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-floppy-disk\"",
      "+ 3 span | Save essence",
    ],
    "the world tool entry editor": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button data-breadcrumb-world-scoped-catalogue=\"world-tools\" type=\"button\" | Tools Catalogue",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-scoped=\"world-tool-entry\" title=\"Mining Pick\" | Mining Pick",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-world-tool-entry-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"glyph\" style=\"width: 44px; height: 44px; --fab-medallion-glyph: 22px;\"",
      "+ 4 i aria-hidden=\"true\" class=\"fas fa-screwdriver-wrench svelte-1jh7cl8\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Mining Pick\" | Mining Pick",
      "+ 4 p class=\"manager-subtitle\" data-world-tool-entry-subline=\"\" | No Item linked",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-world-tool-back=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to tools",
      "+ 2 button aria-label=\"Delete Mining Pick from the world catalogue — Removes it from the world catalogue and from the 1 crafting system that has it.\" class=\"fabricate-button manager-button is-danger\" data-arm-token=\"world-tool-delete:pick\" data-armed=\"false\" data-busy=\"false\" title=\"Delete Mining Pick from the world catalogue — Removes it from the world catalogue and from the 1 crafting system that has it.\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-trash\"",
      "+ 3 span | Delete",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" data-world-tool-save=\"\" disabled=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-floppy-disk\"",
      "+ 3 span | Save tool",
    ],
    "the world component entry editor, unsaved, which draws the dot marker": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 button data-breadcrumb-world-scoped-catalogue=\"world-components\" type=\"button\" | Component catalogue",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-world-scoped=\"world-component-entry\" title=\"Cracked Vial\" | Cracked Vial",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-world-component-entry-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8 is-glyph-chip\" data-medallion=\"glyph\" style=\"width: 42px; height: 42px; --fab-medallion-glyph: 22px;\"",
      "+ 4 i aria-hidden=\"true\" class=\"fas fa-cube svelte-1jh7cl8\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Cracked Vial\" | Cracked Vial",
      "+ 4 p class=\"manager-subtitle\" data-world-component-entry-subline=\"\" | No source item · rules in 1 of 1 systems",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 2 span class=\"manager-header-unsaved\" data-world-component-entry-unsaved=\"\" | Unsaved changes",
      "+ 3 span aria-hidden=\"true\" class=\"manager-header-unsaved-dot\"",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-world-component-back=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back",
      "+ 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" data-world-component-save=\"\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-floppy-disk\"",
      "+ 3 span | Save entry",
    ],
    "World > Downtime on the core fallback, whose action is the premium link": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Downtime",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-downtime-tab=\"tracking\" | Tracking",
      "+ 2 h1 class=\"manager-title\" | Downtime tracking",
      "+ 2 p class=\"manager-subtitle\" | Fabricate Premium · Your party-wide command board for every activity and shared project.",
      "+ 1 div aria-label=\"Downtime actions\" class=\"manager-header-actions\"",
      "+ 2 a class=\"fabricate-button manager-button fab-manager-button manager-downtime-unlock\" data-downtime-unlock=\"true\" data-keyboard-focus=\"true\" href=\"https://www.patreon.com/c/mistersilver\" rel=\"noopener noreferrer\" target=\"_blank\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-crown\"",
      "+ 3 span | Unlock with Premium",
    ],
    "World > Downtime dressed by a companion drill-down: status chip, link and button": [
      "- 3 button type=\"button\" | Crafting Systems",
      "- 2 div class=\"manager-page-kicker\"",
      "- 3 p class=\"fab-kicker svelte-q4je4u\" data-page-kicker=\"\" | Browse",
      "- 2 h1 class=\"manager-title\" | Crafting systems",
      "- 2 p class=\"manager-subtitle\" | Select a row to view counts and enabled features.",
      "- 1 div aria-label=\"System actions\" class=\"manager-header-actions\"",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" data-manager-import-system=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-import\"",
      "- 3 span | Import",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-file-export\"",
      "- 3 span | Export",
      "- 2 button class=\"fabricate-button manager-button fab-manager-button is-primary\" data-keyboard-focus=\"true\" type=\"button\"",
      "- 3 i aria-hidden=\"true\" class=\"fas fa-plus\"",
      "- 3 span | Create",
      "+ 3 button data-breadcrumb-world=\"\" type=\"button\" | World",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span | Downtime",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-downtime-tab=\"ledger\" | ledger crumb",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-chevron-right\"",
      "+ 3 span data-breadcrumb-downtime-leaf=\"\" | Marn",
      "+ 2 div class=\"manager-recipe-edit-heading\" data-downtime-chrome-heading=\"\"",
      "+ 3 span class=\"fab-medallion svelte-1jh7cl8\" data-medallion=\"image\" style=\"width: 44px; height: 44px;\"",
      "+ 4 img alt=\"\" class=\"fab-medallion-img svelte-1jh7cl8\" src=\"icons/commodities/treasure/token-gold-gem.webp\"",
      "+ 3 div class=\"manager-recipe-edit-heading-copy\"",
      "+ 4 h1 class=\"manager-title\" title=\"Marn the Quartermaster\" | Marn the Quartermaster",
      "+ 4 p class=\"manager-subtitle\" data-downtime-chrome-subline=\"\" | Crew member · two projects in flight",
      "+ 1 div aria-label=\"Crew member actions\" class=\"manager-header-actions\"",
      "+ 2 span class=\"manager-chip is-warning is-truncated is-action svelte-1vupdsz\" data-downtime-chrome-status=\"true\" title=\"Unsaved\" | Unsaved",
      "+ 2 button class=\"fabricate-button manager-button is-ghost\" data-manager-header-action=\"back\" type=\"button\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-arrow-left\"",
      "+ 3 span | Back to crew",
      "+ 2 a class=\"fabricate-button manager-button\" data-manager-header-action=\"guide\" href=\"https://example.invalid/guide\" rel=\"noopener noreferrer\" target=\"_blank\"",
      "+ 3 i aria-hidden=\"true\" class=\"fas fa-book\"",
      "+ 3 span | Guide",
      "+ 2 button class=\"fabricate-button manager-button is-primary\" data-manager-header-action=\"save\" disabled=\"\" type=\"button\"",
      "+ 3 span | Save",
    ],
  },
  /* header-census:end */
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerHeaderCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    store = null;
    await settleBetweenTests();
  });

  it('emits the same page-header DOM, attribute for attribute, in each of its states', async () => {
    const censuses = {};
    for (const [state, { view, open, prove }] of Object.entries(CENSUS_STATES)) {
      useShippedLocalization();
      await open();
      assert.equal(managerView(), view, `"${state}" landed on the wrong route`);
      prove?.();
      censuses[state] = headerCensus(target);
      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
      store = null;
    }

    const base = censuses[CENSUS_BASE_STATE];
    const observed = {
      base,
      deltas: Object.fromEntries(
        Object.entries(censuses)
          .filter(([state]) => state !== CENSUS_BASE_STATE)
          .map(([state, census]) => [state, censusDelta(base, census)])
      ),
    };

    if (process.env.UPDATE_HEADER_CENSUS) {
      writeCensus(CENSUS_FILE, CENSUS_NAME, observed);
      return;
    }
    assert.deepEqual(
      observed,
      HEADER_CENSUS,
      'the page header’s emitted DOM moved. This change is behaviour-preserving, so the expected ' +
        'answer is that nothing did. If it moved deliberately, re-derive the literal with ' +
        `${CENSUS_REGENERATE} and say in the commit what moved and why.`
    );
  });
}
