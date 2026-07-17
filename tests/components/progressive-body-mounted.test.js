/**
 * Issue 651 — the player's progressive stage list (mounted).
 *
 * Carries two duties explicitly:
 *
 *  1. **The F1 fix.** A progressive recipe used to render an EMPTY output table, because
 *     browsing has no roll and the award loop therefore awarded nothing. The body must now
 *     show a populated, ordered stage list.
 *  2. **D13's fixed state.** With `canReorder` false the handlers must be NOT ATTACHED,
 *     not merely inert, and the grip glyph must be gone — identical rows minus working
 *     affordances is the worst outcome.
 *
 * These mount RecipeDetail (the dispatcher), NOT ProgressiveBody directly: the dispatcher
 * passes one identical prop set to all four bodies, so a prop it fails to forward silently
 * drops to its default and the list never renders.
 *
 * The ORDERING composition is deliberately not here — `craftingStore.svelte.js` is in
 * neither harness list, so this file can only prove presentation-given-props. The store
 * suite (`tests/stores/crafting-store.test.js`) carries that, plus D7/D7a.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

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
  { id: 's1', componentId: 'c1', name: 'Rough Blade', img: 'icons/rough.webp', difficulty: 2, threshold: 2 },
  { id: 's2', componentId: 'c2', name: 'Fine Blade', img: 'icons/fine.webp', difficulty: 3, threshold: 5 },
  { id: 's3', componentId: 'c3', name: 'Master Blade', img: null, difficulty: 4, threshold: 9 },
];

function progressiveRecipe(overrides = {}) {
  return recipe({ modeToken: 'progressive', ...overrides });
}

function mountBody({ stages = STAGES, canReorder = true, onReorderStage = () => {}, recipeOverrides = {} } = {}) {
  return harness.mount({
    recipe: progressiveRecipe(recipeOverrides),
    craftability: craftability(),
    progressiveStages: stages,
    canReorderStages: canReorder,
    stageAnnouncement: '',
    onReorderStage,
  });
}

const rows = (target) => [...target.querySelectorAll('[data-progressive-stage]')];

describe('ProgressiveBody — the player stage list (issue 651)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  // ── F1 ───────────────────────────────────────────────────────────────────

  it('F1: renders a POPULATED stage list where the output table was always empty', async () => {
    const target = await mountBody();
    assert.ok(target.querySelector('[data-recipe-section="progressive-stages"]'), 'the list renders');
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
    assert.equal(
      target.querySelector('[data-io-table-result]'),
      null,
      'a progressive output is an ordered list, not a flat set'
    );
  });

  it('a recipe with no stages still falls back to the IO table', async () => {
    const target = await mountBody({ stages: [] });
    assert.equal(target.querySelector('[data-recipe-section="progressive-stages"]'), null);
  });

  // ── Row content: ordinal, difficulty, cumulative threshold ───────────────

  it('rows carry ordinals in rendered position order', async () => {
    const target = await mountBody({ stages: [STAGES[2], STAGES[0], STAGES[1]] });
    assert.deepEqual(
      [...target.querySelectorAll('[data-progressive-stage-ordinal]')].map((n) => n.textContent.trim()),
      ['1', '2', '3'],
      'the ordinal is the POSITION, not the stage identity'
    );
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

  it('a null threshold is OMITTED rather than rendered as zero', async () => {
    // An award-loop-skipped stage is reached at NO budget, so any number would be a lie.
    const target = await mountBody({
      stages: [{ id: 's1', name: 'Broken', img: null, difficulty: null, threshold: null }],
    });
    assert.equal(target.querySelector('[data-progressive-stage-threshold]'), null);
    assert.equal(target.querySelector('[data-progressive-stage-difficulty]'), null);
    assert.equal(rows(target).length, 1, 'the row itself still renders');
  });

  // ── Reorder affordances + a11y triad ─────────────────────────────────────

  it('reorderable rows expose move buttons, disabled at the ends', async () => {
    const target = await mountBody();
    const ups = [...target.querySelectorAll('[data-progressive-stage-move-up]')];
    const downs = [...target.querySelectorAll('[data-progressive-stage-move-down]')];
    assert.equal(ups.length, 3);
    assert.equal(ups[0].disabled, true, 'the first row cannot move up');
    assert.equal(ups[1].disabled, false);
    assert.equal(downs[2].disabled, true, 'the last row cannot move down');
  });

  it('a keyboard move reports the index, target AND a pre-formatted announcement', async () => {
    const moves = [];
    const target = await mountBody({ onReorderStage: (...args) => moves.push(args) });
    [...target.querySelectorAll('[data-progressive-stage-move-up]')][2].click();
    flushSync();

    assert.equal(moves.length, 1);
    const [index, targetIndex, announcement] = moves[0];
    assert.equal(index, 2);
    assert.equal(targetIndex, 1);
    // The name is read BEFORE the move — after it, stages[2] is the row that swapped in.
    assert.match(announcement, /Master Blade/, 'names the stage that MOVED');
    assert.match(announcement, /2/, 'and its new position');
  });

  it('the live region is present, polite, and sr-only', async () => {
    const target = await harness.mount({
      recipe: progressiveRecipe(),
      craftability: craftability(),
      progressiveStages: STAGES,
      canReorderStages: true,
      stageAnnouncement: 'Fine Blade moved to position 1 of 3',
      onReorderStage: () => {},
    });
    const status = target.querySelector('[data-progressive-stage-status]');
    assert.ok(status, 'the region renders');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.ok(status.classList.contains('sr-only'), 'and is visually hidden');
    assert.equal(status.textContent.trim(), 'Fine Blade moved to position 1 of 3');
  });

  it('move buttons carry the stage name in their accessible label', async () => {
    const target = await mountBody();
    const up = [...target.querySelectorAll('[data-progressive-stage-move-up]')][1];
    assert.match(up.getAttribute('aria-label'), /Fine Blade/);
  });

  // ── D13: the fixed state ─────────────────────────────────────────────────

  it('D13: fixed rows keep the ordinal and difficulty', async () => {
    const target = await mountBody({ canReorder: false });
    assert.equal(rows(target).length, 3, 'the order is still information');
    assert.deepEqual(
      [...target.querySelectorAll('[data-progressive-stage-ordinal]')].map((n) => n.textContent.trim()),
      ['1', '2', '3']
    );
    assert.equal(target.querySelectorAll('[data-progressive-stage-difficulty]').length, 3);
  });

  it('D13: fixed rows attach NO drag handlers and are not draggable', async () => {
    // "Not attached, not merely inert": a row that still says draggable="true" invites a
    // grab that silently does nothing.
    //
    // Asserted structurally (the whole `{#if canReorder}` branch carrying the handlers
    // does not render) AND behaviourally (a real drag lifecycle produces no callback).
    // NOT via `row.ondragstart`: Svelte 5 binds through addEventListener, so that
    // property is undefined whether or not a handler is attached — the check would pass
    // vacuously in both states.
    const moves = [];
    const target = await mountBody({ canReorder: false, onReorderStage: (...a) => moves.push(a) });
    const row = rows(target)[0];

    assert.equal(row.getAttribute('draggable'), null, 'no draggable attribute');
    assert.equal(
      target.querySelector('[data-progressive-stage-reorderable]'),
      null,
      'the reorderable branch — which is where every drag handler lives — did not render'
    );

    const lastRow = rows(target)[2];
    for (const type of ['dragstart', 'dragover', 'drop']) {
      row.dispatchEvent(new globalThis.window.Event(type, { bubbles: true, cancelable: true }));
      lastRow.dispatchEvent(new globalThis.window.Event(type, { bubbles: true, cancelable: true }));
    }
    flushSync();
    assert.deepEqual(moves, [], 'a full drag lifecycle reorders nothing');
  });

  it('D13: fixed rows drop the grip glyph and the move buttons', async () => {
    const target = await mountBody({ canReorder: false });
    assert.equal(
      target.querySelector('.crafting-stage-handle'),
      null,
      'the grip IS the affordance signal, so it must not be shown'
    );
    assert.equal(target.querySelector('[data-progressive-stage-move]'), null);
  });

  it('D13: fixed rows explain themselves and carry NO live region', async () => {
    const target = await mountBody({ canReorder: false });
    const note = target.querySelector('[data-progressive-stage-fixed-note]');
    assert.ok(note, 'one muted line says why there is nothing to grab');
    assert.match(note.textContent, /Order set by the GM/);
    assert.equal(
      target.querySelector('[data-progressive-stage-status]'),
      null,
      'nothing can change, so nothing is announced'
    );
  });

  it('stage artwork is NOT natively draggable, in either state', async () => {
    // An <img> is draggable by default, so a drag started on the artwork becomes an image
    // drag with the wrong ghost — and dropping it outside the app can navigate away.
    // This is the repo's first drag row containing an image; the GM's row has none.
    for (const canReorder of [true, false]) {
      const target = await mountBody({ canReorder });
      const images = [...target.querySelectorAll('.crafting-stage-img')];
      assert.ok(images.length > 0, `precondition: artwork renders (canReorder=${canReorder})`);
      for (const image of images) {
        assert.equal(
          image.getAttribute('draggable'),
          'false',
          `artwork is not draggable (canReorder=${canReorder})`
        );
      }
      harness.remount();
    }
  });

  it('a drop commits the pending order write immediately (no debounce wait)', async () => {
    // A drag has already settled by the time it drops, so there is nothing to coalesce.
    // Mutation: drop the onReorderSettled call from handleDrop.
    const settled = [];
    const target = await harness.mount({
      recipe: progressiveRecipe(),
      craftability: craftability(),
      progressiveStages: STAGES,
      canReorderStages: true,
      stageAnnouncement: '',
      onReorderStage: () => {},
      onReorderStageSettled: () => settled.push(true),
    });

    rows(target)[0].dispatchEvent(
      new globalThis.window.Event('dragstart', { bubbles: true, cancelable: true })
    );
    rows(target)[2].dispatchEvent(
      new globalThis.window.Event('drop', { bubbles: true, cancelable: true })
    );
    flushSync();

    assert.equal(settled.length, 1, 'the drop settles the write');
  });

  it('a KEYBOARD move does not settle — it is the burst the debounce exists for', async () => {
    const settled = [];
    const target = await harness.mount({
      recipe: progressiveRecipe(),
      craftability: craftability(),
      progressiveStages: STAGES,
      canReorderStages: true,
      stageAnnouncement: '',
      onReorderStage: () => {},
      onReorderStageSettled: () => settled.push(true),
    });

    [...target.querySelectorAll('[data-progressive-stage-move-up]')][2].click();
    flushSync();

    assert.deepEqual(settled, [], 'chevron clicks coalesce; only the drop settles');
  });

  it('D13: reorderable rows DO attach the drag handlers (the converse)', async () => {
    // Without this, the absence assertions above could pass for the wrong reason.
    const moves = [];
    const target = await mountBody({ canReorder: true, onReorderStage: (...a) => moves.push(a) });
    const row = rows(target)[0];
    assert.equal(row.getAttribute('draggable'), 'true');
    assert.ok(target.querySelector('[data-progressive-stage-reorderable]'));
    assert.equal(target.querySelector('[data-progressive-stage-fixed-note]'), null);

    // The same lifecycle that reorders nothing above DOES reorder here.
    row.dispatchEvent(new globalThis.window.Event('dragstart', { bubbles: true, cancelable: true }));
    rows(target)[2].dispatchEvent(new globalThis.window.Event('drop', { bubbles: true, cancelable: true }));
    flushSync();
    assert.equal(moves.length, 1, 'a drag from row 1 onto row 3 reorders');
    assert.deepEqual([moves[0][0], moves[0][1]], [0, 2]);
  });

  // ── Issue 675: the salvage extensions are OPT-IN ─────────────────────────
  //
  // Progressive salvage reuses this component, which needed a stacked row shape and a
  // state chip. Both had to be additive and default-off, or a salvage feature would
  // have re-skinned the Crafting tab as a side effect. The crafting path (this one)
  // passes neither, so it must render exactly as it did — these assertions are the pin
  // that keeps that true.

  it('675: the crafting rendering is unchanged when the new props are omitted', async () => {
    const target = await mountBody();
    assert.equal(
      target.querySelector('[data-progressive-stage-state]'),
      null,
      'no state chip'
    );
    // The rest of the row is untouched: ordinal, difficulty, threshold, move buttons.
    const first = rows(target)[0];
    assert.ok(first.querySelector('[data-progressive-stage-ordinal]'));
    assert.ok(first.querySelector('[data-progressive-stage-difficulty]'));
    assert.ok(first.querySelector('[data-progressive-stage-threshold]'));
    assert.ok(first.querySelector('[data-progressive-stage-move]'));
  });

  it('675: a stage carrying a quantity renders NONE — progressive is quantity-less', async () => {
    // There is no opt-in left to pass: `showQuantity` was deleted, not defaulted off.
    // Awarding spends the budget against an entry ONCE and grants a single item, so any
    // `×N` on this list is a number the engine does not honour — on this surface and on
    // salvage's, which shares this component.
    const target = await mountBody({
      stages: [{ ...STAGES[0], quantity: 3 }, STAGES[1], STAGES[2]],
    });
    assert.equal(
      target.querySelector('[data-progressive-stage-quantity]'),
      null,
      'the stored count is inert in this mode and nothing renders it'
    );
    assert.equal(
      rows(target)[0].textContent.includes('×'),
      false,
      'and no ×N reaches the row by any other route'
    );
  });

  it('675: the reorder chevrons END the row', async () => {
    // One arrow position across both surfaces (crafting here, salvage via the same
    // component), matching the GM's component salvage editor. A divergence prop was
    // deliberately not added.
    const target = await mountBody();
    const row = rows(target)[0];
    const parts = [
      ...row.querySelectorAll('[data-progressive-stage-move], [data-progressive-stage-ordinal]'),
    ];
    assert.equal(parts.length, 2);
    assert.ok(parts[0].hasAttribute('data-progressive-stage-ordinal'), 'the ordinal leads');
    assert.ok(parts[1].hasAttribute('data-progressive-stage-move'), 'the chevrons trail');
    assert.equal(
      row.lastElementChild.hasAttribute('data-progressive-stage-move'),
      true,
      'and they are the last thing on the row'
    );
  });
});
