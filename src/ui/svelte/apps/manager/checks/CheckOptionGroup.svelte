<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): CheckOptionGroup is promoted to a manager-only primitive at target, because the Formula card's roll-prompt group and its additional-dice group now both draw this well (issue 2008) -->
<!--
  One titled option group on the Formula card, drawn in the shared `<Well>`: named by its title,
  with an optional `action` at the head's end and a rule over the body only when one is given.

  Props: `title`, `description = ''`, `action` (snippet), `children` (snippet). Every other
  attribute lands on the group root, beside its own `data-check-option-group` hook.
-->
<script>
  import Well from '../../../components/Well.svelte';

  let { title, description = '', action = undefined, children = undefined, ...rest } = $props();

  const uid = $props.id();
  const titleId = `${uid}-option-group-title`;
</script>

<div
  class="manager-checks-option-group"
  role="group"
  aria-labelledby={titleId}
  data-check-option-group=""
  {...rest}
>
  <Well data-check-option-group-frame="">
    <div class="manager-checks-option-group-head" data-check-option-group-head>
      <div class="manager-checks-option-group-copy">
        <p class="manager-checks-option-group-title" id={titleId}>{title}</p>
        {#if description}<p class="manager-checks-option-group-hint">{description}</p>{/if}
      </div>
      {@render action?.()}
    </div>
    {#if children}
      <div
        class="manager-checks-option-group-body"
        class:is-ruled={Boolean(action)}
        data-check-option-group-body
      >
        {@render children()}
      </div>
    {/if}
  </Well>
</div>

<style>
  .manager-checks-option-group {
    margin-top: var(--fab-space-3);
  }

  .manager-checks-option-group-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-checks-option-group-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .manager-checks-option-group-title {
    margin: 0;
    color: var(--fab-text);
    font-size: 11.5px;
    font-weight: 600;
  }

  .manager-checks-option-group-hint {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-subtle);
    font-size: 10px;
    line-height: 1.45;
  }

  .manager-checks-option-group-body.is-ruled {
    margin-top: var(--fab-space-3);
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }
</style>
