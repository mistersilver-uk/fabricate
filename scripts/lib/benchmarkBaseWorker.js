/**
 * `node benchmarkBaseWorker.js <treeDir> <outFile> [profile,...]`: measure the class-1 counts of the
 * tree at `treeDir` with that tree's own runner, fixtures and `src`, and write `class1ByProfile` as
 * JSON to `outFile`. Profiles default to the tree's own swept list. Spawned by `benchmarkBase.js`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [treeDir, outFile, profileList] = process.argv.slice(2);
if (!treeDir || !outFile)
  throw new Error('usage: benchmarkBaseWorker.js <treeDir> <outFile> [profiles]');

const load = (path) => import(pathToFileURL(join(treeDir, path)).href);
const { measureProfiles } = await load('scripts/lib/benchmarkRunner.js');
const { DEFAULT_SEED, SWEPT_SCALE_PROFILE_NAMES } = await load(
  'tests/helpers/scale/scaleProfiles.js'
);

const { class1ByProfile } = await measureProfiles({
  profiles: profileList ? profileList.split(',') : [...SWEPT_SCALE_PROFILE_NAMES],
  seed: DEFAULT_SEED,
  reps: 0,
});
writeFileSync(outFile, JSON.stringify(class1ByProfile));
