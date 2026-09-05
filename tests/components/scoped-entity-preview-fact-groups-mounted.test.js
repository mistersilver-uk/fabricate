/**
 * THE FACT GROUP IS A DOM UNIT (issue 1371).
 *
 * `ScopedEntityPreview` draws each kickered fact group as a kicker `<p>` followed by a sibling
 * `<ul>` of rows, and it put the group's own `hookAttribute` on the `<ul>`. So the hook named the
 * ROWS, not the group: no selector reached the kicker, and a parity lane measuring the reference's
 * `USED BY` / `PRODUCED BY` rails had to report both kicker regions as unmeasurable rather than as
 * matching or drifting (`handoff-r5b.md` §4, "still unresolvable").
 *
 * The fix is the smallest one that makes the claim true: kicker and rows are wrapped in one
 * element and the hook moves onto the wrapper, so `[hook]` means the group and `[hook] .manager-
 * kicker` reaches its label.
 *
 * ── WHY THE WRAPPER IS `display: contents`, AND WHY THAT IS AN INLINE STYLE ────────────────────
 * The rail is a column flexbox with a `--fab-space-3` gap, so a wrapper that generated a box would
 * make each group ONE flex item and collapse the gap between a kicker and its own rows to zero.
 * `display: contents` makes the wrapper generate no box at all: both children stay direct
 * participants in the rail's flex layout and every rendered pixel is unchanged. It is written
 * INLINE rather than in a scoped `<style>` because this component's class stem is a prop — its own
 * docblock records that a scoped selector over a dynamic class cannot be proven used, and
 * `lint:svelte:warnings` fails on the unused-selector warning that follows — and the shell's
 * stylesheet is closed to this lane.
 *
 * The consequence a consumer has to know about is asserted below: a selector written
 * `[hook] > li` no longer resolves, because the rows are now a grandchild of the hook.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const previewPath = 'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte';
const previewSource = readFileSync(resolve(repoRoot, previewPath), 'utf8');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-preview-fact-groups-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    previewPath,
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/Medallion.svelte',
  ],
  componentPath: previewPath,
});

const GROUPS = [
  {
    kicker: 'USED BY',
    hookAttribute: 'data-rail-used-by',
    emptyNote: 'No recipe requires it yet.',
    rows: [
      { id: 'r1', icon: 'fas fa-hammer', title: 'Iron Ingot', subtitle: 'Recipe' },
      { id: 'r2', icon: 'fas fa-hammer', title: 'Chainmail Shirt', subtitle: 'Recipe' },
    ],
  },
  {
    kicker: 'PRODUCED BY',
    hookAttribute: 'data-rail-produced-by',
    emptyNote: 'Nothing produces it yet.',
    rows: [],
  },
];

describe('ScopedEntityPreview fact groups (mounted)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('puts the group hook on a wrapper that holds the kicker AND the rows', async () => {
    const root = await harness.mount({ factGroups: GROUPS });
    const group = root.querySelector('[data-rail-used-by]');
    assert.ok(Boolean(group), 'the populated group renders under its own hook');

    const kicker = group.querySelector('.manager-kicker');
    assert.ok(Boolean(kicker), 'the KICKER is now reachable from the group hook — the whole point');
    assert.equal(kicker.textContent.trim(), 'USED BY');

    const rows = group.querySelectorAll('li');
    assert.equal(rows.length, 2, 'and the rows are inside the same group');
    assert.ok(
      Boolean(group.querySelector('.manager-scoped-preview-rules')),
      'the rows keep their own list class, so a caller can still reach the list alone'
    );
  });

  it('hooks an EMPTY group the same way, so both states answer one selector', async () => {
    // An absent group and an empty one say different things, and only the second is ever true
    // here. A hook that reached only the populated shape would make the empty sentence
    // unmeasurable in exactly the state a parity run needs to photograph.
    const root = await harness.mount({ factGroups: GROUPS });
    const group = root.querySelector('[data-rail-produced-by]');
    assert.ok(Boolean(group), 'the empty group renders under its own hook too');
    assert.equal(group.querySelector('.manager-kicker').textContent.trim(), 'PRODUCED BY');
    assert.equal(
      group.querySelector('.manager-scoped-preview-fact-empty').textContent.trim(),
      'Nothing produces it yet.'
    );
    assert.ok(!group.querySelector('li'), 'and it draws no row');
  });

  it('generates no box, so the rail’s own gap still separates kicker from rows', async () => {
    // The regression this guards is not visible in the DOM: a wrapper that generated a box would
    // turn each group into ONE flex item of the rail and collapse the `--fab-space-3` between a
    // kicker and its list to nothing. Nothing else in the repository would fail.
    const root = await harness.mount({ factGroups: GROUPS });
    const group = root.querySelector('[data-rail-used-by]');
    assert.match(
      group.getAttribute('style') || '',
      /display:\s*contents/,
      'the wrapper is display: contents, so it participates in no layout of its own'
    );
    // A REAL block, at column zero — the prose above the markup names `<style>` to explain why
    // there is none, and a substring scan would read the explanation as the thing it forbids.
    assert.ok(
      !/^<style>/m.test(previewSource),
      'and it stays an inline style: a scoped block here cannot prove a dynamic-stem selector used, which is the warning `lint:svelte:warnings` fails on, and it would restamp every element in this shell with a scope class'
    );
  });

  it('leaves the rail with no fact groups byte-identical', async () => {
    // Every shipped caller that passes no `factGroups` must render exactly what it rendered
    // before, which is the acceptance condition this whole revision is built under.
    const root = await harness.mount({ kicker: 'PLAYER PREVIEW', rules: [] });
    assert.equal(root.querySelectorAll('[style]').length, 0, 'no wrapper is emitted at all');
    assert.equal(
      root.querySelector('aside').className.replace(/\s*svelte-\w+/, ''),
      'manager-scoped-preview'
    );
  });

  it('states the consequence for a caller: the rows are a GRANDCHILD of the hook now', async () => {
    // Named rather than left to be discovered. Two parity locators in this epic were written
    // `[hook] > li` against the old shape, and a child combinator that stops matching reports
    // "nothing matched" — which reads as a missing region rather than as a moved hook.
    const root = await harness.mount({ factGroups: GROUPS });
    assert.equal(
      root.querySelectorAll('[data-rail-used-by] > li').length,
      0,
      'a direct-child selector no longer resolves'
    );
    assert.equal(
      root.querySelectorAll('[data-rail-used-by] li').length,
      2,
      'the descendant form is the one to write'
    );
  });
});
