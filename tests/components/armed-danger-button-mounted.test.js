/** `ArmedDangerButton`'s control-height rung, mounted (issue 2257 D10). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/components/ArmedDangerButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-armed-danger-button-',
  compiledModules: [componentPath],
  componentPath,
});

before(async () => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const button = () => document.body.querySelector('.fabricate-button');

describe('ArmedDangerButton joins the manager button only at the 38 rung', () => {
  it('writes the bare family root and danger role by default', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete' });
    assert.equal(button().className, 'fabricate-button is-danger');
  });

  it('stands among the page header actions at size 38', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete', size: '38' });
    assert.ok(button().classList.contains('fab-manager-button'), button().className);
    assert.ok(button().classList.contains('is-size-38'), button().className);
  });

  it('keeps the family 34 for any other size', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete', size: '34' });
    assert.ok(!button().classList.contains('fab-manager-button'), button().className);
    assert.ok(!button().classList.contains('is-size-38'), button().className);
  });
});
