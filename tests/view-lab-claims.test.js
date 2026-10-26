/** The View Lab's containment claim (issue 1544), measured on a fake page and judged for real. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertContained } from '../scripts/lib/viewLabClaims.js';

/** An element whose bounding rect is `left, top, width, height`. */
function element(left, top, width, height) {
  const node = {
    getBoundingClientRect: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }),
    contains: (other) => other === node,
  };
  return node;
}

/** A page whose `evaluate` runs its callback against a document of `elements` by selector. */
function fakePage(elements) {
  const page = { evaluations: 0 };
  page.evaluate = async (callback, argument) => {
    page.evaluations += 1;
    const previous = globalThis.document;
    Object.assign(globalThis, {
      document: { querySelector: (selector) => elements[selector] ?? null },
    });
    try {
      return callback(argument);
    } finally {
      Object.assign(globalThis, { document: previous });
    }
  };
  return page;
}

const CLAIM = { container: '.panel', target: '.badge' };
const PANEL = element(0, 0, 200, 100);

test('a target inside its container passes, including one flush with every edge', async () => {
  await assert.doesNotReject(
    assertContained(fakePage({ '.panel': PANEL, '.badge': element(10, 10, 50, 20) }), CLAIM, 'in')
  );
  await assert.doesNotReject(
    assertContained(
      fakePage({ '.panel': PANEL, '.badge': element(0, 0, 200, 100) }),
      CLAIM,
      'flush'
    )
  );
});

test('a missing container is named as missing, and wins when the target is missing too', async () => {
  const expected =
    /^Error: gone: container \.panel was not found, so \.badge could not be measured/;
  await assert.rejects(
    assertContained(fakePage({ '.badge': element(0, 0, 10, 10) }), CLAIM, 'gone'),
    expected
  );
  await assert.rejects(assertContained(fakePage({}), CLAIM, 'gone'), expected);
});

test('a missing target is named as missing, not as clipped', async () => {
  await assert.rejects(
    assertContained(fakePage({ '.panel': PANEL }), CLAIM, 'absent'),
    /^Error: absent: \.badge was not found, so it cannot be contained by \.panel\.$/
  );
});

test('a clipped target names the selector and both measured rects', async () => {
  const page = fakePage({ '.panel': PANEL, '.badge': element(180, 90, 40, 20) });
  await assert.rejects(
    assertContained(page, CLAIM, 'clipped'),
    /^Error: clipped: \.badge is clipped or extends outside \.panel: \.badge is 40x20 at \(180, 90\), \.panel is 200x100 at \(0, 0\)\.$/
  );
  assert.equal(page.evaluations, 1, 'both elements are measured in one page round trip');
});

test('each edge is checked on its own', async () => {
  for (const [name, badge] of [
    ['left', element(-1, 10, 10, 10)],
    ['top', element(10, -1, 10, 10)],
    ['right', element(191, 10, 10, 10)],
    ['bottom', element(10, 91, 10, 10)],
  ]) {
    await assert.rejects(
      assertContained(fakePage({ '.panel': PANEL, '.badge': badge }), CLAIM, name),
      new RegExp(String.raw`^Error: ${name}: \.badge is clipped`)
    );
  }
});

test('a zero-size container contains no target that has a size', async () => {
  await assert.rejects(
    assertContained(
      fakePage({ '.panel': element(0, 0, 0, 0), '.badge': element(0, 0, 10, 10) }),
      CLAIM,
      'empty-panel'
    ),
    /empty-panel: \.badge is clipped .* \.panel is 0x0 at \(0, 0\)/
  );
});

test('a zero-width or zero-height target is clipped, while any positive size is contained', async () => {
  for (const [name, badge] of [
    ['zero-wide', element(10, 10, 0, 10)],
    ['zero-high', element(10, 10, 10, 0)],
  ]) {
    await assert.rejects(
      assertContained(fakePage({ '.panel': PANEL, '.badge': badge }), CLAIM, name),
      new RegExp(String.raw`^Error: ${name}: \.badge is clipped`)
    );
  }
  // Containment asks for a size above zero; it is not a hit-target claim, so half a pixel passes.
  await assert.doesNotReject(
    assertContained(
      fakePage({ '.panel': PANEL, '.badge': element(10, 10, 0.5, 10) }),
      CLAIM,
      'thin'
    )
  );
});
