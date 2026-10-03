/**
 * A View Lab case can render under any Fabricate palette (issue 2151): the case's `theme` reaches
 * the page as a query flag, the page applies it through `applyFabricateTheme`, and an unknown id
 * fails instead of rendering the default palette under a themed name.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { withThemeVariants } from '../scripts/lib/view-lab-cases/caseFactories.js';
import {
  LAB_SURFACE_CASE_IDS,
  VIEW_LAB_CASES,
  getCaseById,
  labQueryFor,
  mapChangedFilesToCases,
} from '../scripts/lib/viewLabCases.js';
import { FABRICATE_THEME_ATTRIBUTE } from '../src/ui/theme.js';

import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';
import { installLabTheme, readLabTheme } from './view-lab/labTheme.js';

const VARIANTS = Object.freeze({
  'manager-gathering-task-editor-normal-hearth-herb': 'manager-gathering-task-editor-normal',
  'manager-recipe-edit-results-rolled-hearth-herb': 'manager-recipe-edit-results-rolled',
  'manager-tool-prerequisites-selected-1280x720-hearth-herb':
    'manager-tool-prerequisites-selected-1280x720',
});

const themedCases = () => VIEW_LAB_CASES.filter((viewCase) => viewCase.theme);
const selectedIds = (files) => mapChangedFilesToCases(files).map((viewCase) => viewCase.id);
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

let observer = null;
beforeEach(setupDOM);
afterEach(() => {
  observer?.disconnect();
  observer = null;
  teardownDOM();
});

test('the three hearth-herb variants reuse their base case under another palette', () => {
  assert.deepEqual(
    themedCases()
      .map((viewCase) => viewCase.id)
      .sort((left, right) => left.localeCompare(right)),
    Object.keys(VARIANTS)
  );
  for (const [id, baseId] of Object.entries(VARIANTS)) {
    const variant = getCaseById(id);
    const base = getCaseById(baseId);
    assert.equal(variant.theme, 'hearth-herb');
    assert.equal(variant.baseCaseId, baseId);
    assert.ok(!base.theme, `${baseId} must keep the default palette`);
    // The same definition, not a copy of it.
    assert.equal(variant.steps, base.steps);
    assert.equal(variant.sourceMatches, base.sourceMatches);
    assert.deepEqual(variant.query, base.query);
    assert.deepEqual(variant.position, base.position);
  }
});

test("a themed case's palette reaches the page and is applied to every Fabricate root", async () => {
  for (const viewCase of themedCases()) {
    const themeId = readLabTheme(new URLSearchParams(labQueryFor(viewCase)));
    assert.equal(themeId, viewCase.theme, `${viewCase.id} must carry its palette to the page`);

    document.body.innerHTML = '<div class="fabricate" data-fabricate-theme="fabricate"></div>';
    observer?.disconnect();
    observer = installLabTheme(themeId);
    // A root mounted after the page applied the palette — a window, a dialog, a popover.
    const later = document.createElement('section');
    later.innerHTML = '<div class="fabricate"></div>';
    document.body.append(later);
    await nextTask();

    const themed = [document.documentElement, ...document.querySelectorAll('.fabricate')];
    assert.equal(themed.length, 3);
    for (const element of themed) {
      assert.equal(element.getAttribute(FABRICATE_THEME_ATTRIBUTE), viewCase.theme);
    }
  }
});

test('an unthemed case names no palette and the page leaves the default in place', () => {
  const base = getCaseById('manager-gathering-task-editor-normal');
  assert.ok(!Object.hasOwn(labQueryFor(base), 'theme'));
  assert.equal(readLabTheme(new URLSearchParams(labQueryFor(base))), null);
  assert.equal(installLabTheme(null), null);
  assert.ok(!document.documentElement.hasAttribute(FABRICATE_THEME_ATTRIBUTE));
});

test('an unknown palette fails in the page and in the registry instead of falling back', () => {
  assert.throws(
    () => readLabTheme(new URLSearchParams({ theme: 'hearth' })),
    /unknown Fabricate theme "hearth"/
  );
  assert.throws(
    () => withThemeVariants([{ id: 'probe', label: 'Probe', themeVariants: ['hearth'] }]),
    /case "probe": unknown Fabricate theme "hearth"/
  );
});

test('whatever selects a base case selects its palette variant, and coverage holds neither', () => {
  for (const id of Object.keys(VARIANTS)) {
    assert.ok(!LAB_SURFACE_CASE_IDS.includes(id), `${id} is a palette, not a surface`);
  }
  const tools = selectedIds(['src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte']);
  assert.ok(tools.includes('manager-tool-prerequisites-selected-1280x720-hearth-herb'));
  // Broad signals name a base case, and the palette variant follows it.
  const checkbox = selectedIds(['src/ui/svelte/components/SelectionCheckbox.svelte']);
  assert.ok(checkbox.includes('manager-tool-prerequisites-selected-1280x720-hearth-herb'));
  const stylesheet = selectedIds(['styles/fabricate.css']);
  assert.ok(stylesheet.includes('manager-gathering-task-editor-normal-hearth-herb'));
});
