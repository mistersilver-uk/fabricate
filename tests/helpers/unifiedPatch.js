/** The hunks `git diff` writes between two texts, as the PR files API carries them. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** @returns {string} The patch from the first hunk header, `''` when the texts are equal. */
export function unifiedPatch(before, after) {
  const dir = mkdtempSync(path.join(tmpdir(), 'unified-patch-'));
  try {
    writeFileSync(path.join(dir, 'a'), before);
    writeFileSync(path.join(dir, 'b'), after);
    const args = ['diff', '--no-index', '--no-color', '-U3', 'a', 'b'];
    const run = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); // NOSONAR S4036 — git-from-PATH is the dev-tool contract
    const at = run.stdout.indexOf('\n@@');
    return at === -1 ? '' : run.stdout.slice(at + 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
