import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SETTING_KEYS } from '../src/config/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

test('harvesting has no standalone runtime, app, store, or setting surface', () => {
  const sourceFiles = listFiles(resolve(repoRoot, 'src'))
    .filter(path => ['.js', '.svelte'].includes(extname(path)));
  const relativeSourcePaths = sourceFiles.map(path => relative(repoRoot, path));

  for (const path of relativeSourcePaths) {
    assert.doesNotMatch(
      path,
      /harvesting/i,
      `harvesting must not be introduced as a standalone source file: ${path}`
    );
  }

  const source = sourceFiles.map(path => readFileSync(path, 'utf8')).join('\n');
  for (const forbidden of [
    /\bHarvestingEngine\b/,
    /\bHarvestingRunManager\b/,
    /\bGatheringHarvestingEngine\b/,
    /\bSvelteHarvestingApp\b/,
    /\bharvestingStore\b/,
    /\bregisterSvelteHarvestingApp\b/,
    /\bgetHarvestingAppClass\b/,
    /\bstartHarvestingAttempt\b/,
    /\blistHarvestingForActor\b/,
    /\bharvestingRuns\b/,
    /\bharvestingEnvironments\b/,
    /\blastHarvestingActor\b/
  ]) {
    assert.doesNotMatch(source, forbidden, `forbidden standalone harvesting surface matched ${forbidden}`);
  }

  assert.equal(Object.hasOwn(SETTING_KEYS, 'GATHERING_ENVIRONMENTS'), true);
  assert.equal(Object.hasOwn(SETTING_KEYS, 'LAST_GATHERING_ACTOR'), true);
  for (const key of Object.keys(SETTING_KEYS)) {
    assert.doesNotMatch(key, /HARVEST/i);
  }
  for (const value of Object.values(SETTING_KEYS)) {
    assert.doesNotMatch(value, /harvest/i);
  }
});

test('canonical docs keep harvesting modeled through recipes or component salvage', () => {
  const spec = readFileSync(resolve(repoRoot, 'openspec/specs/gathering-and-harvesting/spec.md'), 'utf8');
  const domain = readFileSync(resolve(repoRoot, 'DOMAIN.md'), 'utf8');
  const systemManager = readFileSync(resolve(repoRoot, 'src/systems/CraftingSystemManager.js'), 'utf8');

  assert.match(spec, /This spec does not introduce:\s*\n\s*- a standalone harvesting subsystem/);
  assert.match(spec, /A recipe whose ingredient is the harvested component\./);
  assert.match(spec, /A salvage definition on the harvested component\./);
  assert.match(domain, /\*\*Harvesting\*\*[\s\S]*recipe or a component salvage definition/);

  assert.match(systemManager, /features\.salvage/);
  assert.match(systemManager, /_normalizeSalvage\(salvage = \{\}, options = \{\}\)/);
  assert.match(systemManager, /salvage\.resultGroups/);
});

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}
