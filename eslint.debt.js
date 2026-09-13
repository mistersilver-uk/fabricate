import { readFileSync } from 'node:fs';

/**
 * ESLINT_DEBT / ESLINT_TESTS_DEBT — the ratchet baseline for tests/lint-coverage.test.js.
 *
 * `npm run lint` is a GLOB now (issue #1660). It was an allowlist of about eighty hand-written
 * paths, and the trap that list carried is the one issue #933 was filed about: a file nobody
 * remembered to add was linted by nothing, and the miss surfaced at the slowest possible point —
 * SonarCloud, after push. A glob inverts that. A new file is gated the moment it lands, and going
 * ungated costs a deliberate, reviewable edit to this file.
 *
 * WHY RULES ARE DISABLED PER FILE RATHER THAN THE FILE IGNORED
 * -----------------------------------------------------------
 * An `ignores` entry is the cheaper thing to write and the wrong thing to ship. It takes the file
 * out of ESLint's reach entirely, so the file loses every rule — including the ones it passes
 * today. `src/main.js` is the example that settles it: it is not in the old gate, yet
 * `tests/main-undefined-identifiers.test.js` exists precisely because a `ReferenceError` shipped in
 * it past lint, tests and build, and that test runs `no-undef` over it by hand. Ignoring it here
 * would have deleted that coverage while the file-count went UP, which reads as progress in a diff
 * and is a regression in fact.
 *
 * So each entry names the rules that file violates TODAY, and nothing else. Every other rule stays
 * armed on it from the moment this lands. The debt then shrinks along two axes rather than one: a
 * file leaves when its last rule is fixed, and a rule leaves a file when that rule is fixed.
 *
 * `no-undef` MUST NEVER APPEAR HERE. It is the rule whose absence cost this repository a shipped
 * runtime error, and it is clean across every file below. `tests/lint-coverage.test.js` asserts
 * that rather than trusting this sentence.
 *
 * HOW THE COUNTS WORK
 * -------------------
 * Each group pins its file count and its (file, rule) pair count EXACTLY, not as a ceiling — the
 * same shape, and for the same reason, as the exactly-pinned baseline counts this repository
 * already uses (`tests/design-system-primitives.test.js` states the argument in full). A `<=` ceiling banks a free slot on every debt
 * payment: fix a file, drop its entry, and the next author can append instead of fixing and still
 * pass. Pinning exactly makes both directions a visible edit to a number.
 *
 * The groups are segmented rather than flattened so the numbers keep their meaning. `scripts` is
 * 15 files, and 15 is a number a reviewer of this repository has been trained to read — it is the
 * same fifteen the retired `KNOWN_UNGATED_SCRIPTS` carried from issue #933 until #1660 folded it
 * in here, and `scripts/foundry-test-run.mjs`
 * is still the reason it is not smaller. Folded into one ~89-entry total, a `scripts/` regression
 * would be invisible.
 *
 * Paths are POSIX always; `tests/lint-coverage.test.js` normalises before comparing.
 */
/**
 * The ledger, as `<target>\t<rule>` lines.
 *
 * A TEXT FILE and not a JavaScript table, which is a SonarCloud constraint rather than taste. The
 * table form was 637 lines of `'unicorn/…',` literals in alphabetical order, so files failing
 * overlapping rule sets produced long identical token runs: 7.7% duplication on new code against a
 * 3% gate. `sonar.cpd.exclusions` cannot answer that — it is inert under Automatic Analysis — and
 * Sonar does not analyse `.txt` at all. It also puts this alongside `tests/comment-share-ledger.txt`,
 * `tests/source-pin-ledger.txt` and `tests/file-size-ledger.txt`, which are the same shape for the
 * same reason.
 *
 * The target is a repository-relative POSIX path, except for `tests/**\/*.js`, which stands for the
 * whole test tree — see ESLINT_TESTS_DEBT below.
 */
const LEDGER = readFileSync(new URL('eslint-debt.txt', import.meta.url), 'utf8');

/** Which group a target belongs to. Derived from the path, never stored, so it cannot disagree. */
function groupOf(target) {
  if (target.startsWith('scripts/')) return 'scripts';
  if (target.startsWith('src/ui/')) return 'srcUi';
  if (target.startsWith('src/')) return 'srcRoot';
  if (target.startsWith('examples/')) return 'examples';
  return 'rootConfig';
}

const entries = LEDGER.split('\n')
  .filter((line) => line.trim() !== '' && !line.startsWith('#'))
  .map((line) => {
    const tab = line.lastIndexOf('\t');
    if (tab === -1) throw new Error(`eslint-debt.txt line is not tab-separated: ${line}`);
    return [line.slice(0, tab), line.slice(tab + 1)];
  });

const TESTS_TARGET = 'tests/**/*.js';

/** Per-file debt, grouped. `{ scripts: { 'scripts/x.mjs': ['rule', …] }, … }` */
export const ESLINT_DEBT = { scripts: {}, srcUi: {}, srcRoot: {}, examples: {}, rootConfig: {} };
for (const [target, rule] of entries) {
  if (target === TESTS_TARGET) continue;
  const group = ESLINT_DEBT[groupOf(target)];
  (group[target] ??= []).push(rule);
}

/**
 * WHICH `tests/**` RULES WERE FIXED RATHER THAN BASELINED, AND WHY THE REST WERE NOT.
 *
 * "887 of 1,040 files report something" is an aggregate, and an aggregate is not a reason for any
 * individual rule. Several of the rules this list would have carried are correctness rules whose
 * absence lets a broken test read green, which is the defect class this whole epic is about. Those
 * were measured one by one and fixed, not baselined — six rules, twelve occurrences:
 *
 *   - `no-dupe-keys` (1). A literal `toolIds: []` written twice in one fixture. The first is
 *     silently dropped, so a duplicated key in an expectation object asserts only the later value.
 *   - `no-useless-escape` (1). `new RegExp(`${prop}\s*=`)` inside a TEMPLATE LITERAL, where a
 *     single backslash is a string escape: the pattern was `showIdentitys*=` and had matched
 *     nothing since it was written. An assertion passing for the wrong reason, and the exact thing
 *     a glob gate is for. Fixed; the corrected assertion still holds.
 *   - `no-sparse-arrays` (1), `no-useless-assignment` (3), `no-regex-spaces` (5),
 *     `unicorn/no-unused-array-method-return` (1). Dead initialisers, a hole in a fallback array,
 *     and intentional literal spacing — none a live bug, all one-line fixes.
 *
 * Two were looked at and deliberately LEFT on the list, with their counts, so the next reader does
 * not have to re-derive them:
 *
 *   - `unicorn/no-invalid-argument-count` (201). Too many to triage inside a tooling change, and
 *     the reports are dominated by test doubles whose arity legitimately differs from the real
 *     function's.
 *   - `unicorn/no-incorrect-template-string-interpolation` (17). A false positive here: the
 *     literals are SVELTE MARKUP fixtures, where `scope={scope}` is the component syntax under
 *     test and not a missing `$`. Fixing it would mean corrupting the fixtures.
 *
 *
 * The rules `tests/**` does not pass yet, disabled across that tree as one list.
 *
 * Per-file entries are right for the 89 files above and wrong here: 887 of the 1,040 test files
 * report something, so a per-file baseline would be a thousand-entry table that nobody reads and
 * every new test edits. A single rule list is the honest shape for a tree the old gate did not
 * lint AT ALL.
 *
 * What this buys, and it is not nothing: every rule NOT on this list is now enforced across
 * `tests/**` for the first time — `no-undef` among them, which is absent here because the tree is
 * already clean of it. The list only shrinks.
 */
export const ESLINT_TESTS_DEBT = entries
  .filter(([target]) => target === TESTS_TARGET)
  .map(([, rule]) => rule);
