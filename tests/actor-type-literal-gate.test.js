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
 * The gate matches BOTH quote styles and BOTH the optional-chained (`actor?.type`) and
 * UNCHAINED (`actor.type`) spellings. The unchained one is not hypothetical:
 * `PartyExpandedBody.svelte` was written that way, and a gate matching only the
 * optional-chained form would have repeated the exact defect that made an earlier
 * quantity gate vacuous.
 *
 * It anchors on the `.type` PROPERTY rather than merely on the string `'character'`,
 * because `GatheringTaskEditView.svelte` contains four `entry.kind === 'character'`
 * lines — an unrelated task-requirement entry kind, in a file with no actor logic. A
 * gate anchored on the bare string flags them, and the natural reaction is a file-level
 * allowlist, which would then exempt an entire module from the gate that polices it.
 *
 * ## Known blind spot, recorded rather than papered over
 *
 * No literal scan can see constant-mediated access — a `const PC_TYPE = 'character'`
 * somewhere else, compared as `actor.type === PC_TYPE`. Nothing here covers that. The
 * defence is structural instead: `playerCharacterTypes.js` owns the only legitimate
 * home for the literal and exports the predicate, so there is no reason to introduce
 * such a constant. Do not assume the scan covers it.
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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const srcRoot = join(repoRoot, 'src');
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.svelte'];

// Hardcoded so GROWTH is a visible diff on a number rather than a new line in a list a
// reviewer skims past. The routed implementation leaves zero occurrences.
const EXPECTED_FINDING_COUNT = 0;

const SHAPES = [
  // `actor.type === 'character'` and `actor?.type === "character"`.
  { name: 'dot access', pattern: /\??\.type\s*===\s*(['"])character\1/ },
  // `actor['type'] === 'character'` — bracket access defeats a `.type` match.
  { name: 'bracket access', pattern: /\[\s*(['"])type\1\s*]\s*===\s*(['"])character\2/ },
  // `'character' === actor.type` — a reversed comparison reads the same to a human.
  {
    name: 'reversed comparison',
    pattern: /(['"])character\1\s*===\s*[A-Za-z_$][\w$]*\??\.type\b/,
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
    const lines = String(text ?? '').split('\n');
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

function collectSources(dir) {
  const sources = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      Object.assign(sources, collectSources(full));
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      sources[relative(repoRoot, full).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
    }
  }
  return sources;
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

  it('matches the UNCHAINED spelling and the double-quoted one', () => {
    const findings = findActorTypeLiterals({
      // The PartyExpandedBody spelling. A gate that only matched `actor?.type` would
      // have let this exact line through.
      'src/fake/unchained.svelte': ".filter((actor) => actor.type === 'character')",
      'src/fake/double.js': 'if (actor.type === "character") return true;',
    });
    assert.equal(findings.length, 2);
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

  it('does NOT flag the `entry.kind === \'character\'` near-miss, or prose', () => {
    const findings = findActorTypeLiterals({
      // Four real lines from GatheringTaskEditView.svelte's task-requirement entries.
      'src/fake/kind.svelte': [
        "  {#if entry.kind === 'character'}",
        "  const isCharacter = entry.kind === 'character';",
        "  disabled={entry.kind === 'character'}",
        '  // the character entry kind is unrelated to actor types',
      ].join('\n'),
      // Prose naming the retired literal, which is how the design is DOCUMENTED.
      'src/fake/prose.js': [
        '/**',
        " * The predicate used to be `actor.type` compared against the character type.",
        ' * It is now resolved from a configurable set.',
        ' */',
        "const ALWAYS_PLAYER_CHARACTER_TYPE = 'character';",
      ].join('\n'),
    });
    assert.deepEqual(findings, []);
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
