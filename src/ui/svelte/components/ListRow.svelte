<!-- ListRow: the dense read-only row (issue 1648) and its selectable form (issue 1778). The caller
     supplies entitled display strings. With no form prop the dense output is unchanged; `onOpen`
     makes the content one native button, `openProps` alone an inert div, and `trailing` and
     `aside` sit beside it. `class` and a rest spread land on the root; `data-list-row` wins. -->
<script>
  import Medallion from './Medallion.svelte';

  const MARK_SIZES = new Set([22, 26, 30, 38]);
  // The control's own attributes: an `openProps` key naming one is dropped, so the row's win.
  const OWNED_KEYS = new Set([
    'type',
    'role',
    'tabindex',
    'aria-pressed',
    'disabled',
    'data-keyboard-focus',
    'onclick',
    'class',
    'aria-describedby',
  ]);

  let {
    name = '',
    art = '',
    icon = 'fas fa-box',
    tint = '',
    quantity = null,
    detail = '',
    tone = 'neutral',
    muted = false,
    truncateName = false,
    density = 'dense',
    layout = 'row',
    markSize = 22,
    selected = undefined,
    disabled = false,
    onOpen = null,
    openProps = null,
    nameClass = '',
    leading = null,
    badges = null,
    meta = null,
    children = null,
    aside = null,
    trailing = null,
    class: extraClass = '',
    ...rest
  } = $props();

  const uid = $props.id();
  const isDefault = $derived(density === 'default');
  const isCard = $derived(layout === 'card');
  const form = $derived(
    Boolean(onOpen || openProps || leading || badges || meta || children || aside) ||
      isDefault ||
      isCard
  );
  const mark = $derived(MARK_SIZES.has(markSize) ? markSize : 22);
  const describedBy = $derived(
    [
      meta && `${uid}-meta`,
      children && `${uid}-children`,
      aside && `${uid}-aside`,
      openProps?.['aria-describedby'],
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
  const passed = $derived(
    Object.fromEntries(Object.entries(openProps ?? {}).filter(([key]) => !OWNED_KEYS.has(key)))
  );
  const pressed = $derived(selected == null ? undefined : String(selected === true));

  $effect(() => {
    if (MARK_SIZES.has(markSize)) return;
    console.warn(
      `Fabricate | ListRow: \`markSize\` must be one of ${[...MARK_SIZES].join(', ')}; got ` +
        `${JSON.stringify(markSize)}. Drew the 22px mark.`
    );
  });

  function open(event) {
    if (!disabled) onOpen?.(event);
  }
</script>

{#snippet content()}
  {#if leading}{@render leading()}
  {:else if mark === 38}<Medallion {art} {icon} {tint} alt="" size={38} />
  {:else if mark === 30}<Medallion {art} {icon} {tint} alt="" size={30} />
  {:else if mark === 26}<Medallion {art} {icon} {tint} alt="" size={26} />
  {:else}<Medallion {art} {icon} {tint} alt="" size={22} />{/if}
  {#if form}
    <span class="fabricate-list-row-body">
      <span class="fabricate-list-row-head">
        <span class={['fabricate-list-row-name', nameClass]} title={name}>{name}</span>
        {#if badges}<span class="fabricate-list-row-badges">{@render badges()}</span>{/if}
      </span>
      {#if meta}<span class="fabricate-list-row-meta" id={`${uid}-meta`}>{@render meta()}</span
        >{/if}
      {#if children}<span class="fabricate-list-row-children" id={`${uid}-children`}
          >{@render children()}</span
        >{/if}
    </span>
  {:else}
    <span class={['fabricate-list-row-name', nameClass]} title={name}>{name}</span>
  {/if}
  {#if detail}<span class="fabricate-list-row-detail" title={truncateName ? detail : undefined}
      >{detail}</span
    >{/if}
  {#if quantity != null}<span class="fabricate-list-row-quantity">{quantity}</span>{/if}
{/snippet}

<div
  class={['fabricate-list-row', extraClass]}
  class:is-positive={tone === 'positive'}
  class:is-muted={muted}
  class:is-truncated={truncateName}
  class:is-form={form}
  class:is-default={isDefault}
  class:is-card={isCard}
  class:is-danger={tone === 'danger'}
  {...rest}
  data-list-row={isDefault ? 'default' : 'dense'}
>
  {#if onOpen}
    <button
      {...passed}
      class={['fabricate-list-row-open', openProps?.class]}
      aria-describedby={describedBy}
      type="button"
      aria-pressed={pressed}
      {disabled}
      data-keyboard-focus="true"
      onclick={open}>{@render content()}</button
    >
  {:else if openProps}
    <div
      {...passed}
      class={['fabricate-list-row-open', openProps.class]}
      aria-describedby={describedBy}
    >
      {@render content()}
    </div>
  {:else}
    {@render content()}
  {/if}
  {#if trailing}{@render trailing()}{/if}
  {#if aside}<div class="fabricate-list-row-aside" id={`${uid}-aside`}>{@render aside()}</div>{/if}
</div>
