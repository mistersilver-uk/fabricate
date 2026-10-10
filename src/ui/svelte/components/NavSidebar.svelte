<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): <NavSidebar> ships at target: the pip and 8/0/6 padding are ruled, so the specimen is redrawn; the expanded group's box converges at issue 2257 (issue 1777 decision E3) -->
<!--
  The app navigation (`<NavSidebar>`, `library.html`) in two variants named by shape (issue 1777):
  `icon`, the player's 72px icon-well column, and `labelled`, the manager's 220/56 sidebar.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `variant` | `'icon'` \| `'labelled'` | `'labelled'` | `icon` is a vertical tablist with one roving stop; `labelled` is a `nav` |
  | `label` | string | `''` | the tablist's or the nav's accessible name, already localized |
  | `items` | `{id, domId, hooks, icon, label, ariaLabel?, tooltip?, tooltipId?, markers?, current?}[]` | `[]` | the `icon` tabs; `current` is the selected tab |
  | `panelId` | id | `''` | the panel every `icon` tab controls |

  Snippets:
  - `content(rows)` — the `labelled` nav's body; `rows(entries, {itemClass, groupClasses,
    childClasses})` draws `managerNavItems.js` rows and groups.

  Callbacks:
  - `onSelect(id)` — an `icon` tab was clicked or reached by Up/Down/Home/End; focus follows.
-->
<script>
  import { tick } from 'svelte';
  import NavSidebarRows from './NavSidebarRows.svelte';

  let {
    variant = 'labelled',
    label = '',
    items = [],
    panelId = '',
    onSelect = () => {},
    content = undefined,
  } = $props();

  // The stop falls back to the first tab so the rail never leaves the Tab order, while
  // `aria-selected` stays bound to `current` alone.
  const stopId = $derived((items.find((item) => item.current) ?? items[0])?.id);
  // Reactive so `bind:this` on an indexed slot is a reactive write (Svelte's dev build warns
  // `binding_property_non_reactive` on a plain array) and a removed tab's slot is cleared.
  const tabNodes = $state([]);

  function onTabKeydown(event, index) {
    const last = items.length - 1;
    const next = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(items[next].id);
    tick().then(() => tabNodes[next]?.focus?.());
  }
</script>

{#snippet rows(entries, { itemClass = '', groupClasses = {}, childClasses = {} } = {})}
  <NavSidebarRows {entries} {itemClass} {groupClasses} {childClasses} />
{/snippet}

{#if variant === 'icon'}
  <div
    class="fabricate-nav fabricate-app-nav"
    role="tablist"
    aria-orientation="vertical"
    aria-label={label || undefined}
  >
    {#each items as item, index (item.id)}
      <button
        type="button"
        class="fabricate-app-nav-item"
        class:active={Boolean(item.current)}
        role="tab"
        id={item.domId}
        {...item.hooks}
        aria-selected={Boolean(item.current)}
        aria-controls={panelId}
        aria-label={item.ariaLabel}
        aria-describedby={item.tooltip ? item.tooltipId : undefined}
        tabindex={item.id === stopId ? 0 : -1}
        data-keyboard-focus="true"
        bind:this={tabNodes[index]}
        onclick={() => onSelect(item.id)}
        onkeydown={(event) => onTabKeydown(event, index)}
      >
        <span class="fabricate-app-nav-well">
          <i class={item.icon} aria-hidden="true"></i>
          {#each item.markers ?? [] as marker (marker.kind)}
            <span class="fabricate-app-nav-count" {...marker.hooks}>{marker.value}</span>
          {/each}
        </span>
        <span class="fabricate-app-nav-label">{item.label}</span>
      </button>
    {/each}
  </div>

  <!-- Siblings, not children: a tablist owns only tabs, pinned by
       `tests/components/nav-sidebar-mounted.test.js`. -->
  {#each items as item (item.id)}
    {#if item.tooltip}
      <span id={item.tooltipId} class="fabricate-app-nav-tooltip" role="tooltip"
        >{item.tooltip}</span
      >
    {/if}
  {/each}
{:else}
  <nav class="fabricate-nav manager-nav" aria-label={label || undefined}>
    {@render content?.(rows)}
  </nav>
{/if}

<style>
  /* The icon variant: a 72px column of 44px icon wells, each labelled beneath. `scrollbar-gutter:
     stable` reserves the gutter up front, so crossing the entry count that starts the scroll does
     not reflow the column. */
  .fabricate-app-nav {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 0 0 72px;
    padding: var(--fab-space-chip);
    border-right: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  /* Foundry's `.application button` fixes a height and line-height, so the item resets both. */
  .fabricate-app-nav-item {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-chip);
    margin: 0;
    padding: var(--fab-space-2) 0 var(--fab-space-chip);
    width: 100%;
    height: auto;
    font: inherit;
    line-height: normal;
    text-align: center;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  /* `width: min(44px, 100%)`, not a bare 44px: Foundry's `scrollbar-width: thin` takes ~12px of
     a classic scrollbar's layout width once the rail scrolls, and a well that cannot shrink would
     then overflow into a visible horizontal scrollbar. Headless Chromium's overlay scrollbars
     cannot show this, so `fabricate-app-root-mounted.test.js` asserts the declaration. */
  .fabricate-app-nav-well {
    position: relative;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: min(44px, 100%);
    height: 44px;
    border-radius: 9px;
  }

  .fabricate-app-nav-well i {
    font-size: 20px;
    line-height: 1;
  }

  /* A companion's label and its localizations are unbounded, so the label truncates; the full
     text is what `ariaLabel` and `tooltip` carry. */
  .fabricate-app-nav-label {
    max-width: 100%;
    overflow: hidden;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The `aria-describedby` target for a tab that supplies a tooltip: exposed to assistive
     technology, taken out of flow and clipped so it paints nothing in the rail. */
  .fabricate-app-nav-tooltip {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .fabricate-app-nav-item:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .fabricate-app-nav-item.active {
    background: var(--fab-surface-active);
    color: var(--fab-accent);
  }

  .fabricate-app-nav-item.active .fabricate-app-nav-well {
    background: var(--fab-accent-soft);
  }

  /* Focus rings (Foundry orange suppressed on :focus, accent ring on :focus-visible) are handled
     globally for the .fabricate-app area in styles/fabricate.css. */
</style>
