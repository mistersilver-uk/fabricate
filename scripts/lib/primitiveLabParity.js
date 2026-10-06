/**
 * The Primitive Lab parity oracle's browser-free half (issue 1487). `library.html` opened over
 * `file://` is the reference; every element the lab did not replace must compute the same style.
 * Walks are keyed by position, since the library has no ids, and a `.unit` holding a live specimen
 * is skipped on both sides, so `evaluateSpecimen` judges each specimen on its own terms instead.
 */

/** The computed style properties compared: paint, type, box, display, alignment and opacity. */
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
 * Normalise a computed value so spelling is not read as paint: `fontFamily` keeps its first
 * family only (the two fallback chains differ in length for one face), the rest lose whitespace.
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
 *   with a reference match; `diffs` holds one entry per (element, property) disagreement;
 *   `missing` holds every lab element whose key matched nothing in the reference.
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

/** Slack between a fractional bounding box and the integer size `mount.js` writes on the iframe. */
const SIZE_TOLERANCE_PX = 2;

/** The computed backgrounds that let the library's surface show through a specimen. */
const TRANSPARENT_BACKGROUNDS = Object.freeze(['rgba(0, 0, 0, 0)', 'transparent']);

/**
 * Judge one specimen: something mounted, its `<iframe>` is not smaller than the component inside
 * it (clipping), and its document paints no opaque backdrop over the library's surface.
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
 * Judge every specimen, collecting every problem rather than stopping at the first.
 *
 * @param {object[]} specimens Every specimen's measurements, shaped as {@link evaluateSpecimen}
 *   reads them.
 * @returns {{count: number, problems: string[]}} How many were checked, and every problem found.
 */
export function evaluateSpecimens(specimens) {
  const problems = specimens
    .map((specimen) => evaluateSpecimen(specimen))
    .filter((problem) => problem !== null);
  return { count: specimens.length, problems };
}
