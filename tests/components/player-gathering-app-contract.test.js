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
    assert.ok(rootSource.includes('task.label || task.name'));
    assert.ok(rootSource.includes("task.action === 'blindGather'"));
    assert.ok(rootSource.includes('store.startTask(environment.id, task)'));
  });

  it('renders active run, terminal feedback, and history sections with localized labels', () => {
    const rootSource = source(rootPath);

    for (const snippet of [
      "localize('FABRICATE.Gathering.ActiveRuns.Title')",
      "localize('FABRICATE.Gathering.Feedback.Title')",
      "localize('FABRICATE.Gathering.History.Title')",
      '$viewState.activeRuns',
      '$viewState.feedback',
      '$viewState.history',
      'displayRunLabel(run)',
      "localize('FABRICATE.Gathering.BlindTaskLabel')"
    ]) {
      assert.ok(rootSource.includes(snippet), `GatheringAppRoot should include ${snippet}`);
    }

    assert.equal(localeAt('FABRICATE.Gathering.ActiveRuns.Title'), 'Active Gathering');
    assert.equal(localeAt('FABRICATE.Gathering.History.Title'), 'Recent History');
    assert.equal(localeAt('FABRICATE.Gathering.FailureDefault'), 'Gathering produced no results.');
  });

  it('keeps blocked scene/token entries visible with localized blocked reasons', () => {
    const rootSource = source(rootPath);

    assert.ok(rootSource.includes('{#each environment.blockedReasons || [] as reason'));
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

  it('collapses active and history rows to one column in narrow windows', () => {
    const cssSource = source(cssPath);
    const gatheringContainerBlock = atRuleBlocks(cssSource, '@container fabricate-gathering-app')
      .find(block => /\(\s*max-width\s*:\s*520px\s*\)/.test(block));

    assert.match(
      cssSource,
      /\.fabricate-gathering-app\s*\{[^}]*container-name\s*:\s*fabricate-gathering-app\s*;[^}]*container-type\s*:\s*inline-size\s*;/,
      'gathering app should establish an inline-size query container'
    );
    assert.match(
      cssSource,
      /\.gathering-runs-grid\s*\{/,
      'gathering app should define active run grid styles'
    );
    assert.match(
      cssSource,
      /\.gathering-history-list\s*\{/,
      'gathering app should define history list styles'
    );
    assert.ok(
      gatheringContainerBlock,
      'active/history collapse should respond to the gathering app container width'
    );
    assert.equal(
      atRuleBlocks(cssSource, '@media').some(block => /\.(?:gathering-runs-grid|gathering-history-list|gathering-task-row|gathering-run-row|gathering-history-row|gathering-run-meta)/.test(block)),
      false,
      'player gathering responsiveness must be keyed to the app container, not the browser viewport'
    );
    assert.match(
      gatheringContainerBlock,
      /\.gathering-runs-grid,\s*\.gathering-history-list\s*\{[^}]*grid-template-columns\s*:\s*1fr\s*;/,
      'active runs and history should collapse to one column inside the gathering app container query'
    );
    assert.match(
      gatheringContainerBlock,
      /\.gathering-task-row\s*\{[^}]*grid-template-columns\s*:\s*36px\s+minmax\(0,\s*1fr\)\s*;/,
      'narrow task rows should reserve the full rendered task icon width'
    );
    assert.match(
      cssSource,
      /\.gathering-run-row\s+strong,\s*\.gathering-history-row\s+strong\s*\{[^}]*overflow-wrap\s*:\s*anywhere\s*;/,
      'active/history labels should wrap instead of forcing horizontal overflow'
    );
    assert.match(
      gatheringContainerBlock,
      /\.gathering-run-row,\s*\.gathering-history-row\s*\{[^}]*flex-direction\s*:\s*column\s*;/,
      'active/history rows should stack their metadata at the narrow breakpoint'
    );
    assert.match(
      gatheringContainerBlock,
      /\.gathering-run-meta\s*\{[^}]*align-items\s*:\s*flex-start\s*;[^}]*text-align\s*:\s*left\s*;/,
      'stacked active-run metadata should remain readable in one-column layout'
    );
  });
});
