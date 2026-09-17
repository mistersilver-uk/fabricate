/**
 * The machine-readable half of the `design-system` capability: one row per shared UI primitive,
 * keyed on the implementation path a diff names. Rows live in `designSystemPrimitives.json` beside
 * this file, because inlining them here reintroduces a failing SonarCloud duplication gate; row
 * prose travels with its row, in the `why` field.
 *
 * Citations name a requirement heading in double quotes, never a line number, and
 * `tests/design-system-coverage.test.js` resolves every one against the capability's own headings.
 *
 * Row shape is `{ path, library, status, evidence, scope, why }` on
 * {@link DESIGN_SYSTEM_PRIMITIVES} and `{ path, library, evidence, callers, why }` on
 * {@link NOT_A_PRIMITIVE}. `evidence` is `'broad'` or `'targeted'` and drives `viewLabCases.js`
 * routing; `callers` holds paths, asserted equal to what `componentImporters.js` measures.
 */
import { readFileSync } from 'node:fs';

/**
 * The manager's own primitive directory, as a diff names it. Primitives sit directly under it,
 * mixed in with feature views, which is why the manager's set has to be named rather than globbed.
 */
const MANAGER_PRIMITIVE_DIRECTORY = 'src/ui/svelte/apps/manager/';

/**
 * The three tables, read from the sibling data file. See the docblock above for why they are not
 * written out in this module.
 */
const MANIFEST = JSON.parse(
  readFileSync(new URL('designSystemPrimitives.json', import.meta.url), 'utf8')
);

/**
 * Freeze a table read from JSON, rows and all, INCLUDING a row's array-valued fields.
 *
 * `JSON.parse` hands back fresh MUTABLE objects, where the literals this replaced were frozen at
 * both levels. That is not decoration: these tables are module-level singletons shared by every
 * importer in one process — `viewLabCases.js` derives routing from them at ITS import time, and a
 * test that mutated a row in place would change what a later suite in the same run routes. Freezing
 * every level makes such a write throw in strict mode instead of silently succeeding.
 *
 * The array level is not a generalisation for its own sake. `callers` is the field an integrity
 * assertion compares against the tree, and a shallow freeze leaves exactly that value writable —
 * so a suite could push a path onto a row and green the comparison it was supposed to fail, in a
 * process another suite then reads. The one field that must not be quietly editable was the one
 * field two levels of freezing did not reach.
 *
 * @template {object} Row
 * @param {Row[]} rows
 * @returns {readonly Row[]}
 */
function frozenTable(rows) {
  return Object.freeze(
    rows.map((row) => {
      for (const value of Object.values(row)) if (Array.isArray(value)) Object.freeze(value);
      return Object.freeze(row);
    })
  );
}

/** Order two strings by code point, ascending. */
function byCodePoint(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * The shipped shared primitive set: every file that meets the capability's two-caller bar and sits
 * in one of the two primitive directories.
 */
export const DESIGN_SYSTEM_PRIMITIVES = frozenTable(MANIFEST.designSystemPrimitives);

/** Adjudicated candidates that sit in a primitive directory and are not members of the set. */
export const NOT_A_PRIMITIVE = frozenTable(MANIFEST.notAPrimitive);

/**
 * The ruled-out register, mirroring spec.md requirement "The ruled-out register is part of the
 * specification" and `library.html:1985-2002`.
 */
export const RULED_OUT = frozenTable(MANIFEST.ruledOut);

/** The shipped primitive paths carrying a given evidence judgement, in code-point order. */
export function primitivePathsByEvidence(evidence) {
  return DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.evidence === evidence)
    .map((row) => row.path)
    .sort(byCodePoint);
}

/**
 * The basenames, extension stripped, of the manager's own primitives carrying a given evidence
 * judgement — in code-point order.
 */
export function managerPrimitiveNamesByEvidence(evidence) {
  return primitivePathsByEvidence(evidence)
    .filter((path) => path.startsWith(MANAGER_PRIMITIVE_DIRECTORY) && path.endsWith('.svelte'))
    .map((path) => path.slice(MANAGER_PRIMITIVE_DIRECTORY.length, -'.svelte'.length));
}
