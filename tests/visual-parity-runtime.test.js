/**
 * The page-side runtime's CARD CLASSIFIER, run in Node against a hand-built tree.
 *
 * `installParityRuntime` is written to be serialised into a browser page, so nothing inside it
 * is importable — but it is a plain function over `globalThis.document` and
 * `globalThis.getComputedStyle`, and both of those can be supplied. That is worth the fixture
 * below, because the classifier's calibration is the one part of this harness whose defect was
 * INVISIBLE IN EVERY LOG IT PRODUCED.
 *
 * ── The defect this file exists for ────────────────────────────────────────────────────────
 * `isCard` asks whether an element spans most of its pane (`width >= rootWidth * 0.6`), and
 * `rootWidth` was read straight off the enumeration root with a `|| 1` fallback. A
 * `display: contents` element generates NO BOX — `clientWidth` is 0, `getBoundingClientRect()`
 * is 0x0 — and every screen root of the prototype this pass measures is exactly that. So the
 * prototype was classified against a ONE-PIXEL pane and the subject against its real one, which
 * is two different classifiers wearing one name:
 *
 *   - on the prototype, `>= 0.6px` made every bordered, rounded LIST ROW a card, and each was
 *     then reported as a card the subject was missing;
 *   - on the subject, `>= 635px` meant no card in a two-column grid was a card at all, so a
 *     genuinely absent narrow card could not be reported — the pass could not fail on the
 *     defect it exists for.
 *
 * A real browser is not needed to state that: what the fixture has to reproduce is a root with
 * no box and an ancestor that has one, and those are two numbers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { installParityRuntime } from '../scripts/visual-parity/lib/page-runtime.js';

/** The classifier thresholds `inventory.mjs` runs with, so the unit and the tool agree. */
const LIMITS = {
  minCardRadius: 6,
  minCardWidthRatio: 0.6,
  minTitleWeight: 600,
  minTitleSize: 12,
  maxLabelLength: 40,
};

const DEFAULT_STYLE = {
  display: 'block',
  visibility: 'visible',
  borderTopStyle: 'solid',
  borderTopWidth: '1px',
  borderTopLeftRadius: '9px',
  fontWeight: '400',
  fontSize: '12px',
};

/**
 * Build one element of the fake tree.
 *
 * `width` is the element's BOX. `contents: true` reproduces the CSS fact this file is about: a
 * `display: contents` box is not laid out, so both width readings are zero however wide its
 * children are.
 *
 * @param {object} spec `{ tag, width, text, style, contents, children }`.
 * @returns {object} A node the runtime can walk.
 */
function node(spec) {
  const width = spec.contents ? 0 : (spec.width ?? 0);
  const display = spec.contents ? { display: 'contents' } : null;
  const element = {
    tagName: (spec.tag ?? 'div').toUpperCase(),
    className: spec.className ?? '',
    parentElement: null,
    children: spec.children ?? [],
    childNodes: spec.text ? [{ nodeType: 3, textContent: spec.text }] : [],
    clientWidth: width,
    getBoundingClientRect: () => ({ width, height: 20, left: 0, right: width, top: 0 }),
    style: { ...DEFAULT_STYLE, ...display, ...spec.style },
  };
  for (const child of element.children) child.parentElement = element;
  return element;
}

/** Depth-first document order, which is all `compareDocumentPosition` is used for here. */
function order(root, list = []) {
  list.push(root);
  for (const child of root.children) order(child, list);
  return list;
}

/**
 * Enumerate a fake tree through the REAL runtime.
 *
 * The globals are installed, used and removed inside this call: the runtime reads
 * `globalThis.document` once at install and `globalThis.getComputedStyle` on every element, so
 * a test that left them behind would leak a fake DOM into every later test in the file.
 *
 * @param {object} root The root to enumerate.
 * @returns {object} `{ cards, loose }` or `{ unmeasurableRoot: true }`.
 */
function enumerate(root) {
  const sequence = order(root);
  for (const element of sequence) {
    element.compareDocumentPosition = (other) =>
      sequence.indexOf(other) > sequence.indexOf(element) ? 4 : 2;
  }
  const saved = {
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    Node: globalThis.Node,
    parity: globalThis.__fabricateParity,
  };
  // `Reflect.set` rather than assignment: `unicorn/no-global-object-property-assignment` is
  // right that writing onto `globalThis` by hand is usually a mistake, and here it is the
  // deliberate point — the runtime is written to be evaluated INSIDE a page, so supplying the
  // page's globals is the only way to run it anywhere else.
  const install = (name, value) => Reflect.set(globalThis, name, value);
  install('document', { querySelector: () => root, documentElement: root });
  install('getComputedStyle', (element) => element.style);
  install('Node', { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 });
  try {
    installParityRuntime();
    return globalThis.__fabricateParity.collectInventory(root, LIMITS);
  } finally {
    install('document', saved.document);
    install('getComputedStyle', saved.getComputedStyle);
    install('Node', saved.Node);
    install('__fabricateParity', saved.parity);
  }
}

/**
 * The shape both sides of the parity run draw: a 1200px pane holding a full-width card, a
 * two-thirds-width card, and a NARROW titled tile that is not a card at either width.
 *
 * The three widths are the ones that decide everything against a 0.6 ratio and a 1200px pane:
 * 1176 and 800 clear it, and 400 does not. The tile is bordered, rounded and titled — a
 * catalogue row, an essence tile — which is exactly the element the broken calibration turned
 * into a prototype-only card and then reported as MISSING on the subject.
 *
 * @param {boolean} contentsRoot Whether the screen root is `display: contents`.
 * @returns {object} The screen root, parented by a laid-out pane.
 */
function screen(contentsRoot) {
  const titled = (title, width) =>
    node({
      width,
      children: [
        node({ tag: 'h3', width, text: title, style: { fontWeight: '600', fontSize: '15px' } }),
      ],
    });
  const root = node({
    contents: contentsRoot,
    width: 1200,
    children: [
      titled('Classification', 1176),
      titled('Systems', 800),
      titled('Iron Ingot', 400),
    ],
  });
  return node({ width: 1200, children: [root] }).children[0];
}

/** Titles and labels, which is what the structural report compares between the two sides. */
function shape(inventory) {
  return inventory.cards.map((card) => `${card.path.join(' > ')}|${card.labels.join(',')}`);
}

test('the card classifier measures both documents against the same pane', async (subtests) => {
  await subtests.test('a root that HAS a box classifies two cards, not three', () => {
    assert.deepEqual(
      enumerate(screen(false)).cards.map((card) => card.title),
      ['classification', 'systems'],
      'the 400px tile is under the 0.6 ratio and is folded into the pane'
    );
  });

  await subtests.test('a `display: contents` root classifies identically', () => {
    // THE REGRESSION. With `rootWidth` read off the root and defaulted to `1`, the ratio test
    // became `>= 0.6px` here and the tile was a THIRD card — which is why the real runs
    // reported `MISSING CARD "Ash Salt"`, `"Bramble Fibre"`, `"Cold Iron Nail"` for prototype
    // list rows the subject draws as rows too.
    assert.deepEqual(
      enumerate(screen(true)).cards.map((card) => card.title),
      ['classification', 'systems'],
      'a root with no box borrows the pane its children are laid out in'
    );
  });

  await subtests.test('the two document shapes enumerate to the SAME landmarks', () => {
    // The property the pass depends on and the one F1 broke, stated as an equality rather than
    // as two counts: the prototype's roots are `display: contents` and the subject's are real
    // boxes, so a classifier that reads the root's own width is TWO classifiers wearing one
    // name, and every finding it prints is a comparison between them.
    assert.deepEqual(shape(enumerate(screen(true))), shape(enumerate(screen(false))));
  });

  await subtests.test('a root with no box anywhere above it is a fault, not a default', () => {
    // `|| 1` was a default nobody chose, and falling through to 0 instead would be worse: it
    // would classify nothing as a card and report an unmeasurable screen as a clean one.
    const orphan = node({ contents: true, children: [node({ width: 800 })] });
    assert.deepEqual(enumerate(orphan), { unmeasurableRoot: true });
  });
});
