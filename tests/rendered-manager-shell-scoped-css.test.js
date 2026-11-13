/* The rendered manager shell collects a split component's style parts with it (issue 2317). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { collectScopedCss } from './helpers/renderedManagerShell.js';

const repoRoot = resolve(import.meta.dirname, '..');
const CHIP = 'src/ui/svelte/components/Chip.svelte';
const CHIP_FRAME = 'src/ui/svelte/components/ChipFrame.svelte';

test("a tree compiling Chip ships ChipFrame's root rules beside Chip's own", () => {
  const frame = collectScopedCss({ repoRoot, compiledModules: [CHIP_FRAME] });
  const scoped = collectScopedCss({ repoRoot, compiledModules: [CHIP] });
  assert.equal(frame.hashes.length, 1, 'ChipFrame emits one scoped block');
  assert.ok(
    scoped.hashes.includes(frame.hashes[0]),
    "Chip's tree carries ChipFrame's scoping hash"
  );
  assert.equal(scoped.blocks, 2);
});

test('a tree declaring both parts collects each block once', () => {
  const scoped = collectScopedCss({ repoRoot, compiledModules: [CHIP, CHIP_FRAME] });
  assert.equal(scoped.blocks, 2);
});
