<!-- Svelte 5 runes mode -->
<!--
  ComponentSourcesBar is the Crafting tab's right-slot content in the shared
  ActorSelectTopBar. It shows the actors whose inventories the listing pulls
  ingredients from (services.craftingSources.sources) as a row of focusable avatar
  buttons, plus an edit/add popover (reusing .actor-bar-popover) listing every
  owned actor to toggle.

  A11y: each avatar is a <button> with an always-present aria-label (the actor
  name); the visible name reveals on :hover AND :focus-visible; removal uses a
  visible + keyboard "×" (shown on hover/focus) and right-click as an additive
  shortcut. The required (non-removable) crafting actor renders with a lock badge,
  aria-disabled, and an "always included" aria suffix, and exposes no "×".
-->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { localize } from '../../util/foundryBridge.js';
  import Avatar from '../../components/Avatar.svelte';
  import EmptyState from '../manager/EmptyState.svelte';

  let { services = null } = $props();

  const store = $derived(services?.craftingSources ?? null);
  const sources = $derived(store?.sources ?? []);
  const available = $derived(store?.available ?? []);
  const selectedIds = $derived(new Set(store?.selectedSourceIds ?? []));

  let editorOpen = $state(false);
  let barRoot = $state(null);

  function hasImg(actor) {
    return typeof actor?.img === 'string' && actor.img.trim() !== '';
  }

  function ariaLabelFor(source) {
    return source.removable === false
      ? `${source.name} — ${localize('FABRICATE.App.Crafting.Sources.AlwaysIncluded')}`
      : source.name;
  }

  function removeSource(id, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    store?.remove(id);
  }

  // Right-click a removable avatar as an additive removal shortcut.
  function onAvatarContext(source, event) {
    if (source.removable === false) return;
    event.preventDefault();
    store?.remove(source.id);
  }

  function toggleEditor() {
    editorOpen = !editorOpen;
  }
  function closeEditor() {
    editorOpen = false;
  }
  function toggleAvailable(id) {
    store?.toggle(id);
  }
</script>

<div
  bind:this={barRoot}
  class="crafting-sources-bar"
  data-crafting-sources
  use:dismissOnOutsideClick={{ enabled: editorOpen, onDismiss: closeEditor }}
>
  <span class="crafting-sources-label">{localize('FABRICATE.App.Crafting.Sources.Label')}</span>

  <div
    class="crafting-sources-avatars"
    role="group"
    aria-label={localize('FABRICATE.App.Crafting.Sources.Label')}
  >
    {#each sources as source (source.id)}
      <span
        class="crafting-source"
        data-source-id={source.id}
        data-source-removable={source.removable === false ? 'false' : 'true'}
      >
        <button
          type="button"
          class="crafting-source-avatar"
          class:is-required={source.removable === false}
          aria-label={ariaLabelFor(source)}
          aria-disabled={source.removable === false ? 'true' : null}
          title={source.name}
          oncontextmenu={(event) => onAvatarContext(source, event)}
        >
          <!-- THE SHARED `Avatar` (issue 1514). `shape` is not optional: the component defaults
               to `round`, which draws a 999px person mark, and this well has always drawn a
               rounded square. `alt=""` because the button's own `aria-label` already carries the
               actor's name, so alt text would announce it twice. `name` is what makes the
               no-artwork state INITIALS rather than the `fa-user` glyph this markup drew — a
               content change, and the state no lab frame can draw because every lab actor
               carries a portrait. The button's own edge came off in the same commit: two
               concentric hairlines is what the conversion would otherwise render, and the
               required actor's accent ring moved to an inset `outline` that paints over this
               tile's own border rather than beside it. -->
          <Avatar
            art={hasImg(source) ? source.img : ''}
            name={source.name}
            alt=""
            shape="square"
            size={40}
          />
          {#if source.removable === false}
            <span class="crafting-source-lock" aria-hidden="true">
              <i class="fas fa-lock"></i>
            </span>
          {/if}
        </button>
        {#if source.removable !== false}
          <button
            type="button"
            class="crafting-source-remove"
            data-source-remove={source.id}
            aria-label={localize('FABRICATE.App.Crafting.Sources.Remove', { name: source.name })}
            title={localize('FABRICATE.App.Crafting.Sources.Remove', { name: source.name })}
            onclick={(event) => removeSource(source.id, event)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        {/if}
      </span>
    {/each}

    <button
      type="button"
      class="crafting-sources-add"
      data-crafting-sources-add
      aria-haspopup="dialog"
      aria-expanded={editorOpen}
      aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}
      title={localize('FABRICATE.App.Crafting.Sources.Edit')}
      onclick={toggleEditor}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>

    {#if editorOpen}
      <div
        class="crafting-sources-popover"
        role="dialog"
        aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}
      >
        <div
          class="crafting-source-options"
          role="listbox"
          aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}
        >
          {#each available as actor (actor.id)}
            <button
              type="button"
              class="crafting-source-option"
              class:is-selected={selectedIds.has(actor.id)}
              role="option"
              aria-selected={selectedIds.has(actor.id)}
              title={actor.name}
              onclick={() => toggleAvailable(actor.id)}
            >
              <!-- The same portrait at the picker's own 32px rung, which is `Avatar`'s default
                   and the canon's single portrait mark. `alt=""` because the option renders the
                   actor's name as adjacent text on the same row.

                   THIS SITE MOVES THREE THINGS AND NONE OF THEM IS A SIZE, so they are named
                   here rather than left for a frame that cannot show them. The deleted rule drew
                   32x32 at a 6px corner over a `var(--fab-surface-raised)` ground with NO border;
                   the tile draws the same 32x32 at the ladder's 9px over `var(--fab-bg-3)` with a
                   1px `var(--fab-border)` hairline it did not have. The option row is
                   `min-height: 44px` and the tile does not set one, so the row's height is
                   unmoved.

                   THE CLAIM THIS PARAGRAPH USED TO MAKE IS FALSE NOW, and it is restated rather
                   than deleted because it was a measurement of the tree on the day it was written.
                   It said UNPHOTOGRAPHABLE: no View Lab case opened this popover, the registry
                   having no step naming `data-crafting-sources-add`. Issue 1513 registered
                   `player-crafting-sources-picker`, whose one step is that trigger, so this panel
                   and the no-owned-actors line below it now have a published frame.

                   THE MOUNTED ASSERTION STAYS ALL THE SAME, and the two prove different things: a
                   frame is a photograph of the panel, not a measurement of a 32.00x32.00 tile at a
                   9px corner inside an unmoved 44px row. `component-sources-bar-mounted` remains
                   what holds the three moves named above. -->
              <Avatar
                art={hasImg(actor) ? actor.img : ''}
                name={actor.name}
                alt=""
                shape="square"
                size={32}
              />
              <span class="crafting-source-option-name">{actor.name}</span>
              {#if selectedIds.has(actor.id)}
                <i class="fas fa-check crafting-source-option-check" aria-hidden="true"></i>
              {/if}
            </button>
          {:else}
            <EmptyState note hint={localize('FABRICATE.App.Crafting.Sources.Empty')} />
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .crafting-sources-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .crafting-sources-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    white-space: nowrap;
  }

  .crafting-sources-avatars {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .crafting-source {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  /* The portrait dims on hover/focus so the centered remove "×" reads clearly over it.
     The name is exposed via the avatar's title tooltip + aria-label, not an inline
     label that would reflow the row.

     IT DIMS THE BUTTON NOW, NOT THE IMAGE (issue 1514). The `<img>` this rule used to name
     is inside `Avatar` since the conversion, and a caller's scoped block cannot reach a child
     component's element at all — so the dim moved OUT to the one element this file still owns.
     Scoped to the REMOVABLE row by its own published hook rather than applied to every source:
     the required actor renders no "×" to reveal, and dimming it would have been a hover state
     invented for a control that is not there. Everything the filter now covers is the tile
     itself; the "×" is a SIBLING of this button, so it stays at full brightness over it. */
  .crafting-source[data-source-removable='true']:hover .crafting-source-avatar,
  .crafting-source[data-source-removable='true']:focus-within .crafting-source-avatar {
    filter: brightness(0.5);
  }

  /* THE BUTTON IS A HIT TARGET NOW, NOT A TILE (issue 1514). It drew its own 1px
     `var(--fab-border)` edge over an r8 `var(--fab-surface)` ground, and the nested `Avatar`
     draws a 1px `var(--fab-border)` edge of its own that cannot be turned off — so keeping
     both would render two concentric hairlines where the design draws one. The edge, the
     ground and the corner all come off here and the tile owns them; `border-radius` stays
     only to match the tile's own 9px, so no sliver of button shows outside its corner. The
     40px box is unchanged, which is what keeps the row's geometry where it was. */
  .crafting-source-avatar {
    box-sizing: border-box;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  /* An `outline` at a NEGATIVE offset, which paints exactly over the tile's own 1px border
     rather than beside it — so the required actor still reads as one accent ring and the row
     still measures 40px. A `border-color` cannot do this any more: the border it recoloured
     belongs to the nested tile, and a caller cannot reach it. */
  .crafting-source-avatar.is-required {
    outline: 1px solid var(--fab-accent);
    outline-offset: -1px;
    cursor: default;
  }

  /* THE ROW DRAWS THE RING, BECAUSE THE BUTTON IS INSIDE A FILTER (issue 1514).

     The dim above is `filter: brightness(0.5)` on the BUTTON — it had to move there when the
     `<img>` went inside `Avatar`, since a caller's scoped block cannot reach a child
     component's element. A CSS `filter` renders its element as a group and dims everything the
     group paints, the outline included: the accent ring measures 10.17:1 over `--fab-surface`
     and 2.84:1 at half brightness, under the 3:1 SC 1.4.11 floor a focus indicator owes. This
     is the only keyboard affordance on the row, and no View Lab case focuses it, so nothing
     would have shown it.

     The wrapper is OUTSIDE the filter, so its ring paints at full brightness over the
     undimmed row. `:has()` is what lets it draw on the child's state, and both elements are in
     THIS template, so the compiler keeps the rule (`ShoppingList.svelte` records the boundary
     it would prune across). The corner matches the tile's own 9px so the ring traces the
     portrait rather than a square around it.

     `:not(:focus-visible)` on the filter was the other candidate and is refused: it would kill
     the dim at exactly the moment the "×" becomes keyboard-reachable, which is the moment the
     dim exists for. */
  .crafting-source:has(.crafting-source-avatar:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
    border-radius: 9px;
  }

  /* SUPPRESSED, not deleted. Without this the button still matches
     `.fabricate button:focus-visible` in `styles/fabricate.css`, which paints the same accent
     ring on the same element — inside the same filter — and the dimmed ring comes straight
     back beside the wrapper's. Scoped, the compiler appends `.svelte-<hash>` to the selector,
     so this is (0,3,0) — two classes and a pseudo-class — against that rule's (0,2,1), which
     is the same shape and the same figure `ShoppingList.svelte` already records for
     `.crafting-shopping-entry-main:focus-visible`. It wins on LAYER either way, and that is the
     load-bearing half: `styles/fabricate.css` ships in `@layer modules` and a scoped block is
     emitted unlayered, which beats a layered rule whatever the specificity.
     `.crafting-shopping-entry-main:focus-visible` in `ShoppingList.svelte` is the same
     pattern for the same reason. */
  .crafting-source-avatar:focus-visible {
    outline: none;
  }

  .crafting-source-lock {
    position: absolute;
    right: -4px;
    bottom: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--fab-accent);
    color: var(--fab-on-accent, var(--fab-surface));
    font-size: 8px;
  }

  /* The remove control is a centered overlay covering the avatar; on hover/focus a
     "×" appears over the (dimmed) image. Hidden otherwise so the row stays calm.
     Foundry's global `button` rule pins height/min-height to --button-size, which
     overconstrains an inset-0 absolute box (the used `bottom` is discarded), leaving
     a short overlay pinned to the top and the "×" above centre; height:auto +
     min-height:0 hand sizing back to `inset`. */
  .crafting-source-remove {
    box-sizing: border-box;
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: auto;
    min-height: 0;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--fab-overlay-dark-24);
    color: var(--fab-text);
    font-size: 15px;
    opacity: 0;
    cursor: pointer;
  }

  .crafting-source:hover .crafting-source-remove,
  .crafting-source:focus-within .crafting-source-remove,
  .crafting-source-remove:focus-visible {
    opacity: 1;
  }

  .crafting-source-remove:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-sources-add {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    border: 1px dashed var(--fab-border);
    border-radius: 8px;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
  }

  .crafting-sources-add:hover {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .crafting-sources-add:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* In-place popover listing every owned actor to toggle as a source. Mirrors the
     actor-bar popover visual treatment, scoped locally (the actor-bar's own
     popover styles are component-scoped and do not reach here). */
  .crafting-sources-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    left: auto;
    z-index: 4000;
    display: flex;
    flex-direction: column;
    width: max-content;
    min-width: 220px;
    max-width: 320px;
    max-height: min(60vh, 420px);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    box-shadow: var(--fab-shadow-lg);
    overflow: hidden;
  }

  .crafting-source-options {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    overflow-y: auto;
  }

  .crafting-source-option {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    height: auto;
    min-height: 44px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .crafting-source-option:hover {
    background: var(--fab-surface-raised);
  }

  .crafting-source-option.is-selected {
    background: var(--fab-accent-soft);
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  .crafting-source-option:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-source-option-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .crafting-source-option-check {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--fab-accent);
  }
</style>
