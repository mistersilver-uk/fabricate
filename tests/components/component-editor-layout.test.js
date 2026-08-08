import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../../src/ui/svelte/apps/ComponentEditorRoot.svelte');
const source = readFileSync(componentPath, 'utf8');

// A "this name must not survive" assertion has to read MARKUP, not prose. The component
// documents the hand-rolled control it replaced — which is the point of the comment — so
// the HTML and CSS comment bodies are stripped before the ratchet below looks for it.
// `//` line comments are deliberately left in place: a URL contains `//`.
const markup = source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('component editor essence cards render quantity, icon, and name inline', () => {
  const quantityIndex = source.indexOf('<Stepper');
  const iconIndex = source.indexOf('class="essence-icon"');
  const nameIndex = source.indexOf('class="essence-name"');

  assert.notEqual(quantityIndex, -1, 'quantity stepper should exist');
  assert.notEqual(iconIndex, -1, 'essence icon should exist');
  assert.notEqual(nameIndex, -1, 'essence name should exist');
  assert.ok(quantityIndex < iconIndex, 'quantity stepper should appear before the icon');
  assert.ok(iconIndex < nameIndex, 'essence icon should appear before the name');
});

test('component editor essence cards use compact two-column grid styling by default', () => {
  assert.ok(
    source.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'),
    'essence grid should default to two columns'
  );
  assert.ok(
    source.includes('grid-template-columns: auto auto 1fr;'),
    'essence card should keep controls and content on one inline row'
  );
});

// Issue 1050. The card used to hand-roll `[−][qty][icon][name][+]` — a −/+ pair around a
// bare `type="number"`, with the `+` stranded on the trailing edge — duplicating the
// shared `Stepper`'s shape without its clamp, its commit path or its spinner suppression.
// A ratchet, not decoration: the names below are what a re-hand-rolled control would
// reintroduce, and their scoped CSS is what emits `Unused CSS selector` if it outlives the
// markup, which fails the compiler-warning gate.
test('component editor essence quantity is the shared Stepper, not a hand-rolled pair', () => {
  assert.ok(markup.includes("from '../components/Stepper.svelte'"), 'it imports the primitive');
  assert.equal(
    markup.includes('essence-quantity-input'),
    false,
    'the bare quantity input and its half-finished spinner suppression are retired'
  );
  assert.equal(
    markup.includes('essence-step'),
    false,
    'and so are the hand-rolled −/+ buttons and their treatment'
  );
  // The keys are NOT retired with the buttons: they are `{name}`-parametrized and four call
  // sites use them, two of which are untouched surfaces. The Stepper reuses them.
  assert.ok(
    source.includes('FABRICATE.Admin.Items.Editor.DecrementEssence') &&
      source.includes('FABRICATE.Admin.Items.Editor.IncrementEssence'),
    'the existing adjunct labels are reused rather than replaced'
  );
});
