<!--
  The roll prompt's one target chip and, when there is one, the line explaining how its number
  was reached, set 8px to the chip's right and wrapping beneath it (frame 29); and a count check's
  zero-pool notice beneath them.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `text` | string | none | The chip's prepared text, from `rollPromptTarget`; blank renders no chip. |
  | `source` | string | `''` | The prepared explanation; blank renders the bare chip with no row around it. |
  | `under` | boolean | `false` | A summed roll-under target: the chip's `data-roll-prompt-target` hook names it, and one persistent `aria-live="polite"` region (`display: contents`) holds the chip and its line. |
  | `notice` | string | `''` | A count pool reduced to zero that fails: the warning `Notice` stating it. The roll stays possible. |

  Rest spread:
  - `{...rest}` lands on the `Chip`, so its `data-roll-prompt-*` hooks forward.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import Notice from '../../components/Notice.svelte';

  let { text, source = '', under = false, notice = '', ...rest } = $props();
</script>

{#snippet chip()}
  <Chip
    tone="info"
    density="tag-run"
    icon="fa-solid fa-bullseye"
    data-roll-prompt-target={under ? 'under' : undefined}
    {...rest}>{text}</Chip
  >
{/snippet}

{#snippet target()}
  {#if source}
    <div class="target-row">{@render chip()}<span class="target-source">{source}</span></div>
  {:else}
    {@render chip()}
  {/if}
{/snippet}

<!-- A roll-under target follows the picks and the typed bonus: one region announces it throughout. -->
{#if under}
  <div class="target-live" aria-live="polite">{@render target()}</div>
{:else if text}
  {@render target()}
{/if}
{#if notice}
  <div class="target-notice">
    <Notice tone="warning" title={notice} dataAttr="data-roll-prompt-zero-pool" />
  </div>
{/if}

<style>
  .target-live {
    display: contents;
  }
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
  .target-notice {
    align-self: stretch;
  }
</style>
