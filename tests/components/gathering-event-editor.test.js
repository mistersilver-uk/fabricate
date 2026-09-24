import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROUTE_EXIT_GUARDS } from '../../src/ui/svelte/apps/manager/routeExitGuards.js';
import { defineStructureContract } from '../helpers/structureContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEventEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');
const MANAGER_ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';
const GATHERING_ROUTE_MODEL = 'src/ui/svelte/apps/manager/gatheringRouteModel.svelte.js';
const GATHERING_DISPLAY = 'src/ui/svelte/apps/manager/gatheringDisplay.js';
const GATHERING_DRAFT_HANDLERS = 'src/ui/svelte/apps/manager/gatheringDraftHandlers.svelte.js';
const GATHERING_MODIFIER_HANDLERS = 'src/ui/svelte/apps/manager/gatheringModifierHandlers.svelte.js';

const chanceSliderPath = resolve(repoRoot, 'src/ui/svelte/components/ChanceSlider.svelte');

const editorSource = readFileSync(editorPath, 'utf8');
const chanceSliderSource = readFileSync(chanceSliderPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
// The header's action toolbar moved out of the root in issue 1720.
const gatheringActionsSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte'),
  'utf8'
);
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('GatheringEventEditView source contract', () => {
  it('exposes event identity, availability, dangerTags, and dropRate sections', () => {
    assert.ok(editorSource.includes('data-gathering-event-editor'), 'editor should expose a data attribute hook');
    assert.ok(editorSource.includes('data-gathering-event-core-editor'), 'editor should expose an identity section');
    assert.ok(editorSource.includes("data-gathering-event-field=\"name\""), 'editor should bind the name field');
    assert.ok(editorSource.includes("data-gathering-event-field=\"enabled\""), 'editor should expose an enabled toggle');
    assert.ok(editorSource.includes('data-gathering-event-availability'), 'editor should expose an availability matching section');
    assert.ok(editorSource.includes('data-gathering-event-danger-tags'), 'editor should expose a danger tags section');
    assert.ok(editorSource.includes('data-gathering-event-drop-rate'), 'editor should expose a drop rate section');
    assert.equal(
      editorSource.includes('data-gathering-event-character-modifiers'),
      false,
      'character-modifier section should live in the right inspector, not the main editor'
    );
  });

  // The 1..100 floor is an EVENT rule — the hint says "Chance from 1 to 100".
  it('clamps dropRate to 1..100 before dispatching the update', () => {
    assert.ok(/\bmin=\{1\}/.test(editorSource), 'editor should ask the shared slider for a floor of 1');
    assert.equal(
      /\bmax=/.test(editorSource),
      false,
      'the ceiling is the shared slider default; restating it would be a second declaration'
    );
    assert.ok(/\bmax = 100\b/.test(chanceSliderSource), 'the shared slider ceiling is 100');
    assert.ok(
      chanceSliderSource.includes('return Math.min(upper, Math.max(lower, stepped));'),
      'the shared slider clamps to its own min/max before reporting a change'
    );
    assert.ok(
      editorSource.includes('dropRateValid') && editorSource.includes('DropRateInvalid'),
      'the editor still judges a STORED rate below the floor and says so'
    );
  });

  it('renders a validation hint when the name is empty', () => {
    assert.ok(editorSource.includes('NameRequired'), 'editor should reference the NameRequired localization key');
    assert.ok(editorSource.includes('!nameValid'), 'editor should branch on name validity');
  });

  it('locks danger tags to the six-step RAG scale and removes the custom input', () => {
    assert.ok(
      editorSource.includes("['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']"),
      'editor should seed the six fixed danger levels'
    );
    assert.ok(editorSource.includes('manager-danger-tag-pill'), 'editor should render danger tags as pills');
    assert.ok(
      /data-danger-tag=\{tag\}[\s\S]*<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"><\/i>/.test(editorSource),
      'selected danger tag pills should render a decorative triangle warning icon'
    );
    assert.ok(
      /data-danger-tag-suggestion=\{tag\}[\s\S]*<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"><\/i>/.test(editorSource),
      'danger tag suggestion pills should render a decorative triangle warning icon'
    );
    assert.equal(editorSource.includes('manager-danger-tag-input-row'), false, 'custom danger tag input row should be removed');
    assert.equal(editorSource.includes('dangerTagInput'), false, 'dangerTagInput state should be removed');
    assert.equal(/function\s+onDangerTagInputKey\s*\(/.test(editorSource), false, 'onDangerTagInputKey helper should be removed');
  });

  it('renders the drop rate with the shared percentage slider widget', () => {
    assert.ok(
      editorSource.includes("import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';"),
      'editor should import the drop-rate tier helpers'
    );
    // Issue 883: the widget is the shared `ChanceSlider`, not a local re-derivation of it.
    assert.ok(
      editorSource.includes("import ChanceSlider from '../../components/ChanceSlider.svelte';"),
      'editor should import the shared chance slider'
    );
    assert.ok(editorSource.includes('<ChanceSlider'), 'editor should render the shared chance slider');
    assert.ok(
      /resolveColor=\{dropRateTierColor\}/.test(editorSource) &&
        /controlClass=\{dropRateTierClass\(dropRateValue\)\}/.test(editorSource),
      'editor should feed the shared slider its tier colour and tier class'
    );
    for (const dead of [
      'manager-drop-rate-control',
      'manager-drop-rate-percent',
      'manager-drop-rate-track',
      'manager-drop-rate-fill',
      'type="range"',
    ]) {
      assert.equal(
        editorSource.includes(dead),
        false,
        `editor should render through the shared slider, not hand-rolled ${dead}`
      );
    }
    // Matched as a definition and as a binding, not as a bare name.
    assert.equal(
      /function\s+onDropRateInput\s*\(/.test(editorSource),
      false,
      'the local drop-rate handler should be gone, not merely unused'
    );
    assert.equal(
      /oninput=\{onDropRateInput\}/.test(editorSource),
      false,
      'nothing should still bind the removed drop-rate handler'
    );
  });

  it('drops the redundant Event modifier UI', () => {
    assert.equal(editorSource.includes('data-gathering-event-modifier'), false, 'event-modifier section should be removed');
    assert.equal(editorSource.includes('ProviderExpressionInput'), false, 'ProviderExpressionInput import should be removed');
    assert.equal(/function\s+setEventModifier\s*\(/.test(editorSource), false, 'setEventModifier helper should be removed');
    assert.equal(/function\s+enableEventModifier\s*\(/.test(editorSource), false, 'enableEventModifier helper should be removed');
  });

  // The two hook pins this block opened with are asserted in the DOM now — at the event route by
  // `manager-gathering-mounted.js`, at both subjects by `manager-environments-mounted.js` — because
  // issue 1707 computes every hook name from `subject` and no root literal spells them.
  // The handlers moved into the gathering modifier unit (issue 1721). Application mode is a single
  // global system setting, so no per-modifier mode reaches the update.
  defineStructureContract(
    'handles the event modifier inspector (time, weather, character)',
    GATHERING_MODIFIER_HANDLERS,
    {
      names: [
        'addGatheringEventConditionModifier',
        'updateGatheringEventConditionModifier',
        'deleteGatheringEventConditionModifier',
        'onUpdateEventCharacterModifier',
        'onDeleteEventCharacterModifier',
        'pickCharacterModifierForEvent',
      ],
    }
  );
  defineStructureContract(
    'sends no per-modifier mode with a character modifier update',
    [MANAGER_ROOT, GATHERING_MODIFIER_HANDLERS],
    { callsWithNo: [['onUpdateEventCharacterModifier', 'mode']] }
  );

  // The operator Positive/Negative <select> is gone; value is typed signed. The coloured box, the
  // signed-input wrapper, its `inputmode` and its `%` adornment are asserted in the DOM by
  // `manager-environments-mounted.js`.
  defineStructureContract(
    'classes, formats and splits a signed condition modifier value',
    GATHERING_DISPLAY,
    { exports: ['gatheringModifierValueClass', 'gatheringModifierDisplayValue', 'signedToOperatorValue'] }
  );
  defineStructureContract(
    'keeps neither the two-line value body nor the operator-only class helper',
    [MANAGER_ROOT, GATHERING_ROUTE_MODEL, GATHERING_DISPLAY],
    { spellsNo: ['manager-condition-modifier-row-body'], namesNo: ['gatheringDropModifierOperatorClass'] }
  );

  // The `onkeydown` attribute is the shared panel's now, and since issue 1707 phase 2 the drop's
  // arity normalisation is the task leaf's; since phase 3 the root hands both steppers to the
  // rail under scope-distinguished names, and since issue 1721 the steppers are the modifier
  // unit's. The normalised call reaching the real row is asserted by the mounted Arrow-step case
  // in `manager-gathering-mounted.js`.
  defineStructureContract('steps condition modifier values with Arrow Up/Down', GATHERING_MODIFIER_HANDLERS, {
    names: ['onGatheringDropModifierKeydown', 'onGatheringEventModifierKeydown'],
    spellsExactly: ['ArrowUp', 'ArrowDown'],
  });
  defineStructureContract('hands each scope its own keydown stepper', MANAGER_ROOT, {
    passesProps: [
      ['GatheringInspectorRail', 'onDropConditionModifierKeydown'],
      ['GatheringInspectorRail', 'onEventConditionModifierKeydown'],
    ],
    reads: ['modifiers.onGatheringDropModifierKeydown', 'modifiers.onGatheringEventModifierKeydown'],
  });

  it('exposes an optional linked-scene row with drag-drop, unlink, and right-click removal', () => {
    assert.ok(editorSource.includes('data-gathering-event-scene'), 'editor should expose a linked-scene section');
    assert.ok(editorSource.includes('use:dragDrop'), 'linked-scene drop zone should use the dragDrop action');
    assert.ok(editorSource.includes('function handleSceneDrop'), 'editor should expose a scene drop handler');
    assert.ok(editorSource.includes("type !== 'Scene'"), 'drop handler should only accept Scene documents');
    assert.ok(editorSource.includes('onUpdateEvent({ linkedSceneUuid:'), 'linking/unlinking should patch linkedSceneUuid via onUpdateEvent');
    assert.ok(editorSource.includes('oncontextmenu'), 'linked scene should support right-click removal');
    assert.ok(editorSource.includes('fa-link-slash'), 'linked scene should expose an unlink button');
    assert.ok(editorSource.includes('viewScene(linkedSceneUuid)'), 'clicking the scene name should navigate the GM to the scene');
  });

  // The draft, its baseline and what they derive are driven by `tests/manager-gathering-route-model.test.js`.
  defineStructureContract('stages the event draft in the gathering route model', GATHERING_ROUTE_MODEL, {
    spellsExactly: [
      'gatheringEventDraft',
      'gatheringEventDraftBaseline',
      'editingGatheringEvent',
      'gatheringEventDraftDirty',
      'gatheringEventValidation',
    ],
  });

  // Save, delete and back are the draft handlers', and edit opens the event's own route.
  defineStructureContract('saves, deletes and leaves the event draft', GATHERING_DRAFT_HANDLERS, {
    names: ['saveGatheringEventDraft', 'deleteGatheringEventDraft', 'backToGatheringEventLibrary'],
    property: [['route', 'gathering-event-edit']],
  });

  it('stages event edits in a draft with Save + Dirty toolbar parity with tasks', () => {
    assert.ok(ROUTE_EXIT_GUARDS.some((guard) => guard.view === 'gathering-event-edit'), 'route-exit chain should include event confirm');
    assert.ok(gatheringActionsSource.includes('FABRICATE.Admin.Manager.Environment.Events.Save'), 'toolbar Save button uses the event Save lang key');
    assert.ok(gatheringActionsSource.includes('FABRICATE.Admin.Manager.Environment.Events.Dirty'), 'toolbar Dirty chip uses the event Dirty lang key');
    assert.ok(rootSource.includes('event={gathering.editingGatheringEvent}'), 'editor mount should bind the draft event');
  });

  it('mounts at the gathering-event-edit route and exposes a back-to-library affordance', () => {
    assert.ok(
      rootSource.includes("currentView === 'gathering-event-edit'"),
      'manager root should branch on gathering-event-edit'
    );
    assert.ok(
      rootSource.includes('<GatheringEventEditView'),
      'manager root should mount the event editor component'
    );
    assert.equal(
      environmentsBrowserSource.includes('GatheringEventEditView'),
      false,
      'editor should no longer mount inline inside EnvironmentsBrowserView'
    );
  });

  it('localizes the event editor labels', () => {
    const eventsNamespace = lang.FABRICATE.Admin.Manager.Environment.Events;
    assert.ok(eventsNamespace, 'lang/en.json should declare the Events namespace');
    for (const key of [
      'EventIdentity', 'EventIdentityHint', 'EventAvailability',
      'AvailabilityHint', 'DangerTagsHint', 'DropRateHint', 'DropRateInvalid',
      'CharacterModifiers',
      'CharacterModifiersHint', 'CharacterModifierOperator', 'CharacterModifierMin',
      'CharacterModifierMax', 'CharacterModifierOverride'
    ]) {
      assert.ok(eventsNamespace[key], `Events namespace should declare ${key}`);
    }
    const dangerTagLabels = eventsNamespace.DangerTag;
    assert.ok(dangerTagLabels, 'Events namespace should expose DangerTag labels');
    for (const tag of ['safe', 'hazardous', 'dangerous', 'deadly']) {
      assert.ok(dangerTagLabels[tag], `DangerTag namespace should declare ${tag}`);
    }
  });
});
