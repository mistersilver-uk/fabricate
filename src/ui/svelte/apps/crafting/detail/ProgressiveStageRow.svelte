<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): ProgressiveStageRow composes Medallion inside SortableList and draws no control of its own; its manifest row lands with its Primitive Lab specimen (issue 2381) -->
<!--
  A player progressive stage row's content in `SortableList`'s `row` snippet: the art, the name, the
  component's progressive DC and the cumulative threshold. The crafting and salvage bodies share it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `stage` | stage row | `null` | `difficulty` and `threshold` are computed builder-side; a null one is omitted, never zeroed, because no budget reaches that stage. |
  | `layout` | `'inline'` \| `'stacked'` | `'inline'` | Stacked makes the identity a column (name, then numbers, then the chip) so a narrow inspector wraps the name instead of crushing it. |

  Snippets:
  - `stateChip(stage)` — optional; after the numbers inline, last in the identity column stacked.

  Module exports: `stageLabel`, `stageRowClass` and `stageRowData`, the per-stage callbacks each
  body hands `SortableList`.
-->
<script module>
  import { localizeOr } from '../../../util/localizeOr.js';
  import { stageHasBand } from './ProgressiveStageBand.svelte';

  /** The name every control and sentence of the row uses for the stage. */
  export function stageLabel(stage) {
    return stage?.name || localizeOr('FABRICATE.App.Crafting.Detail.UnnamedStage', 'this result');
  }

  export function stageRowClass(stage) {
    return stageHasBand(stage) ? 'progressive-stage-row has-band' : 'progressive-stage-row';
  }

  /** The row's hooks: its stage id, and which of the two states it renders in. */
  export function stageRowData(stage, reorderable) {
    const state = reorderable
      ? 'data-progressive-stage-reorderable'
      : 'data-progressive-stage-fixed';
    return { 'data-progressive-stage': stage?.id ?? '', [state]: '' };
  }
</script>

<script>
  import Medallion from '../../../components/Medallion.svelte';

  let { stage = null, layout = 'inline', stateChip = undefined } = $props();

  const stacked = $derived(layout === 'stacked');
  const known = (value) => value !== null && value !== undefined;
</script>

{#snippet numbers()}
  {#if known(stage?.difficulty)}
    <span
      class="progressive-stage-difficulty"
      data-progressive-stage-difficulty={String(stage.difficulty)}
    >
      <i class="fas {stacked ? 'fa-medal' : 'fa-gauge-high'}" aria-hidden="true"></i>{localizeOr(
        'FABRICATE.App.Crafting.Detail.StageDifficultyDc',
        'DC {difficulty}',
        { difficulty: stage.difficulty }
      )}
    </span>
  {/if}
  {#if known(stage?.threshold)}
    <span
      class="progressive-stage-threshold"
      data-progressive-stage-threshold={String(stage.threshold)}
    >
      {stacked
        ? localizeOr('FABRICATE.App.Crafting.Detail.StageThresholdShort', 'Reach ≥{threshold}', {
            threshold: stage.threshold,
          })
        : localizeOr('FABRICATE.App.Crafting.Detail.StageThreshold', 'Reached at ≥{threshold}', {
            threshold: stage.threshold,
          })}
    </span>
  {/if}
{/snippet}

<div class="progressive-stage" class:is-stacked={stacked}>
  {#if stacked}
    <Medallion art={stage?.img || ''} alt="" size={30} />
    <span class="progressive-stage-identity">
      <span class="progressive-stage-name">{stage?.name}</span>
      <span class="progressive-stage-numbers">{@render numbers()}</span>
      {#if stateChip}{@render stateChip(stage)}{/if}
    </span>
  {:else}
    <Medallion art={stage?.img || ''} alt="" size={22} />
    <span class="progressive-stage-name" title={stage?.name || undefined}>{stage?.name}</span>
    <span class="progressive-stage-numbers">
      {@render numbers()}
      {#if stateChip}{@render stateChip(stage)}{/if}
    </span>
  {/if}
</div>

<style>
  .progressive-stage {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .progressive-stage-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progressive-stage-numbers {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .progressive-stage-difficulty {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    white-space: nowrap;
  }

  .progressive-stage-threshold {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* Stacked, the identity column is the only thing that flexes, and it grows tall rather than thin. */
  .progressive-stage-identity {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  .progressive-stage.is-stacked .progressive-stage-name {
    align-self: stretch;
    overflow: visible;
    white-space: normal;
    /* `anywhere`, so a single token longer than the column still breaks. */
    overflow-wrap: anywhere;
    font-weight: 600;
    line-height: 1.25;
  }

  /* Wraps, because every child is `nowrap` and would otherwise paint out of the column. */
  .progressive-stage.is-stacked .progressive-stage-numbers {
    flex-wrap: wrap;
    font-size: 11px;
  }
</style>
