/**
 * Fixtures and rendered-geometry readers for `manager-layout-gathering.js` (issue 1670).
 *
 * Gathering rail, settings, task browser, chance slider and World Parties layout: the markup, the component sources and the
 * page readers that surface's tests measure through. Nothing here asserts.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const colorPickerPath = resolve(
  __dirname,
  '../../src/ui/svelte/components/ManagerColorPicker.svelte'
);
const partyExpandedBodyPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/PartyExpandedBody.svelte'
);
const partiesTabPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/GatheringPartiesTab.svelte'
);
export const partiesTabSource = readFileSync(partiesTabPath, 'utf8');
export const partiesTabScoped = scopedComponentCss(partiesTabPath);
export const colorPickerSource = readFileSync(colorPickerPath, 'utf8');
export const partyExpandedBodyScoped = scopedComponentCss(partyExpandedBodyPath);

// Issue 883 retired the last two hand-rolled copies of the chance slider — the gathering
// drop INSPECTOR and the gathering EVENT editor — in favour of `ChanceSlider`. Both had
// been surviving on unrelated CSS accidents: the inspector's fill was visible only because
// `.manager-drop-editor-card` happened to exclude `[type="range"]` from its blanket field
// rule, and the event editor's rows needed f4402c27 to add the same exclusion.
//
// This asserts the RENDERED result at both converted sites: a transparent range input, a
// fill with real width and colour, and a number field that is actually sized — the last
// because the conversion moved those fields from `[type="text"]` to `[type="number"]`, so a
// stylesheet still keyed on the old type would leave them unstyled and this would catch it.
export const CHANCE_SLIDER_FIXTURE =
  '<span class="fabricate-slider manager-chance-slider manager-drop-rate-value" data-chance-slider>' +
  '<span class="manager-chance-slider-number manager-drop-rate-percent">' +
  '<input type="number" min="0" max="100" step="1" value="80" aria-label="Chance"/>' +
  '<span aria-hidden="true">%</span></span>' +
  '<span class="manager-chance-slider-control manager-drop-rate-control is-common" ' +
  'style="--fab-drop-rate-value:80%; --fab-drop-rate-color:#5EC3B0;">' +
  '<span class="manager-drop-rate-track"><span class="manager-drop-rate-fill"></span></span>' +
  '<input type="range" min="0" max="100" step="1" value="80"/>' +
  '</span></span>';