import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { createSvelteCompiler, installComponentTestGlobals } from '../helpers/svelte-component-harness.js';
import { buildRegionDisclosure, UNDISCOVERED_PLACEHOLDER_KEY } from '../../src/systems/gatheringLocation.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let GatheringTravelView;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

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
    installComponentTestGlobals();

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

  it('redaction guard: a secret undiscovered region routed through buildRegionDisclosure leaks nothing but renders the placeholder', async () => {
    const SECRET_NAME = 'SECRET_SANCTUM';
    const SECRET_ID = 'region-secret-xyz';

    // Build the disclosure-safe display model the REAL way: a non-GM viewer
    // seeing a secret, undiscovered region (manual reveal mode). The disclosure
    // contract redacts both id and name, returning a placeholder instead.
    const disclosure = buildRegionDisclosure(
      { id: SECRET_ID, name: SECRET_NAME, secret: true, enabled: true },
      { isGM: false, discovered: false, revealMode: 'manual' }
    );
    assert.equal(disclosure.placeholder, true, 'precondition: secret undiscovered region must redact to a placeholder');
    assert.equal(disclosure.id, null, 'precondition: disclosure must drop the secret id');
    assert.equal(disclosure.label, undefined, 'precondition: disclosure must drop the secret name');

    // Wire the placeholder disclosure into the component the way the player-facing
    // wiring does: a region option/chip whose id and name come from the
    // disclosure, never from the raw secret record. The localized placeholder
    // label stands in for the name. (The test's localize stub is identity, so the
    // rendered label is the placeholder key itself.)
    const PLACEHOLDER_LABEL = UNDISCOVERED_PLACEHOLDER_KEY;
    // disclosure.id is null and disclosure.label is undefined for a redacted
    // region, so the view receives a synthetic id (not the secret one) and the
    // localized placeholder key in place of the name.
    const placeholderRegion = {
      id: disclosure.id ?? 'placeholder-region',
      name: disclosure.label ?? disclosure.labelKey ?? PLACEHOLDER_LABEL,
      enabled: true,
      secret: true
    };

    await mountView(baseProps({
      parties: [makeParty({
        currentRegionEvidence: {
          source: 'manualOverride',
          resolved: true,
          regions: [{ id: placeholderRegion.id, name: placeholderRegion.name, enabled: true }],
          staleRegionIds: []
        }
      })],
      selectedPartyId: 'p1',
      systemRegions: [placeholderRegion]
    }));

    const html = target.innerHTML;
    assert.equal(html.includes(SECRET_NAME), false, 'secret region name must not appear in markup');
    assert.equal(html.includes(SECRET_ID), false, 'secret region id must not appear in markup');
    // Assert across every channel: text, title, aria-label, and every data-* attr.
    for (const node of target.querySelectorAll('*')) {
      assert.equal((node.textContent || '').includes(SECRET_NAME), false);
      assert.equal((node.getAttribute('title') || '').includes(SECRET_NAME), false);
      assert.equal((node.getAttribute('aria-label') || '').includes(SECRET_NAME), false);
      for (const attr of node.getAttributeNames()) {
        const value = node.getAttribute(attr) || '';
        assert.equal(value.includes(SECRET_ID), false, `attr ${attr} must not leak secret id`);
        assert.equal(value.includes(SECRET_NAME), false, `attr ${attr} must not leak secret name`);
      }
    }
    // The placeholder label DOES render via the disclosure-safe path.
    const chip = target.querySelector(`.manager-travel-region-chip[data-region-id="${placeholderRegion.id}"]`);
    assert.ok(chip, 'placeholder region chip should render');
    assert.ok(chip.textContent.includes(PLACEHOLDER_LABEL), 'placeholder label should render in place of the secret name');
    remount();
  });

  it('expanded region authoring edits description, secret, image, and biomes through onUpdateRegion', async () => {
    const updates = [];
    const toggles = [];
    const deletes = [];
    await mountView(baseProps({
      parties: [makeParty()],
      selectedPartyId: 'p1',
      systemRegions: [
        { id: 'r1', name: 'Verdant', description: 'Old wood', img: 'icons/svg/direction.svg', enabled: true, secret: false, biomes: ['forest'] },
        { id: 'r2', name: 'Dunes', description: '', img: null, enabled: false, secret: true, biomes: [] }
      ],
      biomeOptions: [
        { id: 'forest', label: 'Forest' },
        { id: 'cavern', label: 'Crystal Cavern' }
      ],
      onUpdateRegion: (sys, id, patch) => updates.push([sys, id, patch]),
      onToggleRegionEnabled: (sys, id, enabled) => toggles.push([sys, id, enabled]),
      onDeleteRegion: (sys, id) => deletes.push([sys, id])
    }));

    // List + detail layout: first region selected by default.
    const detail = target.querySelector('.manager-travel-region-detail');
    assert.ok(detail, 'region detail pane should render');
    assert.equal(detail.dataset.regionDetail, 'r1');

    // Description edit round-trips a merge patch.
    const description = detail.querySelector('[data-region-field="description"]');
    description.value = 'Ancient moonlit forest';
    description.dispatchEvent(new Event('blur', { bubbles: true }));
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), ['sys-1', 'r1', { description: 'Ancient moonlit forest' }]);

    // Secret toggle round-trips through onUpdateRegion (not a quick toggle).
    detail.querySelector('[data-region-field="secret"]').click();
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), ['sys-1', 'r1', { secret: true }]);

    // Enabled toggle round-trips through onToggleRegionEnabled.
    detail.querySelector('[data-region-field="enabled"]').click();
    await tick();
    flushSync();
    assert.deepEqual(toggles.at(-1), ['sys-1', 'r1', false]);

    // Biome add appends to the existing biome list.
    const biomeSelect = detail.querySelector('[data-region-field="biomes"] select');
    biomeSelect.value = 'cavern';
    biomeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), ['sys-1', 'r1', { biomes: ['forest', 'cavern'] }]);

    // Biome remove drops the chip.
    detail.querySelector('[data-region-field="biomes"] .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), ['sys-1', 'r1', { biomes: [] }]);

    // Selecting the second region swaps the detail pane.
    target.querySelector('[data-region-select="r2"]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.manager-travel-region-detail').dataset.regionDetail, 'r2');

    // Delete routes through the (store-owned) delete handler.
    target.querySelector('[data-region-id="r2"] .manager-icon-button.is-danger').click();
    await tick();
    flushSync();
    assert.deepEqual(deletes.at(-1), ['sys-1', 'r2']);
    remount();
  });
});
