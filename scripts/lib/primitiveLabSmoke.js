/**
 * What `lab:check` and `lab:parity` share (issue 1487): the catalogue reader, the expected count,
 * the mounted-set comparison, the page attribute contract and the lab server. Each CLI owns its
 * browser and exit code, because `unicorn/no-exports-in-scripts` forbids a CLI that is a module.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { Window } from 'happy-dom';

import { readLibrarySections } from '../../tests/helpers/designLibrarySections.js';
import { resolveSlots } from '../../tests/view-lab/primitives/inject.js';
import { BESIDE, LIVE_LABEL_CLASS } from '../../tests/view-lab/primitives/liveness.js';

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

/** The label `liveness.js` puts before a specimen standing beside its drawing, as a selector. */
export const LIVE_LABEL_SELECTOR = `.${LIVE_LABEL_CLASS.trim().replaceAll(/\s+/g, '.')}`;

/** The catalogue directory, relative to the repository root. */
export const CATALOGUE_DIRECTORY = 'tests/view-lab/primitives/catalogue';

/** The library the page renders, and the manifest whose names decide each specimen's liveness. */
const LIBRARY_PATH = 'openspec/specs/design-system/library.html';
const MANIFEST_PATH = 'scripts/lib/designSystemPrimitives.json';

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

/**
 * What the page must show, derived in Node from the library, catalogue and manifest it renders:
 * each section's number, title and ledes, and how many specimens stand beside their drawing.
 *
 * @param {string} root Absolute repository root.
 * @returns {{sections: {id: string, number: string|null, title: string|null, ledes: string[]}[],
 *   beside: number}} The expectations `lab:check` holds the page to.
 */
export function readLabExpectations(root) {
  const html = readFileSync(path.join(root, LIBRARY_PATH), 'utf8');
  const manifest = JSON.parse(readFileSync(path.join(root, MANIFEST_PATH), 'utf8'));
  const window = new Window();
  try {
    window.document.write(html);
    const { slots } = resolveSlots(
      window.document.body,
      catalogueEntries(root).map((entry) => entry.row),
      [...manifest.designSystemPrimitives, ...manifest.notAPrimitive]
    );
    return {
      sections: readLibrarySections(html).sections,
      beside: slots.filter((slot) => slot.mode === BESIDE).length,
    };
  } finally {
    window.close();
  }
}

/** Collapse whitespace, so a rendered text compares with its source text. */
function collapsed(text) {
  return text === null ? null : text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Compare the sections the page drew with the library's: the same ids in order, each drawing its
 * number, its title and every lede the library authors, each with a visible box.
 *
 * @param {{id: string, number: string|null, title: string|null, ledes: string[]}[]} expected The
 *   library's sections, from `readLabExpectations`.
 * @param {{id: string, number: string|null, title: string|null, ledes: string[], unseen:
 *   string[]}[]} rendered Read off the page; `unseen` names each part that drew no visible box.
 * @returns {string|null} Every disagreement, or null when the page drew every section.
 */
export function describeSectionMismatch(expected, rendered) {
  if (expected.length === 0) return 'the library yielded no `section[id]`, so nothing was checked';
  const problems = [];
  const order = (sections) => sections.map((section) => section.id).join(', ');
  if (order(rendered) !== order(expected)) {
    problems.push(`the page drew sections ${order(rendered)}; the library has ${order(expected)}`);
  }
  const drawn = new Map(rendered.map((section) => [section.id, section]));
  for (const want of expected) {
    const got = drawn.get(want.id);
    if (!got) continue;
    for (const part of ['number', 'title']) {
      if (want[part] === null) problems.push(`#${want.id} has no ${part} in the library`);
      else if (collapsed(got[part]) !== collapsed(want[part])) {
        problems.push(`#${want.id} drew ${part} ${JSON.stringify(got[part])}, not ${want[part]}`);
      }
    }
    if (JSON.stringify(got.ledes.map(collapsed)) !== JSON.stringify(want.ledes)) {
      problems.push(
        `#${want.id} drew ${got.ledes.length} lede(s); the library has ${want.ledes.length}`
      );
    }
    if (got.unseen.length > 0)
      problems.push(`#${want.id} drew no box for ${got.unseen.join(', ')}`);
  }
  return problems.length === 0 ? null : problems.join('\n  ');
}

/**
 * Compare the `live` labels on the page with the specimens that stand beside their drawing: one
 * label each, and each label directly before its specimen.
 *
 * @param {object} options Options.
 * @param {number} options.expected The beside count, from `readLabExpectations`.
 * @param {number} options.labels The labels the page carries.
 * @param {string[]} options.unpaired The entry of each label not followed by a specimen.
 * @returns {string|null} The disagreement, or null when every beside specimen is labelled.
 */
export function describeLiveLabelMismatch({ expected, labels, unpaired }) {
  const problems = [];
  if (labels !== expected) {
    problems.push(
      `${expected} specimen(s) stand beside their drawing and the page carries ${labels} ` +
        '`live` label(s)'
    );
  }
  if (unpaired.length > 0) {
    problems.push(`a label is not directly before its specimen in ${unpaired.join(', ')}`);
  }
  return problems.length === 0 ? null : problems.join('\n  ');
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
