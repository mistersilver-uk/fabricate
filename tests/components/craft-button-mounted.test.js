/** Issue 2752: the run summary's craft action keeps focus and refuses a second press while a craft is in flight. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CRAFT_BUTTON = 'src/ui/svelte/apps/crafting/CraftButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-craft-button-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/appLocalizer.js',
    'src/ui/svelte/util/rollPromptOrigin.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/apps/crafting/rollPromptHost.js',
    'src/ui/theme.js',
  ],
  compiledModules: ['src/ui/svelte/components/Button.svelte', CRAFT_BUTTON],
  componentPath: CRAFT_BUTTON,
  rootClass: 'fabricate-app',
});

describe('CraftButton busy state (mounted)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('keeps focus, announces aria-busy and ignores a second press while a craft is in flight', async () => {
    const crafted = [];
    const target = await harness.mount({
      label: 'Craft another',
      onCraft: () => {
        crafted.push('craft');
      },
      busy: false,
    });
    const idle = target.querySelector('[data-crafting-craft]');
    idle.focus();
    idle.click();
    assert.deepEqual(crafted, ['craft']);

    await harness.setProps({ busy: true });
    const busyBtn = target.querySelector('[data-crafting-craft]');
    assert.ok(busyBtn === idle, 'the same button node survives the press');
    assert.ok(target.ownerDocument.activeElement === busyBtn, 'the pressed button keeps focus');
    assert.equal(busyBtn.getAttribute('aria-busy'), 'true', 'and announces the busy state');
    assert.equal(busyBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(busyBtn.disabled, false, 'busy is not disabled, so the tab stop stays');
    assert.equal(busyBtn.getAttribute('data-crafting-craft-disabled'), 'true');
    assert.match(busyBtn.textContent, /Button\.Crafting/u);
    assert.ok(Boolean(busyBtn.querySelector('i.fa-spinner')), 'with the spinner glyph');
    busyBtn.click();
    assert.deepEqual(crafted, ['craft'], 'a second press is swallowed while busy');

    await harness.setProps({ busy: false });
    assert.ok(!busyBtn.hasAttribute('aria-busy'), 'the busy face clears when the craft ends');
  });

  it('stays focusable while busy even when the selection stopped being craftable mid-flight', async () => {
    const target = await harness.mount({
      label: 'Craft another',
      disabled: false,
      busy: false,
    });
    const button = target.querySelector('[data-crafting-craft]');
    button.focus();
    await harness.setProps({ busy: true, disabled: true });
    assert.equal(button.disabled, false, 'the spent inputs do not disable a craft in flight');
    assert.ok(target.ownerDocument.activeElement === button, 'focus holds');
  });

  it('still renders a blocked, idle craft disabled', async () => {
    const target = await harness.mount({
      label: 'Craft another',
      disabled: true,
      disabledReason: 'Missing materials',
      busy: false,
    });
    const button = target.querySelector('[data-crafting-craft]');
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('data-crafting-craft-disabled'), 'true');
    assert.equal(button.getAttribute('aria-label'), 'Missing materials');
  });
});
