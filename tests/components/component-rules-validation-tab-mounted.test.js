/** The rules editor's Validation tab draws the view's verdict and rows on their hooks (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { componentRulesValidationPresentation } from '../../src/ui/svelte/apps/manager/component/componentRulesValidation.js';
import { cardFormat, cardText, componentCardHarness } from '../helpers/componentEditViewModules.js';

const harness = componentCardHarness('ComponentRulesValidationTab');

const SUMMARY = Object.freeze({
  status: 'block',
  icon: 'fas fa-circle-xmark',
  title: 'These rules have gaps',
  sub: 'What Smithing needs from this component.',
});

describe('ComponentRulesValidationTab', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('draws one hooked row per check, worded by status, under the summary it is given', async () => {
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
    const target = await harness.mount({ text: cardText, summary: SUMMARY, validation });

    const root = target.querySelector('[data-component-edit-validation]');
    assert.ok(Boolean(root), 'the surface carries the editor hook');
    assert.equal(
      root.querySelector('[data-editor-validation-summary]').dataset.editorValidationSummary,
      'block'
    );
    assert.match(root.textContent, /These rules have gaps/);

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
    harness.remount();
  });
});
