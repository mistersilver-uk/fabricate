/** The View Lab's containment (issue 1544) and centre-hit (issue 2304) claims, run on a fake page. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertCentreHit, assertContained } from '../scripts/lib/viewLabClaims.js';

/** An element whose bounding rect is `left, top, width, height`, containing `children`. */
function element(left, top, width, height, children = []) {
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
    contains: (other) => other === node || children.includes(other),
  };
  return node;
}

/**
 * A page whose `evaluate` runs its callback against a document of `elements` by selector, where
 * `elementFromPoint` answers `hit` and records each point it was asked about in `probes`.
 */
function fakePage(elements, { hit = null } = {}) {
  const page = { evaluations: 0, probes: [] };
  const elementFromPoint = (x, y) => {
    page.probes.push([x, y]);
    return hit;
  };
  page.evaluate = async (callback, argument) => {
    page.evaluations += 1;
    const previous = globalThis.document;
    Object.assign(globalThis, {
      document: { querySelector: (selector) => elements[selector] ?? null, elementFromPoint },
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

const BUTTON = '.toggle';

/** A page whose one element, at `width` x `height`, is the hit target at any point when `owns`. */
function centrePage(width, height, { owns = true } = {}) {
  const button = element(100, 40, width, height);
  return fakePage({ [BUTTON]: button }, { hit: owns ? button : element(0, 0, 1920, 1080) });
}

test('a target that owns the hit at its centre passes, and the centre is the point probed', async () => {
  const page = centrePage(40, 20);
  await assert.doesNotReject(assertCentreHit(page, BUTTON, 'centre'));
  assert.deepEqual(page.probes, [[120, 50]]);
});

test('a hit on a descendant of the target counts as the target owning it', async () => {
  const label = element(110, 45, 20, 10);
  const button = element(100, 40, 40, 20, [label]);
  await assert.doesNotReject(
    assertCentreHit(fakePage({ [BUTTON]: button }, { hit: label }), BUTTON, 'child')
  );
});

test('a missing target is named as missing before anything is measured', async () => {
  const page = fakePage({});
  await assert.rejects(
    assertCentreHit(page, BUTTON, 'absent'),
    /^Error: absent: \.toggle was not found, so it owns no pointer target\.$/
  );
  assert.deepEqual(page.probes, [], 'no point is probed for an element that does not exist');
});

test('a target covered at its centre does not own its pointer target', async () => {
  await assert.rejects(
    assertCentreHit(centrePage(40, 20, { owns: false }), BUTTON, 'covered'),
    /^Error: covered: \.toggle does not own its centre pointer target\.$/
  );
});

test('a target under 1px on either axis has collapsed, even when it owns its centre', async () => {
  for (const [name, width, height] of [
    ['zero-wide', 0, 20],
    ['zero-high', 40, 0],
    ['sub-pixel', 0.99, 20],
  ]) {
    await assert.rejects(
      assertCentreHit(centrePage(width, height), BUTTON, name),
      new RegExp(
        String.raw`^Error: ${name}: \.toggle has collapsed to ${width}x${height}, so its centre pointer target proves nothing\.$`
      )
    );
  }
  await assert.doesNotReject(assertCentreHit(centrePage(1, 1), BUTTON, 'one-pixel'));
});

test('half a pixel passes containment and fails the centre hit', async () => {
  const thin = element(110, 45, 0.5, 10);
  const page = fakePage({ '.panel': PANEL, '.badge': thin, [BUTTON]: thin }, { hit: thin });
  await assert.doesNotReject(assertContained(page, CLAIM, 'thin'));
  await assert.rejects(assertCentreHit(page, BUTTON, 'thin'), /has collapsed to 0\.5x10/);
});
