<!-- Svelte 5 runes mode -->
<!--
  RequirementTile is ONE slot in the requirement rail (issue 917): a 56px square
  over an 80px column, carrying the requirement's image or essence glyph, the
  have/need corner pip moved here from IoTable's legacy grid, a caption, and — for
  a selectable slot — the disclosure line that says what opening it offers.

  A CURRENCY slot is the one exception to the pip (issue 1493): its caption already
  states the cost, and it has no have/need ratio to report.

  Props only: every string arrives already localized and every number already
  derived, so the tile owns presentation and nothing else. Both artwork paths are
  now the ONE shared `Medallion` (issue 1506): the component/tag branch resolves its
  art through `resolveCraftingArt`, which carries the item-bag sentinel rule the
  retired thumb owned, and the essence branch draws a glyph. One screen can still
  never draw the same essence through two components, because there is only one tile
  component left. The authored tint reaches the glyph as the primitive's own `tint`
  prop rather than as an inherited custom property on the tile below, which is what
  retired that vehicle here.

  ARIA — disclosure, not tablist. A selectable slot is a real `<button>` spanning
  the WHOLE column with `aria-expanded`/`aria-controls`; a fixed slot is a
  `role="img"` with a label, because an `aria-label` on a non-focusable span
  exposes nothing at all. Open state is an accent-SOFT FILL rather than a ring: the
  app already paints a 2px accent `:focus-visible` outline, so a ring would make
  "focused" and "open" indistinguishable to a keyboard user.
-->
<script>
  import Medallion from '../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../util/craftingArtResolution.js';
  import { normalizeEssenceIcon } from '../../../util/essenceIcons.js';

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
  // A currency slot draws NO pip (issue 1493). Its `need` is a price and its `have` is
  // always 0, so "0/100" states a shortfall the player may well not have — and the
  // affordability verdict is already carried by the status border, which for a fixed
  // slot is exactly `satisfied ? met : short`. A cost chip is not drawn either: it would
  // be byte-identical to the caption immediately below it, which is already the cost.
  const isCurrency = $derived(slot?.isCurrency === true);
  const selectable = $derived(slot?.interactive === true && !readOnly);
  const have = $derived(Number(slot?.have ?? 0));
  const need = $derived(Number(slot?.need ?? 0));
  // The GM-authored `--fab-tag-*` key tints the essence glyph only; label text keeps the
  // standard body/muted colours so an authored colour can never cut contrast. It reaches the
  // glyph as the tile primitive's own `tint` prop since issue 1506; it used to travel as an
  // inherited `--fab-chip-color` set on the wrapper below, which existed because the retired
  // essence thumb took no colour argument.
</script>

{#snippet body()}
  <span class="requirement-slot-tile">
    {#if isEssence}
      <!-- The Foundry smoke harness waits on `[data-slot-kind="essence"] [data-medallion]` to
           know a first-class essence slot has rendered. That used to be a caller-owned
           `requirement-slot-glyph` class, which the shared tile has no prop to carry and did
           not need: the primitive's own data hook says the same thing inside a slot the
           harness already selects by kind. -->
      <Medallion
        icon={normalizeEssenceIcon(iconClass)}
        tint={slot?.colorToken || ''}
        size={44}
        glyph={18}
      />
    {:else}
      <Medallion {...resolveCraftingArt(slot?.img, fallbackGlyph)} alt="" size={44} glyph={19.8} />
    {/if}
    {#if !isCurrency}
      <span class={`requirement-slot-pip is-${state}`} aria-hidden="true">{have}/{need}</span>
    {/if}
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

  /* The tint vehicle was here — a `--fab-chip-color` the essence glyph inherited, defaulting
     to the theme accent. Issue 1506 retired it: the shared tile takes the authored key as a
     `tint` PROP and falls back to the same theme accent itself, so an authored colour and an
     unauthored one both render exactly what they did, from one declaration instead of two. */
  .requirement-slot-tile {
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
