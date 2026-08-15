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
  return Array.from(root.querySelectorAll('.manager-travel-option .manager-travel-option-name')).map(
    (node) => node.textContent.trim()
  );
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

  it('makes the enable pill inoperable and self-explaining while the party has no travel actor', async () => {
    const toggles = [];
    const root = await mountBody({ onSetEnabled: (id, next) => toggles.push([id, next]) });
    const pill = root.querySelector('[data-manager-party-enable="p1"]');

    assert.equal(pill.getAttribute('aria-pressed'), 'false');
    assert.equal(pill.getAttribute('aria-disabled'), 'true');
    // `aria-disabled`, not `disabled`: a disabled button is not keyboard-reachable and
    // suppresses hover in some engines, which would make the hint invisible.
    assert.ok(!pill.hasAttribute('disabled'), 'the gated pill stays keyboard-reachable');

    const hint = root.querySelector('#party-enable-gate-p1');
    assert.ok(Boolean(hint), 'the gate explains its missing prerequisite in visible text');
    assert.equal(pill.getAttribute('aria-describedby'), 'party-enable-gate-p1');
    assert.match(hint.textContent, /travel actor/i);
    // The hint stands IN PLACE OF the "travel actor: none" fragment, not after it — and
    // in place of the disabled suffix too. `enableGated` implies `enabled !== true`, so a
    // gated card carries BOTH strings into one `nowrap` ellipsised line and the suffix is
    // the half the ellipsis eats; the pill two elements away already says "Disabled".
    const gatedMeta = root.querySelector('.manager-party-meta').textContent;
    assert.ok(!gatedMeta.includes('travel actor:'));
    assert.ok(!gatedMeta.includes('ignored by current-realm resolution'), 'no clipped suffix');

    pill.click();
    flushSync();
    assert.deepEqual(toggles, [], 'the gate refuses the toggle (req 4)');
  });

  it('toggles enable once a travel actor is linked', async () => {
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
    // Ungated and still disabled: this is where the suffix belongs, and the negative
    // control for the gated card's suppression of it.
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
    assert.equal(rows[0].querySelector('.manager-party-member-meta').textContent.trim(), 'Travel actor');
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

    const metas = Array.from(drawer.querySelectorAll('.manager-party-move-target-meta')).map((node) =>
      node.textContent.trim()
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
    assert.ok(Boolean(root.querySelector('[data-manager-party-add-open="p1"]')), 'add still offered');
  });

  it('annotates add candidates as unassigned or already in another party', async () => {
    const root = await mountBody({
      party: makeParty({ id: 'p1' }),
      parties: [makeParty({ id: 'p1' }), makeParty({ id: 'p2', name: 'Scouts', memberActorUuids: ['Actor.b'] })],
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
      parties: [makeParty({ id: 'p1' }), makeParty({ id: 'p2', name: 'Scouts', memberActorUuids: ['Actor.b'] })],
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
    let root = await mountBody({ actorOptions: [{ uuid: 'Actor.n', name: 'Nasty NPC', isPlayerCharacter: false }] });
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
    assert.equal(tile.tagName, 'BUTTON', 'the button WRAPS the primitive so drop/right-click survive');
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

  it('clears and closes from the picker unlink footer', async () => {
    const cleared = [];
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      actorOptions: [{ uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: false }],
      onClearTravelActor: (id) => cleared.push(id),
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    const footer = root.querySelector('[data-manager-party-actor-unlink-footer]');
    assert.ok(Boolean(footer), 'the footer names the actor it would unlink');
    assert.match(footer.textContent, /Unlink Vosk/);
    footer.click();
    flushSync();
    assert.deepEqual(cleared, ['p1']);
    assert.ok(!root.querySelector('.manager-travel-popover'), 'the picker closed with it');
  });

  it('offers EVERY world actor as a travel actor, annotated with where it already stands', async () => {
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
        { uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: false },
        { uuid: 'Actor.b', name: 'Bromm', img: '', isPlayerCharacter: true },
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();

    // A travel actor is frequently a group token, vehicle or NPC, so the candidate set
    // is NOT the player-character list the member picker uses.
    assert.deepEqual(optionNames(root).sort(), ['Bromm', 'The Ashfall Wagon', 'Vosk']);
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

  it('marks the currently linked actor in the picker', async () => {
    const root = await mountBody({
      party: makeParty({
        travelActorUuid: 'Actor.v',
        travelActor: { uuid: 'Actor.v', name: 'Vosk', img: '' },
      }),
      actorOptions: [
        { uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: false },
        { uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: false },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    const current = Array.from(root.querySelectorAll('.manager-travel-option')).find(
      (option) => option.getAttribute('aria-selected') === 'true'
    );
    assert.ok(Boolean(current), 'the linked actor is aria-selected');
    assert.match(current.textContent, /Vosk/);
    assert.ok(Boolean(current.querySelector('.manager-travel-option-marker')), 'and carries a check');
  });

  it('counts MATCHED of total in the picker header as the search narrows the list', async () => {
    const root = await mountBody({
      actorOptions: [
        { uuid: 'Actor.v', name: 'Vosk', img: '', isPlayerCharacter: false },
        { uuid: 'Actor.w', name: 'The Ashfall Wagon', img: '', isPlayerCharacter: false },
        { uuid: 'Actor.b', name: 'Bromm', img: '', isPlayerCharacter: true },
      ],
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    const count = () => root.querySelector('.manager-party-actor-popover-count').textContent.trim();
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
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: false }],
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
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: false }],
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
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: false }],
      onSetTravelActor: (id, uuid) => set.push([id, uuid]),
    });
    root.querySelector('[data-manager-party-actor-trigger="p1"]').click();
    flushSync();
    root.querySelector('.manager-travel-option').click();
    flushSync();
    assert.deepEqual(set, [['p1', 'Actor.w']]);
  });

  it('renders the realm-override control in the card RIGHT COLUMN, not the inspector', async () => {
    const root = await mountBody({
      systemRealms: [{ id: 'r1', name: 'Northreach', enabled: true }],
    });
    const column = root.querySelector('.manager-party-travel-col');
    assert.ok(
      Boolean(column.querySelector('.manager-travel-parties-override-trigger')),
      'ui-integration/spec.md:1603-1604 pins every editing control to the centre column'
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
      actorOptions: [{ uuid: 'Actor.w', name: 'Wagon', img: '', isPlayerCharacter: false }],
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
