/** THE TONE A CHIP IS WEARING, READ FROM THE ONE CLASS THAT REPORTS IT (issue 1506). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const CHIP_PATH = 'src/ui/svelte/components/Chip.svelte';

/** The tone names `Chip` paints, read once from the component's own closed vocabulary. */
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
