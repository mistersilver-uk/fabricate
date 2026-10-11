/** Issue 651 — the player's progressive stage list (mounted), drawn by `SortableList` (issue 2381). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { recipe, craftability } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-progressive-body-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
});

const STAGES = [
  {
    id: 's1',
    componentId: 'c1',
    name: 'Rough Blade',
    img: 'icons/rough.webp',
    difficulty: 2,
    threshold: 2,
  },
  {
    id: 's2',
    componentId: 'c2',
    name: 'Fine Blade',
    img: 'icons/fine.webp',
    difficulty: 3,
    threshold: 5,
  },
  { id: 's3', componentId: 'c3', name: 'Master Blade', img: null, difficulty: 4, threshold: 9 },
];

function progressiveRecipe(overrides = {}) {
  return recipe({ modeToken: 'progressive', ...overrides });
}

function mountBody({
  stages = STAGES,
  canReorder = true,
  onReorderStage = () => {},
  onReorderStageSettled = () => {},
  stageAnnouncement = '',
  recipeOverrides = {},
} = {}) {
  return harness.mount({
    recipe: progressiveRecipe(recipeOverrides),
    craftability: craftability(),
    progressiveStages: stages,
    canReorderStages: canReorder,
    stageAnnouncement,
    onReorderStage,
    onReorderStageSettled,
  });
}

const LIST = '[data-recipe-section="progressive-stages"]';
const rows = (target) => [...target.querySelectorAll('[data-progressive-stage]')];
const inRows = (target, selector) => [
  ...target.querySelectorAll(`[data-progressive-stage] ${selector}`),
];
const rocker = (target, direction) => inRows(target, `[data-sortable-move="${direction}"]`);
const grips = (target) => inRows(target, '[data-sortable-grip]');
const regionAfterList = (target) =>
  [target.querySelector(LIST)?.nextElementSibling].find((node) =>
    node?.matches('[data-sortable-list-status]')
  ) ?? null;
const fire = (node, type) =>
  node.dispatchEvent(new globalThis.window.Event(type, { bubbles: true, cancelable: true }));
const keydown = (node, key) =>
  node.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );

/** The shared sentence, as the harness's `format` stub echoes it: the key and its data. */
const MOVED_MASTER_TO_2 =
  'FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement:' +
  '{"name":"Master Blade","position":"2","total":"3"}';

/** A callback that records each call's arguments, and the list it records them in. */
function recorder() {
  const calls = [];
  return [
    calls,
    (...args) => {
      calls.push(args);
    },
  ];
}

/** The store's round trip: the move's result arrives as the next `progressiveStages`. */
const moved = (stages, index, target) => {
  const next = [...stages];
  const [stage] = next.splice(index, 1);
  next.splice(target, 0, stage);
  return next;
};

describe('ProgressiveBody — the player stage list (issue 651)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  // ── F1 ───────────────────────────────────────────────────────────────────

  it('F1: renders the stage list through the shared SortableList', async () => {
    const target = await mountBody();
    assert.ok(target.querySelector(`${LIST}.fabricate-sortable-list`), 'the list is the primitive');
    assert.equal(rows(target).length, 3, 'every authored stage, not the zero-budget award');
  });

  it('F1: renders the stages in the order it is given', async () => {
    const target = await mountBody({ stages: [STAGES[2], STAGES[0], STAGES[1]] });
    assert.deepEqual(
      rows(target).map((row) => row.getAttribute('data-progressive-stage')),
      ['s3', 's1', 's2'],
      'the store owns the order; the list renders it verbatim'
    );
  });

  it('F1: a stage list REPLACES the generic IO output table', async () => {
    const target = await mountBody();
    assert.ok(target.querySelector('[data-progressive-stage]'));
    assert.ok(
      !target.querySelector('[data-io-table-result]'),
      'a progressive output is an ordered list, not a flat set'
    );
  });

  it('a recipe with no stages still falls back to the IO table', async () => {
    const target = await mountBody({ stages: [] });
    assert.ok(!target.querySelector(LIST));
  });

  // ── Row content: ordinal, art, difficulty, cumulative threshold ──────────

  it('rows carry ordinals in rendered position order', async () => {
    const target = await mountBody({ stages: [STAGES[2], STAGES[0], STAGES[1]] });
    assert.deepEqual(
      inRows(target, '[data-sortable-ordinal]').map((n) => n.textContent.trim()),
      ['1', '2', '3'],
      'the ordinal is the POSITION, not the stage identity'
    );
  });

  it('rows draw their art as a 22px Medallion, and the glyph when a stage has none', async () => {
    const target = await mountBody();
    const tiles = rows(target).map((row) => row.querySelector('.fab-medallion'));
    assert.deepEqual(
      tiles.map((tile) => tile.getAttribute('data-medallion')),
      ['image', 'image', 'glyph']
    );
    assert.match(tiles[0].getAttribute('style'), /width:\s*22px;\s*height:\s*22px/u);
  });

  it('rows carry the read-only difficulty and the CUMULATIVE threshold', async () => {
    const target = await mountBody();
    assert.deepEqual(
      [...target.querySelectorAll('[data-progressive-stage-difficulty]')].map((n) =>
        n.getAttribute('data-progressive-stage-difficulty')
      ),
      ['2', '3', '4']
    );
    assert.deepEqual(
      [...target.querySelectorAll('[data-progressive-stage-threshold]')].map((n) =>
        n.getAttribute('data-progressive-stage-threshold')
      ),
      ['2', '5', '9'],
      'the cumulative "reached at >=N" is the decision input, not the per-stage cost'
    );
  });

  it('the inline name carries its full text as a title, since a long one ellipses', async () => {
    const target = await mountBody();
    assert.deepEqual(
      inRows(target, '.progressive-stage-name').map((name) => name.getAttribute('title')),
      STAGES.map((stage) => stage.name)
    );
  });

  it('a null threshold is OMITTED rather than rendered as zero', async () => {
    // An award-loop-skipped stage is reached at NO budget, so any number would be a lie.
    const target = await mountBody({
      stages: [{ id: 's1', name: 'Broken', img: null, difficulty: null, threshold: null }],
    });
    assert.ok(!target.querySelector('[data-progressive-stage-threshold]'));
    assert.ok(!target.querySelector('[data-progressive-stage-difficulty]'));
    assert.equal(rows(target).length, 1, 'the row itself still renders');
  });

  // ── Reorder affordances + a11y triad ─────────────────────────────────────

  it('reorderable rows expose the rocker, disabled at the ends', async () => {
    const target = await mountBody();
    const ups = rocker(target, 'up');
    const downs = rocker(target, 'down');
    assert.equal(ups.length, 3);
    assert.equal(ups[0].disabled, true, 'the first row cannot move up');
    assert.equal(ups[1].disabled, false);
    assert.equal(downs[2].disabled, true, 'the last row cannot move down');
  });

  it('a rocker click reports the move, announces the shared sentence and keeps focus', async () => {
    const [moves, onReorderStage] = recorder();
    const target = await mountBody({ onReorderStage });
    const up = rocker(target, 'up')[2];
    up.click();
    flushSync();
    assert.deepEqual(moves, [[2, 1]], 'the index and the target, and nothing else');

    await harness.setProps({ progressiveStages: moved(STAGES, 2, 1) });
    assert.equal(
      regionAfterList(target).textContent.trim(),
      MOVED_MASTER_TO_2,
      'the shared sentence names the stage that MOVED, read before the move'
    );
    assert.equal(globalThis.document.activeElement, up, 'focus stays on the pressed chevron');
  });

  it('a grip arrow key moves the stage, keeps focus on the grip and announces', async () => {
    const [moves, onReorderStage] = recorder();
    const target = await mountBody({ onReorderStage });
    keydown(grips(target)[2], 'ArrowUp');
    flushSync();
    assert.deepEqual(moves, [[2, 1]]);

    await harness.setProps({ progressiveStages: moved(STAGES, 2, 1) });
    assert.equal(
      globalThis.document.activeElement?.getAttribute('data-sortable-grip'),
      's3',
      'the moved stage’s grip keeps focus'
    );
    assert.equal(regionAfterList(target).textContent.trim(), MOVED_MASTER_TO_2);
  });

  it('speaks a caller sentence through the one region that follows the list', async () => {
    const target = await mountBody({ stageAnnouncement: '' });
    const status = regionAfterList(target);
    assert.ok(status, 'the region follows the list');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.ok(status.classList.contains('visually-hidden'), 'and is visually hidden');

    await harness.setProps({ stageAnnouncement: 'Could not save your order.' });
    assert.equal(regionAfterList(target).textContent.trim(), 'Could not save your order.');
    assert.equal(target.querySelectorAll('[data-sortable-list-status]').length, 1);
  });

  it('a recipe switch remounts the list, so a pending sentence is never re-spoken', async () => {
    const target = await mountBody({ stageAnnouncement: '' });
    await harness.setProps({ stageAnnouncement: 'Could not save your order.' });
    assert.equal(regionAfterList(target).textContent.trim(), 'Could not save your order.');

    await harness.setProps({ recipe: progressiveRecipe({ id: 'another-recipe' }) });
    assert.equal(regionAfterList(target).textContent.trim(), '', 'the next recipe starts silent');
  });

  it('the rocker names carry the stage', async () => {
    const target = await mountBody();
    const name = (direction) => rocker(target, direction)[1].getAttribute('aria-label');
    assert.equal(name('up'), 'FABRICATE.Common.SortableList.MoveUp:{"name":"Fine Blade"}');
    assert.equal(name('down'), 'FABRICATE.Common.SortableList.MoveDown:{"name":"Fine Blade"}');
  });

  // ── D13: the fixed state ─────────────────────────────────────────────────

  it('D13: fixed rows keep the ordinal and difficulty', async () => {
    const target = await mountBody({ canReorder: false });
    assert.equal(rows(target).length, 3, 'the order is still information');
    assert.deepEqual(
      inRows(target, '[data-sortable-ordinal]').map((n) => n.textContent.trim()),
      ['1', '2', '3']
    );
    assert.equal(target.querySelectorAll('[data-progressive-stage-difficulty]').length, 3);
  });

  it('D13: fixed rows drop the grip and the rocker and reorder nothing', async () => {
    const [moves, onReorderStage] = recorder();
    const target = await mountBody({ canReorder: false, onReorderStage });
    assert.equal(grips(target).length, 0, 'the grip IS the affordance signal');
    assert.equal(inRows(target, '[data-sortable-move]').length, 0, 'and there is no rocker');
    assert.equal(target.querySelectorAll('[data-progressive-stage-fixed]').length, 3);
    assert.ok(!target.querySelector('[data-progressive-stage-reorderable]'));

    for (const type of ['dragstart', 'dragover', 'drop']) {
      fire(rows(target)[0], type);
      fire(rows(target)[2], type);
    }
    flushSync();
    assert.deepEqual(moves, [], 'a full drag lifecycle reorders nothing');
  });

  it('D13: fixed rows explain themselves, and the one region stays mounted and empty', async () => {
    const target = await mountBody({ canReorder: false });
    const note = target.querySelector('[data-progressive-stage-fixed-note]');
    assert.ok(note, 'one muted line says why there is nothing to grab');
    assert.match(note.textContent, /Order set by your GM\./);
    assert.equal(target.querySelectorAll('[data-sortable-list-status]').length, 1);
    assert.equal(regionAfterList(target).textContent.trim(), '', 'nothing is announced');
    assert.ok(!target.querySelector('[data-progressive-stage-status]'), 'and no second region');
  });

  it('a drop commits the pending order write immediately (no debounce wait)', async () => {
    // A drag has already settled by the time it drops, so there is nothing to coalesce.
    const [settled, onReorderStageSettled] = recorder();
    const target = await mountBody({ onReorderStageSettled });
    fire(grips(target)[0], 'dragstart');
    fire(rows(target)[2], 'drop');
    flushSync();
    assert.equal(settled.length, 1, 'the drop settles the write');
  });

  it('a rocker or grip-key move does not settle — it is the burst the debounce exists for', async () => {
    const [settled, onReorderStageSettled] = recorder();
    const target = await mountBody({ onReorderStageSettled });
    rocker(target, 'up')[2].click();
    keydown(grips(target)[1], 'ArrowDown');
    flushSync();
    assert.deepEqual(settled, [], 'only the drop settles');
  });

  it('D13: reorderable rows DO reorder by a drag from the grip (the converse)', async () => {
    const [moves, onReorderStage] = recorder();
    const target = await mountBody({ onReorderStage });
    assert.ok(target.querySelector('[data-progressive-stage-reorderable]'));
    assert.ok(!target.querySelector('[data-progressive-stage-fixed-note]'));

    fire(grips(target)[0], 'dragstart');
    fire(rows(target)[2], 'drop');
    flushSync();
    assert.deepEqual(moves, [[0, 2]], 'a drag from row 1 onto row 3 reorders');
  });

  // ── Issue 675: the salvage extensions are OPT-IN ─────────────────────────

  it('675: the crafting row carries no state chip and every number', async () => {
    const target = await mountBody();
    assert.ok(!target.querySelector('[data-progressive-stage-state]'), 'no state chip');
    const first = rows(target)[0];
    assert.ok(first.querySelector('[data-sortable-ordinal]'));
    assert.ok(first.querySelector('[data-progressive-stage-difficulty]'));
    assert.ok(first.querySelector('[data-progressive-stage-threshold]'));
    assert.ok(first.querySelector('[data-sortable-move]'));
  });

  it('675: a stage carrying a quantity renders NONE — progressive is quantity-less', async () => {
    const target = await mountBody({
      stages: [{ ...STAGES[0], quantity: 3 }, STAGES[1], STAGES[2]],
    });
    assert.ok(!target.querySelector('[data-progressive-stage-quantity]'));
    assert.equal(rows(target)[0].textContent.includes('×'), false, 'no ×N by any other route');
  });

  it('the grip leads, then the ordinal and the content, and the rocker trails', async () => {
    const target = await mountBody();
    const line = rows(target)[0].querySelector('.fabricate-sortable-list-line');
    const parts = [...line.children].map(
      (child) =>
        ['data-sortable-grip', 'data-sortable-ordinal'].find((name) => child.hasAttribute(name)) ??
        [...child.classList].find((name) => /content|rocker/u.test(name))
    );
    assert.deepEqual(parts, [
      'data-sortable-grip',
      'data-sortable-ordinal',
      'fabricate-sortable-list-content',
      'fabricate-sortable-list-rocker',
    ]);
  });

  // ── 1286: the crafting body opts into the complication band, FORECAST-only ───────

  it('1286: mounts the forecast band only on the stage that carries complications', async () => {
    const stages = [
      { ...STAGES[0] },
      {
        ...STAGES[1],
        complications: [
          {
            id: 'x-scald',
            name: 'Scalding steam',
            description: 'The quench bath flashes to steam.',
            severity: 'major',
            visibility: 'visible',
            // Deliberately TRUE on the row. Crafting must render it as a forecast anyway:
            fired: true,
          },
        ],
      },
      { ...STAGES[2] },
    ];
    const target = await mountBody({ stages });
    const band = target.querySelector(
      '[data-progressive-stage="s2"] [data-progressive-stage-complications]'
    );
    assert.ok(band, 'the crafting body mounts the band');
    assert.equal(band.getAttribute('data-progressive-stage-complication-tense'), 'forecast');
    assert.match(band.textContent, /This can go wrong/);
    const [plain, banded] = rows(target);
    assert.ok(banded.classList.contains('has-band'));
    assert.ok(!plain.classList.contains('has-band'), 'a stage carrying nothing is the plain row');
    assert.equal(
      plain.querySelector('.fabricate-sortable-list-body').children.length,
      0,
      'and its body is empty'
    );
  });

  it('the stylesheet hides the empty body of a stage row without a band', () => {
    assert.match(
      readStylesheet(),
      /\.fabricate-sortable-list-row\.progressive-stage-row:not\(\.has-band\)\s+\.fabricate-sortable-list-body[^{]*\{[^}]*display:\s*none/u
    );
  });
});
