/** The interactable config panel's failed load is a danger notice, never an empty (issue 1779). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import {
  MARKS_AND_NOTICES_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-interactable-config-unavailable-',
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

test('a summary that cannot be loaded renders a danger notice titled by the unavailable key', async () => {
  const root = await harness.mount({ services: { summarize: () => null } });
  const notice = root.querySelector('[data-interactable-config-unavailable]');
  assert.ok(Boolean(notice), 'the failed load renders its hooked notice');
  assert.ok(notice.classList.contains('fab-notice'), 'the hook rides the shared notice');
  assert.equal(
    notice.getAttribute('data-notice-tone'),
    'danger',
    'a failed load is the danger tone'
  );
  assert.equal(notice.getAttribute('role'), 'status', 'the notice announces politely');
  assert.equal(
    notice.querySelector('.fab-notice-title')?.textContent.trim(),
    'This interactable could not be loaded.',
    "the title is the unavailable key's sentence (its English fallback, untranslated here)"
  );
  assert.ok(!root.querySelector('.manager-empty'), 'a failed load is not drawn as an empty');
  assert.ok(!root.querySelector('.fab-ic-header'), 'nothing of the loaded panel renders');
});
