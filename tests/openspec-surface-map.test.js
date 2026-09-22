/**
 * A surface-map table routes readers from an index spec to its siblings (issue 1937).
 * `openspec/README.md` makes it navigational and never normative, which only holds while every row
 * still resolves: a renamed shard or a renamed section otherwise orphans a row silently.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specsRoot = join(repoRoot, 'openspec/specs');
const indexPath = join(specsRoot, 'ui-integration/spec.md');
const HEADING = /^#{1,6} (.*)$/u;
const BACKTICKED = /`([^`]+)`/gu;

/** The rows under the `## Surface Map` heading, as `{ spec, sections }`. */
function surfaceMapRows(source) {
  const lines = source.split('\n');
  const start = lines.indexOf('## Surface Map');
  assert.notEqual(start, -1, 'the index no longer carries a "## Surface Map" heading');
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1);
    const spec = [...cells[0].matchAll(BACKTICKED)].map(([, value]) => value)[0];
    const sections = [...cells[1].matchAll(BACKTICKED)].map(([, value]) => value);
    if (spec) rows.push({ spec, sections });
  }
  return rows;
}

describe('openspec surface-map tables resolve', () => {
  it('the parser reads a table and refuses one that is not there', () => {
    const parsed = surfaceMapRows('## Surface Map\n\n| A | B |\n| --- | --- |\n| `x/spec.md` | `H` |');
    assert.deepEqual(parsed, [{ spec: 'x/spec.md', sections: ['H'] }]);
    assert.deepEqual(surfaceMapRows('## Surface Map\n\n## Next\n\n| `y/spec.md` | `H` |'), []);
    assert.throws(() => surfaceMapRows('# Nothing here'));
  });

  it('every row of the ui-integration surface map names a real sibling and heading', () => {
    const rows = surfaceMapRows(readFileSync(indexPath, 'utf8'));
    assert.ok(rows.length >= 9, `expected the nine surface specs, read ${rows.length} rows`);
    const offences = [];
    for (const { spec, sections } of rows) {
      const sibling = join(specsRoot, spec);
      if (!existsSync(sibling)) {
        offences.push(`${spec} does not exist`);
        continue;
      }
      assert.ok(sections.length > 0, `${spec} is routed to without naming a section`);
      const headings = new Set(
        readFileSync(sibling, 'utf8')
          .split('\n')
          .map((line) => HEADING.exec(line)?.[1])
          .filter(Boolean)
      );
      for (const section of sections) {
        if (!headings.has(section)) offences.push(`${spec} has no heading "${section}"`);
      }
    }
    assert.deepEqual(offences, [], `surface-map rows no longer resolve:\n${offences.join('\n')}`);
  });
});
