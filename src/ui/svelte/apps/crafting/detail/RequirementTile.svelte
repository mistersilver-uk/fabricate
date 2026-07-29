<!-- Svelte 5 runes mode -->
<!--
  RequirementTile is ONE slot in the requirement rail (issue 917): a 56px square
  over an 80px column, carrying the requirement's image or essence glyph, the
  have/need corner pip moved here from IoTable's legacy grid, a caption, and — for
  a selectable slot — the disclosure line that says what opening it offers.

  Props only: every string arrives already localized and every number already
  derived, so the tile owns presentation and nothing else. Both artwork paths are
  the SHARED thumbs — CraftingThumb for component/tag artwork (plus the item-bag
  sentinel rule) and CraftingEssenceThumb for an essence glyph — so one screen can
  never draw the same essence through two components. The authored tint travels to
  the shared glyph as the inherited `--fab-chip-color` custom property set on the
  tile below, which is why the thumb needs no colour prop.

  ARIA — disclosure, not tablist. A selectable slot is a real `<button>` spanning
  the WHOLE column with `aria-expanded`/`aria-controls`; a fixed slot is a
  `role="img"` with a label, because an `aria-label` on a non-focusable span
  exposes nothing at all. Open state is an accent-SOFT FILL rather than a ring: the
  app already paints a 2px accent `:focus-visible` outline, so a ring would make
  "focused" and "open" indistinguishable to a keyboard user.
-->
<script>
  import CraftingThumb from '../CraftingThumb.svelte';
  import CraftingEssenceThumb from '../CraftingEssenceThumb.svelte';

  let {
    // Slot projection from `util/requirementSlots.js`.
    slot = null,
    // Already-normalized Font Awesome class for an essence slot's glyph.
    iconClass = '',
    // Fallback glyph for a component/tag tile with no usable artwork.
    fallbackGlyph = 'fa-solid fa-cube',
    open = false,
    // A later step's rail (or one whose time gate is armed) renders inert.
    readOnly = false,
    // Accessible name for the whole slot (localized whole sentence).
    label = '',
    caption = '',
    // Second caption line: "N options" / "Edit pool" — the disclosure affordance.
    disclosure = '',
    tileId = null,
    controlsId = null,
    onOpen = null,
  } = $props();

  const kind = $derived(String(slot?.kind ?? 'fixed'));
  const state = $derived(String(slot?.state ?? 'short'));
  const isEssence = $derived(slot?.isEssence === true);
  const selectable = $derived(slot?.interactive === true && !readOnly);
  const have = $derived(Number(slot?.have ?? 0));
  const need = $derived(Number(slot?.need ?? 0));
  // The GM-authored `--fab-tag-*` key tints the glyph only; label text keeps the
  // standard body/muted colours so an authored colour can never cut contrast.
  const tint = $derived(
    slot?.colorToken ? `--fab-chip-color: var(--fab-tag-${slot.colorToken})` : ''
  );
</script>

{#snippet body()}
  <span class="requirement-slot-tile" style={tint}>
    {#if isEssence}
      <!-- `requirement-slot-glyph` is a selector hook, not a style hook: the Foundry
           smoke harness waits on it to know a first-class essence slot has rendered. -->
      <CraftingEssenceThumb icon={iconClass} size={44} radius={8} class="requirement-slot-glyph" />
    {:else}
      <CraftingThumb src={slot?.img} alt="" size={44} glyph={fallbackGlyph} />
    {/if}
    <span class={`requirement-slot-pip is-${state}`} aria-hidden="true">{have}/{need}</span>
  </span>
  <span class="requirement-slot-caption">{caption}</span>
  {#if selectable && disclosure}
    <span class="requirement-slot-disclosure" aria-hidden="true">
      <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>{disclosure}
    </span>
  {/if}
{/snippet}

{#if selectable}
  <button
    type="button"
    class={`requirement-slot is-${state}`}
    class:is-open={open}
    id={tileId}
    data-requirement-slot={slot?.key}
    data-slot-kind={kind}
    data-slot-state={state}
    aria-expanded={open}
    aria-controls={controlsId ?? undefined}
    aria-label={label}
    title={slot?.description || undefined}
    onclick={() => onOpen?.(slot?.slotId ?? null)}
  >
    {@render body()}
  </button>
{:else}
  <span
    class={`requirement-slot is-static is-${state}`}
    role="img"
    data-requirement-slot={slot?.key}
    data-slot-kind={kind}
    data-slot-state={state}
    aria-label={label}
    title={slot?.description || undefined}
  >
    {@render body()}
  </span>
{/if}

<style>
  /* The column, not just the square, is the control: an 80px target keeps the
     caption and the disclosure line inside the same hit area. Foundry's global
     button chrome centres content and pins a fixed height, so appearance / font /
     line-height / height are all reset here (the .crafting-alt-option precedent). */
  .requirement-slot {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    /* Tiles WRAP onto a further row rather than shrinking below their minimum size:
       below it the artwork and the corner pip stop being legible. The rail's
       `flex-wrap: wrap` already produces that, but only because nothing here shrinks
       — so the promise is declared rather than left to depend on a sibling's default. */
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-1);
    width: 80px;
    height: auto;
    min-height: 0;
    padding: var(--fab-space-1) 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--fab-text);
    font: inherit;
    line-height: 1.2;
    text-align: center;
    white-space: normal;
  }

  .requirement-slot:not(.is-static) {
    cursor: pointer;
  }

  .requirement-slot:not(.is-static):hover {
    background: var(--fab-surface-soft);
  }

  /* Open is an accent-SOFT FILL, never a ring — see the header note. It sits on top
     of the status border because "open" and "satisfied" are independent facts. */
  .requirement-slot.is-open {
    background: var(--fab-accent-soft);
  }

  /* The tint vehicle. The inline `style` above overrides this declaration when the GM
     authored a colour; without one the shared glyph inherits the theme accent here,
     which is what the essence pool's own badge paints and what shipped before
     per-essence colours existed. */
  .requirement-slot-tile {
    --fab-chip-color: var(--fab-accent);

    position: relative;
    box-sizing: border-box;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border: 1.5px solid var(--fab-border);
    border-radius: 12px;
    background: var(--fab-surface-soft);
  }

  .requirement-slot.is-met .requirement-slot-tile {
    border-color: var(--fab-success-border);
  }

  .requirement-slot.is-partial .requirement-slot-tile {
    border-color: var(--fab-accent-border);
  }

  .requirement-slot.is-short .requirement-slot-tile {
    border-color: var(--fab-danger-border);
  }

  /* Corner pip, moved from IoTable's legacy grid. Solid fill for legibility over
     artwork; on-success / on-accent are dark-enough foregrounds over the mid-tone
     fills in every theme (there is no --fab-on-danger token). */
  .requirement-slot-pip {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 20px;
    height: 19px;
    padding: 0 5px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    box-shadow: var(--fab-shadow-sm);
  }

  .requirement-slot-pip.is-met {
    border: 1px solid var(--fab-success-border);
    background: var(--fab-success);
    color: var(--fab-on-success);
  }

  .requirement-slot-pip.is-partial {
    border: 1px solid var(--fab-accent-border);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .requirement-slot-pip.is-short {
    border: 1px solid var(--fab-danger-border);
    background: var(--fab-danger);
    color: var(--fab-on-accent);
  }

  .requirement-slot-caption {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  /* The disclosure line carries the visual for aria-expanded, which is why the open
     state does not need (and must not use) a ring. */
  .requirement-slot-disclosure {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 9px;
    font-weight: 600;
    color: var(--fab-accent);
  }

  .requirement-slot-disclosure i {
    font-size: 7px;
  }
</style>
