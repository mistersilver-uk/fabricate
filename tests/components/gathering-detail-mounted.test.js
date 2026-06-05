import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let GatheringView;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
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

function taskModel(overrides = {}) {
  return {
    id: 'task-1',
    name: 'Gather Iron',
    description: 'Dig for ore.',
    img: 'icons/svg/item-bag.svg',
    attemptable: true,
    blockedReasons: [],
    successChance: 0.5,
    ...overrides
  };
}

function environment(overrides = {}) {
  return {
    id: 'env-meadow',
    name: 'Sunlit Meadow',
    img: 'icons/svg/sun.svg',
    description: 'A gently rolling field.',
    locked: false,
    selectionMode: 'targeted',
    revealPolicy: 'never',
    region: 'Greenvale',
    risk: 'safe',
    attemptable: true,
    discoveredTaskCount: 0,
    composedTaskCount: 0,
    biomeTags: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }],
    tasks: [taskModel()],
    discoveredTasks: [],
    ...overrides
  };
}

function listing(environments) {
  return {
    visible: true,
    selectedActorId: 'Actor.actor-1',
    environments
  };
}

function makeServices(result) {
  const calls = { list: 0, attempts: [] };
  const services = {
    listGatheringForActor: () => {
      calls.list += 1;
      return Promise.resolve(result);
    },
    startGatheringAttempt: (opts) => {
      calls.attempts.push(opts);
      return Promise.resolve({ accepted: true });
    }
  };
  return { services, calls };
}

async function mountView(services) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringView, { target, props: { services } });
  flushSync();
  await tick();
  await tick();
  flushSync();
}

async function settle() {
  await tick();
  await tick();
  await tick();
  flushSync();
}

describe('GatheringDetail (center column) mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: {
        localize: (key) => key,
        format: (key, data) => `${key}:${JSON.stringify(data)}`
      }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-gathering-detail-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    const utilDestination = join(tempRoot, 'src/ui/svelte/util/foundryBridge.js');
    mkdirSync(dirname(utilDestination), { recursive: true });
    writeFileSync(utilDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/foundryBridge.js'), 'utf8'));

    const selectionDefaultDestination = join(tempRoot, 'src/ui/svelte/apps/gathering/selectionDefault.js');
    mkdirSync(dirname(selectionDefaultDestination), { recursive: true });
    writeFileSync(
      selectionDefaultDestination,
      readFileSync(resolve(repoRoot, 'src/ui/svelte/apps/gathering/selectionDefault.js'), 'utf8')
    );

    // LinkedScene imports the scene-image helper; copy it into the temp tree.
    const sceneImagesDestination = join(tempRoot, 'src/ui/svelte/util/sceneImages.js');
    mkdirSync(dirname(sceneImagesDestination), { recursive: true });
    writeFileSync(sceneImagesDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/sceneImages.js'), 'utf8'));

    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/SuccessChanceBar.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/LinkedScene.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRequirements.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringView.svelte');

    GatheringView = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/apps/gathering/GatheringView.svelte.js'
    )))).default;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
    delete globalThis.game;
  });

  it('shows the select hint when no environment resolves as selected (all locked)', async () => {
    const { services } = makeServices(listing([environment({ id: 'env-locked', locked: true })]));
    await mountView(services);

    const detail = target.querySelector('[data-gathering-detail]');
    assert.ok(detail, 'center column renders the detail container');
    assert.ok(
      target.querySelector('[data-gathering-detail-state="empty"]'),
      'with no selectable env the detail shows the empty hint'
    );
  });

  it('renders the targeted header, pips, mode hint, and an attemptable task row', async () => {
    const { services } = makeServices(listing([environment()]));
    await mountView(services);

    assert.ok(target.querySelector('[data-gathering-detail-state="selected"]'), 'detail shows the selected env');
    const pips = target.querySelector('[data-gathering-pips]');
    assert.ok(pips, 'info pips render');
    assert.ok(pips.textContent.includes('Forest'), 'biome pip present');
    assert.ok(pips.textContent.includes('Greenvale'), 'region pip present');
    // Danger is localized via the Risk.<value> key (not the raw enum); the i18n
    // stub echoes the key, so the localized key path proves the lookup happened.
    assert.ok(pips.textContent.includes('Risk.safe'), 'danger pip uses the localized risk key');

    const hint = target.querySelector('[data-gathering-mode-hint]');
    assert.ok(hint.textContent.includes('TargetedHint'), 'targeted mode hint shown');

    const row = target.querySelector('[data-task-id="task-1"]');
    assert.ok(row, 'task row renders');
    assert.equal(row.getAttribute('data-attemptable'), 'true');
    assert.equal(row.getAttribute('data-blocked'), 'false');
    assert.ok(row.querySelector('[data-gathering-success-value]'), 'success-chance bar present for d100 task');
    const attemptBtn = row.querySelector('[data-gathering-attempt]');
    assert.ok(attemptBtn && !attemptBtn.disabled, 'attempt button enabled on an attemptable task');
  });

  it('shows a blocked task with a lock overlay, a header callout, and conditions detail on expand', async () => {
    const blockedTask = taskModel({
      id: 'task-blocked',
      attemptable: false,
      successChance: null,
      blockedReasons: [
        {
          code: 'CONDITIONS_BLOCKED',
          message: 'Conditions not met',
          data: { taskId: 'task-blocked', requiredWeather: ['rain'], requiredTimeOfDay: ['night'] }
        }
      ]
    });
    const { services } = makeServices(listing([environment({ tasks: [blockedTask] })]));
    await mountView(services);

    const row = target.querySelector('[data-task-id="task-blocked"]');
    assert.equal(row.getAttribute('data-blocked'), 'true');
    assert.ok(row.querySelector('.gathering-task-lock-overlay'), 'blocked row shows the lock overlay');
    // Blocking issue appears as a header callout.
    const callouts = row.querySelector('[data-gathering-callouts]');
    assert.ok(callouts, 'header callout bar present');
    assert.ok(callouts.textContent.includes('Conditions'), 'a conditions callout is shown');
    assert.equal(row.querySelector('[data-gathering-success-value]'), null, 'no success bar when successChance is null');
    assert.ok(row.querySelector('[data-gathering-attempt]').disabled, 'attempt button disabled on a blocked task');

    // Detail is hidden until expanded; clicking the summary reveals it.
    assert.equal(row.querySelector('[data-gathering-blocked]'), null, 'detail hidden before expand');
    row.querySelector('.gathering-task-summary').click();
    flushSync();
    const blocked = row.querySelector('[data-gathering-blocked]');
    assert.ok(blocked, 'blocked detail list present after expand');
    assert.ok(blocked.textContent.includes('night'), 'required time-of-day surfaced');
    assert.ok(blocked.textContent.includes('rain'), 'required weather surfaced');
  });

  it('expands a task with required tools and lists each tool with its state, without toggling on Attempt click', async () => {
    const tooledTask = taskModel({
      id: 'task-tools',
      attemptable: false,
      successChance: null,
      blockedReasons: [{ code: 'TOOL_BLOCKED', message: 'Missing tools', data: {} }],
      tools: [
        { id: 'c-axe', name: 'Stone Pickaxe', img: 'icons/axe.webp', state: 'present', required: true },
        { id: 'c-lantern', name: 'Lantern', img: 'icons/lantern.webp', state: 'missing', required: true }
      ]
    });
    const { services } = makeServices(listing([environment({ tasks: [tooledTask] })]));
    await mountView(services);

    const row = target.querySelector('[data-task-id="task-tools"]');
    assert.ok(row.querySelector('[data-gathering-callouts]').textContent.includes('Callout.MissingTools'), 'missing-tools callout shown');

    // Attempt is disabled; clicking it must NOT expand the card.
    row.querySelector('[data-gathering-attempt]').click();
    flushSync();
    assert.equal(row.querySelector('[data-gathering-tools]'), null, 'attempt click did not expand the card');

    row.querySelector('.gathering-task-summary').click();
    flushSync();
    const toolRows = row.querySelectorAll('[data-gathering-tool]');
    assert.equal(toolRows.length, 2, 'both required tools listed');
    assert.equal(toolRows[0].getAttribute('data-tool-state'), 'present');
    assert.equal(toolRows[1].getAttribute('data-tool-state'), 'missing');
    assert.ok(toolRows[0].textContent.includes('Stone Pickaxe'));
  });

  it('shows the linked-scene banner once above the task list when the environment is scene-gated', async () => {
    // No global fromUuid -> LinkedScene resolves nothing and cannot view -> wait hint.
    const sceneTask = taskModel({
      id: 'task-scene',
      attemptable: false,
      successChance: null,
      blockedReasons: [{ code: 'SCENE_TOKEN_BLOCKED', message: 'Visit the scene', data: {} }]
    });
    const { services } = makeServices(listing([environment({
      sceneUuid: 'Scene.abc',
      blockedReasons: [{ code: 'SCENE_TOKEN_BLOCKED', message: 'Visit the scene', data: {} }],
      tasks: [sceneTask]
    })]));
    await mountView(services);

    // The mode hint explains the scene gate instead of the usual "choose a task".
    const hint = target.querySelector('[data-gathering-mode-hint]');
    assert.ok(hint.textContent.includes('SceneGateHint'), 'mode hint explains the scene gate');
    assert.ok(!hint.textContent.includes('TargetedHint'), 'the usual targeted hint is replaced');

    // Environment-level banner renders once, before the task list.
    const banner = target.querySelector('[data-gathering-scene-banner]');
    assert.ok(banner, 'env-level linked-scene banner renders');
    const scene = banner.querySelector('[data-gathering-scene]');
    assert.ok(scene, 'banner contains the LinkedScene panel');
    assert.ok(banner.querySelector('[data-gathering-scene-wait]'), 'shows the wait hint when the player cannot navigate');

    const list = target.querySelector('.gathering-detail-task-list');
    assert.ok(list, 'task list renders');
    const kids = Array.from(target.querySelector('[data-gathering-detail-state="selected"]').children);
    assert.ok(
      kids.findIndex(el => el.matches('[data-gathering-scene-banner]')) <
        kids.findIndex(el => el.contains(list) || el.matches('.gathering-detail-section')),
      'the scene banner precedes the task-list section'
    );

    // The task card no longer carries a scene callout or panel.
    const row = target.querySelector('[data-task-id="task-scene"]');
    const callouts = row.querySelector('[data-gathering-callouts]');
    assert.ok(!callouts || !callouts.textContent.includes('VisitScene'), 'no scene callout on the task card');
    assert.equal(row.querySelector('[data-gathering-scene]'), null, 'no linked-scene panel inside the task card');
  });

  it('renders the blind attempt button and the Discovered Tasks section', async () => {
    const blindEnv = environment({
      id: 'env-blind',
      selectionMode: 'blind',
      revealPolicy: 'onAttempt',
      discoveredTaskCount: 1,
      composedTaskCount: 3,
      tasks: [{ action: 'blindGather', label: 'Blind', blind: true, attemptable: true, blockedReasons: [] }],
      discoveredTasks: [taskModel({ id: 'disc-1', name: 'Found Herb', discovered: true })]
    });
    const { services } = makeServices(listing([blindEnv]));
    await mountView(services);

    const blindCard = target.querySelector('[data-gathering-blind-card]');
    assert.ok(blindCard, 'blind attempt is wrapped in a call-to-action card');
    assert.ok(blindCard.querySelector('[data-gathering-blind-attempt]'), 'attempt button lives in the card');
    assert.ok(blindCard.textContent.includes('BlindAttemptPrompt'), 'card shows the blind prompt');
    assert.ok(blindCard.querySelector('.gathering-detail-blind-card-divider'), 'card has the divider');
    const discovered = target.querySelector('[data-gathering-discovered]');
    assert.ok(discovered, 'discovered section present for blind + reveal != never');
    assert.ok(discovered.textContent.includes('1/3') || discovered.textContent.includes('"x":1'), 'discovered heading carries the counts');
    assert.ok(target.querySelector('[data-task-id="disc-1"]'), 'discovered task row renders');
  });

  it('hides the Discovered Tasks section for a blind environment with revealPolicy never', async () => {
    const blindEnv = environment({
      id: 'env-blind-never',
      selectionMode: 'blind',
      revealPolicy: 'never',
      tasks: [{ action: 'blindGather', label: 'Blind', blind: true, attemptable: true, blockedReasons: [] }],
      discoveredTasks: []
    });
    const { services } = makeServices(listing([blindEnv]));
    await mountView(services);

    assert.ok(target.querySelector('[data-gathering-blind-attempt]'), 'blind attempt button still present');
    assert.equal(target.querySelector('[data-gathering-discovered]'), null, 'no discovered section when reveal is never');
  });

  it('wires a task Attempt click to startGatheringAttempt and re-fetches the listing', async () => {
    const { services, calls } = makeServices(listing([environment()]));
    await mountView(services);
    assert.equal(calls.list, 1, 'listing fetched once on mount');

    target.querySelector('[data-gathering-attempt]').click();
    await settle();

    assert.equal(calls.attempts.length, 1, 'startGatheringAttempt called once');
    assert.deepEqual(calls.attempts[0], { environmentId: 'env-meadow', taskId: 'task-1' }, 'called with env + task id');
    assert.equal(calls.list, 2, 'listing re-fetched after the attempt');
  });

  it('guards against double-submit while an attempt is in flight', async () => {
    // A deferred attempt promise lets us click again before the first settles.
    let releaseAttempt;
    const calls = { list: 0, attempts: [] };
    const services = {
      listGatheringForActor: () => {
        calls.list += 1;
        return Promise.resolve(listing([environment()]));
      },
      startGatheringAttempt: (opts) => {
        calls.attempts.push(opts);
        return new Promise((resolve) => { releaseAttempt = resolve; });
      }
    };
    await mountView(services);

    const attemptBtn = target.querySelector('[data-gathering-attempt]');
    attemptBtn.click();
    await tick();
    flushSync();
    // While in flight the button is disabled and a second click is ignored.
    assert.ok(target.querySelector('[data-gathering-attempt]').disabled, 'button disabled during the round-trip');
    target.querySelector('[data-gathering-attempt]').click();
    await tick();
    flushSync();
    assert.equal(calls.attempts.length, 1, 'second click is a no-op while busy');

    releaseAttempt({ accepted: true });
    await settle();
    assert.equal(calls.attempts.length, 1, 'still exactly one attempt after settle');
    assert.equal(calls.list, 2, 'listing re-fetched once after the attempt resolves');
  });

  it('auto-selects the first attemptable task and shows it in the right-column inspector', async () => {
    const { services } = makeServices(listing([environment()]));
    await mountView(services);

    // Right column shows the selected-task inspector for task-1 (the only,
    // attemptable, task), with its name and a "no requirements" note.
    const panel = target.querySelector('[data-gathering-task-detail]');
    assert.ok(panel, 'right-column task inspector renders for the auto-selected task');
    assert.equal(panel.getAttribute('data-detail-task-id'), 'task-1');
    assert.ok(panel.textContent.includes('Gather Iron'), 'inspector header shows the task name');
    assert.ok(panel.querySelector('[data-gathering-no-requirements]'), 'a task with no tools/blocks shows the no-requirements note');

    // The matching center row is the selected one.
    const row = target.querySelector('[data-task-id="task-1"]');
    assert.equal(row.getAttribute('data-selected'), 'true', 'the center row reflects the selection');
  });

  it('selecting a task updates the inspector and moves the center accordion (single expanded row)', async () => {
    const tooled = taskModel({
      id: 'task-2',
      name: 'Chop Wood',
      attemptable: true,
      blockedReasons: [],
      tools: [{ id: 'c-axe', name: 'Axe', img: 'icons/axe.webp', state: 'present', required: true }]
    });
    const { services } = makeServices(listing([environment({ tasks: [taskModel(), tooled] })]));
    await mountView(services);

    // Defaults to the first attemptable task (task-1); task-2 is not selected.
    assert.equal(target.querySelector('[data-gathering-task-detail]').getAttribute('data-detail-task-id'), 'task-1');
    assert.equal(target.querySelector('[data-task-id="task-2"]').getAttribute('data-selected'), 'false');

    // Select task-2 by clicking its summary.
    target.querySelector('[data-task-id="task-2"] .gathering-task-summary').click();
    flushSync();

    // Right column now shows task-2, including its required tool.
    const panel = target.querySelector('[data-gathering-task-detail]');
    assert.equal(panel.getAttribute('data-detail-task-id'), 'task-2');
    assert.ok(panel.querySelector('[data-gathering-tool]'), 'inspector lists the selected task tools');

    // Accordion moved: task-2 selected + expanded, task-1 deselected.
    assert.equal(target.querySelector('[data-task-id="task-2"]').getAttribute('data-selected'), 'true');
    assert.equal(target.querySelector('[data-task-id="task-1"]').getAttribute('data-selected'), 'false');
    assert.ok(target.querySelector('[data-task-id="task-2"] [data-gathering-tools]'), 'selected expandable row shows inline requirements');
  });

  it('shows the "select a gathering task" hint when tasks exist but none is attemptable', async () => {
    const blocked = taskModel({ id: 'task-x', attemptable: false, successChance: null, blockedReasons: [{ code: 'CONDITIONS_BLOCKED', message: 'no', data: {} }] });
    const { services } = makeServices(listing([environment({ tasks: [blocked] })]));
    await mountView(services);

    const column = target.querySelector('[data-gathering-task-detail-column]');
    const state = column.querySelector('[data-gathering-task-detail-state]');
    assert.ok(state, 'right column shows a hint state');
    assert.equal(state.getAttribute('data-gathering-task-detail-state'), 'empty');
    assert.ok(state.textContent.includes('SelectTaskHint'), 'shows the select-a-task hint');
  });

  it('shows the "no available tasks" hint when the environment has no visible tasks', async () => {
    const { services } = makeServices(listing([environment({ tasks: [] })]));
    await mountView(services);

    const state = target.querySelector('[data-gathering-task-detail-column] [data-gathering-task-detail-state]');
    assert.equal(state.getAttribute('data-gathering-task-detail-state'), 'none');
    assert.ok(state.textContent.includes('NoAvailableTasks'), 'shows the no-available-tasks hint');
  });

  it('wires the blind Attempt to startGatheringAttempt with a null task id', async () => {
    const blindEnv = environment({
      id: 'env-blind',
      selectionMode: 'blind',
      revealPolicy: 'onAttempt',
      tasks: [{ action: 'blindGather', label: 'Blind', blind: true, attemptable: true, blockedReasons: [] }],
      discoveredTasks: []
    });
    const { services, calls } = makeServices(listing([blindEnv]));
    await mountView(services);

    target.querySelector('[data-gathering-blind-attempt]').click();
    await settle();

    assert.equal(calls.attempts.length, 1, 'blind attempt fires once');
    assert.deepEqual(calls.attempts[0], { environmentId: 'env-blind', taskId: null }, 'blind attempt omits the task id');
  });
});
