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
const FACT_ROW = 'src/ui/svelte/apps/journal/JournalFactRow.svelte';
const EVIDENCE = 'src/ui/svelte/apps/crafting/detail/CheckEvidenceRows.svelte';
const MEDALLION = 'src/ui/svelte/components/Medallion.svelte';
const RESULT_BOX = 'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte';
const SALVAGE_SUMMARY = 'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte';
const CHECK_CARD = 'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte';

/** `[id, label, text]` for every rendered evidence row. */
function rowsOf(root) {
  return [...root.querySelectorAll('[data-check-evidence]')].map((row) => [
    row.dataset.checkEvidence,
    row.querySelector('.journal-fact-label').textContent,
    row.querySelector('.journal-fact-value').textContent,
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
    compiledModules: [MEDALLION, FACT_ROW, EVIDENCE, RESULT_BOX],
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
    assert.deepEqual(order, [
      'crafting-roll-head',
      'crafting-roll-summary',
      'crafting-roll-message',
      'check-evidence',
      'crafting-roll-awards',
    ]);
  });

  it('offers a break only after each @path dot, with the text unchanged (item 7 ruling)', async () => {
    const root = await harness.mount({ result: result(executedCheck()) });
    const value = root.querySelector('[data-check-evidence="target"] .journal-fact-value');
    assert.equal(value.textContent, UNDER_ROWS[0][2], 'copy and read-out carry no stray characters');
    const html = value.innerHTML.replaceAll('<!---->', '');
    assert.equal((html.match(/<wbr>/g) ?? []).length, 2, 'two dots in the path, two breaks');
    assert.ok(html.includes('@skills.<wbr>smith.<wbr>level 12'), 'each directly after a path dot');
    const margin = root.querySelector('[data-check-evidence="margin"] .journal-fact-value');
    assert.ok(!margin.innerHTML.includes('<wbr'), 'a value without a path has none');
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

  it('gives a sum/over fixed box only the Needed and Margin rows and its sentence (M3)', async () => {
    const bare = await harness.mount({ result: result(undefined) });
    const bareOrder = [...bare.querySelector('[data-recipe-section]').children].map(
      (child) => child.className.split(' ')[0]
    );
    assert.deepEqual(bareOrder, ['crafting-roll-head', 'crafting-roll-awards']);
    harness.remount();
    const over = await harness.mount({ result: result(executedCheck(OVER_FIXED_DATA)) });
    assert.deepEqual(rowsOf(over), [
      ['needed', 'Needed', 'DC 12, meet or beat'],
      ['margin', 'Margin', '+3'],
    ]);
    assert.equal(over.querySelector('[data-roll-summary]').textContent, 'The result group is produced.');
    const order = [...over.querySelector('[data-recipe-section]').children].map(
      (child) => child.className.split(' ')[0]
    );
    assert.deepEqual(order, [
      'crafting-roll-head',
      'crafting-roll-summary',
      'check-evidence',
      'crafting-roll-awards',
    ]);
  });

  it('says what a roll-under outcome means for the award, beside its evidence', async () => {
    const summaryOf = (root) => root.querySelector('[data-roll-summary]')?.textContent;
    const passed = await harness.mount({ result: result(executedCheck()) });
    assert.equal(summaryOf(passed), 'The result group is produced.');
    const head = [...passed.querySelector('[data-recipe-section="roll-result"]').children];
    assert.equal(head[1].dataset.rollSummary, '', 'directly under the head');
    harness.remount();
    const failed = await harness.mount({
      result: { ...result(executedCheck()), success: false, items: [] },
    });
    assert.equal(summaryOf(failed), 'Nothing is produced; the failure policy applies.');
    harness.remount();
    const checkless = await harness.mount({ result: result(undefined) });
    assert.ok(!checkless.querySelector('[data-roll-summary]'), 'a box with no check says nothing');
  });

  it('states the failure sentence only when the failure awarded nothing (F9)', async () => {
    const failed = (items) => ({ success: false, items, check: executedCheck() });
    const awarded = await harness.mount({ result: failed([{ name: 'Slag', qty: 1 }]) });
    assert.ok(!awarded.querySelector('[data-roll-summary]'), 'failure awards were produced');
    harness.remount();
    const empty = await harness.mount({ result: failed([]) });
    assert.equal(
      empty.querySelector('[data-roll-summary]').textContent,
      'Nothing is produced; the failure policy applies.'
    );
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
    compiledModules: [MEDALLION, FACT_ROW, EVIDENCE, SALVAGE_SUMMARY],
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

  it('gives a sum/over fixed salvage only its Needed and Margin rows (M3)', async () => {
    const base = { state: 'success', message: 'Salvaged.', rollValue: 15 };
    const root = await harness.mount({ result: { ...base, check: executedCheck(OVER_FIXED_DATA) } });
    assert.deepEqual(rowsOf(root), [
      ['needed', 'Needed', 'DC 12, meet or beat'],
      ['margin', 'Margin', '+3'],
    ]);
    assert.ok(!markupOf(root).includes('result group'), 'the outcome sentence is crafting-only');
  });

  it('keeps the space between the message and the roll it names (F5)', async () => {
    const root = await harness.mount({
      result: { state: 'success', message: 'Salvaged.', rollValue: 9 },
    });
    const message = root.querySelector('[data-inventory-salvage-message]').textContent;
    assert.match(message.trim(), /^Salvaged\. with a roll of\s+9$/);
  });
});

describe('CraftingCheckCard target line', () => {
  const harness = createMountedComponentHarness({
    ...SHARED,
    tmpPrefix: 'fabricate-check-card-target-',
    compiledModules: ['src/ui/svelte/components/Kicker.svelte', CHECK_CARD],
    componentPath: CHECK_CARD,
  });
  before(async () => {
    await harness.setup();
    localizeShipped();
  });
  after(harness.teardown);
  afterEach(harness.remount);

  const card = (extra) => ({ dc: null, rollFormula: '1d20', usable: true, mandatory: true, ...extra });

  it('states the target and its source fact where a sum/over card states its DC', async () => {
    const root = await harness.mount({
      check: card({
        target: { direction: 'under', text: 'Target 11 · stay at or under', source: 'Sera Vane @skills.smith.level 12 · Hard Work −2 · modifiers +1' },
      }),
    });
    const target = root.querySelector('[data-check-target="under"]');
    assert.equal(target.textContent.trim(), 'Target 11 · stay at or under');
    assert.equal(
      target.nextElementSibling.textContent.trim(),
      'Sera Vane @skills.smith.level 12 · Hard Work −2 · modifiers +1'
    );
    assert.ok(!root.querySelector('[data-check-dc]'), 'no DC beside a target to stay under');
  });

  it('shows the unavailable reason instead of a target it could not read', async () => {
    const reason = 'Crafting check could not read a number for its target from this character.';
    const root = await harness.mount({ check: card({ target: { unresolved: reason } }) });
    assert.equal(root.querySelector('[data-check-target-unresolved]').textContent.trim(), reason);
    assert.ok(!root.querySelector('[data-check-target]'));
  });

  it('leaves a sum/over card byte-identical', async () => {
    const bare = markupOf(await harness.mount({ check: card({ dc: 15 }) }));
    assert.match(bare, /data-check-dc/);
    assert.ok(!/data-check-target/.test(bare));
  });
});
