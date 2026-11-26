import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iterativeRecipeReadiness } from '../../src/ui/svelte/apps/manager/recipe/iterative/iterativeRecipeReadiness.js';
import { shippedString } from '../helpers/manager/managerLocalization.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { describeValidationHostContract } from '../helpers/validationAddressContracts.js';
import { railCounts, tallyMatchingRail } from '../helpers/validationSurfaceReadings.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-validation-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // recipeReadiness dispatches through the match-type registry.
    'src/config/flags.js',
    'src/models/match/matchTypes.js',
    'src/ui/svelte/apps/manager/recipe/recipeReadiness.js',
    // …which reads the routed warnings off the routing model (issue 2511).
    'src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js',
    'src/utils/routedOutcomeKeywords.js',
    'src/utils/failureResultPolicy.js',
    // …which reads a result choice group's problems through its edits (issue 1773).
    'src/ui/svelte/components/resultGroupEdits.js',
    'src/ui/svelte/util/draftId.js',
    'src/ui/svelte/components/pickerRowKinds.js',
    'src/utils/choiceGroupShape.js',
    'src/utils/rollFormulaRollability.js',
    // The tab localizes a signature-collision blocker row via this pure leaf (issue 549).
    'src/utils/recipeActivationMessages.js',
    'src/utils/scalars.js',
    // The iterative rows' mapper, their words and their step numbers (issue 3010).
    'src/ui/svelte/apps/manager/recipe/iterative/iterativeRecipeReadiness.js',
    'src/ui/svelte/apps/manager/iterative/iterativeIssueCopy.js',
    'src/utils/fillPlaceholders.js'
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    // Each issue row's "View" renders through the manager's push-button primitive
    // (issue 1118).
    'src/ui/svelte/components/Button.svelte',
    // THE validation surface (issue 1444). This tab hands it the readiness and renders
    // none of the markup itself, so omitting it here CANCELS the suite.
    'src/ui/svelte/components/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte'
});

function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RecipeValidationTab (mounted)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('renders a readiness checklist with satisfied and unsatisfied checks', async () => {
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [] }
    });
    const nameCheck = target.querySelector('[data-check="hasName"]');
    const ingredientCheck = target.querySelector('[data-check="hasIngredientSet"]');
    const resultCheck = target.querySelector('[data-check="hasResultGroup"]');
    assert.equal(nameCheck.dataset.satisfied, 'true', 'name check satisfied');
    assert.equal(ingredientCheck.dataset.satisfied, 'true', 'ingredient check satisfied');
    assert.equal(resultCheck.dataset.satisfied, 'false', 'result check unsatisfied');
    harness.remount();
  });

  it('lists critical issues for a recipe missing requirements', async () => {
    const target = await harness.mount({
      recipe: { name: '', enabled: true, ingredientSets: [], resultGroups: [] }
    });
    // Each blocking issue is merged into its owning check row (§E3).
    // both the check and the issue id, and reads as a BLOCKS ENABLE (is-block) state.
    assert.ok(target.querySelector('[data-issue="noName"]'), 'noName issue listed');
    assert.ok(target.querySelector('[data-issue="noIngredientSet"]'), 'noIngredientSet issue listed');
    assert.ok(target.querySelector('[data-issue="noResultGroup"]'), 'noResultGroup issue listed');
    assert.ok(
      target.querySelector('[data-issue="noName"].is-block'),
      'a blocking issue reads as a BLOCKS ENABLE row'
    );
    harness.remount();
  });

  it('flags a repeated result id as a blocking row worded by the save path`s own message (issue 2713)', async () => {
    const target = await harness.mount({
      recipe: {
        name: 'Brew',
        enabled: true,
        ingredientSets: [{ id: 's1' }],
        resultGroups: [{ id: 'g1', results: [{ id: 'dup' }, { id: 'solo' }, { id: 'dup' }] }]
      }
    });
    const row = target.querySelector('[data-issue="resultDuplicate"]');
    assert.ok(Boolean(row), 'the duplicate has a row');
    assert.ok(row.classList.contains('is-block'), 'it blocks enable');
    assert.equal(row.dataset.check, 'noDuplicateResults', 'merged into its owning check');
    assert.match(
      row.textContent,
      /IssueResultDuplicate:.*"location":"Recipe".*"result":"3"/,
      'the save path`s message, labelled by the later duplicate`s position'
    );
    harness.remount();
  });

  // ── THE RAIL IS A TALLY OF THE ROWS (issue 1517, docs round) ─────────────────────────────
  const unnamedStepRecipe = {
    name: 'Refine Ore',
    enabled: true,
    steps: [
      { id: 'step-1', name: 'Crush', ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'r1' }] },
      { id: 'step-2', name: '', ingredientSets: [{ id: 's2' }], resultGroups: [{ id: 'r2' }] }
    ]
  };

  it('counts an unsatisfied check that raises NO issue, and does not call it all clear', async () => {
    const target = await harness.mount({ recipe: unnamedStepRecipe });

    assert.equal(
      target.querySelectorAll('[data-issue]').length,
      0,
      'the fixture raises no issue at all, which is what makes the divergence visible'
    );
    const stepsRow = target.querySelector('[data-check="stepsNamed"]');
    assert.ok(Boolean(stepsRow), 'the unnamed step draws its own row');
    assert.ok(
      stepsRow.classList.contains('is-warn'),
      `an unsatisfied check with no owning issue paints amber, got ${stepsRow.className}`
    );
    assert.equal(railCounts(target).warnings, 1, 'and the rail counts it, where it read 0');
    assert.deepEqual(
      tallyMatchingRail(target),
      railCounts(target),
      'the rail is a TALLY OF THE ROWS, so the two cannot disagree - which is the whole defect: ' +
        'a count is a reading of a result, and there were two readings'
    );
    assert.equal(
      target
        .querySelector('[data-editor-validation-summary]')
        .getAttribute('data-editor-validation-summary'),
      // The CALLER's own word, which this surface carries through verbatim on the hook while
      // resolving it to `is-warn` for the class. The point of the assertion is that it is not
      // `clear`.
      'warning',
      'and the verdict is not "All clear" over an amber row'
    );
    harness.remount();
  });

  it('reads every check as a pass for a complete recipe', async () => {
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'g1' }] }
    });
    assert.ok(target.querySelector('[data-issue]') === null, 'no issue rows rendered');
    assert.ok(target.querySelector('[data-check].is-pass'), 'a passing check row renders');
    assert.ok(target.querySelector('.is-block') === null, 'no blocking rows on a complete recipe');
    harness.remount();
  });

  // The overlapping-requirement recipe.
  const overlapRecipe = {
    name: 'Smelt',
    enabled: true,
    ingredientSets: [{
      id: 's1',
      ingredientGroups: [
        { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-iron-ore' } }] },
        { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
      ]
    }],
    resultGroups: [{ id: 'r1' }]
  };

  // No harness rawModules/compiledModules change is needed.
  it('warns about overlapping requirements when componentTagOptions are supplied', async () => {
    const target = await harness.mount({
      recipe: overlapRecipe,
      componentTagOptions: [{ id: 'cmp-iron-ore', tags: ['metal'] }]
    });
    const overlapIssue = target.querySelector('[data-issue="requirementOverlap"]');
    assert.ok(overlapIssue, 'overlap warning listed');
    assert.ok(overlapIssue.classList.contains('is-warn'), 'overlap reads as a WARNING, not a blocker');
    const overlapCheck = target.querySelector('[data-check="noRequirementOverlap"]');
    assert.equal(overlapCheck.dataset.satisfied, 'false', 'overlap check fails');
    harness.remount();
  });

  it('does not warn about overlap when componentTagOptions are absent', async () => {
    const target = await harness.mount({ recipe: overlapRecipe });
    assert.ok(
      target.querySelector('[data-issue="requirementOverlap"]') === null,
      'no overlap issue without a catalogue'
    );
    const overlapCheck = target.querySelector('[data-check="noRequirementOverlap"]');
    assert.equal(overlapCheck.dataset.satisfied, 'true', 'overlap check passes with no catalogue');
    harness.remount();
  });

  it('surfaces the alchemy result-selection and signature-collision blockers (issue 549)', async () => {
    const target = await harness.mount({
      recipe: {
        name: 'Mana Potion',
        enabled: true,
        ingredientSets: [{ id: 's1' }],
        resultGroups: [{ id: 'r1' }, { id: 'r2' }]
      },
      alchemy: { checkMode: 'simple' },
      signatureConflicts: [
        {
          code: 'signatureCollision',
          params: { recipeA: 'Mana Potion', recipeB: 'Healing Potion', setA: '1', setB: '1', components: 'Water' },
          message: 'Overlapping signatures between "Mana Potion" and "Healing Potion" (shared components: Water)'
        }
      ]
    });
    assert.ok(target.querySelector('[data-issue="alchemyResultSelection"]'), 'result-selection blocker row listed');
    const collision = target.querySelector('[data-issue="signatureCollision"]');
    assert.ok(collision, 'signature-collision blocker row listed');
    assert.match(collision.textContent, /Healing Potion/, 'names the other recipe');
    assert.match(collision.textContent, /Water/, 'names the shared component, not a raw id');
    assert.equal(target.querySelector('[data-check="noSignatureCollision"]').dataset.satisfied, 'false');
    assert.equal(target.querySelector('[data-check="alchemyResultSelection"]').dataset.satisfied, 'false');
    harness.remount();
  });

  it('flags a result teaching a recipe its system no longer holds (issue 1773)', async () => {
    const target = await harness.mount({
      recipe: {
        name: 'Teacher',
        enabled: true,
        ingredientSets: [{ id: 's1' }],
        resultGroups: [{ id: 'g1', results: [{ id: 'k', kind: 'knowledge', recipeId: 'r-gone' }] }]
      },
      systemRecipes: [{ id: 'r-teacher', name: 'Teacher' }]
    });
    const row = target.querySelector('[data-check="taughtRecipesResolve"]');
    assert.equal(row?.dataset.satisfied, 'false', 'the taught-recipe check fails');
    assert.match(
      target.querySelector('[data-issue="missingTaughtRecipe"]').textContent,
      /no longer in this system/,
      'and says why, with the set it names'
    );
    harness.remount();
  });

  it('flags a rolled choice of rewards with no selection roll and no ranges (issue 1773)', async () => {
    const target = await harness.mount({
      recipe: {
        name: 'Rewarding',
        enabled: true,
        ingredientSets: [{ id: 's1' }],
        resultGroups: [
          {
            id: 'g1',
            results: [
              { id: 'c', chooser: 'rolled', alternatives: [{ id: 'a', componentId: 'x' }, { id: 'b', componentId: 'y' }] }
            ]
          }
        ]
      }
    });
    assert.equal(target.querySelector('[data-check="choiceGroupsValid"]')?.dataset.satisfied, 'false');
    assert.match(target.querySelector('[data-check="choiceGroupsValid"]').textContent, /Every choice of rewards is complete/);
    assert.match(target.querySelector('[data-issue="choiceGroupRanges"]').textContent, /range of whole numbers on every alternative/);
    harness.remount();
  });

  it('words each choice-of-rewards problem as its own (issue 1773)', async () => {
    const pair = [{ id: 'a', componentId: 'x' }, { id: 'b', componentId: 'y' }];
    const target = await harness.mount({
      recipe: {
        name: 'Rewarding',
        enabled: true,
        ingredientSets: [{ id: 's1' }],
        resultGroups: [
          {
            id: 'g1',
            results: [
              { id: 'one', alternatives: [pair[0]] },
              { id: 'odd', alternatives: pair, chooser: 'gm' },
              { id: 'roll', alternatives: pair, chooser: 'rolled' },
              { id: 'many', alternatives: pair, awardStrategy: 'upTo' }
            ]
          }
        ]
      }
    });
    const said = (id) => target.querySelector(`[data-issue="${id}"]`)?.textContent ?? '';
    assert.match(said('choiceGroupTooFew'), /fewer than two alternatives/);
    assert.match(said('choiceGroupSettings'), /does not recognise/);
    assert.match(said('choiceGroupSelection'), /has no selection roll/);
    assert.match(said('choiceGroupRanges'), /no two overlapping/);
    assert.match(said('choiceGroupCount'), /needs one count/);
    harness.remount();
  });

  it('flags a choice of rewards in a progressive system’s result set (issue 1773)', async () => {
    const target = await harness.mount({
      recipe: {
        name: 'Staged',
        enabled: true,
        ingredientSets: [{ id: 's1' }],
        resultGroups: [{ id: 'g1', results: [{ id: 'c', alternatives: [{ id: 'a', componentId: 'x' }, { id: 'b', componentId: 'y' }] }] }]
      },
      progressive: true
    });
    assert.equal(target.querySelector('[data-check="choiceGroupsValid"]')?.dataset.satisfied, 'false');
    assert.match(target.querySelector('[data-check="choiceGroupsValid"]').textContent, /awards every stage in order/);
    harness.remount();
  });

  it('reports an alchemy recipe with no blockers as ready (issue 549)', async () => {
    const target = await harness.mount({
      recipe: { name: 'Mana Potion', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'r1' }] },
      alchemy: { checkMode: 'simple' },
      signatureConflicts: []
    });
    assert.ok(target.querySelector('[data-issue="alchemyResultSelection"]') === null);
    assert.ok(target.querySelector('[data-issue="signatureCollision"]') === null);
    assert.equal(target.querySelector('[data-check="noSignatureCollision"]').dataset.satisfied, 'true');
    assert.equal(target.querySelector('[data-check="alchemyResultSelection"]').dataset.satisfied, 'true');
    harness.remount();
  });

  it("fires onSelectIssue with the issue's deep-link target when View is clicked", async () => {
    const targets = [];
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [], resultGroups: [{ id: 'g1' }] },
      onSelectIssue: (deepLink) => targets.push(deepLink)
    });
    const view = target.querySelector('[data-issue="noIngredientSet"] [data-recipe-issue-view]');
    assert.ok(view, 'a View button renders on the ingredient issue');
    view.click();
    await flushRender();
    assert.deepEqual(targets, ['ingredients'], 'View deep-links to the Ingredients tab');
    harness.remount();
  });

  // A check-routed recipe whose result groups do not cover every authored success
  // tier: 'g-good' routes 't-good', but 't-great' is unproduced and 'g-orphan'
  // routes nothing. Both warnings deep-link to the results tab.
  const routedOutcomeTierOptions = [
    { id: 't-good', name: 'Good' },
    { id: 't-great', name: 'Great' }
  ];
  const routedRecipe = {
    name: 'Routed Brew',
    enabled: true,
    ingredientSets: [{ id: 's1' }],
    resultGroups: [
      { id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] },
      { id: 'g-orphan', name: 'Orphan', checkOutcomeIds: [] }
    ]
  };

  it('lists routed check-mode warnings that deep-link to the results tab', async () => {
    const targets = [];
    const target = await harness.mount({
      recipe: routedRecipe,
      routingProvider: 'check',
      routedOutcomeTierOptions,
      onSelectIssue: (deepLink) => targets.push(deepLink)
    });
    assert.ok(target.querySelector('[data-issue="unroutedResultGroup"]'), 'unrouted group warning listed');
    assert.ok(target.querySelector('[data-issue="unproducedOutcomeTier"]'), 'unproduced tier warning listed');
    assert.ok(target.querySelector('[data-issue="unroutedResultGroup"]').classList.contains('is-warn'), 'unrouted reads as a WARNING');
    assert.equal(target.querySelector('[data-check="routedResultGroupsRouted"]').dataset.satisfied, 'false');
    assert.equal(target.querySelector('[data-check="routedOutcomeTiersProduced"]').dataset.satisfied, 'false');

    const view = target.querySelector('[data-issue="unroutedResultGroup"] [data-recipe-issue-view]');
    assert.ok(view, 'a View button renders on the routed warning');
    view.click();
    await flushRender();
    assert.deepEqual(targets, ['results'], 'View deep-links to the Results tab');
    harness.remount();
  });

  // ── THE ROW ACTION'S SECOND ARGUMENT (issue 1517) ──────────────────────────────────────
  const rowActionArgs = (calls) => calls.map((call) => call.slice(0, 2));

  it('passes the offending result set’s own address alongside the route', async () => {
    const calls = [];
    const target = await harness.mount({
      recipe: routedRecipe,
      routingProvider: 'check',
      routedOutcomeTierOptions,
      onSelectIssue: (...args) => calls.push(args)
    });
    target.querySelector('[data-issue="unroutedResultGroup"] [data-recipe-issue-view]').click();
    await flushRender();
    assert.deepEqual(
      rowActionArgs(calls),
      [['results', 'result-group-g-orphan']],
      'the address names the result set that is actually unrouted, not merely its tab'
    );
    harness.remount();
  });

  it('passes the name input’s address for the blocked-name row', async () => {
    const calls = [];
    const target = await harness.mount({
      recipe: { ...routedRecipe, name: '' },
      routingProvider: 'check',
      routedOutcomeTierOptions,
      onSelectIssue: (...args) => calls.push(args)
    });
    target.querySelector('[data-issue="noName"] [data-recipe-issue-view]').click();
    await flushRender();
    assert.deepEqual(rowActionArgs(calls), [['overview', 'recipe-name']]);
    harness.remount();
  });

  it('passes an EMPTY second argument for a row with no addressable control', async () => {
    // ROUTE-ONLY IS A STATED OUTCOME. `unproducedOutcomeTier`'s subject is a tier that NO
    // result set produces, so no one set is the offender and there is nothing to focus. The
    // row still renders its View button and still changes route; asserting which of the two
    // it is means a `focusTarget` going missing from a row that should have one reds here,
    // rather than degrading into a tab switch that focuses nothing.
    const calls = [];
    const target = await harness.mount({
      recipe: routedRecipe,
      routingProvider: 'check',
      routedOutcomeTierOptions,
      onSelectIssue: (...args) => calls.push(args)
    });
    target.querySelector('[data-issue="unproducedOutcomeTier"] [data-recipe-issue-view]').click();
    await flushRender();
    assert.deepEqual(rowActionArgs(calls), [['results', '']]);
    harness.remount();
  });

  it('does not list routed warnings off check-mode routing', async () => {
    const target = await harness.mount({
      recipe: routedRecipe,
      routingProvider: 'ingredientSet',
      routedOutcomeTierOptions
    });
    assert.ok(
      target.querySelector('[data-issue="unroutedResultGroup"]') === null,
      'no routed warning off check-mode'
    );
    assert.ok(target.querySelector('[data-issue="unproducedOutcomeTier"]') === null);
    assert.ok(
      target.querySelector('[data-check="routedResultGroupsRouted"]') === null,
      'no routed checklist entry off check-mode'
    );
    harness.remount();
  });

  // Issue 2513: a result set no ingredient set reaches, under ingredient routing.
  it('lists an unreachable result set as a warning row that focuses that set', async () => {
    const calls = [];
    const target = await harness.mount({
      recipe: {
        name: 'Routed Brew',
        enabled: true,
        ingredientSets: [{ id: 's1', resultGroupId: 'g-good' }],
        resultGroups: [{ id: 'g-good' }, { id: 'g-orphan' }]
      },
      routingProvider: 'ingredientSet',
      onSelectIssue: (...args) => {
        calls.push(args);
      }
    });
    const check = target.querySelector('[data-check="routedResultGroupsReachable"]');
    assert.equal(check.dataset.satisfied, 'false');
    assert.match(check.textContent, /Every result set is reached by an ingredient set/);
    assert.ok(check.classList.contains('is-warn'), 'it reads as a warning, not a blocker');
    check.querySelector('[data-recipe-issue-view]').click();
    await flushRender();
    assert.deepEqual(rowActionArgs(calls), [['results', 'result-group-g-orphan']]);
    harness.remount();
  });

  it('lists a failure-role result set no ingredient set reaches as the same warning row', async () => {
    const calls = [];
    const target = await harness.mount({
      recipe: {
        name: 'Routed Brew',
        enabled: true,
        ingredientSets: [{ id: 's1', resultGroupId: 'g-good' }],
        resultGroups: [{ id: 'g-good' }, { id: 'g-fail', role: 'failure' }]
      },
      routingProvider: 'ingredientSet',
      onSelectIssue: (...args) => {
        calls.push(args);
      }
    });
    const check = target.querySelector('[data-check="routedResultGroupsReachable"]');
    assert.equal(check.dataset.satisfied, 'false');
    assert.ok(check.classList.contains('is-warn'), 'it reads as a warning, not a blocker');
    check.querySelector('[data-recipe-issue-view]').click();
    await flushRender();
    assert.deepEqual(rowActionArgs(calls), [['results', 'result-group-g-fail']]);
    harness.remount();
  });

  // ── AN ITERATIVE RECIPE (issue 3010) ──────────────────────────────────────────────────────
  describe('an iterative recipe', () => {
    let original;
    before(() => {
      original = globalThis.game.i18n.localize;
      globalThis.game.i18n.localize = shippedString;
    });
    after(() => {
      globalThis.game.i18n.localize = original;
    });

    const sword = {
      name: 'Etched Sword',
      enabled: true,
      steps: [
        { id: 'heat', name: 'Heat the blank', ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'g1' }] },
        { id: 'etch', name: 'Etch the fuller', ingredientSets: [{ id: 's2' }], resultGroups: [{ id: 'g2' }] }
      ]
    };
    const steps = [
      { index: 0, id: 'heat', name: 'Heat the blank' },
      { index: 1, id: 'etch', name: 'Etch the fuller' }
    ];
    const issue = (code, stepIndex, severity = 'critical') => ({
      kind: 'recipe', entityKind: 'recipe', entityId: 'r', entityName: 'Etched Sword', code, stepIndex, severity
    });
    const groupIds = (target) =>
      [...target.querySelectorAll('[data-validation-group]')].map((group) => group.dataset.validationGroup);
    const rowOf = (target, issueId) => target.querySelector(`[data-issue="${issueId}"]`);

    it('opens with Steps, prefixes each row with its step or library entry, and passes the rest', async () => {
      const target = await harness.mount({
        recipe: sword,
        iterativeReadiness: {
          steps,
          issues: [
            issue('iterativeNoSuccessRule', 1),
            issue('iterativeSuccessLineOnFailureGroup', 0, 'warning'),
            {
              kind: 'system', entityKind: 'counter', entityId: 'heat', entityName: 'Heat',
              code: 'iterativeInvalidNumber', severity: 'critical'
            }
          ]
        }
      });
      assert.deepEqual(groupIds(target), ['steps', 'ingredients', 'results', 'requirements']);
      const stepsGroup = target.querySelector('[data-validation-group="steps"]');
      assert.match(stepsGroup.querySelector('.manager-recipe-val-group-label').textContent, /Steps/);
      assert.ok(stepsGroup.querySelector('.fa-list-ol'));

      const counters = target.querySelector('[data-check="iterativeCounters"]');
      assert.equal(counters.querySelector('.manager-recipe-val-title').textContent, 'Counters are set up');
      assert.ok(counters.classList.contains('is-pass'));
      assert.equal(
        target.querySelector(':scope [data-check="iterativeStep:0"] .manager-recipe-val-title')
          .textContent,
        'Step 1, Heat the blank: counters, end rules and routes resolve'
      );

      const noRule = rowOf(target, 'iterativeNoSuccessRule:1');
      assert.equal(noRule.dataset.check, 'iterativeStep:1', 'its step check claims it');
      assert.equal(
        noRule.querySelector('.manager-recipe-val-detail').textContent,
        'Etch the fuller: A step has no success rule yet, so it needs iterative setup.'
      );
      const library = rowOf(target, 'iterativeInvalidNumber:counter:heat');
      assert.ok(stepsGroup.contains(library), 'an Overview issue no check claims joins Steps');
      assert.equal(
        library.querySelector('.manager-recipe-val-title').textContent,
        'Heat: A counter start, start formula, bound or target cannot be read.'
      );
      assert.ok(library.classList.contains('is-block'));
      const onFailure = rowOf(target, 'iterativeSuccessLineOnFailureGroup:0');
      assert.equal(onFailure.dataset.check, 'iterativeStep:0', 'the step check holds its warning');
      assert.ok(onFailure.classList.contains('is-warn'));

      assert.equal(target.querySelector('[data-recipe-count-blocking]').textContent.match(/\d+/)[0], '2');
      assert.equal(target.querySelector('[data-recipe-count-warnings]').textContent.match(/\d+/)[0], '1');
      assert.ok(
        rowOf(target, 'iterativeNoSuccessRule:1').querySelector('.manager-recipe-val-pill.is-danger'),
        'a blocking row draws a danger chip'
      );
      assert.ok(onFailure.querySelector('.manager-recipe-val-pill.is-warning'), 'a warning row draws a warning chip');
      assert.ok(counters.querySelector('.manager-recipe-val-pill.is-positive'), 'a passing row draws a positive chip');
      harness.remount();
    });

    it('falls back to the issue’s own message, never its code, when its key is missing', async () => {
      globalThis.game.i18n.localize = (key) => key;
      try {
        const message = 'A step has no success rule yet, so it needs iterative setup.';
        const target = await harness.mount({
          recipe: sword,
          iterativeReadiness: { steps, issues: [{ ...issue('iterativeNoSuccessRule', 1), message }] }
        });
        assert.equal(
          rowOf(target, 'iterativeNoSuccessRule:1').querySelector('.manager-recipe-val-detail').textContent,
          `Etch the fuller: ${message}`
        );
      } finally {
        globalThis.game.i18n.localize = shippedString;
        harness.remount();
      }
    });

    it('hands each row its route and the control it names', async () => {
      const calls = [];
      const target = await harness.mount({
        recipe: sword,
        iterativeReadiness: {
          steps,
          issues: [issue('iterativeNoCounters', null), issue('iterativeNoSuccessRule', 1), issue('iterativeUnknownAction', 0), issue('iterativeFinalStepProducesNothing', 1, 'warning')]
        },
        onSelectIssue: (...args) => {
          calls.push(args);
        }
      });
      for (const id of ['iterativeNoCounters:recipe', 'iterativeNoSuccessRule:1', 'iterativeUnknownAction:0', 'iterativeFinalStepProducesNothing:1']) {
        rowOf(target, id).querySelector('[data-recipe-issue-view]').click();
      }
      await flushRender();
      assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
        ['overview', 'iterative-counters-add'],
        ['overview', 'iterative-step-1-success'],
        ['overview', 'iterative-step-0-actions'],
        ['results', '']
      ]);
      harness.remount();
    });

    const counterIssue = (code, counterId, counterName = counterId) => ({
      ...issue(code, null), counterId, counterName
    });
    const actionIssue = (code, stepIndex, actionName) => ({
      ...issue(code, stepIndex), actionName
    });

    it('names the counter or action each addressed issue concerns (issue 3038)', async () => {
      const target = await harness.mount({
        recipe: sword,
        iterativeReadiness: {
          steps,
          counterIds: ['heat'],
          issues: [
            counterIssue('iterativeUnknownCounter', 'rust'),
            counterIssue('iterativeBoundsInverted', 'heat', 'Heat'),
            actionIssue('iterativeUnknownAction', 0, 'anneal'),
            actionIssue('iterativeCheckUnavailable', null, 'Stoke')
          ]
        }
      });
      // A check's row carries its issue's sentence as the detail, and an issue no check claims as its title.
      const sentence = (id) => {
        const row = rowOf(target, id);
        return (row.querySelector('.manager-recipe-val-detail') ?? row.querySelector('.manager-recipe-val-title')).textContent;
      };
      assert.equal(sentence('iterativeUnknownCounter:recipe'), 'rust is not a counter this recipe can use.');
      assert.equal(
        sentence('iterativeBoundsInverted:recipe'),
        'The minimum of Heat is above its maximum.'
      );
      assert.equal(sentence('iterativeUnknownAction:0'), 'Heat the blank: anneal is not a crafting action in this system.');
      assert.equal(sentence('iterativeCheckUnavailable:recipe'), 'Stoke rolls a check, but the routed crafting check has no roll formula.');
      harness.remount();
    });

    it('reads the unnamed sentence for an issue that carries no name', async () => {
      const target = await harness.mount({
        recipe: sword,
        iterativeReadiness: { steps, issues: [issue('iterativeUnknownCounter', null)] }
      });
      assert.equal(
        rowOf(target, 'iterativeUnknownCounter:recipe').querySelector('.manager-recipe-val-detail').textContent,
        'A counter reference names a counter that does not exist.'
      );
      harness.remount();
    });

    it('hands View the counter row of an addressed Counter Instance, else the counters section (issue 3038)', async () => {
      const calls = [];
      const target = await harness.mount({
        recipe: sword,
        iterativeReadiness: {
          steps,
          counterIds: ['rust', 'heat'],
          issues: [
            counterIssue('iterativeUnknownCounter', 'rust'),
            counterIssue('iterativeBoundsInverted', 'heat', 'Heat'),
            counterIssue('iterativeInvalidNumber', 'slag'),
            counterIssue('iterativeExpressionBoundUnset', 'rust'),
            actionIssue('iterativeUnknownAction', 0, 'anneal')
          ]
        },
        onSelectIssue: (...args) => {
          calls.push(args);
        }
      });
      for (const id of ['iterativeUnknownCounter:recipe', 'iterativeBoundsInverted:recipe', 'iterativeInvalidNumber:recipe', 'iterativeExpressionBoundUnset:recipe', 'iterativeUnknownAction:0']) {
        rowOf(target, id).querySelector('[data-recipe-issue-view]').click();
      }
      await flushRender();
      assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
        ['overview', 'iterative-counter-rust'],
        ['overview', 'iterative-counter-heat'],
        ['overview', 'iterative-counters'],
        ['overview', ''],
        ['overview', 'iterative-step-0-actions']
      ]);
      harness.remount();
    });

    it('hands View the step configuration for a counter fault under a step check (issue 3038)', () => {
      const { issues } = iterativeRecipeReadiness({
        counterIds: ['heat'],
        steps,
        issues: [{ ...counterIssue('iterativeUnknownCounter', 'rust'), stepIndex: 1 }]
      });
      assert.equal(issues[0].focusTarget, 'iterative-step-1');
    });

    it('forwards counterId, counterName and actionName, and never an actionId (issue 3038)', () => {
      const input = {
        counterIds: ['heat'],
        steps,
        issues: [
          counterIssue('iterativeBoundsInverted', 'heat', 'Heat'),
          { ...actionIssue('iterativeUnknownAction', 0, 'Anneal'), actionId: 'anneal' },
          issue('iterativeNoCounters', null)
        ]
      };
      const [counter, action, bare] = iterativeRecipeReadiness(input).issues;
      assert.equal(counter.counterId, 'heat');
      assert.equal(counter.counterName, 'Heat');
      assert.equal(action.actionName, 'Anneal');
      assert.ok(!Object.hasOwn(action, 'actionId'), 'the mapped issue carries no actionId');
      assert.ok(!Object.hasOwn(action, 'counterId'));
      for (const key of ['counterId', 'counterName', 'actionName']) {
        assert.ok(!Object.hasOwn(bare, key), `an unaddressed issue carries no ${key}`);
      }
    });

    it('hands View the counters section for an addressed issue when the input carries no counterIds', () => {
      const { issues } = iterativeRecipeReadiness({
        steps,
        issues: [counterIssue('iterativeBoundsInverted', 'heat', 'Heat')]
      });
      assert.equal(issues[0].focusTarget, 'iterative-counters');
    });

    it('reads a ready single-step recipe as pass rows with nothing blocking', async () => {
      const target = await harness.mount({
        recipe: { name: 'Tempered Blade', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'rg' }] },
        iterativeReadiness: { steps: [], issues: [] }
      });
      const rows = [...target.querySelectorAll(':scope [data-validation-group="steps"] [data-check]')];
      assert.deepEqual(
        rows.map((row) => [row.dataset.check, row.querySelector('.manager-recipe-val-title').textContent]),
        [
          ['iterativeCounters', 'Counters are set up'],
          ['iterativeStep:single', 'The step’s counters, end rules and routes resolve']
        ]
      );
      assert.ok(rows.every((row) => row.classList.contains('is-pass')));
      const chips = [...target.querySelectorAll('.manager-recipe-val-pill')];
      assert.ok(chips.length > 0 && chips.every((chip) => chip.classList.contains('is-positive')), 'every chip is positive');
      assert.equal(target.querySelector('[data-recipe-validation-summary]').dataset.recipeValidationSummary, 'clear');
      harness.remount();
    });
  });
});

/** THE SURFACE ITSELF, MOUNTED (issue 1517). */
describe('EditorValidationSurface row action (mounted)', () => {
  const surfaceHarness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-editor-validation-surface-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
    compiledModules: [
      'src/ui/svelte/components/Chip.svelte',
      'src/ui/svelte/components/Kicker.svelte',
      'src/ui/svelte/components/Button.svelte',
      'src/ui/svelte/components/EditorValidationSurface.svelte'
    ],
    componentPath: 'src/ui/svelte/components/EditorValidationSurface.svelte'
  });

  // A WORLD'S TRANSLATION, not English. The surface's defaults are localization KEYS now.
  const TRANSLATIONS = {
    'FABRICATE.Admin.Manager.Validation.View': 'Ver',
    // The SHIPPED shape: two tokens, and the verb is one of them. A pattern hard-coding the verb
    // here would green a surface that hard-codes it too, which is the whole defect.
    'FABRICATE.Admin.Manager.Validation.ViewNamed': '{action}: {subject}',
    'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewTask': 'Ver tarea'
  };

  const groupOf = (id, rows) => ({ id, icon: 'fas fa-list-check', label: id, rows });
  const rowIds = (scope) =>
    [...scope.querySelectorAll('.manager-recipe-val-row')].map((row) => row.dataset.check);

  // `Localization#format`'s REAL semantics.
  const formatFake = (key, data) =>
    Object.entries(data ?? {}).reduce(
      (phrase, [token, value]) => phrase.replaceAll(`{${token}}`, String(value)),
      TRANSLATIONS[key] ?? key
    );

  const foundryI18n = {};

  before(async () => {
    await surfaceHarness.setup();
    // RESTORED in `after`. The globals are installed once per process and this describe happens
    // to be last in the file today, so a leak is invisible until it is not.
    foundryI18n.localize = globalThis.game.i18n.localize;
    foundryI18n.format = globalThis.game.i18n.format;
    globalThis.game.i18n.localize = (key) => TRANSLATIONS[key] ?? key;
    globalThis.game.i18n.format = formatFake;
  });

  after(() => {
    Object.assign(globalThis.game.i18n, foundryI18n);
    surfaceHarness.teardown();
  });

  it('tones each status chip by its severity and keeps the status class as a hook (issue 3037)', async () => {
    const target = await surfaceHarness.mount({
      groups: [
        groupOf('checks', [
          { id: 'passA', status: 'pass', title: 'A' },
          { id: 'warnB', status: 'warn', title: 'B' },
          { id: 'blockC', status: 'block', title: 'C' }
        ])
      ]
    });
    const chipOf = (id) => target.querySelector(`[data-check="${id}"] .manager-recipe-val-pill`);
    for (const [id, tone, status] of [
      ['passA', 'is-positive', 'is-pass'],
      ['warnB', 'is-warning', 'is-warn'],
      ['blockC', 'is-danger', 'is-block']
    ]) {
      assert.ok(chipOf(id).classList.contains(tone), `${id} draws the ${tone} chip`);
      assert.ok(chipOf(id).classList.contains(status), `${id} keeps ${status} as a hook`);
      assert.ok(!chipOf(id).classList.contains('is-neutral'), `${id} is never the neutral chip`);
    }
    assert.ok(
      target.querySelector(':scope .manager-recipe-val-group-label .fab-kicker'),
      'the group label draws through Kicker'
    );
    surfaceHarness.remount();
  });

  it('lifts blocking rows to the top of their own group and moves nothing else', async () => {
    // The NARROW rank: block to 0, everything else to 1. A three-rank sort would put `warnB`
    // ahead of `passA` here, and no sort at all would leave the authored order untouched — so
    // this fixture tells all three apart. The second group proves the sort is per GROUP:
    const target = await surfaceHarness.mount({
      title: 'Validation',
      groups: [
        groupOf('checks', [
          { id: 'passA', status: 'pass', title: 'A' },
          { id: 'warnB', status: 'warn', title: 'B' },
          { id: 'blockC', status: 'block', title: 'C' },
          { id: 'passE', status: 'pass', title: 'E' }
        ]),
        groupOf('roles', [
          { id: 'passF', status: 'pass', title: 'F' },
          { id: 'blockD', status: 'block', title: 'D' }
        ])
      ]
    });
    assert.deepEqual(
      rowIds(target.querySelector('[data-validation-group="checks"]')),
      ['blockC', 'passA', 'warnB', 'passE'],
      'the blocking row rises and the other three keep the order the site authored'
    );
    assert.deepEqual(
      rowIds(target.querySelector('[data-validation-group="roles"]')),
      ['blockD', 'passF'],
      'the second group sorts on its own rows'
    );
    assert.deepEqual(
      rowIds(target),
      ['blockC', 'passA', 'warnB', 'passE', 'blockD', 'passF'],
      'and the groups themselves keep their authored order'
    );
    surfaceHarness.remount();
  });

  it('lists every issue before the passes when a site asks for issues first (issue 2130)', async () => {
    const target = await surfaceHarness.mount({
      issuesFirst: true,
      groups: [
        groupOf('checks', [
          { id: 'passA', status: 'pass', title: 'A' },
          { id: 'warnB', status: 'warn', title: 'B' },
          { id: 'blockC', status: 'block', title: 'C' },
          { id: 'passE', status: 'pass', title: 'E' },
          { id: 'warnF', status: 'warn', title: 'F' }
        ])
      ]
    });
    assert.deepEqual(
      rowIds(target),
      ['blockC', 'warnB', 'warnF', 'passA', 'passE'],
      'blocking, then warning, then pass, each rank keeping the order the site authored'
    );
    surfaceHarness.remount();
  });

  it('renders the row action for either half of the contract, and for neither half not at all', async () => {
    const target = await surfaceHarness.mount({
      viewDataAttr: 'data-validation-view',
      groups: [
        groupOf('checks', [
          { id: 'routeOnly', status: 'block', title: 'Route only', target: 'ingredients' },
          { id: 'focusOnly', status: 'warn', title: 'Focus only', focusTarget: 'recipe-name' },
          {
            id: 'both',
            status: 'warn',
            title: 'Both',
            target: 'results',
            focusTarget: 'result-group-1'
          },
          { id: 'neither', status: 'pass', title: 'Neither' }
        ])
      ]
    });
    const action = (check) =>
      target.querySelector(`[data-check="${check}"] .manager-recipe-val-view`);
    assert.ok(action('routeOnly'), 'a row carrying only a route still deep-links');
    assert.ok(
      action('focusOnly'),
      'a row carrying only a focus target renders the action too — the button is what moves ' +
        'focus to the offending control, and a row that names one has somewhere to send it'
    );
    assert.ok(action('both'), 'a row carrying both renders one button, not two');
    assert.equal(
      action('neither'),
      null,
      'and a row that names neither has nothing to view, so it draws no button at all'
    );

    // The site's own hook carries the ROUTE.
    assert.equal(action('routeOnly').getAttribute('data-validation-view'), 'ingredients');
    assert.equal(action('both').getAttribute('data-validation-view'), 'results');
    assert.ok(!action('focusOnly').hasAttribute('data-validation-view'));
    surfaceHarness.remount();
  });

  it('hands the host the route and the focus target, positionally and in that order', async () => {
    const calls = [];
    const target = await surfaceHarness.mount({
      groups: [
        groupOf('checks', [
          { id: 'routeOnly', status: 'block', title: 'Route only', target: 'ingredients' },
          { id: 'focusOnly', status: 'warn', title: 'Focus only', focusTarget: 'recipe-name' },
          {
            id: 'both',
            status: 'warn',
            title: 'Both',
            target: 'results',
            focusTarget: 'result-group-1'
          }
        ])
      ],
      onSelectIssue: (...args) => calls.push(args)
    });
    for (const check of ['routeOnly', 'focusOnly', 'both']) {
      target.querySelector(`[data-check="${check}"] .manager-recipe-val-view`).click();
      await flushRender();
    }
    assert.deepEqual(
      calls,
      [
        ['ingredients', undefined],
        [undefined, 'recipe-name'],
        ['results', 'result-group-1']
      ],
      'TWO POSITIONAL ARGUMENTS, route first. The route is what brings the destination into ' +
        'the DOM and the focus target is what is focused once it is there, so a host that ' +
        'reads argument 0 as the route keeps working unchanged and a host that wants the ' +
        'control reads argument 1.'
    );
    surfaceHarness.remount();
  });

  it("names the button from the world's translation, and lets a row override the name", async () => {
    const target = await surfaceHarness.mount({
      groups: [
        groupOf('checks', [
          { id: 'plain', status: 'block', title: 'Plain', target: 'ingredients' },
          {
            id: 'named',
            status: 'warn',
            title: 'Named',
            target: 'tasks',
            viewLabel: 'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewTask'
          }
        ])
      ]
    });
    const nameOf = (check) =>
      target.querySelector(`[data-check="${check}"] .manager-recipe-val-view`).textContent.trim();
    assert.equal(
      nameOf('plain'),
      'Ver',
      "the surface resolves its own default key, so the button is named in the world's " +
        'language rather than in the English a `$props()` default can only ever be'
    );
    assert.equal(
      nameOf('named'),
      'Ver tarea',
      'and a row that carries its own key wins, which is what keeps two different verbs ' +
        'distinguishable down one list'
    );
    surfaceHarness.remount();
  });

  it('gives every row action an accessible name carrying that row’s subject', async () => {
    // WHAT A SCREEN READER GETS, which is not what the eye gets. `recipeReadiness` routes an
    // issue at eleven sites, so a validation tab of routed rows announced by its visible text
    // alone is "View, button… View, button… View, button…" — the row's subject sits in a SIBLING
    // element, reachable only in linear reading mode, and the `data-*` hook beside the button
    // carries the route rather than the subject and is invisible to assistive technology either
    // way. This is the commit that installs one shared default name for every surface that
    // renders the primitive, so the clause belongs to the primitive.
    const target = await surfaceHarness.mount({
      groups: [
        groupOf('checks', [
          { id: 'noResultGroup', status: 'block', title: 'Add a result group', target: 'results' },
          { id: 'noName', status: 'warn', title: 'Name this recipe', target: 'overview' },
          {
            id: 'task',
            status: 'warn',
            title: 'Gather herbs',
            target: 'tasks',
            viewLabel: 'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewTask'
          }
        ])
      ]
    });
    const action = (check) =>
      target.querySelector(`[data-check="${check}"] .manager-recipe-val-view`);
    assert.equal(
      action('noResultGroup').getAttribute('aria-label'),
      'Ver: Add a result group',
      'the name is the row TITLE composed into a translated pattern, so two buttons on one tab ' +
        'are told apart by what they lead to rather than by their position in the list'
    );
    assert.equal(
      action('noName').getAttribute('aria-label'),
      'Ver: Name this recipe',
      'every row that draws the action gets one, not just the blocking ones'
    );
    assert.equal(
      action('noName').textContent.trim(),
      'Ver',
      'and the VISIBLE word is untouched. The visible verb is the per-row override seam a later ' +
        'phase needs for a two-verb list; naming the button is a different job and must not ' +
        'consume it'
    );

    // THE OVERRIDDEN VERB, which is what makes this WCAG 2.5.3-safe rather than merely
    // descriptive. A name hard-coding the default verb would read "Ver: Gather herbs" beside a
    // visible "Ver tarea" — a visible label the accessible name does not contain, so a
    // speech-input user saying the words on the button hits nothing. The pattern's `{action}` is
    // fed from the same expression as the visible child, so containment holds by construction.
    assert.equal(
      action('task').textContent.trim(),
      'Ver tarea',
      'the row overrides its visible verb'
    );
    assert.equal(
      action('task').getAttribute('aria-label'),
      'Ver tarea: Gather herbs',
      'and its accessible name leads with THAT verb, not the surface default'
    );
    for (const check of ['noResultGroup', 'noName', 'task']) {
      assert.ok(
        action(check).getAttribute('aria-label').includes(action(check).textContent.trim()),
        `${check}: the accessible name must CONTAIN the visible label (WCAG 2.5.3). Asserted ` +
          'over every row rather than only the overriding one, so the property is the invariant ' +
          'rather than a fact about one fixture'
      );
    }
    surfaceHarness.remount();
  });
});

// THE HOST HALF, WHICH NOTHING READ (issue 1517, review r2). Four of the five hosts registered
// this contract and the recipe editor — the oldest of them, and the one every other conversion was
// modelled on — did not, so its ordering was guarded by nothing: deferring `activeTab = route`
// into a microtask, which is precisely the mistake the ordering exists to prevent, left the whole
// suite green. The clauses are the same five, over this host's own facts.
describeValidationHostContract({
  title: 'RecipeEditView wires the row action in the order the mechanism needs',
  hostFile: 'RecipeEditView.svelte',
  tabComponent: 'RecipeValidationTab',
  routeCall: 'activeTab = route',
  regionMarker: 'data-recipe-issue-announcement',
  regionOutsideNoun: 'record guard and tab chain',
  mustPrecede: [
    {
      marker: '{#if recipe}',
      present: 'the record guard must exist',
      order: 'the region sits outside the record guard'
    },
    {
      marker: "{#if activeTab === 'overview'}",
      present: 'the tab chain must exist',
      order: 'and outside the tab chain'
    }
  ]
});
