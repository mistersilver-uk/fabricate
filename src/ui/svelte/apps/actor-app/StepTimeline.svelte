<!-- Svelte 5 runes mode -->
<!--
  StepTimeline renders a horizontal sequence of completed / current / pending
  step pills for a multi-step recipe's active run. Reused by the simple
  inspector for single-step active runs and by the complex inspector.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { steps = [], emptyHint = null } = $props();
</script>

{#if steps.length === 0}
  {#if emptyHint}
    <p class="step-timeline__empty">{emptyHint}</p>
  {/if}
{:else}
  <ol class="step-timeline" data-testid="step-timeline">
    {#each steps as step, i (step.id ?? i)}
      <li
        class="step-timeline__step step-timeline__step--{step.status}"
        aria-current={step.status === 'current' ? 'step' : undefined}
      >
        <span class="step-timeline__index">{step.index + 1}</span>
        <span class="step-timeline__name">{step.name}</span>
        <span class="step-timeline__status">
          {#if step.status === 'completed'}
            <i class="fas fa-check" aria-hidden="true"></i>
            {localize('FABRICATE.ActorApp.CraftPlan.StepCompleted')}
          {:else if step.status === 'current'}
            <i class="fas fa-circle-play" aria-hidden="true"></i>
            {localize('FABRICATE.ActorApp.CraftPlan.StepCurrent')}
          {:else}
            <i class="far fa-circle" aria-hidden="true"></i>
            {localize('FABRICATE.ActorApp.CraftPlan.StepPending')}
          {/if}
        </span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .step-timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .step-timeline__empty {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 12px;
    font-style: italic;
  }

  .step-timeline__step {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-control);
    background: var(--fab-surface-soft);
    font-size: 12px;
  }

  .step-timeline__index {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .step-timeline__name {
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-timeline__status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .step-timeline__step--completed {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .step-timeline__step--completed .step-timeline__index {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .step-timeline__step--completed .step-timeline__status {
    color: var(--fab-accent);
  }

  .step-timeline__step--current {
    border-color: var(--fab-info);
    background: var(--fab-info-soft);
  }

  .step-timeline__step--current .step-timeline__index {
    background: var(--fab-info);
    color: var(--fab-bg-0);
  }

  .step-timeline__step--current .step-timeline__status {
    color: var(--fab-info);
  }
</style>
