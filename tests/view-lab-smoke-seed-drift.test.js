/**
 * `tests/view-lab/world/smokeSeed.js` is a VERBATIM COPY of the live smoke's five world-seeding
 * blocks — the `page.evaluate` bodies in `scripts/foundry-test-run.mjs` that build the smoke world's
 * items, crafting systems, components, recipes, tools, gathering library and inventories through the
 * real Fabricate API.
 *
 * They are copied rather than imported because `foundry-test-run.mjs` is a browser-context script
 * Node cannot import, and these are the only parts of it the View Lab needs. A copy that drifts is
 * worse than no copy: the lab would render a world the smoke no longer has while still claiming a
 * frame-for-frame comparison. This test is what stops that.
 *
 * When a block legitimately changes, re-extract the copy and update its digest in the same commit —
 * the diff is then visible to a reviewer rather than implied.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { SMOKE_SEED_DIGESTS } from './view-lab/world/smokeSeed.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = resolve(ROOT, 'scripts/foundry-test-run.mjs');
const COPY = resolve(ROOT, 'tests/view-lab/world/smokeSeed.js');

/** How each block's opening line is recognised in the harness, in the smoke's own call order. */
const BLOCKS = [
  {
    name: 'seedSmokeWorldDocuments',
    opens: 'const createdDocs = await page.evaluate(async () => {',
  },
  {
    name: 'seedSmokeCraftingSetup',
    opens: 'const craftingSetup = await page.evaluate(async ({ gathererUserId',
  },
  {
    name: 'seedSmokeGatheringLibrary',
    opens: "const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig')",
    openOffset: -1,
  },
  {
    name: 'seedSmokeExecutionFixtures',
    opens: 'return await page.evaluate(async ({ arcaneSystemId',
  },
  {
    name: 'renameSmokePrimarySystem',
    opens: 'previousExperimentalFeatures = await page.evaluate(async (sysId)',
  },
];

const harnessLines = readFileSync(HARNESS, 'utf8').split('\n');
const copyText = readFileSync(COPY, 'utf8');

/**
 * Slice an evaluate body by brace balance, counting characters rather than lines.
 *
 * Line counting fails here: the closing line is `}, {`, which closes the arrow body and immediately
 * opens the argument object, so a per-line depth check never sees zero and runs past the end.
 */
function harnessBody(block) {
  const opened = harnessLines.findIndex((line) => line.includes(block.opens));
  assert.notEqual(opened, -1, `${block.name}: its opening line is no longer in the harness`);
  const anchor = opened + (block.openOffset ?? 0);

  let depth = 1;
  for (let i = anchor + 1; i < harnessLines.length; i++) {
    for (const char of harnessLines[i]) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) return harnessLines.slice(anchor + 1, i).join('\n');
      }
    }
  }
  assert.fail(`${block.name}: unbalanced evaluate body in the harness`);
}

/** Slice one copied body out of the lab module by its markers. */
function copiedBody(name) {
  const begin = `  // ── BEGIN VERBATIM COPY: ${name} ──`;
  const end = `  // ── END VERBATIM COPY: ${name} ──`;
  const start = copyText.indexOf(begin);
  const stop = copyText.indexOf(end);
  assert.notEqual(start, -1, `${name}: the copy has lost its BEGIN marker`);
  assert.notEqual(stop, -1, `${name}: the copy has lost its END marker`);
  return copyText.slice(start + begin.length + 1, stop);
}

test('every seed block the lab replays is still present in the harness', () => {
  assert.deepEqual(
    Object.keys(SMOKE_SEED_DIGESTS).sort(),
    BLOCKS.map((block) => block.name).sort(),
    'the copied blocks and the blocks this test knows about have diverged'
  );
});

for (const block of BLOCKS) {
  test(`${block.name}: the recorded digest matches the harness`, () => {
    const actual = createHash('sha256').update(harnessBody(block)).digest('hex');
    assert.equal(
      actual,
      SMOKE_SEED_DIGESTS[block.name],
      `The live smoke's "${block.name}" block has changed since the View Lab copied it.\n` +
        'Re-extract the copy and update its digest in the same commit, so the diff is reviewable:\n' +
        'the View Lab would otherwise keep rendering a world the smoke no longer seeds.'
    );
  });

  test(`${block.name}: the copied body is byte-identical`, () => {
    // The digest alone would catch this; comparing the text gives a reviewer the actual diff
    // rather than two hex strings.
    assert.equal(
      copiedBody(block.name).trimEnd(),
      harnessBody(block).trimEnd(),
      `${block.name} has diverged from the harness block it copies`
    );
  });
}

test('the copy declares itself a copy', () => {
  assert.match(copyText, /COPIED, NOT WRITTEN/, 'the copy must say plainly that it is one');
  assert.match(copyText, /export const SMOKE_SEED_DIGESTS/, 'the copy must carry its digests');
  for (const block of BLOCKS) {
    assert.match(
      copyText,
      new RegExp(`Source: scripts/foundry-test-run\\.mjs lines \\d+-\\d+[\\s\\S]{0,400}${block.name}`),
      `${block.name} must record where it came from`
    );
  }
});
