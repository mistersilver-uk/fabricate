import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// System Overview list ergonomics (issue 768, increment 1): the Character
// Modifiers icon now uses the shared IconPicker; each settings-list section has a
// whole-section collapse toggle; and a row-level copy adds into the sibling store
// and opens the new entry in edit mode. These behaviours live across
// SystemEditView + CharacterPrerequisitesCard, so they are asserted through a real
// mount (the same harness the currency-subunit test uses, plus the copy-mapping
// module in the raw allowlist so the mount stays hang-free).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-ergonomics-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/systems/characterPrerequisites.js',
    'src/systems/characterModifierPrerequisiteCopy.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/system/SystemEditorTabs.svelte',
    'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte',
    'src/ui/svelte/apps/manager/SystemOverviewView.svelte',
    'src/ui/svelte/apps/manager/SystemEditView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/SystemEditView.svelte'
});

function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

function makeSystem() {
  return {
    id: 'system-under-test',
    name: 'Mythwright',
    description: '',
    features: { gathering: true },
    requirements: { currency: { enabled: true } }
  };
}

const MODIFIERS = Object.freeze([
  { id: 'mod-herbalism', label: 'Herbalism', icon: 'fa-solid fa-leaf', expression: '@skills.nature.value' },
  { id: 'mod-lore', label: 'Lore', icon: 'fa-solid fa-book', expression: '@skills.lore.value' }
]);

const PREREQUISITES = Object.freeze([
  { id: 'pre-trained', name: 'Trained', icon: 'fa-solid fa-graduation-cap', path: 'skills.cra.rank', op: 'gte', value: 2 },
  { id: 'pre-open', name: 'Copy target', icon: 'fa-solid fa-user-shield', path: '', op: 'gte', value: null }
]);

function clickEvent() {
  return new globalThis.window.Event('click', { bubbles: true });
}

// happy-dom does not implement scrollIntoView; stub it after the harness builds the
// window so the copy path's "reveal the opened target" behaviour is observable.
let scrollCalls = [];
before(async () => {
  await harness.setup();
  globalThis.window.Element.prototype.scrollIntoView = function scrollIntoView() {
    scrollCalls.push(this);
  };
});
after(() => harness.teardown());
afterEach(() => {
  scrollCalls = [];
  return harness.remount();
});

describe('system-edit list ergonomics (mounted, issue 768)', () => {
  it('renders a compact summary row (label + inline @-stripped expression) that is collapsed by default', async () => {
    const root = await harness.mount({
      selectedSystem: makeSystem(),
      characterModifierLibrary: MODIFIERS
    });

    const row = root.querySelector('[data-system-character-modifier="mod-herbalism"]');
    assert.ok(row, 'modifier row exists');

    // Collapsed by default: a summary toggle, no editor body.
    const summary = row.querySelector('[data-toggle-character-modifier]');
    assert.ok(summary, 'the row renders an accordion summary toggle');
    assert.equal(summary.getAttribute('aria-expanded'), 'false', 'starts collapsed');
    assert.ok(!row.querySelector('.manager-modifier-body'), 'no editor body when collapsed');

    // The label and the inline expression (leading @ stripped) render on the summary.
    assert.ok(row.querySelector('.manager-modifier-label').textContent.includes('Herbalism'), 'label shows');
    const expression = row.querySelector('[data-character-modifier-expression]');
    assert.ok(expression, 'the expression renders inline on the summary');
    assert.ok(expression.textContent.includes('skills.nature.value'), 'expression body shows');
    assert.ok(!expression.textContent.includes('@'), 'the leading @ sigil is stripped from the inline display');
  });

  it('expands to the IconPicker editor on the summary toggle', async () => {
    const root = await harness.mount({
      selectedSystem: makeSystem(),
      characterModifierLibrary: MODIFIERS
    });

    const row = root.querySelector('[data-system-character-modifier="mod-herbalism"]');
    const summary = row.querySelector('[data-toggle-character-modifier]');
    summary.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(summary.getAttribute('aria-expanded'), 'true', 'summary toggles open');
    assert.ok(row.querySelector('.manager-modifier-body'), 'the editor body opens');
    const trigger = row.querySelector('.essence-icon-picker-trigger');
    assert.ok(trigger, 'the modifier editor renders an IconPicker trigger, not a bare text input');
    // The editor keeps the RAW @-prefixed expression (only the summary strips it).
    const expressionInput = [...row.querySelectorAll('.manager-modifier-body input')].find(
      (input) => input.value.includes('skills.nature.value')
    );
    assert.ok(expressionInput, 'the editor exposes the expression field');
    assert.ok(expressionInput.value.startsWith('@'), 'the stored expression keeps its @ sigil in the editor');
  });

  it('collapses a whole section on its header toggle', async () => {
    const root = await harness.mount({
      selectedSystem: makeSystem(),
      characterModifierLibrary: MODIFIERS
    });

    const toggle = root.querySelector('[data-section-collapse="modifiers"]');
    assert.ok(toggle, 'the modifiers section has a collapse toggle');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'starts expanded');
    assert.ok(root.querySelector('#manager-section-body-modifiers'), 'body is present when expanded');

    toggle.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'toggles to collapsed');
    assert.ok(!root.querySelector('#manager-section-body-modifiers'), 'body is removed when collapsed');
  });

  it('copies a Modifier into Prerequisites and opens the new entry in edit mode', async () => {
    const calls = [];
    const root = await harness.mount({
      selectedSystem: makeSystem(),
      characterModifierLibrary: MODIFIERS,
      characterPrerequisiteLibrary: PREREQUISITES,
      // Simulate the store add: record the mapped partial and return an entry whose
      // id is already in the seeded prereq library so the target editor can open it.
      onAddCharacterPrerequisite: async (partial) => {
        calls.push(partial);
        return { id: 'pre-open' };
      }
    });

    const copyButton = root.querySelector('[data-copy-to-prerequisite="mod-herbalism"]');
    assert.ok(copyButton, 'the modifier row has a Copy to Prerequisites button');
    copyButton.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(calls.length, 1, 'the add op fired once');
    assert.equal(calls[0].name, 'Herbalism', 'label mapped to name');
    assert.equal(calls[0].icon, 'fa-solid fa-leaf', 'icon carried');
    assert.equal(calls[0].path, 'skills.nature.value', 'expression @-stripped to path');
    assert.ok(!('id' in calls[0]), 'no id copied');

    const target = root.querySelector('[data-system-character-prerequisite="pre-open"]');
    assert.ok(target, 'the target prerequisite row exists');
    assert.ok(
      target.querySelector('.manager-prerequisite-body'),
      'the newly-copied prerequisite is opened in edit mode'
    );

    // A sighted GM needs a VISIBLE confirmation, not just the aria-live one: the
    // opened target row is scrolled into view and its first field takes focus.
    assert.ok(scrollCalls.includes(target), 'the opened prerequisite row is scrolled into view');
    assert.ok(
      target.contains(globalThis.window.document.activeElement),
      'focus moves into the newly-opened prerequisite editor'
    );

    const announcement = root.querySelector('[data-list-copy-announcement]');
    assert.ok(announcement && announcement.textContent.includes('Herbalism'), 'an aria-live confirmation is announced');
  });

  it('copies a Prerequisite into Modifiers and opens the new entry in edit mode', async () => {
    const calls = [];
    const root = await harness.mount({
      selectedSystem: makeSystem(),
      characterModifierLibrary: MODIFIERS,
      characterPrerequisiteLibrary: PREREQUISITES,
      onAddCharacterModifier: async (partial) => {
        calls.push(partial);
        return { id: 'mod-lore' };
      }
    });

    const copyButton = root.querySelector('[data-copy-to-modifier="pre-trained"]');
    assert.ok(copyButton, 'the prerequisite row has a Copy to Modifiers button (gathering enabled)');
    copyButton.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(calls.length, 1, 'the add op fired once');
    assert.equal(calls[0].label, 'Trained', 'name mapped to label');
    assert.equal(calls[0].expression, '@skills.cra.rank', 'path @-prefixed to expression');
    assert.ok(!('op' in calls[0]), 'op dropped');

    const target = root.querySelector('[data-system-character-modifier="mod-lore"]');
    assert.ok(
      target.querySelector('.manager-character-modifier-editor'),
      'the newly-copied modifier is opened in edit mode'
    );
    assert.ok(scrollCalls.includes(target), 'the opened modifier row is scrolled into view');
    assert.ok(
      target.contains(globalThis.window.document.activeElement),
      'focus moves into the newly-opened modifier editor'
    );
  });

  it('hides the Copy to Modifiers button (and the Modifiers section) when gathering is off', async () => {
    const root = await harness.mount({
      selectedSystem: { ...makeSystem(), features: { gathering: false } },
      characterModifierLibrary: MODIFIERS,
      characterPrerequisiteLibrary: PREREQUISITES
    });

    // Modifiers are gathering-scoped, so the whole section is gone...
    assert.ok(
      !root.querySelector('[data-system-character-modifiers]'),
      'the Character Modifiers section is absent when gathering is off'
    );
    // ...but the Prerequisites card still renders. Its rows must NOT offer a
    // Copy to Modifiers action (there is no modifier store to copy into).
    assert.ok(
      root.querySelector('[data-system-character-prerequisites]'),
      'the Character Prerequisites card still renders'
    );
    assert.equal(
      root.querySelectorAll('[data-copy-to-modifier]').length,
      0,
      'no Copy to Modifiers button when gathering is off'
    );
  });
});
