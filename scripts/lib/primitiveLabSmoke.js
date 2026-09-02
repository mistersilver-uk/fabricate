/**
 * Everything the Primitive Lab smoke can decide WITHOUT a browser.
 *
 * WHY THIS IS A LIBRARY AND `scripts/primitive-lab-smoke.mjs` IS A SHELL
 * ---------------------------------------------------------------------
 * `unicorn/no-exports-in-scripts` forbids a `scripts/` CLI from also being a module, so a smoke
 * written as one file has no testable surface at all: the number it compares the page against
 * would be computed inside the same process that boots Chromium, and nothing could ever check that
 * the number was right. The split is the same one `scripts/lib/docsScreenshotRun.js`,
 * `scripts/lib/benchmarkRunner.js` and `scripts/lib/foundryPerfRecord.js` make for the same reason.
 *
 * The division is exact: everything here is pure and reads the repository; the `.mjs` owns the
 * server, the browser and the process exit code.
 *
 * WHY THE EXPECTED COUNT IS DERIVED FROM THE CATALOGUE RATHER THAN READ OFF THE PAGE
 * ---------------------------------------------------------------------------------
 * The obvious smoke asserts `data-primitive-lab-errors === "0"`. That assertion passes over a page
 * that mounted NOTHING — an empty catalogue, a glob that stopped matching, a boot that returned
 * early — because zero specimens produce zero errors. It is the vacuity this repository has already
 * paid for elsewhere, and the delta rejects it by name.
 *
 * So the page publishes a POSITIVE count of what it mounted, and the smoke compares it by equality
 * against a count derived HERE, from the catalogue files on disk. Removing a catalogue file then
 * fails as a mismatch rather than as a smaller green number. The identity check goes one further:
 * the page also publishes each specimen's `path`, and the smoke compares the SET, so a page that
 * mounted the right number of the wrong things is caught too.
 *
 * THE DOM CONTRACT
 * ----------------
 * The attribute names below are the whole interface between the page and this smoke. They live
 * here rather than being spelled inline in the `.mjs` so that the page and its gate name one set of
 * strings — a hand-maintained mirror of selectors is exactly the thing this repository requires a
 * guard for, and this module IS that guard's half of it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The lab page, relative to the Vite dev root (the repository root). */
export const LAB_PAGE_PATH = '/tests/view-lab/primitives.html';

/**
 * The query that asks the page to mount every catalogued specimen at once rather than the rail's
 * current selection.
 *
 * The smoke has to drive every specimen, and walking a 57-entry rail one click at a time is both
 * slow and dependent on the rail's own markup — which would make a rail restyle fail as a mount
 * failure. Mounting all of them is the same coverage with one navigation, and it is a mode the page
 * needs anyway for the side-by-side theme row.
 */
export const MOUNT_ALL_QUERY = 'mount=all';

/** Present on `<body>` only once every specimen has settled. ABSENT is "still working". */
export const READY_ATTRIBUTE = 'data-primitive-lab-ready';

/** Present on `<body>` when the boot itself failed; its value is the reason. */
export const ERROR_ATTRIBUTE = 'data-primitive-lab-error';

/** The count of specimens that mounted, published on `<body>`. Compared by EQUALITY. */
export const MOUNTED_ATTRIBUTE = 'data-primitive-lab-mounted';

/** Carried by each mounted specimen's root, valued with the catalogue row's `path`. */
export const SPECIMEN_ATTRIBUTE = 'data-primitive-lab-specimen';

/**
 * The same attribute as a selector, composed HERE rather than interpolated at the call site.
 *
 * `unicorn/require-css-escape` reads an interpolated selector as an injection surface and it is
 * not wrong to — but the value is a module constant, so the honest repair is to stop building the
 * selector from a variable rather than to escape one that never varies.
 */
export const SPECIMEN_SELECTOR = `[${SPECIMEN_ATTRIBUTE}]`;

/** The catalogue directory, relative to the repository root. */
export const CATALOGUE_DIRECTORY = 'tests/view-lab/primitives/catalogue';

/**
 * The one file in the catalogue directory that is not a catalogue file.
 *
 * `model.js` globs `./catalogue/*.json`, so a row written anywhere else in that directory is
 * invisible to the lab AND to this reader — silently, and identically. Naming the single permitted
 * exception here is what lets the coverage gate reject everything else.
 */
export const CATALOGUE_README = 'README.md';

/**
 * The catalogue's `*.json` files, in code-point order.
 *
 * `readdirSync` without `recursive`, deliberately: `import.meta.glob('./catalogue/*.json')` is
 * NON-recursive, so a row in `catalogue/pickers/marks.json` reaches neither the lab nor this
 * reader. Walking deeper here would make this reader see rows the page cannot mount, and the
 * mismatch would be reported as a mount failure rather than as the misfiled file it is.
 *
 * @param {string} root Absolute repository root.
 * @returns {string[]} File names, extension included.
 */
export function catalogueFiles(root) {
  return readdirSync(path.join(root, CATALOGUE_DIRECTORY))
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => (left < right ? -1 : Number(left > right)));
}

/**
 * Every catalogue row, each carrying where it came from.
 *
 * `{file, index}` travels WITH the row rather than being reconstructed at the failure site, so a
 * message can read `catalogue/controls.json[3]` instead of naming a component and leaving the
 * reader to find which of eight files holds it.
 *
 * @param {string} root Absolute repository root.
 * @returns {{file: string, index: number, row: object}[]} Rows in file then declaration order.
 */
export function catalogueEntries(root) {
  return catalogueFiles(root).flatMap((file) => {
    const parsed = JSON.parse(readFileSync(path.join(root, CATALOGUE_DIRECTORY, file), 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new TypeError(`${CATALOGUE_DIRECTORY}/${file} is not an array of catalogue rows`);
    }
    return parsed.map((row, index) => ({ file, index, row }));
  });
}

/**
 * How many specimens the page must report having mounted.
 *
 * @param {string} root Absolute repository root.
 * @returns {number} The catalogue's row count.
 */
export function expectedSpecimenCount(root) {
  return catalogueEntries(root).length;
}

/**
 * Every path the catalogue names, which is the identity set the page must have mounted.
 *
 * @param {string} root Absolute repository root.
 * @returns {string[]} Repository-relative POSIX paths, in catalogue order.
 */
export function cataloguePaths(root) {
  return catalogueEntries(root).map((entry) => entry.row.path);
}

/**
 * The refusal issued when the catalogue is empty.
 *
 * Refused rather than run, because an empty catalogue makes every downstream comparison an
 * agreement between two empty sets — the page mounts nothing, reports nothing, and the smoke
 * congratulates it.
 *
 * @param {string} root Absolute repository root.
 * @returns {string} A message naming what to do about it.
 */
export function emptyCatalogueMessage(root) {
  return (
    `no catalogue rows under ${path.join(root, CATALOGUE_DIRECTORY)}. The smoke compares the ` +
    'page against this set, so an empty catalogue would make it pass over a page that mounted ' +
    'nothing. Add the catalogue files before running the smoke.'
  );
}

/**
 * Describe a mounted-count or mounted-identity disagreement.
 *
 * Reports BOTH halves in one message rather than failing on the count and leaving the identity for
 * the next run: a count that matches while the identity does not is the interesting failure, and a
 * reader who has only been told the count is wrong will assume it is the boring one.
 *
 * @param {object} options Options.
 * @param {string[]} options.expected Catalogue paths.
 * @param {string[]} options.mounted Paths the page reported mounting.
 * @param {number} options.reported The page's own `data-primitive-lab-mounted` value.
 * @returns {string|null} The failure text, or null when everything agrees.
 */
export function describeMountFailure({ expected, mounted, reported }) {
  const missing = expected.filter((entry) => !mounted.includes(entry));
  const extra = mounted.filter((entry) => !expected.includes(entry));
  if (reported === expected.length && missing.length === 0 && extra.length === 0) return null;
  const lines = [
    `the catalogue holds ${expected.length} rows; the page reported ${reported} mounted and ` +
      `carries ${mounted.length} specimen roots`,
  ];
  if (missing.length > 0) lines.push(`never mounted: ${missing.join(', ')}`);
  if (extra.length > 0) lines.push(`mounted but not catalogued: ${extra.join(', ')}`);
  return lines.join('\n  ');
}
