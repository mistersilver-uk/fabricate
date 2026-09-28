<!--
  The roll prompt's one target chip and, when there is one, the line explaining how its number
  was reached, set 8px to the chip's right and wrapping beneath it (frame 29).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `text` | string | none | The chip's prepared text, from `rollPromptTarget`. |
  | `source` | string | `''` | The prepared explanation; blank renders the bare chip with no row around it. |
  | `under` | boolean | `false` | A summed roll-under target: the chip's `data-roll-prompt-target` hook names it, and its row, or the bare chip, is `aria-live="polite"`. |

  Rest spread:
  - `{...rest}` lands on the `Chip`, so its `data-roll-prompt-*` hooks forward.
-->
<script>
  import Chip from '../../components/Chip.svelte';

  let { text, source = '', under = false, ...rest } = $props();
</script>

{#snippet chip()}
  <Chip
    tone="info"
    density="tag-run"
    icon="fa-solid fa-bullseye"
    data-roll-prompt-target={under ? 'under' : undefined}
    aria-live={under && !source ? 'polite' : undefined}
    {...rest}>{text}</Chip
  >
{/snippet}

<!-- A roll-under target follows the picks and the typed bonus, so whichever holds it announces. -->
{#if source}
  <div class="target-row" aria-live={under ? 'polite' : undefined}>
    {@render chip()}<span class="target-source">{source}</span>
  </div>
{:else}
  {@render chip()}
{/if}

<style>
  .target-row {
    display: flex;
    align-self: stretch;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
  }
  .target-source {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    font-weight: 500;
    line-height: normal;
  }
</style>
