<!--
  The recipe Overview's routing card: one `RoutingOverview` per step scope, each row a source and
  the result set it effectively produces, re-pointed in place through the fields the set card
  writes. It draws nothing outside the two routed modes.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `recipe` | the staged draft | `null` | Read through `routingScopes`. |
  | `collapsed` | boolean | `false` | A collapsed chain draws its final step. |
  | `routing` | `{ provider, tiers, rankedTiers, minimum, gaps, componentOptions, writes }` | `null` | `RecipeEditView`'s routing facts: the offered tiers, every tier with its bounds, `routedMinimum`'s output, the fixed gaps, and `scopeWrites`' `{ sets, groups, assignSet }`. |
  | `disabled` | boolean | `false` | Every select and adder off. |

  Callbacks:
  - `onOpenChecks()` — "Edit outcome tiers", on the list and on a gap row.

  Invariants:
  - Choosing a row's explicit target writes nothing, and choosing a default target writes it —
    pinned by `tests/components/recipe-routing-overview-mounted.test.js`.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import RoutingOverview from '../../../components/RoutingOverview.svelte';
  import { subjectName } from '../../../components/pickerRowKinds.js';
  import { componentCatalogue } from '../../../components/resultRows.js';
  import { localizeOr } from '../../../util/localizeOr.js';
  import { buildRoutingModel } from './recipeRoutingModel.js';
  import { addIngredientSet, addResultGroup, routeTier } from './recipeRoutingEdits.js';
  import { overviewRows, routingScopes, setSummary } from './routingOverviewRows.js';
  import { setDisplayName } from './setDrafts.js';

  let {
    recipe = null,
    collapsed = false,
    routing = null,
    disabled = false,
    onOpenChecks = () => {},
  } = $props();

  const uid = $props.id();
  const editTiers = localizeOr(
    'FABRICATE.Admin.Manager.Recipe.RoutingCard.EditTiers',
    'Edit outcome tiers'
  );

  const provider = $derived(routing?.provider ?? null);
  const drawn = $derived(provider === 'ingredientSet' || provider === 'check');
  const offered = $derived(Array.isArray(routing?.tiers) ? routing.tiers : []);
  const ranked = $derived(Array.isArray(routing?.rankedTiers) ? routing.rankedTiers : []);
  const minimum = $derived(routing?.minimum ?? {});
  const catalogue = $derived(componentCatalogue(routing?.componentOptions));
  const scopes = $derived(drawn ? routingScopes(recipe, { collapsed }) : []);
  const offeredSuccess = $derived(offered.filter((tier) => tier?.success === true).length);
  const nameOf = (value) => subjectName(value, catalogue, localizeOr);

  const listsTier = (group) =>
    Array.isArray(group?.checkOutcomeIds) && group.checkOutcomeIds.length;
  const span = ({ start, end }) => (start === end ? `${start}` : `${start}–${end}`);

  function stepLabel(scope, index) {
    if (scope.name) return scope.name;
    return `${localizeOr('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`;
  }

  /** A source or blocked tier row's badge, tone and range summary. */
  function tierFace(tier) {
    const bounded = tier.start !== null && tier.end !== null;
    return {
      source: tier.name,
      tone: tier.success ? 'positive' : 'danger',
      summary: bounded ? span(tier) : '',
    };
  }

  const BLOCKED_COPY = {
    policy: () =>
      localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingCard.BlockedPolicy',
        'routing not permitted by this system'
      ),
    'below-minimum': () =>
      localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingCard.BlockedMinimum',
        'below this recipe’s minimum success tier'
      ),
  };

  /** One `overviewRows` row as `RoutingOverview` draws it; `select` is the scope's target shape. */
  function viewRow(row, { scope, select, noteIds }) {
    if (row.kind === 'gap') {
      const values = span({ start: row.gap.from, end: row.gap.to });
      return {
        key: row.key,
        kind: 'gap',
        source: localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingCard.Gap', 'Gap'),
        tone: 'warning',
        summary: localizeOr(
          'FABRICATE.Admin.Manager.Recipe.RoutingCard.GapSummary',
          '{values} — no tier claims this value',
          { values }
        ),
        action: localizeOr(
          'FABRICATE.Admin.Manager.Recipe.RoutingCard.GapAction',
          'Edit outcome tiers to close the gap at {values}',
          { values }
        ),
      };
    }
    if (row.kind === 'blocked') {
      const blocked = BLOCKED_COPY[row.blocked]();
      return {
        key: row.key,
        kind: 'blocked',
        blockedReason: row.blocked,
        blocked,
        ...tierFace(row.tier),
      };
    }
    const base = {
      ...select,
      key: row.key,
      kind: 'source',
      value: row.value,
      fallback: row.fallback,
      shared: row.shared,
    };
    if (!row.tier) {
      const set = scope.sets[row.index];
      return {
        ...base,
        source: setDisplayName(set, row.index),
        summary: setSummary(set, nameOf),
        ariaDescribedBy: noteIds.sets,
      };
    }
    return {
      ...base,
      ...tierFace(row.tier),
      placeholder: row.tier.success
        ? select.placeholder
        : localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingCard.AwardsNothing', 'Awards nothing'),
      hint: row.forcedFailure
        ? localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingCard.ForcedFailure',
            'only on a forced failure'
          )
        : undefined,
      ariaDescribedBy: noteIds.tiers,
    };
  }

  /** Everything one scope draws: its label, its notes and its rows. */
  function scopeView(scope, index) {
    const model = buildRoutingModel({
      provider,
      ingredientSets: scope.sets,
      resultGroups: scope.groups,
      tiers: offered,
      rankedTiers: ranked,
      setName: setDisplayName,
      ...minimum,
    });
    const rows = overviewRows({
      provider,
      model,
      scope,
      tierRows: ranked,
      offeredIds: offered.map((tier) => tier.id),
      gaps: routing?.gaps ?? [],
      direction: minimum.direction,
    });
    const fallbackNote =
      provider === 'check' && offeredSuccess > 1 && !scope.groups.some(listsTier);
    const ids = { fallback: `${uid}-${index}-fallback`, borrowed: `${uid}-${index}-borrowed` };
    const borrowedBy = scope.borrowed ? ids.borrowed : '';
    const context = {
      scope,
      select: {
        options: scope.groups.flatMap((group, i) =>
          group?.id ? [{ value: group.id, label: setDisplayName(group, i) }] : []
        ),
        placeholder: localizeOr(
          'FABRICATE.Admin.Manager.Recipe.RoutingCard.NotRouted',
          'Not routed'
        ),
        readonly: scope.borrowed,
      },
      noteIds: {
        sets: borrowedBy,
        tiers: [fallbackNote ? ids.fallback : '', borrowedBy].filter(Boolean).join(' '),
      },
    };
    return {
      label:
        scopes.length > 1
          ? stepLabel(scope, index)
          : localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingCard.Title', 'Routing'),
      fallbackNote,
      ids,
      byKey: new Map(rows.map((row) => [row.key, row])),
      rows: rows.map((row) => viewRow(row, context)),
    };
  }

  /** Re-point a row: a set writes its `resultGroupId`, a tier moves to the chosen set's list. */
  function choose(scope, row, value) {
    if (!row) return;
    if (!row.tier) {
      const set = scope.sets[row.index];
      if (set?.resultGroupId !== value)
        routing.writes.assignSet(scope.stepId, value, set?.id, true);
      return;
    }
    const index = scope.groups.findIndex((group) => group?.id === value);
    if (index === -1) return;
    const next = routeTier(scope.groups, row.tier.id, index);
    if (next !== scope.groups) routing.writes.groups(scope.stepId, next);
  }
</script>

{#snippet gapAction(row)}
  <Button
    role="ghost"
    data-routing-gap-action
    ariaLabel={row.action}
    {disabled}
    onclick={() => onOpenChecks()}
  >
    <i class="fas fa-star" aria-hidden="true"></i>
    <span>{editTiers}</span>
  </Button>
{/snippet}

{#if drawn}
  <section class="manager-recipe-routing-card" data-recipe-section="routing">
    <div class="manager-recipe-routing-head">
      <h3 class="manager-recipe-section-title">
        {localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingCard.Title', 'Routing')}
      </h3>
      <p class="manager-muted">
        {provider === 'check'
          ? localizeOr(
              'FABRICATE.Admin.Manager.Recipe.RoutingCard.HintCheck',
              'The outcome tiers belong to this system’s crafting check; this recipe chooses the result set each one produces.'
            )
          : localizeOr(
              'FABRICATE.Admin.Manager.Recipe.RoutingCard.HintIngredients',
              'Each ingredient set produces the result set its row names; re-point a row to change it.'
            )}
      </p>
    </div>
    {#each scopes as scope, index (scope.stepId ?? 'recipe')}
      {@const view = scopeView(scope, index)}
      <div
        class="manager-recipe-routing-scope"
        data-recipe-routing-scope={scope.stepId ?? 'recipe'}
      >
        {#if scopes.length > 1}
          <h4 class="manager-recipe-routing-step"><Kicker as="span">{view.label}</Kicker></h4>
        {/if}
        <RoutingOverview
          label={view.label}
          rows={view.rows}
          {disabled}
          rowAction={gapAction}
          onChange={(key, value) => choose(scope, view.byKey.get(key), value)}
        >
          {#snippet note()}
            {#if view.fallbackNote}
              <Callout
                tone="warning"
                title={localizeOr(
                  'FABRICATE.Admin.Manager.Recipe.RoutingCard.FallbackTitle',
                  'Routed by default'
                )}
                text={localizeOr(
                  'FABRICATE.Admin.Manager.Recipe.RoutingAssignNote',
                  'Assigning a tier stops the other tiers reaching a result set by default.'
                )}
                id={view.ids.fallback}
                data-recipe-routing-fallback-note
              />
            {/if}
            {#if scope.borrowed}
              <Callout
                text={localizeOr(
                  'FABRICATE.Admin.Manager.Recipe.RoutingCard.BorrowedNote',
                  'This step has no result sets of its own, so the recipe can’t be enabled. Until it has one, it falls back to the recipe’s.'
                )}
                id={view.ids.borrowed}
                data-recipe-routing-borrowed-note
              />
            {/if}
          {/snippet}
          {#snippet actions()}
            {#if provider === 'ingredientSet'}
              <Button
                role="dashed"
                data-recipe-routing-add="ingredientSet"
                {disabled}
                onclick={() => routing.writes.sets(scope.stepId, addIngredientSet(scope.sets))}
              >
                <i class="fas fa-plus" aria-hidden="true"></i>
                <span
                  >{localizeOr(
                    'FABRICATE.Admin.Manager.Recipe.RoutingCard.AddIngredientSet',
                    'Ingredient set'
                  )}</span
                >
              </Button>
            {/if}
            <Button
              role="dashed"
              data-recipe-routing-add="resultGroup"
              {disabled}
              onclick={() =>
                routing.writes.groups(
                  scope.stepId,
                  addResultGroup(scope.borrowed ? [] : scope.groups)
                )}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span
                >{localizeOr(
                  'FABRICATE.Admin.Manager.Recipe.RoutingCard.AddResultSet',
                  'Result set'
                )}</span
              >
            </Button>
            {#if provider === 'check'}
              <Button
                role="ghost"
                data-recipe-routing-edit-tiers
                {disabled}
                onclick={() => onOpenChecks()}
              >
                <i class="fas fa-star" aria-hidden="true"></i>
                <span>{editTiers}</span>
              </Button>
            {/if}
          {/snippet}
        </RoutingOverview>
      </div>
    {/each}
  </section>
{/if}
