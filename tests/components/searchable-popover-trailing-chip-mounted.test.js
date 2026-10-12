/**
 * `SearchablePopover`'s per-option `trailingChip` (issue 2430): the trailing chip takes its tone
 * and mono face from the option, in `Chip`'s own names, and an option without one keeps the
 * `disabled` tone every earlier caller draws. The chip never shrinks or wraps inside its row.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-picker-trailing-chip-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: SEARCHABLE_POPOVER_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SearchablePopover.svelte',
});

const OPTIONS = [
  {
    id: 'herb',
    label: 'herb',
    trailing: '24 components',
    trailingChip: { tone: 'secondary', mono: true },
  },
  {
    id: 'typo',
    label: 'typo',
    trailing: '0 components',
    trailingChip: { tone: 'warning', mono: true },
  },
  { id: 'plain', label: 'plain', trailing: 'Disabled' },
];

/** The trailing chip's authored classes, without the compiler's scoping hash. */
function chipClasses(row) {
  const chip = row.querySelector('.manager-chip');
  assert.ok(Boolean(chip), 'the row draws a trailing chip');
  return [...chip.classList].filter((name) => !name.startsWith('svelte-'));
}

async function openRows() {
  await harness.mount({ options: OPTIONS, triggerLabel: 'Tag', onSelect: () => {} });
  harness.target.querySelector('button').click();
  flushSync();
  const panel = harness.target.querySelector('.fabricate-picker-popover');
  return Object.fromEntries(
    [...panel.querySelectorAll('[role="option"]')].map((row) => [row.title, row])
  );
}

describe('2430 SearchablePopover — the per-option trailing chip', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('draws an option`s `trailingChip` tone and mono face', async () => {
    const rows = await openRows();
    const herb = chipClasses(rows.herb);
    assert.ok(herb.includes('is-secondary'), `secondary tone, saw ${herb.join(' ')}`);
    assert.ok(herb.includes('is-mono'), 'and the mono face');
    assert.ok(!herb.includes('is-disabled'), 'and not the default disabled tone');
    const typo = chipClasses(rows.typo);
    assert.ok(typo.includes('is-warning') && typo.includes('is-mono'), typo.join(' '));
    harness.remount();
  });

  it('keeps the `disabled` tone, with no mono face, for an option without one', async () => {
    const rows = await openRows();
    const plain = chipClasses(rows.plain);
    assert.ok(plain.includes('is-disabled'), `disabled tone, saw ${plain.join(' ')}`);
    assert.ok(!plain.includes('is-mono'), 'and no mono face');
    harness.remount();
  });

  it('keeps the trailing chip at its own width on one line', () => {
    const { css } = scopedComponentCss(
      resolve(repoRoot, 'src/ui/svelte/components/SearchablePopoverPanel.svelte')
    );
    const flat = css.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\s+/gu, ' ');
    const rule = [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].find(([, selector]) =>
      selector.includes('.manager-travel-option-trailing')
    );
    assert.ok(Boolean(rule), 'a rule addresses the trailing chip');
    assert.match(rule[2], /flex: 0 0 auto/u, 'it never shrinks');
    assert.match(rule[2], /white-space: nowrap/u, 'and never wraps');
  });
});
