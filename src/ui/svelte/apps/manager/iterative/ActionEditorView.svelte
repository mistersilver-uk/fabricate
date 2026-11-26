<!-- Svelte 5 runes mode -->
<!--
  The Crafting Action editor: one staged draft, edited in five cards (Identity, How it is taken,
  Costs, Check, Effects) and saved by the header's Save action. Mounted into the iterative route's
  `<main>`, which gives it one scrolling row. Every write goes through the route model's
  `editAction`, so a card never holds the draft itself.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `route` | the `iterativeRouteModel` instance | — | the staged `actionDraft`, `actionBlockingIssues`, the library lists, `routedCheck`, `editAction` and `openChecks` |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Invariants:
  - A library newer than this build draws its Notice and no card.
  - The blocking Notice, the header pill and every mark come from `evaluateIterativeReadiness` and
    `iterativeFieldFaults.js` over the same unsaved draft, so they agree with Validation after a Save;
    the Notice and the pill count only critical issues, and a warning draws only its mark.
  - The in-progress `Callout` is this root's first child, above the blocking Notice and the
    Identity card, while workpieces in progress can use a saved action; it is absent on a new one.
-->
<script>
  import Callout from '../../../components/Callout.svelte';
  import Notice from '../../../components/Notice.svelte';
  import { routedOutcomeTierOptions } from '../../../../../utils/routedOutcomeKeywords.js';
  import { interpolate } from '../checks/checksCopy.js';

  import ActionCheckSection from './ActionCheckSection.svelte';
  import ActionCostsSection from './ActionCostsSection.svelte';
  import ActionEffectsSection from './ActionEffectsSection.svelte';
  import ActionIdentitySection from './ActionIdentitySection.svelte';
  import ActionTakenSection from './ActionTakenSection.svelte';
  import UnsupportedLibraryNotice from './UnsupportedLibraryNotice.svelte';
  import { actionLevelFaults } from './iterativeFieldFaults.js';

  let { route, text = (_key, fallback) => fallback } = $props();

  const draft = $derived(route.actionDraft);
  const counters = $derived(route.counters.map(({ id, label }) => ({ id, label: label || id })));
  const actions = $derived(route.actions.map(({ id, label }) => ({ id, label: label || id })));
  const tiers = $derived(routedOutcomeTierOptions(route.routedCheck));
  const context = $derived({
    counterIds: new Set(counters.map((counter) => counter.id)),
    actionIds: new Set(actions.map((action) => action.id)),
    tierIds: new Set(tiers.map((tier) => tier.id)),
  });
  const faults = $derived(draft ? actionLevelFaults(draft) : []);
  const issueCount = $derived(route.actionBlockingIssues.length);
  const name = $derived(
    draft?.label?.trim() || text('FABRICATE.Admin.Manager.Iterative.UnnamedAction', 'New action')
  );

  const runCount = $derived(draft && !route.isNewAction ? route.actionActiveRunCount(draft.id) : 0);
  const inProgress = $derived(
    interpolate(
      runCount === 1
        ? text(
            'FABRICATE.Admin.Manager.Iterative.ActionInProgressOne',
            '1 workpiece in progress can use {name}. It keeps the version of this action it started with; your changes apply to workpieces started after you save.'
          )
        : text(
            'FABRICATE.Admin.Manager.Iterative.ActionInProgress',
            '{count} workpieces in progress can use {name}. They keep the version of this action they started with; your changes apply to workpieces started after you save.'
          ),
      { count: runCount, name }
    )
  );

  const blockingTitle = $derived(
    interpolate(
      issueCount === 1
        ? text(
            'FABRICATE.Admin.Manager.Iterative.BlockingOne',
            '1 blocking issue. Players can’t take {name} until it is fixed; it is marked below. The action still saves.'
          )
        : text(
            'FABRICATE.Admin.Manager.Iterative.Blocking',
            '{count} blocking issues. Players can’t take {name} until they are fixed; each is marked below. The action still saves.'
          ),
      { count: issueCount, name }
    )
  );
</script>

<div class="manager-iterative-screen manager-iterative-editor" data-iterative-editor>
  {#if runCount > 0}
    <Callout
      tone="info"
      icon="fas fa-clock-rotate-left"
      text={inProgress}
      data-iterative-in-progress={runCount}
    />
  {/if}
  {#if route.unsupported}
    <UnsupportedLibraryNotice {text} />
  {:else if draft}
    {#if issueCount > 0}
      <Notice
        blocking
        tone="danger"
        icon="fas fa-circle-xmark"
        title={blockingTitle}
        data-iterative-blocking-notice
        data-issue-count={issueCount}
      />
    {/if}
    <ActionIdentitySection {draft} actions={route.actions} {text} edit={route.editAction} />
    <ActionTakenSection {draft} {counters} {actions} {faults} {text} edit={route.editAction} />
    <ActionCostsSection {draft} {counters} {context} {faults} {text} edit={route.editAction} />
    <ActionCheckSection
      {draft}
      routed={route.routedCheck}
      systemName={route.systemName}
      {faults}
      {text}
      edit={route.editAction}
      onOpenChecks={route.openChecks}
    />
    <ActionEffectsSection
      {draft}
      {counters}
      {actions}
      {tiers}
      {context}
      {faults}
      {text}
      edit={route.editAction}
    />
  {/if}
</div>

<style>
  .manager-iterative-editor :global(.manager-iterative-card-body) {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* The connective words ("from", "by") sit on the 30px control rung, not centred on a field's token row. */
  .manager-iterative-editor :global(.manager-iterative-word) {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    min-height: 30px;
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
  }

  /* A segmented control in a card's grid keeps its own width rather than stretching an empty track. */
  .manager-iterative-editor :global(.manager-iterative-start) {
    justify-self: start;
  }

  .manager-iterative-editor :global(.manager-iterative-note),
  .manager-iterative-editor :global(.manager-iterative-none) {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    line-height: 1.5;
  }
</style>
