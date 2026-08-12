<!-- Svelte 5 runes mode -->
<!--
  Generic searchable popover used by the Travel tab (region-override picker and
  move-to-party picker). The popover is portaled to the `.fabricate-manager`
  host so it escapes the `overflow: hidden` manager panel, positioned with
  `computeIconPickerPopoverLayout`, and dismissed on outside click / Escape (the
  portaled popover is registered as an additional "inside" node so clicking
  within it does not dismiss).

  Props:
    options      — [{ id, label, icon?, img?, meta?, trailing?, addMarker?, dataId?,
                   group? }] (consumer builds the full list, including any leading
                   "special" option such as Auto).
                   `addMarker` stamps `data-recipe-add` on that OPTION (the recipe
                   editor's add menu keeps its token family on the four type choices
                   rather than on a trigger per type)
                   `meta` promotes the option to TWO LINES: the label above, this
                   secondary sentence below (issue 1010). It exists because a picker
                   whose choices differ by a FACT rather than by a name cannot put that
                   fact in the label without making every row read as a sentence — the
                   recipe bulk panel's book picker states "Recipe book · holds 3 of 12
                   selected" per book, which is the whole basis on which the GM chooses.
                   Both lines are inside the button, so they are both in its accessible
                   name and a screen-reader user hears the same two facts.
                   `dataId` stamps `data-popover-option` on that option — the sibling of
                   the `data-popover-group` this component already stamps on a bucket.
                   Capture walks and mounted tests address an option by identity through
                   it; without one the only handle is the display label, which is
                   localized and therefore not a selector.
    optionGroups — OPTIONAL [{ id, label }]. When non-empty the options are bucketed
                   by `option.group` and each bucket renders under its own heading as
                   an ARIA `role="group"` with that label. This exists because a menu
                   whose choices do NOT all mean the same thing must not present them
                   as one flat list: the recipe editor's "or…" menu offers OR
                   alternatives (Accept instead) alongside an AND requirement that
                   bubbles to the ingredient SET (Require as well), and a screen-reader
                   user told "Accept instead" and handed an AND control has been lied
                   to. Options with no `group` (or an unknown one) render last, without
                   a heading; a group whose options are all filtered out disappears.
                   Callers that pass no groups render exactly as before.
    value        — id of the currently selected option (for aria-selected)
    triggerClass — class string for the trigger button (consumer-controlled)
    triggerChip  — render the trigger through the shared `Chip` primitive instead of a
                   bare `<button>` (issue 883). The recipe editor's "or…" control is a
                   dashed accent CHIP, and a chip is only a chip when it renders through
                   that component: the scale lives in its scoped block, which a class
                   name handed to a button in THIS component can never reach. Callers
                   pass only their own modifier class in `triggerClass`; the chip's own
                   class hook comes from the primitive.
    triggerIcon  — leading icon class on the trigger (optional)
    triggerImg   — leading portrait image src on the trigger (optional; mirrors
                   how list options render `option.img`), shown before the label
    triggerLabel — current-selection text on the trigger (omitted when empty)
    valueClass   — extra class on the trigger value span
    showChevron  — render the open/closed chevron on the trigger (default true)
    triggerAddMarker — optional value for a `data-recipe-add` attribute on the
                   trigger button (lets the recipe editor mark popover-backed add
                   controls without wrapping the button)
    triggerData  — OPTIONAL `{ 'data-x': 'value' }` map stamped verbatim on the
                   trigger button. The general form of `triggerAddMarker`, for a
                   caller whose stable hook is its own rather than the recipe
                   editor's: the Checks Studio's "Preview as" control carries
                   `data-checks-preview-actor`, which a mounted test and the View
                   Lab case registry both address, and a wrapper element around
                   the trigger would move that hook off the control it names.
                   Spread FIRST, so it can never override this component's own
                   `type`, `onclick` or ARIA contract.
    triggerTitle — optional native `title` tooltip on the trigger button
                   (backward-compatible; omitted when empty)
    showSearch   — render the search input (default true). A caller with only a
                   handful of fixed options (the recipe row-level "or…" menu) drops
                   it: `search` stays '' so `filteredOptions` and the autofocus
                   `$effect` degrade gracefully to the full, unfiltered list.
    popoverClass — optional extra class on the portaled popover element (the
                   pickerClass lands on the trigger's root, which the portaled
                   popover escapes, so a popover-scoped style needs its own hook)
    *AriaLabel / searchPlaceholder / emptyHint — localized strings
    onChoose(id) — called with the chosen option id
-->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import { computeIconPickerPopoverLayout } from '../../util/iconPickerPopover.js';

  let {
    options = [],
    optionGroups = [],
    value = '',
    disabled = false,
    triggerClass = '',
    triggerChip = false,
    triggerIcon = '',
    triggerImg = '',
    triggerLabel = '',
    valueClass = '',
    showChevron = true,
    showSearch = true,
    popoverClass = '',
    triggerAddMarker = '',
    triggerData = {},
    triggerTitle = '',
    triggerAriaLabel = '',
    dialogAriaLabel = '',
    searchPlaceholder = '',
    searchAriaLabel = '',
    emptyHint = '',
    pickerClass = '',
    minWidth = 240,
    maxWidth = 340,
    onChoose = () => {},
  } = $props();

  let open = $state(false);
  let search = $state('');
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);
  let popoverStyle = $state('');

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const filteredOptions = $derived(
    normalizedSearch
      ? options.filter((option) =>
          String(option.label || '')
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : options
  );

  // Grouped rendering. Each declared group keeps its declared order; anything with no
  // (or an unknown) group falls into a trailing, heading-less bucket so an option can
  // never be silently dropped by a mismatched group id.
  const groupedOptions = $derived.by(() => {
    const groups = Array.isArray(optionGroups) ? optionGroups.filter((group) => group?.id) : [];
    if (groups.length === 0) return [];
    const known = new Set(groups.map((group) => group.id));
    const buckets = groups.map((group) => ({
      id: group.id,
      label: group.label || '',
      options: filteredOptions.filter((option) => option.group === group.id),
    }));
    const ungrouped = filteredOptions.filter((option) => !known.has(option.group));
    if (ungrouped.length > 0) buckets.push({ id: '__ungrouped', label: '', options: ungrouped });
    return buckets.filter((bucket) => bucket.options.length > 0);
  });
  const isGrouped = $derived(groupedOptions.length > 0);

  function close({ restoreFocus = true } = {}) {
    open = false;
    search = '';
    if (restoreFocus) {
      queueMicrotask(() => {
        if (triggerButton?.isConnected !== false) triggerButton?.focus?.();
      });
    }
  }

  function toggle(event) {
    event.stopPropagation();
    if (disabled) return;
    if (open) {
      close({ restoreFocus: false });
      return;
    }
    open = true;
  }

  function choose(id) {
    onChoose(id);
    close();
  }

  function stop(event) {
    event.stopPropagation();
  }

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;
    return pickerRoot.closest('.fabricate-manager');
  }

  function getHorizontalBounds(hostRect) {
    if (!pickerRoot) return {};
    const selector = '.admin-main, .manager-main, .manager-table-scroll';
    let candidate = pickerRoot.parentElement;
    while (candidate) {
      if (candidate.matches?.(selector)) {
        const rect = candidate.getBoundingClientRect?.();
        const display = globalThis.getComputedStyle?.(candidate)?.display;
        if (rect && rect.width > 0 && rect.height > 0 && display !== 'contents') {
          return {
            minLeft: rect.left - hostRect.left + 16,
            maxRight: rect.right - hostRect.left - 16,
          };
        }
      }
      candidate = candidate.parentElement;
    }
    return {
      minLeft: 16,
      maxRight: Math.max(16, hostRect.width - 16),
    };
  }

  function updatePosition() {
    if (!open || !triggerButton || typeof window === 'undefined') return;
    const host = getPopoverHost();
    const hostRect = host?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const triggerRect = triggerButton.getBoundingClientRect();
    const bounds = getHorizontalBounds(hostRect);
    const layout = computeIconPickerPopoverLayout(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      { width: hostRect.width || window.innerWidth, height: hostRect.height || window.innerHeight },
      {
        horizontalAlign: 'left',
        minWidth,
        maxWidth,
        minLeft: bounds.minLeft,
        maxRight: bounds.maxRight,
      }
    );
    if (!layout) {
      popoverStyle = '';
      return;
    }
    const vertical =
      layout.placement === 'top'
        ? `top: auto; bottom: ${layout.bottom}px;`
        : `top: ${layout.top}px; bottom: auto;`;
    popoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      vertical,
    ].join(' ');
  }

  // One attribute set for both trigger shapes. Writing it twice would be a copy the
  // duplication gate counts and a place for the two shapes to drift apart.
  const triggerAttributes = $derived({
    ...triggerData,
    type: 'button',
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    disabled,
    'data-recipe-add': triggerAddMarker || undefined,
    title: triggerTitle || undefined,
    'aria-label': triggerAriaLabel || undefined,
    onclick: toggle,
    onkeydown: stop,
  });

  $effect(() => {
    if (!open || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });

  $effect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') {
      popoverStyle = '';
      return;
    }
    updatePosition();
    if (typeof window.addEventListener !== 'function') return;
    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div
  class={`manager-travel-picker ${pickerClass}`}
  bind:this={pickerRoot}
  use:dismissOnOutsideClick={{
    enabled: open,
    onDismiss: () => close(),
    additionalNodes: () => [popoverRoot],
  }}
>
  {#snippet triggerBody()}
    {#if triggerImg}<span class="manager-travel-portrait" aria-hidden="true"
        ><img src={triggerImg} alt="" /></span
      >{:else if triggerIcon}<i class={triggerIcon} aria-hidden="true"></i>{/if}
    {#if triggerLabel}<span class={`manager-travel-picker-value ${valueClass}`}>{triggerLabel}</span
      >{/if}
    {#if showChevron}<i
        class={open ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>{/if}
  {/snippet}

  {#if triggerChip}
    <Chip tag="button" bind:element={triggerButton} class={triggerClass} {...triggerAttributes}
      >{@render triggerBody()}</Chip
    >
  {:else}
    <button bind:this={triggerButton} class={triggerClass} {...triggerAttributes}>
      {@render triggerBody()}
    </button>
  {/if}

  {#if open}
    <div
      bind:this={popoverRoot}
      class={`manager-travel-popover ${popoverClass}`}
      style={popoverStyle}
      role="dialog"
      tabindex="-1"
      aria-label={dialogAriaLabel || undefined}
      use:portal={() => getPopoverHost()}
      onclick={stop}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          stop(event);
          close();
        }
      }}
    >
      {#if showSearch}
        <div class="manager-travel-popover-search">
          <input
            bind:this={searchInput}
            bind:value={search}
            type="text"
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel || undefined}
          />
        </div>
      {/if}
      {#snippet optionRow(option)}
        <button
          type="button"
          class="manager-travel-option"
          role="option"
          aria-selected={option.id === value}
          data-recipe-add={option.addMarker || undefined}
          data-popover-option={option.dataId || undefined}
          title={option.label}
          onclick={() => choose(option.id)}
        >
          {#if option.img}
            <span class="manager-travel-portrait" aria-hidden="true"
              ><img src={option.img} alt="" /></span
            >
          {:else if option.icon}
            <i class={option.icon} aria-hidden="true"></i>
          {/if}
          {#if option.meta}
            <!-- The two-line form. The wrapper is what carries the flex sizing the
                 single-line `-name` carries on its own, so the label keeps ellipsising
                 rather than pushing the trailing Chip out of the row. -->
            <span class="manager-travel-option-lines">
              <span class="manager-travel-option-name">{option.label}</span>
              <span class="manager-travel-option-meta">{option.meta}</span>
            </span>
          {:else}
            <span class="manager-travel-option-name">{option.label}</span>
          {/if}
          {#if option.trailing}<Chip tone="disabled">{option.trailing}</Chip>{/if}
        </button>
      {/snippet}

      <div
        class="manager-travel-popover-options"
        role="listbox"
        aria-label={dialogAriaLabel || undefined}
      >
        {#if isGrouped}
          {#each groupedOptions as bucket (bucket.id)}
            <div
              class="manager-travel-popover-group"
              role="group"
              aria-label={bucket.label || undefined}
              data-popover-group={bucket.id}
            >
              {#if bucket.label}
                <p class="manager-travel-popover-group-label" aria-hidden="true">{bucket.label}</p>
              {/if}
              {#each bucket.options as option (option.id)}
                {@render optionRow(option)}
              {/each}
            </div>
          {/each}
        {:else}
          {#each filteredOptions as option (option.id)}
            {@render optionRow(option)}
          {:else}
            <EmptyState compact icon="fas fa-magnifying-glass" title={emptyHint} />
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
