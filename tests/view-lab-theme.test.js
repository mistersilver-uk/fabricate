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
  // Issue 2445: a stage's read-only complication rows on its `--fab-bg-1` card, parted by the border.
  'manager-component-edit-salvage-stages-narrow-hearth-herb':
    'manager-component-edit-salvage-stages-narrow',
  // Issue 2416: the tint swatch's keyboard cursor on the palette with its weakest contrast.
  'manager-gathering-biome-colour-popover-cursor-hearth-herb':
    'manager-gathering-biome-colour-popover-cursor',
  'manager-gathering-biome-colour-popover-cursor-selected-hearth-herb':
    'manager-gathering-biome-colour-popover-cursor-selected',
  'manager-gathering-task-editor-normal-hearth-herb': 'manager-gathering-task-editor-normal',
  // Issue 2841: the companion forms specimens, where muted ink and two tints fall short.
  ...Object.fromEntries(
    ['specimen', 'accent-focus', 'urgent-focus'].flatMap((form) =>
      ['foundry-native', 'hearth-herb'].map((theme) => [
        `manager-published-companion-forms-${form}-${theme}`,
        `manager-published-companion-forms-${form}`,
      ])
    )
  ),
  // Issues 2837 and 2863: the published thin tracks and neutral band on the palettes where their
  // inks and track read weakest.
  'manager-published-fill-bar-bands-specimen-foundry-native':
    'manager-published-fill-bar-bands-specimen',
  'manager-published-fill-bar-bands-specimen-hearth-herb':
    'manager-published-fill-bar-bands-specimen',
  'manager-published-stage-bars-forms-specimen-foundry-native':
    'manager-published-stage-bars-forms-specimen',
  'manager-published-stage-bars-forms-specimen-hearth-herb':
    'manager-published-stage-bars-forms-specimen',
  // Issue 2859: the published dialog's scrim, on the palette whose dim brings a --fab-bg-2 ground
  // nearest the dialog's surface, on a second, and on the one whose overlay is not its --fab-bg-0.
  'manager-published-modal-scrim-specimen-foundry-native': 'manager-published-modal-scrim-specimen',
  'manager-published-modal-scrim-specimen-hearth-herb': 'manager-published-modal-scrim-specimen',
  'manager-published-modal-scrim-specimen-mythwright': 'manager-published-modal-scrim-specimen',
  // Issue 2836: the published checkbox's edges and fills on three more palettes.
  'manager-published-selection-checkbox-specimen-foundry-native':
    'manager-published-selection-checkbox-specimen',
  'manager-published-selection-checkbox-specimen-hearth-herb':
    'manager-published-selection-checkbox-specimen',
  'manager-published-selection-checkbox-specimen-ironblood-forge':
    'manager-published-selection-checkbox-specimen',
  'manager-recipe-edit-results-rolled-hearth-herb': 'manager-recipe-edit-results-rolled',
  'manager-tool-prerequisites-selected-1280x720-hearth-herb':
    'manager-tool-prerequisites-selected-1280x720',
  // Issue 1773: the award face, its disabled tile and its reason under another palette.
  'player-journal-award-choice-hearth-herb': 'player-journal-award-choice',
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

test('the palette variants reuse their base case under the palette their id names', () => {
  assert.deepEqual(
    themedCases()
      .map((viewCase) => viewCase.id)
      .sort((left, right) => left.localeCompare(right)),
    Object.keys(VARIANTS).sort((left, right) => left.localeCompare(right))
  );
  for (const [id, baseId] of Object.entries(VARIANTS)) {
    const variant = getCaseById(id);
    const base = getCaseById(baseId);
    assert.equal(variant.theme, id.slice(baseId.length + 1));
    assert.ok(
      ['hearth-herb', 'foundry-native', 'mythwright', 'ironblood-forge'].includes(variant.theme),
      id
    );
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
