import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const root = resolve(import.meta.dirname, '../..');
const environmentComponentNames = [
  'EnvironmentActionMenu',
  'CatalystList',
  'EnvironmentFields',
  'EnvironmentList',
  'EnvironmentValidationFeedback',
  'FailureOutcomeFields',
  'ProgressiveFields',
  'ResultGroups',
  'ResultSelectionFields',
  'TaskBaseFields',
  'TaskList',
  'TimeRequirementFields',
  'VisibilityFields'
];
const sharedComponentNames = [
  'ImagePathPicker'
];

let tempRoot;
let HostComponent;
let mountedComponent;
let mountedTarget;
let restoredGlobals = [];

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath, outputPath) {
  const source = readFileSync(join(root, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  const destination = join(tempRoot, outputPath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function writeHostComponent() {
  const hostSource = `
    <script>
      import EnvironmentsTab from './src/ui/svelte/apps/EnvironmentsTab.svelte.js';

      let {
        environmentDraft,
        environments = [environmentDraft],
        managedItemOptions = [],
        sceneOptions = [],
        rollTableOptions = [],
        saveError = null,
        pickImagePath = async () => null
      } = $props();
      let draft = $state(environmentDraft);
      let validationState = $state(null);
      let calls = $state([]);

      export function setValidationState(nextValidationState) {
        validationState = nextValidationState;
      }

      export function getEnvironmentDraft() {
        return draft;
      }

      export function getCalls() {
        return calls;
      }

      export function setEnvironmentContext(nextDraft, nextEnvironments) {
        draft = nextDraft;
        environments = nextEnvironments;
      }

      function record(name, ...args) {
        calls = [...calls, { name, args }];
      }

      function selectEnvironment(environmentId) {
        record('selectEnvironment', environmentId);
        draft = environments.find(environment => environment?.id === environmentId) || null;
      }

      function updateEnvironment(updates) {
        record('updateEnvironment', updates);
        draft = { ...draft, ...updates };
      }

      function updateTask(taskId, updates) {
        draft = {
          ...draft,
          tasks: draft.tasks.map(task => task.id === taskId ? { ...task, ...updates } : task)
        };
      }

      function updateCatalyst(taskId, catalystIndex, updates) {
        draft = {
          ...draft,
          tasks: draft.tasks.map(task => {
            if (task.id !== taskId) return task;
            const catalysts = Array.isArray(task.catalysts) ? task.catalysts : [];
            return {
              ...task,
              catalysts: catalysts.map((catalyst, index) => index === catalystIndex ? { ...catalyst, ...updates } : catalyst)
            };
          })
        };
      }

      function updateResultSelection(taskId, updates) {
        draft = {
          ...draft,
          tasks: draft.tasks.map(task => task.id === taskId
            ? { ...task, resultSelection: { ...(task.resultSelection || {}), ...updates } }
            : task)
        };
      }

      function addTask() {
        record('addTask');
      }

      function addCatalyst(taskId) {
        record('addCatalyst', taskId);
      }

      function addResultGroup(taskId) {
        record('addResultGroup', taskId);
      }

      function addResult(taskId, groupId) {
        record('addResult', taskId, groupId);
      }
    </script>

    <EnvironmentsTab
      {environments}
      environmentDraft={draft}
      dirty={true}
      selectedTaskId="task-a"
      {validationState}
      {managedItemOptions}
      availableScriptMacros={[]}
      {sceneOptions}
      {rollTableOptions}
      {saveError}
      onPickImagePath={pickImagePath}
      onSelectEnvironment={selectEnvironment}
      onUpdateEnvironment={updateEnvironment}
      onToggleEnvironmentEnabled={(environmentId, enabled) => record('toggleEnvironmentEnabled', environmentId, enabled)}
      onUpdateTask={updateTask}
      onMoveEnvironment={(environmentId, direction) => record('moveEnvironment', environmentId, direction)}
      onDuplicateEnvironment={(environmentId) => record('duplicateEnvironment', environmentId)}
      onDeleteEnvironment={(environmentId) => record('deleteEnvironment', environmentId)}
      onMoveTask={(taskId, direction) => record('moveTask', taskId, direction)}
      onAddTask={addTask}
      onDuplicateTask={(taskId) => record('duplicateTask', taskId)}
      onDeleteTask={(taskId) => record('deleteTask', taskId)}
      onAddResultGroup={addResultGroup}
      onMoveResultGroup={(taskId, groupId, direction) => record('moveResultGroup', taskId, groupId, direction)}
      onDeleteResultGroup={(taskId, groupId) => record('deleteResultGroup', taskId, groupId)}
      onAddResult={addResult}
      onMoveResult={(taskId, groupId, resultId, direction) => record('moveResult', taskId, groupId, resultId, direction)}
      onDeleteResult={(taskId, groupId, resultId) => record('deleteResult', taskId, groupId, resultId)}
      onAddCatalyst={addCatalyst}
      onUpdateCatalyst={updateCatalyst}
      onUpdateResultSelection={updateResultSelection}
    />
  `;
  const compiled = compile(hostSource, {
    filename: 'Host.svelte',
    generate: 'client',
    dev: true,
    css: 'injected'
  });
  writeFileSync(join(tempRoot, 'Host.svelte.js'), rewriteClientImports(compiled.js.code));
}

async function compileMountedFixture() {
  tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-environments-mounted-'));
  symlinkSync(join(root, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
  writeCompiledSvelte('src/ui/svelte/apps/EnvironmentsTab.svelte', 'src/ui/svelte/apps/EnvironmentsTab.svelte.js');
  for (const componentName of environmentComponentNames) {
    writeCompiledSvelte(
      `src/ui/svelte/apps/environments/${componentName}.svelte`,
      `src/ui/svelte/apps/environments/${componentName}.svelte.js`
    );
  }
  for (const componentName of sharedComponentNames) {
    writeCompiledSvelte(
      `src/ui/svelte/components/${componentName}.svelte`,
      `src/ui/svelte/components/${componentName}.svelte.js`
    );
  }

  mkdirSync(join(tempRoot, 'src/ui/svelte/util'), { recursive: true });
  writeFileSync(join(tempRoot, 'src/ui/svelte/util/foundryBridge.js'), `
    export function localize(key, data = {}) {
      if (key === 'FABRICATE.Admin.Environments.MissingReferenceOption') return \`Missing: \${data.uuid}\`;
      return key;
    }
  `);
  writeHostComponent();
  HostComponent = (await import(pathToFileURL(join(tempRoot, 'Host.svelte.js')).href)).default;
}

function installAdditionalDomGlobals() {
  for (const key of ['Text', 'Comment', 'SVGElement', 'HTMLMediaElement']) {
    restoredGlobals.push([key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    Object.defineProperty(globalThis, key, {
      value: document.defaultView[key],
      writable: true,
      configurable: true
    });
  }

  const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  restoredGlobals.push(['HTMLElement.prototype.scrollIntoView', scrollDescriptor]);
  HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
    this.dataset.scrolledIntoView = 'true';
  };
}

function restoreAdditionalDomGlobals() {
  for (const [key, descriptor] of restoredGlobals.reverse()) {
    if (key === 'HTMLElement.prototype.scrollIntoView') {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
      } else {
        delete HTMLElement.prototype.scrollIntoView;
      }
      continue;
    }
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete globalThis[key];
    }
  }
  restoredGlobals = [];
}

function makeEnvironment() {
  return {
    id: 'environment-a',
    craftingSystemId: 'system-a',
    name: 'Forest',
    description: '',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [{
      id: 'task-a',
      name: 'Forage',
      description: '',
      img: '',
      enabled: true,
      resolutionMode: 'routed',
      catalysts: [],
      visibility: null,
      timeRequirement: { minutes: 0, hours: 0, days: 0, months: 0, years: 0 },
      failureOutcome: null,
      resultSelection: { provider: 'macroOutcome', macroUuid: '' },
      resultGroups: [{
        id: 'group-a',
        name: 'Common',
        results: [{ id: 'result-a', componentId: '', quantity: 1 }]
      }]
    }]
  };
}

async function openEditorFromGridIfNeeded(target) {
  if (target.querySelector('.environment-draft-editor')) return;
  const editButton = target.querySelector('.environment-card-edit');
  if (!editButton) return;
  editButton.click();
  await tick();
  await tick();
}

async function mountFixture() {
  mountedTarget = document.createElement('div');
  document.body.appendChild(mountedTarget);
  mountedComponent = mount(HostComponent, {
    target: mountedTarget,
    props: {
      environmentDraft: makeEnvironment()
    }
  });
  await tick();
  await openEditorFromGridIfNeeded(mountedTarget);
  return mountedTarget;
}

async function mountCustomFixture(props = {}, { openEditor = props.environmentDraft !== null } = {}) {
  mountedTarget = document.createElement('div');
  document.body.appendChild(mountedTarget);
  mountedComponent = mount(HostComponent, {
    target: mountedTarget,
    props: {
      environmentDraft: makeEnvironment(),
      ...props
    }
  });
  await tick();
  if (openEditor) {
    await openEditorFromGridIfNeeded(mountedTarget);
  }
  return mountedTarget;
}

async function closeDetails(details) {
  details.open = false;
  details.dispatchEvent(new Event('toggle'));
  await tick();
  assert.equal(details.open, false, 'test setup should start with the target details collapsed');
}

function setValidationState(validationState) {
  mountedComponent.setValidationState(validationState);
  flushSync();
}

async function settleValidationReveal() {
  await tick();
  await tick();
}

describe('GM environments tab mounted validation reveal', () => {
  before(async () => {
    setupDOM();
    installAdditionalDomGlobals();
    await compileMountedFixture();
  });

  afterEach(() => {
    if (mountedComponent) {
      unmount(mountedComponent);
      mountedComponent = null;
    }
    mountedTarget?.remove();
    mountedTarget = null;
    document.body.innerHTML = '';
  });

  after(() => {
    restoreAdditionalDomGlobals();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('renders environment cards with scene imagery, fallback icons, and direct actions', async () => {
    const forest = makeEnvironment();
    forest.sceneUuid = 'Scene.forest';
    const cavern = {
      ...makeEnvironment(),
      id: 'environment-b',
      name: 'Cavern of Extremely Long Repeating Mineral Veins',
      selectionMode: 'blind',
      enabled: false,
      tasks: [
        {
          ...makeEnvironment().tasks[0],
          id: 'task-b',
          name: 'Prospect'
        }
      ]
    };
    const meadow = {
      ...makeEnvironment(),
      id: 'environment-c',
      name: 'Meadow',
      sceneUuid: 'Scene.missing',
      tasks: []
    };
    const shore = {
      ...makeEnvironment(),
      id: 'environment-d',
      name: 'Shore',
      sceneUuid: null,
      tasks: []
    };
    const target = await mountCustomFixture({
      environmentDraft: forest,
      environments: [forest, cavern, meadow, shore],
      sceneOptions: [{ uuid: 'Scene.forest', name: 'Forest', background: { src: 'forest-full.webp' }, img: 'forest-medium.webp', thumbnail: 'forest-thumb.webp' }]
    }, { openEditor: false });

    const cards = [...target.querySelectorAll('.environment-card')];
    assert.equal(cards.length, 4);
    assert.equal(target.querySelector('.environment-draft-editor'), null);
    assert.equal(target.querySelector('.environment-list')?.classList.contains('environment-card-grid'), true);
    assert.equal(
      target.querySelector('.environment-list'),
      target.querySelector('.environment-foundation')?.firstElementChild,
      'grid should be the primary first view inside the environment foundation'
    );
    assert.equal(cards[0].classList.contains('active'), true);
    assert.equal(cards[0].querySelector('.environment-name')?.textContent, 'Forest');
    assert.match(cards[0].querySelector('.environment-summary')?.textContent || '', /Targeted/);
    assert.equal(cards[0].querySelector('.environment-card-image')?.getAttribute('src'), 'forest-full.webp');
    assert.equal(
      cards[1].querySelector('.environment-name')?.textContent,
      'Cavern of Extremely Long Repeating Mineral Veins'
    );
    assert.match(cards[1].querySelector('.environment-summary')?.textContent || '', /Blind/);
    assert.equal(cards[2].querySelector('.environment-card-image')?.getAttribute('src'), 'icons/svg/item-bag.svg');
    assert.equal(cards[2].querySelector('.environment-card-image')?.classList.contains('fallback'), true);
    assert.equal(cards[3].querySelector('.environment-card-image')?.getAttribute('src'), 'icons/svg/item-bag.svg');
    assert.equal(cards[3].querySelector('.environment-card-image')?.classList.contains('fallback'), true);
    assert.ok(
      cards[1].querySelector('.environment-card-media .environment-card-actions button'),
      'card action buttons should overlay the media area with a long primary label'
    );

    cards[1].querySelector('.environment-card-toggle').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'toggleEnvironmentEnabled',
      args: ['environment-b', true]
    });
    assert.equal(target.querySelector('.environment-draft-editor'), null, 'toggle should stay on the grid view');
    assert.equal(
      mountedComponent.getCalls().some(call => call.name === 'updateEnvironment' && call.args[0]?.enabled === true),
      false,
      'non-selected card toggle should not mutate the selected draft directly'
    );

    target.querySelectorAll('.environment-card')[1].querySelector('.environment-card-delete').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'deleteEnvironment',
      args: ['environment-b']
    });
    assert.equal(target.querySelector('.environment-draft-editor'), null, 'delete should stay on the grid view');
  });

  it('starts persisted environments on the card grid without rendering the draft editor', async () => {
    const forest = makeEnvironment();
    const cavern = {
      ...makeEnvironment(),
      id: 'environment-b',
      name: 'Cavern',
      tasks: []
    };
    const target = await mountCustomFixture({
      environmentDraft: null,
      environments: [forest, cavern]
    }, { openEditor: false });

    assert.equal(target.querySelectorAll('.environment-card').length, 2);
    assert.ok(target.querySelector('.environment-card-grid'), 'initial environments view should show the card grid');
    assert.equal(
      target.querySelector('.environment-draft-editor'),
      null,
      'initial environments view should not render the draft editor before a card edit target is chosen'
    );
  });

  it('opens the draft editor from card image, name, and edit actions, then returns to the grid from back', async () => {
    const editTargets = [
      '.environment-card-body-action',
      '.environment-card-image-action',
      '.environment-name',
      '.environment-card-edit'
    ];

    for (const editTarget of editTargets) {
      const forest = makeEnvironment();
      const target = await mountCustomFixture({
        environmentDraft: null,
        environments: [forest]
      }, { openEditor: false });

      assert.equal(target.querySelector('.environment-draft-editor'), null);

      target.querySelector(editTarget).click();
      await tick();
      await tick();

      assert.deepEqual(mountedComponent.getCalls().at(-1), {
        name: 'selectEnvironment',
        args: ['environment-a']
      });
      assert.ok(
        target.querySelector('.environment-draft-editor'),
        `${editTarget} should reveal the draft editor`
      );

      const backButton = target.querySelector('.environment-back-button');
      assert.ok(backButton, 'environment editor should expose a back button');
      assert.equal(backButton.tagName, 'BUTTON');
      assert.equal(backButton.getAttribute('type'), 'button');

      backButton.click();
      await tick();
      await tick();

      assert.ok(target.querySelector('.environment-card-grid'), 'back should return to the environment card grid');
      assert.equal(
        target.querySelector('.environment-draft-editor'),
        null,
        'back should hide the draft editor'
      );

      unmount(mountedComponent);
      mountedComponent = null;
      mountedTarget?.remove();
      mountedTarget = null;
      document.body.innerHTML = '';
    }
  });

  it('returns to the overview grid when the selected crafting system changes while editing', async () => {
    const forest = makeEnvironment();
    const cavern = {
      ...makeEnvironment(),
      id: 'environment-b',
      craftingSystemId: 'system-b',
      name: 'Cavern',
      tasks: [{
        ...makeEnvironment().tasks[0],
        id: 'task-b',
        name: 'Prospect'
      }]
    };
    const target = await mountCustomFixture({
      environmentDraft: forest,
      environments: [forest]
    }, { openEditor: false });

    target.querySelector('.environment-card-edit').click();
    await tick();
    await tick();
    assert.ok(target.querySelector('.environment-draft-editor'), 'test setup should have the first system editor open');

    mountedComponent.setEnvironmentContext(cavern, [cavern]);
    flushSync();
    await tick();

    assert.ok(target.querySelector('.environment-card-grid'), 'system switch should return to the new system overview');
    assert.equal(
      target.querySelector('.environment-draft-editor'),
      null,
      'system switch should not keep the editor open for the new system first environment'
    );
    assert.equal(target.querySelector('.environment-card .environment-name')?.textContent, 'Cavern');

    target.querySelector('.environment-card-edit').click();
    await tick();
    await tick();

    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'selectEnvironment',
      args: ['environment-b']
    });
    assert.ok(target.querySelector('.environment-draft-editor'), 'new system cards should still open the editor normally');
  });

  it('shows grid-mode save errors when a card action fails while the editor is hidden', async () => {
    const target = await mountCustomFixture({
      environmentDraft: null,
      environments: [makeEnvironment()],
      saveError: 'Toggle failed'
    }, { openEditor: false });

    assert.equal(target.querySelector('.environment-draft-editor'), null);
    assert.equal(target.querySelector('.environment-save-error')?.textContent.trim(), 'Toggle failed');
  });

  it('expands a collapsed invalid subsection before focusing after failed validation', async () => {
    const target = await mountFixture();
    const timeSection = target.querySelector('.environment-time-authoring > details');
    await closeDetails(timeSection);

    setValidationState({
      attempt: 1,
      errors: [{
        id: 'time-error',
        message: 'Time must be positive.',
        path: 'task.task-a.timeRequirement.minutes',
        taskId: 'task-a',
        fieldSelector: '[data-environment-field="task.task-a.timeRequirement.minutes"]'
      }],
      firstInvalidField: {
        path: 'task.task-a.timeRequirement.minutes',
        taskId: 'task-a',
        fieldSelector: '[data-environment-field="task.task-a.timeRequirement.minutes"]'
      }
    });
    await settleValidationReveal();

    const invalidField = target.querySelector('[data-environment-field="task.task-a.timeRequirement.minutes"]');
    assert.equal(timeSection.open, true, 'failed validation should expand the owning subsection');
    assert.equal(document.activeElement, invalidField, 'failed validation should focus the invalid field after reveal');
    assert.equal(invalidField.dataset.scrolledIntoView, 'true', 'failed validation should scroll the invalid field after reveal');
  });

  it('expands a collapsed result section and result group before summary-link focus', async () => {
    const target = await mountFixture();
    setValidationState({
      attempt: 0,
      errors: [{
        id: 'result-error',
        message: 'Result component is required.',
        path: 'task.task-a.result.result-a.componentId',
        taskId: 'task-a',
        fieldSelector: '[data-environment-field="task.task-a.result.result-a.componentId"]'
      }],
      firstInvalidField: null
    });
    await settleValidationReveal();

    const resultSection = target.querySelector('.environment-result-authoring > details');
    const resultGroup = target.querySelector('.environment-result-group > details');
    await closeDetails(resultGroup);
    await closeDetails(resultSection);

    target.querySelector('.environment-validation-link').click();
    await settleValidationReveal();

    const invalidField = target.querySelector('[data-environment-field="task.task-a.result.result-a.componentId"]');
    assert.equal(resultSection.open, true, 'summary link should expand the result-groups subsection');
    assert.equal(resultGroup.open, true, 'summary link should expand the owning result group');
    assert.equal(document.activeElement, invalidField, 'summary link should focus the invalid result field after reveal');
    assert.equal(invalidField.dataset.scrolledIntoView, 'true', 'summary link should scroll the invalid result field after reveal');
  });

  it('keeps stale scene UUIDs visible while manual fallback edits preserve the typed value', async () => {
    const environment = makeEnvironment();
    environment.sceneUuid = 'Scene.stale';
    const target = await mountCustomFixture({
      environmentDraft: environment,
      sceneOptions: [{ uuid: 'Scene.forest', name: 'Forest' }]
    });

    assert.match(
      target.querySelector('#environment-scene-reference-warning')?.textContent || '',
      /LinkedSceneReferenceWarning/,
      'stale scene UUID should show a warning'
    );
    assert.equal(
      target.querySelector('select[aria-label="FABRICATE.Admin.Environments.SceneSelect"]')?.value,
      'Scene.stale',
      'stale scene UUID should remain selected as a manual option'
    );
    assert.equal(
      target.querySelector('select[aria-label="FABRICATE.Admin.Environments.SceneSelect"]')?.getAttribute('aria-describedby'),
      'environment-scene-reference-warning',
      'stale scene select should be described by the warning'
    );
    assert.equal(
      target.querySelector('select[aria-label="FABRICATE.Admin.Environments.SceneSelect"]')?.options[
        target.querySelector('select[aria-label="FABRICATE.Admin.Environments.SceneSelect"]')?.selectedIndex
      ]?.textContent,
      'Missing: Scene.stale',
      'stale scene option should make the missing state visible while preserving the UUID value'
    );

    const input = target.querySelector('[data-environment-field="environment.sceneUuid"]');
    input.value = 'Scene.manual';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    assert.equal(mountedComponent.getEnvironmentDraft().sceneUuid, 'Scene.manual');
  });

  it('keeps stale roll-table UUIDs visible while manual fallback edits preserve the typed value', async () => {
    const environment = makeEnvironment();
    environment.tasks[0].resultSelection = {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.stale'
    };
    const target = await mountCustomFixture({
      environmentDraft: environment,
      rollTableOptions: [{ uuid: 'RollTable.forest', name: 'Forest Table' }]
    });

    assert.match(
      target.querySelector('#environment-roll-table-reference-warning')?.textContent || '',
      /MissingRollTableReferenceWarning/,
      'stale roll-table UUID should show a warning'
    );
    assert.equal(
      target.querySelector('select[aria-label="FABRICATE.Admin.Environments.RollTableSelect"]')?.value,
      'RollTable.stale',
      'stale roll-table UUID should remain selected as a manual option'
    );
    assert.equal(
      target.querySelector('select[aria-label="FABRICATE.Admin.Environments.RollTableSelect"]')?.getAttribute('aria-describedby'),
      'environment-roll-table-reference-warning',
      'stale roll-table select should be described by the warning'
    );
    assert.equal(
      target.querySelector('select[aria-label="FABRICATE.Admin.Environments.RollTableSelect"]')?.options[
        target.querySelector('select[aria-label="FABRICATE.Admin.Environments.RollTableSelect"]')?.selectedIndex
      ]?.textContent,
      'Missing: RollTable.stale',
      'stale roll-table option should make the missing state visible while preserving the UUID value'
    );

    const input = target.querySelector('[data-environment-field="task.task-a.resultSelection.rollTableUuid"]');
    input.value = 'RollTable.manual';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].resultSelection.rollTableUuid, 'RollTable.manual');
  });

  it('preserves the current task image when the injected image picker is cancelled', async () => {
    const environment = makeEnvironment();
    environment.tasks[0].img = 'icons/svg/original.svg';
    const target = await mountCustomFixture({
      environmentDraft: environment,
      pickImagePath: async () => null
    });

    target.querySelector('.image-path-picker-button').click();
    await tick();
    await tick();

    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].img, 'icons/svg/original.svg');
  });

  it('updates the task image from the injected image picker without blocking manual text entry', async () => {
    const target = await mountCustomFixture({
      pickImagePath: async () => 'icons/svg/selected.svg'
    });

    target.querySelector('.image-path-picker-button').click();
    await tick();
    await tick();
    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].img, 'icons/svg/selected.svg');

    const input = target.querySelector('[data-environment-field="task.task-a.img"]');
    input.value = 'icons/svg/manual.svg';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].img, 'icons/svg/manual.svg');
  });

  it('shows unavailable image picker text while keeping manual entry enabled', async () => {
    const target = await mountCustomFixture({
      pickImagePath: null
    });

    const button = target.querySelector('.image-path-picker-button');
    const input = target.querySelector('[data-environment-field="task.task-a.img"]');
    assert.equal(button.disabled, true);
    assert.equal(button.textContent.trim(), 'FABRICATE.Admin.Environments.ImagePickerUnavailable');

    input.value = 'icons/svg/manual-unavailable.svg';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].img, 'icons/svg/manual-unavailable.svg');
  });

  it('keeps contextual reorder actions keyboard-reachable with disabled boundaries and existing callbacks', async () => {
    const environment = makeEnvironment();
    environment.tasks.push({
      ...environment.tasks[0],
      id: 'task-b',
      name: 'Hunt',
      resultGroups: []
    });
    environment.tasks[0].resultGroups.push({
      id: 'group-b',
      name: 'Rare',
      results: [{ id: 'result-b', componentId: '', quantity: 1 }]
    });
    environment.tasks[0].resultGroups[0].results.push({ id: 'result-c', componentId: '', quantity: 1 });
    const target = await mountCustomFixture({
      environmentDraft: environment,
      environments: [
        { id: 'environment-a', name: 'Forest', tasks: environment.tasks },
        { id: 'environment-b', name: 'Cave', tasks: [] }
      ]
    }, { openEditor: false });

    const environmentMenuTrigger = target.querySelector('.environment-card .environment-action-menu-trigger');
    environmentMenuTrigger.focus();
    environmentMenuTrigger.click();
    await tick();
    assert.equal(document.activeElement, environmentMenuTrigger, 'action menu trigger should be keyboard focusable');
    assert.equal(environmentMenuTrigger.getAttribute('aria-label'), 'FABRICATE.Admin.Environments.ActionsForEnvironment');
    assert.equal(target.querySelector('.environment-action-menu-list').getAttribute('role'), null);
    assert.equal(target.querySelector('.environment-action-menu-list [data-environment-action="delete"]').textContent.trim(), 'FABRICATE.Admin.Environments.DeleteEnvironmentNamed');
    assert.equal(target.querySelector('.environment-action-menu-list [data-environment-action="move-up"]').disabled, true);
    assert.equal(target.querySelector('.environment-action-menu-list [data-environment-action="move-down"]').disabled, false);
    target.querySelector('.environment-action-menu-list [data-environment-action="move-down"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'moveEnvironment',
      args: ['environment-a', 'down']
    });
    assert.equal(target.querySelector('.environment-draft-editor'), null, 'environment menu actions should stay on the grid');

    target.querySelector('.environment-card-edit').click();
    await tick();
    await tick();

    target.querySelectorAll('.environment-task-row .environment-action-menu-trigger')[0].click();
    await tick();
    assert.equal(
      target.querySelectorAll('.environment-task-row .environment-action-menu-trigger')[0].getAttribute('aria-label'),
      'FABRICATE.Admin.Environments.TaskActionsFor'
    );
    assert.equal(target.querySelector('.environment-action-menu-list [data-environment-action="delete"]').textContent.trim(), 'FABRICATE.Admin.Environments.DeleteTaskNamed');
    target.querySelector('.environment-action-menu-list [data-environment-action="duplicate"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'duplicateTask',
      args: ['task-a']
    });

    target.querySelectorAll('.environment-result-group .environment-action-menu-trigger')[0].click();
    await tick();
    assert.equal(
      target.querySelectorAll('.environment-result-group .environment-action-menu-trigger')[0].getAttribute('aria-label'),
      'FABRICATE.Admin.Environments.ResultGroupActionsFor'
    );
    assert.equal(target.querySelector('.environment-action-menu-list [data-environment-action="delete"]').textContent.trim(), 'FABRICATE.Admin.Environments.DeleteResultGroupNamed');
    target.querySelector('.environment-action-menu-list [data-environment-action="move-down"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'moveResultGroup',
      args: ['task-a', 'group-a', 'down']
    });

    target.querySelectorAll('.environment-result-row:not(.environment-result-row-heading) .environment-action-menu-trigger')[0].click();
    await tick();
    assert.equal(
      target.querySelectorAll('.environment-result-row:not(.environment-result-row-heading) .environment-action-menu-trigger')[0].getAttribute('aria-label'),
      'FABRICATE.Admin.Environments.ResultActionsFor'
    );
    assert.equal(target.querySelector('.environment-action-menu-list [data-environment-action="delete"]').textContent.trim(), 'FABRICATE.Admin.Environments.DeleteResultNamed');
    target.querySelector('.environment-action-menu-list [data-environment-action="delete"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'deleteResult',
      args: ['task-a', 'group-a', 'result-a']
    });
  });

  it('opens lower contextual action groups upward and closes with Escape returning focus', async () => {
    const target = await mountCustomFixture({
      environments: [
        { id: 'environment-a', name: 'Forest', tasks: [] },
        { id: 'environment-b', name: 'Cave', tasks: [] }
      ]
    }, { openEditor: false });
    const trigger = target.querySelectorAll('.environment-card .environment-action-menu-trigger')[1];
    const originalInnerHeight = globalThis.innerHeight;
    const originalGetComputedStyle = globalThis.getComputedStyle;
    const originalTriggerRect = trigger.getBoundingClientRect;

    globalThis.innerHeight = 240;
    globalThis.getComputedStyle = () => ({ overflow: 'visible', overflowY: 'visible', overflowX: 'visible' });
    trigger.getBoundingClientRect = () => ({
      top: 210,
      bottom: 232,
      left: 0,
      right: 24,
      width: 24,
      height: 22
    });

    try {
      trigger.focus();
      trigger.click();
      await tick();

      const actionMenu = trigger.closest('.environment-action-menu');
      assert.equal(actionMenu.classList.contains('open-up'), true, 'lower-row action groups should open upward');
      assert.equal(actionMenu.dataset.openDirection, 'up');

      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await tick();

      assert.equal(actionMenu.classList.contains('open'), false);
      assert.equal(document.activeElement, trigger, 'Escape should return focus to the disclosure trigger');
    } finally {
      globalThis.innerHeight = originalInnerHeight;
      globalThis.getComputedStyle = originalGetComputedStyle;
      trigger.getBoundingClientRect = originalTriggerRect;
    }
  });

  it('subordinates catalyst dependent controls while preserving draft values when degradation is disabled', async () => {
    const environment = makeEnvironment();
    environment.tasks[0].catalysts = [{
      componentId: 'component-a',
      degradesOnUse: false,
      destroyWhenExhausted: true,
      maxUses: 3
    }];
    const target = await mountCustomFixture({
      environmentDraft: environment,
      managedItemOptions: [{ id: 'component-a', name: 'Herb' }]
    });

    const degradesInput = target.querySelector('[data-environment-field="task.task-a.catalysts.0.degradesOnUse"]');
    const destroyInput = target.querySelector('[data-environment-field="task.task-a.catalysts.0.destroyWhenExhausted"]');
    const maxUsesInput = target.querySelector('[data-environment-field="task.task-a.catalysts.0.maxUses"]');
    const dependentLabels = target.querySelectorAll('.environment-catalyst-dependent');

    assert.equal(degradesInput.checked, false);
    assert.equal(destroyInput.disabled, true);
    assert.equal(destroyInput.checked, true, 'disabled destroy setting should keep its draft value');
    assert.equal(maxUsesInput.disabled, true);
    assert.equal(maxUsesInput.value, '3', 'disabled max uses should keep its draft value in the DOM');
    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].catalysts[0].destroyWhenExhausted, true);
    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].catalysts[0].maxUses, 3);
    assert.ok(
      [...dependentLabels].every(label => label.classList.contains('is-subordinate')),
      'dependent controls should be visually subordinated while disabled'
    );

    degradesInput.checked = true;
    degradesInput.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    assert.equal(mountedComponent.getEnvironmentDraft().tasks[0].catalysts[0].degradesOnUse, true);
    assert.equal(destroyInput.disabled, false);
    assert.equal(destroyInput.checked, true, 'reenabling degradation should restore the previous destroy value');
    assert.equal(maxUsesInput.disabled, false);
    assert.equal(maxUsesInput.value, '3', 'reenabling degradation should restore the previous max uses value');
  });

  it('renders selected catalyst and result item identity beside their editable controls', async () => {
    const environment = makeEnvironment();
    environment.tasks[0].catalysts = [{
      componentId: 'component-a',
      degradesOnUse: true,
      destroyWhenExhausted: false,
      maxUses: 3
    }];
    environment.tasks[0].resultGroups[0].results[0].componentId = 'component-a';
    const target = await mountCustomFixture({
      environmentDraft: environment,
      managedItemOptions: [{
        id: 'component-a',
        name: 'Mooncap',
        img: 'icons/mooncap.webp',
        difficulty: 4
      }]
    });

    const identityBlocks = target.querySelectorAll('.environment-selected-item');
    assert.ok(identityBlocks.length >= 2, 'selected catalyst and result rows should expose an item identity block');
    assert.ok(
      [...identityBlocks].some(block => /Mooncap/.test(block.textContent || '')),
      'item identity block should show the selected item name'
    );
    assert.ok(
      [...target.querySelectorAll('.environment-selected-item img')].some(img => img.getAttribute('src') === 'icons/mooncap.webp'),
      'item identity block should show the selected item image'
    );
  });

  it('turns passive editor empty states into direct controls that call existing callbacks', async () => {
    const emptyTaskEnvironment = makeEnvironment();
    emptyTaskEnvironment.tasks = [];
    let target = await mountCustomFixture({
      environmentDraft: emptyTaskEnvironment
    });

    target.querySelector('.environment-empty-action [data-environment-empty-action="add-task"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'addTask',
      args: []
    });

    unmount(mountedComponent);
    mountedComponent = null;
    mountedTarget?.remove();
    mountedTarget = null;

    const environment = makeEnvironment();
    environment.tasks[0].catalysts = [];
    environment.tasks[0].resultGroups = [];
    target = await mountCustomFixture({
      environmentDraft: environment
    });

    target.querySelector('[data-environment-empty-action="enable-visibility"]').click();
    await tick();
    assert.equal(
      target.querySelector('[data-environment-field="task.task-a.visibility.provider"]')?.value,
      'macro',
      'visibility empty state should enable the existing visibility controls'
    );

    target.querySelector('[data-environment-empty-action="add-catalyst"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'addCatalyst',
      args: ['task-a']
    });

    target.querySelector('[data-environment-empty-action="add-result-group"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'addResultGroup',
      args: ['task-a']
    });

    unmount(mountedComponent);
    mountedComponent = null;
    mountedTarget?.remove();
    mountedTarget = null;

    const emptyResultEnvironment = makeEnvironment();
    emptyResultEnvironment.tasks[0].resultGroups[0].results = [];
    target = await mountCustomFixture({
      environmentDraft: emptyResultEnvironment
    });

    target.querySelector('[data-environment-empty-action="add-result"]').click();
    await tick();
    assert.deepEqual(mountedComponent.getCalls().at(-1), {
      name: 'addResult',
      args: ['task-a', 'group-a']
    });
  });
});
