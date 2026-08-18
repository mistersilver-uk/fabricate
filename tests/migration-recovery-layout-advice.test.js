/**
 * Issue 1242 — the migration-abort guidance is LAYOUT-AWARE, and the "kept unchanged"
 * assurance is scoped to the pass that aborted.
 *
 * Two separate defects are pinned here.
 *
 * **The advice was false on a converted world.** "Downgrade to keep using your existing data"
 * holds only under the combined-record arrangement. An older build has no granular reader,
 * serves the registered empty default, and writes that empty-derived corpus back — creating a
 * competing legacy document the next upgrade discards. The advice therefore has to read the
 * layout.
 *
 * **The layout must never appear in a GM-facing string.** The layout enumeration carries
 * `unsettled`, which the operator-facing choices map has no label for and never will, so any
 * labeller fed a LAYOUT leaks the raw token. The mechanical assertion below renders the
 * guidance for all four layout values and forbids every token in the output — which is why
 * the fix is "select a whole sentence" rather than "interpolate a label".
 *
 * A layout parameter that is threaded but UNUSED is the failure mode both halves are written
 * against: every assertion here compares rendered output across layouts rather than checking
 * that a parameter exists.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { DEFINITION_STORAGE_LAYOUTS } from '../src/config/settings.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { FatalMigrationError } from '../src/migration/migrationErrors.js';
import { buildMigrationRecoveryPrompt } from '../src/migration/migrationRecoveryPrompt.js';

/** Every layout the guidance can be asked to describe, including "could not read it". */
const ALL_LAYOUTS = [
  DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
  DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
  null,
];

/** The internal tokens that must never reach a GM. */
const LAYOUT_TOKENS = ['singleArray', 'perRecord', 'unsettled'];

const ABORT_CONTEXT = { downgradeTo: '1.2.0', documents: [], label: 'Aborting migration' };

function repoFile(relative) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** The rendered prompt content for one layout. */
function promptFor(storageLayout) {
  return buildMigrationRecoveryPrompt({ ...ABORT_CONTEXT, storageLayout }).content;
}

/**
 * The console guidance the runner emits for one layout, captured verbatim.
 *
 * Driven through a real aborting pass rather than by calling the private emitter, so the
 * layout the runner RESOLVED is the one that reaches the guidance.
 */
async function consoleGuidanceFor(storageLayout) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.map(String).join(' '));
  try {
    await new MigrationRunner({
      getSetting: (key) => (key === 'migrationVersion' ? '0.0.0' : []),
      setSetting: async () => {},
      recipeCorpus: {
        layout: () => storageLayout,
        loadAll: async () => [],
        createOrUpdateAll: async () => {},
      },
      migrations: [
        {
          version: '9.9.9',
          label: 'Aborting migration',
          downgradeTo: '1.2.0',
          migrate: () => {
            throw new FatalMigrationError('boom', { documents: [] });
          },
        },
      ],
    }).run();
  } finally {
    console.error = original;
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 16(b). A different COMPLETE sentence per layout, in both surfaces
// ---------------------------------------------------------------------------

test('the prompt selects a different complete downgrade sentence for every layout', () => {
  const rendered = ALL_LAYOUTS.map((layout) => promptFor(layout));
  assert.equal(
    new Set(rendered).size,
    ALL_LAYOUTS.length,
    'a layout parameter that is threaded but unused would collapse these to one'
  );
});

test('the console guidance selects a different complete downgrade sentence for every layout', async () => {
  const rendered = [];
  for (const layout of ALL_LAYOUTS) rendered.push(await consoleGuidanceFor(layout));
  assert.equal(new Set(rendered).size, ALL_LAYOUTS.length);
});

test("the singleArray sentence is unchanged from today's, in both surfaces", async () => {
  assert.match(
    promptFor(DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY),
    /Recommended: downgrade Fabricate to version 1\.2\.0 to keep using your existing data without manual remediation\./
  );
  assert.match(
    await consoleGuidanceFor(DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY),
    /Fabricate \| Recommended action: downgrade Fabricate to version 1\.2\.0 to continue using your existing data without manual remediation\./
  );
});

test('a granular or mid-conversion layout tells the GM not to downgrade yet, and to reload', () => {
  for (const layout of [
    DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
  ]) {
    const content = promptFor(layout);
    assert.match(content, /do not downgrade yet/i, `${layout}: refuses the downgrade advice`);
    assert.match(content, /Recipe Storage Arrangement/, `${layout}: names the shipped setting`);
    assert.match(content, /One combined record/, `${layout}: names the shipped choice label`);
    assert.match(content, /reload Foundry/i, `${layout}: instructs a reload`);
    assert.match(
      content,
      /after a downgrade there is no code left to run it with/i,
      `${layout}: carries the reason the conversion cannot wait`
    );
  }
});

test('an unreadable layout selects the safe default rather than the singleArray sentence', () => {
  const unreadable = promptFor(null);
  assert.notEqual(unreadable, promptFor(DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY));
  // It cannot promise the downgrade is safe, because it does not know how the corpus is
  // stored — so it names the one thing the GM can check.
  assert.match(unreadable, /check Settings . Fabricate . Recipe Storage Arrangement/);
  // A fixture answering `[]` for the layout key is TRUTHY and must land here too.
  assert.equal(promptFor([]), unreadable);
  assert.equal(promptFor('somethingElse'), unreadable);
});

test('no rendered GM string carries a raw layout token, for any layout value', async () => {
  for (const layout of ALL_LAYOUTS) {
    const content = promptFor(layout);
    const guidance = await consoleGuidanceFor(layout);
    for (const token of LAYOUT_TOKENS) {
      assert.equal(content.includes(token), false, `prompt for ${layout} leaks "${token}"`);
      assert.equal(guidance.includes(token), false, `console for ${layout} leaks "${token}"`);
    }
  }
});

test('the localized keys the advice selects all resolve in lang/en.json', () => {
  const strings = JSON.parse(repoFile('../lang/en.json')).FABRICATE.Migration.Recovery;
  for (const key of [
    'Downgrade',
    'DowngradeGranular',
    'DowngradeMidConversion',
    'DowngradeCheckArrangement',
  ]) {
    assert.equal(typeof strings[key], 'string', `${key} is a shipped string`);
    assert.match(strings[key], /\{version\}/, `${key} carries the downgrade target`);
    for (const token of LAYOUT_TOKENS) {
      assert.equal(strings[key].includes(token), false, `${key} leaks "${token}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// 16(c). All four "kept unchanged" sites are scoped to the pass that aborted
// ---------------------------------------------------------------------------

test('the four assurance sites move together and are scoped to this pass', async () => {
  const SCOPED = /This pass saved nothing: your stored data is exactly as it was before this startup\./;
  const lang = JSON.parse(repoFile('../lang/en.json')).FABRICATE.Migration;

  // 1. The runner's console header.
  assert.match(await consoleGuidanceFor(DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY), SCOPED);
  // 2. The pure prompt builder's intro, and the localized string behind it.
  assert.match(promptFor(DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY), SCOPED);
  assert.match(lang.Recovery.Intro, SCOPED);
  // 3. The GM notification `main.js` raises, and the localized string behind it.
  assert.match(lang.Aborted.Notice, SCOPED);
  assert.match(repoFile('../src/main.js'), SCOPED);
  // 4. The literal the canonical spec pins. Leaving it behind would put the two specs in
  //    disagreement the moment the string changed.
  assert.match(repoFile('../openspec/specs/destructive-changes-and-migrations/spec.md'), SCOPED);

  // And none of them survives as the old unscoped claim, which read as an assurance about
  // failed migrations in general — false, because a NON-FATAL migration error is logged and
  // the pass continues, advancing the version past the failed migration and writing.
  for (const [label, text] of [
    ['lang Recovery.Intro', lang.Recovery.Intro],
    ['lang Aborted.Notice', lang.Aborted.Notice],
    ['MigrationRunner.js', repoFile('../src/migration/MigrationRunner.js')],
    ['main.js', repoFile('../src/main.js')],
    [
      'destructive-changes-and-migrations spec',
      repoFile('../openspec/specs/destructive-changes-and-migrations/spec.md'),
    ],
  ]) {
    assert.equal(
      /(?:existing )?data (?:has been|was) kept unchanged/i.test(text),
      false,
      `${label} still carries the unscoped assurance`
    );
  }
});
