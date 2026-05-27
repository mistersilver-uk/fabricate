import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const editorPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/GatheringHazardEditView.svelte');
const langPath = resolve(repoRoot, 'lang/en.json');

const editorSource = readFileSync(editorPath, 'utf8');
const lang = JSON.parse(readFileSync(langPath, 'utf8'));

describe('GatheringHazardEditView source contract', () => {
  it('exposes hazard identity, availability, dangerTags, dropRate, and modifier sections', () => {
    assert.ok(editorSource.includes('data-gathering-hazard-editor'), 'editor should expose a data attribute hook');
    assert.ok(editorSource.includes('data-gathering-hazard-core-editor'), 'editor should expose an identity section');
    assert.ok(editorSource.includes("data-gathering-hazard-field=\"name\""), 'editor should bind the name field');
    assert.ok(editorSource.includes("data-gathering-hazard-field=\"enabled\""), 'editor should expose an enabled toggle');
    assert.ok(editorSource.includes('data-gathering-hazard-availability'), 'editor should expose an availability matching section');
    assert.ok(editorSource.includes('data-gathering-hazard-danger-tags'), 'editor should expose a danger tags section');
    assert.ok(editorSource.includes('data-gathering-hazard-drop-rate'), 'editor should expose a drop rate section');
    assert.ok(editorSource.includes('data-gathering-hazard-modifier'), 'editor should expose a hazard modifier section');
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

  it('reuses ProviderExpressionInput for the hazard modifier', () => {
    assert.ok(editorSource.includes("import ProviderExpressionInput from '../../components/ProviderExpressionInput.svelte';"), 'editor should import ProviderExpressionInput');
    assert.ok(editorSource.includes('<ProviderExpressionInput'), 'editor should render ProviderExpressionInput for the hazard modifier');
    assert.ok(editorSource.includes('hazardModifier'), 'editor should bind to hazard.hazardModifier');
  });

  it('supports character modifier references with operator, min, max, and expressionOverride', () => {
    assert.ok(editorSource.includes('characterModifiers'), 'editor should read hazard.characterModifiers');
    assert.ok(editorSource.includes('CharacterModifierOperator'), 'editor should localize the operator field');
    assert.ok(editorSource.includes('CharacterModifierMin'), 'editor should localize the min field');
    assert.ok(editorSource.includes('CharacterModifierMax'), 'editor should localize the max field');
    assert.ok(editorSource.includes('CharacterModifierOverride'), 'editor should localize the expression override field');
    assert.ok(editorSource.includes("operator: event.currentTarget.value === '-' ? '-' : '+'"), 'operator updates should clamp to + or -');
  });

  it('localizes the hazard editor labels', () => {
    const hazardsNamespace = lang.FABRICATE.Admin.Manager.Environment.Hazards;
    assert.ok(hazardsNamespace, 'lang/en.json should declare the Hazards namespace');
    for (const key of [
      'HazardIdentity', 'HazardIdentityHint', 'HazardAvailability',
      'AvailabilityHint', 'DangerTagsHint', 'DropRateHint', 'DropRateInvalid',
      'HazardModifier', 'HazardModifierHint', 'CharacterModifiers',
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
