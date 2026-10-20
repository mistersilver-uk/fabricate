/**
 * A popover trigger reaches the button cascade through the primitive, not a class string (issue
 * 2540). The nine `triggerClass` sites that wrote `fabricate-button` moved onto `triggerButton`,
 * so the root and role come from `Button` and the caller's classes are forwarded as its `class`.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ROOT = 'fabricate-button';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-forwarded-trigger-class-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: SEARCHABLE_POPOVER_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SearchablePopover.svelte',
});

/** Every `.svelte` under `src/`, as `[path, text]`. */
function svelteSources(directory = 'src') {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return svelteSources(child);
    return entry.name.endsWith('.svelte')
      ? [[child, readFileSync(join(repoRoot, child), 'utf8')]]
      : [];
  });
}

describe('2540 a popover trigger forwards its class onto the button primitive', () => {
  before(harness.setup);
  after(harness.teardown);

  it('draws the dashed adder as the primitive, the caller class appended after the role', async () => {
    await harness.mount({
      options: [{ id: 'hammer', label: 'Hammer' }],
      triggerButton: { role: 'dashed' },
      triggerClass: 'manager-recipe-tools-trigger',
      triggerLabel: 'Add tool',
      ariaLabel: 'Add tool',
      panelLabel: 'Add tool',
      onSelect: () => {},
    });
    const trigger = harness.target.querySelector('button');
    assert.ok(Boolean(trigger), 'the picker renders its trigger');
    assert.equal(trigger.className, `${ROOT} is-dashed manager-recipe-tools-trigger`);
    assert.equal(trigger.dataset.keyboardFocus, 'true', 'the primitive’s own Foundry focus flag');
  });

  it('leaves no triggerClass handing the button root over as a string', () => {
    const sources = svelteSources();
    const converted = sources.flatMap(([, text]) => text.match(/\btriggerButton=\{/g) ?? []);
    assert.ok(converted.length >= 10, `only ${converted.length} triggerButton sites were found`);
    const offenders = sources.flatMap(([path, text]) =>
      [...text.matchAll(/\btriggerClass="([^"]*)"/g)]
        .filter((match) => match[1].split(/\s+/).includes(ROOT))
        .map((match) => `${path}: triggerClass="${match[1]}"`)
    );
    assert.deepEqual(offenders, [], 'render the trigger through `triggerButton={{ role }}`');
  });
});
