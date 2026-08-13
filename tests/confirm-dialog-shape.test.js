/**
 * The confirm seam's OPTIONS SHAPE (issue 1154), pinned across BOTH wrappers.
 *
 * `services.confirmDialog` is the only yes/no primitive in the app, and two things about
 * the bag it forwards are read by nothing unless they are mapped first. Verified against
 * the real builds rather than the docs:
 *
 *  - `ApplicationV2#title` is `_loc(this.options.window.title)` — V14.365
 *    `client/applications/api/application.mjs:319-321`, V13.351 the same getter at
 *    `:287` — and `DEFAULT_OPTIONS.window.title` is `""`. Nothing reads a TOP-LEVEL
 *    `title`, so an unmapped one renders an empty title bar.
 *  - `DialogV2.confirm` merges `yes`/`no` over defaults with `mergeObject` — V14.365
 *    `client/applications/api/dialog.mjs:346-354`, V13.351 `:315-323` — and
 *    `mergeObject` iterates `Object.keys(other)`, which is `[]` for a function. So a
 *    bare `yes: () => 'x'` contributes NOTHING: not its label and not its callback.
 *
 * The mapping deliberately does NOT reuse `normalizeDialogOptions`. That normalizer
 * injects `buttons: [{ action: 'close', … }]` when `buttons` is absent, and
 * `DialogV2.confirm` then does `config.buttons ??= []; config.buttons.unshift(yes, no)` —
 * a THREE-button confirm on every site. The `does not invent buttons` case below is that
 * trap, held open.
 *
 * VERSION NOTE: the DEFAULT labels are the literals `"Yes"`/`"No"` on V13.351 and the
 * i18n keys `"COMMON.Yes"`/`"COMMON.No"` on V14.365, so nothing here asserts a default
 * label — only that a SUPPLIED one survives, which is version-independent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { confirmDialog as compatConfirmDialog } from '../src/ui/foundryCompat.js';
import { confirmDialog as bridgeConfirmDialog } from '../src/ui/svelte/util/foundryBridge.js';

// Both wrappers are the same seam for the same primitive; the manager app wires
// foundryCompat and the player app wires foundryBridge. Running one table over both is
// what stops them drifting apart again.
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
