#!/usr/bin/env node
/**
 * The PR capture's shard plan and merge (see `scripts/lib/viewLabShards.js`).
 *
 * Commands:
 *   plan  <ids> <has_ui>                  print the render matrix as JSON: [{shard, ids}]
 *   merge <ids> <shards-dir> <output-dir> merge every shard's frames and manifest into one
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { getCaseById } from './lib/viewLabCases.js';
import { mergeShardManifests, shardCountFor, sliceSelection } from './lib/viewLabShards.js';

const splitIds = (text) =>
  String(text ?? '')
    .split(',')
    .filter(Boolean);

function commandPlan([idText, hasUi]) {
  const cases = splitIds(idText).map((id) => {
    const viewCase = getCaseById(id);
    if (!viewCase) throw new Error(`no publishable case matches: ${id}`);
    return viewCase;
  });
  // An unarmed gate renders nothing, so one runner does the chrome verification alone.
  const count = hasUi === 'true' ? shardCountFor(cases.length) : Math.min(1, cases.length);
  const matrix = sliceSelection(cases, count).map((ids, index) => ({
    shard: index + 1,
    ids: ids.join(','),
  }));
  process.stdout.write(JSON.stringify(matrix));
}

function commandMerge([idText, shardsDir, outputDir]) {
  const shardDirs = readdirSync(shardsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(shardsDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
  const manifests = shardDirs.map((dir) => ({
    dir,
    manifest: JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')),
  }));
  const merged = mergeShardManifests(
    splitIds(idText),
    manifests.map(({ manifest }) => manifest)
  );

  mkdirSync(outputDir, { recursive: true });
  for (const { dir, manifest } of manifests) {
    for (const frame of manifest.frames ?? []) {
      const source = join(dir, `${frame.id}.png`);
      if (!existsSync(source)) throw new Error(`${dir} lists ${frame.id} but holds no PNG for it`);
      copyFileSync(source, join(outputDir, `${frame.id}.png`));
    }
  }
  writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `merged ${merged.frames.length} frames and ${merged.failures.length} failures ` +
      `from ${manifests.length} shard(s) into ${outputDir}`
  );
}

const COMMANDS = { plan: commandPlan, merge: commandMerge };
const command = COMMANDS[process.argv[2]];
if (command) {
  try {
    command(process.argv.slice(3));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  console.error(
    `unknown command "${process.argv[2]}"; expected one of ${Object.keys(COMMANDS).join(', ')}`
  );
  process.exitCode = 1;
}
