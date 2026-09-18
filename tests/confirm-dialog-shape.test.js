/** The confirm seam's OPTIONS SHAPE (issue 1154), pinned across BOTH wrappers. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { confirmDialog as compatConfirmDialog } from '../src/ui/foundryCompat.js';
import { confirmDialog as bridgeConfirmDialog } from '../src/ui/svelte/util/foundryBridge.js';

// Both wrappers are the same seam for the same primitive; the manager app wires foundryCompat and
// the player app wires foundryBridge.
const SEAMS = [
  ['foundryCompat', compatConfirmDialog],
  ['foundryBridge', bridgeConfirmDialog],
];

// Captures exactly what reaches `DialogV2.confirm`, which is the thing under test.
function captureConfirmOptions() {
  const received = [];
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          confirm: async (options) => {
            received.push(options);
            return true;
          },
        },
      },
    },
  };
  return received;
}

function releaseFoundry() {
  delete globalThis.foundry;
}

for (const [seam, confirmDialog] of SEAMS) {
  test(`${seam} confirmDialog maps a top-level title onto window.title`, async () => {
    const received = captureConfirmOptions();
    await confirmDialog({ title: 'Delete Alchemy?', content: '<p>Gone for good.</p>' });
    releaseFoundry();

    assert.equal(received[0].window?.title, 'Delete Alchemy?');
  });

  test(`${seam} confirmDialog keeps an explicit window.title`, async () => {
    const received = captureConfirmOptions();
    await confirmDialog({ title: 'ignored', window: { title: 'Delete Alchemy?', icon: 'fa-x' } });
    releaseFoundry();

    assert.equal(received[0].window.title, 'Delete Alchemy?');
    assert.equal(received[0].window.icon, 'fa-x', 'the rest of the window bag survives');
  });

  test(`${seam} confirmDialog wraps a function yes/no so its callback is merged`, async () => {
    const received = captureConfirmOptions();
    await confirmDialog({ yes: () => 'affirmed', no: () => 'declined' });
    releaseFoundry();

    const { yes, no } = received[0];
    assert.equal(typeof yes, 'object', 'a bare function contributes no own enumerable keys');
    assert.equal(yes.callback(), 'affirmed');
    assert.equal(typeof no, 'object');
    assert.equal(no.callback(), 'declined');
  });

  test(`${seam} confirmDialog leaves an object yes/no untouched`, async () => {
    const received = captureConfirmOptions();
    const yes = { label: 'Delete', icon: 'fa-solid fa-trash', callback: () => true };
    await confirmDialog({ yes });
    releaseFoundry();

    assert.equal(received[0].yes, yes);
  });

  test(`${seam} confirmDialog does not invent buttons`, async () => {
    const received = captureConfirmOptions();
    await confirmDialog({ title: 'Delete Alchemy?' });
    releaseFoundry();

    assert.equal(
      Object.hasOwn(received[0], 'buttons'),
      false,
      'an injected buttons array would unshift into a THREE-button confirm'
    );
  });

  test(`${seam} confirmDialog does not mutate the caller's options`, async () => {
    const received = captureConfirmOptions();
    const options = { title: 'Delete Alchemy?', yes: () => true };
    await confirmDialog(options);
    releaseFoundry();

    assert.equal(Object.hasOwn(options, 'window'), false, 'the caller keeps its own bag');
    assert.equal(typeof options.yes, 'function');
    assert.notEqual(received[0], options);
  });

  test(`${seam} confirmDialog returns false when DialogV2 is unavailable`, async () => {
    globalThis.foundry = { applications: { api: {} } };
    const result = await confirmDialog({ title: 'Delete Alchemy?' });
    releaseFoundry();

    assert.equal(result, false);
  });
}
