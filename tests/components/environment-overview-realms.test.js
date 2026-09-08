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
});
