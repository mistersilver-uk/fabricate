/** `ArmedDangerButton` mounted: its rung (issue 2257 D10), Foundry focus declaration and `Button` busy face. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/components/ArmedDangerButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-armed-danger-button-',
  compiledModules: ['src/ui/svelte/components/Button.svelte', componentPath],
  componentPath,
});

before(async () => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const button = () => document.body.querySelector('.fabricate-button');

describe('ArmedDangerButton writes the button rung and adds only the 38 class', () => {
  it('writes the bare family root and danger role by default', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete' });
    assert.equal(button().className, 'fabricate-button is-danger');
  });

  it('adds only is-size-38 at size 38', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete', size: '38' });
    assert.equal(button().className, 'fabricate-button is-danger is-size-38');
  });

  it('keeps the family 34 for any other size', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete', size: '34' });
    assert.equal(button().className, 'fabricate-button is-danger');
  });
});

describe('ArmedDangerButton declares itself focused to Foundry on every face', () => {
  const faces = { idle: {}, armed: { armed: true }, busy: { busy: true } };
  for (const [face, props] of Object.entries(faces)) {
    it(`carries data-keyboard-focus on the ${face} face`, async () => {
      await harness.mount({ token: 'delete:a', idleLabel: 'Delete', ...props });
      assert.equal(button().dataset.keyboardFocus, 'true');
    });
  }

  it('still disarms on Escape and stops it reaching Foundry while armed', async () => {
    const disarmed = [];
    await harness.mount({
      token: 'delete:a',
      armed: true,
      onDisarm: (token) => {
        disarmed.push(token);
      },
    });
    const event = new globalThis.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    let reached = false;
    document.body.addEventListener(
      'keydown',
      () => {
        reached = true;
      },
      { once: true }
    );
    button().dispatchEvent(event);
    assert.deepEqual(disarmed, ['delete:a']);
    assert.equal(event.defaultPrevented, true);
    assert.equal(reached, false);
  });

  for (const [face, props] of Object.entries({ idle: {}, busy: { armed: true, busy: true } })) {
    it(`leaves Escape alone on the ${face} face`, async () => {
      const disarmed = [];
      await harness.mount({
        token: 'delete:a',
        ...props,
        onDisarm: (token) => {
          disarmed.push(token);
        },
      });
      const event = new globalThis.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      let reached = false;
      document.body.addEventListener(
        'keydown',
        () => {
          reached = true;
        },
        { once: true }
      );
      button().dispatchEvent(event);
      assert.deepEqual(disarmed, []);
      assert.equal(event.defaultPrevented, false);
      assert.equal(reached, true);
    });
  }
});

describe('ArmedDangerButton draws its busy face through Button', () => {
  it('renders a real button of type button', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete' });
    assert.equal(button().tagName, 'BUTTON');
    assert.equal(button().getAttribute('type'), 'button');
  });

  it('keeps the busy face enabled, aria-busy and aria-disabled, and never armed', async () => {
    await harness.mount({ token: 'delete:a', armed: true, busy: true, busyLabel: 'Deleting…' });
    assert.equal(button().disabled, false);
    assert.equal(button().getAttribute('aria-busy'), 'true');
    assert.equal(button().getAttribute('aria-disabled'), 'true');
    assert.equal(button().classList.contains('is-armed'), false);
  });

  it('names the busy face by its visible label and keeps its description resolving', async () => {
    const note = document.createElement('p');
    note.id = 'armed-danger-note';
    document.body.appendChild(note);
    try {
      await harness.mount({
        token: 'delete:a',
        busy: true,
        busyLabel: 'Deleting…',
        ariaDescribedBy: note.id,
      });
      assert.equal(button().textContent.trim(), 'Deleting…');
      assert.equal(button().getAttribute('aria-label'), 'Deleting…');
      assert.equal(button().getAttribute('aria-busy'), 'true');
      assert.equal(button().getAttribute('aria-disabled'), 'true');
      assert.equal(button().disabled, false);
      const described = document.querySelector(`#${button().getAttribute('aria-describedby')}`);
      assert.ok(described === note, "aria-describedby resolves to the caller's element");
    } finally {
      note.remove();
    }
  });

  for (const armed of [false, true]) {
    it(`confirms and arms nothing on a press while busy${armed ? ' and armed' : ''}`, async () => {
      const calls = [];
      await harness.mount({
        token: 'delete:a',
        armed,
        busy: true,
        onArm: (token) => {
          calls.push(['arm', token]);
        },
        onConfirm: (token) => {
          calls.push(['confirm', token]);
        },
      });
      button().click();
      assert.deepEqual(calls, []);
    });
  }

  it('keeps its own disabled native', async () => {
    await harness.mount({ token: 'delete:a', idleLabel: 'Delete', disabled: true });
    assert.equal(button().disabled, true);
    assert.equal(button().hasAttribute('aria-disabled'), false);
  });
});
