/** The page-side runtime's CARD CLASSIFIER, run in Node against a hand-built tree. */
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

/**
 * Enumerate through the REAL `inventoryOf` entry point, with a document that answers selectors from
 * a map.
 *
 * @param {object} payload `{ locator, pane }` exactly as `inventory.mjs` sends it.
 * @param {object} bySelector Selector → element.
 * @param {object} tree The whole tree, for document order.
 * @returns {object} Whatever the runtime answers.
 */
function enumerateThroughEntryPoint(payload, bySelector, tree) {
  const sequence = order(tree);
  for (const element of sequence) {
    element.compareDocumentPosition = (other) =>
      sequence.indexOf(other) > sequence.indexOf(element) ? 4 : 2;
    element.contains = (other) => order(element).includes(other);
  }
  const saved = {
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    Node: globalThis.Node,
    parity: globalThis.__fabricateParity,
  };
  const install = (name, value) => Reflect.set(globalThis, name, value);
  install('document', {
    querySelector: (selector) => bySelector[selector] ?? null,
    documentElement: tree,
  });
  install('getComputedStyle', (element) => element.style);
  install('Node', { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 });
  try {
    installParityRuntime();
    return globalThis.__fabricateParity.inventoryOf({ limits: LIMITS, ...payload });
  } finally {
    install('document', saved.document);
    install('getComputedStyle', saved.getComputedStyle);
    install('Node', saved.Node);
    install('__fabricateParity', saved.parity);
  }
}

/**
 * THE SHAPE THE ROOT SET EXISTS FOR, and it is this product's own. The prototype's screen root is
 * one `display: contents` wrapper over the header band and the body grid.
 *
 * @returns {object} `{ tree, bySelector }`.
 */
function shellScreen() {
  const label = (text, width) =>
    node({ tag: 'p', width, text, style: { borderTopStyle: 'none', borderTopWidth: '0px' } });
  const card = (title, width) =>
    node({
      width,
      children: [
        node({ tag: 'h3', width, text: title, style: { fontWeight: '600', fontSize: '15px' } }),
      ],
    });
  const header = node({ tag: 'header', width: 1398, children: [label('Add from catalogue', 200)] });
  const rail = node({ tag: 'aside', width: 220, children: [label('Recipes', 195)] });
  const main = node({ tag: 'main', width: 878, children: [card('Iron Ore', 830)] });
  const inspector = node({ tag: 'aside', width: 300, children: [label('Tags in effect', 275)] });
  const body = node({ width: 1398, children: [rail, main, inspector] });
  const tree = node({ width: 1398, children: [header, body] });
  return {
    tree,
    bySelector: {
      'header.manager-header': header,
      'main.manager-main': main,
      'aside.manager-inspector': inspector,
      'aside.manager-rail': rail,
      '.manager-body': body,
      '.missing': null,
    },
  };
}

test('an inventory root may be a declared SET of boxes', async (subtests) => {
  await subtests.test('the set enumerates every part, and one part enumerates only its own', () => {
    const { tree, bySelector } = shellScreen();
    const one = enumerateThroughEntryPoint(
      { locator: 'main.manager-main', pane: 'main.manager-main' },
      bySelector,
      tree
    );
    // THE DEFECT, stated as the fixture's own numbers: enumerating the content column alone
    // finds neither the header band's action nor the inspector's caption, and the real run said
    // "the subject draws it nowhere" about both while they were on screen.
    assert.deepEqual(one.loose.labels, []);
    assert.deepEqual(
      one.cards.map((entry) => entry.title),
      ['iron ore']
    );

    const set = enumerateThroughEntryPoint(
      {
        locator: {
          parts: ['header.manager-header', 'main.manager-main', 'aside.manager-inspector'],
        },
        pane: 'main.manager-main',
      },
      bySelector,
      tree
    );
    assert.deepEqual(set.loose.labels, ['add from catalogue', 'tags in effect']);
    assert.deepEqual(
      set.cards.map((entry) => entry.title),
      ['iron ore'],
      'the set adds landmarks, it does not re-classify them'
    );
    assert.ok(
      !set.loose.labels.includes('recipes'),
      'the navigation rail is deliberately excluded: the prototype root does not contain it'
    );
  });

  await subtests.test('the declared pane, not the first part, sets the card floor', () => {
    // WITHOUT THE PANE RULE this is a silent re-calibration.
    const { tree, bySelector } = shellScreen();
    const parts = ['header.manager-header', 'main.manager-main', 'aside.manager-inspector'];
    const floorFromMain = enumerateThroughEntryPoint(
      { locator: { parts }, pane: 'main.manager-main' },
      bySelector,
      tree
    );
    const floorFromBody = enumerateThroughEntryPoint(
      { locator: { parts }, pane: '.manager-body' },
      bySelector,
      tree
    );
    assert.deepEqual(
      floorFromMain.cards.map((entry) => entry.title),
      ['iron ore'],
      '830 clears 878 * 0.6'
    );
    assert.deepEqual(
      floorFromBody.cards.map((entry) => entry.title),
      [],
      '830 does not clear 1398 * 0.6, and the pane is what decides'
    );
  });

  await subtests.test('a part that resolves to nothing is a fault, not a shorter walk', () => {
    // A DROPPED PART DOES NOT REPORT ITSELF.
    const { tree, bySelector } = shellScreen();
    const result = enumerateThroughEntryPoint(
      { locator: { parts: ['header.manager-header', '.missing'] }, pane: 'main.manager-main' },
      bySelector,
      tree
    );
    assert.equal(result.missingRoot, true);
    assert.equal(result.missingPart, '.missing');
  });

  await subtests.test('a part INSIDE another part is a fault, not a double count', () => {
    // Nesting enumerates the overlap twice and closes the same card twice, which surfaces as an
    // EXTRA CARD the subject appears to draw twice — a finding about the spec wearing the shape
    // of a finding about the product.
    const { tree, bySelector } = shellScreen();
    const result = enumerateThroughEntryPoint(
      { locator: { parts: ['.manager-body', 'main.manager-main'] }, pane: 'main.manager-main' },
      bySelector,
      tree
    );
    assert.deepEqual(result, { nestedRoots: true });
  });
});
