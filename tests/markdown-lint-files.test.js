import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const NPM_CLI =
  process.env.npm_execpath ||
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

test('lint:md:files checks only explicitly requested Markdown paths', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'fabricate-markdown-files-'));
  try {
    const valid = join(fixtureRoot, 'requested-valid.md');
    const invalid = join(fixtureRoot, 'unrequested-invalid.md');
    writeFileSync(valid, '# Valid\n');
    writeFileSync(invalid, '#Invalid\n');

    const ignored = spawnSync(process.execPath, [NPM_CLI, 'run', 'lint:md:files', '--', valid], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(
      ignored.status,
      0,
      `unrequested invalid Markdown should be ignored:\n${ignored.stdout}\n${ignored.stderr}`
    );

    const requested = spawnSync(
      process.execPath,
      [NPM_CLI, 'run', 'lint:md:files', '--', invalid],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      }
    );
    assert.notEqual(requested.status, 0, 'explicitly requested invalid Markdown should fail');
    assert.match(`${requested.stdout}\n${requested.stderr}`, /unrequested-invalid\.md/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
