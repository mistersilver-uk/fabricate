/**
 * Turn catalogue rows into the hand-drawn elements of the rendered library a real component
 * replaces or stands beside (`liveness.js`). A row names one drawing by its `draws` selector, and
 * every other node in the unit stays. Rows sharing a `(spec, cap, draws)` address must equal the
 * elements that selector matches; every mismatch is collected rather than thrown, so the page
 * reports each stale row (issue 1487).
 */
import { normalize, specBlocks, unitsOf } from './library.js';
import { decideLiveness, libraryNamesByPath } from './liveness.js';

/**
 * Resolve every catalogue row against the rendered library.
 *
 * @param {ParentNode} root The rendered library.
 * @param {object[]} rows The catalogue, in file then declaration order.
 * @param {{path: string, library: string|null}[]} manifestRows Both manifest tables.
 * @returns {{slots: {host: Element, row: object, name: string, mode: string}[], problems:
 *   string[]}} One slot per live drawing with the name it stands up and its liveness mode, and
 *   every row that could not be placed.
 */
export function resolveSlots(root, rows, manifestRows) {
  const blocks = specBlocks(root);
  const namesByPath = libraryNamesByPath(manifestRows);
  const unitCache = new Map();
  const problems = [];
  const slots = [];

  for (const group of byAddress(rows).values()) {
    const [first] = group;
    const block = blocks.get(first.spec);
    if (!block) {
      problems.push(`${describe(first)}: the library has no entry headed ${first.spec}`);
      continue;
    }
    if (!first.draws) {
      problems.push(`${describe(first)}: every row must name the drawing it replaces in \`draws\``);
      continue;
    }
    const scope = scopeFor(block, first, unitCache);
    if (!scope) {
      problems.push(`${describe(first)}: entry ${first.spec} has no unit captioned "${first.cap}"`);
      continue;
    }
    const targets = matches(scope, first.draws, problems, first);
    if (!targets) continue;
    if (targets.length !== group.length) {
      problems.push(
        `${describe(first)}: \`draws\` "${first.draws}" matches ${targets.length} element(s) ` +
          `and ${group.length} row(s) claim them. The library has been re-drawn; re-read the ` +
          'entry and update the rows — a partial match would leave live components and hand ' +
          'drawings side by side with nothing on the page saying which is which.'
      );
      continue;
    }
    for (const [index, host] of targets.entries()) {
      const row = group[index];
      const liveness = decideLiveness(block, blocks.values(), namesByPath.get(row.path) ?? []);
      if (liveness.problem) problems.push(`${describe(row)} / ${row.path}: ${liveness.problem}`);
      else slots.push({ host, row, ...liveness });
    }
  }

  return { slots, problems };
}

/** Group rows by address, keeping catalogue order: a group pairs with its matches positionally. */
function byAddress(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.spec, row.cap ?? null, row.draws ?? null]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/**
 * The subtree a row's `draws` is evaluated in: its captioned `.unit`, or the whole entry when the
 * row has no caption.
 *
 * @returns {Element|null} The scope, or null when the caption names no unit.
 */
function scopeFor(block, row, cache) {
  if (!row.cap) return block;
  let units = cache.get(block);
  if (!units) {
    units = unitsOf(block);
    cache.set(block, units);
  }
  return units.get(normalize(row.cap)) ?? null;
}

/** @returns {Element[]|null} The matches, or null (and a problem) when the selector is invalid. */
function matches(scope, selector, problems, row) {
  try {
    return [...scope.querySelectorAll(selector)];
  } catch {
    problems.push(`${describe(row)}: \`draws\` "${selector}" is not a valid selector`);
    return null;
  }
}

/** A row's entry heading and caption, as a reader would search the library for it. */
function describe(row) {
  return row.cap ? `${row.spec} / "${row.cap}"` : row.spec;
}
