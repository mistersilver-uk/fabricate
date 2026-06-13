import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringEventEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');

const editorSource = readFileSync(editorPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
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

  it('clamps dropRate to 1..100 before dispatching the update', () => {
    assert.ok(editorSource.includes('Math.min(100, Math.max(1, Math.floor(raw)))'), 'dropRate input should clamp to 1..100 before calling onUpdateEvent');
    assert.ok(editorSource.includes('min="1"'), 'dropRate input element should set min=1');
    assert.ok(editorSource.includes('max="100"'), 'dropRate input element should set max=100');
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
    assert.ok(editorSource.includes('manager-drop-rate-control'), 'editor should render the drop-rate slider control');
    assert.ok(editorSource.includes('manager-drop-rate-percent'), 'editor should render the drop-rate percent input');
    assert.ok(editorSource.includes('manager-drop-rate-fill'), 'editor should render the drop-rate fill bar');
    assert.ok(editorSource.includes('type="range"'), 'editor should render a range input alongside the text input');
  });

  it('drops the redundant Event modifier UI', () => {
    assert.equal(editorSource.includes('data-gathering-event-modifier'), false, 'event-modifier section should be removed');
    assert.equal(editorSource.includes('ProviderExpressionInput'), false, 'ProviderExpressionInput import should be removed');
    assert.equal(/function\s+setEventModifier\s*\(/.test(editorSource), false, 'setEventModifier helper should be removed');
    assert.equal(/function\s+enableEventModifier\s*\(/.test(editorSource), false, 'enableEventModifier helper should be removed');
  });

  it('renders the event modifier inspector (time, weather, character) from the manager root', () => {
    assert.ok(rootSource.includes('data-gathering-event-condition-modifiers={kind}'), 'root should render event condition modifier cards');
    assert.ok(rootSource.includes('data-gathering-event-character-modifiers'), 'root should render event character modifier card');
    assert.ok(rootSource.includes('addGatheringEventConditionModifier'), 'root should expose add condition modifier handler');
    assert.ok(rootSource.includes('updateGatheringEventConditionModifier'), 'root should expose update condition modifier handler');
    assert.ok(rootSource.includes('deleteGatheringEventConditionModifier'), 'root should expose delete condition modifier handler');
    assert.ok(rootSource.includes('onUpdateEventCharacterModifier'), 'root should expose update character modifier handler');
    assert.ok(rootSource.includes('onDeleteEventCharacterModifier'), 'root should expose delete character modifier handler');
    assert.ok(rootSource.includes('pickCharacterModifierForEvent'), 'root should expose a picker for adding character modifiers');
    assert.ok(
      rootSource.includes('onUpdateEventCharacterModifier(ref.id, { mode: event.currentTarget.value })'),
      'event character modifier editor should render a per-modifier mode select'
    );
  });

  it('renders condition modifiers as a single signed number input that colors its box by value', () => {
    // The operator Positive/Negative <select> is gone; value is typed signed.
    assert.ok(rootSource.includes('function gatheringModifierValueClass'), 'root should expose a signed value-class helper');
    assert.ok(rootSource.includes('function signedToOperatorValue'), 'root should split a signed input back into { operator, value }');
    assert.ok(
      rootSource.includes('manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}'),
      'condition modifier box should be colored by its signed value'
    );
    assert.ok(rootSource.includes('class="manager-condition-modifier-value"'), 'condition modifier should use the single signed-input wrapper');
    assert.equal(rootSource.includes('manager-condition-modifier-row-body'), false, 'the old two-line value body should be removed');
    assert.equal(rootSource.includes('gatheringDropModifierOperatorClass'), false, 'the operator-only class helper should be removed');
  });

  it('formats condition modifier values as signed percentages', () => {
    assert.ok(rootSource.includes('function gatheringModifierDisplayValue'), 'root should expose a signed display formatter');
    assert.ok(rootSource.includes('value={gatheringModifierDisplayValue(modifier)}'), 'condition modifier input should render the formatted signed value');
    assert.ok(/<input\s+type="text"\s+inputmode="numeric"/.test(rootSource), 'condition modifier value should be a numeric text input so a leading + can render');
    assert.ok(rootSource.includes('<span aria-hidden="true">%</span>'), 'condition modifier value should show a % adornment');
  });

  it('supports Arrow Up/Down stepping on condition modifier values', () => {
    assert.ok(rootSource.includes('function onGatheringDropModifierKeydown'), 'root should expose a drop modifier keydown stepper');
    assert.ok(rootSource.includes('function onGatheringEventModifierKeydown'), 'root should expose an event modifier keydown stepper');
    assert.ok(rootSource.includes('onkeydown={(event) => onGatheringDropModifierKeydown'), 'drop modifier input should wire the keydown stepper');
    assert.ok(rootSource.includes('onkeydown={(event) => onGatheringEventModifierKeydown'), 'event modifier input should wire the keydown stepper');
    assert.ok(/onGatheringDropModifierKeydown[\s\S]*ArrowUp[\s\S]*ArrowDown/.test(rootSource), 'stepper should handle ArrowUp and ArrowDown');
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

  it('stages event edits in a draft with Save + Dirty toolbar parity with tasks', () => {
    assert.ok(rootSource.includes('let gatheringEventDraft = $state(null)'), 'root should declare an event draft state');
    assert.ok(rootSource.includes('let gatheringEventDraftBaseline = $state(null)'), 'root should declare an event draft baseline');
    assert.ok(rootSource.includes('const editingGatheringEvent = $derived'), 'root should expose an editingGatheringEvent derived');
    assert.ok(rootSource.includes('const gatheringEventDraftDirty = $derived'), 'root should expose an event dirty derived');
    assert.ok(rootSource.includes('const gatheringEventValidation = $derived'), 'root should expose an event validation derived');
    assert.ok(rootSource.includes('function saveGatheringEventDraft'), 'root should expose saveGatheringEventDraft');
    assert.ok(rootSource.includes('function deleteGatheringEventDraft'), 'root should expose deleteGatheringEventDraft');
    assert.ok(rootSource.includes('function confirmGatheringEventRouteExit'), 'route-exit chain should include event confirm');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Events.Save'), 'toolbar Save button uses the event Save lang key');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Events.Dirty'), 'toolbar Dirty chip uses the event Dirty lang key');
    assert.ok(rootSource.includes('event={editingGatheringEvent}'), 'editor mount should bind the draft event');
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
    assert.ok(
      rootSource.includes('function backToGatheringEventLibrary'),
      'manager root should expose backToGatheringEventLibrary'
    );
    assert.ok(
      rootSource.includes("activeView = 'gathering-event-edit'"),
      'editGatheringEvent should set the view to gathering-event-edit'
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
