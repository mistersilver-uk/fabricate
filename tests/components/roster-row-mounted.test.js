import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-roster-row-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/RosterRow.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/RosterRow.svelte'
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RosterRow (mounted)', () => {
  it('renders the name, subtitle and default icon', async () => {
    const root = await harness.mount({ name: 'Alice', subtitle: 'Player', granted: true });
    assert.equal(root.querySelector('.manager-roster-name').textContent, 'Alice');
    assert.equal(root.querySelector('.manager-roster-subtitle').textContent, 'Player');
    assert.ok(root.querySelector('.manager-roster-icon i.fa-user'));
  });

  it('reflects the granted state on the toggle (on)', async () => {
    const root = await harness.mount({ name: 'Bob', granted: true });
    const toggle = root.querySelector('.manager-status-toggle');
    assert.ok(toggle.classList.contains('is-on'));
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(root.querySelector('.manager-status-toggle-label').textContent, 'On');
  });

  it('reflects the revoked state on the toggle (off)', async () => {
    const root = await harness.mount({ name: 'Bob', granted: false });
    const toggle = root.querySelector('.manager-status-toggle');
    assert.ok(toggle.classList.contains('is-off'));
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(root.querySelector('.manager-status-toggle-label').textContent, 'Off');
  });

  it('calls onToggle with the negated granted value when clicked', async () => {
    const calls = [];
    const root = await harness.mount({ name: 'Bob', granted: false, onToggle: (v) => calls.push(v) });
    root.querySelector('.manager-status-toggle').click();
    assert.deepEqual(calls, [true]);
  });

  it('renders a custom icon and stamps dataAttr', async () => {
    const root = await harness.mount({
      name: 'Party',
      icon: 'fas fa-users',
      granted: true,
      dataAttr: 'data-roster-row'
    });
    assert.ok(root.querySelector('.manager-roster-icon i.fa-users'));
    assert.ok(root.querySelector('[data-roster-row]'));
  });
});
