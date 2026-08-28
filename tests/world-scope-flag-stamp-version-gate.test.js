/**
 * THE ONE-SHOT VERSION ADVANCES THAT CONSUME A MIGRATION'S OUTPUT (issue 1363).
 *
 * `1.30.0` bumps `COMPONENT_FLAG_STAMP_TARGET` and `TOOL_FLAG_STAMP_TARGET` 1 -> 2 precisely so
 * the two source-side auto-stamps RE-RUN and repair every source Item whose
 * `roles[<systemId>].componentId` / `.toolId` names an id the migration re-keyed. That makes
 * them one-shots that CONSUME a migration's output, and the migration's deferred branch RETURNS
 * NORMALLY — so both stamps run on the SAME BOOT as a torn migration, against the OLD ids,
 * change nothing, and an unconditional version advance then gates them off FOREVER.
 *
 * Nothing else would ever repair those Items: `remapWorldScopeIdentityFlags` walks actors, not
 * sources, and every later drag copies the stale flag onto an owned item that
 * `restampOwnedItemComponentIdentity` refuses because it already carries a durable identity
 * flag.
 *
 * **The stamp targets had NO test coverage at all before this file.** The bump was load-bearing
 * and unasserted.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPONENT_FLAG_STAMP_TARGET,
  TOOL_FLAG_STAMP_TARGET,
  WORLD_SCOPE_IDENTITY_FLAG_TARGET,
} from '../src/config/settings.js';
import { mayClearWorldScopeRekeyMap } from '../src/migration/remapWorldScopeIdentityFlags.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(resolve(HERE, '..', 'src', 'main.js'), 'utf8');

/** The body of one named `async function` in `src/main.js`. */
function bodyOf(name) {
  const start = MAIN.indexOf(`async function ${name}()`);
  assert.ok(start > 0, `${name} must exist in src/main.js`);
  const end = MAIN.indexOf('\n}\n', start);
  assert.ok(end > start, `${name} must be a complete function`);
  return MAIN.slice(start, end);
}

test('the two stamp targets are BUMPED, which is what makes the repair happen at all', () => {
  // Without the bump the stamps never re-run and every source leaf stays stale. This is the
  // premise the whole file rests on, so it is asserted rather than assumed.
  assert.equal(COMPONENT_FLAG_STAMP_TARGET, 2);
  assert.equal(TOOL_FLAG_STAMP_TARGET, 2);
  assert.equal(WORLD_SCOPE_IDENTITY_FLAG_TARGET, 1);
});

for (const [pass, versionKey] of [
  ['runComponentFlagAutoStamp', 'COMPONENT_FLAG_STAMP_VERSION'],
  ['runToolFlagAutoStamp', 'TOOL_FLAG_STAMP_VERSION'],
]) {
  test(`${pass} WITHHOLDS its version advance while the 1.30.0 migration has not completed`, () => {
    // DELETING THE GUARD MUST FLIP THIS TO FAIL. There is no seam to drive these passes
    // through — `src/main.js` imports the global stylesheet and Svelte roots at module load,
    // so it cannot be imported under `node --test` at all — and that is exactly why the
    // property is asserted on the source text rather than left uncovered, as it was.
    const body = bodyOf(pass);
    const guardIndex = body.indexOf('if (!mayClearWorldScopeRekeyMap(');
    const advanceIndex = body.indexOf(`SETTING_KEYS.${versionKey}, `);
    assert.ok(
      guardIndex > 0,
      `${pass} must gate its version advance on the producing migration having COMPLETED`
    );
    assert.ok(advanceIndex > guardIndex, `${pass} must advance its version AFTER that gate`);
    assert.match(
      body.slice(guardIndex, advanceIndex),
      /return;/,
      'the gate must RETURN rather than branch past the advance'
    );
    // The gate must sit AFTER the work, so a torn boot still repairs what it can and only the
    // one-shot BOOKKEEPING is withheld.
    const workIndex = body.indexOf('autoStamp');
    assert.ok(workIndex > 0 && workIndex < guardIndex, `${pass} still does its work first`);
  });
}

test('the gate is the SAME predicate the remap uses, so the three passes cannot drift', () => {
  // One spelling, in the pure module, on `compareSemver`. A second hand-rolled `>=` on what is
  // a STRING setting is the defect this whole gate exists to avoid.
  // The import line carries no `(`, so this counts CALL SITES and nothing else.
  const callSites = MAIN.match(/mayClearWorldScopeRekeyMap\(/g) ?? [];
  assert.equal(callSites.length, 3, 'exactly three: both stamps and the remap');
  assert.equal(mayClearWorldScopeRekeyMap('1.29.0'), false);
  assert.equal(mayClearWorldScopeRekeyMap('1.4.0'), false, 'and never a lexicographic compare');
  assert.equal(mayClearWorldScopeRekeyMap('1.30.0'), true);
});

test('a world with NOTHING to re-key still advances the remap version, so it stops re-checking', () => {
  const body = bodyOf('runWorldScopeIdentityFlagRemap');
  const pendingIndex = body.indexOf('hasPendingWorldScopeRekey(');
  const advanceIndex = body.indexOf('SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION,');
  assert.ok(pendingIndex > 0, 'the RUN gate is the corpus-derived pending-map predicate');
  assert.ok(advanceIndex > pendingIndex);
  assert.doesNotMatch(
    body.slice(pendingIndex, body.indexOf('mayClearWorldScopeRekeyMap(')),
    /\breturn;/,
    'an empty map must NOT return early: the pass would then re-check on every boot forever'
  );
});
