/** Fixtures and rendered-geometry readers for `manager-layout-gathering.js` (issue 1670). */

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

// Issue 883 retired the last two hand-rolled copies of the chance slider.
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