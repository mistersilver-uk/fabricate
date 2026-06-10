import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let PartyExpandedBody;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, { filename: sourcePath, generate: 'client', dev: true, css: 'injected' });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function writeRawModule(modulePath) {
  const destination = join(tempRoot, modulePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, modulePath), 'utf8'));
}

function makeParty(overrides = {}) {
  return {
    id: 'p1',
    name: 'Wardens',
    memberCards: [],
    travelActor: null,
    staleTravelActor: null,
    ...overrides
  };
}

async function mountBody(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(PartyExpandedBody, {
    target,
    props: {
      party: makeParty(),
      parties: [],
      actorOptions: [],
      saving: false,
      onAddMember: () => {},
      onRemoveMember: () => {},
      onMoveMember: () => {},
      onSetTravelActor: () => {},
      onClearTravelActor: () => {},
      ...props
    }
  });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

const actors = [
  { uuid: 'Actor.a', id: 'a', name: 'Alara', img: 'icons/a.webp', type: 'character' },
  { uuid: 'Actor.b', id: 'b', name: 'Bromm', img: '', type: 'character' },
  { uuid: 'Actor.n', id: 'n', name: 'Nasty NPC', img: '', type: 'npc' }
];

describe('PartyExpandedBody mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = { i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-party-body-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeRawModule('src/ui/svelte/util/iconPickerPopover.js');
    writeRawModule('src/ui/svelte/util/dropUtils.js');
    writeRawModule('src/ui/svelte/actions/dismissOnOutsideClick.js');
    writeRawModule('src/ui/svelte/actions/portal.js');
    writeRawModule('src/ui/svelte/actions/dragDrop.js');
    writeCompiledSvelte('src/ui/svelte/apps/manager/SearchablePopover.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/PartyExpandedBody.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/PartyExpandedBody.svelte.js')).href);
    PartyExpandedBody = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  function addOptions() {
    return Array.from(target.querySelectorAll('.manager-party-add-list .manager-travel-option'));
  }

  it('lists only character actors not already members, and adds on click', async () => {
    const added = [];
    await mountBody({
      party: makeParty({ memberCards: [{ uuid: 'Actor.b', name: 'Bromm', img: '', stale: false }] }),
      actorOptions: actors,
      onAddMember: (partyId, uuid) => added.push([partyId, uuid])
    });
    const names = addOptions().map(button => button.querySelector('.manager-travel-option-name').textContent.trim());
    // Alara (character, not a member) listed; Bromm excluded (already member); NPC excluded (not character).
    assert.deepEqual(names, ['Alara']);
    addOptions()[0].click();
    flushSync();
    assert.deepEqual(added, [['p1', 'Actor.a']]);
    remount();
  });

  it('filters the add list by search', async () => {
    await mountBody({ actorOptions: actors });
    assert.equal(addOptions().length, 2); // Alara + Bromm (characters)
    const search = target.querySelector('.manager-party-add input[type="search"]');
    search.value = 'brom';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();
    const names = addOptions().map(button => button.querySelector('.manager-travel-option-name').textContent.trim());
    assert.deepEqual(names, ['Bromm']);
    remount();
  });

  it('renders member rows with remove, and removes on click', async () => {
    const removed = [];
    await mountBody({
      party: makeParty({ memberCards: [{ uuid: 'Actor.a', name: 'Alara', img: 'icons/a.webp', stale: false }] }),
      onRemoveMember: (partyId, uuid) => removed.push([partyId, uuid])
    });
    const row = target.querySelector('.manager-party-member-row');
    assert.match(row.querySelector('.manager-party-member-name').textContent, /Alara/);
    row.querySelector('.manager-icon-button.is-danger').click();
    flushSync();
    assert.deepEqual(removed, [['p1', 'Actor.a']]);
    remount();
  });

  it('moves a member to another party via the searchable popover', async () => {
    const moved = [];
    await mountBody({
      party: makeParty({ id: 'p1', memberCards: [{ uuid: 'Actor.a', name: 'Alara', img: '', stale: false }] }),
      parties: [makeParty({ id: 'p1', name: 'Wardens' }), makeParty({ id: 'p2', name: 'Scouts' })],
      onMoveMember: (from, to, uuid) => moved.push([from, to, uuid])
    });
    const moveTrigger = target.querySelector('.manager-party-member-actions [aria-haspopup="dialog"]');
    moveTrigger.click();
    flushSync();
    await tick();
    flushSync();
    const option = Array.from(target.querySelectorAll('.manager-travel-option'))
      .find(button => button.textContent.includes('Scouts'));
    option.click();
    flushSync();
    assert.deepEqual(moved, [['p1', 'p2', 'Actor.a']]);
    remount();
  });

  it('sets the travel marker when an actor is dropped', async () => {
    const set = [];
    await mountBody({ onSetTravelActor: (partyId, uuid) => set.push([partyId, uuid]) });
    const zone = target.querySelector('.manager-party-marker-dropzone');
    const event = new window.Event('drop', { bubbles: true });
    event.preventDefault = () => {};
    event.dataTransfer = { getData: () => JSON.stringify({ type: 'Actor', uuid: 'Actor.x' }) };
    zone.dispatchEvent(event);
    flushSync();
    assert.deepEqual(set, [['p1', 'Actor.x']]);
    remount();
  });

  it('shows the travel marker portrait when set and clears via the Clear button', async () => {
    const cleared = [];
    await mountBody({
      party: makeParty({ travelActor: { uuid: 'Actor.a', name: 'Alara', img: 'icons/a.webp' } }),
      onClearTravelActor: (partyId) => cleared.push(partyId)
    });
    assert.ok(target.querySelector('.manager-party-marker-portrait img'));
    assert.match(target.querySelector('.manager-party-marker-name').textContent, /Alara/);
    target.querySelector('.manager-party-marker-clear').click();
    flushSync();
    assert.deepEqual(cleared, ['p1']);
    remount();
  });

  it('clears the travel marker on right-click', async () => {
    const cleared = [];
    await mountBody({
      party: makeParty({ travelActor: { uuid: 'Actor.a', name: 'Alara', img: '' } }),
      onClearTravelActor: (partyId) => cleared.push(partyId)
    });
    const zone = target.querySelector('.manager-party-marker-dropzone');
    const event = new window.Event('contextmenu', { bubbles: true });
    event.preventDefault = () => {};
    zone.dispatchEvent(event);
    flushSync();
    assert.deepEqual(cleared, ['p1']);
    remount();
  });
});
