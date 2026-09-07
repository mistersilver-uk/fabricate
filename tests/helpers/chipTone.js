/**
 * THE TONE A CHIP IS WEARING, READ FROM THE ONE CLASS THAT REPORTS IT (issue 1506).
 *
 * The status pill this change retires reported its RESOLVED tone on a `data-status-pill`
 * attribute, and a dozen suites across the manager and the player window asserted on it.
 * `Chip` reports the same fact the way every other class-based primitive in this repo does —
 * as an `is-<tone>` token in its class list — so those assertions move onto the class rather
 * than onto a hook restated per call site. A caller-written `data-*` mirror of a tone the
 * component already emits is a second copy of the tone, and it drifts the first time a site's
 * tone becomes conditional.
 *
 * WHY THE VOCABULARY IS DERIVED AND NOT LISTED
 * -------------------------------------------
 * `Chip` emits more than one `is-*` class: the density scales (`is-list`, `is-row`, `is-action`,
 * `is-tag-run`, `is-inspector`), the emphases (`is-outlined`, `is-lit`, `is-bare`) and the
 * variants (`is-mono`, `is-struck`, `is-truncated`) all share the prefix. Picking "the first
 * `is-*` token" would return a density at any converted site that carries one, and a hard-coded
 * exclusion list is a mirror of the component's whole class vocabulary that nothing keeps
 * honest. So the tone set is read from the component's own `TONES` literal, which is the same
 * source `chip-tone-matrix-characterization.test.js` derives its matrix from.
 *
 * Comments are stripped before the literal is read: `Chip.svelte` quotes tone names in its
 * prose, so an unstripped read invents members no chip will ever wear.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const CHIP_PATH = 'src/ui/svelte/components/Chip.svelte';

/**
 * The tone names `Chip` paints, read once from the component's own closed vocabulary.
 *
 * @returns {Set<string>}
 */
function readChipTones() {
  const source = readFileSync(resolve(repoRoot, CHIP_PATH), 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/[^\n]*/g, '');
  const start = source.indexOf('const TONES = new Set([');
  assert.notEqual(start, -1, 'Chip still declares its tone vocabulary as `TONES`');
  const body = source.slice(source.indexOf('[', start), source.indexOf(']);', start));
  const names = [...body.matchAll(/'([\w-]+)'/g)].map(([, name]) => name);
  assert.ok(names.length > 0, 'Chip declares at least one tone');
  return new Set(names);
}

/** @type {Set<string>} */
export const CHIP_TONES = readChipTones();

/**
 * The tone class a rendered chip is wearing.
 *
 * @param {{ classList?: Iterable<string> }|null|undefined} node A mounted `.manager-chip`.
 * @returns {string|null} The tone name, or `null` for an absent chip or an untoned one — which
 *   is what a chip renders when it is handed a tone `Chip` does not paint.
 */
export function chipToneOf(node) {
  if (!node) return null;
  for (const token of node.classList ?? []) {
    if (!token.startsWith('is-')) continue;
    const name = token.slice(3);
    if (CHIP_TONES.has(name)) return name;
  }
  return null;
}
