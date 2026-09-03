/**
 * Everything the Primitive Lab parity oracle can decide WITHOUT a browser.
 *
 * `unicorn/no-exports-in-scripts` forbids a `scripts/` CLI from also being a module (the same rule
 * `scripts/lib/primitiveLabSmoke.js` records at length beside `scripts/primitive-lab-smoke.mjs`),
 * so this is the pure half of the parity oracle and `scripts/primitive-lab-parity.mjs` is the
 * shell that owns the browser, the two page loads and the process exit code.
 *
 * ── WHAT THE ORACLE PROVES ────────────────────────────────────────────────────────────────────
 *
 * `openspec/specs/design-system/library.html` opened directly (`file://`) is the REFERENCE: no
 * Foundry stylesheet, no Fabricate stylesheet, nothing but the library's own `<style>` blocks. The
 * Primitive Lab (`tests/view-lab/primitives.html`) renders the SAME markup with a subset of the
 * library's hand-drawn specimens replaced by isolated `<iframe>`s carrying real components (issue
 * 1487). Every element the lab did NOT replace must compute EXACTLY the same style the reference
 * does — that is the whole regression this oracle exists to catch: `foundry2.css`, loaded
 * page-wide, used to repaint those elements even though the reference never loads it at all.
 *
 * `diffSnapshots` compares two walks of the same `main` subtree, keyed by POSITION (tag name plus
 * child index at every level) rather than by any hand-authored id, because the library has none —
 * the position IS the address a reader would use to find the element in either document. A live
 * specimen's `.unit` is excluded from both sides before comparison ever runs (see
 * `scripts/primitive-lab-parity.mjs`'s in-page collector): its subtree is SUPPOSED to differ, and
 * comparing it would either report expected drift as a regression or (worse) hide a real one
 * behind the noise.
 *
 * THAT EXCLUSION IS ALSO A BLIND SPOT, and a first version of this oracle scored a perfect 0 style
 * differences while every one of the 76 live specimens rendered as a clipped, opaque black bar —
 * because every one of them sat inside a `.unit` the walk above deliberately skips.
 * {@link evaluateSpecimen} closes it with two rules of its own, self-contained rather than
 * reference-relative: an `<iframe>` must not be smaller than the component mounted inside it (that
 * is clipping), and a specimen document must not paint an opaque backdrop over the library's own
 * surface the drawing it replaced showed through to.
 */

/**
 * The computed style properties this oracle compares.
 *
 * Chosen to cover paint (`color`, `backgroundColor`, borders, `borderRadius`), type
 * (`fontSize`/`fontWeight`/`fontFamily`/`fontStyle`/`lineHeight`/`letterSpacing`/`textTransform`),
 * box (`paddingTop`/`paddingLeft`/`marginTop`/`marginBottom`), and the two properties a stray
 * `@layer reset` or a repainted `display: contents` chain is most likely to disturb
 * (`display`/`textAlign`/`opacity`) — the union of everything `foundry2.css` was measured to move
 * on the 948 elements this oracle exists to protect.
 *
 * @type {readonly string[]}
 */
export const PARITY_PROPERTIES = Object.freeze([
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'borderTopWidth',
  'borderTopStyle',
  'borderTopColor',
  'borderBottomWidth',
  'borderBottomColor',
  'borderRadius',
  'paddingTop',
  'paddingLeft',
  'marginTop',
  'marginBottom',
  'display',
  'textAlign',
  'opacity',
]);

/**
 * Normalise one computed-style value so an artefact of how the string is SPELLED does not read as
 * a difference in what is PAINTED.
 *
 * `fontFamily` is normalised to its first family only. The library declares `--fab-font-mono` in
 * its own `:root` and the lab's specimens read it from `styles/fabricate.css`; the two fallback
 * chains are different lengths for the same rendered face, and comparing the whole chain produced
 * 1,548 spurious diffs before this normalisation existed. Every other property is compared with
 * whitespace collapsed only, so `"1px solid rgb(0, 0, 0)"` and a re-serialised equivalent with
 * different spacing still agree.
 *
 * @param {string} property A computed style property name.
 * @param {string} value Its computed value.
 * @returns {string} A comparable form.
 */
export function normalizeStyleValue(property, value) {
  const text = String(value ?? '');
  if (property === 'fontFamily') {
    return text.split(',', 1)[0].replaceAll(/["']/g, '').trim().toLowerCase();
  }
  return text.replaceAll(/\s+/g, '');
}

/**
 * Compare a lab walk against a reference walk, keyed by position.
 *
 * @param {object} options Options.
 * @param {{key: string, cls: string, style: Record<string, string>}[]} options.reference The
 *   reference document's walk.
 * @param {{key: string, cls: string, style: Record<string, string>}[]} options.lab The lab's walk.
 * @param {readonly string[]} [options.properties] Properties to compare. Defaults to
 *   {@link PARITY_PROPERTIES}.
 * @returns {{compared: number, diffs: object[], missing: object[]}} `compared` counts lab elements
 *   that found a reference match; `diffs` is one entry per (element, property) disagreement;
 *   `missing` is every lab element whose position key matched nothing in the reference — a
 *   structural difference the property comparison cannot express.
 */
export function diffSnapshots({ reference, lab, properties = PARITY_PROPERTIES }) {
  const referenceByKey = new Map();
  for (const entry of reference) {
    if (!referenceByKey.has(entry.key)) referenceByKey.set(entry.key, entry);
  }

  let compared = 0;
  const diffs = [];
  const missing = [];
  for (const entry of lab) {
    const match = referenceByKey.get(entry.key);
    if (!match) {
      missing.push(entry);
      continue;
    }
    compared += 1;
    for (const property of properties) {
      const referenceValue = normalizeStyleValue(property, match.style[property]);
      const labValue = normalizeStyleValue(property, entry.style[property]);
      if (referenceValue !== labValue) {
        diffs.push({
          key: entry.key,
          cls: entry.cls,
          property,
          reference: match.style[property],
          lab: entry.style[property],
        });
      }
    }
  }
  return { compared, diffs, missing };
}

/**
 * Tally diffs by property, most-frequent first.
 *
 * @param {{property: string}[]} diffs {@link diffSnapshots}'s `diffs`.
 * @returns {[string, number][]} `[property, count]` pairs, descending by count.
 */
export function tallyByProperty(diffs) {
  const counts = new Map();
  for (const diff of diffs) counts.set(diff.property, (counts.get(diff.property) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1]);
}

/**
 * Render the oracle's console report.
 *
 * @param {object} options Options.
 * @param {number} options.referenceCount Elements walked in the reference document.
 * @param {number} options.compared Lab elements that found a reference match.
 * @param {number} options.missingCount Lab elements with no reference match at all.
 * @param {object[]} options.diffs {@link diffSnapshots}'s `diffs`.
 * @param {{count: number, problems: string[]}} options.specimens {@link evaluateSpecimens}'s
 *   result.
 * @param {number} [options.sample] How many individual diffs/problems to print. Defaults to 30.
 * @returns {string} The full report, newline-joined.
 */
export function formatParityReport({
  referenceCount,
  compared,
  missingCount,
  diffs,
  specimens,
  sample = 30,
}) {
  const lines = [
    `reference elements: ${referenceCount}`,
    `lab elements compared: ${compared}   (unmatched keys: ${missingCount})`,
    `style differences: ${diffs.length}`,
    '',
  ];
  if (diffs.length > 0) {
    lines.push('by property:');
    for (const [property, count] of tallyByProperty(diffs)) lines.push(`   ${property}: ${count}`);
    lines.push('', `first ${Math.min(sample, diffs.length)}:`);
    for (const diff of diffs.slice(0, sample)) {
      lines.push(
        `   ${diff.property}  [${diff.cls || diff.key.split('>').slice(-3).join('>')}]`,
        `        reference: ${diff.reference}`,
        `        lab: ${diff.lab}`
      );
    }
  }

  lines.push(
    '',
    `specimens: ${specimens.count} iframe(s), ${specimens.problems.length} problem(s)`
  );
  for (const problem of specimens.problems.slice(0, sample)) lines.push(`   ${problem}`);
  if (specimens.problems.length > sample) {
    lines.push(`   … and ${specimens.problems.length - sample} more`);
  }

  const ok = diffs.length === 0 && specimens.problems.length === 0;
  lines.push('', ok ? 'PARITY: PASS' : 'PARITY: FAIL');
  return lines.join('\n');
}

/**
 * Pixels of slack a size comparison tolerates before it is a real defect rather than sub-pixel
 * rounding between `getBoundingClientRect` (fractional) and the integer size `mount.js` writes
 * onto the `<iframe>` element from a `ResizeObserver`'s rounded report.
 *
 * @type {number}
 */
const SIZE_TOLERANCE_PX = 2;

/**
 * A backdrop this oracle accepts as "shows the library's own surface through" — `rgba(0, 0, 0, 0)`
 * is what a plain `background: transparent` computes to in every engine that runs this oracle, and
 * `transparent` covers a keyword read straight off an inline style in a defect fixture.
 *
 * @type {readonly string[]}
 */
const TRANSPARENT_BACKGROUNDS = Object.freeze(['rgba(0, 0, 0, 0)', 'transparent']);

/**
 * Judge one specimen against the two rules an excluded `.unit` can otherwise hide entirely:
 *
 *   1. The `<iframe>` element must not be SMALLER than the component mounted inside it, in either
 *      dimension — a smaller iframe is `overflow: hidden` clipping the very thing it exists to
 *      show, and `mount.js` sizing the iframe FROM a wrong measurement is exactly how a fixed
 *      regression here would recur silently.
 *   2. The specimen document's own `<body>` must not paint an opaque backdrop. `foundry2.css`
 *      gives `body` a solid background (right for a game view, wrong for a pane excerpt), and
 *      painting over it hides the very drawing surface the specimen replaced.
 *
 * Self-contained rather than reference-relative, unlike {@link diffSnapshots}: there is no
 * reference iframe to compare against, only an internal consistency the specimen has to keep with
 * itself.
 *
 * @param {object} specimen One specimen's measurements.
 * @param {string} specimen.path The catalogue row's `path`, for the message.
 * @param {boolean} specimen.mounted Whether the specimen document reported a mounted root at all.
 * @param {number} specimen.frameWidth The `<iframe>` element's own rendered width.
 * @param {number} specimen.frameHeight The `<iframe>` element's own rendered height.
 * @param {number} specimen.contentWidth The mounted component's own rendered width.
 * @param {number} specimen.contentHeight The mounted component's own rendered height.
 * @param {string} specimen.backgroundColor The specimen document's `<body>` computed background.
 * @returns {string|null} A problem sentence, or null when the specimen is sound.
 */
export function evaluateSpecimen(specimen) {
  const { path, mounted, frameWidth, frameHeight, contentWidth, contentHeight, backgroundColor } =
    specimen;
  if (!mounted) return `${path}: nothing mounted inside the specimen document`;

  if (
    contentWidth > frameWidth + SIZE_TOLERANCE_PX ||
    contentHeight > frameHeight + SIZE_TOLERANCE_PX
  ) {
    return (
      `${path}: the iframe clips its component — frame ${frameWidth}x${frameHeight}, ` +
      `content ${contentWidth}x${contentHeight}`
    );
  }

  const background = String(backgroundColor ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (!TRANSPARENT_BACKGROUNDS.includes(background)) {
    return `${path}: the specimen document paints an opaque backdrop (body background ${backgroundColor})`;
  }

  return null;
}

/**
 * Judge every specimen, collecting rather than stopping at the first defect — the same reasoning
 * `inject.js`'s `resolveSlots` gives for collecting every catalogue problem: a page that only ever
 * reports the first clipped iframe hides the other 149.
 *
 * @param {object[]} specimens Every specimen's measurements, shaped as {@link evaluateSpecimen}
 *   reads them.
 * @returns {{count: number, problems: string[]}} How many specimens were checked, and every
 *   problem found.
 */
export function evaluateSpecimens(specimens) {
  const problems = specimens
    .map((specimen) => evaluateSpecimen(specimen))
    .filter((problem) => problem !== null);
  return { count: specimens.length, problems };
}
