/**
 * The View Lab's `expectContained` claim: each element is measured in the page and judged here, and
 * a missing container, a missing target and a clipped target each fail with their own message.
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
