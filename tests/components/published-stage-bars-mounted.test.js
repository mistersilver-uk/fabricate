/**
 * The published `StageBars` (issue 2455) on Fabricate's real Svelte runtime, through a fresh seam
 * registered with the adapter's own table, into a bare companion target: the group and its bars
 * named as its group states, an empty `stages`, and its caption drawn from its own stylesheet.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-stage-bars-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let targets;

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
});

after(() => harness.teardown());

beforeEach(() => {
  reports = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
});

/** `StageBars` mounted with `props` into a bare companion target. */
function mountStages(props) {
  const ui = shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });
  const target = companionTarget(targets);
  return { target, handle: ui.mount('StageBars', { target, props }) };
}

const groupOf = (target) => target.querySelector('[role="group"]');
const barNames = (target) =>
  [...target.querySelectorAll('[role="progressbar"]')].map((bar) => bar.getAttribute('aria-label'));

describe('the published StageBars under a bare ancestor', () => {
  it('draws a group named by ariaLabel, each bar named by its label, else its name', async () => {
    const { target, handle } = mountStages({
      stages: [
        { name: 'Gather', value: 100 },
        { name: 'Refine', label: 'Refine the ore', value: 40 },
        { value: 0 },
      ],
      currentIndex: 1,
      ariaLabel: 'Forging progress',
      'data-acme-stage': 'forge',
    });
    const group = groupOf(target);
    assert.ok(
      group?.parentElement === target,
      'the group is the root, in place when mount returns'
    );
    assert.equal(group.getAttribute('aria-label'), 'Forging progress');
    assert.equal(group.dataset.acmeStage, 'forge', 'a rest data attribute lands on the group');
    assert.deepEqual(
      barNames(target),
      ['Gather', 'Refine the ore', null],
      'a stage of several with neither label nor name has no name'
    );
    assert.deepEqual(
      [...group.querySelectorAll('[role="progressbar"]')].map((bar) => [
        bar.getAttribute('aria-valuenow'),
        bar.getAttribute('aria-current'),
      ]),
      [
        ['100', null],
        ['40', 'step'],
        ['0', null],
      ]
    );
    assert.deepEqual(
      [...group.querySelectorAll('.fab-stage-bars-caption')].map((caption) => [
        caption.textContent,
        caption.getAttribute('aria-hidden'),
      ]),
      [
        ['1 Gather', 'true'],
        ['2 Refine', 'true'],
        ['3 ', 'true'],
      ],
      'each caption is its position and its name, hidden from assistive technology'
    );
    assert.ok(!group.querySelector('button, a, input, [tabindex]'), 'it draws no control');
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });

  it("names a lone unnamed bar by the group's name, and draws no bar for an empty stages", async () => {
    const { target, handle } = mountStages({
      stages: [{ value: 30 }],
      ariaLabel: 'Forging progress',
    });
    const group = groupOf(target);
    assert.deepEqual(barNames(target), ['Forging progress']);
    assert.equal(handle.update({ stages: [], ariaLabel: 'Forging progress' }), true);
    await settle();
    assert.ok(groupOf(target) === group, 'the same group, so nothing remounted');
    assert.equal(group.children.length, 0, 'an empty named group');
    assert.equal(group.getAttribute('aria-label'), 'Forging progress');
    handle.update({
      stages: [
        { name: 'Gather', value: 10 },
        { name: 'Refine', value: 0 },
      ],
      ariaLabel: 'Forging progress',
    });
    await settle();
    assert.deepEqual(barNames(target), ['Gather', 'Refine']);
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });

  it('draws one caption line in its muted ink from :root[data-fabricate-theme]', async () => {
    await underSheet(
      ':root[data-fabricate-theme] { --fab-text-muted: rgb(7, 8, 9); }',
      async () => {
        const { target, handle } = mountStages({
          stages: [{ name: 'Gather', value: 50 }],
          ariaLabel: 'Forging progress',
        });
        await settle();
        const caption = getComputedStyle(target.querySelector('.fab-stage-bars-caption'));
        assert.equal(caption.color, 'rgb(7, 8, 9)');
        assert.equal(caption.whiteSpace, 'nowrap');
        handle.destroy();
      }
    );
  });
});
