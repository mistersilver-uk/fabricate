import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Migrated off the hand-rolled compiler (issue 1182). `createMountedComponentHarness`
// validates the full static dependency closure BEFORE mounting, so a `.svelte` this
// tree renders that the list omits fails with a named error instead of hanging the
// suite at the 300s timeout with `# cancelled N` and `# fail 0`.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-parties-tab-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/dragDrop.js',
    // The card's selection seam: capture-phase pointerdown/focusin, so a card can be
    // the inspector's selection target without being a control.
    'src/ui/svelte/actions/selectsParty.js',
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883) and ONE no-state primitive (issue 785).
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/RealmOverridePicker.svelte',
    'src/ui/svelte/apps/manager/PartyNameField.svelte',
    'src/ui/svelte/apps/manager/PartyMemberRow.svelte',
    'src/ui/svelte/apps/manager/PartyAddMemberPanel.svelte',
    'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte',
    'src/ui/svelte/apps/manager/PartyExpandedBody.svelte',
    'src/ui/svelte/apps/manager/GatheringPartiesTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/GatheringPartiesTab.svelte',
});

function makeParty(overrides = {}) {
  return {
    id: 'p1',
    name: 'Vanguard',
    enabled: false,
    memberCards: [],
    memberActorUuids: [],
    memberCount: 0,
    travelActor: null,
    travelActorUuid: '',
    staleTravelActor: null,
    overrideMode: 'none',
    overrideRealmIds: [],
    currentRealmEvidence: { source: 'unresolved', resolved: false, realms: [], staleRealmIds: [] },
    ...overrides,
  };
}

function makeParties(count) {
  return Array.from({ length: count }, (_, index) =>
    makeParty({ id: `p${index + 1}`, name: `Party ${index + 1}` })
  );
}

function mountTab(props = {}) {
  return harness.mount({ parties: [], systemId: 'sys-1', systemRealms: [], ...props });
}

function cards(root) {
  return root.querySelectorAll('.manager-travel-parties-row');
}

function press(node) {
  node.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  node.click();
  flushSync();
}

function typeSearch(root, value) {
  const input = root.querySelector('.manager-travel-parties-query');
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  flushSync();
  return input;
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('GatheringPartiesTab (mounted)', () => {
  it('renders the shared empty state with a create action when there are no parties', async () => {
    const created = [];
    const root = await mountTab({ parties: [], onCreateParty: () => created.push(true) });
    assert.equal(cards(root).length, 0);
    assert.ok(root.querySelector('[data-travel-parties-none]'), 'no-parties panel renders');
    root.querySelector('[data-manager-party-create]').click();
    flushSync();
    assert.deepEqual(created, [true]);
  });

  it('suppresses the search bar at one party and shows it at two', async () => {
    let root = await mountTab({ parties: makeParties(1) });
    assert.ok(!root.querySelector('.manager-travel-parties-query'), 'no search bar at one party');
    harness.remount();

    root = await mountTab({ parties: makeParties(2) });
    assert.ok(Boolean(root.querySelector('.manager-travel-parties-query')), 'search bar at two');
  });

  it('reports MATCHED of TOTAL, not page of total', async () => {
    const root = await mountTab({ parties: makeParties(5) });
    // Page size is 4, so a page-of-total counter would read "4 of 5".
    assert.equal(root.querySelector('[data-manager-party-match-count]').textContent.trim(), '5 of 5');
    typeSearch(root, 'Party 3');
    assert.equal(root.querySelector('[data-manager-party-match-count]').textContent.trim(), '1 of 5');
  });

  it('matches a member name as well as a party name', async () => {
    const root = await mountTab({
      parties: [
        makeParty({ id: 'p1', name: 'Wardens' }),
        makeParty({
          id: 'p2',
          name: 'Scouts',
          memberCards: [{ uuid: 'Actor.a', name: 'Alara', img: '', stale: false }],
          memberActorUuids: ['Actor.a'],
          memberCount: 1,
        }),
      ],
    });
    typeSearch(root, 'alara');
    assert.equal(cards(root).length, 1);
    assert.equal(cards(root)[0].getAttribute('data-manager-travel-party-id'), 'p2');
  });

  it('matches a travel-actor name', async () => {
    const root = await mountTab({
      parties: [
        makeParty({ id: 'p1', name: 'Wardens' }),
        makeParty({
          id: 'p2',
          name: 'Scouts',
          travelActorUuid: 'Actor.v',
          travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
        }),
      ],
    });
    typeSearch(root, 'vosk');
    assert.equal(cards(root).length, 1);
    assert.equal(cards(root)[0].getAttribute('data-manager-travel-party-id'), 'p2');
  });

  it('renders the shared filtered panel and NO card list when nothing matches', async () => {
    const root = await mountTab({ parties: makeParties(3) });
    typeSearch(root, 'zzz');
    assert.ok(Boolean(root.querySelector('[data-travel-parties-no-match]')), 'filtered panel');
    assert.ok(!root.querySelector('.manager-travel-parties-list'), 'no card list');
    assert.equal(cards(root).length, 0);
  });

  it('returns to page 1 on a search keystroke', async () => {
    const root = await mountTab({ parties: makeParties(9) });
    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.match(root.querySelector('[data-pagination-page]').textContent, /Page 2 of 3/);
    typeSearch(root, 'Party');
    assert.match(root.querySelector('[data-pagination-page]').textContent, /Page 1 of 3/);
  });

  it('clears the query when the search gate closes, so a delete cannot strand the pane', async () => {
    const root = await mountTab({ parties: makeParties(2) });
    typeSearch(root, 'Party 2');
    assert.equal(cards(root).length, 1);

    // The second party is deleted upstream: the search bar unmounts with it, so the
    // query must go too or nothing left on screen can clear the no-match state.
    await harness.setProps({ parties: makeParties(1) });
    assert.ok(!root.querySelector('.manager-travel-parties-query'), 'search bar is gone');
    assert.ok(!root.querySelector('[data-travel-parties-no-match]'), 'not stranded in no-match');
    assert.equal(cards(root).length, 1);
  });

  it('offers exactly 2/4/6/10 per page and defaults to 4', async () => {
    const root = await mountTab({ parties: makeParties(9) });
    const select = root.querySelector('[data-pagination-size]');
    // Counted, not merely present: the select renders unconditionally, so a presence
    // assertion cannot fail.
    assert.deepEqual(
      Array.from(select.querySelectorAll('option')).map((option) => option.value),
      ['2', '4', '6', '10']
    );
    assert.equal(cards(root).length, 4);
  });

  it('force-closes an open move drawer and travel-actor picker on a page-SIZE change', async () => {
    const root = await mountTab({
      parties: [
        makeParty({
          id: 'p1',
          name: 'Wardens',
          memberCards: [{ uuid: 'Actor.a', name: 'Alara', img: '', stale: false }],
          memberActorUuids: ['Actor.a'],
          memberCount: 1,
        }),
        ...makeParties(4).map((party, index) => makeParty({ id: `q${index}`, name: `Q${index}` })),
      ],
      actorOptions: [{ uuid: 'Actor.a', id: 'a', name: 'Alara', img: '', isPlayerCharacter: true }],
    });

    root.querySelector('.manager-party-member-move').click();
    flushSync();
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.ok(Boolean(root.querySelector('[data-manager-party-move-drawer]')), 'drawer opened');
    assert.ok(Boolean(root.querySelector('.manager-travel-popover')), 'picker opened');

    // A page CHANGE would unmount the keyed cards and close both incidentally; a page
    // SIZE change keeps them mounted, so it is the only case that proves the close.
    const select = root.querySelector('[data-pagination-size]');
    select.value = '6';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    flushSync();

    assert.ok(!root.querySelector('[data-manager-party-move-drawer]'), 'drawer closed');
    assert.ok(!root.querySelector('.manager-travel-popover'), 'picker closed');
  });

  it('selects a card on pointer and on focus, adds no tab stop, and marks it aria-current', async () => {
    const selections = [];
    const root = await mountTab({
      parties: makeParties(2),
      selectedPartyId: '',
      onSelectParty: (id) => selections.push(id),
    });

    const first = cards(root)[0];
    assert.ok(!first.hasAttribute('tabindex'), 'the card itself is not a tab stop');
    assert.ok(!first.hasAttribute('role') || first.getAttribute('role') === 'listitem');

    first.querySelector('.manager-party-name-input').dispatchEvent(
      new window.Event('pointerdown', { bubbles: true })
    );
    flushSync();
    assert.deepEqual(selections, ['p1']);

    cards(root)[1]
      .querySelector('.manager-party-name-input')
      .dispatchEvent(new window.Event('focusin', { bubbles: true }));
    flushSync();
    assert.deepEqual(selections, ['p1', 'p2']);

    await harness.setProps({ selectedPartyId: 'p2' });
    assert.equal(cards(root)[1].getAttribute('aria-current'), 'true');
    assert.ok(!cards(root)[0].hasAttribute('aria-current'));
  });

  it('lets an inner control select its own card AND still run its own handler exactly once', async () => {
    const selections = [];
    const deleted = [];
    const root = await mountTab({
      parties: makeParties(2),
      selectedPartyId: '',
      onSelectParty: (id) => selections.push(id),
      onDeleteParty: (id) => deleted.push(id),
    });

    press(root.querySelector('[data-manager-party-delete="p2"]'));
    assert.deepEqual(deleted, ['p2'], 'the control ran its own handler once');
    assert.deepEqual(selections, ['p2'], 'and selected its own card, not another');
  });

  it('does not re-select the already-selected card, so a live validation error survives a press', async () => {
    const selections = [];
    const root = await mountTab({
      parties: makeParties(2),
      selectedPartyId: 'p1',
      onSelectParty: (id) => selections.push(id),
    });
    press(cards(root)[0].querySelector('[data-manager-party-delete="p1"]'));
    assert.deepEqual(selections, [], 'selectParty clears store errors, so it must not re-fire');
  });

  it('keeps an uncommitted name draft across a selection change', async () => {
    const root = await mountTab({ parties: makeParties(2), selectedPartyId: '' });
    const input = cards(root)[0].querySelector('.manager-party-name-input');
    input.value = 'Half-typed';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    await harness.setProps({ selectedPartyId: 'p2' });
    // The `{#each}` key is what guarantees this: an unkeyed list would re-create the
    // input and silently discard the edit in progress.
    assert.equal(cards(root)[0].querySelector('.manager-party-name-input').value, 'Half-typed');
  });

  it('keeps the inspector selection when the selected party is filtered off the page', async () => {
    const selections = [];
    const root = await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens' }), makeParty({ id: 'p2', name: 'Scouts' })],
      selectedPartyId: 'p1',
      onSelectParty: (id) => selections.push(id),
    });
    typeSearch(root, 'scouts');
    assert.equal(cards(root).length, 1);
    assert.deepEqual(selections, [], 'a search must not silently retarget the inspector');
  });

  it('routes a rejected member add to the card that issued it, and to no other', async () => {
    const root = await mountTab({
      parties: makeParties(2),
      actorOptions: [{ uuid: 'Actor.a', id: 'a', name: 'Alara', img: '', isPlayerCharacter: true }],
    });
    root.querySelector('[data-manager-party-add-open="p2"]').click();
    flushSync();
    root.querySelector('[data-manager-party-candidate="Actor.a"]').click();
    flushSync();

    await harness.setProps({
      travelError: 'This actor already belongs to another enabled party.',
      travelFieldErrors: { members: 'This actor already belongs to another enabled party.' },
    });

    const second = cards(root)[1];
    assert.ok(Boolean(second.querySelector('#party-member-error-p2')), 'error on the issuing card');
    assert.ok(!cards(root)[0].querySelector('.manager-party-field-error'), 'and on no other card');
    assert.ok(
      !root.querySelector('[data-manager-party-summary-error]'),
      'a field error does not also render the pane summary'
    );
  });

  it('routes a rejected travel-actor assignment beneath that card travel-actor panel', async () => {
    const root = await mountTab({ parties: makeParties(2) });
    const tile = root.querySelector('[data-manager-party-travel-actor="p2"]');
    const drop = new window.Event('drop', { bubbles: true });
    drop.preventDefault = () => {};
    drop.dataTransfer = { getData: () => JSON.stringify({ type: 'Actor', uuid: 'Actor.x' }) };
    tile.dispatchEvent(drop);
    flushSync();

    await harness.setProps({
      travelError: 'This travel actor is already used by another enabled party.',
      travelFieldErrors: {
        travelActor: 'This travel actor is already used by another enabled party.',
      },
    });

    assert.ok(Boolean(root.querySelector('#party-travel-actor-error-p2')));
    assert.equal(
      root.querySelector('[data-manager-party-travel-actor="p2"]').getAttribute('aria-describedby'),
      'party-travel-actor-error-p2'
    );
    assert.ok(!root.querySelector('#party-travel-actor-error-p1'));
  });

  it('renders a rejected ENABLE as the pane-level summary above the list', async () => {
    // `setPartyEnabled` passes no field context, and req 5 can reject an enable the
    // travel-actor gate allows, so the enable control is never the only feedback surface.
    const root = await mountTab({
      parties: [
        makeParty({ id: 'p1', name: 'Wardens', enabled: true, travelActorUuid: 'Actor.v' }),
        makeParty({ id: 'p2', name: 'Scouts' }),
      ],
    });
    root.querySelector('[data-manager-party-enable="p1"]').click();
    flushSync();

    await harness.setProps({ travelError: 'Only one enabled party may hold this actor.' });
    const summary = root.querySelector('[data-manager-party-summary-error]');
    assert.ok(Boolean(summary), 'a context-free error renders once above the card list');
    assert.match(summary.textContent, /Only one enabled party/);
  });

  it('falls back to the pane summary when the issuing card is filtered off the page', async () => {
    const root = await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens' }), makeParty({ id: 'p2', name: 'Scouts' })],
      actorOptions: [{ uuid: 'Actor.a', id: 'a', name: 'Alara', img: '', isPlayerCharacter: true }],
    });
    root.querySelector('[data-manager-party-add-open="p2"]').click();
    flushSync();
    root.querySelector('[data-manager-party-candidate="Actor.a"]').click();
    flushSync();
    await harness.setProps({
      travelError: 'This actor already belongs to another enabled party.',
      travelFieldErrors: { members: 'This actor already belongs to another enabled party.' },
    });
    typeSearch(root, 'wardens');

    assert.ok(!root.querySelector('#party-member-error-p2'), 'the issuing card is gone');
    assert.ok(
      Boolean(root.querySelector('[data-manager-party-summary-error]')),
      'so the error falls back to the summary rather than disappearing'
    );
  });

  it('keeps the realm-override gate lock inside [data-travel-panel="parties"]', async () => {
    const hint = 'Enable Travel & Realms to set a current-realm override.';
    const root = await mountTab({
      parties: makeParties(1),
      realmOverridesAvailable: false,
      realmOverridesUnavailableHint: hint,
    });
    const lock = root.querySelector(
      '[data-travel-panel="parties"] [data-party-realm-override-unavailable]'
    );
    assert.ok(Boolean(lock), 'viewLabCases.js:3269 matches on exactly this pair');
    assert.match(lock.textContent, /Enable Travel & Realms/);
    assert.ok(!root.querySelector('.manager-travel-parties-override-trigger'));
  });

  it('renders the realm-override picker through the SHIPPED default trigger mode', async () => {
    // Characterization for `SearchablePopover`'s untouched path: the World > Parties
    // travel-actor control opts into a new inline-search trigger, and 19 other consumers
    // must keep rendering a plain trigger button with a chevron and an in-popover search.
    const chosen = [];
    const root = await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens' })],
      systemRealms: [
        { id: 'r1', name: 'Northreach', enabled: true },
        { id: 'r2', name: 'Ashen March', enabled: true },
      ],
      onSetRealmOverride: (partyId, systemId, ids) => chosen.push([partyId, systemId, ids]),
    });

    const trigger = root.querySelector('.manager-travel-parties-override-trigger');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    trigger.click();
    flushSync();

    assert.ok(Boolean(root.querySelector('.manager-travel-popover-search input')), 'in-popover search');
    assert.ok(
      Boolean(root.querySelector('.manager-travel-parties-override-trigger')),
      'the trigger button stays mounted in the default mode'
    );
    Array.from(root.querySelectorAll('.manager-travel-option'))
      .find((option) => option.textContent.includes('Ashen March'))
      .click();
    flushSync();
    assert.deepEqual(chosen, [['p1', 'sys-1', ['r2']]]);
  });

  it('teaches SearchablePopover the pane scroller so a card picker is bounded by the pane', () => {
    // happy-dom returns a zero-valued `getBoundingClientRect`, so the horizontal clamp
    // cannot be proven by mounting. This pins the ancestor list itself, which is the
    // thing that changed: without the pane class the walk falls through to the manager
    // shell and a card's picker can be laid out past the pane's right edge.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/SearchablePopover.svelte'),
      'utf8'
    );
    const ancestorList = source
      .split('\n')
      .find((line) => line.includes("'.admin-main"));
    assert.ok(Boolean(ancestorList), 'getHorizontalBounds still walks a named ancestor list');
    assert.match(ancestorList, /\.manager-table-scroll/);
    assert.match(ancestorList, /\.manager-travel-parties/);
  });
});
