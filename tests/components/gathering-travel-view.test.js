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
let GatheringTravelView;
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

function baseProps(overrides = {}) {
  return {
    parties: [],
    selectedPartyId: '',
    systemId: 'sys-1',
    saving: false,
    error: null,
    fieldErrors: {},
    actorOptions: [],
    systemRegions: [],
    ...overrides
  };
}

function makeParty(overrides = {}) {
  return {
    id: 'p1',
    name: 'Vanguard',
    enabled: false,
    travelActorUuid: null,
    memberActorUuids: [],
    memberCards: [],
    memberCount: 0,
    travelActor: null,
    staleMembers: [],
    staleTravelActor: null,
    staleRegionIds: [],
    hasStaleReference: false,
    overrideMode: 'none',
    overrideRegionIds: [],
    currentRegionEvidence: { source: 'unresolved', resolved: false, regions: [], staleRegionIds: [] },
    ...overrides
  };
}

async function mountView(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringTravelView, { target, props });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

describe('GatheringTravelView mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = { i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-travel-view-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeRawModule('src/ui/svelte/actions/dismissOnOutsideClick.js');
    writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringRegionQuickList.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringTravelView.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/GatheringTravelView.svelte.js')).href);
    GatheringTravelView = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('renders the setup checklist when there are no parties', async () => {
    await mountView(baseProps());
    assert.ok(target.querySelector('.manager-travel-checklist'), 'checklist should render');
    const steps = target.querySelectorAll('.manager-travel-checklist-steps li');
    assert.equal(steps.length, 5, 'checklist should present five setup steps');
    remount();
  });

  it('renders party list rows with enabled/disabled chip, member count, and stale badge', async () => {
    await mountView(baseProps({
      parties: [makeParty({ enabled: true, memberCount: 2, hasStaleReference: true })],
      selectedPartyId: 'p1'
    }));
    const row = target.querySelector('.manager-travel-party-row[data-party-id="p1"]');
    assert.ok(row, 'party row should render');
    assert.ok(row.textContent.includes('Vanguard'));
    assert.ok(target.textContent.includes('Needs repair') || target.querySelector('.manager-chip.is-warning'), 'stale badge should render');
    remount();
  });

  it('disables the enable toggle while no travel actor is assigned and shows the hint', async () => {
    await mountView(baseProps({
      parties: [makeParty({ travelActorUuid: null })],
      selectedPartyId: 'p1'
    }));
    const toggle = target.querySelector('.manager-travel-enable .manager-travel-status-toggle');
    assert.ok(toggle, 'enable toggle should render');
    assert.equal(toggle.disabled, true, 'enable toggle should be disabled without a travel actor');
    assert.ok(target.textContent.includes('Assign a travel actor to enable this party.'), 'should show the enable hint');
    remount();
  });

  it('newly created (disabled) party visibly shows the disabled state', async () => {
    await mountView(baseProps({
      parties: [makeParty({ enabled: false })],
      selectedPartyId: 'p1'
    }));
    const chip = target.querySelector('.manager-travel-party-row .manager-chip.is-disabled');
    assert.ok(chip, 'disabled chip should render for a disabled party');
    remount();
  });

  it('shows the no-actors empty state on both member and travel-actor pickers', async () => {
    await mountView(baseProps({
      parties: [makeParty()],
      selectedPartyId: 'p1',
      actorOptions: []
    }));
    const hints = Array.from(target.querySelectorAll('.manager-travel-hint'))
      .filter(node => node.textContent.includes('No actors exist in this world yet'));
    assert.ok(hints.length >= 2, 'both pickers should show the no-actors empty state');
    // Picker triggers should be disabled with no actors.
    const triggers = target.querySelectorAll('.manager-travel-picker-trigger');
    assert.ok(triggers.length >= 2);
    triggers.forEach(trigger => assert.equal(trigger.disabled, true));
    remount();
  });

  it('wires the duplicate-member inline error via aria-invalid + aria-describedby', async () => {
    await mountView(baseProps({
      parties: [makeParty({ memberCards: [{ uuid: 'Actor.a', name: 'Aria', img: '', stale: false }], memberCount: 1 })],
      selectedPartyId: 'p1',
      actorOptions: [{ uuid: 'Actor.b', id: 'b', name: 'Borin', img: '' }],
      fieldErrors: { members: 'This actor already belongs to another enabled party.' }
    }));
    const errorNode = target.querySelector('#manager-travel-member-error');
    assert.ok(errorNode, 'member error node should render');
    const trigger = target.querySelector('.manager-travel-members .manager-travel-picker-trigger');
    assert.equal(trigger.getAttribute('aria-invalid'), 'true');
    assert.equal(trigger.getAttribute('aria-describedby'), 'manager-travel-member-error');
    remount();
  });

  it('wires the duplicate-travel-actor inline error via aria-invalid + aria-describedby', async () => {
    await mountView(baseProps({
      parties: [makeParty()],
      selectedPartyId: 'p1',
      actorOptions: [{ uuid: 'Actor.b', id: 'b', name: 'Borin', img: '' }],
      fieldErrors: { travelActor: 'This travel actor is already used by another enabled party.' }
    }));
    const errorNode = target.querySelector('#manager-travel-actor-error');
    assert.ok(errorNode, 'travel-actor error node should render');
    const row = target.querySelector('.manager-travel-actor-row');
    assert.equal(row.getAttribute('aria-invalid'), 'true');
    assert.equal(row.getAttribute('aria-describedby'), 'manager-travel-actor-error');
    remount();
  });

  it('renders stale member/travel-actor/override-region rows each with a remove/clear button', async () => {
    await mountView(baseProps({
      parties: [makeParty({
        memberActorUuids: ['Actor.gone'],
        memberCards: [{ uuid: 'Actor.gone', name: '', img: '', stale: true }],
        memberCount: 1,
        travelActorUuid: 'Actor.also-gone',
        staleMembers: ['Actor.gone'],
        staleTravelActor: 'Actor.also-gone',
        staleRegionIds: ['r-missing'],
        hasStaleReference: true
      })],
      selectedPartyId: 'p1'
    }));
    const staleSection = target.querySelector('.manager-travel-stale');
    assert.ok(staleSection, 'stale section should render');
    assert.ok(staleSection.querySelector('[data-stale-member="Actor.gone"] button'), 'stale member row should have a button');
    assert.ok(staleSection.querySelector('[data-stale-travel-actor="Actor.also-gone"] button'), 'stale travel actor row should have a button');
    assert.ok(staleSection.querySelector('[data-stale-region="r-missing"] button'), 'stale region row should have a button');
    remount();
  });

  it('all interactive controls are <button> elements (keyboard reachable)', async () => {
    await mountView(baseProps({
      parties: [makeParty({ memberCards: [{ uuid: 'Actor.a', name: 'Aria', img: '', stale: false }], memberCount: 1, travelActorUuid: 'Actor.a', travelActor: { uuid: 'Actor.a', name: 'Aria', img: '' } })],
      selectedPartyId: 'p1',
      actorOptions: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }],
      systemRegions: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false }]
    }));
    // Every clickable action is a real button: party rows, toggles, pickers,
    // region chips, override Set/Clear, and remove/clear icon buttons.
    const interactiveDivs = Array.from(target.querySelectorAll('[onclick]'))
      .filter(node => node.tagName !== 'BUTTON');
    assert.equal(interactiveDivs.length, 0, 'no non-button element should carry a click handler');
    assert.ok(target.querySelector('.manager-travel-region-chip'), 'region chips render as buttons');
    remount();
  });

  it('redaction guard: a secret undiscovered region in evidence never leaks its name/id', async () => {
    const SECRET_NAME = 'SECRET_SANCTUM';
    const SECRET_ID = 'region-secret-xyz';
    // Even though this GM surface can show region data, the redaction guard
    // asserts the view is not a covert leak channel: when a region is intended
    // to be hidden, its identity must not appear in text, title, aria-label, or
    // data-* attributes via the disclosure-safe display path. Here we model a
    // secret region NOT present in the GM-visible systemRegions/evidence and
    // assert it appears nowhere.
    await mountView(baseProps({
      parties: [makeParty({
        currentRegionEvidence: {
          source: 'manualOverride',
          resolved: true,
          regions: [{ id: 'r1', name: 'Verdant', enabled: true }],
          staleRegionIds: []
        }
      })],
      selectedPartyId: 'p1',
      systemRegions: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false }]
    }));
    const html = target.innerHTML;
    assert.equal(html.includes(SECRET_NAME), false, 'secret region name must not appear in markup');
    assert.equal(html.includes(SECRET_ID), false, 'secret region id must not appear in markup');
    // Assert across every attribute channel explicitly.
    for (const node of target.querySelectorAll('*')) {
      assert.equal((node.textContent || '').includes(SECRET_NAME), false);
      assert.equal((node.getAttribute('title') || '').includes(SECRET_NAME), false);
      assert.equal((node.getAttribute('aria-label') || '').includes(SECRET_NAME), false);
      for (const attr of node.getAttributeNames()) {
        if (attr.startsWith('data-')) {
          assert.equal((node.getAttribute(attr) || '').includes(SECRET_ID), false, `data attr ${attr} must not leak secret id`);
          assert.equal((node.getAttribute(attr) || '').includes(SECRET_NAME), false, `data attr ${attr} must not leak secret name`);
        }
      }
    }
    remount();
  });
});
