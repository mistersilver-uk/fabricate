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

const editorSource = readFileSync(editorPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('Gathering task editor — economy sections are mode-gated and carded', () => {
  it('accepts an economyMode prop (default none)', () => {
    assert.match(editorSource, /economyMode\s*=\s*'none'/, 'editor should declare an economyMode prop defaulting to none');
  });

  it('shows the stamina cost card only in stamina mode', () => {
    const guardIdx = editorSource.indexOf("{#if economyMode === 'stamina'}");
    const staminaIdx = editorSource.indexOf('data-gathering-task-stamina');
    assert.ok(guardIdx >= 0, 'stamina section should be guarded by economyMode === stamina');
    assert.ok(staminaIdx > guardIdx, 'the stamina card should render inside the stamina-mode guard');
  });

  it('shows the resource node card only in nodes mode', () => {
    const guardIdx = editorSource.indexOf("{#if economyMode === 'nodes'}");
    const nodesIdx = editorSource.indexOf('data-gathering-task-nodes');
    assert.ok(guardIdx >= 0, 'node section should be guarded by economyMode === nodes');
    assert.ok(nodesIdx > guardIdx, 'the node card should render inside the nodes-mode guard');
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
    assert.match(editorSource, /intervalSeconds:[^}]*\*\s*size/, 'interval is stored in seconds (value × unit)');
  });

  it('gives both economy sections card chrome', () => {
    assert.match(
      editorSource,
      /\.manager-task-stamina-card,\s*\.manager-task-nodes-card\s*\{[^}]*border:[^}]*background:[^}]*\}/,
      'stamina and node sections share card chrome (border + background)'
    );
  });

  it('wires the economy mode from the parent', () => {
    assert.match(rootSource, /selectedGatheringTaskEconomyMode\s*=\s*\$derived\(selectedGatheringSystemConfig\.economy\?\.mode/, 'parent derives the mode from the system economy block');
    assert.match(rootSource, /economyMode=\{selectedGatheringTaskEconomyMode\}/, 'parent passes economyMode to the task editor');
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
