/**
 * Regression gate: no module under `src/**` may re-hardcode the dnd5e/pf2e
 * player-character actor type (issue 1024).
 *
 * The player-character concept is now a GM-configurable set resolved by
 * `src/config/playerCharacterTypes.js`. Five sites used to test
 * `actor.type === 'character'` directly; each one was a Fallout `robot` PC missing from
 * a surface. A sixth spelling would reintroduce the bug in one surface only, which is
 * the hardest version to notice.
 *
 * ## Shapes matched, and why each one
 *
 * The gate matches ALL THREE quote styles — including the backtick, which is what a
 * template literal in a `.svelte` expression reaches for — and BOTH the optional-chained
 * (`actor?.type`) and UNCHAINED (`actor.type`) spellings. The unchained one is not
 * hypothetical: `PartyExpandedBody.svelte` was written that way, and a gate matching only
 * the optional-chained form would have repeated the exact defect that made an earlier
 * quantity gate vacuous.
 *
 * It anchors on the `.type` PROPERTY rather than merely on the string `'character'`,
 * because `GatheringTaskEditView.svelte` contains four `entry.kind === 'character'`
 * lines — an unrelated task-requirement entry kind, in a file with no actor logic. A
 * gate anchored on the bare string flags them, and the natural reaction is a file-level
 * allowlist, which would then exempt an entire module from the gate that polices it.
 *
 * ## Comments are stripped before scanning, deliberately
 *
 * The retired predicate is named in prose all over this codebase, because naming it is
 * how the design is DOCUMENTED — `// was: actor.type === 'character'` is the honest way
 * to record what a routed site used to do. A gate that flagged that would be answered
 * with a file-level allowlist, exempting exactly the modules it exists to police, so the
 * shared `stripComments` from `tests/helpers/sourceScan.js` blanks comment text first and
 * the synthetic corpora below prove both halves: a real literal is still found, a
 * comment-only mention is not.
 *
 * ## Known blind spot, recorded rather than papered over
 *
 * The gate sees the shapes enumerated in `SHAPES` and NOTHING else. Any spelling that is
 * not one of them is uncovered; constant-mediated access (a `const PC_TYPE = 'character'`
 * elsewhere, compared as `actor.type === PC_TYPE`) is the worked example rather than the
 * whole of it. The defence against that one is structural instead:
 * `playerCharacterTypes.js` owns the only legitimate home for the literal and exports the
 * predicate, so there is no reason to introduce such a constant. Treat `SHAPES` as the
 * whole coverage claim; a new spelling needs a new shape.
 *
 * ## Vacuity
 *
 * A mechanical check that cannot fail is worthless, so the scanner is factored as
 * `findActorTypeLiterals({ path: text })` and exercised in this same file against a
 * synthetic corpus: one with a real literal must return exactly one finding, and one
 * holding only the `entry.kind` near-miss (plus prose) must return none. Neutering the
 * scanner reds those cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { collectSources, repoRoot, stripComments } from './helpers/sourceScan.js';

const srcRoot = join(repoRoot, 'src');

// Hardcoded so GROWTH is a visible diff on a number rather than a new line in a list a
// reviewer skims past. The routed implementation leaves zero occurrences.
const EXPECTED_FINDING_COUNT = 0;

// All three quote characters are accepted everywhere a quoted `character` or `type` can
// appear, matching the `quoted path` shape in `quantity-literal-gate.test.js`. A backtick
// is not exotic in this codebase: `.svelte` expressions reach for template literals by
// habit, and `actor.type === `character`` is valid, readable, and would otherwise sail
// straight through.
const SHAPES = [
  // `actor.type === 'character'` and `actor?.type === "character"`.
  { name: 'dot access', pattern: /\??\.type\s*===\s*(['"`])character\1/ },
  // `actor['type'] === 'character'` — bracket access defeats a `.type` match.
  { name: 'bracket access', pattern: /\[\s*(['"`])type\1\s*]\s*===\s*(['"`])character\2/ },
  // `'character' === actor.type` — a reversed comparison reads the same to a human.
  {
    name: 'reversed comparison',
    pattern: /(['"`])character\1\s*===\s*[A-Za-z_$][\w$]*\??\.type\b/,
  },
];

/**
 * Scan a `{ path: text }` corpus for hardcoded player-character actor-type comparisons.
 *
 * Taking a corpus rather than reading the filesystem is what makes this gate testable:
 * the same function that polices `src/**` can be pointed at a synthetic corpus whose
 * expected verdict is known.
 *
 * @param {Record<string, string>} sources
 * @returns {Array<{path: string, line: number, shape: string, text: string}>}
 */
export function findActorTypeLiterals(sources) {
  const findings = [];
  for (const [path, text] of Object.entries(sources || {})) {
    const lines = stripComments(text).split('\n');
    lines.forEach((line, index) => {
      for (const shape of SHAPES) {
        if (shape.pattern.test(line)) {
          findings.push({ path, line: index + 1, shape: shape.name, text: line.trim() });
          break;
        }
      }
    });
  }
  return findings;
}

describe('the actor-type literal gate can actually fail', () => {
  it('reports exactly one finding for a corpus holding one real literal', () => {
    const findings = findActorTypeLiterals({
      'src/fake/one.js': [
        'function isPc(actor) {',
        "  return actor?.type === 'character';",
        '}',
      ].join('\n'),
    });
    assert.equal(findings.length, 1);
    assert.deepEqual(
      findings.map((finding) => [finding.path, finding.line, finding.shape]),
      [['src/fake/one.js', 2, 'dot access']]
    );
  });

  it('matches the UNCHAINED spelling and every quote style, including the backtick', () => {
    const findings = findActorTypeLiterals({
      // The PartyExpandedBody spelling. A gate that only matched `actor?.type` would
      // have let this exact line through.
      'src/fake/unchained.svelte': ".filter((actor) => actor.type === 'character')",
      'src/fake/double.js': 'if (actor.type === "character") return true;',
      // A template literal, which is what a `.svelte` expression reaches for by habit.
      'src/fake/backtick.svelte': '{#if actor.type === `character`}',
      'src/fake/backtick-bracket.js': 'if (actor[`type`] === `character`) return true;',
      'src/fake/backtick-reversed.js': 'if (`character` === actor.type) return true;',
    });
    assert.deepEqual(
      findings.map((finding) => finding.shape),
      ['dot access', 'dot access', 'dot access', 'bracket access', 'reversed comparison']
    );
  });

  it('matches bracket access and a reversed comparison', () => {
    const findings = findActorTypeLiterals({
      'src/fake/bracket.js': "if (actor['type'] === 'character') return true;",
      'src/fake/reversed.js': "if ('character' === actor.type) return true;",
    });
    assert.deepEqual(
      findings.map((finding) => finding.shape),
      ['bracket access', 'reversed comparison']
    );
  });

  it('does NOT flag the `entry.kind === \'character\'` near-miss', () => {
    const findings = findActorTypeLiterals({
      // Four real lines from GatheringTaskEditView.svelte's task-requirement entries.
      'src/fake/kind.svelte': [
        "  {#if entry.kind === 'character'}",
        "  const isCharacter = entry.kind === 'character';",
        "  disabled={entry.kind === 'character'}",
        '  // the character entry kind is unrelated to actor types',
      ].join('\n'),
      // The literal in its ONE legitimate home, which is a declaration and not a
      // comparison.
      'src/fake/home.js': "export const ALWAYS_PLAYER_CHARACTER_TYPE = 'character';",
    });
    assert.deepEqual(findings, []);
  });

  it('does NOT flag prose, which is how this design is DOCUMENTED', () => {
    // The earlier revision of this gate split raw text, so a comment naming the retired
    // predicate VERBATIM — the honest way to record what a routed site used to do — was a
    // finding. With `EXPECTED_FINDING_COUNT = 0` and no allowlist, the only ways out were
    // rewording the comment or gutting the gate.
    const findings = findActorTypeLiterals({
      'src/fake/prose.js': [
        '/**',
        " * The predicate used to be `actor.type === 'character'` at five sites, and the",
        " * `.svelte` one was written `actor?.type === \"character\"`.",
        ' */',
        "// was: return actor.type === 'character';",
        'export const isPc = (actor) => isPlayerCharacterActor(actor);',
        "const kept = 1; // legacy: 'character' === actor.type",
      ].join('\n'),
      'src/fake/prose.svelte': [
        '<script>',
        "  // filter was actor.type === 'character' before issue 1024",
        '  const rows = actors.filter((actor) => actor.isPlayerCharacter);',
        '</script>',
      ].join('\n'),
    });
    assert.deepEqual(findings, []);
  });

  it('still finds a REAL literal on a line that also carries a comment', () => {
    // The other half of the stripper contract: blanking comment text must not blank the
    // code that precedes it on the same line.
    const findings = findActorTypeLiterals({
      'src/fake/mixed.js': "if (actor.type === 'character') return true; // the old way",
    });
    assert.deepEqual(
      findings.map((finding) => [finding.line, finding.shape]),
      [[1, 'dot access']]
    );
  });
});

describe('src/** carries no hardcoded player-character actor type', () => {
  it(`has exactly ${EXPECTED_FINDING_COUNT} occurrence(s)`, () => {
    const findings = findActorTypeLiterals(collectSources(srcRoot));
    assert.deepEqual(
      findings.map((finding) => `${finding.path}:${finding.line}  ${finding.text}`),
      [],
      'the player-character concept is GM-configurable — import `isPlayerCharacterActor`' +
        ' from src/config/playerCharacterTypes.js (or, in a `.svelte` component, filter on' +
        ' a projected boolean) instead of comparing the actor type to a literal'
    );
    assert.equal(findings.length, EXPECTED_FINDING_COUNT);
  });

  it('scanned a real corpus — a gate that matched nothing would also pass vacuously', () => {
    const sources = collectSources(srcRoot);
    const paths = Object.keys(sources);
    assert.ok(paths.length > 200, `expected the whole src tree, scanned ${paths.length} files`);
    assert.ok(paths.includes('src/main.js'), 'including the module entry point');
    assert.ok(
      paths.includes('src/ui/svelte/apps/manager/PartyExpandedBody.svelte'),
      'and .svelte components, where the unchained spelling lived'
    );
  });
});
