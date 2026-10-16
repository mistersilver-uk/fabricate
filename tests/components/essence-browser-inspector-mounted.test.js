/** Issue 1782 — the selected-essence inspector's rail sections, mounted on their own. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-inspector-',
  componentPath: 'src/ui/svelte/apps/manager/essences/EssenceBrowserInspector.svelte',
  rawModules: [
    ...STATUS_TONE_RAW_MODULES,
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/ui/svelte/apps/manager/scoped/essenceScoped.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
    'src/ui/model/essenceValidation.js',
    'src/ui/model/macroReference.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    'src/systems/worldVocabulary.js',
    'src/ui/model/vocabularyUsage.js',
    'src/utils/componentCategories.js',
    'src/utils/categoryNormalization.js',
    'src/utils/recipeCategories.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/toolScope.js',
    'src/systems/scopedDefinitions.js',
    'src/systems/scopedDefinitionStore.js',
    'src/utils/scalars.js',
    'src/systems/worldScopeEntityGrouping.js',
    'src/utils/definitionIndex.js',
    'src/utils/sourceReferenceUnion.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
  ],
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/components/EssenceSourceSelector.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    'src/ui/svelte/components/Rail.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBrowserInspector.svelte',
  ],
});

const ESSENCE = {
  id: 'earth',
  name: 'Earth',
  enabled: true,
  colorToken: '',
  componentUsageCount: 0,
};

/** What the section's `aria-labelledby` names, or null when it is not a named group. */
const named = (section) =>
  section.getAttribute('role') === 'group'
    ? globalThis.document.querySelector(`[id="${section.getAttribute('aria-labelledby')}"]`)
        ?.textContent
    : null;

describe('EssenceBrowserInspector rail sections', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('names the on-craft section for its system', async () => {
    const root = await harness.mount({
      essence: ESSENCE,
      showSourceUi: true,
      systemName: 'Alchemy',
    });
    assert.equal(
      named(root.querySelector('[data-essence-section="oncraft"]')),
      'On craft in Alchemy'
    );
  });

  it('falls back to a bare "On craft" with no system name', async () => {
    const root = await harness.mount({ essence: ESSENCE, showSourceUi: true });
    assert.equal(named(root.querySelector('[data-essence-section="oncraft"]')), 'On craft');
  });

  it('leaves the hero, stats, actions and systems sections unnamed', async () => {
    const root = await harness.mount({
      essence: ESSENCE,
      showSourceUi: true,
      systemName: 'Alchemy',
      systemRows: [{ systemId: 'sys-a', systemName: 'Alchemy', member: true, enabled: true }],
      memberCount: 1,
      rosterSize: 1,
    });
    const sections = [
      '[data-essence-browser-inspector]',
      ...['stats', 'systems', 'actions'].map((id) => `[data-essence-section="${id}"]`),
    ];
    for (const selector of sections) {
      const section = root.querySelector(`.fab-rail${selector}`);
      assert.ok(section, `NON-VACUITY: ${selector} renders as a rail section`);
      assert.equal(named(section), null, `${selector} stays unnamed`);
      assert.ok(!section.hasAttribute('aria-labelledby'));
    }
  });
});
