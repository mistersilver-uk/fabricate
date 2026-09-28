/**
 * Issue 2005 — the player result boxes state the executed check's Target, Pre-rolled and Margin
 * rows from the result's projection only (Q9), and gain nothing for sum/over/fixed or a withheld roll.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECK_EVIDENCE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  OVER_FIXED_DATA,
  UNDER_DATA,
  UNDER_ROWS,
  executedCheck,
  shippedLocalize,
} from '../helpers/checkEvidenceFixtures.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHARED = {
  repoRoot,
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...CHECK_EVIDENCE_RAW_MODULES,
    'src/ui/svelte/util/craftingArtResolution.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
  ],
  rootClass: 'fabricate fabricate-app',
};
const EVIDENCE = 'src/ui/svelte/apps/crafting/detail/CheckEvidenceRows.svelte';
const MEDALLION = 'src/ui/svelte/components/Medallion.svelte';
const RESULT_BOX = 'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte';
const SALVAGE_SUMMARY = 'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte';

/** `[id, label, text]` for every rendered evidence row. */
function rowsOf(root) {
  return [...root.querySelectorAll('[data-check-evidence]')].map((row) => [
    row.dataset.checkEvidence,
    row.querySelector('dt').textContent,
    row.querySelector('dd').textContent,
  ]);
}

/** The box's markup without Svelte's block anchors, for a byte comparison. */
const markupOf = (root) => root.innerHTML.replaceAll('<!---->', '');

function localizeShipped() {
  globalThis.game.i18n.localize = shippedLocalize;
}

describe('RollResultBox evidence rows', () => {
  const harness = createMountedComponentHarness({
    ...SHARED,
    tmpPrefix: 'fabricate-roll-result-evidence-',
    compiledModules: [MEDALLION, EVIDENCE, RESULT_BOX],
    componentPath: RESULT_BOX,
  });
  before(async () => {
    await harness.setup();
    localizeShipped();
  });
  after(harness.teardown);
  afterEach(harness.remount);

  const result = (check) => ({ success: true, items: [{ name: 'Blade', qty: 1 }], check });

  it('states the executed rows in order, between the message and the awards', async () => {
    const root = await harness.mount({ result: { ...result(executedCheck()), message: 'Made.' } });
    assert.deepEqual(rowsOf(root), UNDER_ROWS);
    const box = root.querySelector('[data-recipe-section="roll-result"]');
    const order = [...box.children].map((child) => child.className.split(' ')[0]);
    assert.deepEqual(order, ['crafting-roll-head', 'crafting-roll-message', 'check-evidence', 'crafting-roll-awards']);
  });

  it('reads only the executed record, never what changed after it (Q9)', async () => {
    const data = structuredClone(UNDER_DATA);
    const check = executedCheck(data);
    data.target = 99;
    data.targetTerms[0].value = 40;
    const root = await harness.mount({ result: result(check) });
    assert.deepEqual(rowsOf(root), UNDER_ROWS, 'the projection is a copy of the executed data');
    await harness.setProps({ result: { ...result(check), message: 'Re-rendered.' } });
    assert.equal(rowsOf(root)[0][2], UNDER_ROWS[0][2]);
  });

  it('shows the roller its own private roll, and withholds a secret or blind one', async () => {
    for (const rollMode of ['gmroll', 'selfroll']) {
      const root = await harness.mount({ result: result(executedCheck(UNDER_DATA, { rollMode })) });
      assert.equal(rowsOf(root).length, 3, rollMode);
      harness.remount();
    }
    for (const visibility of [{ rollMode: 'blindroll' }, { rollMode: 'publicroll', secret: true }]) {
      const root = await harness.mount({ result: result(executedCheck(UNDER_DATA, visibility)) });
      assert.ok(!root.querySelector('.check-evidence'), JSON.stringify(visibility));
      harness.remount();
    }
  });

  it('leaves a sum/over fixed or check-less box byte-identical', async () => {
    const bare = markupOf(await harness.mount({ result: result(undefined) }));
    harness.remount();
    const withOver = markupOf(await harness.mount({ result: result(executedCheck(OVER_FIXED_DATA)) }));
    assert.equal(withOver, bare);
  });

  it('renders nothing at all without a recorded result, which a refusal leaves (Q10)', async () => {
    const root = await harness.mount({ result: null });
    assert.ok(!root.querySelector('[data-recipe-section="roll-result"]'));
    assert.ok(!root.querySelector('[data-check-evidence]'));
  });
});

describe('SalvageRollSummary evidence rows', () => {
  const harness = createMountedComponentHarness({
    ...SHARED,
    tmpPrefix: 'fabricate-salvage-summary-evidence-',
    compiledModules: [MEDALLION, EVIDENCE, SALVAGE_SUMMARY],
    componentPath: SALVAGE_SUMMARY,
  });
  before(async () => {
    await harness.setup();
    localizeShipped();
  });
  after(harness.teardown);
  afterEach(harness.remount);

  it('states a successful salvage roll-under evidence beneath its message', async () => {
    const root = await harness.mount({
      result: { state: 'success', message: 'Salvaged.', rollValue: 9, check: executedCheck() },
    });
    assert.deepEqual(rowsOf(root), UNDER_ROWS);
  });

  it('adds nothing for a sum/over fixed salvage', async () => {
    const base = { state: 'success', message: 'Salvaged.', rollValue: 15 };
    const bare = markupOf(await harness.mount({ result: base }));
    harness.remount();
    const withOver = markupOf(
      await harness.mount({ result: { ...base, check: executedCheck(OVER_FIXED_DATA) } })
    );
    assert.equal(withOver, bare);
  });
});
