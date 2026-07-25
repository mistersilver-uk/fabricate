<!-- Svelte 5 runes mode -->
<!--
  StepRequirementsList renders an explicit multi-step (`simple`-mode) recipe's
  per-step required materials as a static preview — NOT a live run tracker. Issue
  765: a stepped recipe stores its ingredient sets on `steps[]`, so the browse
  detail body reads `recipe.steps` (projected by CraftingListingBuilder) and shows
  each step's materials in order.

  Each step is a semantic list item in an ordered list (the sequence is the point).
  A step block renders INPUTS ONLY — its Have/Need/Missing IoTable is passed
  `result={null}` so no per-step Output group is emitted; the single emphasized
  PRODUCES row is the recipe's terminal product, rendered once by SimpleRecipeBody
  outside this list. `simple` mode enforces exactly one ingredient set per step, so
  each step has exactly one IoTable.

  This is deliberately distinct from ProgressiveStageList (which carries
  player-reorder + per-stage status semantics irrelevant to a read-only preview):
  there are no drag/keyboard/reorder affordances here.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { formatTimeRequirementCompact } from '../../../util/recipeDuration.js';
  import IoTable from './IoTable.svelte';

  let { steps = [] } = $props();

  const items = $derived(Array.isArray(steps) ? steps : []);
  const durationTitle = $derived(localize('FABRICATE.App.Crafting.Detail.Duration'));
</script>

<div class="crafting-steps" data-recipe-section="steps">
  <p class="crafting-steps-hint" data-recipe-section="steps-hint">
    <i class="fas fa-list-ol" aria-hidden="true"></i>
    {localize('FABRICATE.App.Crafting.Detail.MultiStepHint', { count: items.length })}
  </p>
  <ol class="crafting-steps-list">
    {#each items as step, index (step.id ?? index)}
      <li
        class="crafting-step"
        data-recipe-step
        aria-label={localize('FABRICATE.App.Crafting.Detail.StepLabel', {
          index: index + 1,
          name: step.label
        })}
      >
        <p class="crafting-step-label" data-recipe-step-label>
          <span class="crafting-step-ordinal" aria-hidden="true">{index + 1}</span>
          <span class="crafting-step-name">{step.label}</span>
          {#if step.duration}
            <span
              class="crafting-step-duration"
              data-recipe-step-duration
              title={durationTitle}
              aria-label={`${durationTitle}: ${formatTimeRequirementCompact(step.duration)}`}
            >
              <i class="fas fa-clock" aria-hidden="true"></i>
              <span>{formatTimeRequirementCompact(step.duration)}</span>
            </span>
          {/if}
        </p>
        <!-- INPUTS ONLY: result={null} suppresses IoTable's Output group. Intermediate
             step yields are not shown; the terminal PRODUCES row is rendered once by
             SimpleRecipeBody. -->
        <IoTable craftability={step.ingredientSets?.[0]?.craftability ?? null} result={null} />
      </li>
    {/each}
  </ol>
</div>

<style>
  .crafting-steps {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .crafting-steps-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .crafting-steps-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: crafting-step;
  }

  .crafting-step {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .crafting-step-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }

  .crafting-step-ordinal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .crafting-step-name {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crafting-step-duration {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 5px;
    padding: 2px 7px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 10px;
    font-family: var(--fab-font-mono);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
  }

  .crafting-step-duration i {
    font-size: 9px;
    line-height: 1;
  }
</style>
