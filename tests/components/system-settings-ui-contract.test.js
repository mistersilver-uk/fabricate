import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemSettingsPath = resolve(__dirname, '../../src/ui/svelte/apps/SystemSettings.svelte');
const featureCardStackPath = resolve(__dirname, '../../src/ui/svelte/apps/FeatureCardStack.svelte');
const systemSettingsSource = readFileSync(systemSettingsPath, 'utf8');
const featureCardStackSource = readFileSync(featureCardStackPath, 'utf8');

describe('Crafting system settings UI contract', () => {
  it('exposes a resolution-mode selector in base system settings', () => {
    assert.ok(
      systemSettingsSource.includes("store.setResolutionMode(nextMode)"),
      'system settings should persist resolution mode changes through the admin store'
    );
    assert.ok(
      systemSettingsSource.includes("FABRICATE.Admin.SystemSettings.ResolutionMode"),
      'system settings should render a localized resolution mode field'
    );
  });

  it('removes the legacy complex-recipes, crafting-check, and outcome-routing system toggles', () => {
    assert.ok(
      !featureCardStackSource.includes("store.toggleFeature('complexRecipes'"),
      'feature card stack should no longer expose the legacy complexRecipes toggle'
    );
    assert.ok(
      !featureCardStackSource.includes("store.toggleFeature('craftingChecks'"),
      'feature card stack should no longer expose the legacy craftingChecks toggle'
    );
    assert.ok(
      !featureCardStackSource.includes("store.toggleFeature('outcomeRouting'"),
      'feature card stack should no longer expose the legacy outcomeRouting toggle'
    );
  });

  it('autosaves recipe visibility and crafting-check changes without save buttons', () => {
    assert.ok(
      featureCardStackSource.includes('flushCraftingCheckSave'),
      'crafting check controls should flush autosave through the store'
    );
    assert.ok(
      featureCardStackSource.includes('flushVisibilitySave'),
      'recipe visibility controls should flush autosave through the store'
    );
  });

  it('renders a dedicated alchemy settings section for alchemy-mode systems', () => {
    assert.ok(
      featureCardStackSource.includes('FABRICATE.Admin.Features.Alchemy.Title'),
      'feature card stack should render localized alchemy settings content'
    );
    assert.ok(
      featureCardStackSource.includes('flushAlchemySave'),
      'alchemy settings should persist through the admin store without a save button'
    );
  });
});
