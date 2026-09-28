<!--
  The roll prompt's one target chip and, when there is one, the line explaining how its number
  was reached, set 8px to the chip's right and wrapping beneath it (frame 29).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `text` | string | none | The chip's prepared text, from `rollPromptTarget`. |
  | `source` | string | `''` | The prepared explanation; blank renders the bare chip with no row around it. |

  Rest spread:
  - `{...rest}` lands on the `Chip`, so its `data-roll-prompt-*` hooks forward.
-->
<script>
  import Chip from '../../components/Chip.svelte';

  let { text, source = '', ...rest } = $props();
</script>

{#snippet chip()}
  <Chip tone="info" density="tag-run" icon="fa-solid fa-bullseye" {...rest}>{text}</Chip>
{/snippet}

{#if source}
  <div class="target-row">
    {@render chip()}<span class="target-source">{source}</span>
  </div>
{:else}
  {@render chip()}
{/if}

<style>
  .target-row {
    display: flex;
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
