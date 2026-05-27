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
  it('exposes hazard identity, availability, dangerTags, dropRate, and character-modifier sections', () => {
    assert.ok(editorSource.includes('data-gathering-hazard-editor'), 'editor should expose a data attribute hook');
    assert.ok(editorSource.includes('data-gathering-hazard-core-editor'), 'editor should expose an identity section');
    assert.ok(editorSource.includes("data-gathering-hazard-field=\"name\""), 'editor should bind the name field');
    assert.ok(editorSource.includes("data-gathering-hazard-field=\"enabled\""), 'editor should expose an enabled toggle');
    assert.ok(editorSource.includes('data-gathering-hazard-availability'), 'editor should expose an availability matching section');
    assert.ok(editorSource.includes('data-gathering-hazard-danger-tags'), 'editor should expose a danger tags section');
    assert.ok(editorSource.includes('data-gathering-hazard-drop-rate'), 'editor should expose a drop rate section');
    assert.ok(editorSource.includes('data-gathering-hazard-character-modifiers'), 'editor should expose a character modifiers section');
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

  it('seeds the default danger tag suggestions from the spec', () => {
    assert.ok(editorSource.includes("['safe', 'hazardous', 'dangerous', 'deadly']"), 'editor should seed default danger tags from the spec');
    assert.ok(editorSource.includes('manager-danger-tag-pill'), 'editor should render danger tags as pills');
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

  it('supports character modifier references with operator, min, max, and expressionOverride', () => {
    assert.ok(editorSource.includes('characterModifiers'), 'editor should read hazard.characterModifiers');
    assert.ok(editorSource.includes('CharacterModifierOperator'), 'editor should localize the operator field');
    assert.ok(editorSource.includes('CharacterModifierMin'), 'editor should localize the min field');
    assert.ok(editorSource.includes('CharacterModifierMax'), 'editor should localize the max field');
    assert.ok(editorSource.includes('CharacterModifierOverride'), 'editor should localize the expression override field');
    assert.ok(editorSource.includes("operator: event.currentTarget.value === '-' ? '-' : '+'"), 'operator updates should clamp to + or -');
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
