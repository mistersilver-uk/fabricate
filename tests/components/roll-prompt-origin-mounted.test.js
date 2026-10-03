/** Issue 2053: a keyboard-only Craft opens its roll prompt in the window it started from. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CRAFT_BUTTON = 'src/ui/svelte/apps/crafting/CraftButton.svelte';
const HOST = 'src/ui/svelte/apps/crafting/rollPromptHost.js';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-roll-prompt-origin-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    HOST,
    'src/ui/svelte/util/rollPromptOrigin.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/theme.js',
  ],
  compiledModules: ['src/ui/svelte/components/ManagerButton.svelte', CRAFT_BUTTON],
  componentPath: CRAFT_BUTTON,
  rootClass: 'fabricate-app',
});

describe('roll prompt origin (mounted)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('hosts a keyboard-activated Craft in its own window with no root focused or hovered', async () => {
    const { openRollPromptModal } = await harness.loadRawModule(HOST);
    const targets = [];
    const prompt = () =>
      openRollPromptModal(
        {},
        {
          doc: document,
          loadComponent: async () => ({ default: 'RollPrompt' }),
          mountComponent: (component, { target, props }) => {
            targets.push(target);
            props.onDismiss();
            return {};
          },
          unmountComponent: () => {},
        }
      );
    let settled;
    const root = await harness.mount({
      label: 'Craft',
      onCraft: () => {
        // The Craft button disables itself, so focus leaves the window before the prompt opens.
        document.activeElement?.blur?.();
        settled = Promise.resolve().then(prompt);
        return settled;
      },
    });
    const button = root.querySelector('[data-crafting-craft]');
    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await settled;

    assert.ok(!root.matches(':hover'), 'the pointer rests outside the window');
    assert.ok(document.activeElement === document.body, 'focus is nowhere when the prompt opens');
    assert.equal(targets.length, 1);
    assert.ok(targets[0] === root, 'the prompt hosts in the window the Craft started from');
    assert.ok(
      !document.querySelector('.fabricate-standalone-overlay'),
      'no standalone layer opened'
    );
  });
});
