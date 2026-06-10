import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');

const cssPath = resolve(repoRoot, 'styles/fabricate.css');

const editorSource = readFileSync(editorPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const cssSource = readFileSync(cssPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('Gathering task editor — economy sections are flag-gated and carded', () => {
  it('accepts independent staminaEnabled / nodesEnabled props (default false)', () => {
    assert.match(editorSource, /staminaEnabled\s*=\s*false/, 'editor should declare a staminaEnabled prop defaulting to false');
    assert.match(editorSource, /nodesEnabled\s*=\s*false/, 'editor should declare a nodesEnabled prop defaulting to false');
    // The single mode prop is gone.
    assert.ok(!/economyMode\s*=\s*'none'/.test(editorSource), 'the old economyMode prop is removed');
  });

  it('shows the stamina cost card only when stamina is enabled', () => {
    const guardIdx = editorSource.indexOf('{#if staminaEnabled}');
    const staminaIdx = editorSource.indexOf('data-gathering-task-stamina');
    assert.ok(guardIdx >= 0, 'stamina section should be guarded by staminaEnabled');
    assert.ok(staminaIdx > guardIdx, 'the stamina card should render inside the staminaEnabled guard');
  });

  it('shows the resource node card only when nodes are enabled', () => {
    const guardIdx = editorSource.indexOf('{#if nodesEnabled}');
    const nodesIdx = editorSource.indexOf('data-gathering-task-nodes');
    assert.ok(guardIdx >= 0, 'node section should be guarded by nodesEnabled');
    assert.ok(nodesIdx > guardIdx, 'the node card should render inside the nodesEnabled guard');
  });

  it('renders both economy cards independently (both guards present, no shared else)', () => {
    // The two cards are gated by two independent {#if} blocks, so both render
    // when both flags are on (the anti-dogpiling combination). The stamina guard
    // is NOT chained to the nodes guard.
    const staminaGuard = editorSource.indexOf('{#if staminaEnabled}');
    const nodesGuard = editorSource.indexOf('{#if nodesEnabled}');
    assert.ok(staminaGuard >= 0 && nodesGuard >= 0, 'both flag guards exist');
    assert.ok(staminaGuard < nodesGuard, 'the stamina guard precedes the nodes guard');
  });

  it('shows the guidance hint in the {:else} of the nodes guard (nodes disabled)', () => {
    // The hint now lives in the {:else} of the nodesEnabled guard, so it renders
    // whenever resource nodes are off — independent of the stamina toggle.
    const guardIdx = editorSource.indexOf('{#if nodesEnabled}');
    const elseIdx = editorSource.indexOf('{:else}\n    <section class="manager-task-nodes-card manager-task-nodes-hint-card"', guardIdx);
    const hintIdx = editorSource.indexOf('data-gathering-task-nodes-hint');
    assert.ok(elseIdx > guardIdx, 'the nodes guard has an else branch carrying the hint');
    assert.ok(hintIdx > elseIdx, 'the guidance hint renders inside the else (nodes-disabled) branch');
    assert.match(editorSource, /FABRICATE\.Admin\.Manager\.Economy\.TaskNodesEconomyHint/, 'the hint uses the dedicated guidance key');
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
      assert.ok(editorSource.includes(attr), `node card should expose ${attr}`);
    }
    // The two simplified respawn policies are offered.
    for (const policy of ['"manual"', '"overTime"']) {
      assert.ok(editorSource.includes(`value=${policy}`), `respawn select should offer policy ${policy}`);
    }
    // The three over-time gain modes are offered.
    for (const gainMode of ['"guaranteed"', '"chance"', '"expression"']) {
      assert.ok(editorSource.includes(`value=${gainMode}`), `gain-mode select should offer ${gainMode}`);
    }
    // The removed legacy policies are gone.
    for (const policy of ['"none"', '"elapsedTime"', '"probability"', '"manualAndElapsedTime"']) {
      assert.ok(!editorSource.includes(`value=${policy}`), `respawn select should no longer offer policy ${policy}`);
    }
  });

  it('persists node edits through onUpdateTask with sensible normalization', () => {
    assert.match(editorSource, /function setNodeCount/, 'has a node-count setter');
    assert.match(editorSource, /onUpdateTask\(\{ nodes: null \}\)/, 'blank/zero count clears the node config');
    assert.match(editorSource, /current:\s*max/, 'authoring starts a node pool full (current = max)');
    assert.match(editorSource, /chance:[^}]*next\s*\/\s*100/, 'chance is stored as a 0..1 fraction (÷100)');
    assert.match(editorSource, /Math\.min\(1,\s*Math\.max\(0,/, 'chance is clamped to 0..1');
    assert.match(editorSource, /intervalUnit,\s*intervalAmount:/, 'interval is stored as unit + amount (calendar-aware at runtime)');
  });

  it('gives both economy sections card chrome', () => {
    assert.match(
      editorSource,
      /\.manager-task-stamina-card,\s*\.manager-task-nodes-card\s*\{[^}]*border:[^}]*background:[^}]*\}/,
      'stamina and node sections share card chrome (border + background)'
    );
  });

  it('wires the two economy flags from the parent', () => {
    assert.match(rootSource, /selectedGatheringTaskStaminaEnabled\s*=\s*\$derived/, 'parent derives stamina-enabled from the system economy block');
    assert.match(rootSource, /selectedGatheringTaskNodesEnabled\s*=\s*\$derived/, 'parent derives nodes-enabled from the system economy block');
    assert.match(rootSource, /staminaEnabled=\{selectedGatheringTaskStaminaEnabled\}/, 'parent passes staminaEnabled to the task editor');
    assert.match(rootSource, /nodesEnabled=\{selectedGatheringTaskNodesEnabled\}/, 'parent passes nodesEnabled to the task editor');
  });

  it('authors depletedBehavior with a FilePicker swap-image (swap is the only behavior; no delete, no postfix)', () => {
    // Only the swap-image picker survives — the "delete the linked marker" toggle
    // and its warning chip were removed, and the postfix toggle is not offered for
    // canvas tiles (tiles have no nameplate).
    for (const attr of [
      'data-gathering-task-depleted-behavior',
      'data-gathering-task-depleted-image'
    ]) {
      assert.ok(editorSource.includes(attr), `depleted-behavior block should expose ${attr}`);
    }
    for (const removed of [
      'data-gathering-task-depleted-delete',
      'data-gathering-task-depleted-warning',
      'data-gathering-task-depleted-postfix',
      'depletedDeleteToken',
      'toggleDepletedDelete'
    ]) {
      assert.ok(!editorSource.includes(removed), `the delete behavior is removed: ${removed} must not appear`);
    }

    // The swap-image control is wired to the FilePicker service (onPickImagePath),
    // not a free-text input.
    assert.match(editorSource, /async function chooseDepletedImage/, 'swap-image uses the FilePicker via onPickImagePath');
    assert.match(editorSource, /onPickImagePath\(depletedSwapImage/, 'the depleted image picker calls onPickImagePath');
  });

  it('puts the swap-image picker inline with the title/hint and the clear control below the image (plus right-click clears)', () => {
    // Title/hint and the image sit on one row.
    const rowIdx = editorSource.indexOf('manager-task-depleted-row');
    const copyIdx = editorSource.indexOf('manager-task-depleted-copy');
    const imageColIdx = editorSource.indexOf('data-gathering-task-depleted-image-column');
    assert.ok(rowIdx >= 0, 'an inline row wraps the depleted-behavior block');
    assert.ok(copyIdx > rowIdx && imageColIdx > rowIdx, 'the title/hint copy and the image column both sit inside the inline row');

    // The remove control is a button BELOW the thumbnail (inside the image column,
    // after the picker button).
    const pickerIdx = editorSource.indexOf('data-gathering-task-depleted-image');
    const clearIdx = editorSource.indexOf('data-gathering-task-depleted-image-clear');
    assert.ok(clearIdx > pickerIdx, 'the remove-image button renders after (below) the picker thumbnail');
    assert.match(editorSource, /class="manager-link-button manager-task-depleted-image-clear"/, 'the remove control is a labelled button below the image');

    // Right-click on the thumbnail clears it (oncontextmenu prevents the default menu).
    assert.match(editorSource, /oncontextmenu=\{onDepletedImageContextMenu\}/, 'the thumbnail wires a context-menu (right-click) clear');
    assert.match(editorSource, /function onDepletedImageContextMenu\(event\)\s*\{[\s\S]*?event\.preventDefault\(\)/, 'the context-menu handler prevents the default menu');
  });

  it('positions the depleted picker pen as a corner badge and the empty-state placeholder centered (no overlap)', () => {
    // Empty state: a centered fa-image placeholder shown only when no swap image
    // is set; the fa-pen edit affordance is the bottom-right badge over either
    // the placeholder or the <img>. The fix is in the SHARED .manager-task-image-picker
    // rule so every picker (task identity, hazard, depleted) gets the same treatment.
    const pickerIdx = editorSource.indexOf('manager-task-depleted-image-picker');
    const pickerBlock = editorSource.slice(pickerIdx, editorSource.indexOf('</button>', pickerIdx));
    assert.ok(
      pickerBlock.includes('{#if depletedSwapImage}') && pickerBlock.includes('<img src={depletedSwapImage}'),
      'the picker renders the swap <img> when an image is set'
    );
    assert.ok(
      pickerBlock.includes('<i class="fas fa-image" aria-hidden="true">'),
      'the picker renders the fa-image placeholder when no image is set'
    );
    assert.ok(
      pickerBlock.includes('<i class="fas fa-pen" aria-hidden="true">'),
      'the picker always renders the fa-pen edit affordance'
    );

    // Shared CSS: the pen (and the scene-locked variant) is pinned to the
    // bottom-right corner; the placeholder centers itself with a full-box absolute
    // flex layer (inset:0 + center) so it stays centered even when Foundry's global
    // button styles override the picker's own flex — without that, the glyph drifts
    // into the corner and overlaps the pen.
    assert.match(
      cssSource,
      /\.manager-task-image-picker \.fa-pen[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*5px/,
      'the pen badge is pinned to the bottom-right corner in the shared rule'
    );
    const placeholderRule = cssSource.slice(cssSource.indexOf('.manager-task-image-picker .fa-image'));
    const placeholderBlock = placeholderRule.slice(0, placeholderRule.indexOf('}'));
    assert.match(placeholderBlock, /position:\s*absolute/, 'the placeholder uses an absolute layer so its centering is independent of the button display');
    assert.match(placeholderBlock, /inset:\s*0/, 'the absolute layer fills the whole box (so margin/flex centering is box-relative, not corner-pinned)');
    assert.match(placeholderBlock, /justify-content:\s*center/, 'the placeholder glyph is centered horizontally');
    assert.ok(!placeholderBlock.includes('bottom: 5px'), 'the placeholder is NOT corner-pinned like the pen badge (no overlap)');
    assert.match(placeholderBlock, /font-size:\s*1\.8rem/, 'the placeholder icon is larger than the corner badge');
  });

  it('authors the optional defaultEnvironmentId select wired from the parent', () => {
    assert.ok(editorSource.includes('data-gathering-task-field="defaultEnvironmentId"'), 'a default-environment select is present');
    assert.match(editorSource, /function setDefaultEnvironment/, 'has a default-environment setter');
    assert.match(editorSource, /defaultEnvironmentId: id \|\| null/, 'the setter coerces empty to null');
    // The parent feeds the system environments into the editor.
    assert.match(rootSource, /selectedSystemEnvironmentOptions\s*=\s*\$derived/, 'parent derives the system environment options');
    assert.match(rootSource, /environmentOptions=\{selectedSystemEnvironmentOptions\}/, 'parent passes environmentOptions to the task editor');
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

  it('adds the node i18n keys', () => {
    const keys = lang.FABRICATE.Admin.Manager.Economy;
    assert.equal(keys.TaskNodesTitle, 'Resource node');
    assert.equal(keys.TaskNodeCount, 'Node count');
    assert.equal(keys.DepleteOnStart, 'On start');
    assert.equal(keys.RespawnManual, 'Manual');
    assert.equal(keys.RespawnOverTime, 'Over world time');
    assert.equal(keys.RespawnGainMode, 'Each interval');
    assert.equal(keys.GainGuaranteed, 'Add one node');
    assert.equal(keys.GainChance, 'Chance to add one');
    assert.equal(keys.GainExpression, 'Roll an amount');
    assert.equal(keys.RespawnChance, 'Chance');
    assert.equal(keys.RespawnAmount, 'Amount per interval');
    // The removed legacy labels are gone.
    assert.equal(keys.RespawnNone, undefined);
    assert.equal(keys.RespawnElapsed, undefined);
    assert.equal(keys.RespawnProbability, undefined);
    assert.equal(keys.RespawnManualElapsed, undefined);
  });
});
