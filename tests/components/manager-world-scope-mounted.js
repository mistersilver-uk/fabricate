/** The world-scope routes: Parties, Travel, the scoped-entity leaves and the published corpus. */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { dispatchDrop } from '../helpers/dropPayloads.js';
// The capture registry, so the two cases pinned below assert their OWN selectors rather
// than a copy of them that is free to drift from the case it claims to guard.
import { VIEW_LAB_CASES } from '../../scripts/lib/viewLabCases.js';
import { railCounts as sharedRailCounts } from '../helpers/validationSurfaceReadings.js';
// The REAL manager store and its shipped service fixtures (issue 1362). The world-scope
// propagation block at the foot of this file drives the actual publish path rather than a
// hand-written `viewState`, because what it has to prove is that `adminStore` publishes the
// world corpus on every trigger — which a fake store would assert about itself.
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from '../helpers/adminStoreServices.js';
// Issue 1504: a converted control is a shared `<Select>`.
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionLabels,
  selectOptionValues,
} from '../helpers/select-control.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import { createManagerQueries, setInputValue } from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import {
  labCaseSelector,
  managerComponents,
  parseUuidDouble,
  settle,
  settleBetweenTests,
  settleRouteExit,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  gatheringSubitem,
  navButton,
  openChecksActivity,
  openChecksSection,
  switchScopeSystemTo,
  worldNavItem,
  worldTravelItem,
} = queries;
const { mountManager, mountWorldRulesDestination } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});
const railCounts = () => sharedRailCounts(target);

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerWorldScopeCases() {
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
    await settleBetweenTests();
  });


  // The card moved to World > Rules & Resources > Character prerequisites in issue 1311.
  it('World prerequisites page renders an icon picker left of the name input (issue 544)', async () => {
    await mountWorldRulesDestination(
      {
        characterPrerequisites: [
          {
            id: 'p1',
            name: 'Proficient in Arcana',
            icon: 'fa-solid fa-hat-wizard',
            path: 'skills.arc.prof.multiplier',
            op: 'gte',
            value: 1,
          },
        ],
      },
      'prerequisites'
    );
    const card = target.querySelector('[data-world-character-prerequisites]');
    assert.ok(card, 'the prerequisites card renders');
    // Expand the item, then the name row exposes the icon field (with the searchable
    // IconPicker trigger) before the name input.
    card.querySelector('[data-toggle-prerequisite]').click();
    flushSync();
    const iconField = target.querySelector('[data-prerequisite-icon-field]');
    assert.ok(iconField, 'the icon field renders in the expanded editor');
    assert.ok(
      iconField.querySelector('.manager-prerequisite-icon-trigger'),
      'the icon field renders the searchable IconPicker trigger'
    );
    // Icon field precedes the name input within the name row (icon is to the left).
    const row = target.querySelector('.manager-prerequisite-name-row');
    const nameInput = row.querySelector('[data-prerequisite-name]');
    assert.ok(
      iconField.compareDocumentPosition(nameInput) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the icon field comes before the name input'
    );
  });

  // The four World > Parties capture cases (issue 1182). Each asserts a RELATIONSHIP.
  const LAB_MIRROR_ACTORS = [
    {
      uuid: 'Actor.lab-actor-brenna',
      name: 'Brenna Karrunsdottir',
      img: '',
      isPlayerCharacter: true,
    },
    { uuid: 'Actor.lab-actor-idrin', name: 'Idrin Ashfall', img: '', isPlayerCharacter: true },
    { uuid: 'Actor.lab-actor-vosk', name: 'Vosk', img: '', isPlayerCharacter: true },
    // The vehicle. Not a player character, so neither picker offers it.
    { uuid: 'Actor.lab-actor-wagon', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
  ];
  const labMirrorParty = (id, name, enabled, memberUuids, travelActorUuid) => ({
    id,
    name,
    enabled,
    memberCount: memberUuids.length,
    memberActorUuids: memberUuids,
    memberCards: memberUuids.map((uuid) => ({
      uuid,
      // `?? uuid` rather than a bare `.name`.
      name: LAB_MIRROR_ACTORS.find((actor) => actor.uuid === uuid)?.name ?? uuid,
      img: '',
      stale: false,
    })),
    travelActorUuid,
    travelActor: travelActorUuid
      ? LAB_MIRROR_ACTORS.find((actor) => actor.uuid === travelActorUuid)
      : null,
  });
  const characters = LAB_MIRROR_ACTORS.slice(0, 3).map((actor) => actor.uuid);
  const LAB_MIRROR_PARTIES = [
    labMirrorParty('lab-party', 'The Ashfall Company', true, characters, 'Actor.lab-actor-vosk'),
    labMirrorParty('lab-party-long-haul', 'The Long Haul', true, [], 'Actor.lab-actor-wagon'),
    labMirrorParty(
      'lab-party-emberwatch',
      'Emberwatch Foragers',
      false,
      characters.slice(0, 2),
      'Actor.lab-actor-brenna'
    ),
    labMirrorParty('lab-party-second-kiln', 'Second Kiln Crew', false, [], null),
    labMirrorParty(
      'lab-party-wagonwright',
      'The Wagonwright Circle',
      false,
      characters.slice(2),
      null
    ),
  ];

  async function openLabMirrorParties(travelParties = LAB_MIRROR_PARTIES) {
    mountManager([], {
      gatheringRealmsEnabled: true,
      travelParties,
      actorOptions: LAB_MIRROR_ACTORS,
    });
    worldNavItem('parties').click();
    await tick();
    flushSync();
    return target;
  }

  it('root: the World Parties capture cases satisfy their own selectors (issue 1182)', async () => {
    // Empty, with its negative control first.
    const empty = labCaseSelector('manager-world-parties-empty');
    await openLabMirrorParties();
    assert.ok(
      !target.querySelector(empty),
      'five seeded parties must not also render the no-parties panel'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    await openLabMirrorParties([]);
    assert.ok(
      Boolean(target.querySelector(empty)),
      'the no-parties pane must render the SHARED EmptyState primitive, not a bespoke panel'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    // Search, with its negative control first: unfiltered.
    // the fifth of five at a page size of four, so they are never siblings in one list.
    const filtered = labCaseSelector('manager-world-parties-search-filtered');
    await openLabMirrorParties();
    assert.ok(
      !target.querySelector(filtered),
      'unfiltered, the last-page card is not on the page at all — so an unfiltered frame ' +
        'cannot be published under the filtered case'
    );
    // The term is READ FROM THE CASE's own step, not restated.
    const searchStep = VIEW_LAB_CASES.find(
      (entry) => entry.id === 'manager-world-parties-search-filtered'
    ).steps.at(-1);
    assert.equal(searchStep.selector, '[data-manager-party-search]');
    setInputValue(target.querySelector(searchStep.selector), searchStep.fill);
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector(filtered)),
      'searching "wagon" must leave exactly the party named for it and the one whose TRAVEL ' +
        'ACTOR is named for it — the widened filter domain this case exists to photograph'
    );
    assert.equal(
      target.querySelector('[data-manager-party-match-count]').textContent.trim(),
      '2 of 5'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    // Last page.
    const lastPage = labCaseSelector('manager-world-parties-last-page');
    await openLabMirrorParties();
    assert.ok(
      !target.querySelector(lastPage),
      'page one holds the first card, which the case refuses'
    );
    target.querySelector('.manager-travel-parties [data-pagination-next]').click();
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector(lastPage)),
      'five records at a page size of three put the trailing two on page two'
    );
    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;

    // Travel-actor picker. `SearchablePopover` portals into the nearest `.fabricate-manager`,
    // which the mounted root renders inside `target`, so the case's selector runs verbatim.
    const picker = labCaseSelector('manager-world-parties-actor-picker');
    await openLabMirrorParties();
    assert.ok(
      !target.querySelector(picker),
      'the closed picker is the frame this case must not be able to publish'
    );
    target.querySelector('[data-manager-party-actor-trigger="lab-party"]').click();
    await tick();
    flushSync();
    assert.ok(
      Boolean(target.querySelector(picker)),
      'the open picker must carry its title/count metadata and an option meta line while ' +
        'omitting the picker unlink footer; the persistent on-screen unlink button remains ' +
        'the linked party action that surfaces a composite-uniqueness collision before the pick fails'
    );
  });

  it('returns to the first page and the top of the party scroller when the page size changes', async () => {
    await openLabMirrorParties();
    const parties = target.querySelector('.manager-travel-parties');
    const scroller = parties.querySelector('.manager-travel-parties-content');
    const pagination = parties.querySelector('[data-manager-party-pagination]');

    parties.querySelector('[data-pagination-next]').click();
    scroller.scrollTop = 160;
    await tick();
    flushSync();
    assert.equal(
      pagination.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 2 of 2',
      'precondition: the last party is on the later default-size page'
    );
    assert.equal(scroller.scrollTop, 160, 'precondition: the party scroller has moved');

    // Rooted on `target` rather than on `pagination`.
    chooseSelectOption(target, '[data-pagination-size]', 6);
    await tick();
    flushSync();

    assert.equal(
      pagination.querySelector('[data-pagination-page]').textContent.trim(),
      'Page 1 of 1',
      'a page-size mutation always returns the party list to its first page'
    );
    // The load-bearing half. The walk left the pane on page TWO.
    assert.ok(
      Boolean(parties.querySelector('[data-manager-travel-party-id="lab-party"]')),
      'the first-page party is rendered again'
    );
    assert.equal(scroller.scrollTop, 0, 'the party scroller returns to its top');
  });

  it('renders permanent World Parties, Travel and Currency entries', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          gatheringRealmsEnabled: true,
          // The World nav's Downtime entry is experimental-gated (issue 1257).
          experimentalFeaturesEnabled: true,
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    const world = target.querySelector('[data-world-nav-section]');
    assert.ok(world, 'World always renders');
    assert.equal(world.querySelector('#manager-world-heading').textContent.trim(), 'WORLD');
    assert.equal(world.querySelector('#manager-world-scope').textContent.trim(), 'every system');
    assert.deepEqual(
      Array.from(world.querySelectorAll('[data-world-nav-item]')).map((item) => item.id),
      // Parties, Travel and Rules & Resources are all permanent World entries (issues 1182, 1278,
      // 1282, 1311); Downtime is the experimental-gated one. Currency is no longer a top-level
      // entry — it is the first destination inside the Rules & Resources group, beside the two
      // character libraries.
      [
        // The four scoped-entity leaves (issue 1362), above Parties in the prototype's order.
        'manager-world-nav-component-catalogue',
        'manager-world-nav-vocabulary',
        'manager-world-nav-essence-catalogue',
        'manager-world-nav-tool-catalogue',
        'manager-world-nav-parties',
        'manager-world-nav-travel',
        'manager-world-nav-rules',
        'manager-world-nav-downtime',
      ]
    );
    assert.ok(worldNavItem('parties').querySelector('.fa-users'));
    assert.ok(worldNavItem('downtime').querySelector('.fa-hourglass-half'));
    assert.ok(worldTravelItem('travel').querySelector('.fa-route'));
    assert.equal(
      worldNavItem('parties').querySelector('.manager-nav-count').textContent.trim(),
      '2'
    );
    assert.ok(!gatheringSubitem('Travel'), 'Travel is a top-level sibling, not a Gathering child');
    assert.equal(worldNavItem('parties').getAttribute('aria-label'), 'Parties');
    // EVERY WORLD LEAF CARRIES AN EXPLICIT ACCESSIBLE NAME AND ITS OWN COUNT (issue 1362).
    for (const [item, label] of [
      ['component-catalogue', 'Component catalogue'],
      ['vocabulary', 'Tags & Categories'],
      ['essence-catalogue', 'Essence Catalogue'],
      ['tool-catalogue', 'Tools Catalogue'],
    ]) {
      const leaf = worldNavItem(item);
      assert.ok(Boolean(leaf), `the world rail renders the ${item} leaf`);
      assert.equal(
        leaf.getAttribute('aria-label'),
        label,
        `${item} needs an explicit accessible name: the collapsed rail hides its label and its ` +
          'count, so without one the button is unnamed at 56px'
      );
      assert.ok(
        Boolean(leaf.querySelector('.manager-nav-count')),
        `${item} needs its own count badge, as every other World entry has — and it cannot be ` +
          'added later, because spec requirement 7 closes this file to every later PR'
      );
    }
    assert.equal(
      worldTravelItem('travel').querySelector('.manager-nav-label').textContent.trim(),
      'Travel'
    );
    // The realm count rides the parent.
    assert.equal(
      worldTravelItem('travel').querySelector('.manager-nav-count').textContent.trim(),
      '1'
    );
    assert.equal(worldTravelItem('travel').getAttribute('aria-controls'), 'manager-travel-submenu');
    assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'false');
    assert.equal(target.querySelector('[data-world-travel-submenu]'), null);

    target.querySelector('#manager-travel-toggle').click();
    await tick();
    flushSync();
    assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'true');
    assert.equal(
      target.querySelector('#manager-travel-toggle').getAttribute('aria-controls'),
      'manager-travel-submenu'
    );
    assert.ok(target.querySelector('[data-world-travel-submenu]'));
    assert.ok(worldTravelItem('realms').querySelector('.fa-mountain-sun'));
    assert.ok(worldTravelItem('map').querySelector('.fa-map-location-dot'));
    worldTravelItem('realms').click();
    await settleRouteExit();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'world-travel',
      'the Realms destination commits the World Travel route'
    );
    assert.equal(target.querySelectorAll('.fabricate-manager').length, 1);
    assert.equal(worldTravelItem('realms').getAttribute('aria-current'), 'page');
    assert.ok(worldNavItem('parties').classList.contains('manager-world-nav-item'));
    assert.equal(
      target.querySelector('[data-travel-panel="realms"]').getAttribute('role'),
      'region'
    );
    assert.equal(
      target.querySelector('[data-travel-panel="realms"]').getAttribute('aria-labelledby'),
      'manager-travel-nav-realms'
    );
    assert.equal(
      target.querySelector('.manager-header .manager-title').textContent.trim(),
      'Realms'
    );
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      'Realm actions'
    );
    // The INSPECTOR, not just the panel. World > Travel renders its own `manager-main`.
    assert.equal(
      target.querySelector('.manager-travel-inspector')?.getAttribute('aria-label'),
      'Selected realm',
      'the Realms route must render its detail pane, not only its list panel'
    );
    worldTravelItem('map').click();
    await settleRouteExit();
    assert.equal(
      target.querySelector('.manager-header .manager-title').textContent.trim(),
      'Map Region Links'
    );
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      'Map region link actions'
    );
    assert.equal(
      target.querySelector('.manager-travel-inspector')?.getAttribute('aria-label'),
      'Selected map region link',
      'and the Map Region Links route must render its own detail pane too'
    );
    worldNavItem('parties').click();
    await tick();
    flushSync();
    assert.equal(worldNavItem('parties').getAttribute('aria-current'), 'page');
    assert.equal(
      target.querySelectorAll('[aria-current="page"]').length,
      1,
      'only the concrete destination is current'
    );
    assert.ok(worldNavItem('parties').classList.contains('manager-world-nav-item'));
    assert.ok(target.querySelector('[data-travel-panel="parties"]'));
    assert.ok(
      !target.querySelector('[id^="travel-tab-"]'),
      'the retired horizontal tabs are absent'
    );
  });

  it('places permanent World navigation after every selected-system entry, including Graph', () => {
    mountManager([], {
      gatheringRealmsEnabled: true,
      experimentalFeaturesEnabled: true,
    });

    const navChildren = Array.from(target.querySelector('.manager-nav').children);
    const graph = navChildren.find((item) => item.textContent.includes('Graph'));
    const world = target.querySelector('[data-world-nav-section]');
    assert.ok(graph, 'the experimental Graph placeholder is visible in this ordering fixture');
    assert.ok(
      navChildren.indexOf(world) > navChildren.indexOf(graph),
      'World follows every selected-system entry, including Graph'
    );
  });

  it('keeps either active World Travel child selected when the parent is activated', async () => {
    mountManager([], { gatheringRealmsEnabled: true });
    worldTravelItem('travel').click();
    await tick();
    flushSync();

    for (const childId of ['realms', 'map']) {
      worldTravelItem(childId).click();
      await tick();
      flushSync();
      worldTravelItem('travel').click();
      await tick();
      flushSync();

      assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'true');
      assert.equal(worldTravelItem(childId).getAttribute('aria-current'), 'page');
      assert.equal(
        target.querySelectorAll('#manager-travel-submenu [aria-current="page"]').length,
        1
      );
    }
  });

  it('keeps World controls named and reachable in the persisted 56px rail', () => {
    mountManager(
      [],
      { gatheringRealmsEnabled: true },
      { getSetting: (key) => key === 'managerRailCollapsed' }
    );

    assert.ok(target.querySelector('.manager-body').classList.contains('is-rail-collapsed'));
    assert.equal(worldNavItem('parties').getAttribute('aria-label'), 'Parties');
    assert.equal(worldTravelItem('travel').getAttribute('aria-label'), 'Travel');
    assert.equal(worldNavItem('parties').tagName, 'BUTTON');
    assert.equal(worldTravelItem('travel').tagName, 'BUTTON');
  });

  it('keeps a World Travel child reachable after collapsing and re-expanding the rail', async () => {
    mountManager([], { gatheringRealmsEnabled: true });

    assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'false');
    const railToggle = target.querySelector('[data-manager-rail-toggle]');
    railToggle.click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-body').classList.contains('is-rail-collapsed'));

    target.querySelector('[data-manager-rail-toggle]').click();
    await tick();
    flushSync();
    assert.ok(!target.querySelector('.manager-body').classList.contains('is-rail-collapsed'));

    worldTravelItem('travel').click();
    await tick();
    flushSync();
    assert.equal(worldTravelItem('travel').getAttribute('aria-expanded'), 'true');
    worldTravelItem('realms').click();
    await settleRouteExit();
    assert.equal(worldTravelItem('realms').getAttribute('aria-current'), 'page');
    assert.ok(target.querySelector('[data-travel-panel="realms"]'));
  });

  // Issue 1282: the toggle states PARTICIPATION.
  it('flips Travel & Realms from the System Settings tile while World Travel stays put', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    assert.ok(worldTravelItem('travel'), 'World Travel is present before any system opts in');
    assert.equal(
      target.querySelector('[data-gathering-realm-toggle]'),
      null,
      'the toggle is not on the systems library route'
    );

    navButton('System Overview').click();
    await settleRouteExit();

    const tile = target.querySelector('[data-feature-key="gatheringRealms"]');
    assert.ok(tile, 'the feature tile renders beside Currency');
    assert.ok(
      target.querySelector('[data-feature-key="currency"]'),
      'and the Currency tile it is modelled on is its neighbour'
    );
    const toggle = tile.querySelector('[data-gathering-realm-toggle]');
    assert.ok(toggle, 'the tile carries the toggle');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'toggle starts unpressed');

    toggle.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'setGatheringRealmsEnabled' && call[1] === 'alchemy' && call[2] === true
      ),
      'clicking the toggle calls setGatheringRealmsEnabled with the flipped value'
    );
    assert.equal(
      target.querySelector('[data-gathering-realm-toggle]').getAttribute('aria-pressed'),
      'true',
      'toggle reflects the new pressed state'
    );
    assert.ok(worldTravelItem('travel'), 'and World Travel is unaffected either way');
    assert.ok(!gatheringSubitem('Travel'), 'Travel is not nested inside Gathering');
  });

  // The route used to evaporate under the GM when the selected system's toggle went off.
  it('keeps World Travel on screen when the selected system opts out of Travel & Realms', async () => {
    const calls = [];
    const store = createStore(calls, { gatheringRealmsEnabled: true });
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    worldTravelItem('travel').click();
    await settleRouteExit();
    assert.equal(worldTravelItem('realms').getAttribute('aria-current'), 'page');

    store.viewState.update((state) => ({
      ...state,
      gatheringRealmSettings: { ...state.gatheringRealmSettings, enabled: false },
    }));
    await tick();
    flushSync();

    assert.ok(target.querySelector('[data-world-nav-section]'), 'World remains available');
    assert.ok(worldTravelItem('travel'), 'World Travel stays put');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'world-travel');
    assert.ok(target.querySelector('[data-travel-panel="realms"]'));
  });

  // Realms became WORLD geography in issue 1282.
  // The travel leaf's own two writers (issue 1707 phase 2). Both reach the store through the
  // shell, and neither was acted on anywhere: the realms column could go inert and ship green.
  it('renames and deletes the selected realm from the travel inspector', async () => {
    const calls = [];
    mountManager(calls, { gatheringRealmsEnabled: true });
    target.querySelector('#manager-travel-toggle').click();
    await settle();
    worldTravelItem('realms').click();
    await settleRouteExit();

    const inspector = target.querySelector('.manager-travel-inspector');
    assert.equal(
      inspector.getAttribute('aria-label'),
      'Selected realm',
      'the realms route renders the realm inspector, not the map one'
    );
    // Both of this card's own hooks, which nothing in the repository asserted before issue 1707
    // phase 2: renaming either shipped green, and one of them names the tab it is drawing.
    assert.ok(
      inspector.hasAttribute('data-gathering-inspector-travel'),
      'the travel inspector marks itself as the travel branch of the inspector chain'
    );
    assert.equal(inspector.getAttribute('data-travel-inspector'), 'realms');
    assert.equal(
      inspector.querySelector('.manager-inspector-name').textContent.trim(),
      'Green March',
      'the inspector heads on the selected realm'
    );

    const nameInput = inspector.querySelector('[data-manager-realm-name-field] input');
    assert.ok(Boolean(nameInput), 'the realm inspector renders its inline name field');
    setInputValue(nameInput, 'Emerald March');
    nameInput.dispatchEvent(new Event('blur'));
    await settle();
    assert.deepEqual(
      calls.findLast((call) => call[0] === 'renameRealm'),
      ['renameRealm', 'realm-forest', 'Emerald March'],
      'the committed name reaches the store under the selected realm id'
    );
    assert.equal(
      inspector.querySelector('.manager-inspector-name').textContent.trim(),
      'Emerald March',
      'and the republished name reaches this inspector rather than only the list'
    );

    const remove = [...inspector.querySelectorAll('.manager-travel-inspector-actions button')].find(
      (button) => button.textContent.includes('Delete realm')
    );
    assert.ok(Boolean(remove), 'the realm inspector renders its delete action');
    remove.click();
    await settle();
    assert.deepEqual(
      calls.findLast((call) => call[0] === 'deleteRealm'),
      ['deleteRealm', 'realm-forest'],
      'the delete action reaches the store under the selected realm id'
    );

    worldTravelItem('map').click();
    await settleRouteExit();
    assert.equal(
      target.querySelector('.manager-travel-inspector').getAttribute('data-travel-inspector'),
      'map',
      'the one card follows the tab rather than being two cards'
    );
  });

  it('keeps the realm library and the party list global across a scope switch', async () => {
    mountManager([], {
      gatheringRealmsEnabled: true,
      worldRealms: [
        { id: 'realm-forest', name: 'Green March', enabled: true },
        { id: 'realm-forge', name: 'Forge Quarter', enabled: true },
      ],
      smithingFeatures: { gathering: true, salvage: true },
    });
    worldTravelItem('travel').click();
    await settleRouteExit();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'world-travel');
    assert.ok(target.textContent.includes('Green March'));
    assert.ok(target.textContent.includes('Forge Quarter'));
    assert.equal(
      worldNavItem('parties').querySelector('.manager-nav-count').textContent.trim(),
      '2'
    );

    assert.equal(await switchScopeSystemTo('smithing'), 'world-travel');
    assert.ok(target.textContent.includes('Green March'));
    assert.ok(target.textContent.includes('Forge Quarter'));
    assert.equal(
      worldNavItem('parties').querySelector('.manager-nav-count').textContent.trim(),
      '2'
    );
  });

  it('keeps active World Parties when Gathering or its selected system vanishes', async () => {
    for (const fallback of ['gathering-off', 'selection-cleared']) {
      const store = createStore([], { gatheringRealmsEnabled: true });
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: { store, services: { openCurrentAdmin: () => {} } },
      });
      flushSync();
      worldNavItem('parties').click();
      await tick();
      flushSync();

      store.viewState.update((state) => ({
        ...state,
        canShowEnvironmentsTab: false,
        selectedSystem:
          fallback === 'selection-cleared'
            ? null
            : {
                ...state.selectedSystem,
                features: { ...state.selectedSystem.features, gathering: false },
              },
        systems: state.systems.map((system) => ({
          ...system,
          selected: fallback !== 'selection-cleared' && system.id === 'alchemy',
        })),
      }));
      await tick();
      flushSync();

      assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'world');
      assert.ok(target.querySelector('[data-world-nav-section]'));
      assert.equal(worldNavItem('parties').getAttribute('aria-current'), 'page');
      assert.equal(target.querySelector('[data-party-realm-override-unavailable]') !== null, true);

      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  it('presents and operates World Parties without a selected system while withholding overrides', async () => {
    const calls = [];
    mountManager(calls, { noSystems: true });
    worldNavItem('parties').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'world');
    assert.ok(target.querySelector('[data-travel-panel="parties"]'));
    // ONE PAGE HEADER (issue 1515). This route used to render the kicker.
    assert.ok(
      !target.querySelector('.manager-main .manager-section-header'),
      'World Parties renders no second page header'
    );
    assert.equal(
      target.querySelector('.manager-header [data-page-kicker]').textContent.trim(),
      'WORLD / every system'
    );
    assert.equal(
      target.querySelector('.manager-header .manager-title').textContent.trim(),
      'World Parties'
    );
    assert.equal(
      target.textContent.includes('shared across every crafting system'),
      false,
      'the retired description sentence is gone rather than moved'
    );
    // The page header carries the computed census.
    assert.equal(
      target.querySelector('.manager-header .manager-subtitle').textContent.trim(),
      '2 parties · 1 enabled · 1 of 2 characters assigned'
    );
    assert.equal(
      target.querySelector('.manager-header-actions').getAttribute('aria-label'),
      'World party actions'
    );
    assert.equal(target.querySelector('.manager-travel-inspector'), null, 'no Parties inspector');
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.worldTravelTab,
      'parties',
      'the full-width layout is scoped to the World Parties route'
    );
    const createButton = target.querySelector('.manager-header-actions .manager-button.is-primary');
    assert.equal(createButton.disabled, false);
    assert.ok(target.querySelector('[data-party-realm-override-unavailable]'));
    assert.equal(target.querySelector('[data-party-realm-evidence-unavailable]'), null);
    assert.equal(target.textContent.includes('No current realm set for this system.'), false);

    // Every card renders its own controls in the full-width pane.
    assert.equal(target.querySelector('.manager-party-enable-toggle'), null);

    createButton.click();
    const secondCard = target.querySelector('[data-manager-travel-party-id="party-two"]');

    const nameInput = secondCard.querySelector('[data-manager-party-name-field]');
    setInputValue(nameInput, 'Nightwardens');
    nameInput.dispatchEvent(new Event('blur'));
    await tick();
    flushSync();

    secondCard.querySelector('[data-manager-party-add-open="party-two"]').click();
    await tick();
    flushSync();
    const scoutCandidate = secondCard.querySelector('[data-manager-party-candidate="Actor.scout"]');
    assert.ok(scoutCandidate, 'the no-selection party card exposes the global actor roster');
    scoutCandidate.click();

    dispatchDrop(secondCard.querySelector('[data-manager-party-travel-actor="party-two"]'), {
      type: 'Actor',
      uuid: 'Actor.scout',
    });
    await tick();
    flushSync();
    // The gate opens only once the drop lands a travel actor (req 4): before it.
    const enableButton = secondCard.querySelector('[data-manager-party-enable="party-two"]');
    assert.equal(enableButton.getAttribute('aria-disabled'), null);
    enableButton.click();
    secondCard.querySelector('[data-manager-party-delete="party-two"]').click();

    assert.deepEqual(
      calls.filter((call) =>
        [
          'createParty',
          'renameParty',
          'addOrMovePartyMember',
          'setPartyTravelActor',
          'setPartyEnabled',
          'deleteParty',
        ].includes(call[0])
      ),
      [
        ['createParty'],
        ['renameParty', 'party-two', 'Nightwardens'],
        ['addOrMovePartyMember', 'party-two', 'Actor.scout'],
        ['setPartyTravelActor', 'party-two', 'Actor.scout'],
        ['setPartyEnabled', 'party-two', true],
        ['deleteParty', 'party-two'],
      ]
    );
    assert.equal(
      calls.some((call) => ['setPartyRealmOverride', 'clearPartyRealmOverride'].includes(call[0])),
      false,
      'no-selection Party CRUD must not write a system override'
    );
  });

  it('counts a multi-party character once and counts only enabled parties in the World Parties subtitle', async () => {
    mountManager([], {
      noSystems: true,
      // Mira is in BOTH parties; Vale is a member of the disabled one only.
      travelParties: [
        {
          id: 'party-one',
          name: 'Wayfarers',
          enabled: true,
          memberCount: 1,
          memberActorUuids: ['Actor.member'],
          memberCards: [{ uuid: 'Actor.member', name: 'Mira', img: '', stale: false }],
          travelActorUuid: 'Actor.wagon',
          travelActor: { uuid: 'Actor.wagon', name: 'The Wagon', img: '' },
        },
        {
          id: 'party-two',
          name: 'Night Watch',
          enabled: false,
          memberCount: 2,
          memberActorUuids: ['Actor.member', 'Actor.vale'],
          memberCards: [
            { uuid: 'Actor.member', name: 'Mira', img: '', stale: false },
            { uuid: 'Actor.vale', name: 'Vale', img: '', stale: false },
          ],
          travelActorUuid: null,
          travelActor: null,
        },
      ],
      actorOptions: [
        { uuid: 'Actor.member', name: 'Mira', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.vale', name: 'Vale', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.wagon', name: 'The Wagon', img: '', isPlayerCharacter: false },
      ],
    });
    worldNavItem('parties').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.manager-header .manager-subtitle').textContent.trim(),
      '2 parties · 1 enabled · 2 of 2 characters assigned'
    );
  });

  it('routes a World Parties store validation failure to the card that caused it', async () => {
    const store = createStore([], { noSystems: true });
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    worldNavItem('parties').click();
    await tick();
    flushSync();

    // The pane records the card that issued the failing mutation.
    const firstCard = target.querySelector('[data-manager-travel-party-id="party-one"]');
    firstCard.querySelector('[data-manager-party-add-open="party-one"]').click();
    await tick();
    flushSync();
    firstCard.querySelector('[data-manager-party-candidate="Actor.scout"]').click();
    await tick();
    flushSync();

    store.viewState.update((state) => ({
      ...state,
      travelError: 'Scout is already in an enabled party.',
      travelFieldErrors: { members: 'Scout is already in an enabled party.' },
    }));
    await tick();
    flushSync();

    const secondCard = target.querySelector('[data-manager-travel-party-id="party-two"]');
    const errors = Array.from(firstCard.querySelectorAll('.manager-party-field-error'));
    assert.equal(errors.length, 1);
    assert.equal(errors[0].textContent.trim(), 'Scout is already in an enabled party.');
    assert.equal(
      firstCard.querySelector('[data-manager-party-member-rows]').getAttribute('aria-describedby'),
      errors[0].id,
      'the message is associated with the member list that produced it'
    );
    assert.equal(secondCard.querySelector('.manager-party-field-error'), null);
    // A field error whose card is on the page suppresses the pane-level summary.
    assert.equal(target.querySelector('[data-manager-party-summary-error]'), null);

    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;
  });

  it('renders a context-free World Parties rejection once above the card list', async () => {
    const store = createStore([], { noSystems: true });
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    worldNavItem('parties').click();
    await tick();
    flushSync();

    // `setPartyEnabled` passes no field context.
    store.viewState.update((state) => ({
      ...state,
      travelError: 'Mira is already in an enabled party.',
      travelFieldErrors: {},
    }));
    await tick();
    flushSync();

    const summaries = target.querySelectorAll('[data-manager-party-summary-error]');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].textContent.trim(), 'Mira is already in an enabled party.');
    assert.equal(target.querySelector('.manager-party-field-error'), null);

    unmount(mounted);
    mounted = null;
    target.remove();
    target = null;
  });

  it('keeps active World Travel when Gathering or the selected system vanishes', async () => {
    for (const fallback of ['gathering-off', 'selection-cleared']) {
      const store = createStore([], { gatheringRealmsEnabled: true });
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: { store, services: { openCurrentAdmin: () => {} } },
      });
      flushSync();
      worldTravelItem('travel').click();
      await tick();
      flushSync();

      store.viewState.update((state) => ({
        ...state,
        canShowEnvironmentsTab: false,
        selectedSystem:
          fallback === 'selection-cleared'
            ? null
            : {
                ...state.selectedSystem,
                features: { ...state.selectedSystem.features, gathering: false },
              },
        systems: state.systems.map((system) => ({
          ...system,
          selected: fallback !== 'selection-cleared' && system.id === 'alchemy',
        })),
      }));
      await tick();
      flushSync();

      // A world route, so neither a gathering-off system nor a cleared selection can evict it.
      assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'world-travel');
      assert.ok(worldTravelItem('travel'));
      assert.ok(target.querySelector('[data-world-nav-section]'));

      unmount(mounted);
      mounted = null;
      target.remove();
      target = null;
    }
  });

  // ── The four rail-reachable world scoped-entity routes actually render (issue 1362) ───────
  describe('world scoped-entity routes (issue 1362)', () => {
    /**
     * Rail leaf id -> the route token it commits, the screen title it renders.
     * The body selector was a fixed `[data-scoped-placeholder="<token>"]` for all four, and the
     * screen lanes of this epic make that false one route at a time and in no fixed order: issue
     * 1372 replaced `world-essences` and issue 1373 replaced `world-tools`, and both draw the
     * shared list shell instead. Naming the selector per route keeps the assertion LIVE in both
     * directions rather than deleting it for a replaced route — a replaced page must still render
     * a body of its own, and the routes that still delegate must still render the shared one.
     */
    const RAIL_REACHABLE_ROUTES = [
      [
        'component-catalogue',
        'world-components',
        'Component catalogue',
        // Issue 1371: the real catalogue. `data-scoped-list` is the shell's own hook and the
        // route token pins it to THIS screen rather than to any scoped list, exactly as the tool
        // row below does - and swapping the placeholder selector for it is what makes this row
        // fail again if the body ever reverts to delegating.
        '[data-scoped-list="world-components"]',
      ],
      // Issue 1392: the real world vocabulary screen. Its body hook is one of the three panel
      // wrappers rather than the page hook, for this row's stated reason — a route wired into
      // the shell with no body still carries `data-scoped-page`.
      [
        'vocabulary',
        'world-vocabulary',
        'Tags & Categories',
        '[data-vocabulary-panel="componentCategories"]',
      ],
      ['essence-catalogue', 'world-essences', 'Essence Catalogue', '[data-scoped-list]'],
      // Issue 1373: the real catalogue. `data-scoped-list` is the shell's own hook.
      ['tool-catalogue', 'world-tools', 'Tools Catalogue', '[data-scoped-list="world-tools"]'],
    ];

    async function settleRoute() {
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
      await tick();
      flushSync();
      await tick();
      flushSync();
    }

    async function mountRail() {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: { store: createStore([]), services: { openCurrentAdmin: () => {} } },
      });
      flushSync();
      await tick();
      flushSync();
    }

    it('commits its own route, page hook and title from the rail — with no system selected', async () => {
      await mountRail();
      const seenPages = new Set();
      for (const [leaf, token, title, bodySelector] of RAIL_REACHABLE_ROUTES) {
        worldNavItem(leaf).click();
        await settleRoute();
        assert.equal(
          target.querySelector('.fabricate-manager').dataset.managerView,
          token,
          `the ${leaf} leaf commits the ${token} route`
        );
        const page = target.querySelector(`[data-scoped-page="${token}"]`);
        assert.ok(Boolean(page), `${token} renders its own page hook`);
        assert.equal(page.getAttribute('aria-label'), title, `${token}'s main is named for it`);
        assert.equal(
          target.querySelector('.manager-header .manager-title').textContent.trim(),
          title
        );
        assert.ok(
          Boolean(target.querySelector(bodySelector)),
          `${token} renders its own body (${bodySelector}); a route wired into the shell with no ` +
            'body renders an empty main and every other assertion here still passes'
        );
        // FULL WIDTH IS THE OTHER HALF OF THE ROUTE. A page wired into the shell but left in
        // the aside chain renders against a permanent dead strip, which no source assertion
        // about the exclusion set can see.
        assert.ok(
          !target.querySelector('.manager-inspector'),
          `${token} is released to full width, so the shared inspector must not render`
        );
        seenPages.add(page.getAttribute('data-scoped-page'));
      }
      assert.equal(
        seenPages.size,
        RAIL_REACHABLE_ROUTES.length,
        'each route rendered a DISTINCT page: a duplicated pageId would collapse this set'
      );
    });

    // THE WORLD BREAKAGE DEFAULT IS ON THE CATALOGUE AND NOWHERE ELSE (issue 1373).
    it('the world Tools Catalogue carries the world breakage default control', async () => {
      await mountRail();
      worldNavItem('tool-catalogue').click();
      await settleRoute();
      const card = target.querySelector('[data-world-tool-break-mode]');
      assert.ok(Boolean(card), 'the catalogue renders the World breakage default card');
      assert.equal(
        card.querySelectorAll('[data-world-tool-break-segment]').length,
        2,
        'TWO options at world scope, never three: the world is where this value is authored, ' +
          'so there is nothing above it to inherit from'
      );
    });

    it('draws a TWO-crumb trail rooted at World, with World itself clickable', async () => {
      await mountRail();
      worldNavItem('component-catalogue').click();
      await settleRoute();
      const world = target.querySelector('[data-breadcrumb-world]');
      assert.equal(
        world.tagName,
        'BUTTON',
        'World is not the leaf here, so it navigates — the rule every crumb in this trail follows'
      );
      const leaf = target.querySelector('[data-breadcrumb-world-scoped]');
      assert.equal(leaf.getAttribute('data-breadcrumb-world-scoped'), 'world-components');
      assert.equal(leaf.textContent.trim(), 'Component catalogue');
      assert.equal(leaf.tagName, 'SPAN', 'and the leaf does not navigate');
      // A CATALOGUE HAS NO MIDDLE CRUMB. The intermediate catalogue crumb belongs to the ENTRY
      // routes; drawing one here would say the catalogue sits inside itself.
      assert.ok(
        !target.querySelector('[data-breadcrumb-world-scoped-catalogue]'),
        'a catalogue route draws no intermediate catalogue crumb'
      );
    });
  });

  // ── The world scope corpus reaches the DOM.
  describe('world scope publication (issue 1362)', () => {
    let scopeStores;

    /**
     * A minimal scope store with the two methods the projection reads. Deliberately NOT the
     * real `ScopedDefinitionStore`: this block is about the publish path, and a fake whose
     * corpus a test can swap under it is how the settings-bridge reload is modelled.
     *
     * @param {Array<object>} entities
     * @returns {object}
     */
    function scopeStore(entities, extraCorpus = {}) {
      let corpus = { entities, defaults: [], membership: [], ...extraCorpus };
      return {
        corpus: () => corpus,
        isSeeded: () => true,
        // ── THE TWO SEAMS A WORLD-SCOPE WRITE NEEDS (issue 1373) ───────────────────────────
        // `worldScopeActions` reads the PERSISTED payload, edits it and saves it back, so a
        // double carrying `corpus()` alone cannot serve a write at all: it throws on the
        // missing `save`. The persisted shape is a map per sub-key and the published corpus is
        // an array per sub-key, and these two are where that conversion lives in production, so
        // the double does it rather than pretending the two shapes are one.
        get: () => ({
          ...extraCorpus,
          entities: corpus.entities.map((entry) => ({ ...entry })),
          defaults: Object.fromEntries(corpus.defaults.map((entry) => [entry.id, entry])),
          membership: Object.fromEntries(
            corpus.membership.map((entry) => [`${entry.entityId}|${entry.systemId}`, entry])
          ),
        }),
        save(payload) {
          corpus = {
            ...extraCorpus,
            entities: [...(payload?.entities ?? [])],
            defaults: Object.values(payload?.defaults ?? {}),
            membership: Object.values(payload?.membership ?? {}),
          };
        },
        replace(next) {
          corpus = { entities: next, defaults: [], membership: [], ...extraCorpus };
        },
        mutateInPlace(next) {
          // The negative control's seam: edit the SAME object rather than replacing it.
          corpus.entities.length = 0;
          corpus.entities.push(...next);
        },
      };
    }

    function worldEntities(count, prefix) {
      return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }));
    }

    /**
     * Mount the manager over a REAL admin store driven by the fakes above.
     *
     * @param {object} [options]
     * @param {object|null} [options.worldToolBreakage] The world scope's `toolBreakage` block.
     * @param {object|null} [options.systemToolBreakage] The selected system's own block.
     * @param {Array<object>|null} [options.worldTools] The world tool corpus. Named entities,
     * @param {Array<object>|null} [options.worldEssences] The world essence corpus. Named
     * @param {Array<object>} [options.worldEssenceMembership] World essence membership rows.
     * @param {boolean} [options.enableEssences] Enable and seed the system essence rules route.
     * @param {object|null} [options.craftingCheck] The selected system's crafting check.
     * @param {string} [options.resolutionMode] The selected system's resolution mode.
     * @returns {Promise<object>} the store
     */
    async function mountWithRealStore({
      worldToolBreakage,
      systemToolBreakage,
      worldEssences,
      worldEssenceMembership = [],
      enableEssences = false,
      worldTools,
      // The world COMPONENT corpus (issue 1371). It defaulted to three generated entities and
      // had no override, so a suite that needed a KNOWN component corpus - an empty one, or one
      // holding a record with a specific alias - could not ask for it.
      worldComponents,
      craftingCheck,
      resolutionMode,
      // The COMPONENT's services bag, which is a different one from the admin store's.
      componentServices = {},
      // The ADMIN store's actor roster.
      actorOptions = [],
      // The three-way route-exit prompt; absent by default, as it is in production's own tests.
      choiceDialog,
    } = {}) {
      scopeStores = {
        component: scopeStore(worldComponents ?? worldEntities(3, 'comp')),
        essence: scopeStore(worldEssences ?? worldEntities(2, 'ess'), {
          membership: worldEssenceMembership,
        }),
        tool: scopeStore(
          worldTools ?? worldEntities(1, 'tool'),
          worldToolBreakage ? { toolBreakage: worldToolBreakage } : {}
        ),
        // The FOURTH leg starts absent, which is the shipped state.
        vocabulary: null,
      };
      const forge = makeSystem({
        id: 'sys1',
        name: 'Forge',
        ...(enableEssences
          ? {
              features: { essences: true },
              essenceDefinitions: [{ id: 'ash', name: 'Ash', enabled: true }],
            }
          : {}),
        ...(systemToolBreakage ? { toolBreakage: systemToolBreakage } : {}),
        ...(craftingCheck ? { craftingCheck } : {}),
        ...(resolutionMode ? { resolutionMode } : {}),
      });
      const alchemy = makeSystem({
        id: 'sys2',
        name: 'Alchemy',
        ...(enableEssences
          ? {
              features: { essences: true },
              essenceDefinitions: [{ id: 'ash', name: 'Ash', enabled: true }],
            }
          : {}),
      });
      const systems = [forge, alchemy];
      const services = createServices(forge, [], [], {
        getCraftingSystemManager: () => ({
          getSystems: () => systems,
          getSystem: (id) => systems.find((system) => system.id === id) || null,
          getItems: () => [],
        }),
        getComponentScopeStore: () => scopeStores.component,
        getEssenceScopeStore: () => scopeStores.essence,
        getToolScopeStore: () => scopeStores.tool,
        getVocabularyScopeStore: () => scopeStores.vocabulary,
        getActorOptions: () => actorOptions,
        getActorRollData: async (uuid) =>
          actorOptions.some((actor) => actor.uuid === uuid) ? { level: 3 } : null,
        ...(choiceDialog ? { choiceDialog } : {}),
      });
      const store = createAdminStore(services);
      await store.refresh();
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, { target, props: { store, services: componentServices } });
      flushSync();
      await tick();
      flushSync();
      return store;
    }

    function railCounts() {
      return ['component-catalogue', 'essence-catalogue', 'tool-catalogue'].map((leaf) =>
        target.querySelector(`#manager-world-nav-${leaf} .manager-nav-count`)?.textContent?.trim()
      );
    }

    function vocabularyCount() {
      return target
        .querySelector('#manager-world-nav-vocabulary .manager-nav-count')
        ?.textContent?.trim();
    }

    async function settle(store) {
      await store.refresh();
      flushSync();
      await tick();
      flushSync();
    }

    it('publishes the world corpus to the rail on LOAD', async () => {
      await mountWithRealStore();
      assert.deepEqual(railCounts(), ['3', '2', '1']);
    });

    it('republishes it on the SETTINGS-BRIDGE reload, and the DOM moves', async () => {
      // The bridge reloads the store and re-emits `craftingSystemsChanged`.
      const store = await mountWithRealStore();
      scopeStores.component.replace(worldEntities(7, 'comp'));
      await settle(store);
      assert.deepEqual(railCounts(), ['7', '2', '1']);
    });

    it('republishes it on a CRAFTING SYSTEM CHANGE, unchanged', async () => {
      const store = await mountWithRealStore();
      const before = JSON.parse(JSON.stringify(get(store.viewState).worldScope));
      await store.selectSystem('sys2');
      await settle(store);
      // The world corpus is world scope.
      assert.deepEqual(get(store.viewState).worldScope, before);
      assert.deepEqual(railCounts(), ['3', '2', '1']);
    });

    it('MUTATION PROOF: an in-place corpus edit does not reach the DOM', async () => {
      // The negative control for the three assertions above. `ScopedDefinitionStore` replaces
      // its corpus WHOLESALE for exactly this reason — the resolved-union memo keys on the
      // object's identity — and a projection that read a mutated-in-place corpus would publish
      // a stale count. Proving the DOM assertion CAN red is what stops the three tests above
      // from being satisfied by any republish at all.
      const store = await mountWithRealStore();
      scopeStores.component.mutateInPlace(worldEntities(9, 'comp'));
      // No refresh: nothing told the store anything happened, which is the whole point.
      flushSync();
      await tick();
      flushSync();
      assert.deepEqual(
        railCounts(),
        ['3', '2', '1'],
        'an in-place edit with no publish must not reach the DOM'
      );
      // And the same edit DOES reach it once a publish runs.
      await settle(store);
      assert.deepEqual(railCounts(), ['9', '2', '1']);
    });

    it('reads the WORLD VOCABULARY badge through the optional fourth store leg', async () => {
      // THE FIELD NAME IS THE POINT. The shell reads `worldScope.vocabulary.total` and
      // `## GM World Scoped Entity Routes` requirement 7 bars PR 7 from the shell, so a
      // producer publishing `count`, or leaving the caller to read `entries.length`, would
      // leave this badge on 0 for good with every other assertion in this repository still
      // green. Driving the REAL store from a registered vocabulary store is what makes the
      // name a contract rather than a hope: nothing here restates it.
      const store = await mountWithRealStore();
      assert.equal(
        vocabularyCount(),
        '0',
        'with no vocabulary store registered the badge reads 0 — truthful, not blank'
      );
      scopeStores.vocabulary = {
        corpus: () => ({
          componentCategories: [{ id: 'metal' }, { id: 'herb' }],
          componentTags: [{ id: 'rare' }],
          recipeCategories: [{ id: 'smithing' }, { id: 'alchemy' }],
        }),
      };
      await settle(store);
      assert.equal(vocabularyCount(), '5', 'and it counts all three vocabularies, summed');
      // And it is ITS OWN corpus: lighting the vocabulary up must not disturb the three
      // scoped-entity counts beside it.
      assert.deepEqual(railCounts(), ['3', '2', '1']);
    });

    // ── THE RESOLVED TOOL-BREAKAGE AUTHORITY REACHES THE CARD (issue 1374) ──────────────
    // `source` IS READ OFF THE PUBLISHED PROJECTION, not off the DOM, and that is the honest
    // place for it: `ToolsBrowserView` does not declare `breakageSource` yet — the lane that
    // draws the tri-state control declares it — so the prop is inert and renders nothing. What
    // is asserted is that the value exists, is carried, and distinguishes the two states the
    // resolved token cannot tell apart.
    describe('tool-breakage authority resolution (issue 1374)', () => {
      async function openToolStudio() {
        navButton('Tool Rules').click();
        await tick();
        flushSync();
        const segments = target.querySelectorAll('[data-tool-authority-segment]');
        assert.equal(segments.length, 3, 'the Tool Studio authority radiogroup is rendered');
        return [...segments].map((segment) => ({
          authority: segment.dataset.toolAuthoritySegment,
          selected: segment.classList.contains('is-selected'),
          checked: segment.querySelector('input[type="radio"]').checked,
        }));
      }

      function selectedAuthority(segments) {
        const selected = segments.filter((segment) => segment.selected);
        assert.equal(selected.length, 1, 'exactly one segment is drawn as current');
        assert.equal(
          selected[0].checked,
          true,
          'and the radio agrees with the class: both are read, because either alone can drift'
        );
        return selected[0].authority;
      }

      function publishedToolBreakage(store) {
        return get(store.viewState).selectedSystem.toolBreakage;
      }

      function segmentLabel(value) {
        return target
          .querySelector(`[data-tool-authority-segment="${value}"]`)
          ?.textContent?.trim();
      }

      it('a WORLD authority reaches the card when the system authored none', async () => {
        const store = await mountWithRealStore({
          worldToolBreakage: { authority: 'checkDriven' },
        });
        // AC-1. POSITIVELY, through the helper that reads the class AND the radio together:
        assert.equal(
          selectedAuthority(await openToolStudio()),
          'inherit',
          'a system that authored nothing INHERITS the world break mode, and the control says ' +
            'so on the AUTHORED layer rather than drawing the resolved token as current'
        );
        // AC-2. The inherit segment names the WORLD's token. This fixture is the right one
        // precisely because deriving the label off `breakageAuthority` would read the same
        // value here - so the disagreeing fixture below is what actually catches it.
        assert.match(
          segmentLabel('inherit'),
          /Check-driven/,
          'the inherit segment names what the world actually says'
        );
        assert.deepEqual(publishedToolBreakage(store), {
          authority: 'checkDriven',
          source: 'world',
        });
      });

      it('a system OVERRIDE still wins over the same world authority', async () => {
        const store = await mountWithRealStore({
          worldToolBreakage: { authority: 'checkDriven' },
          systemToolBreakage: { authority: 'toolSpecific' },
        });
        assert.equal(
          selectedAuthority(await openToolStudio()),
          'toolSpecific',
          'the per-system override is the winning scope'
        );
        // AC-2, on the fixture where the two values DISAGREE. A label derived from
        // `breakageAuthority` renders `Tool-specific` here and is wrong; only the world's own
        // token, carried on the `scope` leg of the bundle, answers `Check-driven`.
        assert.match(
          segmentLabel('inherit'),
          /Check-driven/,
          'the inherit segment names the WORLD token, not the resolved one'
        );
        assert.deepEqual(publishedToolBreakage(store), {
          authority: 'toolSpecific',
          source: 'system',
        });
      });

      it('neither scope authoring a token falls to the default, and says so', async () => {
        const store = await mountWithRealStore();
        assert.equal(
          selectedAuthority(await openToolStudio()),
          'inherit',
          'nothing authored anywhere is still not this system authoring toolSpecific'
        );
        // AND THE LABEL DOES NOT CALL IT A WORLD DEFAULT. `DEFAULT_TOOL_BREAKAGE_AUTHORITY` is
        // a shipped fallback, not a GM's choice, so copy crediting the world with it would be
        // a lie the `default` branch exists to prevent.
        assert.match(segmentLabel('inherit'), /\(default\)/);
        assert.doesNotMatch(segmentLabel('inherit'), /World default/);
        assert.deepEqual(
          publishedToolBreakage(store),
          { authority: 'toolSpecific', source: 'default' },
          'the third branch of the resolver: the same TOKEN as an authored toolSpecific, and a ' +
            'different source — which is the whole reason source exists'
        );
      });

      // AC-3. CHOOSING `Inherit` CLEARS RATHER THAN MINTS.
      it('a WORLD checkDriven reaches the Checks triggers with NOTHING on the system', async () => {
        await mountWithRealStore({
          worldToolBreakage: { authority: 'checkDriven' },
          // `routedByCheck` because the crafting check is OPTIONAL in `simple` mode.
          resolutionMode: 'routedByCheck',
          craftingCheck: {
            enabled: true,
            mode: 'passFail',
            macroUuid: null,
            outcomes: [],
            routed: {
              enabled: true,
              type: 'relative',
              rollFormula: '1d20',
              checkBreakage: {
                triggers: [
                  {
                    id: 'trg-1',
                    condition: { type: 'rollTotal', operator: '<=', value: 1 },
                    outcome: 'failure',
                    breakTools: false,
                  },
                ],
              },
            },
          },
        });
        navButton('Checks').click();
        await tick();
        flushSync();
        await openChecksActivity('crafting');
        await openChecksSection('triggers');
        const trigger = target.querySelector('[data-trigger="trg-1"]');
        assert.ok(Boolean(trigger), 'the authored trigger renders, so the gate has a subject');
        target.querySelector('[data-trigger-disclosure="trg-1"]').click();
        await tick();
        flushSync();
        assert.ok(
          Boolean(target.querySelector('[data-trigger="trg-1"] [data-trigger-break]')),
          'the break-tools card renders ENABLED under an inherited world checkDriven'
        );
        assert.ok(
          !target.querySelector('[data-trigger-break-unavailable]'),
          'and the "switch the authority to check-driven" hint stands down: it is already ' +
            'check-driven, at world scope'
        );
      });

      it('choosing Inherit CLEARS the per-system override rather than minting one', async () => {
        const store = await mountWithRealStore({
          worldToolBreakage: { authority: 'checkDriven' },
          systemToolBreakage: { authority: 'toolSpecific' },
        });
        await openToolStudio();
        const forwarded = [];
        store.setToolBreakageAuthority = (authority) => {
          forwarded.push(authority);
          return Promise.resolve();
        };
        target.querySelector('[data-tool-authority-segment="inherit"] input[type="radio"]').click();
        flushSync();
        assert.deepEqual(
          forwarded,
          [null],
          'Inherit forwards null, which is what `setToolBreakageAuthority` turns into a key ' +
            'removal. Forwarding a token instead writes an override the GM cannot clear'
        );
      });
    });

    // ── THE WORLD ESSENCE ENTRY HEADING NAMES THE DRAFT (issue 1372, parity round 5) ────
    describe('world essence entry heading (issue 1372)', () => {
      /** Two NAMED world essences: the heading is about a name, so an id-only corpus is mute. */
      const WORLD_ESSENCES = Object.freeze([
        Object.freeze({ id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'ember' }),
        Object.freeze({ id: 'brine', name: 'Brine' }),
      ]);

      async function settleEntryRoute() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      const headingText = () =>
        target
          .querySelector('[data-world-essence-entry-heading] .manager-title')
          ?.textContent?.trim();

      const subtitleText = () =>
        target.querySelector('[data-world-essence-entry-subline]')?.textContent?.trim();

      /** Open `ash`'s world entry editor the way a GM does: rail, then the row's pen. */
      async function openAshEntry() {
        await mountWithRealStore({ worldEssences: [...WORLD_ESSENCES] });
        worldNavItem('essence-catalogue').click();
        await settleEntryRoute();
        const open = target.querySelector(
          '[data-scoped-list-row="ash"] [data-scoped-list-action="open-entry"]'
        );
        assert.ok(
          Boolean(open),
          'the essence catalogue rendered no open-entry action for `ash`, so nothing below ' +
            'reaches the editor this block is about'
        );
        open.click();
        await settleEntryRoute();
        assert.equal(
          target.querySelector('.fabricate-manager').dataset.managerView,
          'world-essence-entry',
          'the row pen did not commit the entry route'
        );
      }

      /** Type into the buffered name field — an `input` event, which is the only thing that
       * moves the draft: it is seeded from the persisted record, so a click cannot dirty it. */
      async function typeName(value) {
        const field = target.querySelector('[data-scoped-entry-name]');
        assert.ok(Boolean(field), 'the entry editor rendered no name field');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await settleEntryRoute();
      }

      it('opens on the persisted name', async () => {
        await openAshEntry();
        assert.equal(
          headingText(),
          'Ash',
          'an untouched editor must head the screen with the record on disk'
        );
      });

      it('FOLLOWS the buffered name as the GM types, before any Save', async () => {
        await openAshEntry();
        await typeName('Aetherlight');
        assert.equal(
          target.querySelector('[data-scoped-entry-name]').value,
          'Aetherlight',
          'the keystroke never reached the draft, so the heading assertion below is vacuous'
        );
        assert.equal(
          headingText(),
          'Aetherlight',
          'the heading still names the PERSISTED essence while the name field and the player ' +
            'preview both show the buffered one — one screen naming one essence two ways'
        );
      });

      it('leaves the USAGE SUBTITLE on the persisted record, which is a count of systems', async () => {
        await openAshEntry();
        const before = subtitleText();
        assert.ok(
          Boolean(before),
          'the heading block rendered no subtitle at all, so its stability below proves nothing'
        );
        await typeName('Aetherlight');
        assert.equal(
          subtitleText(),
          before,
          'a rename changed the count of systems using this essence, which no keystroke can do ' +
            'until the write lands'
        );
      });

      it('falls back to the ROUTE TITLE when the buffered name is emptied', async () => {
        // The same guard the missing-record path takes. A GM who clears the field is authoring
        // an empty name, and an empty `<h1>` is not a heading — this is what the route already
        // renders for a record whose persisted name is empty.
        await openAshEntry();
        await typeName('');
        assert.equal(headingText(), 'Essence entry');
      });

      // ── AND SO DOES THE REST OF THE CHROME (issue 1372, parity round 6) ──────────────

      const crumbText = () =>
        target
          .querySelector('[data-breadcrumb-world-scoped="world-essence-entry"]')
          ?.textContent?.trim();

      const headingMedallion = () =>
        target.querySelector('[data-world-essence-entry-heading] .fab-medallion');

      /** Pick a preset swatch in the entry editor's inline colour palette. */
      async function pickColour(token) {
        const swatch = target.querySelector(
          `[data-scoped-entry-colour] [data-manager-color-token="${token}"]`
        );
        assert.ok(Boolean(swatch), `the entry editor rendered no \`${token}\` colour swatch`);
        swatch.click();
        await settleEntryRoute();
      }

      it('opens with the crumb on the persisted name', async () => {
        await openAshEntry();
        assert.equal(
          crumbText(),
          'Ash',
          'an untouched editor must trail the record on disk, exactly as the heading does'
        );
      });

      it('FOLLOWS the buffered name in the last crumb, before any Save', async () => {
        await openAshEntry();
        await typeName('Aetherlight');
        assert.equal(
          headingText(),
          'Aetherlight',
          'the heading did not move, so the crumb assertion below would be measuring the ' +
            'wrong failure'
        );
        assert.equal(
          crumbText(),
          'Aetherlight',
          'the trail still names the PERSISTED essence under a heading that names the draft — ' +
            'one screen naming one essence two ways, one line apart'
        );
      });

      it('resolves the crumb GENERICALLY, so every scoped entry route inherits it', async () => {
        // The crumb is derived once for all three entry routes out of `SCOPED_ENTRY_ROUTES`.
        await openAshEntry();
        await typeName('Aetherlight');
        const leaf = target.querySelector('[data-breadcrumb-world-scoped]');
        assert.equal(
          leaf?.getAttribute('data-breadcrumb-world-scoped'),
          'world-essence-entry',
          'the buffered name is being rendered somewhere other than the shared entry leaf'
        );
        assert.equal(leaf.textContent.trim(), 'Aetherlight');
      });

      it('falls back to the ROUTE TITLE in the crumb when the buffered name is emptied', async () => {
        await openAshEntry();
        await typeName('');
        assert.equal(
          crumbText(),
          'Essence entry',
          'an authored empty name must reach the crumb — `??` on "no editor", never `||` on ' +
            '"nothing typed"'
        );
      });

      it('opens the heading MEDALLION on the persisted icon and colour', async () => {
        await openAshEntry();
        const medallion = headingMedallion();
        assert.ok(Boolean(medallion), 'the entry heading rendered no medallion');
        assert.equal(medallion.getAttribute('data-medallion-tint'), 'ember');
        assert.ok(
          medallion.querySelector('i')?.className.includes('fa-fire'),
          'the medallion opened on some icon other than the record on disk'
        );
      });

      it('FOLLOWS the buffered colour in the heading medallion, before any Save', async () => {
        await openAshEntry();
        await pickColour('lavender');
        assert.ok(
          target
            .querySelector('[data-scoped-entry-colour] [data-manager-color-token="lavender"]')
            ?.className.includes('is-selected'),
          'the swatch click never reached the draft, so the medallion assertion below is vacuous'
        );
        assert.equal(
          headingMedallion()?.getAttribute('data-medallion-tint'),
          'lavender',
          'the tile at the top of the screen still wears the colour on disk while the picker, ' +
            'the preview rail and the form tile have all moved'
        );
      });

      it('FOLLOWS the buffered icon in the heading medallion, before any Save', async () => {
        // The COLOUR case above and this one are not one test twice.
        await openAshEntry();
        const trigger = target.querySelector('.essence-icon-picker-trigger');
        assert.ok(Boolean(trigger), 'the entry editor rendered no icon picker');
        trigger.click();
        await settleEntryRoute();
        // The picker's option list is PORTALLED out of the page, so it is found on the document.
        const option = [...document.querySelectorAll('.essence-icon-picker-option')].find(
          (candidate) => !(candidate.querySelector('i')?.className ?? '').includes('fa-fire')
        );
        assert.ok(Boolean(option), 'the icon picker offered no glyph other than the persisted one');
        // The picker's own `<i>` carries ITS component's Svelte scope hash and the medallion's
        // carries none, so the two are compared on the glyph classes rather than verbatim.
        const glyphClasses = (element) =>
          (element?.className ?? '')
            .split(/\s+/)
            .filter((token) => token && !token.startsWith('svelte-'))
            .join(' ');
        const chosen = glyphClasses(option.querySelector('i'));
        assert.ok(chosen.length > 0, 'the picker offered an option with no glyph class at all');
        option.click();
        await settleEntryRoute();
        assert.equal(
          glyphClasses(headingMedallion()?.querySelector('i')),
          chosen,
          'the tile at the top of the screen kept the glyph on disk while the picker trigger ' +
            'and the player preview both moved to the buffered one'
        );
      });
    });

    // ── AND THE WORLD TOOL ENTRY INHERITS IT (issue 1373) ────────────────────────────
    describe('world tool entry crumb (issue 1373)', () => {
      /** One NAMED world tool: a breadcrumb is about a name, so the id-only default is mute. */
      const WORLD_TOOLS = Object.freeze([Object.freeze({ id: 'pick', name: 'Mining Pick' })]);

      async function settleToolEntryRoute() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      const toolCrumbText = () =>
        target
          .querySelector('[data-breadcrumb-world-scoped="world-tool-entry"]')
          ?.textContent?.trim();

      const toolHeadingText = () =>
        target.querySelector('[data-world-tool-entry-heading] .manager-title')?.textContent?.trim();

      /** Open `pick`'s world entry editor the way a GM does: rail, then the row's pen. */
      async function openPickEntry(mountOptions = {}) {
        await mountWithRealStore({ worldTools: [...WORLD_TOOLS], ...mountOptions });
        worldNavItem('tool-catalogue').click();
        await settleToolEntryRoute();
        const open = target.querySelector(
          '[data-scoped-list-row="pick"] [data-scoped-list-action="open-entry"]'
        );
        assert.ok(
          Boolean(open),
          'the tool catalogue rendered no open-entry action for `pick`, so nothing below ' +
            'reaches the editor this block is about'
        );
        open.click();
        await settleToolEntryRoute();
        assert.equal(
          target.querySelector('.fabricate-manager').dataset.managerView,
          'world-tool-entry',
          'the row pen did not commit the tool entry route'
        );
      }

      /** Type into the buffered display-label field, which is the only thing that moves the
       * draft: it is seeded from the persisted record, so a click cannot dirty it. */
      async function typeToolName(value) {
        const field = target.querySelector('[data-world-tool-entry-name]');
        assert.ok(Boolean(field), 'the tool entry editor rendered no display-label field');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await settleToolEntryRoute();
      }

      it('opens with the crumb on the persisted name', async () => {
        await openPickEntry();
        assert.equal(toolCrumbText(), 'Mining Pick');
      });

      it('FOLLOWS the buffered name in the last crumb, before any Save', async () => {
        await openPickEntry();
        await typeToolName('Miners Pick');
        assert.equal(
          toolHeadingText(),
          'Miners Pick',
          'the heading did not move, so the crumb assertion below would be measuring the ' +
            'wrong failure'
        );
        assert.equal(
          toolCrumbText(),
          'Miners Pick',
          'the trail still names the PERSISTED Tool under a heading that names the draft — ' +
            'the inherited crumb never reached this route'
        );
      });

      it('falls back to the ROUTE TITLE in the crumb when the buffered name is emptied', async () => {
        await openPickEntry();
        await typeToolName('');
        assert.equal(
          toolCrumbText(),
          'Tool entry',
          'an authored empty name must reach the crumb — `??` on "no editor", never `||` on ' +
            '"nothing typed"'
        );
      });

      it('offers the player characters in the `Preview as` picker, and nothing else', async () => {
        // Maintainer defect report: the picker offered `No actor` alone. The root read
        // `services.getWorldActors`, which the narrowed bag it receives never carried, so the
        // roster was empty in every world. It now reads the store's published `actorOptions`.
        await openPickEntry({
          actorOptions: [
            { uuid: 'Actor.mira', id: 'mira', name: 'Mira', img: '', isPlayerCharacter: true },
            { uuid: 'Actor.wolf', id: 'wolf', name: 'Dire Wolf', img: '', isPlayerCharacter: false },
          ],
        });
        const picker = '.fabricate-select-trigger[data-tool-preview-actor]';
        assert.ok(
          Boolean(target.querySelector(picker)),
          'the world tool entry rendered no Preview as picker'
        );
        assert.equal(
          assertSelectHasResolvedName(target, picker),
          'Preview as actor',
          'the kicker above it is a paragraph, so the trigger keeps its own name string'
        );
        assert.deepEqual(
          selectOptionLabels(target, picker),
          ['No actor', 'Mira'],
          'the picker must list the player character and leave the bestiary out'
        );
        // The no-actor sentinel carries the primitive's own handle for an empty value, because a
        // `data-popover-option=""` would be no handle at all.
        assert.deepEqual(
          selectOptionValues(target, picker),
          ['__unchanged__', 'Actor.mira'],
          'and it must offer each one by UUID'
        );
      });
    });

    // ── ONE GAME-WORLD ITEM IS ONE WORLD TOOL (issue 1373) ──────────────────────────────
    describe('world Tool creation from an Item drop (issue 1373)', () => {
      const HAMMER = Object.freeze({
        uuid: 'Item.smith-hammer',
        name: 'Smith Hammer',
        img: 'icons/tools/smithing/hammer-worn-steel-grey.webp',
        description: 'A well-balanced forge hammer.',
      });
      const AWL = Object.freeze({
        uuid: 'Compendium.fabricate.tools.Item.bone-awl',
        name: 'Bone Awl',
        img: '',
        description: '',
      });
      const SOURCES = Object.freeze({ [HAMMER.uuid]: HAMMER, [AWL.uuid]: AWL });

      async function settleDrop() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      async function goToToolCatalogue() {
        worldNavItem('tool-catalogue').click();
        await settleDrop();
        assert.ok(
          Boolean(target.querySelector('[data-item-drop-zone="tool-create"]')),
          'the catalogue rendered no creation drop zone, so nothing below drops anywhere'
        );
      }

      /**
       * Open the world Tools Catalogue over a real corpus, with the resolver seam wired.
       *
       * @param {Array<object>} worldTools the world tool corpus to start from.
       * @returns {Promise<object>} the mounted admin store.
       */
      async function openToolCatalogue(worldTools) {
        const store = await mountWithRealStore({
          worldTools,
          componentServices: { resolveToolSource: async (uuid) => SOURCES[uuid] ?? null },
        });
        await goToToolCatalogue();
        return store;
      }

      const worldToolIds = () =>
        scopeStores.tool.corpus().entities.map((entity) => String(entity?.id ?? ''));
      const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;
      const entryName = () => target.querySelector('[data-world-tool-entry-name]')?.value ?? '';

      /**
       * Drop one Item on the creation zone, capturing what the GM is told while it happens.
       *
       * @param {string} uuid
       * @returns {Promise<string[]>} the info toasts raised by the drop.
       */
      async function dropItem(uuid) {
        const messages = [];
        const previousUi = globalThis.ui;
        globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
        try {
          dispatchDrop(target.querySelector('[data-item-drop-zone="tool-create"]'), {
            type: 'Item',
            uuid,
          });
          await settleDrop();
          return messages;
        } finally {
          if (previousUi === undefined) delete globalThis.ui;
          else globalThis.ui = previousUi;
        }
      }

      it('mints ONE world Tool when the same Item is dropped twice', async () => {
        await openToolCatalogue([]);

        const firstDrop = await dropItem(HAMMER.uuid);
        assert.deepEqual(firstDrop, [], 'the first drop is a plain creation and says nothing');
        assert.equal(worldToolIds().length, 1, 'the first drop creates the record');
        assert.equal(managerView(), 'world-tool-entry', 'and lands the GM on it');
        const created = worldToolIds()[0];

        // BACK TO THE CATALOGUE AND DROP THE SAME ITEM AGAIN.
        await goToToolCatalogue();
        const secondDrop = await dropItem(HAMMER.uuid);

        assert.deepEqual(
          worldToolIds(),
          [created],
          'a second drop of the SAME Item must not mint a second world Tool: the id is fresh ' +
            'every time, so `createEntity`’s id dedupe cannot see the collision'
        );
        assert.equal(
          managerView(),
          'world-tool-entry',
          'the drop still goes somewhere — a drop that appears to do nothing is the defect ' +
            'this screen just spent a round removing'
        );
        assert.equal(entryName(), HAMMER.name, 'and it is the record the Item already had');
        assert.equal(secondDrop.length, 1, 'the GM is TOLD they landed on an existing record');
        assert.match(secondDrop[0], /Smith Hammer/, 'and the toast names it');
      });

      it('resolves the drop through the whole source-reference union, not one field', async () => {
        // THE UNION IS THE SHARED WALK, not a fourth comparison written at the call site.
        await openToolCatalogue([
          {
            id: 'legacy-hammer',
            name: 'Legacy Hammer',
            registeredItemUuid: 'Item.some-other-item',
            aliasItemUuids: [HAMMER.uuid],
          },
        ]);

        const messages = await dropItem(HAMMER.uuid);

        assert.deepEqual(
          worldToolIds(),
          ['legacy-hammer'],
          'an ALIAS reference is still this Item’s world Tool'
        );
        assert.equal(managerView(), 'world-tool-entry');
        assert.equal(entryName(), 'Legacy Hammer');
        assert.match(messages[0] ?? '', /Legacy Hammer/);
      });

      it('reuses a world-DISABLED record, and says that is what happened', async () => {
        // THE DECISION, PINNED. `enabled` is the world master switch.
        const store = await openToolCatalogue([
          { id: 'shelved', name: 'Shelved Hammer', originItemUuid: HAMMER.uuid },
        ]);
        // Disabled through the REAL write family.
        assert.equal(await store.worldScope.tool.setWorldEnabled('shelved', false), true);
        await settleDrop();

        const messages = await dropItem(HAMMER.uuid);

        assert.deepEqual(worldToolIds(), ['shelved'], 'a disabled record is still the record');
        assert.equal(managerView(), 'world-tool-entry');
        assert.match(messages[0] ?? '', /Shelved Hammer/, 'the toast names the record');
        assert.match(
          messages[0] ?? '',
          /disabled/i,
          'and it names the master switch, which is the whole difference from the enabled case'
        );
      });

      it('still creates a SECOND world Tool for a DIFFERENT Item', async () => {
        // THE NON-VACUITY HALF, and without it the repair is satisfiable by a zone that refuses
        // every drop. Two different Items are two world Tools, which is the whole premise of a
        // catalogue whose records each ARE a game-world Item.
        await openToolCatalogue([]);
        await dropItem(HAMMER.uuid);
        await goToToolCatalogue();
        await dropItem(AWL.uuid);

        assert.equal(
          worldToolIds().length,
          2,
          'a different source Item is a different world Tool'
        );
        assert.equal(entryName(), AWL.name, 'and the GM lands on the one they just made');
      });
    });

    // ── THE WORLD COMPONENT CATALOGUE'S CREATION ZONE (issue 1371) ────────────────────────
    describe('the world Component catalogue mints ONE record per source Item', () => {
      const RESIN = Object.freeze({
        uuid: 'Item.resin',
        name: 'Wildwood Resin',
        img: 'icons/commodities/tree/sap-drop-amber.webp',
        description: 'Tapped from an ironwood.',
      });
      const SALT = Object.freeze({
        uuid: 'Item.salt',
        name: 'Unbound Salt',
        img: 'icons/commodities/materials/salt-pile-white.webp',
        description: '',
      });
      // THE TWO COMPENDIUM SHAPES, and the resolver has to answer BOTH.
      const PACKED = Object.freeze({
        uuid: 'Compendium.p.q.Item.b',
        name: 'Packed Ore',
        img: 'icons/commodities/stone/ore-chunk-brown.webp',
        description: '',
      });
      const PACKED_LEGACY = Object.freeze({ ...PACKED, uuid: 'Compendium.p.b', name: 'Older Ore' });
      const COMPONENT_SOURCES = Object.freeze({
        [RESIN.uuid]: RESIN,
        [SALT.uuid]: SALT,
        [PACKED.uuid]: PACKED,
        [PACKED_LEGACY.uuid]: PACKED_LEGACY,
      });

      async function settleDrop() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      async function goToComponentCatalogue() {
        worldNavItem('component-catalogue').click();
        await settleDrop();
        assert.ok(
          Boolean(target.querySelector('[data-item-drop-zone="component-create"]')),
          'the catalogue rendered no creation drop zone, so nothing below drops anywhere'
        );
      }

      /**
       * Open the world Component Catalogue over a real corpus, with the resolver seam wired.
       *
       * @param {Array<object>} worldComponents the corpus to start from.
       * @returns {Promise<object>} the mounted admin store.
       */
      async function openComponentCatalogue(worldComponents) {
        const store = await mountWithRealStore({
          worldComponents,
          componentServices: { resolveToolSource: async (uuid) => COMPONENT_SOURCES[uuid] ?? null },
        });
        await goToComponentCatalogue();
        return store;
      }

      const worldComponentIds = () =>
        scopeStores.component.corpus().entities.map((entity) => String(entity?.id ?? ''));
      const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;

      /**
       * Drop one payload on the creation zone, capturing what the GM is told while it happens.
       * the embedded-uuid gate FAILS CLOSED, so without a parser every drop is refused and every
       * assertion below would pass for a fixture reason rather than a behavioural one. The stub
       * answers the shape the real parser does — `embedded` is the segment pairs after the
       * primary document — so `Actor.a.Item.b` reports one embedded pair and `Compendium.p.b`
       * reports none.
       *
       * @param {object} payload the raw drag payload.
       * @returns {Promise<{info: string[], warn: string[]}>} the toasts the drop raised.
       */
      async function dropPayload(payload, { withParser = true } = {}) {
        const info = [];
        const warn = [];
        const previousUi = globalThis.ui;
        const previousFoundry = globalThis.foundry;
        globalThis.ui = {
          notifications: {
            info: (message) => info.push(message),
            warn: (message) => warn.push(message),
          },
        };
        globalThis.foundry = {
          ...(previousFoundry ?? {}),
          utils: {
            ...(previousFoundry?.utils ?? {}),
            parseUuid: parseUuidDouble,
          },
        };
        // THE ONE CALLER THAT ASKS FOR NO PARSER AT ALL gets `foundry.utils` WITHOUT the key,
        // rather than a `parseUuid` set to something falsy: the gate tests `typeof … !== 'function'`
        // and an absent key is the shape a client actually presents — an older core, a partial
        // shim, or the gate running before `foundry` is populated.
        if (!withParser) delete globalThis.foundry.utils.parseUuid;
        try {
          dispatchDrop(target.querySelector('[data-item-drop-zone="component-create"]'), payload);
          await settleDrop();
          return { info, warn };
        } finally {
          if (previousUi === undefined) delete globalThis.ui;
          else globalThis.ui = previousUi;
          if (previousFoundry === undefined) delete globalThis.foundry;
          else globalThis.foundry = previousFoundry;
        }
      }

      it('mints ONE record when the same Item is dropped twice, and navigates to the first', async () => {
        await openComponentCatalogue([]);

        const first = await dropPayload({ type: 'Item', uuid: RESIN.uuid });
        assert.deepEqual(first.info, [], 'the first drop is a plain creation and says nothing');
        assert.equal(worldComponentIds().length, 1);
        assert.equal(managerView(), 'world-component-entry', 'and lands the GM on it');
        const created = worldComponentIds()[0];

        await goToComponentCatalogue();
        const second = await dropPayload({ type: 'Item', uuid: RESIN.uuid });

        assert.equal(worldComponentIds().length, 1, 'the second drop mints NOTHING');
        assert.equal(second.info.length, 1, 'and says so rather than appearing to do nothing');
        assert.deepEqual(worldComponentIds(), [created], 'the record is the one that existed');
        assert.equal(managerView(), 'world-component-entry');
      });

      it('resolves through the whole source-reference union, not one field', async () => {
        // A RE-POINTED LINK keeps its previous uuid as an ALIAS. Comparing `registeredItemUuid`
        // directly mints a duplicate for exactly the records a GM has already tidied, and the
        // origin case above stays green while it does.
        await openComponentCatalogue([
          {
            id: 'existing',
            name: 'Older Resin',
            originItemUuid: 'Item.something-else',
            registeredItemUuid: 'Item.something-else',
            aliasItemUuids: [RESIN.uuid],
          },
        ]);

        const dropped = await dropPayload({ type: 'Item', uuid: RESIN.uuid });

        assert.deepEqual(worldComponentIds(), ['existing'], 'the ALIAS match mints nothing');
        assert.equal(dropped.info.length, 1);
      });

      it('REFUSES an embedded Item in all three of its shapes', async () => {
        // `Actor.a.Item.b`, an unlinked token's `Scene.s.Token.t.Actor.a.Item.b`, and a
        // compendium actor's `Compendium.p.Actor.a.Item.b`. A `startsWith('Actor.')` predicate
        // catches only the first — and the token shape is the one a GM reaches by dragging off a
        // token sheet.
        await openComponentCatalogue([]);

        for (const uuid of [
          'Actor.a.Item.b',
          'Scene.s.Token.t.Actor.a.Item.b',
          'Compendium.p.Actor.a.Item.b',
        ]) {
          const refused = await dropPayload({ type: 'Item', uuid });
          assert.deepEqual(worldComponentIds(), [], `${uuid} minted nothing`);
          assert.equal(refused.warn.length, 1, `${uuid} told the GM why`);
        }
      });

      it('and still MINTS from a compendium drag, in BOTH shapes core has emitted', async () => {
        // THE POSITIVE CONTROL for the refusal.
        await openComponentCatalogue([]);

        const modern = await dropPayload({ type: 'Item', uuid: 'Compendium.p.q.Item.b' });
        assert.equal(worldComponentIds().length, 1, 'a compendium Item is a world component');
        assert.deepEqual(modern.warn, [], 'and nothing refused it');
        assert.equal(managerView(), 'world-component-entry');

        await goToComponentCatalogue();
        const legacy = await dropPayload({ type: 'Item', pack: 'p', id: 'b' });
        assert.equal(worldComponentIds().length, 2, 'and so is one dragged the legacy way');
        assert.deepEqual(legacy.warn, []);
      });

      it('and REFUSES a uuid the parser cannot read, because the gate fails CLOSED', async () => {
        // THE BRANCH THIS MEASURES IS THE NULL RETURN.
        await openComponentCatalogue([]);

        const refused = await dropPayload({ type: 'Item', uuid: 'Actor.a.Item' });
        assert.deepEqual(worldComponentIds(), [], 'it minted nothing');
        assert.equal(refused.warn.length, 1, 'and told the GM why');
      });

      it('and a uuid that parses but resolves to nothing is DROPPED SILENTLY, which is a gap', async () => {
        // RECORDED RATHER THAN REPAIRED, and asserted so it is recorded in a form that cannot rot.
        await openComponentCatalogue([]);

        const unresolved = await dropPayload({ type: 'Item', uuid: 'nonsense' });
        assert.deepEqual(worldComponentIds(), [], 'nothing is minted from an unresolvable uuid');
        assert.deepEqual(
          unresolved.warn,
          [],
          'and — today — nothing is said either; see the note above before "fixing" this line'
        );

        // THE POSITIVE CONTROL ON THE FIXTURE.
        const resolved = await dropPayload({ type: 'Item', uuid: RESIN.uuid });
        assert.equal(worldComponentIds().length, 1);
        assert.deepEqual(resolved.warn, []);
      });

      it('and refuses EVERY drop when there is no parser to ask, rather than accepting them', async () => {
        // THE FAIL-CLOSED DIRECTION, WHICH NOTHING ASSERTED. Round 1 wrote a gate that answered
        // `false` — "not embedded, go ahead" — whenever `foundry.utils.parseUuid` was missing, and
        // every test above seeds the parser, so the branch that decides what happens WITHOUT one
        // was never executed. A gate that fails open on an absent parser is not a gate: the exact
        // client state that removes the check is the one where the check matters, because nothing
        // else in this path distinguishes a world Item from an actor's embedded copy.
        await openComponentCatalogue([]);

        const refused = await dropPayload({ type: 'Item', uuid: RESIN.uuid }, { withParser: false });
        assert.deepEqual(
          worldComponentIds(),
          [],
          'with no parser, even a plain world Item mints nothing'
        );
        assert.equal(refused.warn.length, 1, 'and the GM is told, rather than left with silence');

        // THE POSITIVE CONTROL ON THE FIXTURE. The very same payload with the parser present is
        // accepted, so the refusal above is the ABSENT PARSER and not a broken drop fixture.
        const accepted = await dropPayload({ type: 'Item', uuid: RESIN.uuid });
        assert.equal(worldComponentIds().length, 1);
        assert.deepEqual(accepted.warn, []);
      });
    });

    // ── THE WORLD COMPONENT ENTRY SAYS THERE ARE UNSAVED CHANGES (issue 1371, round 5) ──
    describe('world component entry unsaved marker (issue 1371)', () => {
      // A SOURCE-LESS record, and that is load-bearing rather than incidental.
      const UNBOUND_SALT = Object.freeze({
        id: 'lab-unbound-salt',
        name: 'Unbound Salt',
        description: 'Catalogued from a merchant\u2019s ledger, with no game-world Item behind it.',
      });

      async function settleEntryRoute() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      const unsavedMarker = () =>
        target.querySelector('[data-world-component-entry-unsaved]')?.textContent?.trim();
      const saveDisabled = () =>
        target.querySelector('[data-world-component-save]')?.disabled === true;

      /**
       * Open the entry the way a GM does: the world rail, then the row's own open action.
       *
       * @returns {Promise<object>} the real admin store, for a caller that has to settle it.
       */
      async function openSaltEntry() {
        const store = await mountWithRealStore({ worldComponents: [{ ...UNBOUND_SALT }] });
        worldNavItem('component-catalogue').click();
        await settleEntryRoute();
        const open = target.querySelector(
          `[data-scoped-list-row="${UNBOUND_SALT.id}"] [data-scoped-list-action="open-entry"]`
        );
        assert.ok(
          Boolean(open),
          'the component catalogue rendered no open-entry action, so nothing below reaches the ' +
            'entry this block is about'
        );
        open.click();
        await settleEntryRoute();
        assert.equal(
          target.querySelector('.fabricate-manager').dataset.managerView,
          'world-component-entry',
          'the row action did not commit the entry route'
        );
        return store;
      }

      /**
       * Type into the buffered name field. An `input` event is the only thing that moves the
       * draft: it is seeded from the persisted record, so a click cannot dirty it.
       *
       * @param {string} value the name to type.
       */
      async function typeName(value) {
        const field = target.querySelector('[data-scoped-entry-name]');
        assert.ok(Boolean(field), 'the entry rendered no editable name field');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await settleEntryRoute();
      }

      it('rests with NO marker and a disabled Save', async () => {
        await openSaltEntry();
        assert.ok(
          !target.querySelector('[data-world-component-entry-unsaved]'),
          'a freshly-opened entry has nothing pending, so announcing unsaved changes would be a ' +
            'permanent decoration rather than a state'
        );
        assert.ok(saveDisabled(), 'and the Save is off, because there is nothing to write');
      });

      it('announces the pending edit and arms the Save after ONE keystroke', async () => {
        await openSaltEntry();
        await typeName('Bound Salt');
        assert.equal(
          target.querySelector('[data-scoped-entry-name]').value,
          'Bound Salt',
          'the keystroke never reached the draft, so both assertions below are vacuous'
        );
        assert.equal(
          unsavedMarker(),
          'Unsaved changes',
          'the GM holds an edit the record does not carry, and the header must say so before ' +
            'they navigate away from it'
        );
        assert.ok(
          !saveDisabled(),
          'and the Save is armed: the marker and the Save read one dirty flag, and a screen ' +
            'showing a pending edit while refusing to write it is the failure here'
        );
      });

      // ── AND SOMETHING PRESSES IT (issue 1371 r19-entry2) ────────────────────────────────

      /**
       * Give the world a vocabulary, so the category picker and the tag run have something to
       * offer. The default leg is `null` — a world with none authored — and the entry withholds
       * both controls over it, so a case that stages them has to author them first.
       *
       * @param {object} store the real admin store.
       * @returns {Promise<void>}
       */
      async function authorVocabulary(store) {
        scopeStores.vocabulary = {
          corpus: () => ({
            componentCategories: [{ id: 'Raw' }],
            componentTags: [{ id: 'ore' }],
            recipeCategories: [],
          }),
        };
        await store.refresh();
        await settleEntryRoute();
      }

      /** The world record as a reload would read it: the entity, and its world defaults. */
      const persistedSalt = () => {
        const corpus = scopeStores.component.get();
        return {
          name: corpus.entities.find((entry) => entry.id === UNBOUND_SALT.id)?.name,
          category: corpus.defaults[UNBOUND_SALT.id]?.category,
          tags: corpus.defaults[UNBOUND_SALT.id]?.tags,
        };
      };

      it('CLICKING the Save lands the staged name, category and tag on the world corpus, and the marker goes', async () => {
        const store = await openSaltEntry();
        await authorVocabulary(store);
        await typeName('Bound Salt');
        target.querySelector('[data-scoped-entry-category-input]').click();
        await settleEntryRoute();
        const raw = [...target.querySelectorAll('[data-popover-option]')].find(
          (option) => option.textContent.trim() === 'Raw'
        );
        assert.ok(Boolean(raw), 'the category picker offered nothing, so the stage below is vacuous');
        raw.click();
        await settleEntryRoute();
        const ore = target.querySelector('[data-scoped-entry-tag="ore"]');
        assert.ok(Boolean(ore), 'the tag run offered nothing, so the stage below is vacuous');
        ore.click();
        await settleEntryRoute();

        assert.deepEqual(
          persistedSalt(),
          { name: 'Unbound Salt', category: undefined, tags: undefined },
          'THREE EDITS, ZERO WRITES so far (M34) — which is what makes the click below the thing being measured'
        );
        assert.equal(unsavedMarker(), 'Unsaved changes');

        const save = target.querySelector('[data-world-component-save]');
        assert.ok(Boolean(save) && !save.disabled, 'the Save is there and armed');
        save.click();
        await settleEntryRoute();

        assert.deepEqual(
          persistedSalt(),
          { name: 'Bound Salt', category: 'Raw', tags: ['ore'] },
          'the click carried all three staged sections through the shell to the world corpus'
        );
        assert.ok(
          !target.querySelector('[data-world-component-entry-unsaved]'),
          'and the marker goes, because there is nothing pending any more'
        );
        assert.ok(saveDisabled(), 'and the Save disarms');
      });
    });

    describe('a dirty world entry guards the way out (issue 1705)', () => {
      /** Each entry route, with the corpus that reaches it and the content key its own prompt asks
       * with, which is what says the answer came from this row's helper and not another's. */
      const ENTRY_ROWS = [
        {
          view: 'world-essence-entry',
          catalogue: 'world-essences',
          leaf: 'essence-catalogue',
          scope: 'essence',
          mount: { worldEssences: [{ id: 'ash', name: 'Ash' }] },
          id: 'ash',
          name: 'Ash',
          field: '[data-scoped-entry-name]',
          prompt: 'FABRICATE.Admin.Manager.Essence.DiscardDirtyContent',
        },
        {
          view: 'world-tool-entry',
          catalogue: 'world-tools',
          leaf: 'tool-catalogue',
          scope: 'tool',
          mount: { worldTools: [{ id: 'pick', name: 'Mining Pick' }] },
          id: 'pick',
          name: 'Mining Pick',
          field: '[data-world-tool-entry-name]',
          prompt: 'FABRICATE.Admin.Manager.Tools.DiscardDirtyEntryContent',
        },
        {
          view: 'world-component-entry',
          catalogue: 'world-components',
          leaf: 'component-catalogue',
          scope: 'component',
          // Source-less, so the identity card offers the editable name rather than the locked one.
          mount: { worldComponents: [{ id: 'salt', name: 'Unbound Salt' }] },
          id: 'salt',
          name: 'Unbound Salt',
          field: '[data-scoped-entry-name]',
          prompt: 'FABRICATE.Admin.Manager.Component.DiscardDirtyContent',
        },
      ];

      const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;

      /** The record as a reload would read it, which is the only thing a Save moves. */
      const persistedName = (row) =>
        scopeStores[row.scope].get().entities.find((entry) => entry.id === row.id)?.name;

      /** Open the row's entry, rename it, leave by the catalogue crumb; answer the prompts raised. */
      async function leaveDirtyEntry(row, answer) {
        const prompts = [];
        await mountWithRealStore({
          ...row.mount,
          choiceDialog: async ({ content }) => {
            prompts.push(String(content));
            return answer;
          },
        });
        worldNavItem(row.leaf).click();
        await settleRouteExit();
        const open = target.querySelector(
          `[data-scoped-list-row="${row.id}"] [data-scoped-list-action="open-entry"]`
        );
        assert.ok(Boolean(open), `the ${row.leaf} catalogue rendered no open-entry action`);
        open.click();
        await settleRouteExit();
        assert.equal(managerView(), row.view, 'the row action did not commit the entry route');

        const field = target.querySelector(row.field);
        assert.ok(Boolean(field), `the ${row.view} editor rendered no name field`);
        field.value = `${row.name} the Second`;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await settleRouteExit();
        assert.equal(
          target.querySelector(row.field).value,
          `${row.name} the Second`,
          'the keystroke never reached the draft, so the editor is clean and everything below ' +
            'passes over an exit that had nothing to guard'
        );

        const crumb = target.querySelector('[data-breadcrumb-world-scoped-catalogue]');
        assert.ok(Boolean(crumb), 'the entry route drew no catalogue crumb to leave by');
        crumb.click();
        await settleRouteExit();
        return prompts;
      }

      for (const row of ENTRY_ROWS) {
        it(`saves a dirty ${row.view} on the way out`, async () => {
          const prompts = await leaveDirtyEntry(row, 'save');
          assert.equal(prompts.length, 1, 'the exit raised exactly one prompt');
          assert.ok(
            prompts[0].includes(row.prompt),
            `and it was this row's own: ${row.view} must not answer through another row's helper`
          );
          assert.equal(
            persistedName(row),
            `${row.name} the Second`,
            'Save reached this entry editor’s own save, which is what lands the buffered name'
          );
          assert.equal(managerView(), row.catalogue, 'and a landed Save lets the GM go');
        });

        it(`discards a dirty ${row.view} on the way out`, async () => {
          const prompts = await leaveDirtyEntry(row, 'discard');
          assert.equal(prompts.length, 1, 'the exit raised exactly one prompt');
          assert.ok(prompts[0].includes(row.prompt), 'and it was this row’s own');
          assert.equal(
            persistedName(row),
            row.name,
            'a discarded exit writes nothing: the record on disk keeps the name it opened with'
          );
          assert.equal(managerView(), row.catalogue, 'and the GM leaves the editor');
        });
      }

      async function leaveDirtyEssenceForSystem(answer) {
        const prompts = [];
        const store = await mountWithRealStore({
          worldEssences: [{ id: 'ash', name: 'Ash' }],
          worldEssenceMembership: [
            { entityId: 'ash', systemId: 'sys2', enabled: false, inherit: {} },
          ],
          enableEssences: true,
          choiceDialog: async ({ content }) => {
            prompts.push(String(content));
            return answer;
          },
        });
        worldNavItem('essence-catalogue').click();
        await settleRouteExit();
        target
          .querySelector('[data-scoped-list-row="ash"] [data-scoped-list-action="open-entry"]')
          .click();
        await settleRouteExit();

        const field = target.querySelector('[data-scoped-entry-name]');
        field.value = 'Ash the Second';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await settleRouteExit();
        target.querySelector('[data-scoped-entry-system-rules="sys2"]').click();
        await settleRouteExit();
        return { prompts, store };
      }

      it('keeps a dirty world essence in place when cross-system navigation is cancelled', async () => {
        const { prompts, store } = await leaveDirtyEssenceForSystem('cancel');
        assert.equal(prompts.length, 1);
        assert.equal(managerView(), 'world-essence-entry');
        assert.equal(get(store.viewState).selectedSystem?.id, 'sys1');
        assert.equal(target.querySelector('[data-scoped-entry-name]')?.value, 'Ash the Second');
      });

      for (const answer of ['discard', 'save']) {
        it(`${answer}s a dirty world essence before opening its rules in another system`, async () => {
          const { prompts, store } = await leaveDirtyEssenceForSystem(answer);
          assert.equal(prompts.length, 1);
          assert.equal(managerView(), 'essences');
          assert.equal(get(store.viewState).selectedSystem?.id, 'sys2');
          assert.ok(
            target.querySelector('[data-essence-id="ash"].is-selected'),
            'the target rules list lost the essence id while the system selection settled'
          );
          assert.equal(
            persistedName(ENTRY_ROWS[0]),
            answer === 'save' ? 'Ash the Second' : 'Ash'
          );
        });
      }
    });

    // ── THE WORLD ESSENCE ENTRY HEADING NAMES THE DRAFT (issue 1372, parity round 5) ────
    describe('world essence entry heading (issue 1372)', () => {
      /** Two NAMED world essences: the heading is about a name, so an id-only corpus is mute. */
      const WORLD_ESSENCES = Object.freeze([
        Object.freeze({ id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'ember' }),
        Object.freeze({ id: 'brine', name: 'Brine' }),
      ]);

      async function settleEntryRoute() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      const headingText = () =>
        target
          .querySelector('[data-world-essence-entry-heading] .manager-title')
          ?.textContent?.trim();

      const subtitleText = () =>
        target.querySelector('[data-world-essence-entry-subline]')?.textContent?.trim();

      /** Open `ash`'s world entry editor the way a GM does: rail, then the row's pen. */
      async function openAshEntry() {
        await mountWithRealStore({ worldEssences: [...WORLD_ESSENCES] });
        worldNavItem('essence-catalogue').click();
        await settleEntryRoute();
        const open = target.querySelector(
          '[data-scoped-list-row="ash"] [data-scoped-list-action="open-entry"]'
        );
        assert.ok(
          Boolean(open),
          'the essence catalogue rendered no open-entry action for `ash`, so nothing below ' +
            'reaches the editor this block is about'
        );
        open.click();
        await settleEntryRoute();
        assert.equal(
          target.querySelector('.fabricate-manager').dataset.managerView,
          'world-essence-entry',
          'the row pen did not commit the entry route'
        );
      }

      /** Type into the buffered name field — an `input` event, which is the only thing that
       * moves the draft: it is seeded from the persisted record, so a click cannot dirty it. */
      async function typeName(value) {
        const field = target.querySelector('[data-scoped-entry-name]');
        assert.ok(Boolean(field), 'the entry editor rendered no name field');
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await settleEntryRoute();
      }

      it('opens on the persisted name', async () => {
        await openAshEntry();
        assert.equal(
          headingText(),
          'Ash',
          'an untouched editor must head the screen with the record on disk'
        );
      });

      it('FOLLOWS the buffered name as the GM types, before any Save', async () => {
        await openAshEntry();
        await typeName('Aetherlight');
        assert.equal(
          target.querySelector('[data-scoped-entry-name]').value,
          'Aetherlight',
          'the keystroke never reached the draft, so the heading assertion below is vacuous'
        );
        assert.equal(
          headingText(),
          'Aetherlight',
          'the heading still names the PERSISTED essence while the name field and the player ' +
            'preview both show the buffered one — one screen naming one essence two ways'
        );
      });

      it('leaves the USAGE SUBTITLE on the persisted record, which is a count of systems', async () => {
        await openAshEntry();
        const before = subtitleText();
        assert.ok(
          Boolean(before),
          'the heading block rendered no subtitle at all, so its stability below proves nothing'
        );
        await typeName('Aetherlight');
        assert.equal(
          subtitleText(),
          before,
          'a rename changed the count of systems using this essence, which no keystroke can do ' +
            'until the write lands'
        );
      });

      it('falls back to the ROUTE TITLE when the buffered name is emptied', async () => {
        // The same guard the missing-record path takes. A GM who clears the field is authoring
        // an empty name, and an empty `<h1>` is not a heading — this is what the route already
        // renders for a record whose persisted name is empty.
        await openAshEntry();
        await typeName('');
        assert.equal(headingText(), 'Essence entry');
      });

      // ── AND SO DOES THE REST OF THE CHROME (issue 1372, parity round 6) ──────────────

      const crumbText = () =>
        target
          .querySelector('[data-breadcrumb-world-scoped="world-essence-entry"]')
          ?.textContent?.trim();

      const headingMedallion = () =>
        target.querySelector('[data-world-essence-entry-heading] .fab-medallion');

      /** Pick a preset swatch in the entry editor's inline colour palette. */
      async function pickColour(token) {
        const swatch = target.querySelector(
          `[data-scoped-entry-colour] [data-manager-color-token="${token}"]`
        );
        assert.ok(Boolean(swatch), `the entry editor rendered no \`${token}\` colour swatch`);
        swatch.click();
        await settleEntryRoute();
      }

      it('opens with the crumb on the persisted name', async () => {
        await openAshEntry();
        assert.equal(
          crumbText(),
          'Ash',
          'an untouched editor must trail the record on disk, exactly as the heading does'
        );
      });

      it('FOLLOWS the buffered name in the last crumb, before any Save', async () => {
        await openAshEntry();
        await typeName('Aetherlight');
        assert.equal(
          headingText(),
          'Aetherlight',
          'the heading did not move, so the crumb assertion below would be measuring the ' +
            'wrong failure'
        );
        assert.equal(
          crumbText(),
          'Aetherlight',
          'the trail still names the PERSISTED essence under a heading that names the draft — ' +
            'one screen naming one essence two ways, one line apart'
        );
      });

      it('resolves the crumb GENERICALLY, so every scoped entry route inherits it', async () => {
        // The crumb is derived once for all three entry routes out of `SCOPED_ENTRY_ROUTES`.
        await openAshEntry();
        await typeName('Aetherlight');
        const leaf = target.querySelector('[data-breadcrumb-world-scoped]');
        assert.equal(
          leaf?.getAttribute('data-breadcrumb-world-scoped'),
          'world-essence-entry',
          'the buffered name is being rendered somewhere other than the shared entry leaf'
        );
        assert.equal(leaf.textContent.trim(), 'Aetherlight');
      });

      it('falls back to the ROUTE TITLE in the crumb when the buffered name is emptied', async () => {
        await openAshEntry();
        await typeName('');
        assert.equal(
          crumbText(),
          'Essence entry',
          'an authored empty name must reach the crumb — `??` on "no editor", never `||` on ' +
            '"nothing typed"'
        );
      });

      it('opens the heading MEDALLION on the persisted icon and colour', async () => {
        await openAshEntry();
        const medallion = headingMedallion();
        assert.ok(Boolean(medallion), 'the entry heading rendered no medallion');
        assert.equal(medallion.getAttribute('data-medallion-tint'), 'ember');
        assert.ok(
          medallion.querySelector('i')?.className.includes('fa-fire'),
          'the medallion opened on some icon other than the record on disk'
        );
      });

      it('FOLLOWS the buffered colour in the heading medallion, before any Save', async () => {
        await openAshEntry();
        await pickColour('lavender');
        assert.ok(
          target
            .querySelector('[data-scoped-entry-colour] [data-manager-color-token="lavender"]')
            ?.className.includes('is-selected'),
          'the swatch click never reached the draft, so the medallion assertion below is vacuous'
        );
        assert.equal(
          headingMedallion()?.getAttribute('data-medallion-tint'),
          'lavender',
          'the tile at the top of the screen still wears the colour on disk while the picker, ' +
            'the preview rail and the form tile have all moved'
        );
      });

      it('FOLLOWS the buffered icon in the heading medallion, before any Save', async () => {
        // The COLOUR case above and this one are not one test twice.
        await openAshEntry();
        const trigger = target.querySelector('.essence-icon-picker-trigger');
        assert.ok(Boolean(trigger), 'the entry editor rendered no icon picker');
        trigger.click();
        await settleEntryRoute();
        // The picker's option list is PORTALLED out of the page, so it is found on the document.
        const option = [...document.querySelectorAll('.essence-icon-picker-option')].find(
          (candidate) => !(candidate.querySelector('i')?.className ?? '').includes('fa-fire')
        );
        assert.ok(Boolean(option), 'the icon picker offered no glyph other than the persisted one');
        // The picker's own `<i>` carries ITS component's Svelte scope hash and the medallion's
        // carries none, so the two are compared on the glyph classes rather than verbatim.
        const glyphClasses = (element) =>
          (element?.className ?? '')
            .split(/\s+/)
            .filter((token) => token && !token.startsWith('svelte-'))
            .join(' ');
        const chosen = glyphClasses(option.querySelector('i'));
        assert.ok(chosen.length > 0, 'the picker offered an option with no glyph class at all');
        option.click();
        await settleEntryRoute();
        assert.equal(
          glyphClasses(headingMedallion()?.querySelector('i')),
          chosen,
          'the tile at the top of the screen kept the glyph on disk while the picker trigger ' +
            'and the player preview both moved to the buffered one'
        );
      });
    });

    // ── issue 1371 r17 ──────────────────────────────────────────────────────────────────
    describe('world component entry → system rules deep link, through the root (issue 1371 r17)', () => {
      // REVIEWER 6 (r13). `openSystemComponentRules(entityId, systemId)` seeds the id through
      // `resetComponentSelectionFor` inside `selectSystem`'s guarded callback, and its proof was
      // a source regex plus a VIEW-level case that mounted the rules list with the id already
      // set. Nothing exercised the wiring — `selectSystem` resolving, the switch effect stamping
      // its sentinel, the view receiving the seeded id — and wiring is covered only when it is
      // exercised. This walks it through the root: the world rail, the catalogue row's open
      // action, the entry's member-row `View system rules`, and the rules list's
      // `aria-current` row.
      const worldRecord = (id, name) =>
        Object.freeze({
          id,
          name,
          originItemUuid: `Item.${id}`,
          registeredItemUuid: `Item.${id}`,
          aliasItemUuids: [],
        });
      const inSystemRow = (id, name) => ({
        id,
        name,
        img: null,
        description: '',
        originItemUuid: `Item.${id}`,
        registeredItemUuid: `Item.${id}`,
        aliasItemUuids: [],
      });
      const ASH = worldRecord('ash', 'Ash');
      const COAL = worldRecord('coal', 'Coal');

      async function settleRoute() {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
        await tick();
        flushSync();
        await tick();
        flushSync();
      }

      const managerView = () => target.querySelector('.fabricate-manager').dataset.managerView;

      async function mountWithTwoMembers() {
        scopeStores = {
          component: scopeStore([{ ...ASH }, { ...COAL }], {
            membership: [
              { entityId: 'ash', systemId: 'sys1', inherit: { category: true } },
              { entityId: 'coal', systemId: 'sys1', inherit: { category: true } },
            ],
          }),
          essence: scopeStore(worldEntities(2, 'ess')),
          tool: scopeStore(worldEntities(1, 'tool')),
          vocabulary: null,
        };
        const forge = makeSystem({
          id: 'sys1',
          name: 'Forge',
          components: [inSystemRow('ash', 'Ash'), inSystemRow('coal', 'Coal')],
        });
        const alchemy = makeSystem({ id: 'sys2', name: 'Alchemy' });
        const systems = [forge, alchemy];
        const services = createServices(forge, [], [], {
          getCraftingSystemManager: () => ({
            getSystems: () => systems,
            getSystem: (id) => systems.find((system) => system.id === id) || null,
            // THE RULES LIST'S ROWS COME FROM HERE, not from `system.components` directly:
            getItems: (id) => systems.find((system) => system.id === id)?.components ?? [],
          }),
          getComponentScopeStore: () => scopeStores.component,
          getEssenceScopeStore: () => scopeStores.essence,
          getToolScopeStore: () => scopeStores.tool,
          getVocabularyScopeStore: () => scopeStores.vocabulary,
        });
        const store = createAdminStore(services);
        await store.refresh();
        target = document.createElement('div');
        document.body.appendChild(target);
        mounted = mount(Component, { target, props: { store, services: {} } });
        flushSync();
        await tick();
        flushSync();
        return store;
      }

      it('marks the linked component current on the rules list, not the first-sorted row', async () => {
        await mountWithTwoMembers();
        worldNavItem('component-catalogue').click();
        await settleRoute();
        const open = target.querySelector(
          '[data-scoped-list-row="coal"] [data-scoped-list-action="open-entry"]'
        );
        assert.ok(Boolean(open), 'the catalogue drew Coal with its open-entry action');
        open.click();
        await settleRoute();
        assert.equal(managerView(), 'world-component-entry', 'the GM is on the world entry');

        const link = target.querySelector(
          '[data-scoped-entry-systems="coal"] [data-scoped-entry-system-rules="sys1"]'
        );
        assert.ok(Boolean(link), 'the member row draws `View system rules` for Forge');
        link.click();
        await settleRoute();

        assert.equal(managerView(), 'components', 'the link lands on the rules list');
        const rows = [...target.querySelectorAll('.manager-component-row')].map((row) =>
          row.getAttribute('data-component-id')
        );
        assert.deepEqual(rows, ['ash', 'coal'], 'both members are drawn, Ash first');
        const current = [...target.querySelectorAll('.manager-component-row[aria-current="true"]')];
        assert.equal(current.length, 1, 'exactly one row is current');
        assert.equal(
          current[0].getAttribute('data-component-id'),
          'coal',
          'and it is the component whose entry the GM came from — not Ash, which M14 would ' +
            'have marked had the deep link dropped its id'
        );
      });
    });
  });
}
