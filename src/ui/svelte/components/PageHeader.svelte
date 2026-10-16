<!-- Svelte 5 runes mode -->
<!--
  THE page header (`<PageHeader>`, `library.html`): a breadcrumb trail as its own first row, then
  the heading block (an optional kicker, a title and subtitle or a caller's `identity` snippet)
  with an `actions` snippet trailing, top-aligned beside it.
  A crumb is `{ label, onSelect? }`: with `onSelect` it is a button called with no argument, and
  without it a span; only its `data-*`, `aria-*` and `title` keys land on that element. The last
  crumb is the current page.
  `class` is appended to `fabricate-page-header`; the rest spread lands on the root after it.
-->
<script>
  import Kicker from './Kicker.svelte';
  import { localizeOr } from '../util/localizeOr.js';

  let {
    breadcrumbs = [],
    kicker = '',
    title = '',
    subtitle = '',
    identity = undefined,
    actions = undefined,
    class: extraClass = '',
    ...rest
  } = $props();

  const classes = $derived(['fabricate-page-header', extraClass]);

  const CRUMB_ATTRIBUTE = /^(?:data-|aria-|title$)/u;

  /** The crumb keys forwarded to its element: hooks, ARIA and a `title`, never the model's own. */
  const crumbAttributes = (crumb) =>
    Object.fromEntries(Object.entries(crumb).filter(([key]) => CRUMB_ATTRIBUTE.test(key)));
</script>

<header class={classes} {...rest}>
  {#if breadcrumbs.length > 0}
    <nav
      class="manager-breadcrumbs"
      aria-label={localizeOr('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
    >
      {#each breadcrumbs as crumb, index (index)}
        {@const current = index === breadcrumbs.length - 1 ? 'page' : undefined}
        {#if index > 0}<i class="fas fa-chevron-right" aria-hidden="true"></i>{/if}
        {#if crumb.onSelect}
          <button
            {...crumbAttributes(crumb)}
            type="button"
            data-keyboard-focus="true"
            aria-current={current}
            onclick={() => crumb.onSelect()}>{crumb.label}</button
          >
        {:else}
          <span {...crumbAttributes(crumb)} aria-current={current}>{crumb.label}</span>
        {/if}
      {/each}
    </nav>
  {/if}
  <div class="manager-heading">
    {#if kicker}
      <div class="manager-page-kicker"><Kicker data-page-kicker="">{kicker}</Kicker></div>
    {/if}
    {#if identity}
      {@render identity()}
    {:else}
      {#if title}<h1 class="manager-title">{title}</h1>{/if}
      {#if subtitle}<p class="manager-subtitle">{subtitle}</p>{/if}
    {/if}
  </div>
  {@render actions?.()}
</header>
