/** The gathering events browser's row controls, mounted (issue 2025). */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, unmount } from 'svelte';

import { disposeManagerSuite, managerComponent } from './manager-mounted-shared.js';

const VIEW = 'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte';

const EVENTS = Object.freeze([
  { id: 'ev-selected', name: 'Rockfall', enabled: true },
  { id: 'ev-off', name: 'Thorn Snare', enabled: false },
  { id: 'ev-on', name: 'Clear Skies', enabled: true },
]);

let View;
let mounted;
let target;

function mountView(props = {}) {
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = mount(View, {
    target,
    props: {
      events: EVENTS,
      selectedEventId: 'ev-selected',
      selectedSystemId: 'alchemy',
      ...props,
    },
  });
  flushSync();
  return target;
}

const toggleOf = (id) =>
  target.querySelector(`[data-gathering-event-id="${id}"] .manager-status-cell button`);

describe('the gathering events browser row toggle (issue 2025)', () => {
  before(async () => {
    View = await managerComponent(VIEW);
  });

  afterEach(async () => {
    if (mounted) unmount(mounted);
    mounted = null;
    target?.remove();
    target = null;
    await new Promise((settled) => setImmediate(settled));
  });

  after(disposeManagerSuite);

  it('flips the row’s own event in both directions, never the selected one', () => {
    const toggled = [];
    mountView({
      onToggleEventEnabled: (...args) => {
        toggled.push(args);
      },
    });

    toggleOf('ev-off').click();
    toggleOf('ev-on').click();

    assert.deepEqual(toggled, [
      ['alchemy', 'ev-off', true],
      ['alchemy', 'ev-on', false],
    ]);
  });

  it('names each toggle for its own event', () => {
    mountView();
    assert.equal(toggleOf('ev-off').getAttribute('aria-label'), 'Toggle Thorn Snare');
  });

  it('names a row’s controls literally for an event whose name carries $ patterns (issue 1292)', () => {
    const name = "Pit $& $` $' end";
    mountView({ events: [{ id: 'ev-dollar', name, enabled: true }] });
    const labels = [
      ...target.querySelectorAll(':scope [data-gathering-event-id="ev-dollar"] [aria-label]'),
    ].map((control) => control.getAttribute('aria-label'));
    for (const expected of [
      `Toggle ${name}`,
      `Edit ${name}`,
      `Gathering event actions for ${name}`,
    ]) {
      assert.ok(labels.includes(expected), `${expected} among ${JSON.stringify(labels)}`);
    }
  });
});
