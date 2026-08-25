import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Migrated off the hand-rolled compiler (issue 1182): the shared harness validates the
// whole static dependency closure up front, so a `.svelte` the card renders that this
// list omits fails with a named error instead of hanging the suite (`# cancelled`).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-party-body-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/dragDrop.js',
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883) and ONE no-state primitive (issue 785).
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/RealmOverridePicker.svelte',
    'src/ui/svelte/apps/manager/PartyNameField.svelte',
    'src/ui/svelte/apps/manager/PartyMemberRow.svelte',
    'src/ui/svelte/apps/manager/PartyAddMemberPanel.svelte',
    'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte',
    'src/ui/svelte/apps/manager/PartyExpandedBody.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/PartyExpandedBody.svelte',
});

function makeParty(overrides = {}) {
  return {
    id: 'p1',
    name: 'Wardens',
    enabled: false,
    memberCards: [],
    memberActorUuids: [],
    memberCount: 0,
    travelActor: null,
    travelActorUuid: '',
    staleTravelActor: null,
    overrideMode: 'none',
    overrideRealmIds: [],
    ...overrides,
  };
}

function member(overrides = {}) {
  return { uuid: 'Actor.a', name: 'Alara', img: '', stale: false, ...overrides };
}

// Issue 1024: the projection the manager app hands down carries an `isPlayerCharacter`
// BOOLEAN and no longer carries a raw `type` — that field is dropped precisely because
// it is what an `actor.type === 'character'` filter grows back out of. The fixtures
// mirror the real projection, so a component that went back to reading `type` would
// filter everything out rather than pass.
// The last entry is issue 1024's regression guard and the ONLY fixture shape that can
// distinguish `isPlayerCharacter === true` from `isPlayerCharacter !== false`: an actor the
// projection never annotated at all. `isPlayerCharacter: false` is excluded by BOTH
// predicates, so a suite holding only that shape pins nothing about the strict test.
const actors = [
  { uuid: 'Actor.a', id: 'a', name: 'Alara', img: 'icons/a.webp', isPlayerCharacter: true },
  { uuid: 'Actor.b', id: 'b', name: 'Bromm', img: '', isPlayerCharacter: true },
  { uuid: 'Actor.n', id: 'n', name: 'Nasty NPC', img: '', isPlayerCharacter: false },
  { uuid: 'Actor.u', id: 'u', name: 'Unprojected Ancient', img: '' },
];

function mountBody(props = {}) {
  return harness.mount({
    party: makeParty(),
    parties: [],
    actorOptions: [],
    saving: false,
    ...props,
  });
}

function optionNames(root) {
  return Array.from(
    root.querySelectorAll('.manager-travel-option .manager-travel-option-name')
  ).map((node) => node.textContent.trim());
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('PartyExpandedBody (mounted)', () => {
  it('renames the party from the always-editable name field (commits on blur)', async () => {
    const renamed = [];
    const root = await mountBody({ onRename: (id, name) => renamed.push([id, name]) });
    const input = root.querySelector('.manager-party-name-input');
    assert.equal(input.value, 'Wardens');
    assert.equal(input.getAttribute('aria-label'), 'Party name');
    input.value = 'Vanguard';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('blur', { bubbles: true }));
    flushSync();
    assert.deepEqual(renamed, [['p1', 'Vanguard']]);
  });

  it('enables a party that has NO travel actor, and still states that it has none', async () => {
    const toggles = [];
    const root = await mountBody({ onSetEnabled: (id, next) => toggles.push([id, next]) });
    const pill = root.querySelector('[data-manager-party-enable="p1"]');

    assert.equal(pill.getAttribute('aria-pressed'), 'false');
    // The travel-actor gate is gone. A party with no travel actor senses no scene
    // regions, so it resolves to `unresolved` and its members gather exactly as an actor
    // in NO party does — which is what a downtime party is for. Both halves of the old
    // gate go together: no `aria-disabled`, and no hint standing in for the meta.
    assert.ok(!pill.hasAttribute('aria-disabled'), 'the pill is not gated');
    assert.equal(pill.getAttribute('aria-describedby'), null);
    assert.equal(root.querySelector('#party-enable-gate-p1'), null, 'no gate hint element');

    // The consequence stays VISIBLE even though the configuration is allowed: the meta
    // line reports the missing travel actor rather than the card hiding it.
    const meta = root.querySelector('.manager-party-meta').textContent;
    assert.match(meta, /travel actor: none/);
    assert.match(meta, /ignored by current-realm resolution/);

    // The name is the ACTION and names the party; the state is `aria-pressed`. Without an
    // explicit label the pill's accessible name is its own visible text — "Disabled" —
    // which changes as the control is used and reads as the control being unavailable,
    // and nine cards on a page would give nine identically named buttons.
    assert.equal(pill.getAttribute('aria-label'), 'Enable Wardens');

    pill.click();
    flushSync();
    assert.deepEqual(toggles, [['p1', true]], 'and the toggle reaches the store');
  });

  it('toggles enable when a travel actor IS linked', async () => {
    const toggles = [];
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      onSetEnabled: (id, next) => toggles.push([id, next]),
    });
    const pill = root.querySelector('[data-manager-party-enable="p1"]');
    assert.ok(!pill.hasAttribute('aria-disabled'));
    const meta = root.querySelector('.manager-party-meta').textContent;
    assert.match(meta, /travel actor: Vosk/);
    assert.match(meta, /ignored by current-realm resolution/);
    pill.click();
    flushSync();
    assert.deepEqual(toggles, [['p1', true]]);
  });

  it('routes delete through the shared confirm seam by party id', async () => {
    const deleted = [];
    const root = await mountBody({ onDelete: (id) => deleted.push(id) });
    const trash = root.querySelector('[data-manager-party-delete="p1"]');
    assert.equal(trash.getAttribute('aria-label'), 'Delete party');
    trash.click();
    flushSync();
    // `adminStore.deleteParty` is what titles and names the confirm; the card's job is
    // to reach it, not to re-implement the prompt.
    assert.deepEqual(deleted, ['p1']);
  });

  it('renders the member meta as the FIRST applicable fact, and omits it when none applies', async () => {
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.a',
        travelActor: { uuid: 'Actor.a', name: 'Alara', img: '' },
        memberCards: [member(), member({ uuid: 'Actor.b', name: 'Bromm' })],
        memberActorUuids: ['Actor.a', 'Actor.b'],
        memberCount: 2,
      }),
      parties: [makeParty({ id: 'p2', name: 'Scouts' })],
    });
    const rows = root.querySelectorAll('.manager-party-member-row');
    assert.equal(
      rows[0].querySelector('.manager-party-member-meta').textContent.trim(),
      'Travel actor'
    );
    assert.ok(!rows[1].querySelector('.manager-party-member-meta'), 'no empty meta line');
  });

  it('reports multi-membership on a member the store also lists elsewhere', async () => {
    const root = await mountBody({
      party: makeParty({
        memberCards: [member()],
        memberActorUuids: ['Actor.a'],
        memberCount: 1,
      }),
      parties: [
        makeParty({ id: 'p1' }),
        makeParty({ id: 'p2', name: 'Scouts', memberActorUuids: ['Actor.a'] }),
      ],
    });
    assert.match(
      root.querySelector('.manager-party-member-meta').textContent,
      /Also in 1 other party/
    );
  });

  it('renders a stale member with no move control', async () => {
    const root = await mountBody({
      party: makeParty({
        memberCards: [member({ uuid: 'Actor.gone', name: '', stale: true })],
        memberActorUuids: ['Actor.gone'],
        memberCount: 1,
      }),
      parties: [makeParty({ id: 'p1' }), makeParty({ id: 'p2', name: 'Scouts' })],
    });
    const row = root.querySelector('.manager-party-member-row');
    assert.match(row.querySelector('.manager-party-member-name').textContent, /Stale member/);
    assert.ok(!row.querySelector('.manager-party-member-move'), 'a stale uuid has nowhere to move');
    assert.ok(Boolean(row.querySelector('.manager-party-member-remove')), 'but can be removed');
  });

  it('removes a member', async () => {
    const removed = [];
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      onRemoveMember: (id, uuid) => removed.push([id, uuid]),
    });
    root.querySelector('.manager-party-member-remove').click();
    flushSync();
    assert.deepEqual(removed, [['p1', 'Actor.a']]);
  });

  it('opens the move drawer IN the row, marks it selected, and annotates each target', async () => {
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      parties: [
        makeParty({ id: 'p1' }),
        makeParty({ id: 'p2', name: 'Scouts', enabled: true, memberCount: 3 }),
        makeParty({
          id: 'p3',
          name: 'Reserve',
          enabled: false,
          memberCount: 1,
          memberActorUuids: ['Actor.a'],
        }),
      ],
    });

    const row = root.querySelector('.manager-party-member-row');
    assert.ok(!row.querySelector('[data-manager-party-move-drawer]'));
    row.querySelector('.manager-party-member-move').click();
    flushSync();

    const drawer = row.querySelector('[data-manager-party-move-drawer="Actor.a"]');
    assert.ok(Boolean(drawer), 'the drawer expands inside the row, not in a portal');
    assert.ok(row.classList.contains('is-moving'), 'the row reads as selected while it is open');
    assert.match(drawer.querySelector('.manager-party-move-eyebrow').textContent, /Move Alara to/);

    const metas = Array.from(drawer.querySelectorAll('.manager-party-move-target-meta')).map(
      (node) => node.textContent.trim()
    );
    assert.equal(metas[0], '3 members');
    assert.equal(metas[1], '1 member · disabled · already a member');
  });

  it('opens the move drawer and EXPLAINS a one-party world instead of disabling the trigger', async () => {
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      parties: [makeParty({ id: 'p1' })],
    });
    const move = root.querySelector('.manager-party-member-move');
    assert.ok(!move.hasAttribute('disabled'), 'the trigger stays operable');
    move.click();
    flushSync();
    assert.match(
      root.querySelector('.manager-party-move-none').textContent,
      /No other party to move them to\. Create one first\./
    );
  });

  it('closes the move drawer on Cancel without calling onMoveMember', async () => {
    const moved = [];
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      parties: [makeParty({ id: 'p1' }), makeParty({ id: 'p2', name: 'Scouts' })],
      onMoveMember: (from, to, uuid) => moved.push([from, to, uuid]),
    });
    root.querySelector('.manager-party-member-move').click();
    flushSync();
    root.querySelector('.manager-party-move-cancel').click();
    flushSync();
    assert.ok(!root.querySelector('[data-manager-party-move-drawer]'), 'drawer closed');
    assert.deepEqual(moved, []);
  });

  it('moves a member to the chosen target and closes the drawer', async () => {
    const moved = [];
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      parties: [makeParty({ id: 'p1' }), makeParty({ id: 'p2', name: 'Scouts' })],
      onMoveMember: (from, to, uuid) => moved.push([from, to, uuid]),
    });
    root.querySelector('.manager-party-member-move').click();
    flushSync();
    root.querySelector('.manager-party-move-target').click();
    flushSync();
    assert.deepEqual(moved, [['p1', 'p2', 'Actor.a']]);
    assert.ok(!root.querySelector('[data-manager-party-move-drawer]'));
  });

  it('offers Add a member on a zero-member party, beside the shared no-state hint', async () => {
    const root = await mountBody();
    assert.ok(Boolean(root.querySelector('[data-manager-party-members-empty]')), 'no-state hint');
    assert.ok(
      Boolean(root.querySelector('[data-manager-party-add-open="p1"]')),
      'add still offered'
    );
  });

  it('annotates add candidates as unassigned or already in another party', async () => {
    const root = await mountBody({
      party: makeParty({ id: 'p1' }),
      parties: [
        makeParty({ id: 'p1' }),
        makeParty({ id: 'p2', name: 'Scouts', memberActorUuids: ['Actor.b'] }),
      ],
      actorOptions: actors,
    });
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();

    const rows = Array.from(root.querySelectorAll('.manager-party-add-candidate'));
    const byName = Object.fromEntries(
      rows.map((row) => [
        row.querySelector('.manager-party-add-name').textContent.trim(),
        row.querySelector('.manager-party-add-meta').textContent.trim(),
      ])
    );
    // The NPC and the UNPROJECTED actor are both excluded by the STRICT
    // `isPlayerCharacter === true` test. The unprojected one is what makes this fail under
    // a `!== false` test (issue 1024) — the NPC alone cannot, because both predicates
    // reject an explicit `false`.
    assert.deepEqual(Object.keys(byName).sort(), ['Alara', 'Bromm']);
    assert.equal(byName.Alara, 'In no party');
    assert.equal(byName.Bromm, 'In Scouts — adding moves them');
  });

  it('adds (which the store resolves as add-or-MOVE) on choosing a candidate', async () => {
    const added = [];
    const root = await mountBody({
      parties: [
        makeParty({ id: 'p1' }),
        makeParty({ id: 'p2', name: 'Scouts', memberActorUuids: ['Actor.b'] }),
      ],
      actorOptions: actors,
      onAddMember: (id, uuid) => added.push([id, uuid]),
    });
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    root.querySelector('[data-manager-party-candidate="Actor.b"]').click();
    flushSync();
    // `adminStore.addOrMovePartyMember` confirms and MOVES rather than adding a second
    // membership, because an actor may be associated with at most one enabled party.
    assert.deepEqual(added, [['p1', 'Actor.b']]);
  });

  it('keeps THREE distinct add-panel empty reasons apart', async () => {
    // 1. no player-character actors configured at all — names the module setting.
    let root = await mountBody({
      actorOptions: [{ uuid: 'Actor.n', name: 'Nasty NPC', isPlayerCharacter: false }],
    });
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    let panel = root.querySelector('[data-manager-party-add-empty]');
    assert.equal(panel.getAttribute('data-manager-party-add-empty'), 'no-actors-configured');
    assert.match(panel.textContent, /Player Character Actor Types/);
    harness.remount();

    // 2. every configured character is already a member.
    root = await mountBody({
      party: makeParty({
        memberCards: [member(), member({ uuid: 'Actor.b', name: 'Bromm' })],
        memberActorUuids: ['Actor.a', 'Actor.b'],
        memberCount: 2,
      }),
      actorOptions: actors,
    });
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    panel = root.querySelector('[data-manager-party-add-empty]');
    assert.equal(panel.getAttribute('data-manager-party-add-empty'), 'all-already-members');
    assert.match(panel.textContent, /Every character is already in this party\./);
    harness.remount();

    // 3. the search matches none of the remaining candidates.
    root = await mountBody({ actorOptions: actors });
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    const search = root.querySelector('.manager-party-add-query');
    search.value = 'zzz';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    panel = root.querySelector('[data-manager-party-add-empty]');
    assert.equal(panel.getAttribute('data-manager-party-add-empty'), 'no-search-match');
    assert.match(panel.textContent, /No characters match your search\./);
  });

  it('closes the add panel on Done', async () => {
    const root = await mountBody({ actorOptions: actors });
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    root.querySelector('.manager-party-add-done').click();
    flushSync();
    assert.ok(!root.querySelector('[data-manager-party-add]'), 'panel closed');
    assert.ok(Boolean(root.querySelector('[data-manager-party-add-open="p1"]')), 'trigger back');
  });

  it('renders the unlinked travel-actor tile through the shared no-state primitive', async () => {
    const root = await mountBody();
    const tile = root.querySelector('[data-manager-party-travel-actor="p1"]');
    assert.equal(
      tile.tagName,
      'BUTTON',
      'the button WRAPS the primitive so drop/right-click survive'
    );
    const empty = tile.querySelector('[data-manager-party-travel-actor-empty]');
    assert.ok(Boolean(empty), 'the tile is the primitive in its compact treatment');
    assert.ok(empty.classList.contains('is-compact'));
    assert.match(tile.textContent, /No travel actor/);
    assert.match(tile.textContent, /Pick the actor that represents this party on the map\./);
  });

  it('sets the travel actor when an actor is dropped on the tile', async () => {
    const set = [];
    const root = await mountBody({ onSetTravelActor: (id, uuid) => set.push([id, uuid]) });
    const drop = new window.Event('drop', { bubbles: true });
    drop.preventDefault = () => {};
    drop.dataTransfer = { getData: () => JSON.stringify({ type: 'Actor', uuid: 'Actor.x' }) };
    root.querySelector('[data-manager-party-travel-actor="p1"]').dispatchEvent(drop);
    flushSync();
    assert.deepEqual(set, [['p1', 'Actor.x']]);
  });

  it('right-click OPENS the picker on an unlinked tile and UNLINKS a linked one', async () => {
    const cleared = [];
    let root = await mountBody({ onClearTravelActor: (id) => cleared.push(id) });
    const contextMenu = () => {
      const event = new window.Event('contextmenu', { bubbles: true });
      event.preventDefault = () => {};
      return event;
    };
    root.querySelector('[data-manager-party-travel-actor="p1"]').dispatchEvent(contextMenu());
    flushSync();
    assert.ok(Boolean(root.querySelector('.manager-travel-popover')), 'unlinked: opens the picker');
    assert.deepEqual(cleared, []);
    harness.remount();

    root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      onClearTravelActor: (id) => cleared.push(id),
    });
    root.querySelector('[data-manager-party-travel-actor="p1"]').dispatchEvent(contextMenu());
    flushSync();
    assert.deepEqual(cleared, ['p1'], 'linked: unlinks');
    assert.ok(!root.querySelector('.manager-travel-popover'));
  });

  it('offers a keyboard-reachable unlink button whenever a travel actor is set', async () => {
    const cleared = [];
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      onClearTravelActor: (id) => cleared.push(id),
    });
    const unlink = root.querySelector('[data-manager-party-actor-unlink="p1"]');
    assert.equal(unlink.getAttribute('aria-label'), 'Unlink Vosk');
    unlink.click();
    flushSync();
    assert.deepEqual(cleared, ['p1']);
  });

  it('keeps unlink enabled for a STALE travel actor', async () => {
    const cleared = [];
    const root = await mountBody({
      party: makeParty({ travelActorUuid: 'Actor.gone', staleTravelActor: 'Actor.gone' }),
      onClearTravelActor: (id) => cleared.push(id),
    });
    assert.match(root.querySelector('.manager-party-actor-name').textContent, /Stale travel actor/);
    const unlink = root.querySelector('[data-manager-party-actor-unlink="p1"]');
    assert.ok(!unlink.hasAttribute('disabled'));
    unlink.click();
    flushSync();
    assert.deepEqual(cleared, ['p1']);
  });

  it('keeps unlink out of the picker because the persistent accessible button already owns it', async () => {
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      actorOptions: [{ uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: true }],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.equal(root.querySelector('[data-manager-party-actor-unlink-footer]'), null);
    assert.ok(root.querySelector('[data-manager-party-actor-unlink="p1"]'));
    // `.manager-travel-actor-popover` carries NO styling any more — it is purely the hook
    // `scripts/lib/viewLabCases.js` selects the travel-actor frame on. Nothing else fails
    // if it is dropped, and one bad View Lab selector fails the whole capture run rather
    // than one frame, so it is pinned here where it fails immediately and by name.
    assert.ok(
      root.querySelector('.manager-travel-popover.manager-travel-actor-popover'),
      'the picker keeps the View Lab capture hook'
    );
  });

  it('offers only CONFIGURED player-character actors, annotated with where they already stand', async () => {
    const root = await mountBody({
      party: makeParty({ id: 'p1' }),
      parties: [
        makeParty({ id: 'p1' }),
        makeParty({
          id: 'p2',
          name: 'Scouts',
          travelActorUuid: 'Actor.v',
          memberActorUuids: ['Actor.b'],
        }),
      ],
      actorOptions: [
        { uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.b', name: 'Bromm', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
        // The issue-1024 regression guard, and the ONLY fixture shape that separates
        // `=== true` from `!== false`: an actor the projection never annotated at all.
        // `isPlayerCharacter: false` above is rejected by BOTH predicates and so pins
        // nothing about the strict test — without this entry, relaxing the filter to
        // `!== false` passes every suite while silently making an unannotated actor
        // travel-actor-eligible.
        { uuid: 'Actor.u', name: 'Unprojected Ancient', img: '' },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();

    // The candidate set is the GM-configured player-character types, the same membership
    // the member picker uses: a world's NPC roster is unbounded, and listing it buries
    // the handful of actors that could stand for a party. The Wagon is present in
    // `actorOptions` and absent from the picker, which is the whole assertion — a GM who
    // wants it eligible adds its type under Player Character Actor Types.
    assert.deepEqual(optionNames(root).sort(), ['Bromm', 'Vosk']);
    const metas = Array.from(root.querySelectorAll('.manager-travel-option-meta')).map((node) =>
      node.textContent.trim()
    );
    assert.ok(metas.includes('Travel actor for Scouts'));
    assert.ok(metas.includes('In Scouts'));
  });

  it('shows the create-an-Actor state when the world holds no actors at all', async () => {
    const root = await mountBody({ actorOptions: [] });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.match(
      root.querySelector('.manager-travel-popover').textContent,
      /No actors exist in this world yet — create an Actor first\./
    );
  });

  it('still offers the CURRENT travel actor when its type is not a configured one', async () => {
    // A drop onto the tile is unfiltered, and the GM may have narrowed the configured
    // types after linking, so a linked-but-ineligible travel actor is reachable state.
    // Filtering it out of its own picker leaves the GM opening the picker to change the
    // actor and finding nothing marked, no check, and a count denominator that omits the
    // actor the tile above is displaying.
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.w',
        travelActor: { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '' },
      }),
      actorOptions: [
        { uuid: 'Actor.b', name: 'Bromm', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();

    assert.deepEqual(optionNames(root).sort(), ['Bromm', 'The Ashfall Wagon']);
    // Marked AND counted: both are the reason it is offered at all.
    const current = Array.from(root.querySelectorAll('.manager-travel-option')).find(
      (option) => option.getAttribute('aria-selected') === 'true'
    );
    assert.match(current.textContent, /The Ashfall Wagon/);
    assert.ok(Boolean(current.querySelector('.manager-travel-option-marker')), 'carries a check');
    assert.equal(root.querySelector('[data-popover-filtered-count]').textContent.trim(), '2 of 2');
  });

  it('does not offer an ineligible actor that is NOT the current travel actor', async () => {
    // The negative control for the test above. Without it, "always offer the current
    // travel actor" could be implemented as "do not filter at all" and still pass.
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.b',
        travelActor: { uuid: 'Actor.b', name: 'Bromm', img: '' },
      }),
      actorOptions: [
        { uuid: 'Actor.b', name: 'Bromm', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.deepEqual(optionNames(root), ['Bromm']);
    assert.equal(root.querySelector('[data-popover-filtered-count]').textContent.trim(), '1 of 1');
  });

  it('names the actor-types setting when the world has actors but none are eligible', async () => {
    // The third empty reason, and the one the type filter created. Collapsing it into
    // "no actor matches your search" tells a GM staring at a world full of actors — with
    // an empty query — to search harder.
    const root = await mountBody({
      actorOptions: [
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.equal(optionNames(root).length, 0);
    assert.match(
      root.querySelector('.manager-travel-popover').textContent,
      /Player Character Actor Types/
    );
  });

  it('marks the currently linked actor in the picker', async () => {
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      actorOptions: [
        { uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: true },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    const current = Array.from(root.querySelectorAll('.manager-travel-option')).find(
      (option) => option.getAttribute('aria-selected') === 'true'
    );
    assert.ok(Boolean(current), 'the linked actor is aria-selected');
    assert.match(current.textContent, /Vosk/);
    assert.ok(
      Boolean(current.querySelector('.manager-travel-option-marker')),
      'and carries a check'
    );
  });

  it('counts MATCHED of total in the picker header as the search narrows the list', async () => {
    const root = await mountBody({
      actorOptions: [
        { uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.b', name: 'Bromm', img: '', isPlayerCharacter: true },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.equal(root.querySelector('[data-popover-header]').textContent.trim(), 'Actors 3 of 3');
    const count = () => root.querySelector('[data-popover-filtered-count]').textContent.trim();
    assert.equal(count(), '3 of 3');

    const search = root.querySelector('.manager-travel-picker-inline input');
    search.value = 'wagon';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();

    // The search term lives in `SearchablePopover`'s own state, so a count derived from
    // the CALLER's option array is inert by construction: the list shrinks to one row
    // while the header keeps reading "3 of 3" and the published picker frame shows a
    // live-looking number that can never change.
    assert.deepEqual(optionNames(root), ['The Ashfall Wagon']);
    assert.equal(count(), '1 of 3');
  });

  it('dismisses the inline picker on Escape from its search field', async () => {
    const root = await mountBody({
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: true }],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    assert.ok(Boolean(root.querySelector('.manager-travel-popover')), 'the picker is open');

    root
      .querySelector('.manager-travel-picker-inline input')
      .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    // CHARACTERIZATION, and deliberately so: the popover's own Escape handler is on the
    // portaled dialog, which this field — a sibling of the trigger, in a different subtree
    // from the portaled panel — never reaches. Dismissal comes instead from
    // `dismissOnOutsideClick.js:47-56`, a DOCUMENT-level capture-phase keydown the picker
    // root registers in every mode. That is what makes the delta's "Escape dismissal is
    // inherited" claim true here, and it is invisible in this file without this test.
    assert.ok(!root.querySelector('.manager-travel-popover'), 'Escape dismissed the picker');
  });

  it('returns focus to the trigger when a picker closes, in BOTH trigger modes', async () => {
    let root = await mountBody({
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: true }],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    // The inline mode UNMOUNTS its trigger while open, so the bound reference is null when
    // the close runs and the element focus must return to does not exist yet. The restore
    // is therefore deferred past the DOM update rather than by a bare microtask, which
    // would depend on Svelte scheduling its own flush first.
    assert.ok(!root.querySelector('[data-manager-party-actor-trigger="p1"]'), 'trigger unmounted');

    root.querySelector('.manager-travel-picker-inline-close').click();
    flushSync();
    await tick();
    await tick();
    assert.equal(
      document.activeElement,
      root.querySelector('[data-manager-party-actor-trigger="p1"]'),
      'the remounted trigger takes focus back'
    );
    harness.remount();

    // The default mode, whose trigger stays mounted throughout: the same timing change
    // covers all 19 shipped consumers of the primitive, so it is pinned here too.
    root = await mountBody({ systemRealms: [{ id: 'r1', name: 'Northreach', enabled: true }] });
    const trigger = root.querySelector('.manager-travel-parties-override-trigger');
    trigger.click();
    flushSync();
    root
      .querySelector('.manager-travel-popover')
      .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    await tick();
    await tick();
    assert.equal(document.activeElement, trigger, 'the shipped mode still restores focus');
  });

  it('sets the travel actor from the picker', async () => {
    const set = [];
    const root = await mountBody({
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: true }],
      onSetTravelActor: (id, uuid) => set.push([id, uuid]),
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    root.querySelector('.manager-travel-option').click();
    flushSync();
    assert.deepEqual(set, [['p1', 'Actor.w']]);
  });

  it('gives the realm-override picker the SAME compact presentation as the actor picker', async () => {
    // The two pickers sit stacked in one 210px column, so they must read as one kind of
    // control. Asserted through the DOM the presentation is made of, not by comparing
    // screenshots: the compact mode class, the shared title/count header, the compact
    // search row, and rows carrying the compact class.
    const root = await mountBody({
      systemRealms: [
        { id: 'r1', name: 'Northreach', enabled: true },
        { id: 'r2', name: 'Ashen March', enabled: true },
      ],
    });
    root.querySelector('.manager-travel-parties-override-trigger').click();
    flushSync();

    const popover = root.querySelector('.manager-travel-popover');
    assert.ok(popover.classList.contains('is-compact-option-rows'), 'compact mode is on');
    assert.equal(
      popover.querySelector('[data-popover-header]').textContent.trim(),
      // Auto + two realms.
      'Realms 3 of 3'
    );
    assert.ok(
      Boolean(popover.querySelector('.manager-travel-popover-search.is-compact')),
      'the compact search row renders'
    );

    // ORDER, which no `:has()`-based frame selector can assert: the header names and
    // counts the list, so a search field standing above its own heading would read as
    // belonging to the popover rather than to the list it filters.
    const children = Array.from(popover.children);
    const headerIndex = children.findIndex((node) => node.hasAttribute('data-popover-header'));
    const searchIndex = children.findIndex((node) =>
      node.classList.contains('manager-travel-popover-search')
    );
    assert.ok(headerIndex >= 0 && searchIndex >= 0, 'both are direct children of the popover');
    assert.ok(headerIndex < searchIndex, 'the header precedes the search field');
  });

  it('keeps the trigger MOUNTED while the realm-override picker is open', async () => {
    // The one half of the actor picker's presentation the realm picker deliberately does
    // NOT adopt. `inlineSearchTrigger` unmounts its trigger while open, which is right for
    // a button labelled "Change actor" and wrong for a trigger whose whole job is to
    // display the current override: erasing it forces the GM to close the picker to
    // re-read what they are changing.
    const root = await mountBody({
      systemRealms: [{ id: 'r1', name: 'Northreach', enabled: true }],
    });
    root.querySelector('.manager-travel-parties-override-trigger').click();
    flushSync();
    assert.ok(
      Boolean(root.querySelector('.manager-travel-parties-override-trigger')),
      'the value-bearing trigger survives opening'
    );
    assert.equal(root.querySelector('.manager-travel-picker-inline'), null, 'and is not inlined');
  });

  it('renders the realm-override control in the card RIGHT COLUMN, not the inspector', async () => {
    const root = await mountBody({
      systemRealms: [{ id: 'r1', name: 'Northreach', enabled: true }],
    });
    const column = root.querySelector('.manager-party-travel-col');
    assert.ok(
      Boolean(column.querySelector('.manager-travel-parties-override-trigger')),
      "ui-integration/spec.md's GM Travel Route layout split pins every editing control to the centre column"
    );
    assert.ok(
      Boolean(column.querySelector('.manager-party-actor-panel')),
      'beneath the travel-actor panel it shares the column with'
    );
  });

  it('explains the unavailable override instead of showing an icon-only lock', async () => {
    const hint = 'Enable Travel & Realms in Gathering settings to set a current-realm override.';
    const root = await mountBody({
      realmOverridesAvailable: false,
      realmOverridesUnavailableHint: hint,
    });
    const lock = root.querySelector(
      '.manager-party-travel-col [data-party-realm-override-unavailable]'
    );
    assert.ok(Boolean(lock), 'the View Lab selector still matches, in its new home');
    assert.match(lock.textContent, /Current realm override/);
    assert.match(lock.textContent, /Enable Travel & Realms/);
  });

  it('renders the card-scoped validation errors and associates them with their controls', async () => {
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      memberError: 'This actor already belongs to another enabled party.',
      travelActorError: 'This travel actor is already used by another enabled party.',
    });

    const memberMessage = root.querySelector('#party-member-error-p1');
    assert.ok(Boolean(memberMessage), 'the duplicate-member error sits under the member list');
    assert.equal(
      root.querySelector('[data-manager-party-add-open="p1"]').getAttribute('aria-describedby'),
      'party-member-error-p1'
    );
    assert.equal(
      root.querySelector('[data-manager-party-member-rows]').getAttribute('aria-describedby'),
      'party-member-error-p1'
    );

    assert.ok(Boolean(root.querySelector('#party-travel-actor-error-p1')));
    assert.equal(
      root.querySelector('[data-manager-party-travel-actor="p1"]').getAttribute('aria-describedby'),
      'party-travel-actor-error-p1'
    );
    harness.remount();

    // The state a REJECTED ADD actually leaves on a zero-member party: the member list is
    // not rendered (no members) and the add-open button is not rendered (the panel is
    // open), so both of the anchors above are absent and the message would be orphaned.
    // This is the case the assertions above cannot reach, and the one the GM is in at the
    // moment the error appears.
    const zeroMembers = await mountBody({
      actorOptions: actors,
      memberError: 'This actor already belongs to another enabled party.',
    });
    zeroMembers.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    assert.ok(!zeroMembers.querySelector('[data-manager-party-member-rows]'), 'no member list');
    assert.ok(!zeroMembers.querySelector('[data-manager-party-add-open="p1"]'), 'no add button');
    assert.ok(Boolean(zeroMembers.querySelector('#party-member-error-p1')), 'the message is shown');
    assert.equal(
      zeroMembers.querySelector('[data-manager-party-add]').getAttribute('aria-describedby'),
      'party-member-error-p1',
      'so the open panel — the only control left — is what describes it'
    );
  });

  it('disables every card control while the store is saving', async () => {
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      saving: true,
    });
    for (const selector of [
      '.manager-party-name-input',
      '[data-manager-party-enable="p1"]',
      '[data-manager-party-delete="p1"]',
      '.manager-party-member-move',
      '.manager-party-member-remove',
      '[data-manager-party-add-open="p1"]',
      '[data-manager-party-travel-actor="p1"]',
      '[data-manager-party-actor-trigger="p1"]',
    ]) {
      const control = root.querySelector(selector);
      assert.ok(Boolean(control), `${selector} is rendered`);
      assert.ok(control.hasAttribute('disabled'), `${selector} is disabled while saving`);
    }
  });

  it('force-closes an open drawer and picker when the pane bumps its close token', async () => {
    const root = await mountBody({
      party: makeParty({ memberCards: [member()], memberActorUuids: ['Actor.a'], memberCount: 1 }),
      parties: [makeParty({ id: 'p1' }), makeParty({ id: 'p2', name: 'Scouts' })],
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: true }],
      closeToken: 0,
    });
    root.querySelector('.manager-party-member-move').click();
    flushSync();
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    root.querySelector('[data-manager-party-add-open="p1"]').click();
    flushSync();
    assert.ok(Boolean(root.querySelector('[data-manager-party-add]')), 'add panel opened');

    await harness.setProps({ closeToken: 1 });
    assert.ok(!root.querySelector('[data-manager-party-move-drawer]'), 'drawer closed');
    assert.ok(!root.querySelector('.manager-travel-popover'), 'picker closed');
    // The third thing the token force-closes. It is a SEPARATE piece of card state from
    // the other two, so leaving it open would outlive the card the page change unmounts.
    assert.ok(!root.querySelector('[data-manager-party-add]'), 'add panel closed');
    assert.ok(Boolean(root.querySelector('[data-manager-party-add-open="p1"]')), 'trigger back');
  });
});
