/**
 * Bare `game`/`ui`/`Hooks`/`CONFIG` reads in the domain layer (issue 1677). `eslint.config.js` arms
 * `no-restricted-globals` on these roots and `npm run lint` holds each file's count at its base
 * value. The rule sees BARE references alone, so `globalThis.game?.…` reads are out of scope.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ESLint, Linter } from 'eslint';

import config, { DOMAIN_LAYER_ROOTS, DOMAIN_RESTRICTED_GLOBALS } from '../eslint.config.js';
import { lintAgainstBase } from '../scripts/lib/newViolations.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const RULE = 'no-restricted-globals';

/** Below this the scan is truncated rather than whole; the domain layer holds ~268 modules. */
const SCAN_FLOOR = 201;

/** The gate's own rule options, imported rather than restated so the two cannot disagree. */
const LINT_CONFIG = Object.freeze({
  languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  rules: { [RULE]: ['error', ...DOMAIN_RESTRICTED_GLOBALS] },
});

async function isArmed(eslint, file) {
  const entry = (await eslint.calculateConfigForFile(file)).rules[RULE];
  return Array.isArray(entry) && entry[0] !== 0 && entry[0] !== 'off';
}

test('the rule is armed on every module of the whole domain layer', async () => {
  // A scope bounds only what it covers, so an empty corpus would pass every assertion below.
  const corpus = Object.keys(collectWorkingTreeSources(DOMAIN_LAYER_ROOTS, ['.js']));
  assert.ok(corpus.length >= SCAN_FLOOR, `only ${corpus.length} domain modules, against ~268`);
  const roots = new Set(corpus.map((file) => file.split('/').slice(0, 2).join('/')));
  assert.deepEqual(
    [...roots].sort(byCodePoint),
    [...DOMAIN_LAYER_ROOTS].sort(byCodePoint),
    'every configured root still contributes a file'
  );
  const eslint = new ESLint();
  const unarmed = [];
  for (const file of corpus) if (!(await isArmed(eslint, file))) unarmed.push(file);
  assert.deepEqual(unarmed, [], 'a domain file with the rule off is a read nothing counts');
});

test('npm run lint fails one more bare read in a file that already has some', async () => {
  const repo = createTempGitRepo('fab-foundry-reads-');
  try {
    const file = 'src/systems/Debted.js';
    const read = (name) => `export function ${name}() {\n  return game.user;\n}\n`;
    repo.write({ [file]: read('first') });
    const base = repo.commitAll('base');
    repo.write({ [file]: `${read('first')}${read('second')}` });
    const domainBlocks = config.filter((block) => block.rules?.[RULE]);
    assert.ok(domainBlocks.length > 0, 'the real config still arms the rule somewhere');
    const outcome = await lintAgainstBase({
      cwd: repo.dir,
      env: { RATCHET_BASE: base },
      eslintOptions: {
        overrideConfigFile: true,
        overrideConfig: [{ languageOptions: LINT_CONFIG.languageOptions }, ...domainBlocks],
      },
    });
    assert.deepEqual(outcome.failures, [`${file}: ${RULE} rose from 1 to 2 (line 2, 5)`]);
  } finally {
    repo.dispose();
  }
});

test('the rule reports each restricted name, and resolves scope rather than text', () => {
  const linter = new Linter();
  const verify = (code) => linter.verify(code, LINT_CONFIG, 'src/systems/fixture.js');

  for (const restricted of DOMAIN_RESTRICTED_GLOBALS) {
    const reports = verify(`export const probe = ${restricted.name}.id;`);
    assert.equal(reports.length, 1, `a bare \`${restricted.name}\` read must report`);
    assert.equal(reports[0].ruleId, RULE);
    assert.ok(
      reports[0].message.includes(restricted.message),
      `the report must carry the rule's guidance: ${reports[0].message}`
    );
  }

  assert.equal(
    verify('const game = { user: 1 };\nexport const probe = game.user;').length,
    0,
    'a local binding of the same name is not a Foundry global'
  );
  assert.equal(
    verify('export const probe = globalThis.game?.user;').length,
    0,
    'the `globalThis.`-qualified form is out of scope, asserted so the gap stays a known fact'
  );
});

test('the rule is armed on the domain layer and absent from the sanctioned edges', async () => {
  // The scope IS the allow-list: every edge already lies outside these roots, so nothing in them
  // is exempt on purpose. An edge moved in, or a root dropped from the glob, reds here.
  const eslint = new ESLint();
  const armed = (file) => isArmed(eslint, file);

  assert.equal(await armed('src/systems/GatheringEngine.js'), true, 'armed on a clean domain file');
  assert.equal(await armed('src/migration/MigrationRunner.js'), true, 'armed on a clean migration');
  assert.equal(
    await armed('src/systems/CraftingEngine.js'),
    true,
    'armed on a file with bare reads too; `npm run lint` holds its count at base'
  );
  assert.equal(await armed('src/main.js'), false, 'the module entry shell is an edge, not debt');
  // The entry's Foundry edge moved to `src/bootstrap/` (issue 1715) and is an edge there too, so
  // the directory is deliberately outside DOMAIN_LAYER_ROOTS. Paired with an existence check, so
  // this cannot answer `false` for a file that was never created.
  assert.equal(
    existsSync(path.resolve(repoRoot, 'src/bootstrap/hooks.js')),
    true,
    'the hooks edge exists, so the assertion below is about a real file'
  );
  assert.equal(
    await armed('src/bootstrap/hooks.js'),
    false,
    'the relocated module entry edge is an edge, not debt'
  );
  assert.equal(
    await armed('src/ui/svelte/util/foundryHooks.js'),
    false,
    'the bridge exists to make these globals reachable'
  );
});
