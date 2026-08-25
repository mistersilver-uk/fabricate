import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-import-mapping-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/utils/matchFolderVocabulary.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js'
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    // THE manager's labelled push-button (issue 1118). Skip, New, the footer pair and InlineVocabularyAdd`s Add all render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte'
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ImportFolderMappingModal (mounted)', () => {
  it('has the match-by-name checkbox with a visible input and sibling box', async () => {
    const root = await harness.mount({
      open: true,
      folders: [],
      componentCategories: [],
      itemTags: [],
      onAddCategory: async () => true,
      onCommit: () => {},
      onClose: () => {}
    });

    // The modal renders in a portal, so we need to look in the document body
    const matchLabel = document.querySelector('[data-import-mapping-match]');
    assert.ok(matchLabel, 'match-by-name label should exist');

    const input = matchLabel.querySelector('.fab-selection-input');
    assert.ok(input, 'SelectionCheckbox input should exist');

    const checkBox = input.nextElementSibling;
    assert.ok(
      checkBox?.classList.contains('fab-selection-check'),
      'visible box must be the input\'s immediate next sibling for the focus ring rule to apply'
    );
  });

  it('compiles focus-visible rule for the match-by-name checkbox', async () => {
    await harness.mount({
      open: true,
      folders: [],
      componentCategories: [],
      itemTags: [],
      onAddCategory: async () => true,
      onCommit: () => {},
      onClose: () => {}
    });

    // The focus-visible rule is compiled into the component's scoped styles.
    // Check that it exists in the document's stylesheets.
    let ruleFound = false;
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (
            rule.selectorText &&
            rule.selectorText.includes('.fab-selection-input:focus-visible') &&
            rule.selectorText.includes('.fab-selection-check')
          ) {
            ruleFound = true;
            // Verify the rule contains outline styling
            assert.ok(
              rule.style.outline || rule.style.outlineWidth,
              'focus-visible rule should have outline property'
            );
            assert.ok(
              rule.style.outlineOffset || rule.style.cssText.includes('outline-offset'),
              'focus-visible rule should have outline-offset property'
            );
            break;
          }
        }
      } catch (e) {
        // Cross-origin stylesheets may throw; ignore them
      }
      if (ruleFound) break;
    }

    assert.ok(ruleFound, 'focus-visible CSS rule should be compiled for the match-by-name checkbox');
  });
});
