import assert from 'node:assert/strict';
import test from 'node:test';

import { assertViewLabLayout } from '../scripts/lib/viewLabLayoutAssertion.js';

const EXPECTATION = {
  containerSelector: '.layout-container',
  gridSelector: '.layout-grid',
  maxContentBoxInlineSize: 960,
};

function element({ width, bottom = 0, padding = 0, border = 0, gridTemplateColumns = 'none' }) {
  return {
    getBoundingClientRect: () => ({ width, bottom }),
    computedStyle: {
      paddingLeft: `${padding}px`,
      paddingRight: `${padding}px`,
      borderLeftWidth: `${border}px`,
      borderRightWidth: `${border}px`,
      gridTemplateColumns,
    },
  };
}

function frame(elements, queried = []) {
  return {
    locator(selector) {
      queried.push(selector);
      const target = elements[selector];
      return {
        count: async () => (Array.isArray(target) ? target.length : target ? 1 : 0),
        evaluateAll: async (callback, arg) => callback(target ?? [], arg),
        evaluate: async (callback, argument) => {
          const previous = globalThis.getComputedStyle;
          globalThis.getComputedStyle = (node) => node.computedStyle;
          try {
            return callback(target, argument);
          } finally {
            globalThis.getComputedStyle = previous;
          }
        },
      };
    },
  };
}

function layoutFrame({ containerWidth = 960, padding = 0, border = 0, columns = '960px' } = {}) {
  return frame({
    '.layout-container': element({ width: containerWidth, padding, border }),
    '.layout-grid': element({ width: containerWidth, gridTemplateColumns: columns }),
  });
}

test('accepts an exact 960px content box and one resolved grid track', async () => {
  await assert.doesNotReject(assertViewLabLayout(layoutFrame(), EXPECTATION, 'exact-boundary'));
});

test('rejects a content box wider than the declared maximum', async () => {
  await assert.rejects(
    assertViewLabLayout(layoutFrame({ containerWidth: 961 }), EXPECTATION, 'over-width'),
    /content-box inline size 961px exceeds 960px/
  );
});

test('measures the content box rather than the padded and bordered border box', async () => {
  await assert.doesNotReject(
    assertViewLabLayout(
      layoutFrame({ containerWidth: 984, padding: 10, border: 2 }),
      EXPECTATION,
      'content-box'
    )
  );
});

test('rejects multi-track and none computed grids', async () => {
  await assert.rejects(
    assertViewLabLayout(layoutFrame({ columns: '480px 480px' }), EXPECTATION, 'multi-track'),
    /exactly 1 resolved grid track/
  );
  await assert.rejects(
    assertViewLabLayout(layoutFrame({ columns: 'none' }), EXPECTATION, 'none'),
    /resolved to "none"/
  );
});

// The track count is an INPUT (issue 1362). The five 1024px responsive cases assert "this stacked",
// and the assertion was literally `tracks.length !== 1`.

const FULL_WIDTH_EXPECTATION = {
  containerSelector: '.layout-container',
  gridSelector: '.layout-grid',
  expectedTracks: 2,
  absentSelector: '.manager-inspector',
};

test('accepts the declared track count and rejects any other', async () => {
  await assert.doesNotReject(
    assertViewLabLayout(
      layoutFrame({ columns: '220px 1040px' }),
      FULL_WIDTH_EXPECTATION,
      'two-track'
    )
  );
  await assert.rejects(
    assertViewLabLayout(
      layoutFrame({ columns: '220px 740px 300px' }),
      FULL_WIDTH_EXPECTATION,
      'three-track'
    ),
    /exactly 2 resolved grid track/
  );
});

test('rejects a route that released its column but still renders the aside', async () => {
  // The two edits are separable, and doing only the stylesheet half leaves the empty aside
  // wrapped to an implicit grid row — where the track count is still two and the frame still
  // photographs a dead strip. Measured rather than inferred, for exactly that reason.
  const withAside = frame({
    '.layout-container': element({ width: 1280 }),
    '.layout-grid': element({ width: 1280, gridTemplateColumns: '220px 1040px' }),
    '.manager-inspector': element({ width: 300 }),
  });
  await assert.rejects(
    assertViewLabLayout(withAside, FULL_WIDTH_EXPECTATION, 'dead-strip'),
    /must not be rendered on this route/
  );
});

test('skips the width bound when a case declares none', async () => {
  // A full-width case has no `maxContentBoxInlineSize`: it is not asserting a breakpoint, and
  // an accidental default would silently bound every frame at the responsive cases' 960px.
  await assert.doesNotReject(
    assertViewLabLayout(
      layoutFrame({ containerWidth: 1280, columns: '220px 1060px' }),
      FULL_WIDTH_EXPECTATION,
      'unbounded'
    )
  );
});

test('rejects missing container and grid selectors', async () => {
  await assert.rejects(
    assertViewLabLayout(frame({}), EXPECTATION, 'missing-container'),
    /container selector ".layout-container" was not found/
  );
  await assert.rejects(
    assertViewLabLayout(
      frame({ '.layout-container': element({ width: 960 }) }),
      EXPECTATION,
      'missing-grid'
    ),
    /grid selector ".layout-grid" was not found/
  );
});

// The rail must reach the grid's bottom edge (issue 1972). The Knowledge shape: three tracks and no
// absent aside, so the fill check cannot hide behind the `absentSelector` early return.
const FILL_EXPECTATION = {
  containerSelector: '.layout-container',
  gridSelector: '.layout-grid',
  expectedTracks: 3,
  fillSelector: '.layout-rail',
};

function fillFrame({ railBottom, gridBottom = 900, rail = true } = {}) {
  return frame({
    '.layout-container': element({ width: 880 }),
    '.layout-grid': element({
      width: 880,
      bottom: gridBottom,
      gridTemplateColumns: '220px 250px 410px',
    }),
    ...(rail ? { '.layout-rail': element({ width: 220, bottom: railBottom }) } : {}),
  });
}

test('accepts a fill element whose bottom is within 1px of the grid bottom', async () => {
  await assert.doesNotReject(
    assertViewLabLayout(fillFrame({ railBottom: 900 }), FILL_EXPECTATION, 'flush')
  );
  await assert.doesNotReject(
    assertViewLabLayout(fillFrame({ railBottom: 899 }), FILL_EXPECTATION, 'one-pixel')
  );
});

test('rejects a fill element that stops short of or overhangs the grid bottom', async () => {
  await assert.rejects(
    assertViewLabLayout(fillFrame({ railBottom: 898 }), FILL_EXPECTATION, 'short'),
    /\.layout-rail bottom 898px must reach \.layout-grid bottom 900px/
  );
  await assert.rejects(
    assertViewLabLayout(fillFrame({ railBottom: 902 }), FILL_EXPECTATION, 'overhang'),
    /\.layout-rail bottom 902px must reach \.layout-grid bottom 900px/
  );
});

test('rejects a fill selector that matches nothing', async () => {
  await assert.rejects(
    assertViewLabLayout(fillFrame({ rail: false }), FILL_EXPECTATION, 'no-rail'),
    /fill selector "\.layout-rail" was not found/
  );
});

test('never queries for a fill element when the case declares none', async () => {
  const queried = [];
  const withoutFill = { ...FILL_EXPECTATION, fillSelector: undefined };
  await assert.doesNotReject(
    assertViewLabLayout(
      frame(
        {
          '.layout-container': element({ width: 880 }),
          '.layout-grid': element({ width: 880, gridTemplateColumns: '220px 250px 410px' }),
        },
        queried
      ),
      withoutFill,
      'no-fill'
    )
  );
  assert.deepEqual(queried, ['.layout-container', '.layout-grid']);
});

// The requirement row's geometry (issue 1516): optional keys, each measuring every match, with no
// grid at all.
const box = ({ left = 0, width = 30, top = 0, height = 30 }) => ({
  getBoundingClientRect: () => ({
    left,
    right: left + width,
    width,
    top,
    bottom: top + height,
    height,
  }),
});
const row = (...children) => ({ children });
const ROWS = Object.freeze({
  containerSelector: '.rows',
  oneLineRows: '.row',
  alignedRight: '.remove',
  alignedLeft: '.toggle',
  minInlineSize: { selector: '.name', pixels: 140 },
});

function rowsFrame(overrides = {}) {
  return frame({
    '.rows': element({ width: 800 }),
    '.row': [
      row(box({ height: 28, top: 1 }), box({ top: 0 }), box({ top: 0 })),
      // Two lines tall but one line of children: the controls box hangs its message below.
      row(box({ top: 0 }), box({ top: -16, height: 62 })),
    ],
    '.remove': [box({ left: 770 }), box({ left: 770 })],
    '.toggle': [box({ left: 600 }), box({ left: 600 })],
    '.name': [box({ width: 140 }), box({ width: 300 })],
    ...overrides,
  });
}

test('accepts rows on one line, shared edges and a name at its minimum, with no grid', async () => {
  const queried = [];
  const page = rowsFrame();
  const original = page.locator;
  page.locator = (selector) => {
    queried.push(selector);
    return original(selector);
  };
  await assert.doesNotReject(assertViewLabLayout(page, ROWS, 'rows'));
  assert.ok(!queried.includes(undefined), 'no grid is queried when the case names none');
});

test('rejects a row whose child wrapped to a second line', async () => {
  const wrapped = rowsFrame({ '.row': [row(box({ top: 0 }), box({ top: 34 }))] });
  await assert.rejects(assertViewLabLayout(wrapped, ROWS, 'wrapped'), /.row #1 wraps/);
});

test('rejects a wrapped child even when a tall sibling spans both lines', async () => {
  const tall = rowsFrame({
    '.row': [row(box({ top: 0 }), box({ top: 0, height: 80 }), box({ top: 34 }))],
  });
  await assert.rejects(assertViewLabLayout(tall, ROWS, 'tall'), /.row #1 wraps/);
});

test('rejects a child that overlaps the first by a pixel only', async () => {
  const overlap = rowsFrame({ '.row': [row(box({ top: 0 }), box({ top: 29 }))] });
  await assert.rejects(assertViewLabLayout(overlap, ROWS, 'overlap'), /.row #1 wraps/);
});

test('rejects a row with no visible children', async () => {
  const empty = rowsFrame({ '.row': [row(), row(box({ top: 0 }))] });
  await assert.rejects(
    assertViewLabLayout(empty, ROWS, 'empty'),
    /.row #1 has no visible children/
  );
});

test('rejects a remove or a toggle off the shared edge', async () => {
  const removeDropped = rowsFrame({ '.remove': [box({ left: 770 }), box({ left: 560 })] });
  await assert.rejects(
    assertViewLabLayout(removeDropped, ROWS, 'remove'),
    /.remove must share one right edge; got 800, 590px/
  );
  const toggleShifted = rowsFrame({ '.toggle': [box({ left: 600 }), box({ left: 592 })] });
  await assert.rejects(
    assertViewLabLayout(toggleShifted, ROWS, 'toggle'),
    /.toggle must share one left edge/
  );
});

test('rejects a name field under its minimum', async () => {
  const squeezed = rowsFrame({ '.name': [box({ width: 139 })] });
  await assert.rejects(
    assertViewLabLayout(squeezed, ROWS, 'squeezed'),
    /.name is 139px wide, under its 140px minimum/
  );
});

test('accepts a label whose text fits its box, and rejects one cut to an ellipsis', async () => {
  const label = (scrollWidth, clientWidth) => ({ scrollWidth, clientWidth });
  const UNCLIPPED = { containerSelector: '.rows', unclipped: '.kind' };
  const fits = rowsFrame({ '.kind': [label(104, 104), label(60, 104)] });
  await assert.doesNotReject(assertViewLabLayout(fits, UNCLIPPED, 'fits'));
  const cut = rowsFrame({ '.kind': [label(60, 104), label(118, 104)] });
  await assert.rejects(
    assertViewLabLayout(cut, UNCLIPPED, 'cut'),
    /.kind #2 is clipped by 14px of its text/
  );
  await assert.rejects(
    assertViewLabLayout(rowsFrame({ '.kind': [] }), UNCLIPPED, 'none'),
    /".kind" matched 0, fewer than the 1 it measures/
  );
});

test('rejects a geometry selector too thin to measure anything', async () => {
  await assert.rejects(
    assertViewLabLayout(rowsFrame({ '.remove': [box({ left: 770 })] }), ROWS, 'one'),
    /".remove" matched 1, fewer than the 2 it measures/
  );
  await assert.rejects(
    assertViewLabLayout(rowsFrame({ '.row': [] }), ROWS, 'none'),
    /".row" matched 0, fewer than the 1 it measures/
  );
});

// A wrapped row's lines: each line's boxes share its first box's band, each below the line before.
const wrappedRow = (boxes) => ({ querySelector: (selector) => boxes[selector] ?? null });
const WRAPPED = Object.freeze({
  containerSelector: '.rows',
  wrappedRows: {
    rows: '.row',
    lines: [
      ['.kind', '.remove'],
      ['.toggle', '.amount'],
    ],
  },
});
const twoLines = (overrides = {}) =>
  wrappedRow({
    '.kind': box({ top: 0 }),
    '.remove': box({ top: 4, height: 22 }),
    '.toggle': box({ top: 38 }),
    '.amount': box({ top: 39, height: 28 }),
    ...overrides,
  });
const wrappedFrame = (rows) => frame({ '.rows': element({ width: 400 }), '.row': rows });

test('accepts rows whose named controls sit on their stated lines', async () => {
  await assert.doesNotReject(
    assertViewLabLayout(wrappedFrame([twoLines(), twoLines()]), WRAPPED, 'wrapped')
  );
});

test('rejects a wrapped row whose second line rides up onto the first', async () => {
  const oneLine = twoLines({ '.toggle': box({ top: 0 }), '.amount': box({ top: 1, height: 28 }) });
  await assert.rejects(
    assertViewLabLayout(wrappedFrame([twoLines(), oneLine]), WRAPPED, 'one-line'),
    /.row #2: line 2 starts at 0px, above line 1's 30px end/
  );
});

test('rejects a control off its stated line, and a row missing one', async () => {
  const dropped = twoLines({ '.remove': box({ top: 38 }) });
  await assert.rejects(
    assertViewLabLayout(wrappedFrame([dropped]), WRAPPED, 'dropped'),
    /.row #1: .remove is off line 1/
  );
  const missing = twoLines({ '.amount': undefined });
  await assert.rejects(
    assertViewLabLayout(wrappedFrame([missing]), WRAPPED, 'missing'),
    /.row #1 has no visible .amount/
  );
});

test('rejects one-line and wrapped row geometry declared without a container', async () => {
  for (const [layout, page] of [
    [ROWS, rowsFrame()],
    [WRAPPED, wrappedFrame([twoLines()])],
  ]) {
    const { containerSelector: _container, ...uncontained } = layout;
    await assert.rejects(
      assertViewLabLayout(page, uncontained, 'uncontained'),
      /uncontained: a layout expectation needs a containerSelector/
    );
  }
});

// A control's computed style, each declared value resolved in the control's own context (issue
// 1521). The fake browser parses only `PARSED` properties, resolves a value through `RESOLVED`,
// computes an unresolved `var()` to its initial transparent, and reads anything undeclared as ''.
const PARSED = new Set(['min-height', 'font-size', 'background-color']);
const RESOLVED = { '0.72rem': '11.52px', 'var(--fab-success)': 'rgb(80, 160, 90)' };
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const ON_RUNG = Object.freeze({
  '--fab-success': 'rgb(80, 160, 90)',
  'min-height': '34px',
  'font-size': '11.52px',
  'background-color': 'rgb(80, 160, 90)',
});

function verbControl(measured, probes = []) {
  const styleOf = (lookup) => ({ getPropertyValue: (property) => lookup(property) ?? '' });
  const resolveValue = (value) =>
    RESOLVED[value] ?? (value?.startsWith('var(') ? TRANSPARENT : value);
  return {
    ownerDocument: {
      createElement: () => {
        const declared = {};
        const probe = {
          style: {
            setProperty: (property, value) => {
              if (PARSED.has(property)) declared[property] = value;
            },
            getPropertyValue: (property) => declared[property] ?? '',
          },
          remove: () => (probe.removed = true),
          computedStyle: styleOf((property) => resolveValue(declared[property])),
        };
        probes.push(probe);
        return probe;
      },
    },
    append: () => {},
    computedStyle: styleOf((property) => measured[property]),
  };
}

function controlFrame(measured, { probes = [], queried = [] } = {}) {
  return frame({ '[data-verb]': verbControl(measured, probes) }, queried);
}

const verbStyled = (styles) => ({ controls: [{ selector: '[data-verb]', styles }] });
const PRIMARY_VERB = verbStyled(
  'min-height: 34px; font-size: 0.72rem; background-color: var(--fab-success);'
);

test('accepts a control whose computed styles resolve to the declared values', async () => {
  const probes = [];
  await assert.doesNotReject(
    assertViewLabLayout(controlFrame(ON_RUNG, { probes }), PRIMARY_VERB, 'verb')
  );
  assert.ok(probes.length === 1 && probes[0].removed, 'the probe is removed before the capture');
});

test('rejects a control whose computed style differs, naming each property', async () => {
  const measured = { ...ON_RUNG, 'min-height': '36px', 'background-color': 'rgb(200, 120, 90)' };
  await assert.rejects(
    assertViewLabLayout(controlFrame(measured), PRIMARY_VERB, 'accent-primary'),
    /min-height is 36px, not 34px \(34px\); background-color is rgb\(200, 120, 90\), not var\(--fab-success\)/
  );
});

test('checks controls without a grid when the case declares none', async () => {
  const queried = [];
  await assertViewLabLayout(controlFrame(ON_RUNG, { queried }), PRIMARY_VERB, 'controls-only');
  assert.deepEqual(queried, ['[data-verb]']);
});

test('rejects a declaration the browser does not parse, not comparing two blanks', async () => {
  await assert.rejects(
    assertViewLabLayout(controlFrame(ON_RUNG), verbStyled('min-heigth: 34px'), 'misspelt'),
    /misspelt: \[data-verb\] min-heigth: 34px does not parse/
  );
});

test('rejects a var() naming an unset custom property, not comparing two initials', async () => {
  const transparent = { ...ON_RUNG, 'background-color': TRANSPARENT };
  await assert.rejects(
    assertViewLabLayout(
      controlFrame(transparent),
      verbStyled('background-color: var(--fab-sucess)'),
      'misnamed'
    ),
    /misnamed: \[data-verb\] --fab-sucess is unset/
  );
});

test('rejects a control that declares no styles to measure', async () => {
  for (const styles of [undefined, '', ' ; ']) {
    await assert.rejects(
      assertViewLabLayout(controlFrame(ON_RUNG), verbStyled(styles), 'unstyled'),
      /unstyled: control \[data-verb\] declares no styles to measure/
    );
  }
});

test('rejects a control selector that matches nothing', async () => {
  await assert.rejects(
    assertViewLabLayout(frame({}), PRIMARY_VERB, 'absent'),
    /absent: control selector "\[data-verb\]" was not found/
  );
});

test('rejects a control selector that matches more than one element', async () => {
  const twice = frame({ '[data-verb]': [verbControl(ON_RUNG), verbControl(ON_RUNG)] });
  await assert.rejects(
    assertViewLabLayout(twice, PRIMARY_VERB, 'twice'),
    /twice: control selector "\[data-verb\]" matched 2 elements/
  );
});
