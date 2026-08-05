/**
 * Guard: every literal `FABRICATE.*` key referenced anywhere in `src/**` is
 * checked two ways.
 *
 * Assertion A (universal, admits objects): every `FABRICATE.<seg>(.<seg>)*`
 * literal appearing anywhere in `src/**` source text must resolve to
 * SOMETHING in `lang/en.json` — a string leaf OR a namespace object consumed
 * as `` `${BASE}.${suffix}` ``. This is the half that catches a key that
 * renders as a raw dotted path or a hardcoded fallback (issues 664/665, and
 * the `name:`/`hint:` gap in issue #885 — `src/config/settings.js` registers
 * the theme setting outside `src/ui`, in a shape none of the four patterns
 * below match).
 *
 * One base is deliberately EXCLUDED from assertion A: a literal immediately
 * continued by an interpolation (a trailing `${`) has an incomplete final
 * segment — `ToolValidationTab.svelte` builds
 * `` `FABRICATE.Admin.Manager.Tools.Editor.Check${check.id[0].toUpperCase()}${check.id.slice(1)}` ``,
 * whose captured text `…Editor.Check` is not a key and never will be; the
 * real keys are `…Editor.CheckSomething`. Without the exclusion this reports
 * as a false missing key. A base that merely ENDS at a dot boundary (e.g.
 * `recipeItemAccessBadge.js`'s `'FABRICATE.Admin.Manager.RecipeItem.Preview.'`)
 * is NOT excluded — the regex captures it WITHOUT the trailing dot, it
 * resolves to an object, and it is admitted by assertion A on its own terms.
 *
 * Assertion B (narrow, retained): a LEAF reference in one of four specific
 * shapes must resolve to a STRING, not merely something. This is the
 * namespace-shadowing detector — a string occupying a namespace slot
 * silently shadows every key beneath it, and `Localization#localize()`
 * returns the key verbatim on a non-string result. Assertion A alone cannot
 * catch this because it admits object results; only a shape where the key is
 * KNOWN to name a leaf can require a string.
 *
 * Covered leaf-reference shapes (assertion B):
 *   - inline `text('FABRICATE…')` / `format('FABRICATE…')` / `localize('FABRICATE…')`
 *     (`localize` is `util/foundryBridge.js`'s wrapper, which the player-facing
 *     crafting components call directly instead of through a fallback-carrying
 *     `text` helper — so leaving it out silently exempted a whole app from this
 *     guard);
 *   - `labelKey: 'FABRICATE…'` / `descKey: 'FABRICATE…'` object properties
 *     (option/nav tables rendered later via `text(option.labelKey, …)`);
 *   - `[COMPUTED]: 'FABRICATE…'` object entries — the state/kind → key lookup
 *     tables a component then reads dynamically (RequirementRail's per-slot-state
 *     labels). The key is literal even though the property name is not, so it is
 *     checkable; only the *value* has to be a quoted literal here;
 *   - `['FABRICATE…', fallback]` array-first-element tables (STATUS/SORT labels).
 *
 * Scan root: `src` (widened from `src/ui` — the reverse guard
 * (`tests/lang-keys-no-orphans.test.js`) already scans all of `src/**`, so the
 * two guards now share a scope).
 *
 * Coverage limit (stated, not total): DYNAMIC references are out of scope — a
 * call whose key is a variable (`text(someKey)` / `text(obj.key)`) or a
 * computed property is resolved at runtime and cannot be checked statically.
 * Only literal `FABRICATE.*` string keys are asserted.
 *
 * Non-vacuity: the captured-literal count (assertion A) is asserted above
 * 1000, so a scan that silently stopped matching cannot pass; and a self-test
 * drives the real resolver against an in-memory `lang` tree with a known live
 * key deleted (`FABRICATE.Settings.Theme.Name`, referenced as `name:` in
 * `src/config/settings.js`, outside `src/ui`, and passing both guards green
 * before this change) and asserts that key is reported, proving the guard is
 * capable of failing rather than merely never having failed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = join(ROOT, 'src');

// Assertion B's four leaf-reference shapes. Each pattern captures the literal
// key in group 2. A dynamic first argument (e.g. `text(varKey)`, `labelKey:
// someVar`) does not start with a quote and is therefore never matched —
// exactly the intended skip.
const LEAF_KEY_PATTERNS = [
  // text('FABRICATE…') / format("FABRICATE…") / localize('FABRICATE…')
  /\b(?:text|format|localize)\(\s*(['"])(FABRICATE[^'"]*)\1/g,
  // labelKey: 'FABRICATE…' / descKey: "FABRICATE…"
  /\b(?:labelKey|descKey)\s*:\s*(['"])(FABRICATE[^'"]*)\1/g,
  // [COMPUTED]: 'FABRICATE…' lookup-table entries. Deliberately narrower than a
  // bare `: 'FABRICATE…'`, which also matches namespace BASES that are legitimately
  // objects (adminStore's `${base}.Title` composition-loss prefix) and would report
  // them as unresolved.
  /\[[^\]\n]*\]\s*:\s*(['"])(FABRICATE[^'"]*)\1/g,
  // ['FABRICATE…', fallback] array-first-element label tables
  /\[\s*(['"])(FABRICATE[^'"]*)\1\s*,/g,
];

// Assertion A's universal reference capture: a maximal `FABRICATE.<seg>(.<seg>)*`
// dotted literal in group 1, with an optional trailing `${` marker in group 2
// recording whether the literal is immediately continued by an interpolation
// — see the file header's trailing-interpolation exclusion.
const REFERENCE_PATTERN = /(FABRICATE\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)(\$\{)?/g;

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.svelte') || entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function resolveKey(langRoot, dottedKey) {
  return dottedKey.split('.').reduce((node, part) => (node == null ? undefined : node[part]), langRoot);
}

// Scans `files` for every assertion-A reference. Returns the deduplicated set
// of literals that must resolve to SOMETHING, plus the count of literals
// skipped because they are a trailing-`${` interpolation base.
function scanReferences(files) {
  const referenced = new Set();
  let skipped = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(REFERENCE_PATTERN)) {
      if (match[2]) {
        skipped += 1;
      } else {
        referenced.add(match[1]);
      }
    }
  }
  return { referenced, skipped };
}

const SOURCE_FILES = collectSourceFiles(SRC_ROOT);
const LANG = JSON.parse(readFileSync(join(ROOT, 'lang', 'en.json'), 'utf8'));

test('assertion A: every FABRICATE key literal in src resolves to something in en.json', () => {
  const { referenced, skipped } = scanReferences(SOURCE_FILES);

  // Non-vacuity: a scan that silently stopped matching cannot pass this.
  assert.ok(
    referenced.size > 1000,
    `expected src to reference over 1000 literal FABRICATE lang keys, found ${referenced.size}`
  );
  assert.equal(
    skipped,
    1,
    'expected exactly 1 trailing-${ interpolation base to be skipped (ToolValidationTab.svelte) — ' +
      'update this count only if the number of such bases genuinely changes'
  );

  const resolved = [...referenced].map((key) => [key, resolveKey(LANG, key)]);

  const unresolved = resolved
    .filter(([, value]) => value === undefined)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(
    unresolved,
    [],
    `unresolved FABRICATE lang keys referenced in src (missing from en.json): ${unresolved.join(', ')}`
  );

  const objectResolving = resolved.filter(([, value]) => value !== undefined && typeof value !== 'string');
  assert.equal(
    objectResolving.length,
    38,
    'expected 38 legitimate namespace bases to resolve to an object — ' +
      'update this count only if the number of such bases genuinely changes'
  );
});

test('assertion A self-test: the scan is able to detect deletion of a live key', () => {
  const { referenced } = scanReferences(SOURCE_FILES);
  const target = 'FABRICATE.Settings.Theme.Name';

  // Precondition: the real scan of the real source must actually capture the
  // key this self-test deletes, or the assertion below would be vacuous.
  assert.ok(
    referenced.has(target),
    `expected ${target} to be referenced (as name: in src/config/settings.js) as a precondition of this self-test`
  );

  const mutatedLang = JSON.parse(JSON.stringify(LANG));
  delete mutatedLang.FABRICATE.Settings.Theme.Name;

  const unresolvedAfterDeletion = [...referenced].filter((key) => resolveKey(mutatedLang, key) === undefined);
  assert.ok(
    unresolvedAfterDeletion.includes(target),
    `expected deleting ${target} from an in-memory lang tree to make the scan report it as unresolved`
  );
});

test('assertion B: every leaf-shaped FABRICATE key reference in src resolves to a string in en.json', () => {
  const referenced = new Set();
  for (const file of SOURCE_FILES) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of LEAF_KEY_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        referenced.add(match[2]);
      }
    }
  }

  assert.ok(referenced.size > 0, 'expected src to reference literal FABRICATE lang keys in a leaf shape');

  const unresolved = [...referenced].filter((key) => typeof resolveKey(LANG, key) !== 'string').sort();
  assert.deepEqual(unresolved, [], `unresolved leaf-shaped src lang keys: ${unresolved.join(', ')}`);
});
