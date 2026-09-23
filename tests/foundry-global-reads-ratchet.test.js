/**
 * Bare `game`/`ui`/`Hooks`/`CONFIG` reads in the domain layer, bounded per file (issue 1677).
 *
 * `eslint.config.js` arms `no-restricted-globals` on these roots; `eslint-debt.txt` switches it off
 * for the files not yet clean, and that disable is all-or-nothing — hence the ledger. The rule
 * sees BARE references alone, so the `globalThis.game?.…` reads here are out of scope.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { ESLint, Linter } from 'eslint';

import { DOMAIN_LAYER_ROOTS, DOMAIN_RESTRICTED_GLOBALS } from '../eslint.config.js';
import { ESLINT_DEBT } from '../eslint.debt.js';

import { byCodePoint, ceilingLedgerGate } from './helpers/ratchetBaseline.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';

const RULE = 'no-restricted-globals';

const LEDGER_PATH = resolve(import.meta.dirname, 'foundry-global-reads-ledger.txt');

const RUN = 'node --conditions=browser --test tests/foundry-global-reads-ratchet.test.js';

/** Below this the scan is truncated rather than clean; the domain layer holds ~268 modules. */
const SCAN_FLOOR = 201;

/** Enough rows that a truncated scan cannot regenerate the ledger down to a handful. */
const ROW_FLOOR = 8;

/** The gate's own rule options, imported rather than restated so the two cannot disagree. */
const LINT_CONFIG = Object.freeze({
  languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  rules: { [RULE]: ['error', ...DOMAIN_RESTRICTED_GLOBALS] },
});

/** Reports in one source, with a parse failure raised rather than counted as a clean zero. */
function readsIn(linter, file, text) {
  const messages = linter.verify(text, LINT_CONFIG, file);
  const fatal = messages.find((message) => message.fatal);
  if (fatal !== undefined) {
    throw new Error(`${file} failed to parse at line ${fatal.line}: ${fatal.message}`);
  }
  return messages.filter((message) => message.ruleId === RULE).length;
}

function buildLedger() {
  const linter = new Linter();
  const corpus = collectWorkingTreeSources(DOMAIN_LAYER_ROOTS, ['.js']);
  const entries = [];
  for (const [file, text] of Object.entries(corpus)) {
    const count = readsIn(linter, file, text);
    if (count > 0) entries.push([file, count]);
  }
  return {
    observed: Object.fromEntries(entries.sort(([left], [right]) => byCodePoint(left, right))),
    scanned: Object.keys(corpus).length,
  };
}

const gate = ceilingLedgerGate({
  test,
  assert,
  title: 'no domain file makes more bare Foundry-global reads than its ledger ceiling',
  ledgerPath: LEDGER_PATH,
  updateEnv: 'UPDATE_FOUNDRY_GLOBAL_READS_LEDGER',
  tightenEnv: 'TIGHTEN_FOUNDRY_GLOBAL_READS_LEDGER',
  build: buildLedger,
  // No headroom: the disable is all-or-nothing, so one more read is one more unbounded coupling.
  ceiling: (_key, reads) => reads,
  shrink: 'fail',
  floor: SCAN_FLOOR,
  wording: {
    subject: 'bare Foundry-global reads in the domain layer',
    update: `UPDATE_FOUNDRY_GLOBAL_READS_LEDGER=1 ${RUN}`,
    tighten: `TIGHTEN_FOUNDRY_GLOBAL_READS_LEDGER=1 ${RUN}`,
    addedHint:
      'A file cannot appear without also being added to `eslint-debt.txt`, since the rule is ' +
      'armed on these roots; that pair of edits is what needs justifying.',
    staleHint:
      'A file vanishes when its last read moves to an edge: drop its `no-restricted-globals` ' +
      'line from `eslint-debt.txt` and lower the srcRoot counts in `tests/lint-coverage.test.js` ' +
      'in the same change.',
  },
});

test('the ledger reports the figures issue 1677 measured', (t) => {
  // Floored rather than pinned: the exact targets live on #1656, and pinning them here makes
  // every banked read a second conflict site on top of the ledger row itself.
  if (gate.regenerated()) return t.skip('this run rewrote the ledger');
  // Read off the SCAN, not the committed file: a scan that stopped matching leaves the ledger
  // byte-identical, so a floor read off the file clears while nothing at all was measured.
  const { observed } = gate.current();
  const total = Object.values(observed).reduce((sum, count) => sum + count, 0);
  t.diagnostic(`${Object.keys(observed).length} debted domain files, ${total} bare reads`);
  assert.ok(
    Object.keys(observed).length > ROW_FLOOR,
    `only ${Object.keys(observed).length} debted files measured, below the floor of ${ROW_FLOOR}`
  );
});

test('the scan looked at the whole domain layer, not a truncated corpus', () => {
  // A ceiling bounds only what it observes, so an empty corpus meets every ceiling it was given.
  const corpus = collectWorkingTreeSources(DOMAIN_LAYER_ROOTS, ['.js']);
  assert.ok(
    Object.keys(corpus).length > 200,
    `only ${Object.keys(corpus).length} domain modules were read, against the ~268 here`
  );
  const roots = new Set(Object.keys(corpus).map((file) => file.split('/').slice(0, 2).join('/')));
  assert.deepEqual(
    [...roots].sort(byCodePoint),
    [...DOMAIN_LAYER_ROOTS].sort(byCodePoint),
    'every configured root still contributes a file'
  );
});

test('the ledger names exactly the files `eslint-debt.txt` exempts from the rule', () => {
  // A debt entry with no row is an unbounded exemption; a row with no entry fails `npm run lint`.
  const debted = Object.values(ESLINT_DEBT)
    .flatMap((group) => Object.entries(group))
    .filter(([, rules]) => rules.includes(RULE))
    .map(([file]) => file)
    .sort(byCodePoint);
  assert.deepEqual(
    Object.keys(gate.current().observed).sort(byCodePoint),
    debted,
    'the debted files and the counted files have diverged; both move together, both ways'
  );
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
  const armed = async (file) => {
    const config = await eslint.calculateConfigForFile(file);
    const entry = config.rules[RULE];
    return Array.isArray(entry) && entry[0] !== 0 && entry[0] !== 'off';
  };

  assert.equal(await armed('src/systems/GatheringEngine.js'), true, 'armed on a clean domain file');
  assert.equal(await armed('src/migration/MigrationRunner.js'), true, 'armed on a clean migration');
  assert.equal(
    await armed('src/systems/CraftingEngine.js'),
    false,
    'a debted file has the rule off; its count is held by the ledger instead'
  );
  assert.equal(await armed('src/main.js'), false, 'the module entry shell is an edge, not debt');
  // The entry's Foundry edge moved to `src/bootstrap/` (issue 1715) and is an edge there too, so
  // the directory is deliberately outside DOMAIN_LAYER_ROOTS. Paired with an existence check, so
  // this cannot answer `false` for a file that was never created.
  assert.equal(
    existsSync(resolve(repoRoot, 'src/bootstrap/hooks.js')),
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
  assert.equal(
    await armed('src/integrations/ItemPilesIntegration.js'),
    false,
    'the third-party integration layer is an edge'
  );
});
