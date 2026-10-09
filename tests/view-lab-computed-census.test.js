/**
 * The View Lab's computed census (`scripts/lib/viewLabComputedCensus.js`): its band and mono
 * verdicts, its collector over a stub DOM, its assertion over a fake page, and the capture driver
 * awaiting it after the layout assertion and before the frame's screenshot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { bandCorner } from '../scripts/lib/radiusLadder.js';
import {
  RULED_KINDS,
  assertComputedCensus,
  censusFindings,
  collectFrameCensus,
  cornerVerdict,
  monoVerdict,
} from '../scripts/lib/viewLabComputedCensus.js';

import { calledName, parseModule, walkNodes } from './helpers/moduleAst.js';

const ROOT = resolve(import.meta.dirname, '..');
const FRAME = '[data-view-lab-frame="probe"]';

test('each ladder height takes its band corner, and a height between bands takes none', () => {
  const bands = [22, 24, 25, 26, 32, 33, 34, 38, 40, 44, 48].map((px) => [px, bandCorner(px)]);
  assert.deepEqual(bands, [
    [22, 6],
    [24, 6],
    [25, null],
    [26, 7],
    [32, 7],
    [33, null],
    [34, 9],
    [38, 9],
    [40, null],
    [44, 11],
    [48, null],
  ]);
});

test('a box off its band fails, and a shape corner or an unbanded height passes', () => {
  const verdicts = (cases) =>
    cases.map(([height, radius]) => [height, radius, cornerVerdict({ height, radius }) !== null]);
  assert.deepEqual(
    verdicts([
      [22, 6],
      [22, 9],
      [26, 6],
      [30, 7],
      [30, 9],
      [32, 9],
      [34, 7],
      [34, 9],
      [38, 6],
      [38, 11],
      [40, 11],
      [44, 9],
      [44, 11],
      [28, 0],
      [28, 14],
      [24, 999],
      [33, 3],
      [48, 3],
    ]),
    [
      [22, 6, false],
      [22, 9, true],
      [26, 6, true],
      [30, 7, false],
      [30, 9, true],
      [32, 9, true],
      [34, 7, true],
      [34, 9, false],
      [38, 6, true],
      [38, 11, true],
      [40, 11, false],
      [44, 9, true],
      [44, 11, false],
      [28, 0, false],
      [28, 14, false],
      [24, 999, false],
      [33, 3, false],
      [48, 3, false],
    ]
  );
});

test('a ruled kind passes at its own selector, heights and corner only', () => {
  const passes = (kinds, height, radius) => cornerVerdict({ height, radius, kinds }) === null;
  for (const { selector, heights, corner } of RULED_KINDS) {
    for (const height of heights) {
      assert.equal(passes([selector], height, corner), true, `${selector} at ${height}`);
      assert.equal(passes([], height, corner), false, `${selector}'s ruling needs the selector`);
      assert.equal(passes([selector], height, corner + 1), false, `${selector}, another corner`);
    }
  }
  assert.equal(passes(['.fab-avatar'], 30, 9), false, 'a ruling holds at its own heights');
  assert.equal(passes(['.manager-nav-subitem'], 44, 7), false, 'a wrapped row at two lines');
});

test('mono text above 500 fails, and the findings name each element once', () => {
  assert.equal(monoVerdict({ weight: 500 }), null);
  assert.match(monoVerdict({ weight: 600 }), /above the face's 500/);
  assert.deepEqual(
    censusFindings({
      boxes: [
        { element: 'button.a', height: 34, radius: 6 },
        { element: 'button.a', height: 34, radius: 6 },
        { element: 'span.b', height: 22, radius: 6 },
      ],
      texts: [
        { element: 'span.c', weight: 700 },
        { element: 'span.d', weight: 400 },
      ],
    }),
    [
      'button.a: 34px tall at radius 6, where its band draws 9',
      "span.c: mono at weight 700, above the face's 500",
    ]
  );
});

/* ───────────── the collector and the assertion over a stub DOM ───────────── */

const PAINTED = { backgroundColor: 'rgb(1, 2, 3)' };
const CLEAR = { backgroundColor: 'rgba(0, 0, 0, 0)' };

/** A stub element: its tag and classes, the selectors it matches, its box and computed style. */
function node(spec, children = []) {
  const {
    tag = 'div',
    classes = [],
    matches = [],
    height = 20,
    radius = 0,
    text = '',
    style = {},
  } = spec;
  const element = {
    tagName: tag.toUpperCase(),
    classList: classes,
    parentElement: null,
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    children,
    getBoundingClientRect: () => ({ width: 40, height }),
    computedStyle: {
      display: 'block',
      visibility: 'visible',
      backgroundImage: 'none',
      boxShadow: 'none',
      fontFamily: 'Signika',
      fontWeight: '400',
      ...Object.fromEntries(
        ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((c) => [
          `border${c}Radius`,
          `${radius}px`,
        ])
      ),
      ...CLEAR,
      ...style,
      getPropertyValue: (name) => (name === '--fab-font-mono' ? (style.mono ?? '') : ''),
    },
    matches: (selector) => selector.split(', ').some((part) => matches.includes(part)),
    closest(selector) {
      for (let at = element; at; at = at.parentElement) if (at.matches(selector)) return at;
      return null;
    },
    querySelectorAll: () => children.flatMap((child) => [child, ...child.querySelectorAll('*')]),
  };
  for (const child of children) child.parentElement = element;
  return element;
}

const MONO = { mono: '"Fira Code", monospace' };

/** A frame holding `children` under a window whose content resolves the mono token. */
function frameOf(children, { header = [], mono = MONO } = {}) {
  const head = node({ classes: ['window-header'], matches: ['.window-header'] }, header);
  const content = node({ classes: ['window-content'], style: mono }, children);
  return node({ matches: [FRAME] }, [head, content]);
}

/** Run `fn` with `document` and `getComputedStyle` answering from `root`. */
async function withDom(root, fn) {
  const previous = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  Object.assign(globalThis, {
    document: { querySelector: (selector) => (selector === FRAME ? root : null) },
    getComputedStyle: (element) => element.computedStyle,
  });
  try {
    return await fn();
  } finally {
    Object.assign(globalThis, previous);
  }
}

const ARGS = {
  frameSelector: FRAME,
  judged: 'button',
  skipped: '.window-header, .player-extension-target',
  ruled: ['.fab-avatar'],
};
const collect = (root) => withDom(root, () => collectFrameCensus(ARGS));
const buttonAt9 = (style = PAINTED) =>
  node({ tag: 'button', classes: ['probe'], matches: ['button'], height: 30, radius: 9, style });

test('the collector judges a painted control and passes over an unpainted one', async () => {
  const painted = censusFindings(await collect(frameOf([buttonAt9()])));
  assert.deepEqual(painted, [
    'div.window-content > button.probe: 30px tall at radius 9, where its band draws 7',
  ]);
  assert.deepEqual(censusFindings(await collect(frameOf([buttonAt9(CLEAR)]))), []);
});

test('the collector skips a companion mount and the window header', async () => {
  const companion = node({ matches: ['.player-extension-target'] }, [buttonAt9()]);
  assert.deepEqual(censusFindings(await collect(frameOf([companion]))), []);
  assert.deepEqual(censusFindings(await collect(frameOf([], { header: [buttonAt9()] }))), []);
});

test('the collector judges a portaled overlay outside the window content', async () => {
  const overlay = node({ classes: ['fabricate-select-popover'] }, [buttonAt9()]);
  const root = frameOf([]);
  root.children.push(overlay);
  overlay.parentElement = root;
  assert.equal(censusFindings(await collect(root)).length, 1);
});

test('the collector reads the mono face each element resolves', async () => {
  const text = (weight, style = MONO) =>
    node({
      tag: 'span',
      text: '12',
      style: { fontFamily: 'Fira Code', fontWeight: weight, ...style },
    });
  const heavy = await collect(frameOf([text('700')]));
  assert.deepEqual(censusFindings(heavy), [
    "div.window-content > span: mono at weight 700, above the face's 500",
  ]);
  const unresolved = await collect(frameOf([text('700', {})], { mono: {} }));
  assert.equal(unresolved.monoResolved, false, 'no element resolved the token');
  assert.deepEqual(censusFindings(unresolved), []);
});

/** A fake Playwright page, running the evaluated function in this process. */
const page = { evaluate: async (fn, arg) => fn(arg) };

test('the assertion names the label, and throws on a missing frame or mono token', async () => {
  const clean = frameOf([buttonAt9(CLEAR)]);
  await withDom(clean, () => assert.doesNotReject(assertComputedCensus(page, 'probe', 'case-a')));
  await withDom(frameOf([buttonAt9()]), () =>
    assert.rejects(
      assertComputedCensus(page, 'probe', 'case-b'),
      /^Error: case-b: the computed census found 1 off/
    )
  );
  await withDom(clean, () =>
    assert.rejects(assertComputedCensus(page, 'other', 'case-c'), /^Error: case-c: .*found no/)
  );
  await withDom(frameOf([], { mono: {} }), () =>
    assert.rejects(assertComputedCensus(page, 'probe', 'case-d'), /^Error: case-d: --fab-font-mono/)
  );
});

/* ───────────── the capture driver ───────────── */

/** The `await <name>(...)` statements directly in `body`, by statement index. */
const awaitedCalls = (body) =>
  body.flatMap((statement, index) => {
    const expression = statement.type === 'ExpressionStatement' ? statement.expression : null;
    return expression?.type === 'AwaitExpression' ? [[calledName(expression.argument), index]] : [];
  });

test('the capture driver awaits the layout, then the census, then the frame screenshot', () => {
  const { ast } = parseModule(
    readFileSync(resolve(ROOT, 'scripts/view-lab-screenshots.mjs'), 'utf8')
  );
  const renderPage = ast.body.find(
    (statement) => statement.type === 'FunctionDeclaration' && statement.id.name === 'renderPage'
  );
  const tryBody = renderPage.body.body.find((statement) => statement.type === 'TryStatement').block
    .body;
  const at = new Map(awaitedCalls(tryBody));
  const screenshot = tryBody.findIndex((statement) =>
    [...walkNodes(statement)].some((inner) => calledName(inner) === 'screenshot')
  );
  assert.ok(at.has('assertComputedCensus'), 'the census is an unconditional awaited statement');
  assert.ok(at.get('assertViewLabLayout') < at.get('assertComputedCensus'), 'layout first');
  assert.ok(at.get('assertComputedCensus') < screenshot, 'the census runs before the screenshot');
});
