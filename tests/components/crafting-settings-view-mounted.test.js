import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { craftingEffect } from '../../src/ui/svelte/apps/manager/crafting/craftingVisibility.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-crafting-settings-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/apps/manager/resolutionModeOptions.js'
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ResolutionModeCard.svelte',
    'src/ui/svelte/apps/manager/CraftingEffectPanel.svelte',
    'src/ui/svelte/apps/manager/CraftingSettingsView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/CraftingSettingsView.svelte'
});

// Let Svelte's scheduler flush DOM updates triggered by an (async) event handler.
function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeSystem(overrides = {}) {
  const visibilityMode = overrides.visibilityMode ?? 'knowledge';
  return {
    name: 'Mythwright',
    resolutionMode: 'simple',
    salvageResolutionMode: 'progressive',
    visibilityMode,
    craftingEffect: craftingEffect(visibilityMode),
    features: { salvage: true },
    ...overrides
  };
}

function selectRadio(root, optionDataAttr, value) {
  const radio = root.querySelector(`[${optionDataAttr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `radio for ${value} exists`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
  return radio;
}

function activeOptionValue(root, dataAttr, optionDataAttr) {
  const active = root.querySelector(`[${dataAttr}] .manager-resolution-option.is-active`);
  return active ? active.getAttribute(optionDataAttr) : null;
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('CraftingSettingsView (mounted)', () => {
  it('renders the resolution grid, the visibility grid and the effect panel', async () => {
    const root = await harness.mount({ selectedSystem: makeSystem({ visibilityMode: 'knowledge' }) });

    const resolution = root.querySelector('[data-crafting-resolution-mode]');
    const visibility = root.querySelector('[data-crafting-visibility-mode]');
    assert.ok(resolution, 'recipe resolution card renders');
    assert.ok(visibility, 'recipe visibility card renders');
    assert.ok(root.querySelector('[data-crafting-effect]'), 'effect panel renders');

    assert.equal(resolution.querySelectorAll('.manager-resolution-option').length, 5);
    assert.equal(visibility.querySelectorAll('.manager-resolution-option').length, 4);
  });

  it('marks the visibility card active on the system mode and offers the four modes', async () => {
    const root = await harness.mount({ selectedSystem: makeSystem({ visibilityMode: 'item' }) });
    const values = [...root.querySelectorAll('[data-crafting-visibility-mode-option]')].map((el) =>
      el.getAttribute('data-crafting-visibility-mode-option')
    );
    assert.deepEqual(values, ['global', 'restricted', 'item', 'knowledge']);
    assert.equal(
      activeOptionValue(root, 'data-crafting-visibility-mode', 'data-crafting-visibility-mode-option'),
      'item'
    );
  });

  it('calls onSetVisibilityMode with the chosen mode (non-destructive, no revert)', async () => {
    const calls = [];
    const root = await harness.mount({
      selectedSystem: makeSystem({ visibilityMode: 'knowledge' }),
      onSetVisibilityMode: (mode) => calls.push(mode)
    });

    selectRadio(root, 'data-crafting-visibility-mode-option', 'global');
    await flushRender();

    assert.deepEqual(calls, ['global']);
  });

  it('reflects the visibility mode in the effect panel (item shows Books & Scrolls + Limited use)', async () => {
    const root = await harness.mount({ selectedSystem: makeSystem({ visibilityMode: 'item' }) });

    const state = (row) =>
      root
        .querySelector(`[data-crafting-effect-row="${row}"] .manager-crafting-effect-badge`)
        .getAttribute('data-crafting-effect-state');
    assert.equal(state('access'), 'off');
    assert.equal(state('books-scrolls'), 'on');
    assert.equal(state('limited-use'), 'on');
    assert.equal(state('learning-limits'), 'off');

    assert.equal(
      root.querySelector('[data-crafting-effect-summary] span').textContent,
      'Players craft from recipes only while holding the linked item.'
    );
  });

  it('reverts the resolution radio when onSetResolutionMode resolves false', async () => {
    const calls = [];
    const root = await harness.mount({
      selectedSystem: makeSystem({ resolutionMode: 'simple' }),
      onSetResolutionMode: (mode) => {
        calls.push(mode);
        return Promise.resolve(false);
      }
    });

    selectRadio(root, 'data-crafting-resolution-mode-option', 'progressive');
    await flushRender();

    assert.deepEqual(calls, ['progressive'], 'the store action was asked to migrate');
    assert.equal(
      activeOptionValue(root, 'data-crafting-resolution-mode', 'data-crafting-resolution-mode-option'),
      'simple',
      'the radio reverts to the persisted mode on cancel'
    );
  });

  it('shows the salvage card only when the salvage feature is enabled', async () => {
    const withSalvage = await harness.mount({ selectedSystem: makeSystem({ features: { salvage: true } }) });
    assert.ok(withSalvage.querySelector('[data-crafting-salvage-resolution-mode]'), 'salvage card shown');

    harness.remount();

    const withoutSalvage = await harness.mount({ selectedSystem: makeSystem({ features: { salvage: false } }) });
    assert.equal(
      withoutSalvage.querySelector('[data-crafting-salvage-resolution-mode]'),
      null,
      'salvage card hidden when the feature is off'
    );
  });
});
