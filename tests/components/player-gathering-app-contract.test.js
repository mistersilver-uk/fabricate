import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPath = resolve(__dirname, '../../src/ui/svelte/apps/GatheringAppRoot.svelte');
const appPath = resolve(__dirname, '../../src/ui/SvelteGatheringApp.svelte.js');
const storePath = resolve(__dirname, '../../src/ui/svelte/stores/gatheringStore.js');
const mainPath = resolve(__dirname, '../../src/main.js');
const localePath = resolve(__dirname, '../../lang/en.json');
const cssPath = resolve(__dirname, '../../styles/fabricate.css');

function source(path) {
  return readFileSync(path, 'utf8');
}

function localeAt(path) {
  return path.split('.').reduce((node, segment) => node?.[segment], JSON.parse(source(localePath)));
}

function atRuleBlocks(sourceText, prefix) {
  const blocks = [];
  let searchFrom = 0;
  while (searchFrom < sourceText.length) {
    const start = sourceText.indexOf(prefix, searchFrom);
    if (start < 0) break;
    const blockStart = sourceText.indexOf('{', start);
    if (blockStart < 0) break;
    let depth = 0;
    let end = blockStart;
    for (; end < sourceText.length; end += 1) {
      if (sourceText[end] === '{') depth += 1;
      if (sourceText[end] === '}') depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
    blocks.push(sourceText.slice(start, end));
    searchFrom = end;
  }
  return blocks;
}

describe('player gathering app source contract', () => {
  it('registers a dedicated Svelte gathering app instead of reusing crafting', () => {
    const appSource = source(appPath);
    assert.ok(appSource.includes('GatheringAppRoot'));
    assert.ok(appSource.includes('createGatheringStore'));
    assert.ok(appSource.includes('registerSvelteGatheringApp(SvelteGatheringApp)'));
    assert.ok(appSource.includes("id: 'fabricate-gathering'"));
    assert.ok(appSource.includes('width: 1520'));
    assert.ok(!appSource.includes('createCraftingStore'));
  });

  it('wires gathering runtime calls through injected services', () => {
    const appSource = source(appPath);
    const storeSource = source(storePath);

    for (const snippet of [
      'listGatheringForActor: options => game?.fabricate?.listGatheringForActor?.(options)',
      'startGatheringAttempt: options => game?.fabricate?.startGatheringAttempt?.(options)',
      'getAvailableActors: () => normalizeFoundryCollection(game?.actors).filter(actor =>',
      'isGatheringActorSelectableByUser(actor, game?.user)'
    ]) {
      assert.ok(appSource.includes(snippet), `SvelteGatheringApp should include ${snippet}`);
    }

    assert.ok(storeSource.includes('listGatheringForActor({ actor })'));
    assert.ok(storeSource.includes('startGatheringAttempt({'));
    assert.ok(!storeSource.includes('game.'));
    assert.ok(!storeSource.includes('globalThis.'));
  });

  it('renders targeted task names but blind tasks through localized generic labels', () => {
    const rootSource = source(rootPath);

    assert.ok(rootSource.includes('displayTaskLabel(task)'));
    assert.ok(rootSource.includes("localize('FABRICATE.Gathering.BlindTaskLabel')"));
    assert.ok(rootSource.includes('task?.label || task?.name'));
    assert.ok(rootSource.includes("task?.action === 'blindGather'"));
    assert.ok(rootSource.includes('store.startTask(activeEnvironment.id, task)'));
  });

  it('renders active run, terminal feedback, and history sections with localized labels', () => {
    const rootSource = source(rootPath);

    for (const snippet of [
      "localize('FABRICATE.Gathering.ActiveRuns.Title')",
      "localize('FABRICATE.Gathering.Feedback.Title')",
      "localize('FABRICATE.Gathering.History.Title')",
      "localize('FABRICATE.Gathering.Tabs.Environments')",
      "localize('FABRICATE.Gathering.Tabs.Log')",
      "localize('FABRICATE.Gathering.ActiveTask')",
      "localize('FABRICATE.Gathering.SystemFilter')",
      "localize('FABRICATE.Gathering.AllSystems')",
      '$viewState.activeRuns',
      '$viewState.feedback',
      '$viewState.history',
      '$viewState.activeTab',
      '$viewState.selectedEnvironmentId',
      '$viewState.selectedTaskKey',
      '$viewState.hasMultipleGatheringSystems',
      "localize('FABRICATE.Gathering.Empty.SelectEnvironmentForTasks')",
      "localize('FABRICATE.Gathering.Empty.SelectEnvironmentForDetails')",
      'displayRunLabel(run)',
      "localize('FABRICATE.Gathering.BlindTaskLabel')",
      'store.selectSystem(event.target.value)'
    ]) {
      assert.ok(rootSource.includes(snippet), `GatheringAppRoot should include ${snippet}`);
    }

    assert.equal(localeAt('FABRICATE.Gathering.ActiveRuns.Title'), 'Active Gathering');
    assert.equal(localeAt('FABRICATE.Gathering.History.Title'), 'Recent History');
    assert.equal(localeAt('FABRICATE.Gathering.SystemFilter'), 'Filter by crafting system');
    assert.equal(localeAt('FABRICATE.Gathering.AllSystems'), 'All systems');
    assert.equal(localeAt('FABRICATE.Gathering.FailureDefault'), 'Gathering produced no results.');
    assert.equal(localeAt('FABRICATE.Gathering.Tabs.Environments'), 'Environments');
    assert.equal(localeAt('FABRICATE.Gathering.Tabs.Log'), 'Gathering Log');
    assert.equal(
      localeAt('FABRICATE.Gathering.Empty.SelectEnvironmentForTasks'),
      'Select an environment to view its gathering tasks.'
    );
  });

  it('keeps blocked scene/token entries visible with localized blocked reasons', () => {
    const rootSource = source(rootPath);

    assert.ok(rootSource.includes('{#each activeEnvironment.blockedReasons || [] as reason'));
    assert.ok(rootSource.includes('{#each task.blockedReasons || [] as reason'));
    assert.ok(rootSource.includes('reason.message || localize(reason.messageKey)'));
    assert.ok(rootSource.includes('disabled={task.attemptable !== true'));
    assert.equal(
      localeAt('FABRICATE.Gathering.Blocked.SceneTokenBlocked'),
      'Gathering is blocked by the linked scene or token position.'
    );
    assert.equal(
      localeAt('FABRICATE.Gathering.Blocked.TokenMissing'),
      'Move the selected actor token to this environment scene before gathering.'
    );
  });

  it('adds the Items Directory Gathering action only behind gathering feature gating', () => {
    const mainSource = source(mainPath);

    assert.ok(mainSource.includes('getGatheringAppClass'));
    assert.ok(mainSource.includes("import './ui/SvelteGatheringApp.svelte.js';"));
    assert.ok(mainSource.includes("Hooks.on('fabricate.craftingSystemsChanged'"));
    assert.ok(mainSource.includes('syncGatheringDirectoryButton'));
    assert.ok(mainSource.includes('function hasGatheringEnabledSystems()'));
    assert.ok(mainSource.includes('system?.features?.gathering === true'));
    assert.ok(mainSource.includes("createHeaderButton('Gathering', 'fas fa-leaf', 'gathering'"));
    assert.ok(mainSource.includes('getGatheringAppClass().show()'));
  });

  it('uses the V2 three-pane gathering shell and shared V2 tokens', () => {
    const cssSource = source(cssPath);
    const rootSource = source(rootPath);
    const gatheringContainerBlock = atRuleBlocks(cssSource, '@container fabricate-gathering-app')
      .find(block => /\(\s*max-width\s*:\s*1120px\s*\)/.test(block));

    for (const snippet of [
      'gathering-v2-header',
      'gathering-v2-workspace',
      'gathering-v2-environment-browser',
      'gathering-v2-task-panel',
      'gathering-v2-detail-panel',
      'gathering-v2-pagination',
      'pagedEnvironments',
      'gathering-v2-tabs',
      'potentialResults'
    ]) {
      assert.ok(rootSource.includes(snippet), `GatheringAppRoot should include ${snippet}`);
    }

    assert.match(
      cssSource,
      /\.fabricate-gathering-app\s*\{[^}]*container-name\s*:\s*fabricate-gathering-app\s*;[^}]*container-type\s*:\s*inline-size\s*;/,
      'gathering app should establish an inline-size query container'
    );
    assert.ok(
      !rootSource.includes('terrain-forest.webp'),
      'gathering app should not request the missing terrain-forest fallback asset'
    );
    assert.match(
      cssSource,
      /--gathering-bg\s*:\s*var\(--fab-v2-bg\)/,
      'gathering app should consume shared configurable V2 CSS variables'
    );
    assert.match(
      cssSource,
      /\.gathering-v2-workspace\s*\{[^}]*grid-template-columns\s*:\s*minmax\(330px,\s*0\.95fr\)\s+minmax\(430px,\s*1\.15fr\)\s+minmax\(390px,\s*1fr\)/,
      'gathering app should define the Image #1 inspired three-pane workspace'
    );
    assert.ok(
      gatheringContainerBlock,
      'V2 workspace should respond to the gathering app container width'
    );
    assert.match(
      gatheringContainerBlock,
      /\.gathering-v2-header,\s*\.gathering-v2-workspace,\s*\.gathering-v2-log\s*\{[^}]*grid-template-columns\s*:\s*1fr\s*;/,
      'V2 shell should collapse to one column inside the gathering app container query'
    );
  });
});
