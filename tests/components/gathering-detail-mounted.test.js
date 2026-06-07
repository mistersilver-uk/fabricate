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

function makeServices(result, dropBreakdown = null) {
  const calls = { list: 0, attempts: [], dropBreakdown: [] };
  const services = {
    listGatheringForActor: () => {
      calls.list += 1;
      return Promise.resolve(result);
    },
    startGatheringAttempt: (opts) => {
      calls.attempts.push(opts);
      return Promise.resolve({ accepted: true });
    },
    getGatheringDropBreakdown: (opts) => {
      calls.dropBreakdown.push(opts);
      return Promise.resolve(dropBreakdown ?? { drops: [], awardMode: null, awardLimit: 1, hazardPolicy: null });
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

// Switch the center column to a given tab ('tasks' | 'hazards').
function clickTab(tab) {
  target.querySelector(`[data-gathering-detail-tab="${tab}"]`).click();
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

    const conditionIconsDestination = join(tempRoot, 'src/ui/svelte/util/gatheringConditionIcons.js');
    writeFileSync(conditionIconsDestination, readFileSync(resolve(repoRoot, 'src/ui/svelte/util/gatheringConditionIcons.js'), 'utf8'));

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
    writeCompiledSvelte('src/ui/svelte/apps/gathering/HazardChanceBar.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/LinkedScene.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRequirements.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringHazardRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringHazardDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetailTabs.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskDrops.svelte');
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
    // The center row is now read-only: no attempt button, and the description is
    // shown in the always-visible underneath section.
    assert.equal(row.querySelector('[data-gathering-attempt]'), null, 'center row has no attempt button');
    const desc = row.querySelector('[data-gathering-task-description]');
    assert.ok(desc && desc.textContent.includes('Dig for ore.'), 'description renders underneath the row');
    // The attempt action lives in the right-column inspector for the auto-selected task.
    const inspectorAttempt = target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]');
    assert.ok(inspectorAttempt && !inspectorAttempt.disabled, 'right-column attempt enabled for the attemptable task');
    assert.equal(inspectorAttempt.querySelector('.fa-ban'), null, 'no ban icon on an attemptable task');
    assert.equal(inspectorAttempt.getAttribute('data-gathering-attempt-blocked'), 'false');
  });

  it('shows a fallback description (center row + inspector) when a task has none', async () => {
    const { services } = makeServices(listing([environment({ tasks: [taskModel({ id: 'task-nodesc', description: '' })] })]));
    await mountView(services);

    const desc = target.querySelector('[data-task-id="task-nodesc"] [data-gathering-task-description]');
    assert.ok(desc, 'the description line is always present');
    assert.ok(desc.classList.contains('is-fallback'), 'center row marks the placeholder as a fallback');
    assert.ok(desc.textContent.includes('NoTaskDescription'), 'center row shows the localized fallback');

    const panelDesc = target.querySelector('[data-gathering-task-detail] .gathering-task-detail-description');
    assert.ok(panelDesc.classList.contains('is-fallback'), 'inspector marks the placeholder as a fallback');
    assert.ok(panelDesc.textContent.includes('NoTaskDescription'), 'inspector shows the localized fallback');
  });

  it('renders the success-chance bar in-line with the right-column Attempt button', async () => {
    const { services } = makeServices(listing([environment()]));
    await mountView(services);

    const action = target.querySelector('[data-gathering-task-detail] .gathering-task-detail-action');
    assert.ok(action, 'the inspector action row renders');
    assert.ok(action.querySelector('[data-gathering-success-value]'), 'success-chance bar sits in the action row');
    assert.ok(action.querySelector('[data-gathering-attempt]'), 'attempt button sits in the same action row');
  });

  it('renders "What you might find" with per-drop mini bars, award/hazard hints, and expandable modifiers', async () => {
    const dropBreakdown = {
      successChance: 1,
      awardMode: 'allDrops',
      awardLimit: 1,
      hazardPolicy: 'successWithHazard',
      drops: [{
        id: 'd-ore',
        name: 'Raw Ore',
        img: 'icons/ore.webp',
        componentId: 'ore',
        quantity: 2,
        baseChance: 0.4,
        finalChance: 0.53,
        modifiers: {
          weather: { conditionId: 'rain', value: 10 },
          timeOfDay: { conditionId: 'night', value: -5 },
          biome: { value: 0 },
          character: [{ label: 'Dexterity', icon: 'fas fa-user', contribution: 8 }]
        }
      }]
    };
    const { services, calls } = makeServices(listing([environment()]), dropBreakdown);
    await mountView(services);
    await settle();

    // The selected task triggered a lazy breakdown fetch.
    assert.ok(calls.dropBreakdown.length >= 1, 'breakdown fetched for the selected task');

    // The inspector success bar adopts the personalized aggregate from the
    // breakdown (1.0) rather than the listing's base value (0.5).
    const successBar = target.querySelector('[data-gathering-task-detail] .gathering-task-detail-action [data-gathering-success-value]');
    assert.equal(successBar.getAttribute('data-gathering-success-value'), '100', 'success chance reflects the modifier-adjusted aggregate');

    const section = target.querySelector('[data-gathering-task-detail] [data-gathering-drops]');
    assert.ok(section, '"What you might find" section renders');
    const hints = section.querySelector('[data-gathering-drops-hints]');
    assert.ok(hints.textContent.includes('AwardModeAll'), 'award-mode hint shown');
    assert.ok(hints.textContent.includes('HazardImpactSuccess'), 'hazard-impact hint shown');

    const drop = section.querySelector('[data-gathering-drop]');
    assert.ok(drop, 'a drop row renders');
    assert.equal(drop.querySelector('[data-gathering-drop-value]').getAttribute('data-gathering-drop-value'), '53');
    assert.equal(drop.querySelector('[data-gathering-drop-modifiers]'), null, 'modifiers hidden until expanded');

    drop.querySelector('.gathering-task-drop-summary').click();
    flushSync();
    const modifiers = drop.querySelector('[data-gathering-drop-modifiers]');
    assert.ok(modifiers, 'modifiers reveal on expand');
    assert.ok(modifiers.textContent.includes('Dexterity'), 'character ability contribution listed');
    assert.ok(modifiers.textContent.includes('ModifierWeather'), 'weather contribution listed');
    assert.ok(modifiers.textContent.includes('+10%'), 'weather delta shown signed');
  });

  it('shows the hazard-chance bar (with tier) atop the Hazards tab when hazard chance > 0', async () => {
    const { services } = makeServices(listing([environment({ risk: 'hazardous', hazardChance: 0.5 })]));
    await mountView(services);
    clickTab('hazards');

    const section = target.querySelector('[data-gathering-hazard-section]');
    assert.ok(section, 'hazard summary renders atop the Hazards tab');
    // Highest danger level shown (localized risk key via the i18n stub).
    assert.ok(section.textContent.includes('Risk.hazardous'), 'section shows the highest danger level');
    // Hazard bar present, with the percent + reversed-scale tier (50% -> amber).
    const bar = section.querySelector('[data-gathering-hazard-value]');
    assert.ok(bar, 'hazard-chance bar renders when chance > 0');
    assert.equal(bar.getAttribute('data-gathering-hazard-value'), '50');
    assert.equal(bar.getAttribute('data-gathering-hazard-tier'), 'amber');
    // Explanatory hint shown; the "safe" hint is not.
    assert.ok(section.textContent.includes('HazardChanceHint'), 'explanatory hazard hint shown');
    assert.equal(section.querySelector('[data-gathering-safe-hint]'), null, 'safe hint hidden when chance > 0');
  });

  it('shows the "safe environment" hint (no bar) when hazard chance is zero', async () => {
    const { services } = makeServices(listing([environment({ hazardChance: 0 })]));
    await mountView(services);
    clickTab('hazards');

    const section = target.querySelector('[data-gathering-hazard-section]');
    assert.ok(section, 'hazard summary still renders');
    assert.ok(section.textContent.includes('Risk.safe'), 'danger level still shown for a safe environment');
    assert.equal(section.querySelector('[data-gathering-hazard-value]'), null, 'no hazard bar when chance is zero');
    const safe = section.querySelector('[data-gathering-safe-hint]');
    assert.ok(safe, 'safe hint shown when chance is zero');
    assert.ok(safe.textContent.includes('HazardSafeHint'), 'safe hint uses the localized message');
  });

  it('hides the chance bar and shows an all-hidden hint under the dangerLevelOnly visibility tier', async () => {
    const { services } = makeServices(listing([environment({
      risk: 'hazardous', hazardVisibility: 'dangerLevelOnly', hazardChance: null, hazards: []
    })]));
    await mountView(services);
    clickTab('hazards');

    const section = target.querySelector('[data-gathering-hazard-section]');
    assert.ok(section, 'hazard summary still renders');
    assert.ok(section.textContent.includes('Risk.hazardous'), 'the danger level is still shown');
    assert.equal(section.querySelector('[data-gathering-hazard-value]'), null, 'no chance bar under dangerLevelOnly');
    assert.equal(section.querySelector('[data-gathering-safe-hint]'), null, 'hidden is not mistaken for safe');
    const restricted = section.querySelector('[data-gathering-hazards-restricted="dangerLevelOnly"]');
    assert.ok(restricted, 'an all-hidden hint is shown');
    assert.ok(restricted.textContent.includes('HazardAllHiddenHint'), 'the all-hidden hint uses the localized message');
    assert.equal(target.querySelector('[data-gathering-hazards-section]'), null, 'no individual hazard list');
  });

  it('shows the chance bar and a details-hidden hint (no hazard list) under the encounterChance tier', async () => {
    const { services } = makeServices(listing([environment({
      risk: 'hazardous', hazardVisibility: 'encounterChance', hazardChance: 0.5, hazards: []
    })]));
    await mountView(services);
    clickTab('hazards');

    const section = target.querySelector('[data-gathering-hazard-section]');
    assert.ok(section.querySelector('[data-gathering-hazard-value]'), 'the encounter-chance bar is shown');
    const restricted = section.querySelector('[data-gathering-hazards-restricted="encounterChance"]');
    assert.ok(restricted, 'a details-hidden hint is shown alongside the bar');
    assert.ok(restricted.textContent.includes('HazardDetailsHiddenHint'), 'the details-hidden hint uses the localized message');
    assert.equal(target.querySelector('[data-gathering-hazards-section]'), null, 'no individual hazard list under encounterChance');
  });

  it('shows a blocked task with a lock overlay + callout, and its conditions detail in the right inspector on select', async () => {
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
    assert.equal(row.querySelector('[data-gathering-attempt]'), null, 'center row has no attempt button');
    assert.equal(row.querySelector('[data-gathering-blocked]'), null, 'no inline blocked detail in the center row');

    // Nothing is attemptable, so no task is auto-selected; selecting the blocked
    // task surfaces its conditions detail in the right-column inspector.
    row.querySelector('.gathering-task-summary').click();
    flushSync();
    const blocked = target.querySelector('[data-gathering-task-detail] [data-gathering-blocked]');
    assert.ok(blocked, 'blocked detail appears in the right-column inspector');
    assert.ok(blocked.textContent.includes('night'), 'required time-of-day surfaced');
    assert.ok(blocked.textContent.includes('rain'), 'required weather surfaced');
    const blockedAttempt = target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]');
    assert.ok(blockedAttempt.disabled, 'inspector attempt button disabled on a blocked task');
    assert.equal(blockedAttempt.getAttribute('data-gathering-attempt-blocked'), 'true');
    assert.ok(blockedAttempt.querySelector('.fa-ban'), 'blocked attempt shows the ban icon');
    const attemptWrap = target.querySelector('[data-gathering-task-detail] .gathering-task-detail-attempt-wrap');
    assert.ok((attemptWrap.getAttribute('title') || '').includes('Conditions'), 'tooltip explains the block reason');
  });

  it('lists a selected task\'s required tools in the right inspector, not inline in the center row', async () => {
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
    assert.equal(row.querySelector('[data-gathering-tools]'), null, 'center row does not render the tools inline');

    // Select the task -> its tools list appears in the right-column inspector.
    row.querySelector('.gathering-task-summary').click();
    flushSync();
    const toolRows = target.querySelectorAll('[data-gathering-task-detail] [data-gathering-tool]');
    assert.equal(toolRows.length, 2, 'both required tools listed in the inspector');
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

  it('wires the right-column Attempt to startGatheringAttempt and re-fetches the listing', async () => {
    const { services, calls } = makeServices(listing([environment()]));
    await mountView(services);
    assert.equal(calls.list, 1, 'listing fetched once on mount');

    // task-1 is auto-selected; the Attempt button lives in the right-column inspector.
    target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').click();
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

    const attemptBtn = target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]');
    attemptBtn.click();
    await tick();
    flushSync();
    // While in flight the button is disabled and a second click is ignored.
    assert.ok(target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').disabled, 'button disabled during the round-trip');
    target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').click();
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

    // Selection moved: task-2 selected, task-1 deselected — and the center row
    // never renders requirements inline (they live only in the right column).
    assert.equal(target.querySelector('[data-task-id="task-2"]').getAttribute('data-selected'), 'true');
    assert.equal(target.querySelector('[data-task-id="task-1"]').getAttribute('data-selected'), 'false');
    assert.equal(target.querySelector('[data-task-id="task-2"] [data-gathering-tools]'), null, 'center row has no inline requirements');
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

  it('filters and paginates the task list via the task search box', async () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      taskModel({ id: `task-${i}`, name: i === 0 ? 'Gather Quartz' : `Gather Iron ${i}`, description: '' }));
    const { services } = makeServices(listing([environment({ tasks })]));
    await mountView(services);

    const section = target.querySelector('[data-gathering-tasks-section]');
    assert.ok(section, 'tasks section renders');
    // Page size defaults to 6, so the 8 tasks span two pages.
    assert.equal(section.querySelectorAll('.gathering-task-row').length, 6, 'first page shows the default page size');

    const search = section.querySelector('[data-gathering-task-search]');
    assert.ok(search, 'task search input renders');
    search.value = 'quartz';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle();

    const rows = section.querySelectorAll('.gathering-task-row');
    assert.equal(rows.length, 1, 'search narrows the task list');
    assert.ok(rows[0].textContent.includes('Gather Quartz'), 'the matching task is shown');

    search.value = 'no-such-task';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle();
    assert.ok(section.querySelector('[data-gathering-no-task-matches]'), 'a no-matches hint shows when the search excludes everything');
  });

  it('defaults to the Tasks tab and switches to Hazards on click', async () => {
    const hazards = [{ id: 'h', name: 'Rockslide', description: '', img: 'icons/svg/hazard.svg', dangerTags: ['unsafe'], risk: 'unsafe', chance: 0.4 }];
    const { services } = makeServices(listing([environment({ hazardChance: 0.4, hazards })]));
    await mountView(services);

    // Tasks tab active by default; tasks panel shown, hazard summary not.
    assert.equal(target.querySelector('[data-gathering-detail-tab="tasks"]').getAttribute('aria-selected'), 'true');
    assert.ok(target.querySelector('[data-gathering-tasks-section]'), 'tasks panel shown by default');
    assert.equal(target.querySelector('[data-gathering-hazard-section]'), null, 'hazard summary not shown on the Tasks tab');

    clickTab('hazards');
    assert.equal(target.querySelector('[data-gathering-detail-tab="hazards"]').getAttribute('aria-selected'), 'true');
    assert.ok(target.querySelector('[data-gathering-hazard-section]'), 'hazard summary shown on the Hazards tab');
    assert.equal(target.querySelector('[data-gathering-tasks-section]'), null, 'tasks panel hidden on the Hazards tab');
  });

  it('renders a selectable, searchable, paginated hazards list on the Hazards tab', async () => {
    const hazards = Array.from({ length: 7 }, (_, i) => ({
      id: `haz-${i}`,
      name: i === 0 ? 'Rockslide' : `Quicksand ${i}`,
      description: 'Watch your step.',
      img: 'icons/svg/hazard.svg',
      dangerTags: ['hazardous'],
      risk: 'hazardous',
      chance: 0.3
    }));
    const { services } = makeServices(listing([environment({ risk: 'hazardous', hazardChance: 0.6, hazards })]));
    await mountView(services);
    clickTab('hazards');

    // The aggregate summary (danger + chance bar) sits atop the tab.
    assert.ok(target.querySelector('[data-gathering-hazard-section] [data-gathering-hazard-value]'), 'aggregate hazard-chance bar shown atop the tab');

    const section = target.querySelector('[data-gathering-hazards-section]');
    assert.ok(section, 'hazards list section renders');
    // Hazard rows render, paginated to the default page size (6 of 7).
    assert.equal(section.querySelectorAll('.gathering-hazard-row').length, 6, 'hazards paginate at the default page size');
    // Hazard rows are now selectable (interactive summary).
    assert.ok(section.querySelector('.gathering-hazard-row [role="button"]'), 'hazard rows are selectable');

    const search = section.querySelector('[data-gathering-hazard-search]');
    assert.ok(search, 'hazard search input renders');
    search.value = 'rockslide';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await settle();

    const rows = section.querySelectorAll('.gathering-hazard-row');
    assert.equal(rows.length, 1, 'hazard search narrows the list');
    assert.ok(rows[0].textContent.includes('Rockslide'), 'the matching hazard is shown');
  });

  it('selecting a hazard shows its full details in the right column', async () => {
    const hazards = [
      { id: 'haz-1', name: 'Rockslide', description: 'Falling rocks.', img: 'icons/svg/hazard.svg', dangerTags: ['hazardous'], risk: 'hazardous', chance: 0.3, weather: ['storm'], timeOfDay: [], biomes: [], regions: [], linkedSceneUuid: '' },
      { id: 'haz-2', name: 'Sinkhole', description: 'The ground gives way.', img: 'icons/svg/hazard.svg', dangerTags: ['deadly'], risk: 'deadly', chance: 0.5, weather: [], timeOfDay: ['night'], biomes: [], regions: [], linkedSceneUuid: '' }
    ];
    const { services } = makeServices(listing([environment({ risk: 'hazardous', hazardChance: 0.6, hazards })]));
    await mountView(services);
    clickTab('hazards');

    // Right column shows the hazard inspector for the default-selected first hazard.
    const panel = target.querySelector('[data-gathering-task-detail-column] [data-gathering-hazard-detail]');
    assert.ok(panel, 'right column shows the hazard inspector');
    assert.equal(panel.getAttribute('data-detail-hazard-id'), 'haz-1');
    assert.ok(panel.textContent.includes('Rockslide'), 'inspector shows the first hazard');
    const weatherGroup = panel.querySelector('[data-gathering-hazard-match="weather"]');
    assert.ok(weatherGroup, 'matching weather surfaced for the first hazard');
    // The weather chip renders the shared icon + capitalized i18n label (not the raw id).
    const weatherChip = weatherGroup.querySelector('.gathering-hazard-detail-chip');
    assert.ok(weatherChip.querySelector('i.fa-bolt'), 'weather chip shows the storm icon');
    assert.ok(weatherChip.textContent.includes('Weather.storm'), 'weather chip uses the localized label key');

    // Selecting the second hazard updates the inspector + its matching fields.
    target.querySelector('[data-hazard-id="haz-2"] .gathering-hazard-summary').click();
    flushSync();
    const updated = target.querySelector('[data-gathering-task-detail-column] [data-gathering-hazard-detail]');
    assert.equal(updated.getAttribute('data-detail-hazard-id'), 'haz-2');
    assert.ok(updated.textContent.includes('Sinkhole'), 'inspector follows the selection');
    assert.ok(updated.querySelector('[data-gathering-hazard-match="timeOfDay"]'), 'time-of-day matching surfaced for the second hazard');
  });

  it('hides individual hazards for a blind environment but keeps the chance summary', async () => {
    const blindEnv = environment({
      id: 'env-blind-haz',
      selectionMode: 'blind',
      revealPolicy: 'onAttempt',
      risk: 'dangerous',
      hazardChance: 0.5,
      hazards: [],
      tasks: [{ action: 'blindGather', label: 'Blind', blind: true, attemptable: true, blockedReasons: [] }],
      discoveredTasks: []
    });
    const { services } = makeServices(listing([blindEnv]));
    await mountView(services);
    clickTab('hazards');

    assert.ok(target.querySelector('[data-gathering-hazard-section] [data-gathering-hazard-value]'), 'aggregate chance bar still shown for a blind env');
    assert.equal(target.querySelector('.gathering-hazard-row'), null, 'no individual hazard rows for a blind env');
    assert.ok(target.querySelector('[data-gathering-hazards-hidden]'), 'a "hazards hidden" hint is shown instead');
  });
});
