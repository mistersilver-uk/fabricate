/**
 * Pins the canonical Tool display precedence (`openspec/specs/data-models/spec.md`
 * `## Tool` requirement 13) against the shared table in
 * `tests/helpers/toolDisplayPrecedenceCases.js`.
 *
 * This file covers the reference implementation, `toolStudio.js`. The two surfaces
 * that re-derive the ordering because they receive the component lookup pre-flattened
 * are pinned against the SAME table from their mounted suites:
 *   - `RecipeToolsSection` in tests/components/recipe-edit-mounted.test.js
 *   - `GatheringTaskEditView` in tests/components/manager-mounted.test.js
 *
 * Issue 976: two of the three omitted the snapshot rung, so an item-sourced tool
 * (`componentId: null`) rendered "Unnamed tool" and the item-bag sentinel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_DISPLAY_PRECEDENCE_CASES,
  TOOL_IMAGE_SENTINEL,
  TOOL_PRECEDENCE_MANAGED_ITEMS,
  flattenToolForRecipeLibrary,
} from './helpers/toolDisplayPrecedenceCases.js';

globalThis.foundry = globalThis.foundry || { utils: { getProperty: () => undefined } };

const { toolDisplayName, toolDisplayImage, toolDescription } = await import(
  '../src/ui/svelte/apps/manager/tools/toolStudio.js'
);

const FALLBACK = 'Untitled tool';

test('toolStudio resolves every precedence case per data-models Tool requirement 13', async (t) => {
  for (const testCase of TOOL_DISPLAY_PRECEDENCE_CASES) {
    await t.test(`${testCase.id}: ${testCase.summary}`, () => {
      const resolvedName = toolDisplayName(
        testCase.tool,
        TOOL_PRECEDENCE_MANAGED_ITEMS,
        FALLBACK
      );
      assert.equal(
        resolvedName,
        testCase.expectedName === null ? FALLBACK : testCase.expectedName,
        `${testCase.id} resolves the expected display name`
      );
      assert.equal(
        toolDisplayImage(testCase.tool, TOOL_PRECEDENCE_MANAGED_ITEMS),
        testCase.expectedImg,
        `${testCase.id} resolves the expected display image`
      );
      assert.equal(
        toolDescription(testCase.tool, TOOL_PRECEDENCE_MANAGED_ITEMS),
        testCase.expectedDescription,
        `${testCase.id} resolves the expected description`
      );
    });
  }
});

test('exactly one case reaches the localized fallback and the item-bag sentinel', () => {
  // Guards the table itself: if a future edit makes every case resolvable, the
  // fallback rung stops being covered and the surfaces could drop it unnoticed.
  const fallbackCases = TOOL_DISPLAY_PRECEDENCE_CASES.filter(
    (testCase) => testCase.expectedName === null
  );
  assert.equal(fallbackCases.length, 1, 'one and only one case exercises the fallback');
  assert.equal(fallbackCases[0].expectedImg, TOOL_IMAGE_SENTINEL);

  const sentinelCases = TOOL_DISPLAY_PRECEDENCE_CASES.filter(
    (testCase) => testCase.expectedImg === TOOL_IMAGE_SENTINEL
  );
  assert.equal(
    sentinelCases.length,
    1,
    'no resolvable tool is expected to render the item-bag sentinel'
  );
});

test('the item-sourced defect case is unresolvable through componentId alone', () => {
  // The regression guard proper. Before 976 the recipe and gathering surfaces read
  // ONLY the linked component, so this shape produced a placeholder. Asserting the
  // component lookup yields nothing proves the case cannot pass by accident if the
  // snapshot rung is deleted again.
  const defectCase = TOOL_DISPLAY_PRECEDENCE_CASES.find(
    (testCase) => testCase.id === 'item-sourced-unlabelled'
  );
  assert.ok(defectCase, 'the defect case is present in the table');
  assert.equal(defectCase.tool.componentId, null, 'a first-class item-sourced tool has no component');

  const flattened = flattenToolForRecipeLibrary(defectCase.tool);
  assert.equal(flattened.componentName, '', 'the upstream component lookup resolves no name');
  assert.equal(flattened.componentImg, '', 'the upstream component lookup resolves no image');
  assert.equal(flattened.name, defectCase.expectedName, 'the snapshot survives flattening');
  assert.equal(flattened.img, defectCase.expectedImg, 'the snapshot image survives flattening');
});

test('flattenToolForRecipeLibrary mirrors the recipeToolsLibrary derivation', () => {
  const linked = TOOL_DISPLAY_PRECEDENCE_CASES.find(
    (testCase) => testCase.id === 'component-linked-unlabelled'
  );
  const flattened = flattenToolForRecipeLibrary(linked.tool);
  assert.equal(flattened.componentName, 'Iron Tongs');
  assert.equal(flattened.componentImg, 'icons/tools/tongs.webp');

  const orphan = TOOL_DISPLAY_PRECEDENCE_CASES.find(
    (testCase) => testCase.id === 'orphan-falls-back'
  );
  const orphanFlattened = flattenToolForRecipeLibrary(orphan.tool);
  assert.equal(orphanFlattened.componentName, '', 'an unresolvable componentId flattens to empty');
  assert.equal(orphanFlattened.componentImg, '');
});
