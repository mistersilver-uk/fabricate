/** The rules editor's Validation tab draws the view's verdict and rows on their hooks (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { componentRulesValidationPresentation } from '../../src/ui/svelte/apps/manager/component/componentRulesValidation.js';
import {
  callRecorder,
  cardFormat,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';

const harness = componentCardHarness('ComponentRulesValidationTab');

describe('ComponentRulesValidationTab', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('draws one hooked row per check, worded by status, under the hero its counts derive', async () => {
    const validation = componentRulesValidationPresentation(
      {
        category: 'general',
        // Offered with no total, so one row warns beside the passing and blocking ones.
        essencesOffered: true,
        essenceTotal: 0,
        salvageFeatureEnabled: true,
        salvageEnabled: true,
        resultCount: 0,
      },
      cardFormat
    );
    const { calls, record } = callRecorder();
    const target = await harness.mount({
      text: cardText,
      format: cardFormat,
      systemLabel: 'Smithing',
      validation,
      onSelectIssue: record('select'),
    });

    const root = target.querySelector('[data-component-edit-validation]');
    assert.ok(Boolean(root), 'the surface carries the editor hook');
    assert.equal(
      root.querySelector('[data-editor-validation-summary]').dataset.editorValidationSummary,
      'block'
    );
    assert.match(root.textContent, /These rules have gaps/);
    assert.match(root.textContent, /What Smithing needs from this component/);

    const expected = validation.groups.flatMap((group) => group.rows.map((row) => row.id));
    const rows = [...root.querySelectorAll('[data-component-validation-check]')];
    assert.ok(expected.length > 0, 'the fixture yields rows');
    assert.deepEqual(
      rows.map((row) => row.dataset.componentValidationCheck),
      expected
    );
    assert.ok(
      rows.some((row) => /\bBlocks\b/.test(row.textContent)),
      'a blocking row reads the editor’s own status word'
    );
    const counts = Object.fromEntries(
      [...root.querySelectorAll('[data-editor-validation-count]')].map((count) => [
        count.dataset.editorValidationCount,
        count.textContent.trim(),
      ])
    );
    assert.deepEqual(counts, {
      passing: String(validation.counts.passing),
      warnings: String(validation.counts.warnings),
      blocking: String(validation.counts.blocking),
    });
    const statuses = validation.groups.flatMap((group) => group.rows.map((row) => row.status));
    for (const [status, word] of [
      ['pass', 'Pass'],
      ['warn', 'Warning'],
    ]) {
      assert.ok(statuses.includes(status), `the fixture yields a ${status} row`);
      assert.ok(
        rows.some((row) => row.textContent.includes(word)),
        `a ${status} row reads "${word}"`
      );
    }

    // A failing row's View hands the view its route and control; a passing row offers none.
    for (const row of rows) {
      assert.equal(
        Boolean(row.querySelector('[data-component-validation-view]')),
        !row.classList.contains('is-pass'),
        `${row.dataset.componentValidationCheck}: a View exactly when the row fails`
      );
    }
    root.querySelector(':scope [data-component-validation-check="essences"] button').click();
    assert.deepEqual(calls, [['select', 'rules', 'component-essences']]);
    harness.remount();
  });
  const BLOCKING = {
    category: 'general',
    salvageFeatureEnabled: true,
    salvageEnabled: true,
    resultCount: 0,
  };
  const WARNING_ONLY = { category: 'general', essencesOffered: true, essenceTotal: 0 };
  const ALL_PASS = { category: 'general', essencesOffered: true, essenceTotal: 1 };

  it('badges the Validation tab at the worst severity, and not at all when everything passes', () => {
    const blocking = componentRulesValidationPresentation(BLOCKING, cardFormat);
    assert.deepEqual(blocking.badge, {
      count: blocking.counts.blocking,
      label: String(blocking.counts.blocking),
      tone: 'danger',
    });
    assert.ok(blocking.counts.blocking > 0);
    const warning = componentRulesValidationPresentation(WARNING_ONLY, cardFormat);
    assert.deepEqual(warning.badge, {
      count: warning.counts.warnings,
      label: String(warning.counts.warnings),
      tone: 'warning',
    });
    assert.ok(warning.counts.warnings > 0 && warning.counts.blocking === 0);
    assert.equal(componentRulesValidationPresentation(ALL_PASS, cardFormat).badge, null);
  });

  for (const [status, context, icon] of [
    ['block', BLOCKING, 'fa-circle-xmark'],
    ['warn', WARNING_ONLY, 'fa-triangle-exclamation'],
    ['pass', ALL_PASS, 'fa-circle-check'],
  ]) {
    it(`paints the ${status} hero with ${icon}`, async () => {
      const target = await harness.mount({
        text: cardText,
        format: cardFormat,
        systemLabel: 'Smithing',
        validation: componentRulesValidationPresentation(context, cardFormat),
      });
      const summary = target.querySelector('[data-editor-validation-summary]');
      assert.equal(summary.dataset.editorValidationSummary, status);
      const classes = [...summary.querySelector('i').classList];
      assert.ok(classes.includes(icon), `${status} wears ${icon}; got ${classes.join(' ')}`);
      harness.remount();
    });
  }
});
