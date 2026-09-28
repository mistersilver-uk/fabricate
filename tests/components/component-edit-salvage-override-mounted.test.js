/** Issue 2005 — the salvage check override follows the salvage check's evaluation (Q16). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';
import {
  chooseSelectOption,
  closeSelectPanel,
  selectOptionLabels,
  selectTriggerText,
} from '../helpers/select-control.js';

const PRESET = '[data-salvage-dc-preset]';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-salvage-override-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  compiledModules: [...COMPONENT_EDIT_VIEW_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

const RESULT_GROUPS = [
  { id: 'grp-1', name: 'Scraps', results: [{ id: 'res-1', componentId: 'cmp-scrap', quantity: 1 }] },
];
const TIERS = [
  { id: 'e', name: 'Easy', dc: 10, adjustment: 2 },
  { id: 's', name: 'Standard', dc: 15, adjustment: 0 },
  { id: 'h', name: 'Hard', dc: 20, adjustment: -2 },
];
const SERA = { name: 'Sera Vane', rollData: { skills: { smith: { level: 12 } } } };
const IDRIN = { name: 'Idrin Ashfall', rollData: {} };
const ROSTER = [
  { id: 'actor-sera', name: 'Sera Vane', img: '' },
  { id: 'actor-idrin', name: 'Idrin Ashfall', img: '' },
];
const CHARACTERS = { 'actor-sera': SERA, 'actor-idrin': IDRIN };

const evaluation = ({ direction = 'under', source = 'attribute', kind = 'add' } = {}) => ({
  product: 'sum',
  direction,
  target: { source, expression: '@skills.smith.level', adjustmentKind: kind },
});

function mountOverride({ salvage = {}, config = {}, ...rest } = {}) {
  const drafts = [];
  const dirty = [];
  const props = {
    component: {
      id: 'comp-1',
      name: 'Iron Longsword',
      img: 'icons/svg/item-bag.svg',
      salvage: { enabled: true, resultGroups: RESULT_GROUPS, ...salvage },
    },
    componentOptions: [{ id: 'cmp-scrap', name: 'Scrap Metal', img: 'icons/svg/item-bag.svg' }],
    showSalvage: true,
    salvageResolutionMode: 'simple',
    salvageCheckEnabled: true,
    salvageCheckTiers: TIERS,
    salvageCheckDcMode: 'static',
    salvageCheckDc: 15,
    salvageCheckConfig: { dc: 15, thresholdMode: 'meet', evaluation: evaluation(), ...config },
    previewActors: ROSTER,
    resolvePreviewCharacter: (id) => CHARACTERS[id] ?? null,
    onDraftChange: (summary) => drafts.push(summary),
    onDirtyChange: (value) => dirty.push(value),
    ...rest,
  };
  return harness.mount(props).then((target) => ({ target, drafts, dirty }));
}

const flush = () => new Promise((done) => setTimeout(done, 0));
const card = (target) => target.querySelector('[data-salvage-dc-override]');
const title = (target) => card(target).querySelector('.manager-salvage-dc-title').textContent.trim();
const hint = (target) => target.querySelector('[data-salvage-override-hint]').textContent.trim();
const playerSees = (target) =>
  target.querySelector('[data-override-player-sees-line]')?.textContent.trim() ?? '';
const note = (target) =>
  target.querySelector('[data-override-player-sees-note]')?.textContent.trim() ?? '';
const kept = (target) =>
  target.querySelector('[data-salvage-override-kept]')?.textContent.trim() ?? '';
const lastSalvage = (drafts) => drafts.at(-1).updates.salvage;

function presetLabels(target) {
  const labels = selectOptionLabels(target, PRESET);
  closeSelectPanel(target, PRESET);
  return labels;
}

async function choose(target, value) {
  chooseSelectOption(target, PRESET, value);
  await flush();
}

/** Choose whose value the Player sees line previews, through the Preview-as picker itself. */
async function previewAs(target, actorId) {
  const trigger = target.querySelector('[data-salvage-dc-override] [data-override-preview-actor]');
  assert.ok(Boolean(trigger), 'the override offers its Preview-as picker');
  trigger.click();
  await flush();
  const option = target.querySelector(`[data-popover-option="${actorId}"]`);
  assert.ok(Boolean(option), `the picker offers ${actorId}`);
  option.click();
  await flush();
}

function key(element, name) {
  element.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  );
}

async function typeCommit(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  key(input, 'Enter');
  await flush();
}

describe('ComponentEditView — the salvage override follows the evaluation (issue 2005)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('a roll-under fixed target edits the DC override as a Target, and names what players see', async () => {
    const { target, drafts } = await mountOverride({
      salvage: { dcOverride: null, adjustmentOverride: -2 },
      config: { evaluation: evaluation({ source: 'fixed' }) },
    });
    assert.equal(card(target).dataset.salvageOverrideField, 'dcOverride');
    assert.equal(title(target), 'Target override');
    assert.equal(
      hint(target),
      'Replaces the system target for this component. The total must stay at or under it.'
    );
    assert.deepEqual(presetLabels(target), [
      'System default — Target 15',
      'Easy — Target 10',
      'Standard — Target 15',
      'Hard — Target 20',
      'Custom…',
    ]);
    assert.equal(playerSees(target), 'Salvage check · stay at or under 15');
    assert.equal(
      kept(target),
      'A difficulty adjustment override of −2 is kept on this component. This system does not read it, so it is not shown for editing.'
    );

    await choose(target, 'dc:10');
    assert.equal(lastSalvage(drafts).dcOverride, 10, 'the preset writes the DC');
    assert.equal(lastSalvage(drafts).adjustmentOverride, -2, 'and never the dormant adjustment');
    assert.equal(playerSees(target), 'Salvage check · stay at or under 10');
  });

  it('a strict comparison reads `under` in the hint and the Player sees line', async () => {
    const { target } = await mountOverride({
      salvage: { dcOverride: 12 },
      config: { thresholdMode: 'exceed', evaluation: evaluation({ source: 'fixed' }) },
    });
    assert.match(hint(target), /The total must stay under it\.$/);
    assert.equal(playerSees(target), 'Salvage check · stay under 12');
  });

  it('a character value edits the adjustment override with the tiers as adjustment presets', async () => {
    const { target, drafts, dirty } = await mountOverride({
      salvage: { dcOverride: 15, adjustmentOverride: null },
    });
    assert.equal(card(target).dataset.salvageOverrideField, 'adjustmentOverride');
    assert.equal(title(target), 'Difficulty adjustment override');
    assert.equal(
      hint(target),
      'Adjusts the character value this component is salvaged against. Added to the value.'
    );
    assert.deepEqual(presetLabels(target), [
      'System default — base adjustment',
      'Easy — +2',
      'Standard — 0',
      'Hard — −2',
      'Custom…',
    ]);
    assert.equal(selectTriggerText(target, PRESET), 'System default — base adjustment');
    assert.equal(
      kept(target),
      'A DC override of 15 is kept on this component. This system does not read it, so it is not shown for editing.'
    );
    assert.equal(
      playerSees(target),
      'Salvage check · stay at or under the character value (@skills.smith.level)',
      'with no character chosen the line names the formula'
    );
    assert.equal(note(target), 'Choose a character in Preview as to see what this resolves to.');
    await previewAs(target, 'actor-sera');
    assert.equal(playerSees(target), 'Salvage check · stay at or under 12 (Sera Vane @skills.smith.level 12)');
    assert.equal(note(target), '', 'a chosen character needs no note');
    assert.ok(!dirty.includes(true), 'rendering a dormant override, or previewing it, is not an edit');

    await choose(target, 'adj:-2');
    assert.equal(lastSalvage(drafts).adjustmentOverride, -2);
    assert.equal(lastSalvage(drafts).dcOverride, 15, 'the dormant DC survives the preset');
    assert.equal(
      playerSees(target),
      'Salvage check · stay at or under 10 (Sera Vane @skills.smith.level 12, −2)'
    );
  });

  it('System default clears only the active field', async () => {
    const { target, drafts } = await mountOverride({
      salvage: { dcOverride: 15, adjustmentOverride: -2 },
    });
    assert.equal(selectTriggerText(target, PRESET), 'Hard — −2');
    await choose(target, 'system');
    assert.equal(lastSalvage(drafts).adjustmentOverride, null, 'the adjustment is cleared');
    assert.equal(lastSalvage(drafts).dcOverride, 15, 'and the DC override is kept');
  });

  it('an exact off-list multiplier shows under Custom… and a typed label commits exactly', async () => {
    const { target, drafts } = await mountOverride({
      salvage: { dcOverride: null, adjustmentOverride: 0.7 },
      config: { evaluation: evaluation({ kind: 'multiply' }) },
    });
    assert.equal(
      hint(target),
      'Adjusts the character value this component is salvaged against. Multiplied, rounded down.'
    );
    assert.equal(selectTriggerText(target, PRESET), 'Custom…');
    const input = target.querySelector('[data-salvage-adjustment-custom]');
    assert.equal(input.value, '×0.7', 'never snapped or truncated');
    await previewAs(target, 'actor-sera');
    assert.equal(
      playerSees(target),
      'Salvage check · stay at or under 8 (Sera Vane @skills.smith.level 12, ×0.7)'
    );

    await typeCommit(input, '×½');
    assert.equal(lastSalvage(drafts).adjustmentOverride, 0.5);
    await typeCommit(target.querySelector('[data-salvage-adjustment-custom]'), '0.65');
    assert.equal(lastSalvage(drafts).adjustmentOverride, 0.65, 'a multiplier is kept exact');
  });

  it('Custom… from the system default reveals an empty formatted field, then types an adjustment', async () => {
    const { target, drafts } = await mountOverride({ salvage: { dcOverride: 15 } });
    await choose(target, 'custom');
    const input = target.querySelector('[data-salvage-adjustment-custom]');
    assert.ok(input, 'Custom… reveals the adjustment field');
    assert.equal(input.value, '', 'and invents no adjustment');
    await typeCommit(input, '-3');
    assert.equal(lastSalvage(drafts).adjustmentOverride, -3);
    assert.equal(lastSalvage(drafts).dcOverride, 15);
    assert.equal(selectTriggerText(target, PRESET), 'Custom…', 'the control stays on Custom…');
  });

  it('a roll-high character value reads `reach` in the Player sees line', async () => {
    const { target } = await mountOverride({
      salvage: { adjustmentOverride: 2 },
      config: { evaluation: evaluation({ direction: 'over' }) },
    });
    assert.equal(title(target), 'Difficulty adjustment override');
    await previewAs(target, 'actor-sera');
    assert.equal(playerSees(target), 'Salvage check · reach 14 (Sera Vane @skills.smith.level 12, +2)');
  });

  it('without a character the Player sees line names the formula and says none is chosen', async () => {
    const { target } = await mountOverride({ salvage: { adjustmentOverride: -2 } });
    assert.equal(
      target.querySelector('[data-override-preview-actor]').textContent.trim(),
      'No actor',
      'the picker starts on No actor'
    );
    assert.equal(
      playerSees(target),
      'Salvage check · stay at or under the character value (@skills.smith.level, −2)'
    );
    assert.equal(note(target), 'Choose a character in Preview as to see what this resolves to.');
    await previewAs(target, 'actor-sera');
    await previewAs(target, 'no-actor');
    assert.match(playerSees(target), /the character value/, 'choosing No actor returns to the formula');
  });

  it('a character missing the value is named rather than read as zero', async () => {
    const { target } = await mountOverride();
    await previewAs(target, 'actor-idrin');
    assert.equal(
      playerSees(target),
      'Idrin Ashfall has no value at @skills.smith.level. The check cannot resolve for them.'
    );
  });

  it('a switch between sources rewrites neither override', async () => {
    const { target, drafts } = await mountOverride({
      salvage: { dcOverride: 12, adjustmentOverride: -2 },
    });
    await harness.setProps({
      salvageCheckConfig: { dc: 15, evaluation: evaluation({ source: 'fixed' }) },
    });
    assert.equal(card(target).dataset.salvageOverrideField, 'dcOverride');
    assert.equal(selectTriggerText(target, PRESET), 'Custom…');
    assert.equal(target.querySelector('[data-salvage-dc-custom]').value, '12');
    assert.ok(drafts.length > 0, 'the editor reported its draft');
    assert.ok(
      drafts.every((draft) => draft.updates.salvage.adjustmentOverride === -2),
      'the dormant adjustment is never rewritten'
    );
  });

  it('saves both overrides and reopens on the saved preset', async () => {
    const first = await mountOverride({ salvage: { dcOverride: 15 } });
    await choose(first.target, 'adj:2');
    const saved = lastSalvage(first.drafts);
    assert.deepEqual(
      { dcOverride: saved.dcOverride, adjustmentOverride: saved.adjustmentOverride },
      { dcOverride: 15, adjustmentOverride: 2 }
    );
    harness.remount();
    const reopened = await mountOverride({ salvage: saved });
    assert.equal(selectTriggerText(reopened.target, PRESET), 'Easy — +2');
    assert.ok(!reopened.dirty.includes(true), 'reopening the saved record is clean');
  });

  it('stacks frames 23-24: a kicker, the controls, the hint, then a standing callout', async () => {
    const { target } = await mountOverride({ salvage: { dcOverride: 15, adjustmentOverride: -2 } });
    const root = card(target);
    const order = ['.manager-salvage-dc-title', PRESET, '[data-salvage-override-hint]'].map((selector) =>
      root.querySelector(selector)
    );
    assert.ok(root.querySelector('.manager-salvage-dc-title .fab-kicker'), 'the title is the Kicker');
    for (let i = 1; i < order.length; i += 1) {
      const follows = order[i - 1].compareDocumentPosition(order[i]);
      assert.ok(follows & globalThis.Node.DOCUMENT_POSITION_FOLLOWING, `part ${i} follows part ${i - 1}`);
    }
    const kept = root.querySelector('[data-salvage-override-kept]');
    assert.ok(kept.classList.contains('manager-callout'), 'the kept value is a Callout, not a Notice');
    assert.equal(kept.dataset.calloutTone, 'neutral');
    assert.ok(root.querySelector('[data-override-player-sees] .fab-kicker'), 'Player sees is the Kicker');
  });

  it('a roll-high fixed DC reads as frame 23, names a kept adjustment and shows what the player sees', async () => {
    const { target, drafts } = await mountOverride({
      salvage: { dcOverride: null, adjustmentOverride: -2 },
      config: { evaluation: evaluation({ direction: 'over', source: 'fixed' }) },
    });
    assert.equal(title(target), 'Salvage DC override');
    assert.equal(hint(target), 'Replaces the system DC for this component.');
    assert.equal(playerSees(target), 'Salvage check · DC 15', 'frame 23: every check shows it');
    assert.ok(
      !target.querySelector('[data-override-preview-actor]'),
      'a fixed DC reads no character, so it offers no Preview-as picker'
    );
    assert.equal(
      kept(target),
      'A difficulty adjustment override of −2 is kept on this component. This system does not read it, so it is not shown for editing.',
      'the kept adjustment is named here as the task editor names it'
    );
    await choose(target, 'custom');
    await typeCommit(target.querySelector('[data-salvage-dc-custom]'), '12');
    assert.equal(lastSalvage(drafts).dcOverride, 12);
    assert.equal(playerSees(target), 'Salvage check · DC 12', 'the line follows the override');
  });

  it('ships frame 23 wording for the roll-high fixed DC in the language file', () => {
    const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
    const keys = lang.FABRICATE.Admin.Manager.Component.SalvageEditor;
    assert.equal(keys.DcOverride, 'Salvage DC override');
    assert.equal(keys.DcOverrideHint, 'Replaces the system DC for this component.');
  });

  it('a dynamic system DC still shows its static number, since salvage never runs the DC macro', async () => {
    const { target } = await mountOverride({
      salvageCheckDcMode: 'dynamic',
      config: { evaluation: evaluation({ direction: 'over', source: 'fixed' }) },
    });
    assert.equal(playerSees(target), 'Salvage check · DC 15');
  });

  it('the system default and the line both read the DC of the sub-object salvage rolls', async () => {
    const { target } = await mountOverride({
      salvageResolutionMode: 'routed',
      salvageCheckDc: 15,
      config: { dc: 18, type: 'relative', evaluation: evaluation({ direction: 'over', source: 'fixed' }) },
    });
    assert.equal(presetLabels(target)[0], 'System default — DC 18');
    assert.equal(playerSees(target), 'Salvage check · DC 18');
  });

  it('an invalid adjustment is named as invalid, not as a missing value', async () => {
    const { target } = await mountOverride({
      salvage: { adjustmentOverride: -2 },
      config: { evaluation: evaluation({ kind: 'multiply' }) },
    });
    await previewAs(target, 'actor-sera');
    assert.equal(
      playerSees(target),
      'Salvage check cannot resolve: the difficulty adjustment ×-2 is invalid; a multiplier must be above zero.'
    );
    assert.equal(
      card(target).querySelector('[data-override-player-sees]').dataset.overridePlayerSees,
      'adjustment-invalid'
    );
  });

  it('a fixed-range routed check is graded by its ranges, so it shows no Player sees line', async () => {
    const { target } = await mountOverride({
      salvageResolutionMode: 'routed',
      config: { type: 'fixed', evaluation: evaluation({ direction: 'over', source: 'fixed' }) },
    });
    assert.ok(Boolean(card(target)), 'the override itself still renders');
    assert.ok(!target.querySelector('[data-override-player-sees]'), 'no line, no picker');
  });

  it('a count check reads its successes override, so it shows no DC line', async () => {
    const { target } = await mountOverride({
      config: { evaluation: { product: 'count', direction: 'over', pool: { die: 10 } } },
    });
    assert.ok(Boolean(card(target)), 'the override itself still renders');
    assert.ok(!target.querySelector('[data-override-player-sees]'), 'no DC line');
  });
});
