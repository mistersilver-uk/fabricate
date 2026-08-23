/**
 * The bulk panel's "What could go wrong" block (issue 1286, PR 2).
 *
 * Mounts `InventoryBulkPanel` DIRECTLY, because the block's whole contract is
 * given-props: every field it draws is published on the queued entry by
 * `inventoryStore`'s `bulkRunProjection`, and the panel's job is to render exactly that
 * and derive none of it. A suite that mounted `InventoryView` instead would prove the
 * store wiring and hide the block's own rules behind a fixture; the wiring half is
 * pinned where the wiring lives (`tests/stores/player-complication-seam.test.js` for the
 * projection, `tests/components/inventory-view.test.js` for the panel's props).
 *
 * The harness's `game.i18n` stub returns the KEY for `localize(key)` and
 * `<key>:<json>` for `localize(key, data)`, so the assertions below read as key names.
 * That is deliberately useful here: the formatted form pins the exact substitution
 * PAYLOAD, which is how a re-indexed position or a dropped DC is caught rather than
 * merely a string that happens to contain a number
 * (`inventory-view.test.js`'s `RecoveredCount` assertion is the precedent).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-complications-',
  // The panel's FULL static import closure, not the subset this suite's fixtures happen
  // to render: a compiled `.svelte.js` carries static imports of every child whatever the
  // `{#if}` branches do, and an omission HANGS the suite (# cancelled) rather than
  // failing it. `createMountedComponentHarness` re-walks the closure and throws on a gap.
  rawModules: [
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceTint.js',
    'src/ui/svelte/util/foundryBridge.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkComplicationGroup.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkReport.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkSection.svelte',
    // INCLUDING the component under test: `setup()` writes `compiledModules` only, so a
    // list that omits the panel's own compiled artefact leaves the import unresolvable —
    // which surfaces as `# cancelled`, not as a failure.
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** One forecast row, exactly as `bulkStageComplications` publishes it. */
const complication = (overrides = {}) => ({
  resultId: 's2',
  position: 2,
  resultName: 'Ground Reagent',
  resultDifficulty: 3,
  id: 'x-dust',
  name: 'Choking dust',
  description: 'A cloud of caustic dust bursts out of the vessel as it cracks open.',
  severity: 'severe',
  ...overrides,
});

/** One queued entry, as the store's `bulkSalvageable` publishes it. */
const entry = (overrides = {}) => ({
  key: 'sys:alembic',
  name: 'Cracked Alembic',
  img: 'icons/alembic.webp',
  broken: false,
  systemsCount: 1,
  systemName: 'Herbalism',
  mode: 'progressive',
  allowsReorder: true,
  orderIsPlayers: false,
  complications: [complication()],
  yieldRows: [],
  ...overrides,
});

const mount = (props = {}) =>
  harness.mount({
    counts: { selected: 1, salvageable: 1, blocked: 0, atMax: false },
    entries: [entry()],
    salvageable: [entry()],
    blocked: [],
    yieldRows: [],
    destroyLabel: 'Destroy 1',
    ...props,
  });

const blockIn = (root) => root.querySelector('[data-inventory-bulk-complications]');
const groupsIn = (root) => [...root.querySelectorAll('[data-inventory-bulk-complication-group]')];
const rowsIn = (node) => [...node.querySelectorAll('[data-inventory-bulk-complication]')];
const eyebrowOf = (row) => row.querySelector('.fab-complication-row-eyebrow').textContent.trim();

describe('the bulk panel’s "What could go wrong" block (issue 1286)', () => {
  // ── When it exists at all ────────────────────────────────────────────────────────

  it('draws nothing when no queued entry carries a forecast', async () => {
    const root = await mount({ salvageable: [entry({ complications: [] })] });
    assert.ok(!blockIn(root), 'an empty section eyebrow is worse than no section');
    assert.ok(
      root.querySelector('[data-inventory-bulk-queue="preview"]'),
      'while the queue itself is untouched',
    );
  });

  it('is withheld once the run commits, in BOTH post-commit states', async () => {
    // The fired record is reported on the aggregate chat card after a run, so a forecast
    // still standing beside a committed outcome reads as a second, contradicting report.
    const running = await mount({ running: true, progress: { current: 0, total: 1 } });
    assert.ok(!blockIn(running), 'not while the batch runs');
    harness.remount();

    const reported = await mount({
      report: { mode: 'salvage', cancelled: false, counts: null, rows: [] },
    });
    assert.ok(!blockIn(reported), 'and not beside the report');
  });

  it('renders ABOVE the queue, where it can still change the player’s mind', async () => {
    const root = await mount();
    // Compared as INDICES, never as nodes: `node:assert` serialises a mounted happy-dom
    // element's circular tree to build its diff, so a failed node comparison dies of a
    // heap OOM and reports as a `# cancelled` suite with no message.
    const sections = [...root.querySelectorAll('.inventory-detail-section')];
    assert.ok(
      sections.indexOf(blockIn(root)) <
        sections.indexOf(root.querySelector('[data-inventory-bulk-queue="preview"]')),
      'the forecast is what the player weighs before spending the one batch gesture',
    );
  });

  // ── The grouping unit ────────────────────────────────────────────────────────────

  it('draws ONE card per queued entry, in queue order, skipping entries with nothing', async () => {
    const root = await mount({
      salvageable: [
        entry(),
        entry({ key: 'sys:retort', name: 'Bent Retort', complications: [] }),
        entry({
          key: 'sys:crucible',
          name: 'Chipped Crucible',
          complications: [complication({ resultId: 's9', id: 'x-scald', name: 'Scalding steam' })],
        }),
      ],
    });
    assert.deepEqual(
      groupsIn(root).map((group) => group.dataset.inventoryBulkComplicationGroup),
      ['sys:alembic', 'sys:crucible'],
      'grouped by the row the player selected, so the block reads against the queue',
    );
  });

  it('counts the rows it actually draws', async () => {
    const root = await mount({
      salvageable: [
        entry({
          complications: [
            complication(),
            complication({ position: 4, resultId: 's4', id: 'x-shatter', name: 'It shatters' }),
          ],
        }),
        entry({
          key: 'sys:crucible',
          name: 'Chipped Crucible',
          complications: [complication({ resultId: 's9', id: 'x-scald' })],
        }),
      ],
    });
    const count = root.querySelector('[data-inventory-bulk-complication-count]');
    assert.equal(count.dataset.inventoryBulkComplicationCount, '3');
    assert.equal(
      count.textContent.trim(),
      'FABRICATE.App.Complications.Count:{"count":3}',
      'a number in the eyebrow that disagreed with the rows beneath it is worse than none',
    );
    assert.equal(rowsIn(blockIn(root)).length, 3);
  });

  it('pins the count into the section eyebrow rather than a line of its own', async () => {
    const root = await mount();
    const title = blockIn(root).querySelector('.inventory-detail-section-title');
    assert.equal(title.textContent.trim().startsWith('FABRICATE.App.Complications.Title'), true);
    assert.ok(
      title.querySelector('[data-inventory-bulk-complication-count]'),
      'the count is the eyebrow’s trailing slot — the shipped `.salvage-body-hint` shape',
    );
  });

  // ── The position is RENDERED, never recomputed ───────────────────────────────────

  it('renders the published position, gaps and all', async () => {
    // `position` is the 1-based index over ALL of that row's stages in the player's
    // order, so a stage authoring no complication leaves a GAP. An `{#each}` index would
    // produce a dense 1..N naming rows the single-item panel does not have, and nothing
    // on screen would say it was wrong.
    const root = await mount({
      salvageable: [
        entry({
          complications: [
            complication({ position: 2, resultId: 's2', resultName: 'Ground Reagent' }),
            complication({
              position: 5,
              resultId: 's5',
              resultName: 'Alembic Shard',
              resultDifficulty: 7,
              id: 'x-scald',
            }),
          ],
        }),
      ],
    });
    assert.deepEqual(
      rowsIn(blockIn(root)).map(eyebrowOf),
      [
        'FABRICATE.App.Complications.ResultEyebrow:{"position":2,"name":"Ground Reagent","difficulty":3}',
        'FABRICATE.App.Complications.ResultEyebrow:{"position":5,"name":"Alembic Shard","difficulty":7}',
      ],
      'the numbers are 2 and 5, never 1 and 2',
    );
  });

  it('renders the same complication twice when it is staged twice', async () => {
    // A component staged twice is two rows at two positions carrying one complication id:
    // a complication is evaluated per result entry, so the second occurrence is a real
    // second chance for it to fire — and a key over the id alone would collide.
    const root = await mount({
      salvageable: [
        entry({
          complications: [
            complication({ position: 1, resultId: 's1' }),
            complication({ position: 3, resultId: 's3' }),
          ],
        }),
      ],
    });
    assert.equal(
      rowsIn(blockIn(root)).map((row) => row.dataset.inventoryBulkComplication).join(','),
      'x-dust,x-dust',
    );
    assert.deepEqual(
      [...blockIn(root).querySelectorAll('[data-inventory-bulk-complication-position]')].map(
        (row) => row.dataset.inventoryBulkComplicationPosition,
      ),
      ['1', '3'],
    );
  });

  it('states the position, the result and its DC in ONE metadata slot', async () => {
    const root = await mount();
    const row = rowsIn(blockIn(root))[0];
    assert.equal(
      eyebrowOf(row),
      'FABRICATE.App.Complications.ResultEyebrow:{"position":2,"name":"Ground Reagent","difficulty":3}',
    );
    // An ordinal tile plus a severity tile plus a wrapping name is three leading boxes in
    // a 300px column, which is the failure the stacked stage layout exists to prevent.
    assert.equal(
      row.querySelectorAll('.fab-complication-severity').length,
      1,
      'the severity tile is the row’s ONLY leading box',
    );
    assert.equal(
      row.querySelectorAll('.fab-complication-row-eyebrow').length,
      1,
      'and the metadata has one slot, not a second one beside it',
    );
  });

  // ── Whose order it is ────────────────────────────────────────────────────────────

  it('names the order as the player’s ONLY when the projection says so', async () => {
    const mine = await mount({ salvageable: [entry({ orderIsPlayers: true })] });
    assert.equal(
      groupsIn(mine)[0]
        .querySelector('[data-inventory-bulk-complication-order]')
        .textContent.trim(),
      'FABRICATE.App.Complications.OrderNote',
    );
  });

  it('says nothing about the order to a player who MAY reorder and has not', async () => {
    // `orderIsPlayers` is not `allowsReorder`. The permission says a player MAY arrange
    // the list; one who may and has not is reading the GM's order, and a note claiming
    // otherwise is a false statement about their own arrangement.
    const root = await mount({
      salvageable: [entry({ allowsReorder: true, orderIsPlayers: false })],
    });
    assert.ok(!root.querySelector('[data-inventory-bulk-complication-order]'));
  });

  // ── The shared row, in the shared player variant ─────────────────────────────────

  it('renders the tense chip first and the severity chip LAST', async () => {
    const root = await mount();
    const chips = [...rowsIn(blockIn(root))[0].querySelectorAll('.manager-chip')];
    assert.equal(chips.length, 2, 'no Player pill: telling a player they can see this is noise');
    assert.equal(chips[0].textContent.trim(), 'FABRICATE.App.Complications.Forecast');
    assert.equal(chips.at(-1).textContent.trim(), 'FABRICATE.App.Complications.SeveritySevere');
  });

  it('keeps the severity tile on severity, which the whole block’s tense never touches', async () => {
    const root = await mount();
    const tile = rowsIn(blockIn(root))[0].querySelector('.fab-complication-severity');
    assert.ok(tile.classList.contains('is-danger'), 'severe is the danger family');
  });

  it('WRAPS the authored description rather than clipping it to one line', async () => {
    const root = await mount();
    const body = rowsIn(blockIn(root))[0].querySelector('.fab-complication-row-body');
    assert.equal(body.textContent.trim(), complication().description);
    assert.ok(
      body.classList.contains('is-clamped'),
      'in a 300px inspector the description IS the disclosure; one clipped line removes it',
    );
    assert.match(body.getAttribute('style') || '', /--fab-complication-body-lines:\s*3/);
    assert.equal(body.getAttribute('title'), complication().description);
  });

  it('never shows the player a trigger sentence', async () => {
    // The body slot is TYPED on the shared row: the player variant reads `description`
    // and the GM variants read `triggerSentence`, so handing a player the trigger is
    // unspellable at the call site rather than merely discouraged.
    const root = await mount();
    assert.doesNotMatch(blockIn(root).textContent, /When |1d20|rolls /);
  });

  it('names the queued row the forecast belongs to', async () => {
    const root = await mount();
    assert.equal(
      groupsIn(root)[0].querySelector('.inventory-detail-row-name').textContent.trim(),
      'Cracked Alembic',
    );
  });

  // ── What the block must NOT grow ─────────────────────────────────────────────────

  it('builds no part of the exclusion vocabulary', async () => {
    // The prototype draws a per-stage exclude checkbox and an "N more excluded from your
    // list" note. Exclusion contradicts the reconciliation guarantee that a result is
    // never dropped, and there is nowhere to persist one, so the vocabulary is not built
    // rather than built and disabled.
    const root = await mount({
      salvageable: [
        entry({
          complications: [
            complication(),
            complication({ position: 5, resultId: 's5', id: 'x-scald' }),
          ],
        }),
      ],
    });
    const block = blockIn(root);
    assert.ok(!block.querySelector('input'), 'no control of any kind');
    assert.ok(!block.querySelector('button'), 'and nothing destructive or navigational');
    assert.ok(!root.querySelector('[data-inventory-bulk-exclude]'));
    assert.ok(!root.querySelector('[data-inventory-bulk-complication-hidden]'));
    assert.doesNotMatch(block.textContent, /exclud/i);
  });
});
