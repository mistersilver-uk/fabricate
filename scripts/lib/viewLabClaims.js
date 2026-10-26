/**
 * The View Lab's `expectContained` and `expectCenterHit` claims. Each element is measured in the
 * page and judged here, and every way a claim fails has its own message.
 */

/** A target contained in its container has a positive size and lies inside it on every edge. */
function judgeContainment({ outer, inner }) {
  if (!outer) return { ok: false, reason: 'container-missing' };
  if (!inner) return { ok: false, reason: 'target-missing' };
  const contained =
    inner.width > 0 &&
    inner.height > 0 &&
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom;
  return contained ? { ok: true } : { ok: false, reason: 'clipped', outer, inner };
}

const describeRect = ({ left, top, width, height }) => `${width}x${height} at (${left}, ${top})`;

const CONTAINMENT_MESSAGES = {
  'container-missing': ({ container, target }) =>
    `container ${container} was not found, so ${target} could not be measured inside it.`,
  'target-missing': ({ container, target }) =>
    `${target} was not found, so it cannot be contained by ${container}.`,
  clipped: ({ container, target }, { outer, inner }) =>
    `${target} is clipped or extends outside ${container}: ` +
    `${target} is ${describeRect(inner)}, ${container} is ${describeRect(outer)}.`,
};

/** Throw unless `expectation.target` lies inside `expectation.container`. */
export async function assertContained(page, expectation, label) {
  const measured = await page.evaluate(
    ({ container, target }) => {
      const rectOf = (selector) => {
        const element = globalThis.document.querySelector(selector);
        if (!element) return null;
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      return { outer: rectOf(container), inner: rectOf(target) };
    },
    { container: expectation.container, target: expectation.target }
  );
  const verdict = judgeContainment(measured);
  if (verdict.ok) return;
  throw new Error(`${label}: ${CONTAINMENT_MESSAGES[verdict.reason](expectation, verdict)}`);
}

/**
 * A target owns its centre hit only when it is at least 1px on both axes: a collapsed box whose
 * overflowing content still owns its centre point proves nothing about where a pointer lands.
 */
function judgeCentreHit({ found, box, owns }) {
  if (!found) return { ok: false, reason: 'target-missing' };
  if (box.width < 1 || box.height < 1) return { ok: false, reason: 'collapsed', box };
  if (!owns) return { ok: false, reason: 'not-owned', box };
  return { ok: true };
}

const CENTRE_HIT_MESSAGES = {
  'target-missing': (selector) => `${selector} was not found, so it owns no pointer target.`,
  collapsed: (selector, { box }) =>
    `${selector} has collapsed to ${box.width}x${box.height}, so its centre pointer target proves nothing.`,
  'not-owned': (selector) => `${selector} does not own its centre pointer target.`,
};

/** Throw unless the element `selector` names owns the pointer target at its own centre. */
export async function assertCentreHit(page, selector, label) {
  const measured = await page.evaluate((query) => {
    const element = globalThis.document.querySelector(query);
    if (!element) return { found: false, box: null, owns: false };
    const { left, top, width, height } = element.getBoundingClientRect();
    const target = globalThis.document.elementFromPoint(left + width / 2, top + height / 2);
    return {
      found: true,
      box: { left, top, width, height },
      owns: target === element || element.contains(target),
    };
  }, selector);
  const verdict = judgeCentreHit(measured);
  if (verdict.ok) return;
  throw new Error(`${label}: ${CENTRE_HIT_MESSAGES[verdict.reason](selector, verdict)}`);
}
