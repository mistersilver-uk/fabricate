/**
 * Guard: every literal `FABRICATE.*` key referenced anywhere in `src/**` is checked two ways (issue
 * 885).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = join(ROOT, 'src');

// Assertion B's four leaf-reference shapes.
const LEAF_KEY_PATTERNS = [
  // text('FABRICATE…') / format("FABRICATE…") / localize('FABRICATE…')
  /\b(?:text|format|localize)\(\s*(['"])(FABRICATE[^'"]*)\1/g,
  // labelKey: 'FABRICATE…' / descKey: "FABRICATE…"
  /\b(?:labelKey|descKey)\s*:\s*(['"])(FABRICATE[^'"]*)\1/g,
  // [COMPUTED]: 'FABRICATE…' lookup-table entries.
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

// Scans `files` for every assertion-A reference.
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
    48,
    'expected 48 legitimate namespace bases to resolve to an object — ' +
      '#1648 uses Journal Mode, Verdict, History, StepDetails and Yields.AwardModes (the parity correction replaces Stage.State), whose ' +
      'leaf suffixes are selected from run state. ' +
      'update this count only if the number of such bases genuinely changes. It fell from 44 ' +
      'when issue 1282 deleted `GatheringTravelTabs.svelte`, whose template literal was the ' +
      'sole reference to the `FABRICATE.Admin.Manager.Travel.Tabs` base, and from 43 to 40 ' +
      'when issue 1362 promoted `EditorTabs.svelte`: the environment, system and recipe-item ' +
      'strips each composed their leaf key from a `${tab.key}` suffix, and each now passes a ' +
      'COMPLETE static key per tab, so three bases stopped being referenced at all. That is a ' +
      'strengthening rather than a loss — a complete literal is checked by this assertion, a ' +
      'base is only checked for existing. The ordinals below are therefore NAMES rather than ' +
      'positions: renumbering them on every count change is churn nobody can verify. One is ' +
      '`MANAGER_COLOR_TOKEN_KEY_PREFIX` in `src/ui/svelte/util/managerColorTokens.js` (issue ' +
      '1036), the shared base the eight colour-token labels are localized under. Another is ' +
      '`FABRICATE.Migration.RetireCheckModifierPlaceholder` in ' +
      '`src/migration/migrateRetireCraftingModToken.js` (issue 1094), the base its four ' +
      'per-cause notice clauses are localized under — the clauses are separate keys so the ' +
      'notice can join only the non-zero ones rather than reporting three zeros. Another is ' +
      '`NAMESPACE` in `src/ui/svelte/apps/manager/checks/checkModeCallout.js` (issue 1096), ' +
      'the base every per-mode title, explanation and fact value is localized under — that ' +
      'module is a pure data table, so the suffixes are data and the base is the literal. ' +
      'Another is `NAMESPACE` in ' +
      '`src/ui/svelte/apps/manager/checks/checkTriggerPresets.js` (issue 1096), the base its ' +
      'two preset labels and their six per-kind effect phrases are localized under — the same ' +
      'pure-data-table shape, for the same reason. Another is `LANG_ROOT` in ' +
      '`src/ui/svelte/apps/manager/scoped/worldVocabularyStudio.js` (issue 1392), the base the ' +
      'world Tags & Categories screen composes every per-vocabulary string under: that page ' +
      'renders ONE panel block for three vocabularies, so the middle segment is data and the ' +
      'base is the literal. Two more are the Preview and Tabs ' +
      'bases in `src/ui/svelte/apps/manager/downtime/`; each composes one of the four fixed ' +
      'Downtime tab suffixes from provider data, so the complete leaf key is only known at render time. One more is `KEY` in `src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte` (issue 1371 r16-list), the `Component.BulkEdit` base the rebuilt system bulk panel composes its forty-odd inset, foot and remove-leg strings under — the same pure-string-table shape, kept as a base so the panel is not forty full literals long. And it fell from 42 to 41 at issue 1517, for the same STRENGTHENING reason issue 1362 did: the environment Validation tab composed its severity word from a `Severity.${severity}` suffix, which made `FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Severity` a base this assertion could only check for existing. The tab was converted onto `EditorValidationSurface`, whose row vocabulary has no severity word to compose, and the two chips in the summary inspector — the last complete literals under that base — now read the shared `Admin.Manager.Validation` count words, because they report the same two numbers the tab and the tab badge do. The base and its two keys are gone from `en.json` entirely, so nothing under it is composed or resolved any more. And it fell from 47 to 46 at issue 1648, for that same STRENGTHENING reason: `ActionsPanel.svelte` composed its disabled-reason sentence from a `FABRICATE.App.Journal.Actions.${key}` suffix, which made `FABRICATE.App.Journal.Actions` a base this assertion could only check for existing. That vocabulary moved into `src/ui/svelte/util/journalRunReasons.js`, which the stores share, and every entry there is a COMPLETE literal this assertion checks — which is also how the six dead `Actions` leaves the base was masking (TriggerNextStep, FinishCrafting, TriggerHint, FinishHint, AutoResolve and the bare CancelConfirm) surfaced and were deleted. And it rose from 46 to 48 later in issue 1648, which is NOT a weakening: `runStateNotice.js` and `runRecovery.js` each compose `FABRICATE.App.Journal.Notice.` and `.Recovery.` through the same `text(leaf)` helper `HistoricalRunDetail.svelte` uses, and their leaves are checked the same way — `tests/components/journal-source.test.js` extracts every `text()` argument from the AST of each module and asserts it resolves to a real string. A base this assertion can only check for existing, whose leaves another assertion checks completely, is covered; the count rises because the shape is shared, not because anything stopped being verified.'
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
