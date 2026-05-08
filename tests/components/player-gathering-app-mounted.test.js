import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { createGatheringStore } from '../../src/ui/svelte/stores/gatheringStore.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');
let tempRoot;
let Component;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

async function waitForText(value) {
  for (let index = 0; index < 20; index += 1) {
    await tick();
    flushSync();
    if (target?.textContent?.includes(value)) return;
    await delay(0);
  }
  assert.fail(`Expected mounted Gathering app text to include "${value}". Rendered text: ${target?.textContent || ''}`);
}

function makeStore(calls = []) {
  const actor = { id: 'actor-a', uuid: 'Actor.actor-a', name: 'Alara', img: 'alara.webp' };
  return createGatheringStore({
    getSetting: () => '',
    setSetting: async () => {},
    getAvailableActors: () => [actor],
    listGatheringForActor: async () => ({
      visible: true,
      attemptable: true,
      blockedReasons: [],
      state: 'ready',
      selectedActorId: actor.id,
      environments: [
        {
          id: 'env-a',
          name: 'Sunbloom Meadows',
          description: 'Warm grasslands.',
          img: 'sunbloom.webp',
          region: 'Elderglen Valley',
          biome: 'Grassland',
          risk: 'safe',
          attemptable: true,
          blockedReasons: [],
          conditions: { timeOfDay: 'Day', weather: 'Clear', visibility: 'Good' },
          tasks: [
            {
              id: 'task-a',
              name: 'Harvest Wild Herbs',
              label: 'Harvest Wild Herbs',
              description: 'Gather medicinal plants.',
              img: 'herb.webp',
              attemptable: true,
              blockedReasons: [],
              requirementsSummary: 'No tools required',
              rich: {
                stamina: {
                  cost: 8,
                  state: { current: 96, max: 120, provider: 'fabricate', regenerationMode: 'manual' }
                },
                nodes: { available: true, current: 4, max: 4 }
              },
              potentialResults: [{ id: 'result-a', name: 'Silverleaf', img: 'silverleaf.webp', rarity: 'Common' }]
            }
          ]
        },
        {
          id: 'env-b',
          name: 'Cinderfall Wastes',
          description: 'Ashen expanse.',
          img: 'cinderfall.webp',
          region: 'Ashen Expanse',
          biome: 'Wasteland',
          risk: 'extreme',
          attemptable: false,
          blockedReasons: [{ code: 'SCENE_TOKEN_BLOCKED', message: 'Move to the linked scene.' }],
          tasks: [{ action: 'blindGather', label: 'Gather', blind: true, attemptable: false, blockedReasons: [] }]
        }
      ],
      activeRuns: [{ id: 'run-a', label: 'Harvest Wild Herbs', status: 'waitingTime', environmentName: 'Sunbloom Meadows' }],
      history: [{ id: 'run-b', label: 'Harvest Wild Herbs', status: 'succeeded', environmentName: 'Sunbloom Meadows', createdResultCount: 1, usedCatalystCount: 0 }]
    }),
    startGatheringAttempt: async options => {
      calls.push(options);
      return { accepted: true, started: true, state: 'succeeded', blockedReasons: [] };
    },
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    localize: (key, data) => {
      const labels = {
        'FABRICATE.Gathering.Title': 'Gathering',
        'FABRICATE.Gathering.Subtitle': 'Choose an actor and gather from available environments.',
        'FABRICATE.Gathering.Tabs.Environments': 'Environments',
        'FABRICATE.Gathering.Tabs.Log': 'Gathering Log',
        'FABRICATE.Gathering.Empty.SelectEnvironmentForTasks': 'Select an environment to view its gathering tasks.',
        'FABRICATE.Gathering.Empty.SelectEnvironmentForDetails': 'Select an environment to view its details.',
        'FABRICATE.Gathering.Pagination.ShowingEnvironments': `Showing ${data?.start}-${data?.end} of ${data?.total} environments`,
        'FABRICATE.Gathering.Pagination.PreviousPage': 'Previous environment page',
        'FABRICATE.Gathering.Pagination.NextPage': 'Next environment page',
        'FABRICATE.Gathering.Pagination.Environments': 'Environment pages',
        'FABRICATE.Gathering.EnvironmentImagePlaceholder': 'Environment image placeholder',
        'FABRICATE.Gathering.StartGathering': 'Start Gathering',
        'FABRICATE.Gathering.Risk.safe': 'Safe',
        'FABRICATE.Gathering.Risk.extreme': 'Extreme',
        'FABRICATE.Gathering.StaminaSummary': `Stamina ${data?.current}/${data?.max}`,
        'FABRICATE.Gathering.StaminaCost': `${data?.cost} stamina`,
        'FABRICATE.Gathering.NodeCount': `${data?.current}/${data?.max} nodes`,
        'FABRICATE.Gathering.History.SucceededSummary': `${data?.results} results, ${data?.catalysts} catalysts used`
      };
      return labels[key] || key;
    }
  });
}

describe('player Gathering V2 app mounted behavior', () => {
  before(async () => {
    setupDOM();
    const labels = {
      'FABRICATE.Gathering.Title': 'Gathering',
      'FABRICATE.Gathering.Subtitle': 'Choose an actor and gather from available environments.',
      'FABRICATE.Gathering.Actor': 'Actor',
      'FABRICATE.Gathering.SelectedActor': 'Selected gathering actor',
      'FABRICATE.Gathering.Tabs.Environments': 'Environments',
      'FABRICATE.Gathering.Tabs.Log': 'Gathering Log',
      'FABRICATE.Gathering.Navigation': 'Gathering navigation',
      'FABRICATE.Gathering.EnvironmentBrowser': 'Environment browser',
      'FABRICATE.Gathering.EnvironmentList': 'Gathering environments',
      'FABRICATE.Gathering.EnvironmentDetail': 'Environment detail',
      'FABRICATE.Gathering.EnvironmentImagePlaceholder': 'Environment image placeholder',
      'FABRICATE.Gathering.TaskList': 'Gathering tasks',
      'FABRICATE.Gathering.GatheringTasks': 'Gathering Tasks',
      'FABRICATE.Gathering.ActiveTask': 'Active Task',
      'FABRICATE.Gathering.StartGathering': 'Start Gathering',
      'FABRICATE.Gathering.Risk.safe': 'Safe',
      'FABRICATE.Gathering.Risk.extreme': 'Extreme',
      'FABRICATE.Gathering.Stamina': 'Gathering stamina',
      'FABRICATE.Gathering.StaminaSummary': 'Stamina {current}/{max}',
      'FABRICATE.Gathering.StaminaCost': '{cost} stamina',
      'FABRICATE.Gathering.NodeCount': '{current}/{max} nodes',
      'FABRICATE.Gathering.ActiveRuns.Title': 'Active Gathering',
      'FABRICATE.Gathering.History.Title': 'Recent History',
      'FABRICATE.Gathering.History.SucceededSummary': '{results} results, {catalysts} catalysts used',
      'FABRICATE.Gathering.Feedback.Title': 'Last Attempt',
      'FABRICATE.Gathering.Feedback.Succeeded': 'Gathering succeeded.',
      'FABRICATE.Gathering.Notifications.Succeeded': 'Gathering succeeded.',
      'FABRICATE.Gathering.Requirements': 'Requirements',
      'FABRICATE.Gathering.PotentialResults': 'Potential Results',
      'FABRICATE.Gathering.NoToolsRequired': 'No tools required',
      'FABRICATE.Gathering.NoRegion': 'Uncharted region',
      'FABRICATE.Gathering.Biome': 'Biome',
      'FABRICATE.Gathering.Condition.Time': 'Time',
      'FABRICATE.Gathering.Condition.Weather': 'Weather',
      'FABRICATE.Gathering.Condition.Visibility': 'Visibility',
      'FABRICATE.Gathering.Empty.SelectEnvironmentForTasks': 'Select an environment to view its gathering tasks.',
      'FABRICATE.Gathering.Empty.SelectEnvironmentForDetails': 'Select an environment to view its details.',
      'FABRICATE.Gathering.Pagination.ShowingEnvironments': 'Showing {start}-{end} of {total} environments',
      'FABRICATE.Gathering.Pagination.PreviousPage': 'Previous environment page',
      'FABRICATE.Gathering.Pagination.NextPage': 'Next environment page',
      'FABRICATE.Gathering.Pagination.Environments': 'Environment pages',
      'FABRICATE.Gathering.Availability.All': 'All availability',
      'FABRICATE.Gathering.Availability.Available': 'Available',
      'FABRICATE.Gathering.Availability.Blocked': 'Blocked',
      'FABRICATE.Gathering.Availability.Empty': 'No tasks',
      'FABRICATE.Gathering.SearchPlaceholder': 'Search environments...',
      'FABRICATE.Gathering.RiskFilter': 'Filter by risk',
      'FABRICATE.Gathering.AvailabilityFilter': 'Filter by availability',
      'FABRICATE.Gathering.RegionFilter': 'Filter by region',
      'FABRICATE.Gathering.BiomeFilter': 'Filter by biome',
      'FABRICATE.Gathering.AllRisks': 'All risks',
      'FABRICATE.Gathering.AllRegions': 'All regions',
      'FABRICATE.Gathering.AllBiomes': 'All biomes',
      'FABRICATE.Gathering.Status.waitingTime': 'Waiting',
      'FABRICATE.Gathering.Status.succeeded': 'Succeeded'
    };
    globalThis.game = {
      i18n: {
        localize: key => labels[key] || key,
        format: (key, data) => (labels[key] || key).replace(/\{(\w+)\}/g, (_, name) => data?.[name] ?? '')
      }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-gathering-app-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    writeCompiledSvelte('src/ui/svelte/apps/GatheringAppRoot.svelte');
    const utilDestination = join(tempRoot, 'src/ui/svelte/util/foundryBridge.js');
    mkdirSync(dirname(utilDestination), { recursive: true });
    writeFileSync(
      utilDestination,
      readFileSync(resolve(repoRoot, 'src/ui/svelte/util/foundryBridge.js'), 'utf8')
    );
    Component = (await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/GatheringAppRoot.svelte.js')).href)).default;
  });

  after(() => {
    delete globalThis.game;
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
  });

  afterEach(() => {
    if (mounted) unmount(mounted);
    mounted = null;
    target = null;
  });

  it('selects environments, switches log tab, and dispatches start attempts', async () => {
    const calls = [];
    const store = makeStore(calls);
    target = document.createElement('div');
    document.body.appendChild(target);

    mounted = mount(Component, { target, props: { store } });
    await store.refresh();

    await waitForText('Sunbloom Meadows');
    await waitForText('Harvest Wild Herbs');
    assert.equal(target.textContent.includes('Select an environment to view its gathering tasks.'), false);
    assert.equal(target.textContent.includes('Select an environment to view its details.'), false);
    assert.ok(target.textContent.includes('Showing 1-2 of 2 environments'));

    const sunbloomInitial = Array.from(target.querySelectorAll('.gathering-v2-environment-row'))
      .find(button => button.textContent.includes('Sunbloom Meadows'));
    sunbloomInitial.click();
    await tick();
    flushSync();

    assert.ok(target.textContent.includes('Harvest Wild Herbs'));
    assert.ok(target.textContent.includes('Silverleaf'));

    const cinderfall = Array.from(target.querySelectorAll('.gathering-v2-environment-row'))
      .find(button => button.textContent.includes('Cinderfall Wastes'));
    cinderfall.click();
    await tick();
    flushSync();
    assert.equal(target.textContent.includes('Silverleaf'), false);
    assert.ok(target.textContent.includes('Gather'));

    const logTab = Array.from(target.querySelectorAll('.gathering-v2-tabs button'))
      .find(button => button.textContent.includes('Gathering Log'));
    logTab.click();
    await tick();
    flushSync();
    assert.ok(target.textContent.includes('Active Gathering'));
    assert.ok(target.textContent.includes('Recent History'));

    const environmentsTab = Array.from(target.querySelectorAll('.gathering-v2-tabs button'))
      .find(button => button.textContent.includes('Environments'));
    environmentsTab.click();
    await tick();
    flushSync();

    const sunbloom = Array.from(target.querySelectorAll('.gathering-v2-environment-row'))
      .find(button => button.textContent.includes('Sunbloom Meadows'));
    sunbloom.click();
    await tick();
    flushSync();

    target.querySelector('.gathering-start-button').click();
    await tick();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].environmentId, 'env-a');
    assert.equal(calls[0].taskId, 'task-a');
  });
});
