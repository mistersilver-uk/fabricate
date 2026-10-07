/**
 * The Primitive Lab's drawing-text gate (issue 1487): every word a catalogue row hands its live
 * component appears in the drawing it stands for, so a specimen cannot drift from the library's
 * copy unseen. A word the shipped component needs and the drawing lacks — an accessible name, a
 * caller-only word — is named in the row's `undrawn`, each with its reason.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Window } from 'happy-dom';

import { catalogueEntries } from '../scripts/lib/primitiveLabSmoke.js';

import { readDesignLibrary } from './helpers/designLibrary.js';
import { resolveSlots } from './view-lab/primitives/inject.js';
import { normalize, specBlocks, unitsOf } from './view-lab/primitives/library.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const MANIFEST = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.json'), 'utf8')
);

/**
 * Props whose values are identifiers, enumerations, icon classes or styles rather than words: the
 * drawing shows what they select, never the value. Any other string prop is a word to check.
 */
const VALUE_PROP =
  /^(?:\w+(?:Id|Key|Keys|Icon)|id|key|icon|class|style|tone|state|status|kind|kinds|tint|type|role|density|as|variant|color|colorToken|ink|art|side|layout|fill|pipKind|shape|orientation|align|direction|emphasis|marks|tag|tagMatch|chooser|awardStrategy|vehicle|target|binding|controls|pageSelectionState|activeTab|selectedValue|groupName)$/;

/** The attributes of a row's node, or of the drawing, that hold words a reader meets. */
const WORD_ATTRIBUTES = Object.freeze(['aria-label', 'placeholder', 'title', 'alt']);

/** A drawing also writes a field's shown value as an attribute, as a `readonly` input does. */
const DRAWN_ATTRIBUTES = Object.freeze([...WORD_ATTRIBUTES, 'value']);

/** Every non-empty word string a row's props, content and snippets pass, in order. */
function rowWords(row) {
  const words = [];
  const fromProps = (value, key) => {
    if (typeof value === 'string') {
      if (value.trim() && !VALUE_PROP.test(key)) words.push(normalize(value));
    } else if (Array.isArray(value)) {
      for (const item of value) fromProps(item, key);
    } else if (value && typeof value === 'object') {
      for (const [name, item] of Object.entries(value)) fromProps(item, name);
    }
  };
  const fromNodes = (nodes = []) => {
    for (const node of nodes) {
      if (typeof node === 'string') {
        if (node.trim()) words.push(normalize(node));
        continue;
      }
      if (node.text?.trim()) words.push(normalize(node.text));
      for (const name of WORD_ATTRIBUTES) {
        const value = node.attrs?.[name];
        if (typeof value === 'string' && value.trim()) words.push(normalize(value));
      }
      fromNodes(node.children);
    }
  };
  fromProps(row.props ?? {}, '');
  fromNodes(row.content);
  for (const nodes of Object.values(row.snippets ?? {})) fromNodes(nodes);
  return words;
}

/** The text a drawing shows: its text and its word attributes, whitespace-collapsed. */
function drawnText(element) {
  const parts = [element.textContent];
  for (const node of [element, ...element.querySelectorAll('*')]) {
    for (const name of DRAWN_ATTRIBUTES) {
      const value = node.getAttribute(name);
      if (value) parts.push(value);
    }
  }
  return normalize(parts.join(' \n '));
}

/**
 * The drawing a row's words are read against: its captioned unit, or, for a row with no caption,
 * the stage its drawing stands on.
 */
function drawingOf(slot, blocks) {
  if (slot.row.cap) return unitsOf(blocks.get(slot.row.spec)).get(normalize(slot.row.cap));
  return slot.host.closest('.stage') ?? slot.host;
}

const window = new Window();
window.document.write(readDesignLibrary());
const BLOCKS = specBlocks(window.document.body);
const ENTRIES = catalogueEntries(REPO_ROOT);
const { slots: SLOTS, problems: PROBLEMS } = resolveSlots(
  window.document.body,
  ENTRIES.map((entry) => entry.row),
  [...MANIFEST.designSystemPrimitives, ...MANIFEST.notAPrimitive]
);
const WHERE = new Map(
  ENTRIES.map((entry) => [entry.row, `catalogue/${entry.file}[${entry.index}]`])
);

/** Each row's words the drawing lacks, against the reasons its `undrawn` gives. */
function drift(slot) {
  const text = drawnText(drawingOf(slot, BLOCKS));
  const words = rowWords(slot.row);
  const absent = [...new Set(words.filter((word) => !text.includes(word)))];
  const undrawn = slot.row.undrawn ?? {};
  return {
    unexplained: absent.filter((word) => !Object.hasOwn(undrawn, word)),
    stale: Object.keys(undrawn).filter((word) => !absent.includes(normalize(word))),
  };
}

test('the drawing-text gate reads every catalogue row against its drawing', () => {
  assert.deepEqual(PROBLEMS, []);
  assert.equal(SLOTS.length, ENTRIES.length, 'every row must resolve to one drawing');
  const checked = SLOTS.reduce((total, slot) => total + rowWords(slot.row).length, 0);
  assert.ok(checked > 300, `${checked} words checked, so the word reader is not reading`);
});

test('every word a row passes appears in its drawing, or its `undrawn` says why not', () => {
  const problems = [];
  for (const slot of SLOTS) {
    const { unexplained, stale } = drift(slot);
    const at = `${WHERE.get(slot.row)} ${slot.row.spec}`;
    for (const word of unexplained) {
      problems.push(`${at}: ${JSON.stringify(word)} is not in the drawing`);
    }
    for (const word of stale) {
      problems.push(
        `${at}: \`undrawn\` names ${JSON.stringify(word)}, which the row does not pass or the drawing shows`
      );
    }
  }
  assert.deepEqual(problems, []);
});

test('an `undrawn` entry is a word with its reason', () => {
  for (const slot of SLOTS) {
    const { undrawn } = slot.row;
    if (undrawn === undefined) continue;
    assert.ok(
      typeof undrawn === 'object' && undrawn !== null && !Array.isArray(undrawn),
      `${WHERE.get(slot.row)}: \`undrawn\` maps a word to the reason the drawing lacks it`
    );
    for (const [word, reason] of Object.entries(undrawn)) {
      assert.ok(
        typeof reason === 'string' && reason.trim().length > 0,
        `${WHERE.get(slot.row)}: \`undrawn\` gives ${JSON.stringify(word)} no reason`
      );
    }
  }
});

test('the gate reads words, skips values, and finds a drifted title', () => {
  const row = {
    props: {
      title: 'Zzz drifted',
      icon: 'fas fa-x',
      tone: 'positive',
      items: [{ id: 'a', name: 'Iron' }],
    },
    content: [{ tag: 'input', attrs: { placeholder: 'Search', type: 'search' } }, ' ', 'Body'],
    snippets: { actions: [{ tag: 'button', text: 'Save', children: ['Now'] }] },
  };
  assert.deepEqual(rowWords(row), ['Zzz drifted', 'Iron', 'Search', 'Body', 'Save', 'Now']);
  const drawing = new Window().document;
  drawing.body.innerHTML =
    '<div><h3>Frontier</h3> <span class="ph" title="Iron">Search</span></div>';
  assert.equal(drawnText(drawing.body.firstElementChild), 'Frontier Search Iron');
});
