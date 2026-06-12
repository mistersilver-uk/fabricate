import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringHazardEditView.svelte');
const rootPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const environmentsBrowserPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');

const editorSource = readFileSync(editorPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');
const environmentsBrowserSource = readFileSync(environmentsBrowserPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('GatheringHazardEditView source contract', () => {
  it('exposes hazard identity, availability, dangerTags, and dropRate sections', () => {
    assert.ok(editorSource.includes('data-gathering-hazard-editor'), 'editor should expose a data attribute hook');
    assert.ok(editorSource.includes('data-gathering-hazard-core-editor'), 'editor should expose an identity section');
    assert.ok(editorSource.includes("data-gathering-hazard-field=\"name\""), 'editor should bind the name field');
    assert.ok(editorSource.includes("data-gathering-hazard-field=\"enabled\""), 'editor should expose an enabled toggle');
    assert.ok(editorSource.includes('data-gathering-hazard-availability'), 'editor should expose an availability matching section');
    assert.ok(editorSource.includes('data-gathering-hazard-danger-tags'), 'editor should expose a danger tags section');
    assert.ok(editorSource.includes('data-gathering-hazard-drop-rate'), 'editor should expose a drop rate section');
    assert.equal(
      editorSource.includes('data-gathering-hazard-character-modifiers'),
      false,
      'character-modifier section should live in the right inspector, not the main editor'
    );
  });

  it('clamps dropRate to 1..100 before dispatching the update', () => {
    assert.ok(editorSource.includes('Math.min(100, Math.max(1, Math.floor(raw)))'), 'dropRate input should clamp to 1..100 before calling onUpdateHazard');
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

  it('drops the redundant Hazard modifier UI', () => {
    assert.equal(editorSource.includes('data-gathering-hazard-modifier'), false, 'hazard-modifier section should be removed');
    assert.equal(editorSource.includes('ProviderExpressionInput'), false, 'ProviderExpressionInput import should be removed');
    assert.equal(/function\s+setHazardModifier\s*\(/.test(editorSource), false, 'setHazardModifier helper should be removed');
    assert.equal(/function\s+enableHazardModifier\s*\(/.test(editorSource), false, 'enableHazardModifier helper should be removed');
  });

  it('renders the hazard modifier inspector (time, weather, character) from the manager root', () => {
    assert.ok(rootSource.includes('data-gathering-hazard-condition-modifiers={kind}'), 'root should render hazard condition modifier cards');
    assert.ok(rootSource.includes('data-gathering-hazard-character-modifiers'), 'root should render hazard character modifier card');
    assert.ok(rootSource.includes('addGatheringHazardConditionModifier'), 'root should expose add condition modifier handler');
    assert.ok(rootSource.includes('updateGatheringHazardConditionModifier'), 'root should expose update condition modifier handler');
    assert.ok(rootSource.includes('deleteGatheringHazardConditionModifier'), 'root should expose delete condition modifier handler');
    assert.ok(rootSource.includes('onUpdateHazardCharacterModifier'), 'root should expose update character modifier handler');
    assert.ok(rootSource.includes('onDeleteHazardCharacterModifier'), 'root should expose delete character modifier handler');
    assert.ok(rootSource.includes('pickCharacterModifierForHazard'), 'root should expose a picker for adding character modifiers');
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
    assert.ok(rootSource.includes('function onGatheringHazardModifierKeydown'), 'root should expose a hazard modifier keydown stepper');
    assert.ok(rootSource.includes('onkeydown={(event) => onGatheringDropModifierKeydown'), 'drop modifier input should wire the keydown stepper');
    assert.ok(rootSource.includes('onkeydown={(event) => onGatheringHazardModifierKeydown'), 'hazard modifier input should wire the keydown stepper');
    assert.ok(/onGatheringDropModifierKeydown[\s\S]*ArrowUp[\s\S]*ArrowDown/.test(rootSource), 'stepper should handle ArrowUp and ArrowDown');
  });

  it('exposes an optional linked-scene row with drag-drop, unlink, and right-click removal', () => {
    assert.ok(editorSource.includes('data-gathering-hazard-scene'), 'editor should expose a linked-scene section');
    assert.ok(editorSource.includes('use:dragDrop'), 'linked-scene drop zone should use the dragDrop action');
    assert.ok(editorSource.includes('function handleSceneDrop'), 'editor should expose a scene drop handler');
    assert.ok(editorSource.includes("type !== 'Scene'"), 'drop handler should only accept Scene documents');
    assert.ok(editorSource.includes('onUpdateHazard({ linkedSceneUuid:'), 'linking/unlinking should patch linkedSceneUuid via onUpdateHazard');
    assert.ok(editorSource.includes('oncontextmenu'), 'linked scene should support right-click removal');
    assert.ok(editorSource.includes('fa-link-slash'), 'linked scene should expose an unlink button');
    assert.ok(editorSource.includes('viewScene(linkedSceneUuid)'), 'clicking the scene name should navigate the GM to the scene');
  });

  it('stages hazard edits in a draft with Save + Dirty toolbar parity with tasks', () => {
    assert.ok(rootSource.includes('let gatheringHazardDraft = $state(null)'), 'root should declare a hazard draft state');
    assert.ok(rootSource.includes('let gatheringHazardDraftBaseline = $state(null)'), 'root should declare a hazard draft baseline');
    assert.ok(rootSource.includes('const editingGatheringHazard = $derived'), 'root should expose an editingGatheringHazard derived');
    assert.ok(rootSource.includes('const gatheringHazardDraftDirty = $derived'), 'root should expose a hazard dirty derived');
    assert.ok(rootSource.includes('const gatheringHazardValidation = $derived'), 'root should expose a hazard validation derived');
    assert.ok(rootSource.includes('function saveGatheringHazardDraft'), 'root should expose saveGatheringHazardDraft');
    assert.ok(rootSource.includes('function deleteGatheringHazardDraft'), 'root should expose deleteGatheringHazardDraft');
    assert.ok(rootSource.includes('function confirmGatheringHazardRouteExit'), 'route-exit chain should include hazard confirm');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Hazards.Save'), 'toolbar Save button uses the hazard Save lang key');
    assert.ok(rootSource.includes('FABRICATE.Admin.Manager.Environment.Hazards.Dirty'), 'toolbar Dirty chip uses the hazard Dirty lang key');
    assert.ok(rootSource.includes('hazard={editingGatheringHazard}'), 'editor mount should bind the draft hazard');
  });

  it('mounts at the gathering-hazard-edit route and exposes a back-to-library affordance', () => {
    assert.ok(
      rootSource.includes("currentView === 'gathering-hazard-edit'"),
      'manager root should branch on gathering-hazard-edit'
    );
    assert.ok(
      rootSource.includes('<GatheringHazardEditView'),
      'manager root should mount the hazard editor component'
    );
    assert.ok(
      rootSource.includes('function backToGatheringHazardLibrary'),
      'manager root should expose backToGatheringHazardLibrary'
    );
    assert.ok(
      rootSource.includes("activeView = 'gathering-hazard-edit'"),
      'editGatheringHazard should set the view to gathering-hazard-edit'
    );
    assert.equal(
      environmentsBrowserSource.includes('GatheringHazardEditView'),
      false,
      'editor should no longer mount inline inside EnvironmentsBrowserView'
    );
  });

  it('localizes the hazard editor labels', () => {
    const hazardsNamespace = lang.FABRICATE.Admin.Manager.Environment.Hazards;
    assert.ok(hazardsNamespace, 'lang/en.json should declare the Hazards namespace');
    for (const key of [
      'HazardIdentity', 'HazardIdentityHint', 'HazardAvailability',
      'AvailabilityHint', 'DangerTagsHint', 'DropRateHint', 'DropRateInvalid',
      'CharacterModifiers',
      'CharacterModifiersHint', 'CharacterModifierOperator', 'CharacterModifierMin',
      'CharacterModifierMax', 'CharacterModifierOverride'
    ]) {
      assert.ok(hazardsNamespace[key], `Hazards namespace should declare ${key}`);
    }
    const dangerTagLabels = hazardsNamespace.DangerTag;
    assert.ok(dangerTagLabels, 'Hazards namespace should expose DangerTag labels');
    for (const tag of ['safe', 'hazardous', 'dangerous', 'deadly']) {
      assert.ok(dangerTagLabels[tag], `DangerTag namespace should declare ${tag}`);
    }
  });
});
