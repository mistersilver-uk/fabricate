/**
 * What `lab:check` and `lab:parity` share (issue 1487): the catalogue reader, the expected count,
 * the mounted-set comparison, the page attribute contract and the lab server. Each CLI owns its
 * browser and exit code, because `unicorn/no-exports-in-scripts` forbids a CLI that is a module.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { Window } from 'happy-dom';

import { readLibrarySections } from '../../tests/helpers/designLibrarySections.js';
import { insetOf } from '../../tests/view-lab/primitives/hostLayout.js';
import { resolveSlots } from '../../tests/view-lab/primitives/inject.js';
import {
  BESIDE,
  LIVE_LABEL_CLASS,
  LIVE_LABEL_TEXT,
  PARTIAL_CLASS,
} from '../../tests/view-lab/primitives/liveness.js';

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

/** The qualifier a partial specimen's label or caption carries, as a selector. */
export const PARTIAL_SELECTOR = `.${PARTIAL_CLASS}`;

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
 * each section's number, title and ledes, how many specimens stand beside their drawing, in all
 * and per entry heading, and each entry's `partial` qualifiers.
 *
 * @param {string} root Absolute repository root.
 * @returns {{sections: {id: string, number: string|null, title: string|null, ledes: string[]}[],
 *   beside: number, besideByEntry: Record<string, number>, partialByEntry: Record<string,
 *   string[]>}} The expectations `lab:check` holds the page to.
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
    const beside = slots.filter((slot) => slot.mode === BESIDE);
    const besideByEntry = {};
    const partialByEntry = {};
    const insetByPath = {};
    for (const slot of slots) {
      if (insetOf(slot.row) > 0) insetByPath[slot.row.path] = insetOf(slot.row);
      const heading = slot.host
        .closest('.spec')
        ?.querySelector(':scope > .spec-head > h4')?.textContent;
      const entry = collapsed(heading ?? '?');
      if (slot.mode === BESIDE) besideByEntry[entry] = (besideByEntry[entry] ?? 0) + 1;
      if (slot.row.partial)
        partialByEntry[entry] = [...(partialByEntry[entry] ?? []), slot.row.partial];
    }
    return {
      sections: readLibrarySections(html).sections,
      beside: beside.length,
      besideByEntry,
      partialByEntry,
      insetByPath,
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
 * Compare the "live" labels on the page with the specimens that stand beside their drawing, entry
 * by entry: each entry carries exactly as many labels directly before a specimen as it has beside
 * specimens, and each label reads "live". A total alone would let a doubled label on one entry
 * stand in for a missing one on another.
 *
 * @param {object} options Options.
 * @param {Record<string, number>} options.expected Beside specimens per entry heading, from
 *   `readLabExpectations`.
 * @param {{entry: string, text: string, paired: boolean}[]} options.labels Every label on the
 *   page, with its entry heading, its text, and whether a specimen follows it directly.
 * @returns {string|null} The disagreement, or null when every beside specimen is labelled once.
 */
export function describeLiveLabelMismatch({ expected, labels }) {
  const problems = [];
  const entries = new Set([...Object.keys(expected), ...labels.map((label) => label.entry)]);
  for (const entry of [...entries].sort((left, right) =>
    left < right ? -1 : Number(left > right)
  )) {
    const want = expected[entry] ?? 0;
    const paired = labels.filter((label) => label.entry === entry && label.paired).length;
    if (paired !== want) {
      problems.push(
        `${entry} has ${want} specimen(s) beside their drawing and ${paired} "live" label(s)` +
          ' directly before one'
      );
    }
  }
  const unpaired = labels.filter((label) => !label.paired).map((label) => label.entry);
  if (unpaired.length > 0) {
    problems.push(`a label is not directly before its specimen in ${unpaired.join(', ')}`);
  }
  for (const label of labels) {
    if (collapsed(label.text) === LIVE_LABEL_TEXT) continue;
    problems.push(`a label in ${label.entry} reads ${JSON.stringify(label.text)}, not "live"`);
  }
  return problems.length === 0 ? null : problems.join('\n  ');
}

/**
 * Compare the partial qualifiers on the page with the catalogue's, entry by entry: each one sits in
 * a label or caption directly before its specimen and reads its row's `partial`.
 *
 * @param {object} options Options.
 * @param {Record<string, string[]>} options.expected Each entry's `partial` values, from
 *   `readLabExpectations`.
 * @param {{entry: string, text: string, paired: boolean}[]} options.captions Every qualifier on the
 *   page, with its entry heading, its text, and whether its chip directly precedes a specimen.
 * @returns {string|null} The disagreement, or null when every partial specimen says so.
 */
export function describePartialMismatch({ expected, captions }) {
  const problems = [];
  const order = (left, right) => (left < right ? -1 : Number(left > right));
  const sorted = (list) => list.map(collapsed).sort(order);
  const entries = new Set([...Object.keys(expected), ...captions.map((caption) => caption.entry)]);
  for (const entry of [...entries].sort(order)) {
    const want = sorted(expected[entry] ?? []);
    const got = sorted(
      captions.filter((caption) => caption.entry === entry && caption.paired).map((c) => c.text)
    );
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(
        `${entry} catalogues partial ${JSON.stringify(want)} and the page says ${JSON.stringify(got)}`
      );
    }
  }
  const unpaired = captions.filter((caption) => !caption.paired).map((caption) => caption.entry);
  if (unpaired.length > 0) {
    problems.push(
      `a partial caption is not directly before its specimen in ${unpaired.join(', ')}`
    );
  }
  return problems.length === 0 ? null : problems.join('\n  ');
}

/** Slack for a fractional drawing width against the whole pixels an iframe is sized in. */
const WIDTH_TOLERANCE_PX = 1;

/**
 * Report a filling specimen standing beside its drawing that is wider than the drawing: it takes
 * the region the drawing gives it and adds none (`page.css`, `contain: inline-size`), bar the row
 * `inset` it pads itself by on both sides.
 *
 * @param {{entry: string, specimen: string, width: number, drawn: number, inset?: number}[]} pairs
 *   Every beside filling specimen's width, its drawing's, and its inset, as rendered.
 * @returns {string|null} The over-wide specimens, or null when none is wider than its drawing.
 */
export function describeWideBesideSpecimens(pairs) {
  const wide = pairs
    .filter(({ width, drawn, inset = 0 }) => width > drawn + 2 * inset + WIDTH_TOLERANCE_PX)
    .map(
      ({ entry, specimen, width, drawn }) =>
        `${entry} / ${specimen}: ${Math.round(width)}px beside a ${Math.round(drawn)}px drawing`
    );
  return wide.length === 0 ? null : wide.join('; ');
}

/**
 * Report a specimen whose row has an `inset` but whose slot is not widened by it: the primitive
 * pads itself by the inset on both sides, so a slot no wider than the drawing clips it. A drawing
 * with its own `max-width` is exempt, as `layoutFor` exempts it: its width already holds the inset.
 *
 * @param {{entry: string, specimen: string, width: number, drawn: number, inset?: number,
 *   capped?: boolean}[]} specimens Every specimen's slot width, its drawing's, its row's inset,
 *   and whether the drawing was capped, as rendered.
 * @returns {string|null} The unwidened specimens, or null when every inset row is widened.
 */
export function describeUnwidenedInsetSpecimens(specimens) {
  const narrow = specimens
    .filter(
      ({ width, drawn, inset = 0, capped = false }) =>
        inset > 0 && !capped && width < drawn + 2 * inset - WIDTH_TOLERANCE_PX
    )
    .map(
      ({ entry, specimen, width, drawn, inset }) =>
        `${entry} / ${specimen}: ${Math.round(width)}px for a ${Math.round(drawn)}px drawing ` +
        `with a ${inset}px inset`
    );
  return narrow.length === 0 ? null : narrow.join('; ');
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
