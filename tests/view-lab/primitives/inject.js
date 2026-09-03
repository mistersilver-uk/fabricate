/**
 * Turn catalogue rows into places in the rendered library where a real component goes.
 *
 * ── THE UNIT OF REPLACEMENT IS ONE HAND-DRAWN CONTROL, NOT A WHOLE `.unit` ────────────────────
 *
 * The obvious rule is "empty the `.unit` and mount into it". It is wrong in a way that only shows
 * up once you look at what the library's units actually contain, so it is worth naming four cases
 * in the Controls section alone that it would have destroyed:
 *
 *   - `<Stepper>` / "with unit" draws a stepper AND a `gp` label beside it. The label is what the
 *     caption is about.
 *   - `<Button>` / "destructive — arm, then confirm" draws four buttons with `→` between them. The
 *     arrows ARE the state machine the caption describes.
 *   - `<Toggle>` / "in a settings row" draws a Well, a title, a hint and a switch. The composition
 *     is the subject; the switch is one cell of it.
 *   - `<Checkbox>` / "gate list" draws two Wells each holding a box, a name and an expression.
 *
 * So a row NAMES the drawing it replaces — `draws`, a selector — and the injector swaps that one
 * element for the live component, in place. Wrappers, annotations, arrows, Wells, hints and every
 * unmapped sibling survive untouched, which is what makes the result comparable to the library
 * rather than merely inspired by it. There is no second, coarser mode: an entry that looks like it
 * needs one needs a better selector, and a rule with one form cannot be reached by accident.
 *
 * ── THE COUNT IS THE GUARD, AND IT IS THE ONLY THING STOPPING THIS FROM ROTTING ───────────────
 *
 * `draws` is a hand-written mirror of markup in a file this page may not edit, which is precisely
 * the shape this repository requires a guard for. The guard is exact rather than approximate: the
 * number of rows sharing a `(spec, cap, draws)` address must EQUAL the number of elements that
 * selector matches. A library edit that adds a fifth button to a four-button unit, renames a kit
 * class, or moves a specimen to another caption then fails loudly on the next page load, naming
 * both numbers — instead of quietly drawing three live buttons and one drawing, which is a page
 * that lies about what ships.
 *
 * Every problem found here is COLLECTED rather than thrown. A page that refuses to render because
 * one catalogue row is stale is less useful than one that renders and says which row is stale, and
 * `mount.js` publishes them all through `data-primitive-lab-error` — so `npm run lab:check` fails
 * on any of them either way.
 */
import { normalize, specBlocks, unitsOf } from './library.js';

/**
 * Resolve every catalogue row against the rendered library.
 *
 * @param {ParentNode} root The rendered library.
 * @param {object[]} rows The catalogue, in file then declaration order.
 * @returns {{slots: {host: Element, row: object}[], problems: string[]}} One slot per drawing that
 *   a component stands in for, and every row that could not be placed.
 */
export function resolveSlots(root, rows) {
  const blocks = specBlocks(root);
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
    for (const [index, host] of targets.entries()) slots.push({ host, row: group[index] });
  }

  return { slots, problems };
}

/**
 * Group the rows that address the same drawings, preserving catalogue order within each group.
 *
 * Order is load-bearing: a group's rows are paired POSITIONALLY against the elements its selector
 * matches, in document order, so the catalogue's sequence is what decides which button gets which
 * role.
 *
 * @param {object[]} rows The catalogue.
 * @returns {Map<string, object[]>} Address to its rows.
 */
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
 * The subtree a row's `draws` selector is evaluated in.
 *
 * A captioned row is scoped to its `.unit`, which is what makes a caption like "disabled" — used
 * by both `<Toggle>` and `<Checkbox>` — an unambiguous address. A row with no caption is scoped to
 * the whole entry, which is the answer for a specimen group the library drew WITHOUT a `.unit`
 * wrapper: the `<Field>` entry's six labelled columns are exactly that, and there is no caption in
 * the file to point at.
 *
 * @param {Element} block The `.spec`.
 * @param {object} row The first row of the group.
 * @param {Map<Element, Map<string, Element>>} cache Per-entry unit index.
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

/**
 * Evaluate a `draws` selector, reporting an unparseable one as a row defect.
 *
 * @param {Element} scope Where to look.
 * @param {string} selector The row's selector.
 * @param {string[]} problems The collector.
 * @param {object} row The first row of the group, for the message.
 * @returns {Element[]|null} The matches, or null when the selector itself is broken.
 */
function matches(scope, selector, problems, row) {
  try {
    return [...scope.querySelectorAll(selector)];
  } catch {
    problems.push(`${describe(row)}: \`draws\` "${selector}" is not a valid selector`);
    return null;
  }
}

/**
 * Name a row the way a reader would search the library for it.
 *
 * @param {object} row A catalogue row.
 * @returns {string} Its entry heading and caption.
 */
function describe(row) {
  return row.cap ? `${row.spec} / "${row.cap}"` : row.spec;
}
