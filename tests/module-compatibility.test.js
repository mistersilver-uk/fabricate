import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { rewriteModuleJson } from '../scripts/release.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcManifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8'));

// `rewriteModuleJson` is the exact transform the build applies to produce dist/module.json, so
// running it here proves the BUILT manifest — no full Vite build required.
const builtManifest = rewriteModuleJson(srcManifest);

/**
 * `compatibility.maximum` is a Foundry KILL-SWITCH, not a hint. A set integer `maximum` makes
 * `testAvailability` compute `majorOnly: true` -> `REQUIRES_CORE_DOWNGRADE` -> the module is
 * `unavailable` and will neither load nor install the day the next Foundry generation ships.
 * Issue #627 task 2.6 removes it so the public release does not ship the kill-switch.
 */
for (const [label, manifest] of [
  ['source module.json', srcManifest],
  ['built dist/module.json', builtManifest],
]) {
  test(`${label} carries no compatibility.maximum (the kill-switch)`, () => {
    assert.equal(
      'maximum' in manifest.compatibility,
      false,
      'a set compatibility.maximum makes the module unavailable on the next Foundry generation',
    );
  });

  // Sibling trap: `verified` (and `minimum`) keep working ONLY because Foundry auto-detects
  // `majorOnly` from a BARE MAJOR via `Number.isInteger(Number(x))`. "Normalising" "14" to
  // "14.0.0" switches majorOnly OFF -> REQUIRES_CORE_DOWNGRADE -> uninstallable for every v14 user.
  test(`${label} keeps compatibility.verified a bare integer (majorOnly auto-detect)`, () => {
    const verified = manifest.compatibility.verified;
    assert.equal(Number.isInteger(Number(verified)), true, 'verified must parse as an integer');
    assert.equal(String(verified).includes('.'), false, 'verified must stay a bare major, never X.Y.Z');
  });
}
