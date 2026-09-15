/**
 * Bare `game`/`ui`/`Hooks`/`CONFIG` reads in the domain layer, pinned per file (issue 1677).
 *
 * `eslint.config.js` arms `no-restricted-globals` on these roots; `eslint-debt.txt` switches it off
 * for the 13 files not yet clean, and that disable is all-or-nothing — hence the pinned count. The
 * rule sees BARE references alone, so the 92 `globalThis.game?.…` reads here are out of scope.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { ESLint, Linter } from 'eslint';

import { DOMAIN_LAYER_ROOTS, DOMAIN_RESTRICTED_GLOBALS } from '../eslint.config.js';
import { ESLINT_DEBT } from '../eslint.debt.js';

import { byCodePoint, pinnedLedgerGate } from './helpers/ratchetBaseline.js';
import { collectWorkingTreeSources } from './helpers/sourceScan.js';

const RULE = 'no-restricted-globals';

const LEDGER_PATH = resolve(import.meta.dirname, 'foundry-global-reads-ledger.txt');

const REGENERATE =
  'UPDATE_FOUNDRY_GLOBAL_READS_LEDGER=1 node --conditions=browser --test ' +
  'tests/foundry-global-reads-ratchet.test.js, then review the diff';

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
  return Object.fromEntries(entries.sort(([left], [right]) => byCodePoint(left, right)));
}

const gate = pinnedLedgerGate({
  test,
  assert,
  title: 'the domain-layer bare-global ledger matches the pinned baseline exactly',
  ledgerPath: LEDGER_PATH,
  regenerateEnv: 'UPDATE_FOUNDRY_GLOBAL_READS_LEDGER',
  build: buildLedger,
  subject: 'bare Foundry-global reads in the domain layer',
  regenerate: REGENERATE,
  structuralHint:
    'A file cannot appear without also being added to `eslint-debt.txt`, since the rule is ' +
    'armed on these roots; that pair of edits is what needs justifying. A file vanishes when ' +
    'its last read moves to an edge: drop its `no-restricted-globals` line from ' +
    '`eslint-debt.txt` and lower the srcRoot counts in `tests/lint-coverage.test.js` too.',
  roseHint: 'means a debted file took on more coupling behind its own disable',
  fellHint: 'needs the ledger lowered to bank the reads that moved to an edge',
});

test('the ledger reports the figures issue 1677 measured', (t) => {
  if (gate.regenerated()) return t.skip('this run rewrote the ledger');
  const pinned = gate.pinned();
  const total = Object.values(pinned).reduce((sum, count) => sum + count, 0);
  assert.equal(Object.keys(pinned).length, 13, 'domain files with a bare Foundry-global read');
  // 140 as of issue 1648. The versioned run lifecycle added 20 reads to `CraftingEngine.js`
  // and 3 to `CraftingRunManager.js`, all of them the idiom those files already use behind
  // their own disable: `game.fabricate?.getX?.()` service lookups, `game.users?.get?.()`
  // and `game.time?.worldTime`.
  //
  // Recorded as debt rather than absorbed, which is what this gate is for. The remedy is
  // the one issue 1677 already names -- move the reads to an edge -- and for these the edge
  // exists: `src/main.js` already wires every one of these services into the projection,
  // so the engine can take them as collaborators instead of reaching for them. That is a
  // wide change across a 9,800-line file, and bundling it into a delivery the maintainer
  // is waiting on is how this work has introduced defects before.
  assert.equal(total, 140, 'bare reads across them');
});

test('the scan looked at the whole domain layer, not a truncated corpus', () => {
  // An exact ledger over an empty corpus agrees with an empty ledger and reports itself satisfied.
  const corpus = collectWorkingTreeSources(DOMAIN_LAYER_ROOTS, ['.js']);
  assert.ok(
    Object.keys(corpus).length > 200,
    `only ${Object.keys(corpus).length} domain modules were read, against the ~259 here`
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
    Object.keys(gate.current()).sort(byCodePoint),
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
  assert.equal(
    await armed('src/ui/svelte/util/foundryBridge.js'),
    false,
    'the bridge exists to make these globals reachable'
  );
  assert.equal(
    await armed('src/integrations/ItemPilesIntegration.js'),
    false,
    'the third-party integration layer is an edge'
  );
});
