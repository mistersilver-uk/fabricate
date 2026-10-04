<!--
  The read-only strip of current values: an optional kicker and badge over glyph-led facts in mono.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `label` | string | `''` | The kicker, already localized; when drawn it names the group. |
  | `facts` | `{ icon, label?, value, props? }[]` | `[]` | A decorative glyph, an optional body-type label, the caller-formatted value, and attributes (hooks, `title`) spread on the fact. |
  | `badge` | `{ label, tone }` \| `null` | `null` | A read-only state beside the kicker, drawn through `Chip`. |
  | `ariaLabelledBy` / `ariaLabel` | string / string | `''` | The group's name when no kicker is drawn, in that order. |

  Rest spread: `{...rest}` lands on the root, after `class`. Nothing in the strip is focusable.
-->
<script>
  import Chip from './Chip.svelte';
  import Kicker from './Kicker.svelte';

  let {
    label = '',
    facts = [],
    badge = null,
    ariaLabelledBy = '',
    ariaLabel = '',
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();
  const kickerId = `${uid}-kicker`;
  const labelledBy = $derived(label ? kickerId : ariaLabelledBy);
</script>

<div
  class={['fabricate-info-strip', extraClass]}
  role="group"
  aria-labelledby={labelledBy || undefined}
  aria-label={labelledBy ? undefined : ariaLabel || undefined}
  {...rest}
>
  {#if label || badge}
    <div class="fabricate-info-strip-head">
      {#if label}<span id={kickerId}><Kicker as="span">{label}</Kicker></span>{/if}
      {#if badge}<Chip tone={badge.tone}>{badge.label}</Chip>{/if}
    </div>
  {/if}
  {#if facts.length > 0}
    <div class="fabricate-info-strip-facts">
      {#each facts as fact, index (index)}
        <span {...fact.props} class="fabricate-info-strip-fact">
          {#if fact.icon}<i class={fact.icon} aria-hidden="true"></i>{/if}
          {#if fact.label}<span class="fabricate-info-strip-label">{fact.label}</span>{/if}
          <span class="fabricate-info-strip-value">{fact.value}</span>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .fabricate-info-strip {
    box-sizing: border-box;
    display: grid;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
  }

  .fabricate-info-strip-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .fabricate-info-strip-facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2) var(--fab-space-5);
    min-width: 0;
  }

  .fabricate-info-strip-fact {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
    color: var(--fab-text-muted);
    font-size: 12px;
  }

  .fabricate-info-strip-fact > i {
    flex: none;
    color: var(--fab-text-subtle);
    font-size: 10px;
  }

  .fabricate-info-strip-value {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>
