/**
 * The computed census every View Lab frame passes before its screenshot (issue 1523): a painted
 * control or art tile at a ladder height draws its band's corner, and no mono text computes above
 * 500. It reads what the browser resolved, so an inherited weight or a host rule is judged too.
 */

/** The controls and art tiles judged; rows, wells, chips, cards and panels take corners by kind. */
const JUDGED_BOXES =
  'button, input, select, textarea, [role="button"], [role="tab"], [role="radio"], ' +
  '[role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], .fab-medallion, ' +
  '.fab-avatar';

/** The mount points a companion draws its own DOM into, which Fabricate does not style. */
const COMPANION_TARGETS = '.player-extension-target, .downtime-extension-target';

/** The heights judged: the control and art ladders, the chip's 24 and the retired 32, 36, 40. */
const JUDGED_HEIGHTS = new Set([22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 44]);

/**
 * Controls a ruling or a site marker rounds off their height band: the classes the control or its
 * host carries, all of which must match, the corner it draws, and why.
 */
const RULED_KINDS = Object.freeze([
  [['fabricate-search', 'is-compact'], 6, "the compact search's ruled box"],
  [['fab-stepper-adjunct'], 7, "the 22px adjunct's 6 outset by its 1px hit-area padding"],
  [['manager-environment-mode-option'], 6, "its mode control's inner rung, issue 2257's"],
  [['manager-nav-subitem'], 7, "a nav row keeps its rung's corner when a long label wraps it"],
]);

/** The ladder's corner for a box `height` px tall (`design-system/spec.md`, "Geometry"). */
export function bandCorner(height) {
  if (height <= 24) return 6;
  if (height <= 32) return 7;
  if (height <= 40) return 9;
  return 11;
}

/**
 * Why a painted box is off its band, or `null`. A square, round or pill corner passes, and so do
 * a row or well at 9 and a panel or card at 11 from the 34px band up, which the spec rounds by
 * kind rather than by height; the 32px portrait takes 9.
 */
export function cornerVerdict({ height, radius, classes = [] }) {
  if (!JUDGED_HEIGHTS.has(height) || radius === 0 || radius * 2 >= height) return null;
  const ruled = RULED_KINDS.some(
    ([kind, corner]) => corner === radius && kind.every((name) => classes.includes(name))
  );
  if (ruled) return null;
  const band = bandCorner(height);
  if (radius === band) return null;
  if (height >= 34 && (radius === 9 || radius === 11)) return null;
  if (height === 32 && radius === 9) return null;
  return `${height}px tall at radius ${radius}, where its band draws ${band}`;
}

/** Why a mono text run is off the ramp's mono ceiling, or `null`. */
export function monoVerdict({ weight }) {
  return weight > 500 ? `mono at weight ${weight}, above the face's 500` : null;
}

/**
 * Runs in the page: every painted `judged` box with four equal corners and every element holding
 * its own mono text, in the frame's window content outside `companions`. Self-contained, because
 * Playwright serialises it.
 */
export function collectFrameCensus({ frameSelector, judged, companions }) {
  const view = globalThis;
  const firstFamily = (family) =>
    String(family).split(',', 1)[0].replaceAll(/["']/g, '').trim().toLowerCase();
  const root = view.document.querySelector(frameSelector);
  const content = root?.querySelector('.window-content') ?? root;
  const mono = firstFamily(
    view.getComputedStyle(view.document.documentElement).getPropertyValue('--fab-font-mono')
  );
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
  const classesOf = (element) =>
    [...(element?.classList ?? [])].filter((name) => !name.startsWith('svelte-'));
  const label = (element) =>
    [element.tagName.toLowerCase(), ...classesOf(element)].slice(0, 4).join('.');
  const ownsText = (element) =>
    [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== '');
  const boxes = [];
  const texts = [];
  for (const element of content ? content.querySelectorAll('*') : []) {
    if (element.closest(companions)) continue;
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility !== 'visible' || rect.width < 1) continue;
    const host = element.parentElement;
    const name = `${host ? `${label(host)} > ` : ''}${label(element)}`;
    if (ownsText(element) && firstFamily(style.fontFamily) === mono) {
      texts.push({ element: name, weight: Number(style.fontWeight) });
    }
    const radius = element.matches(judged) && painted(style) ? cornerOf(style) : null;
    if (radius === null || rect.height < 1) continue;
    boxes.push({
      element: name,
      classes: [...classesOf(element), ...classesOf(host)],
      height: Math.round(rect.height),
      radius: Math.round(radius),
    });
  }
  return { boxes, texts };
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

/** Collect and judge one frame, throwing with every finding when any box or text is off. */
export async function assertComputedCensus(page, appId, label) {
  const census = await page.evaluate(collectFrameCensus, {
    frameSelector: `[data-view-lab-frame="${appId}"]`,
    judged: JUDGED_BOXES,
    companions: COMPANION_TARGETS,
  });
  const findings = censusFindings(census);
  if (findings.length > 0) {
    throw new Error(
      `${label}: the computed census found ${findings.length} off the ladders ` +
        `(design-system spec, "Geometry comes from the published ladders"):\n  ` +
        findings.join('\n  ')
    );
  }
}
