/**
 * Issue 1211 — the pre-conversion GM consent prompt.
 *
 * `data-models/spec.md` § Storage Conversion Crash Recovery carries a shipped MUST: *"The
 * conversion is downgrade-lossy and MUST say so before it runs."* The settings hint discloses
 * the CHOICE; nothing enforces that it was read, and it does not run. This suite covers the
 * disclosure of the ACTION.
 *
 * Two things here are not style preferences and are asserted as facts:
 *
 * 1. **A dismissal is a DECLINE.** `DialogV2.wait` defaults `rejectClose = false`, verified on
 *    13.351 and 14.365, so closing the dialog RESOLVES `null` rather than rejecting. The
 *    obvious `if (result === false)` therefore drops every dismissal and converts, which is
 *    why the shipped predicate tests POSITIVELY for the affirmative action.
 * 2. **The prompt opens INSIDE the primary-GM gate.** The mid-session handler fires on EVERY
 *    connected client — the bridge broadcasts the setting change everywhere — so a prompt
 *    above the gate opens a dialog for every user, players included, each of whose declines
 *    writes the target back.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  buildRecipeStorageConversionConsentPrompt,
  isRecipeStorageConversionConsented,
  RECIPE_STORAGE_CONSENT_ACTIONS,
} from '../src/systems/recipeStorageConsentPrompt.js';

import { mainMethodSource, MAIN_SOURCE } from './helpers/fabricateFacadeHarness.js';

const lang = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
const NOTICES = lang.FABRICATE.Settings.RecipeStorageTarget;

/** A localizer that resolves against the real `lang/en.json`, as Foundry's would. */
const localize = (key) =>
  key.split('.').reduce((node, segment) => (node == null ? undefined : node[segment]), lang) ?? key;

describe('the consent prompt names the loss and pre-selects the safe choice', () => {
  it('states the loss, the mitigation and the control that performs it', () => {
    const config = buildRecipeStorageConversionConsentPrompt(localize);

    assert.match(config.content, /an older version of Fabricate cannot read them/);
    assert.match(config.content, /reports no error/, 'the loss is SILENT, and that is stated');
    assert.match(config.content, /only from this version/, 'the mitigation expires on downgrade');
    assert.match(
      config.content,
      /Recipe Storage Arrangement/,
      'and it names the control by the label the settings row uses'
    );
    assert.ok(Boolean(config.title), 'the window is titled');
  });

  it('pre-selects the NON-DESTRUCTIVE choice and gives both buttons an action verb', () => {
    // *Reddens when* the destructive choice is pre-selected. `DialogV2.wait` with custom
    // buttons grants no default for free — only `confirm` does, and its labels differ by
    // build (V13 literal "Yes"/"No", V14 "COMMON.Yes"/"COMMON.No") and name no action.
    const config = buildRecipeStorageConversionConsentPrompt(localize);

    assert.equal(config.default, RECIPE_STORAGE_CONSENT_ACTIONS.CANCEL);
    assert.deepEqual(
      config.buttons.map((button) => button.action),
      [RECIPE_STORAGE_CONSENT_ACTIONS.CANCEL, RECIPE_STORAGE_CONSENT_ACTIONS.CONVERT],
      'the non-destructive choice is first as well as default'
    );
    assert.deepEqual(
      config.buttons.map((button) => button.default),
      [true, false]
    );
    for (const button of config.buttons) {
      assert.ok(Boolean(button.label), `${button.action} has a label`);
      assert.ok(!/^(Yes|No)$/i.test(button.label), `${button.action} names its own action`);
      assert.ok(!button.label.startsWith('FABRICATE.'), 'and it resolved against lang/en.json');
    }
  });

  it('is usable with no localizer at all, so the builder stays Foundry-free', () => {
    const config = buildRecipeStorageConversionConsentPrompt();

    assert.match(config.content, /<p>/);
    assert.ok(config.buttons.every((button) => button.label.length > 0));
  });

  it('carries every string it needs in lang/en.json', () => {
    for (const name of [
      'ConsentTitle',
      'ConsentLoss',
      'ConsentMitigation',
      'ConsentQuestion',
      'ConsentCancelButton',
      'ConsentConvertButton',
    ]) {
      assert.ok(Boolean(NOTICES[name]), `FABRICATE.Settings.RecipeStorageTarget.${name} is missing`);
    }
  });
});

describe('a dismissal is a decline, and only the affirmative action is consent', () => {
  it('treats every non-affirmative result as a decline', () => {
    // *Reddens when* the handler tests `result === false`. A dismissal resolves `null` under
    // `rejectClose: false`, so that form converts on the one path a GM never affirmed.
    for (const result of [null, undefined, false, '', 0, RECIPE_STORAGE_CONSENT_ACTIONS.CANCEL]) {
      assert.equal(
        isRecipeStorageConversionConsented(result),
        false,
        `${String(result)} must not be read as consent`
      );
    }
    assert.equal(
      isRecipeStorageConversionConsented(RECIPE_STORAGE_CONSENT_ACTIONS.CONVERT),
      true,
      'and the affirmative action IS consent, so the guard is not satisfied by always refusing'
    );
  });
});

describe('the consent gate sits inside the primary-GM gate and above the conversion', () => {
  // `src/main.js` imports the global stylesheet and the Svelte UI roots at module load, so it
  // cannot be imported under `node --test`. Position is the property, and no runtime
  // observation of a module that cannot be loaded could make this stronger.
  const reconcile = mainMethodSource(
    '  async _reconcileDefinitionStorage(migrationPassPersistedCorpusKey = false) {',
    MAIN_SOURCE
  );
  const consent = mainMethodSource(
    '  async _consentToForwardRecipeStorageConversion() {',
    MAIN_SOURCE
  );

  it('gates the conversion on consent, inside the primary-GM check', () => {
    // *Reddens when* the prompt is built but the conversion runs regardless.
    const gate = reconcile.indexOf('if (game.users?.activeGM?.id !== game.user?.id) return;');
    const ask = reconcile.indexOf('await this._consentToForwardRecipeStorageConversion()');
    const convert = reconcile.indexOf('reconcileRecipeStorageLayout(');
    assert.ok(gate > -1, 'the primary-GM gate is still the first thing the pass does');
    assert.ok(ask > -1, 'and the pass asks for consent');
    assert.ok(convert > -1, 'and still drives the reconciler');
    assert.ok(gate < ask, 'the prompt opens INSIDE the gate, never on every connected client');
    assert.ok(ask < convert, 'and before anything converts');
    assert.ok(
      reconcile.includes('await this._revertDeclinedRecipeStorageTarget();'),
      'a decline writes the target back and returns'
    );
  });

  it('is the single prompt site both entry points reach, so nobody is asked twice', () => {
    // The boot pass and the mid-session target-change handler both reach the conversion
    // through `_reconcileDefinitionStorage`, so one prompt site covers both without the
    // double-prompt a second copy in the hook would produce.
    const initialize = mainMethodSource('  async initialize() {', MAIN_SOURCE);
    assert.ok(
      initialize.includes('await this._reconcileDefinitionStorage(migrationPassPersistedCorpusKey);'),
      'the boot pass routes through it'
    );
    assert.ok(
      MAIN_SOURCE.includes('void fabricate._reconcileDefinitionStorage().catch(error => {'),
      'and so does the mid-session handler'
    );
    assert.equal(
      MAIN_SOURCE.split('_consentToForwardRecipeStorageConversion()').length - 1,
      2,
      'exactly one declaration and one call site'
    );
  });

  it('declines when it cannot ask, rather than converting unasked', () => {
    // A client with no `DialogV2` cannot obtain consent, and a conversion nobody consented to
    // is the failure this exists to prevent — so the unavailable-dialog arm must be the
    // DECLINE arm, which is the opposite of every other defensive edge in this file.
    assert.match(consent, /if \(!DialogV2\?\.wait\) return false;/);
    assert.match(consent, /catch \(error\) \{[\s\S]*?return false;/, 'and so is a thrown dialog');
    assert.ok(
      consent.includes('isRecipeStorageConversionConsented(result)'),
      'the result is read through the positive predicate, never compared to false inline'
    );
    assert.ok(
      consent.includes('rejectClose: false'),
      'and the dismissal-resolves-null contract is stated at the call site'
    );
  });

  it('asks only for a FORWARD conversion, so no other outcome is interrupted', () => {
    const pending = mainMethodSource(
      '  _forwardRecipeStorageConversionPending() {',
      MAIN_SOURCE
    );
    assert.ok(pending.includes('DEFINITION_STORAGE_TARGETS.PER_RECORD'));
    assert.ok(pending.includes('DEFINITION_STORAGE_LAYOUTS.PER_RECORD'));
    assert.ok(
      consent.includes('if (!this._forwardRecipeStorageConversionPending()) return true;'),
      'everything else proceeds without a prompt, exactly as it always has'
    );
  });

  it('never writes an illegal target back on a decline', () => {
    // `unsettled` is a real LAYOUT and is not a legal target, so writing it into the target
    // key would launder a value the reconciler itself refuses to accept.
    const revert = mainMethodSource(
      '  async _revertDeclinedRecipeStorageTarget() {',
      MAIN_SOURCE
    );
    assert.ok(
      revert.includes('if (Object.values(DEFINITION_STORAGE_TARGETS).includes(layout)) {'),
      'the write-back is guarded on the layout being a legal target'
    );
    assert.ok(
      revert.includes("this._announceDefinitionStorageOutcome({ action: 'consent-declined' });"),
      'and the GM is told either way'
    );
    assert.match(NOTICES.Declined, /Nothing was changed/);
  });
});
