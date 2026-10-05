/** Every Component Rules validation row routes to the control that fixes it (issue 1522, P5). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  COMPONENT_RULES_VALIDATION_CHECKS,
  COMPONENT_RULES_VALIDATION_CONTROLS,
  componentRulesValidationPresentation,
} from '../../src/ui/svelte/apps/manager/component/componentRulesValidation.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';
import { componentEditViewHarness } from '../helpers/componentEditViewModules.js';
import {
  describeValidationAddressPairing,
  describeValidationHostContract,
} from '../helpers/validationAddressContracts.js';

const harness = componentEditViewHarness('fabricate-component-rules-routes-');

const KNOWN = { id: 'res-known', componentId: 'cmp-scrap', quantity: 1 };
const GONE = { id: 'res-gone', componentId: 'cmp-gone', quantity: 1 };
const salvage = (results, outcomeRouting = { Success: 'grp-1', Failure: 'grp-1' }) => ({
  enabled: true,
  resultGroups: [{ id: 'grp-1', name: 'Scraps', results }],
  outcomeRouting,
});

/** Every gate open: essences offered, salvage on, and the mode the check needs. */
function props(mode, componentSalvage, extra = {}) {
  return {
    component: { id: 'comp-1', name: 'Dragon Scale', category: 'metal', salvage: componentSalvage },
    componentOptions: [{ id: 'cmp-scrap', name: 'Scrap Metal', img: '' }],
    showEssences: true,
    essenceOptions: [{ id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire', quantity: 0 }],
    showSalvage: true,
    salvageResolutionMode: mode,
    salvageOutcomeNames: ['Success', 'Failure'],
    showDifficulty: mode === 'progressive',
    difficulty: null,
    ...extra,
  };
}

/** The rows each mode renders: routing and the progressive DC never share a system. */
const ROWS = {
  routed: COMPONENT_RULES_VALIDATION_CHECKS.filter((id) => id !== 'progressiveDc'),
  progressive: COMPONENT_RULES_VALIDATION_CHECKS.filter((id) => id !== 'salvageRouting'),
};

/**
 * One failing fixture per check, and the sentence the live region speaks once focus lands. The
 * category check has none: the view normalizes a blank category to `general`, so it cannot fail.
 */
const FAILING = {
  category: null,
  essences: { mode: 'routed', salvage: salvage([KNOWN]), said: 'Component rules' },
  salvageResults: { mode: 'routed', salvage: salvage([]), said: 'Component rules' },
  salvageResultRules: { mode: 'routed', salvage: salvage([GONE]), said: 'Component rules' },
  salvageRouting: {
    mode: 'routed',
    salvage: salvage([KNOWN], { Success: 'grp-1' }),
    said: 'Component rules',
  },
  progressiveDc: {
    mode: 'progressive',
    salvage: salvage([KNOWN]),
    said: 'Component rules — Difficulty value',
  },
};

const byName = (left, right) => left.localeCompare(right);
const assertIs = (actual, expected, message) => assert.equal(actual === expected, true, message);

async function openValidation(fixture) {
  const target = await harness.mount(props(fixture.mode, fixture.salvage));
  target.querySelector('[data-component-edit-tab="validation"]').click();
  flushSync();
  return target;
}

async function activateRow(target, checkId) {
  const view = target.querySelector(
    `[data-component-validation-check="${checkId}"] [data-component-validation-view]`
  );
  assert.ok(Boolean(view), `the ${checkId} row draws a View`);
  assert.equal(view.getAttribute('data-component-validation-view'), 'rules');
  view.click();
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  flushSync();
}

const renderedRows = (target) =>
  [...target.querySelectorAll('[data-component-validation-check]')].map(
    (row) => row.dataset.componentValidationCheck
  );

describe('ComponentEditView — each validation row reaches the control that fixes it', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('maps every check to a control, so no failing row is route-only', () => {
    assert.deepEqual(Object.keys(COMPONENT_RULES_VALIDATION_CONTROLS), [
      ...COMPONENT_RULES_VALIDATION_CHECKS,
    ]);
    assert.deepEqual(Object.keys(FAILING), [...COMPONENT_RULES_VALIDATION_CHECKS]);
  });

  it('addresses a failing category row and leaves every passing row unaddressed', () => {
    const { groups } = componentRulesValidationPresentation({ category: '', essenceTotal: 1 });
    const [category] = groups.flatMap((group) => group.rows);
    assert.equal(category.id, 'category');
    assert.equal(category.target, 'rules');
    assert.equal(category.focusTarget, 'component-category');
    const passing = componentRulesValidationPresentation({ category: 'metal' }).groups[0].rows[0];
    assert.ok(!('target' in passing) && !('focusTarget' in passing), 'a pass has nothing to fix');
  });

  for (const checkId of COMPONENT_RULES_VALIDATION_CHECKS) {
    const fixture = FAILING[checkId];
    if (!fixture) {
      it(`${checkId}: passes in every mounted state, offers no View, and stamps a button`, async () => {
        const target = await openValidation({ mode: 'routed', salvage: salvage([KNOWN]) });
        const row = target.querySelector(`[data-component-validation-check="${checkId}"]`);
        assert.ok(Boolean(row), 'the row renders');
        assert.ok(!row.querySelector('[data-component-validation-view]'), 'and offers no View');
        target.querySelector('[data-component-edit-tab="rules"]').click();
        flushSync();
        const control = target.querySelector(
          `[data-validation-target="${COMPONENT_RULES_VALIDATION_CONTROLS[checkId]}"]`
        );
        assert.equal(control?.tagName, 'BUTTON', 'its address rides a focusable trigger');
        harness.remount();
      });
      continue;
    }

    it(`${checkId}: routes to Rules, focuses its control and says where the GM landed`, async () => {
      const target = await openValidation(fixture);
      // A SET: the surface lifts a blocking row to the head of its group.
      assert.deepEqual(
        renderedRows(target).sort(byName),
        [...ROWS[fixture.mode]].sort(byName),
        'all gates open'
      );

      await activateRow(target, checkId);
      assert.ok(Boolean(target.querySelector('[data-component-edit-panel="rules"]')), 'routed');
      const control = target.querySelector(
        `[data-validation-target="${COMPONENT_RULES_VALIDATION_CONTROLS[checkId]}"]`
      );
      assert.ok(Boolean(control), 'the Rules tab carries the addressed control');
      assertIs(document.activeElement, control, 'and it holds focus');
      assert.equal(control.getAttribute('data-validation-focused'), '', 'and it is marked');

      await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_AFTER_FOCUS_MS + 40));
      flushSync();
      const region = target.querySelector('[data-component-issue-announcement]');
      assert.equal(region.textContent.trim(), fixture.said);
      harness.remount();
    });
  }

  it('lands on the FIRST unrouted outcome, not the first outcome', async () => {
    const target = await openValidation(FAILING.salvageRouting);
    await activateRow(target, 'salvageRouting');
    assert.equal(document.activeElement.getAttribute('data-salvage-route'), 'Failure');
    harness.remount();
  });

  it('renders every check across the two modes', () => {
    assert.deepEqual(
      [...new Set([...ROWS.routed, ...ROWS.progressive])].sort(byName),
      [...COMPONENT_RULES_VALIDATION_CHECKS].sort(byName)
    );
  });
});

describeValidationAddressPairing({
  title: 'every component rules address the producer emits is carried by a real control',
  producerFile: 'component/componentRulesValidation.js',
  tableName: 'COMPONENT_RULES_VALIDATION_CONTROLS',
  tablePattern:
    /export const COMPONENT_RULES_VALIDATION_CONTROLS = Object\.freeze\(\{([\s\S]*?)\n\}\);/u,
  addressPattern: /'([^']+)'/gu,
  expectedAddressCount: 5,
  expectation: 'the category select, the essences card, the result editor, routing and the DC',
  destinations: {
    'component-category': 'component/ComponentCategoryTagsCards.svelte',
    'component-essences': 'component/ComponentEssencesCard.svelte',
    'component-salvage-results': 'component/ComponentSalvageCard.svelte',
    'component-salvage-routing': 'component/ComponentSalvageCard.svelte',
    'component-progressive-dc': 'component/ComponentDifficultyCard.svelte',
  },
  routeNoun: 'tab',
  destinationNoun: 'card',
  focusProvenElsewhere: [
    'component-category',
    'component-salvage-routing',
    'component-progressive-dc',
  ],
});

describeValidationHostContract({
  title: 'ComponentEditView wires the row action in the order the mechanism needs',
  hostFile: 'ComponentEditView.svelte',
  tabComponent: 'ComponentRulesValidationTab',
  routeCall: 'activeTab = route',
  regionMarker: 'data-component-issue-announcement',
  regionOutsideNoun: 'tab chain',
  mustPrecede: [
    {
      marker: "{#if activeTab === 'rules'}",
      present: 'the tab chain must exist',
      order: 'the region sits outside the tab chain',
    },
  ],
});
