/** `SearchField`'s naming routes and its input-handler merge, mounted (issue 1782). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const FIELD = 'src/ui/svelte/components/SearchField.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-search-field-',
  compiledModules: ['src/ui/svelte/components/Field.svelte', FIELD],
  componentPath: FIELD,
});

/** Types `text` into the mounted input the way a keystroke does. */
function type(input, text) {
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** Every `console.warn` raised while `run` mounts, as text. */
async function warningsDuring(run) {
  const original = console.warn;
  const seen = [];
  console.warn = (...args) => {
    seen.push(args.join(' '));
  };
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return seen.filter((message) => message.includes('SearchField'));
}

describe('SearchField', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('with `label`, is ONE label: a Field root, a caption, and the shell inside it', async () => {
    const root = await harness.mount({ label: 'Search recipes', class: 'site-hook', 'data-x': '' });
    const input = root.querySelector('input[type="search"]');
    const host = root.firstElementChild;

    assert.equal(host.tagName, 'LABEL');
    assert.ok(host.classList.contains('fabricate-field'), 'the root is the shared `Field`');
    assert.ok(
      host.classList.contains('site-hook') && host.hasAttribute('data-x'),
      'class and rest land on the root'
    );
    assert.ok(
      Boolean(host.querySelector(':scope > span.fabricate-search')),
      'the shell is an inner span'
    );
    assert.equal(
      root.querySelectorAll(':scope label label').length,
      0,
      'no label is nested in another'
    );
    assert.equal(input.labels.length, 1, 'the input has exactly one label');
    assert.equal(
      input.labels[0].textContent.trim(),
      'Search recipes',
      'and its name is the label text'
    );
    assert.ok(
      !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby'),
      'and no second name'
    );
  });

  it('with `ariaLabel`, keeps the root a `<label class="fabricate-search">`', async () => {
    const root = await harness.mount({ ariaLabel: 'Search tools', class: 'site-hook' });
    const host = root.firstElementChild;
    const input = root.querySelector('input');

    assert.equal(host.tagName, 'LABEL');
    assert.equal(
      host.className.replaceAll(/ ?svelte-[a-z0-9]+/g, ''),
      'fabricate-search site-hook'
    );
    assert.equal(input.getAttribute('aria-label'), 'Search tools');
    assert.ok(!input.hasAttribute('aria-labelledby'));
    assert.equal(
      host.textContent.trim(),
      '',
      'the label wraps no text, so the aria-label is the name'
    );
  });

  it('with `ariaLabelledBy`, names the input by the caller’s caption', async () => {
    const root = await harness.mount({ ariaLabelledBy: 'caption-id' });
    const input = root.querySelector('input');
    assert.equal(input.getAttribute('aria-labelledby'), 'caption-id');
    assert.ok(!input.hasAttribute('aria-label'));
  });

  it('warns when it is given no naming route, or more than one', async () => {
    assert.deepEqual(await warningsDuring(() => harness.mount({ ariaLabel: 'Search' })), []);
    harness.remount();
    assert.equal((await warningsDuring(() => harness.mount({}))).length, 1, 'no route');
    harness.remount();
    const both = await warningsDuring(() =>
      harness.mount({ label: 'Search', ariaLabel: 'Search' })
    );
    assert.equal(both.length, 1, 'two routes');
  });

  it('runs a caller’s `oninput` AFTER its own `onChange`, rather than in place of it', async () => {
    const calls = [];
    const root = await harness.mount({
      ariaLabel: 'Search',
      onChange: (next) => {
        calls.push(`onChange:${next}`);
      },
      inputProps: {
        oninput: (event) => {
          calls.push(`oninput:${event.currentTarget.value}`);
        },
        'data-hook': '',
      },
    });
    const input = root.querySelector('input');
    type(input, 'iron');
    assert.deepEqual(calls, ['onChange:iron', 'oninput:iron']);
    assert.ok(input.hasAttribute('data-hook'), 'the other input props still reach the input');
  });

  it('keeps its own `type` and `value` over the input props', async () => {
    const root = await harness.mount({
      ariaLabel: 'Search',
      value: 'ore',
      inputProps: { type: 'text', value: 'other' },
    });
    const input = root.querySelector('input');
    assert.equal(input.getAttribute('type'), 'search');
    assert.equal(input.value, 'ore');
  });

  it('puts `is-compact` on the shell in both forms', async () => {
    let root = await harness.mount({ ariaLabel: 'Search', density: 'compact' });
    assert.ok(root.querySelector('label.fabricate-search.is-compact'));
    harness.remount();
    root = await harness.mount({ label: 'Search', density: 'compact' });
    assert.ok(
      root.querySelector(':scope label.fabricate-field > span.fabricate-search.is-compact')
    );
  });
});
