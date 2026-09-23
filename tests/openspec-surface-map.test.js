/**
 * A surface-map table routes readers from an index spec to its siblings (issue 1937).
 * `openspec/README.md` makes it navigational and never normative, which only holds while the route
 * runs both ways: a renamed shard or section orphans a row silently, and a shard no row names is
 * reachable only by guessing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specsRoot = join(repoRoot, 'openspec/specs');
const indexSpec = 'ui-integration/spec.md';
const HEADING = /^#{1,6} (.*)$/u;
const BACKTICKED = /`([^`]+)`/gu;
const DELIMITER_ROW = /^\|[\s:|-]+\|$/u;

/** The rows under the `## Surface Map` heading, as `{ spec, sections }`. */
function surfaceMapRows(source) {
  const lines = source.split('\n');
  const start = lines.indexOf('## Surface Map');
  assert.notEqual(start, -1, 'the index no longer carries a "## Surface Map" heading');
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    if (!line.startsWith('|') || DELIMITER_ROW.test(line)) continue;
    const cells = line.split('|').slice(1, -1);
    const spec = [...(cells[0] ?? '').matchAll(BACKTICKED)].map(([, value]) => value)[0];
    const sections = [...(cells[1] ?? '').matchAll(BACKTICKED)].map(([, value]) => value);
    if (spec) rows.push({ spec, sections });
  }
  return rows;
}

/** Every `<dir>/spec.md` in the corpus, so a second index is guarded exactly like the first. */
function everySpec() {
  return readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${entry.name}/spec.md`)
    .filter((spec) => existsSync(join(specsRoot, spec)));
}

const carriesSurfaceMap = (spec) =>
  readFileSync(join(specsRoot, spec), 'utf8').split('\n').includes('## Surface Map');

/** Why a row fails to route: a missing sibling, no section named, or a section that has moved. */
function rowOffences(rows) {
  const offences = [];
  for (const { spec, sections } of rows) {
    const sibling = join(specsRoot, spec);
    if (!existsSync(sibling)) {
      offences.push(`${spec} does not exist`);
      continue;
    }
    if (sections.length === 0) {
      offences.push(`${spec} is routed to without naming a section`);
      continue;
    }
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
  return offences;
}

describe('openspec surface-map tables resolve', () => {
  it('the parser reads a table, refuses one that is not there, and survives a short row', () => {
    const parsed = surfaceMapRows('## Surface Map\n\n| A | B |\n| --- | --- |\n| `x/spec.md` | `H` |');
    assert.deepEqual(parsed, [{ spec: 'x/spec.md', sections: ['H'] }]);
    assert.deepEqual(surfaceMapRows('## Surface Map\n\n## Next\n\n| `y/spec.md` | `H` |'), []);
    assert.throws(() => surfaceMapRows('# Nothing here'));
    assert.deepEqual(surfaceMapRows('## Surface Map\n\n|:---|---:|\n| `z/spec.md` |'), [
      { spec: 'z/spec.md', sections: [] },
    ]);
    assert.deepEqual(rowOffences([{ spec: indexSpec, sections: [] }]), [
      `${indexSpec} is routed to without naming a section`,
    ]);
  });

  it('every surface-map row in the corpus names a real sibling and heading', () => {
    const indexes = everySpec().filter(carriesSurfaceMap);
    assert.ok(indexes.includes(indexSpec), `${indexSpec} no longer carries a surface map`);
    const offences = [];
    for (const spec of indexes) {
      const rows = surfaceMapRows(readFileSync(join(specsRoot, spec), 'utf8'));
      if (spec === indexSpec) {
        assert.ok(rows.length >= 9, `expected the nine surface specs, read ${rows.length} rows`);
      }
      offences.push(...rowOffences(rows).map((offence) => `${spec}: ${offence}`));
    }
    assert.deepEqual(offences, [], `surface-map rows no longer resolve:\n${offences.join('\n')}`);
  });

  it('every ui shard is routed by a surface map and listed in the spec index', () => {
    const shards = readdirSync(specsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('ui-'))
      .map((entry) => `${entry.name}/spec.md`)
      .filter((spec) => spec !== indexSpec && existsSync(join(specsRoot, spec)));
    assert.ok(shards.length >= 9, `expected the nine surface specs, read ${shards.length}`);
    const routed = new Set(
      everySpec()
        .filter(carriesSurfaceMap)
        .flatMap((spec) => surfaceMapRows(readFileSync(join(specsRoot, spec), 'utf8')))
        .map(({ spec }) => spec)
    );
    const listed = readFileSync(join(specsRoot, 'README.md'), 'utf8');
    const unrouted = shards.filter((spec) => !routed.has(spec));
    const unlisted = shards.filter((spec) => !listed.includes(`\`${spec}\``));
    assert.deepEqual(unrouted, [], `no surface map routes to:\n${unrouted.join('\n')}`);
    assert.deepEqual(unlisted, [], `openspec/specs/README.md does not list:\n${unlisted.join('\n')}`);
  });
});
