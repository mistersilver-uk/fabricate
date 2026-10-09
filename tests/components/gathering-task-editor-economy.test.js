import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The node card's two vocabularies are data since issue 1510 converted its selects: read from the
// module that declares them rather than matched in the editor's markup.
import {
  respawnGainModeOptions,
  respawnPolicyOptions
} from '../../src/ui/svelte/apps/manager/gatheringTaskSelectOptions.js';
import { defineStructureContract } from '../helpers/structureContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
// The editor's tabs and cards (issue 1522), each read where its markup now lives.
const taskPart = (name) =>
  readFileSync(resolve(repoRoot, `src/ui/svelte/apps/manager/gathering-task/${name}.svelte`), 'utf8');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');
const GATHERING_ROUTE_MODEL = 'src/ui/svelte/apps/manager/gatheringRouteModel.svelte.js';

const editorSource = readFileSync(editorPath, 'utf8');
const requirementsSource = taskPart('GatheringTaskRequirementsTab');
const nodesSource = taskPart('GatheringTaskNodesCard');
const overrideSource = taskPart('GatheringTaskCheckOverrideCard');
// The five card classes `GatheringTaskCard` gives the shared chrome.
const CARD_CHROME = Object.freeze([
  'manager-task-stamina-card',
  'manager-task-nodes-card',
  'manager-task-dc-card',
  'manager-task-resolution-card',
  'manager-task-results-card',
]);
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('Gathering task editor — economy sections are flag-gated and carded', () => {
  it('accepts independent staminaEnabled / nodesEnabled props (default false)', () => {
    assert.match(editorSource, /staminaEnabled\s*=\s*false/, 'editor should declare a staminaEnabled prop defaulting to false');
    assert.match(editorSource, /nodesEnabled\s*=\s*false/, 'editor should declare a nodesEnabled prop defaulting to false');
    // The single mode prop is gone.
    assert.ok(!/economyMode\s*=\s*'none'/.test(editorSource), 'the old economyMode prop is removed');
  });

  it('shows the stamina cost card only when stamina is enabled', () => {
    const guardIdx = requirementsSource.indexOf('{#if staminaEnabled}');
    const staminaIdx = requirementsSource.indexOf('<GatheringTaskStaminaCard');
    assert.ok(guardIdx >= 0, 'stamina section should be guarded by staminaEnabled');
    assert.ok(staminaIdx > guardIdx, 'the stamina card should render inside the staminaEnabled guard');
  });

  it('shows the resource node card only when nodes are enabled', () => {
    const guardIdx = nodesSource.indexOf('{#if nodesEnabled}');
    const nodesIdx = nodesSource.indexOf('data-gathering-task-nodes');
    assert.ok(guardIdx >= 0, 'node section should be guarded by nodesEnabled');
    assert.ok(nodesIdx > guardIdx, 'the node card should render inside the nodesEnabled guard');
  });

  it('renders both economy cards independently (both guards present, no shared else)', () => {
    // The two cards are gated by two independent {#if} blocks, on two tabs since issue 1522.
    const staminaGuard = requirementsSource.indexOf('{#if staminaEnabled}');
    const nodesGuard = nodesSource.indexOf('{#if nodesEnabled}');
    assert.ok(staminaGuard >= 0 && nodesGuard >= 0, 'both flag guards exist');
  });

  it('shows the guidance hint in the {:else} of the nodes guard (nodes disabled)', () => {
    // The hint now lives in the {:else} of the nodesEnabled guard.
    const guardIdx = nodesSource.indexOf('{#if nodesEnabled}');
    // Prettier (issue 923) prints the section's attributes one per line.
    const elseMatch = /\{:else\}\s*<GatheringTaskCard\s+class="manager-task-nodes-card manager-task-nodes-hint-card"/.exec(
      nodesSource.slice(guardIdx)
    );
    const elseIdx = elseMatch ? guardIdx + elseMatch.index : -1;
    const hintIdx = nodesSource.indexOf('data-gathering-task-nodes-hint');
    assert.ok(elseIdx > guardIdx, 'the nodes guard has an else branch carrying the hint');
    assert.ok(hintIdx > elseIdx, 'the guidance hint renders inside the else (nodes-disabled) branch');
    assert.match(nodesSource, /FABRICATE\.Admin\.Manager\.Economy\.TaskNodesEconomyHint/, 'the hint uses the dedicated guidance key');
  });

  it('the node-guidance hint i18n key drops "mode" and names the Resource nodes toggle', () => {
    const hint = lang.FABRICATE.Admin.Manager.Economy.TaskNodesEconomyHint;
    assert.ok(typeof hint === 'string' && hint.length > 0, 'the guidance key exists');
    assert.match(hint, /resource nodes/i, 'the hint names the resource-nodes toggle');
    assert.ok(!/\bmode\b/i.test(hint), 'the hint no longer mentions a limitation "mode"');
  });

  it('exposes the full node-config controls (count, depletion, respawn, interval, gain mode, chance, amount)', () => {
    for (const attr of [
      'data-gathering-task-node-count',
      'data-gathering-task-node-deplete',
      'data-gathering-task-node-respawn',
      'data-gathering-task-node-interval',
      'data-gathering-task-node-gain-mode',
      'data-gathering-task-node-chance',
      'data-gathering-task-node-amount'
    ]) {
      assert.ok(nodesSource.includes(attr), `node card should expose ${attr}`);
    }
    // The three respawn policies are offered, in order (issue 301 adds nonRegenerating).
    const fallback = (key, text) => text;
    assert.deepEqual(
      respawnPolicyOptions(fallback).map((option) => option.value),
      ['manual', 'overTime', 'nonRegenerating'],
      'the respawn picker offers the three shipped policies'
    );
    // The three over-time gain modes are offered.
    assert.deepEqual(
      respawnGainModeOptions(fallback).map((option) => option.value),
      ['guaranteed', 'chance', 'expression'],
      'the gain-mode picker offers the three shipped modes'
    );
    // The removed legacy policies are gone — from the vocabulary and from the editor.
    for (const policy of ['none', 'elapsedTime', 'probability', 'manualAndElapsedTime']) {
      assert.ok(
        !respawnPolicyOptions(fallback).some((option) => option.value === policy),
        `respawn picker should no longer offer policy ${policy}`
      );
      assert.ok(
        !nodesSource.includes(`value="${policy}"`),
        `the editor should spell no ${policy} option`
      );
    }
  });

  it('persists node edits through onUpdateTask with sensible normalization', () => {
    assert.match(nodesSource, /function setNodeCount/, 'has a node-count setter');
    assert.match(nodesSource, /onUpdateTask\(\{ nodes: null \}\)/, 'blank/zero count clears the node config');
    assert.match(nodesSource, /current:\s*max/, 'authoring starts a node pool full (current = max)');
    assert.match(nodesSource, /chance:[^}]*next\s*\/\s*100/, 'chance is stored as a 0..1 fraction (÷100)');
    assert.match(nodesSource, /Math\.min\(1,\s*Math\.max\(0,/, 'chance is clamped to 0..1');
    assert.match(nodesSource, /intervalUnit,\s*intervalAmount:/, 'interval is stored as unit + amount (calendar-aware at runtime)');
  });

  it('gives both economy sections card chrome', () => {
    // One card component states the chrome for all five since issue 1522 split the editor.
    const cardSource = taskPart('GatheringTaskCard');
    for (const cardClass of CARD_CHROME) {
      assert.match(
        cardSource,
        new RegExp(String.raw`\.${cardClass}[^{]*\{[^}]*border:[^}]*background:[^}]*\}`),
        `GatheringTaskCard gives ${cardClass} the card chrome (border + background)`
      );
    }
  });

  // The system economy's two flags and the default-environment options the parent passes down.
  defineStructureContract('derives the task editor inputs in the gathering route model', GATHERING_ROUTE_MODEL, {
    declares: [
      'selectedGatheringTaskStaminaEnabled',
      'selectedGatheringTaskNodesEnabled',
      'selectedSystemEnvironmentOptions',
    ],
  });

  it('wires the two economy flags from the parent', () => {
    assert.match(rootSource, /staminaEnabled=\{gathering\.selectedGatheringTaskStaminaEnabled\}/, 'parent passes staminaEnabled to the task editor');
    assert.match(rootSource, /nodesEnabled=\{gathering\.selectedGatheringTaskNodesEnabled\}/, 'parent passes nodesEnabled to the task editor');
  });

  it('authors depletedBehavior with a FilePicker swap-image (swap is the only behavior; no delete, no postfix)', () => {
    // Only the swap-image picker survives.
    for (const attr of [
      'data-gathering-task-depleted-behavior',
      'data-gathering-task-depleted-image'
    ]) {
      assert.ok(nodesSource.includes(attr), `depleted-behavior block should expose ${attr}`);
    }
    for (const removed of [
      'data-gathering-task-depleted-delete',
      'data-gathering-task-depleted-warning',
      'data-gathering-task-depleted-postfix',
      'depletedDeleteToken',
      'toggleDepletedDelete'
    ]) {
      assert.ok(!nodesSource.includes(removed), `the delete behavior is removed: ${removed} must not appear`);
    }

    // The swap-image control is wired to the FilePicker service (onPickImagePath),
    // not a free-text input.
    assert.match(nodesSource, /async function chooseDepletedImage/, 'swap-image uses the FilePicker via onPickImagePath');
    assert.match(nodesSource, /onPickImagePath\(\s*depletedSwapImage/, 'the depleted image picker calls onPickImagePath');
  });

  it('puts the swap-image picker inline with the title/hint', () => {
    // Title/hint and the image sit on one row. The picker, its clear button and the right-click
    // clear are acted in `gathering-task-editor-stepper-mounted.test.js` (issue 1522).
    const rowIdx = nodesSource.indexOf('manager-task-depleted-row');
    const copyIdx = nodesSource.indexOf('manager-task-depleted-copy');
    const imageColIdx = nodesSource.indexOf('data-gathering-task-depleted-image-column');
    assert.ok(rowIdx >= 0, 'an inline row wraps the depleted-behavior block');
    assert.ok(copyIdx > rowIdx && imageColIdx > rowIdx, 'the title/hint copy and the image column both sit inside the inline row');
  });

  it('authors the optional defaultEnvironmentId select wired from the parent', () => {
    // The hook rides the converted trigger now, so `gathering-task-editor-stepper-mounted` asserts
    // its presence on the rendered DOM rather than this suite matching it in markup, and `clears the
    // default environment back to the sentinel` there drives the empty-to-null coercion this used to
    // pin as source text, and the setter that lives on the Overview tab since issue 1522.
    // The parent feeds the system environments into the editor.
    assert.match(rootSource, /environmentOptions=\{gathering\.selectedSystemEnvironmentOptions\}/, 'parent passes environmentOptions to the task editor');
  });

  it('adds the depleted-behavior + default-environment + drop-dialog i18n keys', () => {
    const econ = lang.FABRICATE.Admin.Manager.Economy;
    assert.equal(econ.DepletedBehaviorTitle, 'When depleted (linked marker)');
    // The delete-marker behavior was removed: its i18n keys must be gone.
    assert.ok(!('DepletedDeleteToken' in econ), 'the DepletedDeleteToken key is removed');
    assert.ok(!('DepletedDeleteWarning' in econ), 'the DepletedDeleteWarning key is removed');
    assert.equal(econ.DepletedSwapImage, 'Swap marker image');
    assert.equal(econ.DepletedSwapImageClear, 'Remove image');

    const tasks = lang.FABRICATE.Admin.Manager.Environment.Tasks;
    assert.equal(tasks.DefaultEnvironment, 'Default environment (canvas drop)');
    assert.ok(typeof tasks.DefaultEnvironmentNone === 'string');
    assert.ok(typeof tasks.DefaultEnvironmentHint === 'string');

    const canvas = lang.FABRICATE.Canvas.Interactable;
    assert.ok(canvas.EnvironmentAutoResolved.includes('{environment}'), 'the auto-resolve notification names the environment');
    assert.ok(typeof canvas.EnvironmentDialogTitle === 'string');
    assert.ok(typeof canvas.EnvironmentDialogConfirm === 'string');
  });

  it('shows the per-task DC override only for the selected task routed mode', () => {
    assert.match(editorSource, /resolutionMode\s*=\s*null/, 'an absent override lets the task own its mode');
    assert.match(editorSource, /KNOWN_RESOLUTION_MODES\.has\(task\?\.resolutionMode\)/, 'the editor resolves the task mode');
    assert.match(requirementsSource, /\{#if taskResolutionMode === 'routed'\}\s*<GatheringTaskCheckOverrideCard/, 'the DC card renders only for routed resolution');
    const guardIdx = requirementsSource.indexOf("{#if taskResolutionMode === 'routed'}");
    const dcCardIdx = overrideSource.indexOf('data-gathering-task-dc');
    const dcFieldIdx = overrideSource.indexOf('data-gathering-task-dc-override');
    assert.ok(guardIdx >= 0, 'the DC card is guarded by the routed mode');
    assert.ok(dcCardIdx !== -1, 'the override card is the DC card');
    assert.ok(dcFieldIdx > dcCardIdx, 'the numeric DC override input renders inside it');
  });

  it('persists the DC override through onUpdateTask: null when blank, truncated integer otherwise', () => {
    assert.match(overrideSource, /function updateDcOverride/, 'has a DC override setter');
    assert.match(overrideSource, /onUpdateTask\(\{ dcOverride: null \}\)/, 'a blank DC clears the override (null = system default)');
    assert.match(overrideSource, /dcOverride:\s*Number\.isFinite\(next\)\s*\?\s*Math\.trunc\(next\)\s*:\s*null/, 'a numeric DC is truncated to an integer');
    assert.match(rootSource, /resolutionMode=\{gathering\.gatheringTaskResolutionMode\}/, 'parent passes the selected task mode to the task editor');
  });

  it('adds the per-task DC override i18n keys', () => {
    const keys = lang.FABRICATE.Admin.Manager.Gathering;
    assert.equal(keys.TaskDcOverrideTitle, 'DC override');
    assert.equal(keys.TaskDcOverrideHint, 'Replaces the system DC for this task.');
    assert.equal(keys.TaskDcOverride, 'DC');
    assert.ok(typeof keys.TaskDcOverrideHint === 'string' && keys.TaskDcOverrideHint.length > 0, 'the DC override hint exists');
    assert.ok(typeof keys.TaskDcOverridePlaceholder === 'string' && keys.TaskDcOverridePlaceholder.length > 0, 'the DC override placeholder exists');
  });

  it('adds the node i18n keys', () => {
    const keys = lang.FABRICATE.Admin.Manager.Economy;
    assert.equal(keys.TaskNodesTitle, 'Resource node');
    assert.equal(keys.TaskNodeCount, 'Node count');
    assert.equal(keys.DepleteOnStart, 'On start');
    assert.equal(keys.RespawnManual, 'Manual');
    assert.equal(keys.RespawnOverTime, 'Over world time');
    // issue 301: the nonRegenerating policy reuses the RespawnNone key for its
    // "does not regenerate" label (the legacy `none` policy label is long gone).
    assert.equal(keys.RespawnNone, 'Does not regenerate');
    assert.equal(keys.RespawnGainMode, 'Each interval');
    assert.equal(keys.GainGuaranteed, 'Add one node');
    assert.equal(keys.GainChance, 'Chance to add one');
    assert.equal(keys.GainExpression, 'Roll an amount');
    assert.equal(keys.RespawnChance, 'Chance');
    assert.equal(keys.RespawnAmount, 'Amount per interval');
    // The removed legacy labels are gone.
    assert.equal(keys.RespawnElapsed, undefined);
    assert.equal(keys.RespawnProbability, undefined);
    assert.equal(keys.RespawnManualElapsed, undefined);
  });
});
