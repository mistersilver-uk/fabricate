/**
 * What `lab:check` and `lab:parity` share (issue 1487): the catalogue reader, the expected count,
 * the mounted-set comparison, the page attribute contract and the lab server. Each CLI owns its
 * browser and exit code, because `unicorn/no-exports-in-scripts` forbids a CLI that is a module.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The lab page, relative to the Vite dev root (the repository root). */
export const LAB_PAGE_PATH = '/tests/view-lab/primitives.html';

/** The query the smoke navigates with; `mount.js` refuses any other mode. */
export const MOUNT_ALL_QUERY = 'mount=all';

/** Present on `<body>` only once every specimen has settled; absent means still working. */
export const READY_ATTRIBUTE = 'data-primitive-lab-ready';

/** Present on `<body>` when the boot itself failed; its value is the reason. */
export const ERROR_ATTRIBUTE = 'data-primitive-lab-error';

/** The count of specimens that mounted, published on `<body>`, compared by equality. */
export const MOUNTED_ATTRIBUTE = 'data-primitive-lab-mounted';

/**
 * Carried by each specimen's `<iframe>`, valued with its row's `path`. On the iframe, because
 * `page.evaluate` reads only the top document, never a specimen's own realm.
 */
export const SPECIMEN_ATTRIBUTE = 'data-primitive-lab-specimen';

/** The attribute as a constant selector, so `unicorn/require-css-escape` sees nothing dynamic. */
export const SPECIMEN_SELECTOR = `[${SPECIMEN_ATTRIBUTE}]`;

/** The catalogue directory, relative to the repository root. */
export const CATALOGUE_DIRECTORY = 'tests/view-lab/primitives/catalogue';

/** The one file in the catalogue directory that is not a catalogue file. */
export const CATALOGUE_README = 'README.md';

/**
 * The catalogue's `*.json` files in code-point order, read non-recursively to match the page's
 * non-recursive `import.meta.glob`.
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
 * Every catalogue row, each carrying the file and index it was written at.
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
 * The refusal issued when the catalogue is empty, since an empty one would pass vacuously.
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

/** How many times each path appears. */
function tally(paths) {
  const counts = new Map();
  for (const entry of paths) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  return counts;
}

/**
 * Describe a mounted count, identity or multiplicity disagreement, all halves in one message. A
 * multiset, because a row whose drawing contains another's detaches it while the set still agrees.
 *
 * @param {object} options Options.
 * @param {string[]} options.expected Catalogue paths, one per row, duplicates included.
 * @param {string[]} options.mounted Paths the page reported mounting, one per specimen root.
 * @param {number} options.reported The page's own `data-primitive-lab-mounted` value.
 * @returns {string|null} The failure text, or null when everything agrees.
 */
export function describeMountFailure({ expected, mounted, reported }) {
  const wanted = tally(expected);
  const found = tally(mounted);
  const missing = [...wanted.keys()].filter((entry) => !found.has(entry));
  const extra = [...found.keys()].filter((entry) => !wanted.has(entry));
  const miscounted = [...wanted]
    .filter(([entry, count]) => found.has(entry) && found.get(entry) !== count)
    .map(([entry, count]) => `${entry}: catalogued ${count}, mounted ${found.get(entry)}`);
  if (
    reported === expected.length &&
    missing.length === 0 &&
    extra.length === 0 &&
    miscounted.length === 0
  ) {
    return null;
  }
  const lines = [
    `the catalogue holds ${expected.length} rows; the page reported ${reported} mounted and ` +
      `carries ${mounted.length} specimen roots`,
  ];
  if (missing.length > 0) lines.push(`never mounted: ${missing.join(', ')}`);
  if (extra.length > 0) lines.push(`mounted but not catalogued: ${extra.join(', ')}`);
  if (miscounted.length > 0) {
    lines.push(
      `mounted a different number of times than catalogued: ${miscounted.join('; ')}. A path ` +
        'drawn in many places is expected; one drawn in fewer places than the catalogue claims is ' +
        'a drawing that was replaced by nothing, or a specimen that mounted outside the document.'
    );
  }
  return lines.join('\n  ');
}

/** Opaque, because `eslint-plugin-import-x` crashes on Vite's exports map (see the View Lab CLI). */
const VITE_SPECIFIER = 'vite';

/**
 * Start the lab's Vite server on port 0 and report the URL it actually bound, so a parallel
 * worktree's server on the configured port can never answer.
 *
 * @param {string} root Absolute repository root.
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>} The server handle.
 */
export async function startLabServer(root) {
  const { createServer } = await import(VITE_SPECIFIER);
  const server = await createServer({
    configFile: path.join(root, 'tests/view-lab/vite.config.js'),
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  const resolved = server.resolvedUrls?.local?.[0];
  if (!resolved) {
    await server.close();
    throw new Error(
      'the lab server reported no local URL, so there is nothing to open. `resolvedUrls` is ' +
        'populated by `listen()`; an empty one means the server bound nothing.'
    );
  }
  return { baseUrl: resolved.replace(/\/$/, ''), close: () => server.close() };
}

/**
 * Compare the iframe sizes read when the page published ready with the sizes read a moment later.
 * Ready means every specimen is at its final size, so any iframe that moved afterwards was
 * published before a corrective resize.
 *
 * @param {{specimen: string, width: number, height: number}[]} atReady Sizes at ready.
 * @param {{specimen: string, width: number, height: number}[]} later Sizes read afterwards.
 * @returns {string|null} The disagreement, or null when every iframe held its size.
 */
export function describeUnstableSizes(atReady, later) {
  const moved = atReady
    .map((before, index) => ({ before, after: later[index] }))
    .filter(
      ({ before, after }) =>
        after === undefined || before.width !== after.width || before.height !== after.height
    )
    .map(
      ({ before, after }) =>
        `${before.specimen}: ${before.width}x${before.height} at ready, ` +
        `${after ? `${after.width}x${after.height}` : 'gone'} after`
    );
  if (atReady.length !== later.length)
    moved.push(`${atReady.length} iframes at ready, ${later.length} after`);
  return moved.length === 0 ? null : moved.join('; ');
}
