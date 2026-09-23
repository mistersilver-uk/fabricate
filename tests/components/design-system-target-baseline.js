/**
 * The two `target` populations the epic's closing ratchet pins (issue 1776).
 *
 * `target` is a planned state rather than a prohibition, so it is kept out of
 * `design-system-known-debt.json`, which is the collision ledger for rules the spec forbids.
 * Rows use that file's `key | count` shape so one `assertRatchet` reads both tables.
 */
import { readFileSync } from 'node:fs';

const TABLE = JSON.parse(
  readFileSync(new URL('./design-system-target-baseline.json', import.meta.url), 'utf8')
);

/**
 * One table as `assertRatchet` wants it: the last ` | `-separated field is the count, the rest
 * is the key.
 *
 * @param {string} table a top-level key in `design-system-target-baseline.json`
 * @returns {ReadonlyArray<{key: string, count: number}>} frozen, in file order
 */
function rows(table) {
  return Object.freeze(
    (TABLE[table] ?? []).map((row) => {
      const fields = String(row).split(' | ');
      const count = Number(fields.pop());
      const key = fields.join(' | ');
      if (!Number.isInteger(count) || count < 1 || key.length === 0) {
        throw new Error(`design-system-target-baseline.json row ${JSON.stringify(row)} under ` +
          `"${table}" is malformed: every row is a non-empty key then a positive integer count.`);
      }
      return Object.freeze({ key, count });
    })
  );
}

/**
 * Every library entry whose own `data-status-<Name>` reads `target`, keyed on the name, measured
 * at `dd1eae56`.
 */
export const TARGET_LIBRARY_NAMES = rows('libraryTargetNames');

/** @see TARGET_LIBRARY_NAMES */
// Measured over the library at issue 1512, which shipped the ordered list and the row disclosure
// it promoted.
export const TARGET_LIBRARY_NAME_TOTAL = 56;

/**
 * Every manifest row whose `status` reads `target`, keyed on the implementation path, measured at
 * `dd1eae56`. A different key from the names above, and 24 of these rows name no library entry.
 */
export const TARGET_MANIFEST_ROWS = rows('manifestTargetRows');

/** @see TARGET_MANIFEST_ROWS */
// 46 -> 47 (issue 1707 phase 4): `environment/GatheringModifierEditor.svelte` crossed the two-caller
// bar, and the row it is owed arrives at `target` because it names no specimen to be faithful to.
// 47 -> 48 (issue 1915): the two vocabulary shell components arrive at `target` with two callers
// each, and the VocabularyPanel row they replace leaves — one importer is below the bar.
export const TARGET_MANIFEST_ROW_TOTAL = 48;
