/**
 * The published `Button`'s and `IconButton`'s `description` (issue 2895) on Fabricate's real Svelte
 * runtime, under a Fabricate window root: the hidden element it draws inside the control and names
 * through `aria-describedby`, an id unique to each mount, a blank or non-string value that writes
 * none, `Button`'s composition with the caller's `aria-describedby`, the restore after Foundry's
 * tooltip closes, and the disabled and busy forms.
 * Limit: happy-dom computes no accessible name or description, so
 * `tests/components/button-description-rendered.test.js` reads them in Chromium.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { keyboardFocus, withTooltip } from '../helpers/keyboardTooltipProbe.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const LABEL = 'Back 1 day';
const DESCRIPTION = 'Moves the date back 1 day; credits stay';
const HINT_ID = 'acme-date-hint';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-button-description-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let escaped;
let targets;
let stopRecording;

const ui = () => shippedSeam({ ...seamParts, report() {} });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  delete globalThis.game.tooltip;
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

const BASES = Object.freeze({
  Button: { children: LABEL, onclick() {} },
  IconButton: { icon: 'fas fa-backward', ariaLabel: LABEL, onclick() {} },
});

/** `name` mounted with `props` over its base, and readers of its control and description. */
function mountControl(name, props = {}) {
  const target = fabricateTarget(targets);
  const handle = ui().mount(name, { target, props: { ...BASES[name], ...props } });
  const control = () => target.querySelector('button');
  const update = (next = {}) => handle.update({ ...BASES[name], ...next });
  const described = () => {
    const ids = control().getAttribute('aria-describedby')?.split(' ') ?? [];
    return ids.map((id) => target.ownerDocument.querySelector(`[id="${id}"]`));
  };
  return { target, handle, update, control, described };
}

for (const name of ['Button', 'IconButton']) {
  describe(`the published ${name}, description`, () => {
    it('draws a hidden element inside the control and names it through aria-describedby', async () => {
      const { handle, control, described } = mountControl(name, { description: DESCRIPTION });
      await settle();
      const [own, ...others] = described();
      assert.equal(others.length, 0, 'one id');
      assert.ok(Boolean(own) && control().contains(own), 'inside the control');
      assert.equal(own.textContent, DESCRIPTION);
      assert.ok(own.hidden, 'hidden, so the name never takes its words');
      assert.equal(own.style.display, 'none', 'restated inline over a host reset');
      handle.destroy();
    });

    it('takes an id of its own in each mount', async () => {
      const first = mountControl(name, { description: DESCRIPTION });
      const second = mountControl(name, { description: DESCRIPTION });
      await settle();
      const ids = [first, second].map(({ control }) => control().getAttribute('aria-describedby'));
      assert.notEqual(ids[0], ids[1]);
      first.handle.destroy();
      second.handle.destroy();
    });

    for (const value of ['', ' '.repeat(3), 7, true, null, ['Moves']]) {
      it(`draws nothing for ${JSON.stringify(value)}`, async () => {
        const { handle, control } = mountControl(name, { description: value });
        await settle();
        assert.ok(!control().hasAttribute('aria-describedby'), 'no aria-describedby');
        assert.ok(!control().querySelector('[hidden]'), 'no element');
        handle.destroy();
      });
    }

    it('changes in place on update, and goes with an update that omits it', async () => {
      const { handle, update, control, described } = mountControl(name, {
        description: DESCRIPTION,
      });
      await settle();
      const id = control().getAttribute('aria-describedby');
      assert.equal(update({ description: 'Moves the date back 2 days' }), true);
      await settle();
      assert.equal(control().getAttribute('aria-describedby'), id, 'the same id');
      assert.equal(described()[0].textContent, 'Moves the date back 2 days');
      assert.equal(update(), true);
      await settle();
      assert.ok(!control().hasAttribute('aria-describedby'));
      assert.ok(!control().querySelector('[hidden]'));
      handle.destroy();
    });

    it('is restored once the keyboard tooltip closes, which removed it', async () => {
      const tooltip = withTooltip();
      const tip = name === 'Button' ? { tooltip: 'Rewinds the clock' } : {};
      const { handle, control } = mountControl(name, { ...tip, description: DESCRIPTION });
      await settle();
      const node = control();
      const own = node.getAttribute('aria-describedby');
      keyboardFocus(node);
      await settle();
      assert.equal(node.getAttribute('aria-describedby'), 'tooltip', 'Foundry’s, while open');
      node.blur();
      await settle();
      assert.ok(!tooltip.element, 'closed');
      assert.equal(node.getAttribute('aria-describedby'), own);
      handle.destroy();
    });

    it('is restored once a tooltip Foundry opened and closed itself has gone', async () => {
      const tooltip = withTooltip();
      const { handle, control } = mountControl(name, { description: DESCRIPTION });
      await settle();
      const node = control();
      const own = node.getAttribute('aria-describedby');
      tooltip.activate(node, { text: LABEL });
      await settle();
      assert.equal(node.getAttribute('aria-describedby'), 'tooltip');
      tooltip.deactivate();
      await settle();
      assert.equal(node.getAttribute('aria-describedby'), own);
      handle.destroy();
    });

    it('keeps its description on a disabled control', async () => {
      const { handle, control, described } = mountControl(name, {
        description: DESCRIPTION,
        disabled: true,
      });
      await settle();
      assert.ok(control().disabled);
      assert.equal(described()[0].textContent, DESCRIPTION);
      handle.destroy();
    });
  });
}

describe('the published Button, description beside aria-describedby and busy', () => {
  it('keeps the caller’s ids first, then its own', async () => {
    const { handle, control, described } = mountControl('Button', {
      description: DESCRIPTION,
      'aria-describedby': HINT_ID,
    });
    await settle();
    const [first, second] = control().getAttribute('aria-describedby').split(' ');
    assert.equal(first, HINT_ID);
    assert.equal(described()[1].textContent, DESCRIPTION);
    assert.ok(second !== HINT_ID);
    handle.destroy();
  });

  it('restores both once the tooltip closes', async () => {
    const tooltip = withTooltip();
    const { handle, control } = mountControl('Button', {
      description: DESCRIPTION,
      tooltip: 'Rewinds the clock',
      'aria-describedby': HINT_ID,
    });
    await settle();
    const node = control();
    const composed = node.getAttribute('aria-describedby');
    keyboardFocus(node);
    node.click();
    await settle();
    assert.ok(!tooltip.element, 'a press closed it');
    assert.equal(node.getAttribute('aria-describedby'), composed);
    handle.destroy();
  });

  it('keeps its description on a busy button', async () => {
    const { handle, control, described } = mountControl('Button', {
      description: DESCRIPTION,
      busy: true,
    });
    await settle();
    assert.equal(control().getAttribute('aria-busy'), 'true');
    assert.equal(described()[0].textContent, DESCRIPTION);
    handle.destroy();
  });

  it('is published as a data key on both entries', () => {
    for (const name of ['Button', 'IconButton']) {
      assert.deepEqual(
        ui().describe(name).props.description,
        { kind: 'data', required: false },
        name
      );
    }
  });
});
