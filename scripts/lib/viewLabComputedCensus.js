/**
 * The computed census every View Lab frame passes before its screenshot (issue 1523): a painted
 * control or art tile at a ladder height draws its band's corner, and no mono text computes above
 * 500. It reads what the browser resolved, so an inherited weight or a host rule is judged too.
 */
import { bandCorner } from './radiusLadder.js';

/** The controls and art tiles judged; rows, wells, chips, cards and panels take corners by kind. */
const JUDGED_BOXES =
  'button, input, select, textarea, [role="button"], [role="tab"], [role="radio"], ' +
  '[role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], .fab-medallion, ' +
  '.fab-avatar';

/** Foundry's own window chrome, and the mount points a companion draws its own DOM into. */
const SKIPPED_SUBTREES = '.window-header, .player-extension-target, .downtime-extension-target';

/** The ladder heights judged, the retired 32 and 36 included; 40 has no band (`radiusLadder.js`). */
const JUDGED_HEIGHTS = new Set([22, 24, 26, 28, 30, 32, 34, 36, 38, 44]);

/**
 * The boxes a ruling rounds off their band: the selector the box itself matches, the heights it
 * draws (one rung, or a wrapped row's two-line heights) and its corner there, and the reason its
 * site marker states (`design-system-exempt-allowlist`).
 */
export const RULED_KINDS = Object.freeze([
  Object.freeze({
    selector: '.fab-avatar',
    heights: [32],
    corner: 9,
    reason: "an actor portrait, the portrait ladder's 32 single mark, not a control",
  }),
  Object.freeze({
    selector: '.fabricate-search.is-compact input',
    heights: [34],
    corner: 6,
    reason:
      "the compact search's ruled box, 34 at radius 6, the geometry requirement's named " +
      'exception rather than a rung',
  }),
  Object.freeze({
    selector: '.fab-stepper-adjunct',
    heights: [24],
    corner: 7,
    reason:
      "the 22px button's 6px corner outset by the 1px hit-area padding, so the content-box " +
      'background still draws 6; retires if the adjunct moves to the ::before form or a hit-area ' +
      'token lands',
  }),
  Object.freeze({
    selector: '.manager-nav-subitem',
    heights: [34, 36, 38],
    corner: 7,
    reason: "a nav row keeps its 30px rung's corner when a long label wraps it taller",
  }),
]);

/** Why a painted box is off its band, or `null`; a square, round or pill corner passes. */
export function cornerVerdict({ height, radius, kinds = [] }) {
  if (!JUDGED_HEIGHTS.has(height) || radius === 0 || radius * 2 >= height) return null;
  const band = bandCorner(height);
  if (radius === band) return null;
  const ruled = RULED_KINDS.some(
    (kind) =>
      kinds.includes(kind.selector) && kind.heights.includes(height) && kind.corner === radius
  );
  return ruled ? null : `${height}px tall at radius ${radius}, where its band draws ${band}`;
}

/** Why a mono text run is off the ramp's mono ceiling, or `null`. */
export function monoVerdict({ weight }) {
  return weight > 500 ? `mono at weight ${weight}, above the face's 500` : null;
}

/**
 * Runs in the page over every element of the frame outside `skipped`: each painted `judged` box
 * with four equal corners, with the `ruled` selectors it matches, and each element holding its
 * own text in the mono face it resolves. Self-contained, because Playwright serialises it.
 */
export function collectFrameCensus({ frameSelector, judged, skipped, ruled }) {
  const view = globalThis;
  const root = view.document.querySelector(frameSelector);
  const census = { found: Boolean(root), monoResolved: false, boxes: [], texts: [] };
  const firstFamily = (family) =>
    String(family ?? '')
      .split(',', 1)[0]
      .replaceAll(/["']/g, '')
      .trim()
      .toLowerCase();
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  const clear = (colour) => colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)';
  const painted = (style) =>
    !clear(style.backgroundColor) ||
    style.backgroundImage !== 'none' ||
    style.boxShadow !== 'none' ||
    sides.every(
      (side) =>
        Number.parseFloat(style[`border${side}Width`]) > 0 &&
        style[`border${side}Style`] !== 'none' &&
        !clear(style[`border${side}Color`])
    );
  const cornerOf = (style) => {
    const corners = new Set(
      ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(
        (corner) => style[`border${corner}Radius`]
      )
    );
    const [corner] = corners;
    return corners.size === 1 && /^[\d.]+px$/.test(corner) ? Number.parseFloat(corner) : null;
  };
  const label = (element) =>
    [
      element.tagName.toLowerCase(),
      ...[...element.classList].filter((name) => !name.startsWith('svelte-')),
    ]
      .slice(0, 4)
      .join('.');
  const nameOf = (element) =>
    `${element.parentElement ? `${label(element.parentElement)} > ` : ''}${label(element)}`;
  const ownsText = (element) =>
    [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== '');
  for (const element of root ? root.querySelectorAll('*') : []) {
    if (element.closest(skipped)) continue;
    const style = view.getComputedStyle(element);
    const mono = firstFamily(style.getPropertyValue('--fab-font-mono'));
    census.monoResolved ||= mono !== '';
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility !== 'visible' || rect.width < 1) continue;
    if (mono !== '' && ownsText(element) && firstFamily(style.fontFamily) === mono) {
      census.texts.push({ element: nameOf(element), weight: Number(style.fontWeight) });
    }
    const radius = element.matches(judged) && painted(style) ? cornerOf(style) : null;
    if (radius === null || rect.height < 1) continue;
    census.boxes.push({
      element: nameOf(element),
      kinds: ruled.filter((selector) => element.matches(selector)),
      height: Math.round(rect.height),
      radius: Math.round(radius),
    });
  }
  return census;
}

/** The census findings of one collected frame, each a line naming the element and the rule. */
export function censusFindings({ boxes = [], texts = [] }) {
  const findings = [];
  for (const box of boxes) {
    const why = cornerVerdict(box);
    if (why) findings.push(`${box.element}: ${why}`);
  }
  for (const text of texts) {
    const why = monoVerdict(text);
    if (why) findings.push(`${text.element}: ${why}`);
  }
  return [...new Set(findings)];
}

/**
 * Collect and judge one frame, throwing with every finding when any box or text is off, and when
 * the frame or its mono token is missing, since either would make a clean census vacuous.
 */
export async function assertComputedCensus(page, appId, label) {
  const frameSelector = `[data-view-lab-frame="${appId}"]`;
  const census = await page.evaluate(collectFrameCensus, {
    frameSelector,
    judged: JUDGED_BOXES,
    skipped: SKIPPED_SUBTREES,
    ruled: RULED_KINDS.map(({ selector }) => selector),
  });
  if (!census.found) throw new Error(`${label}: the computed census found no ${frameSelector}.`);
  if (!census.monoResolved) {
    throw new Error(
      `${label}: --fab-font-mono resolved on no element, so no mono text was judged.`
    );
  }
  const findings = censusFindings(census);
  if (findings.length > 0) {
    throw new Error(
      `${label}: the computed census found ${findings.length} off the ladders ` +
        `(design-system spec, "Geometry comes from the published ladders"):\n  ` +
        findings.join('\n  ')
    );
  }
}
