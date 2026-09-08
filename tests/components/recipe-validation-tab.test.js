import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-validation-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // recipeReadiness dispatches through the match-type registry, which reads
    // item flags — copy both so the harness module graph resolves.
    'src/config/flags.js',
    'src/models/match/matchTypes.js',
    'src/ui/svelte/apps/manager/recipe/recipeReadiness.js',
    // The tab localizes a signature-collision blocker row via this pure leaf (issue 549).
    'src/utils/recipeActivationMessages.js'
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    // Each issue row's "View" renders through the manager's push-button primitive
    // (issue 1118).
    'src/ui/svelte/components/ManagerButton.svelte',
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
    // Each blocking issue is merged into its owning check row (§E3): the row carries
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

  it('reads every check as a pass for a complete recipe', async () => {
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'g1' }] }
    });
    assert.equal(target.querySelector('[data-issue]'), null, 'no issue rows rendered');
    assert.ok(target.querySelector('[data-check].is-pass'), 'a passing check row renders');
    assert.equal(target.querySelector('.is-block'), null, 'no blocking rows on a complete recipe');
    harness.remount();
  });

  // The overlapping-requirement recipe: a component "Iron Ore" requirement AND a
  // "metal" tag requirement that Iron Ore satisfies — ambiguous overlap.
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

  // No harness rawModules/compiledModules change is needed: recipeReadiness and
  // the match-type registry it dispatches through are already copied above, so
  // overlap expansion resolves with the existing module graph.
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
    assert.equal(target.querySelector('[data-issue="requirementOverlap"]'), null, 'no overlap issue without a catalogue');
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

  it('reports an alchemy recipe with no blockers as ready (issue 549)', async () => {
    const target = await harness.mount({
      recipe: { name: 'Mana Potion', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'r1' }] },
      alchemy: { checkMode: 'simple' },
      signatureConflicts: []
    });
    assert.equal(target.querySelector('[data-issue="alchemyResultSelection"]'), null);
    assert.equal(target.querySelector('[data-issue="signatureCollision"]'), null);
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
  //
  // The surface calls `onSelectIssue(row.target, row.focusTarget)` — two positional
  // arguments. `target` is the ROUTE and `focusTarget` is the CONTROL: the value of a
  // `data-validation-target` attribute the offending control carries. This tab is the first
  // producer-backed host of the pair, and the second argument has to survive TWO hops the
  // route does not — `recipeReadiness` emitting it, and this tab threading it onto the row —
  // so a row that quietly lost it would still deep-link and still look correct.
  //
  // The assertions read the ARGUMENTS the surface passed, not the markup, because the defect
  // they exist to catch is an address that never leaves the producer.
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
    assert.equal(target.querySelector('[data-issue="unroutedResultGroup"]'), null, 'no routed warning off check-mode');
    assert.equal(target.querySelector('[data-issue="unproducedOutcomeTier"]'), null);
    assert.equal(target.querySelector('[data-check="routedResultGroupsRouted"]'), null, 'no routed checklist entry off check-mode');
    harness.remount();
  });
});

/**
 * THE SURFACE ITSELF, MOUNTED (issue 1517).
 *
 * The tab above is one of nine hosts, and it can only ever exercise the shapes ITS producer
 * emits: `recipeReadiness` gives every deep-linkable row a route, gives SOME of them a focus
 * target too (issue 1517), and gives no row its own verb. The row contract has three parts
 * this tab cannot reach — a row that carries ONLY a focus target and no route, a row that
 * carries its own accessible name, and the in-group order over a hand-authored mix of
 * statuses — so they are driven against the primitive directly, in the file that owns the
 * pair.
 *
 * Its own harness, per the two-harness idiom (`alchemy-columns-mounted.test.js`): a harness is
 * one temp tree and one `componentPath`, so a second component under test is a second harness
 * rather than a second `mount()` argument.
 */
describe('EditorValidationSurface row action (mounted)', () => {
  const surfaceHarness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-editor-validation-surface-',
    rawModules: ['src/ui/svelte/util/foundryBridge.js'],
    compiledModules: [
      'src/ui/svelte/components/Chip.svelte',
      'src/ui/svelte/components/ManagerButton.svelte',
      'src/ui/svelte/components/EditorValidationSurface.svelte'
    ],
    componentPath: 'src/ui/svelte/components/EditorValidationSurface.svelte'
  });

  // A WORLD'S TRANSLATION, not English. The surface's defaults are localization KEYS now, so a
  // fake that echoed the key back could not tell "resolved through `game.i18n`" from "the key
  // interpolated raw" — both render the dotted path. These two words can only appear on the
  // screen if the key reached `localize()`.
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

  // `Localization#format`'s REAL semantics — substitute each `{token}` from `data` into the
  // world's own string — rather than the shared harness's default stub, which returns
  // `key:{"subject":"…"}`. A stub looser than the helper it doubles passes whether or not the
  // surface resolved anything, and the whole subject of the clause below is what came out.
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

  it('lifts blocking rows to the top of their own group and moves nothing else', async () => {
    // The NARROW rank: block to 0, everything else to 1. A three-rank sort would put `warnB`
    // ahead of `passA` here, and no sort at all would leave the authored order untouched — so
    // this fixture tells all three apart. The second group proves the sort is per GROUP:
    // `blockD` rises inside its own group and does not join `blockC` at the top of the surface.
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

    // The site's own hook carries the ROUTE, so a row with no route carries no hook. Stated
    // rather than silent: a hook that quietly went missing is what this suite exists to report.
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
