import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { createSvelteCompiler, installComponentTestGlobals } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let EnvironmentOverviewTab;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

function baseProps(overrides = {}) {
  return {
    environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: [] },
    realmRecords: [],
    realmsEnabled: false,
    biomeOptions: [],
    dangerOptions: [],
    linkedSceneImage: '',
    onPickImagePath: null,
    onUpdate: () => {},
    onSetCompositionMode: () => {},
    ...overrides
  };
}

async function mountTab(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(EnvironmentOverviewTab, { target, props });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

describe('EnvironmentOverviewTab multi-realm selector', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-env-overview-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeRawModule('src/gatheringImageDefaults.js');
    writeRawModule('src/ui/svelte/util/gatheringFormat.js');
    writeCompiledSvelte('src/ui/svelte/components/StatusToggle.svelte');
    // The realm and biome rows render the shared chip as of issue 1515. A `.svelte` this tree
    // renders but this list omits does not FAIL this suite - the temp tree dies on
    // ERR_MODULE_NOT_FOUND and node reports every test here as `# cancelled`.
    writeCompiledSvelte('src/ui/svelte/components/Chip.svelte');
    writeCompiledSvelte('src/ui/svelte/components/Field.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/EmptyState.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/environment/CompositionModeControl.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte.js')).href);
    EnvironmentOverviewTab = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('hides the realm field entirely when the Travel & Realms toggle is off', async () => {
    await mountTab(baseProps({ realmsEnabled: false, realmRecords: [{ id: 'r1', name: 'Verdant' }] }));
    assert.equal(target.querySelector('[data-environment-field="includedRealmIds"]'), null, 'realm field is hidden when disabled');
    // The legacy single-region <select> must not appear either.
    assert.equal(target.querySelector('[data-environment-field="region"]'), null, 'legacy single-region select is removed');
    remount();
  });

  it('shows an empty-state hint pointing to the Travel tab when enabled but no realms exist', async () => {
    await mountTab(baseProps({ realmsEnabled: true, realmRecords: [] }));
    const field = target.querySelector('[data-environment-field="includedRealmIds"]');
    assert.ok(field, 'realm field renders when enabled');
    assert.ok(target.querySelector('[data-environment-realm-empty]'), 'empty-state hint renders');
    assert.equal(field.querySelector('select'), null, 'no add-select when there are no realms');
    remount();
  });

  it('adds and removes realm chips bound to includedRealmIds', async () => {
    const updates = [];
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [
        { id: 'r1', name: 'Verdant' },
        { id: 'r2', name: 'Dunes' }
      ],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1'] },
      onUpdate: (patch) => updates.push(patch)
    }));

    const field = target.querySelector('[data-environment-field="includedRealmIds"]');
    assert.ok(field, 'realm field renders');
    // r1 already selected → its chip shows; only r2 remains in the add-select.
    const options = Array.from(field.querySelectorAll('select option')).map(o => o.value).filter(Boolean);
    assert.deepEqual(options, ['r2']);

    const select = field.querySelector('select');
    select.value = 'r2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), { includedRealmIds: ['r1', 'r2'] });

    field.querySelector('[data-environment-realm-pill] [data-chip-remove]').click();
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), { includedRealmIds: [] });
    remount();
  });

  it('announces the set each editable row now holds, which the chip primitive cannot do for it', async () => {
    // THE LIVE REGION IS THE CALLER'S, and this is the clause that says so in the DOM rather than
    // in a docblock. Neither adding nor removing a member moves focus into the row, and a region
    // wrapped around the row itself announces each added chip's whole subtree on an add and
    // NOTHING AT ALL on a removal, because `aria-relevant` defaults to `additions text` and a
    // removed keyed child is excluded outright. So the row owes one polite summary beside it,
    // restated on every change to the set — which is what the two mounts below read.
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [{ id: 'r1', name: 'Verdant' }, { id: 'r2', name: 'Dunes' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1', 'r2'] }
    }));
    const both = target.querySelector('[data-environment-realm-status]');
    assert.ok(Boolean(both), 'the realm row books a live region');
    assert.equal(both.getAttribute('aria-live'), 'polite');
    assert.ok(both.classList.contains('visually-hidden'), 'the summary is for the screen reader, not the screen');
    assert.equal(both.textContent.trim(), 'Verdant and Dunes');
    remount();

    // The same row with one member taken out: the region names what SURVIVES, which is the
    // reading a removal has to produce and the one a bare row cannot.
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [{ id: 'r1', name: 'Verdant' }, { id: 'r2', name: 'Dunes' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1'] }
    }));
    assert.equal(
      target.querySelector('[data-environment-realm-status]').textContent.trim(),
      'Verdant'
    );
    remount();
  });

  it('draws a biome chip in the colour the biome was AUTHORED in, not the one its token names', async () => {
    // THE ONE CLAIM IN THIS ROUTE THAT A READER CANNOT CHECK BY EYE (issue 1515). The chip
    // primitive's `tint` is what arms its tinted face, and it validates BARE `--fab-tag-*` palette
    // keys only — a biome carrying an authored hex has no key to pass. So the view passes both:
    // the key, to arm the face, and a `style` through the rest spread, which lands AFTER the
    // primitive's own `style` attribute and therefore states the colour that face reads. If that
    // ordering ever reversed, every custom-coloured biome would silently fall back to its palette
    // token with nothing else failing. `getAttribute` rather than `element.style`, because
    // happy-dom drops a nested `var()` out of `cssText` and keeps the attribute verbatim.
    await mountTab(baseProps({
      biomeOptions: [
        { id: 'ashfall', label: 'Ashfall', colorToken: 'mist', customColor: '#AA3311' },
        { id: 'verdant', label: 'Verdant', colorToken: 'sage' }
      ],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: ['ashfall', 'verdant'], includedRealmIds: [] }
    }));

    const authored = target.querySelector('[data-environment-biome-pill="ashfall"]');
    assert.ok(Boolean(authored), 'the authored-colour biome renders a chip');
    assert.ok(authored.classList.contains('has-tint'), 'the chip wears the primitive’s tinted face');
    // happy-dom normalises the attribute by appending the terminating semicolon it was written
    // without, which is why this reads the declaration rather than the whole string.
    assert.ok(
      authored.getAttribute('style').startsWith('--fab-chip-color: #AA3311'),
      `the authored hex reaches the chip, got ${authored.getAttribute('style')}`
    );

    const tokened = target.querySelector('[data-environment-biome-pill="verdant"]');
    assert.ok(Boolean(tokened), 'the token-coloured biome renders a chip');
    assert.ok(
      tokened.getAttribute('style').startsWith('--fab-chip-color: var(--fab-tag-sage)'),
      `an unauthored biome still reads its palette token, got ${tokened.getAttribute('style')}`
    );
    remount();
  });

  it('keeps focus in the row when the LAST chip is removed and no add control is left', async () => {
    // THE LADDER RAN OUT (issue 1515). `Chip` resolves its focus destination BEFORE it removes
    // the chip: the next chip's remove control, else the previous chip's, else the nearest
    // enclosing `[data-chip-remove-fallback]`. This row hung that hook on its add-`<select>`,
    // which renders only while an UNSELECTED realm remains — so with one realm in the world and
    // that realm selected there was no next chip, no previous chip and no select, and removing
    // the last chip dropped focus to `<body>`. That is the unfocused-window state (Space pauses
    // the game, the arrows pan the canvas) with the keyboard user stranded at the top of the
    // document. The row itself is the rung that cannot disappear.
    await mountTab(baseProps({
      realmsEnabled: true,
      realmRecords: [{ id: 'r1', name: 'Verdant' }],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRealmIds: ['r1'] }
    }));

    const field = target.querySelector('[data-environment-field="includedRealmIds"]');
    assert.equal(
      field.querySelector('select'),
      null,
      'the precondition IS the defect: every realm is selected, so the add control is gone'
    );

    // STATIC CLAUSE FIRST, because happy-dom will focus anything it is asked to and would report
    // `activeElement` as the row even if the row were a plain `<div>` no browser could focus.
    // The attribute pair is what makes the destination real in a browser.
    const row = field.querySelector('.manager-chip-row');
    assert.ok(Boolean(row), 'the row renders');
    assert.ok(row.hasAttribute('data-chip-remove-fallback'), 'the row carries the fallback hook');
    assert.equal(row.getAttribute('tabindex'), '-1', 'and is focusable without taking a tab stop');

    const chips = field.querySelectorAll('[data-environment-realm-pill]');
    assert.equal(chips.length, 1, 'exactly one chip, so there is no sibling to fall back to');
    field.querySelector('[data-environment-realm-pill] [data-chip-remove]').click();
    await tick();
    flushSync();

    assert.ok(
      document.activeElement === row,
      `focus stayed in the row rather than falling to <body>, got ${document.activeElement?.tagName}.${document.activeElement?.className}`
    );
    remount();
  });
});
