/** The config panel's Disabled and Locked toggles name a state, never an action (issue 1625). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { summarizeInteractable } from '../../src/canvas/regions/interactableConfigActions.js';
import {
  MARKS_AND_NOTICES_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-interactable-config-state-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/interactableConfigView.js',
    'src/utils/scalars.js',
    'src/ui/svelte/util/systemDisambiguation.js',
    'src/ui/svelte/components/stepperLabels.js',
  ],
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    ...MARKS_AND_NOTICES_COMPILED_MODULES,
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/InteractableConfigRoot.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/InteractableConfigRoot.svelte',
  rootClass: 'fabricate-interactable-config-app',
});

before(() => harness.setup());
after(() => harness.teardown());

/** A configured Tool interactable's raw behaviour system in the given state. */
function toolSystem({ enabled, locked }) {
  return {
    interactableType: 'tool',
    sourceUuid: 'fabricate-tool.system-a.tool-1',
    systemId: 'system-a',
    toolId: 'tool-1',
    name: 'Anvil',
    state: { enabled, locked },
  };
}

/** Name from content: `aria-label`, else the text of every subtree not hidden from assistive technology. */
function accessibleName(element) {
  const label = element.getAttribute('aria-label');
  if (label) return label.trim();
  const collect = (node) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true') return '';
    return [...node.childNodes].map(collect).join('');
  };
  return collect(element).replaceAll(/\s+/gu, ' ').trim();
}

const STATES = [
  { enabled: true, locked: false },
  { enabled: false, locked: false },
  { enabled: true, locked: true },
  { enabled: false, locked: true },
];

for (const state of STATES) {
  test(`enabled=${state.enabled} locked=${state.locked}: constant state names, state on aria-pressed`, async () => {
    harness.remount();
    const calls = [];
    const root = await harness.mount({
      services: {
        summarize: () => ({
          view: summarizeInteractable(toolSystem(state), { resolveVisual: () => null }),
        }),
        setEnabled: (next) => {
          calls.push(['setEnabled', next]);
        },
        setLocked: (next) => {
          calls.push(['setLocked', next]);
        },
      },
    });
    const disabled = root.querySelector('[data-interactable-state-toggle="disabled"]');
    const locked = root.querySelector('[data-interactable-state-toggle="locked"]');
    assert.ok(Boolean(disabled) && Boolean(locked), 'both state toggles render with their hooks');

    assert.equal(
      accessibleName(disabled),
      'Disabled',
      'the Disabled toggle never renames with state'
    );
    assert.equal(accessibleName(locked), 'Locked', 'the Locked toggle never renames with state');
    assert.equal(
      disabled.getAttribute('aria-pressed'),
      String(!state.enabled),
      'pressed while disabled'
    );
    assert.equal(locked.getAttribute('aria-pressed'), String(state.locked), 'pressed while locked');

    const disabledGlyph = disabled.querySelector('i');
    const lockedGlyph = locked.querySelector('i');
    assert.equal(
      disabledGlyph?.getAttribute('aria-hidden'),
      'true',
      'the Disabled glyph is hidden'
    );
    assert.equal(lockedGlyph?.getAttribute('aria-hidden'), 'true', 'the Locked glyph is hidden');
    assert.ok(
      disabledGlyph.classList.contains(state.enabled ? 'fa-circle-check' : 'fa-ban'),
      'the Disabled glyph follows the enabled state'
    );
    assert.ok(
      lockedGlyph.classList.contains(state.locked ? 'fa-lock' : 'fa-lock-open'),
      'the Locked glyph follows the locked state'
    );

    disabled.click();
    locked.click();
    assert.deepEqual(
      calls,
      [
        ['setEnabled', !state.enabled],
        ['setLocked', !state.locked],
      ],
      'each click asks for the inverse of the state it shows'
    );
  });
}
