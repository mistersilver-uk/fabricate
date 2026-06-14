/**
 * Tests for the pure GM migration-abort recovery prompt builder.
 *
 * Covers spec § "Migration Abort Recovery Guidance" steps 5-7 and
 * § "GM prompt defaults: `Keep existing data` pre-selected".
 *
 * Uses node:test + node:assert/strict. The builder is pure (no Foundry), so the
 * default choice and surfaced remediation are asserted without a DialogV2 runtime.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMigrationRecoveryPrompt,
  MIGRATION_RECOVERY_ACTIONS,
} from '../src/migration/migrationRecoveryPrompt.js';

const ABORT_CONTEXT = {
  downgradeTo: '1.2.0',
  label: 'Rename gathering Region concept to Realm',
  documents: [
    {
      type: 'recipe',
      id: 'recipe-42',
      name: 'Potion of Healing',
      error: 'macroOutcome provider has no return keys',
      fix: 'Update the recipe macro to return component keys',
      macroHint: 'return { components: {...} }',
    },
    {
      type: 'craftingSystem',
      id: 'system-7',
      error: 'invalid required field',
      fix: 'Delete the system or restore its name',
    },
  ],
};

test('default / pre-selected button is "Keep existing data" (spec § GM prompt defaults)', () => {
  const config = buildMigrationRecoveryPrompt(ABORT_CONTEXT);

  assert.equal(config.default, MIGRATION_RECOVERY_ACTIONS.KEEP);

  const defaultButtons = config.buttons.filter((button) => button.default === true);
  assert.equal(defaultButtons.length, 1, 'exactly one default button');
  assert.equal(defaultButtons[0].action, MIGRATION_RECOVERY_ACTIONS.KEEP);
  assert.equal(defaultButtons[0].label, 'Keep existing data');

  // The default button is ordered first.
  assert.equal(config.buttons[0].action, MIGRATION_RECOVERY_ACTIONS.KEEP);
});

test('config exposes both choices: keep and fix/retry', () => {
  const config = buildMigrationRecoveryPrompt(ABORT_CONTEXT);

  const actions = config.buttons.map((button) => button.action);
  assert.deepEqual(
    [...actions].sort(),
    [MIGRATION_RECOVERY_ACTIONS.FIX_AND_RETRY, MIGRATION_RECOVERY_ACTIONS.KEEP].sort()
  );

  const fixButton = config.buttons.find(
    (button) => button.action === MIGRATION_RECOVERY_ACTIONS.FIX_AND_RETRY
  );
  assert.equal(fixButton.default, false, 'fix/retry is not the default');
  assert.match(fixButton.label, /manually fix or delete failed documents/i);
});

test('content surfaces downgradeTo and the aborted migration label', () => {
  const config = buildMigrationRecoveryPrompt(ABORT_CONTEXT);

  assert.match(config.content, /1\.2\.0/, 'downgrade target present');
  assert.match(config.content, /Rename gathering Region concept to Realm/, 'aborted label present');
  assert.match(config.content, /kept unchanged/i, 'existing-data-kept reassurance present');
});

test('content surfaces per-document remediation from the abort context', () => {
  const config = buildMigrationRecoveryPrompt(ABORT_CONTEXT);

  assert.match(config.content, /recipe/, 'document type present');
  assert.match(config.content, /recipe-42/, 'document id present');
  assert.match(config.content, /Potion of Healing/, 'document name present');
  assert.match(config.content, /macroOutcome provider has no return keys/, 'exact error present');
  assert.match(config.content, /Update the recipe macro/, 'fix action present');
  assert.match(config.content, /return \{ components:/, 'macro hint present');
  assert.match(config.content, /craftingSystem/, 'second document type present');
});

test('content documents the explicit, reload-driven retry (no same-pass auto-retry)', () => {
  const config = buildMigrationRecoveryPrompt(ABORT_CONTEXT);

  assert.match(config.content, /reload Foundry/i, 'retry guidance tells the GM to reload');
  assert.match(
    config.content,
    /runs again automatically because it was not marked complete/i,
    'explains the version-unchanged re-run mechanism'
  );
});

test('uses an injected localizer when provided', () => {
  const localize = (key, data) => {
    if (key === 'FABRICATE.Migration.Recovery.KeepButton') return 'KEEP_LOCALIZED';
    if (key === 'FABRICATE.Migration.Recovery.Title') return 'TITLE_LOCALIZED';
    // Echo the key for everything else to exercise the key-echo fallback path.
    return data ? key : key;
  };
  const config = buildMigrationRecoveryPrompt(ABORT_CONTEXT, localize);

  assert.equal(config.title, 'TITLE_LOCALIZED');
  const keepButton = config.buttons.find(
    (button) => button.action === MIGRATION_RECOVERY_ACTIONS.KEEP
  );
  assert.equal(keepButton.label, 'KEEP_LOCALIZED');
  // Keys that echo back fall through to the English fallback.
  assert.match(config.content, /kept unchanged/i);
});

test('falls back to "unknown" when downgradeTo is missing', () => {
  const config = buildMigrationRecoveryPrompt({ documents: [], label: 'X', downgradeTo: null });
  assert.match(config.content, /version unknown/i);
});

test('escapes HTML in document fields', () => {
  const config = buildMigrationRecoveryPrompt({
    downgradeTo: '1.0.0',
    label: 'L',
    documents: [{ type: 'recipe', id: '<b>x</b>', error: 'a & b', fix: '"quote"' }],
  });
  assert.match(config.content, /&lt;b&gt;x&lt;\/b&gt;/, 'angle brackets escaped');
  assert.match(config.content, /a &amp; b/, 'ampersand escaped');
  assert.match(config.content, /&quot;quote&quot;/, 'double quotes escaped');
});

test('omits the documents list when no failures are provided', () => {
  const config = buildMigrationRecoveryPrompt({ downgradeTo: '1.0.0', label: 'L', documents: [] });
  assert.doesNotMatch(config.content, /<ul/, 'no documents list rendered');
  // Still includes the keep/retry guidance and downgrade recommendation.
  assert.match(config.content, /reload Foundry/i);
});
