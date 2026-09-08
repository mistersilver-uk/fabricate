<!-- Svelte 5 runes mode -->
<!--
  ComponentSourcesBar is the Crafting tab's right-slot content in the shared
  ActorSelectTopBar. It shows the actors whose inventories the listing pulls
  ingredients from (services.craftingSources.sources) as a row of focusable avatar
  buttons, plus an add/edit picker listing every owned actor to toggle.

  A11y: each avatar is a <button> with an always-present aria-label (the actor
  name); the visible name reveals on :hover AND :focus-visible; removal uses a
  visible + keyboard "×" (shown on hover/focus) and right-click as an additive
  shortcut. The required (non-removable) crafting actor renders with a lock badge,
  aria-disabled, and an "always included" aria suffix, and exposes no "×".

  THE PICKER IS THE SHARED `SearchablePopover` IN ITS MULTI-SELECT MODE (issue 1513).
  The hand-rolled panel this replaced positioned itself (`position: absolute`,
  `z-index: 4000`) inside the bar, rendered no query field, and reached neither the
  portal nor the clipping-bounds pass — so it drew under the crafting listing's own
  overflow and had no way to find an actor in a long owned-actor list. Three things
  decided the conversion rather than one:

    - it COMMITS ON CHOOSE, straight through to `store.toggle`, because the surfaces
      that read the selection re-derive live: the inventory view reloads on it and
      the open recipe's requirement rail and essence pool recompute from it, so
      staging the write would remove the answer from the moment of the question;
    - its `aria-selected` is true on EVERY chosen actor at once, which is what the
      primitive's new `multiple` mode announces and what a single-value listbox
      cannot say; and
    - the panel stays open across choices, so adding four source actors is four
      clicks rather than four open-choose-reopen cycles.

  IT PASSES THE `option` SNIPPET, and that is not decoration. The primitive's own
  option markup draws `option.img` as a bare `<img>`, so taking the default here
  would revert issue 1514's conversion of this row onto the shared `Avatar` — the
  32px square tile, and with it the INITIALS fallback that replaced the `fa-user`
  glyph. The snippet is the row's SOLE content, so it draws all three parts: the
  tile, the name and the selected-state check.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Avatar from '../../components/Avatar.svelte';
  import SearchablePopover from '../../components/SearchablePopover.svelte';

  let { services = null } = $props();

  const store = $derived(services?.craftingSources ?? null);
  const sources = $derived(store?.sources ?? []);
  const available = $derived(store?.available ?? []);
  const selectedSourceIds = $derived(store?.selectedSourceIds ?? []);
  const selectedIds = $derived(new Set(selectedSourceIds));

  // The owned actors, in the picker's own option shape. `label` is what the primitive searches
  // and what the snippet renders as the row's name; `img` is the artwork the tile draws, and an
  // actor with none falls back to its initials inside `Avatar` rather than here.
  const sourceOptions = $derived(
    available.map((actor) => ({ id: actor.id, label: actor.name, img: actor.img }))
  );

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

  // COMMIT ON CHOOSE. One `store.toggle` per click and nothing else — no staged set, no Apply
  // and no Clear — because every surface that reads the selection re-derives from it live.
  function toggleAvailable(id) {
    store?.toggle(id);
  }
</script>

<div class="crafting-sources-bar" data-crafting-sources>
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

    <!-- `value` is the ARRAY of chosen ids, which is what `multiple` reads: the panel marks
         every source actor at once rather than announcing one of N. `emptyDetail` rather than
         `emptyHint`, because `Sources.Empty` is a body sentence and this primitive's
         `emptyHint` feeds `EmptyState`'s `<h3>` — the same `EmptyState note` slot the deleted
         markup already put it in. `noMatchesHint` takes the primitive's default: this control
         has never had a search, so it has no more specific sentence of its own to state.

         `popoverClass` and `optionClass` carry this file's two published hooks onto the
         primitive's own elements. They are DOM handles rather than paint: the panel is portaled
         out of this component's subtree, so nothing in the scoped block below could reach either
         one, and the primitive draws both. -->
    <SearchablePopover
      multiple
      showFilteredCount
      options={sourceOptions}
      value={selectedSourceIds}
      optionClass="crafting-source-option"
      popoverClass="crafting-sources-popover"
      dialogAriaLabel={localize('FABRICATE.App.Crafting.Sources.Edit')}
      searchPlaceholder={localize('FABRICATE.App.Crafting.Sources.SearchCharacters')}
      searchAriaLabel={localize('FABRICATE.App.Crafting.Sources.SearchCharacters')}
      emptyDetail={localize('FABRICATE.App.Crafting.Sources.Empty')}
      onChoose={toggleAvailable}
    >
      <!-- THE TRIGGER IS THIS FILE'S OWN BUTTON, through the primitive's `trigger` snippet, and
           that is a decision rather than an oversight. The dashed 40px square is the `+` well
           beside a row of 40px portraits and it is sized to them; a `triggerClass` handed to the
           primitive's own button would land on an element this component's scoped block cannot
           reach, so the rule that draws it would paint nothing. The snippet's button keeps the
           published `[data-crafting-sources-add]` hook the capture walk and the perf scenarios
           address it by, and the spread supplies `type`, `aria-haspopup="dialog"`,
           `aria-expanded` and the attachment the panel is anchored to.

           `aria-label` and `title` are written on the button rather than passed as
           `triggerAriaLabel`/`triggerTitle`: the primitive renders NO button of its own in this
           shape, so those props would ride the spread and OVERRIDE the name this snippet writes
           rather than naming anything. They are written BEFORE the spread because the primitive
           omits undefined-valued keys precisely so a caller's own name survives it. -->
      {#snippet trigger({ attributes })}
        <button
          class="crafting-sources-add"
          data-crafting-sources-add
          aria-label={localize('FABRICATE.App.Crafting.Sources.Edit')}
          title={localize('FABRICATE.App.Crafting.Sources.Edit')}
          {...attributes}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
      {/snippet}

      <!-- The row's SOLE content (the primitive renders its own markup only where no `option`
           snippet is supplied), so all three parts are drawn here.

           THE SNIPPET IS WHY THIS ROUTE DOES NOT REVERT ISSUE 1514. The primitive's default
           option markup draws `option.img` as a bare `<img>`; this row's portrait has been the
           shared `Avatar` since that change, square at the picker's own 32px rung, and its
           no-artwork state is INITIALS rather than the `fa-user` glyph the markup drew before.
           `alt=""` because the option renders the actor's name as adjacent text on the same row.

           THE THREE THINGS THAT SITE MOVED AT ISSUE 1514 AND NONE OF THEM IS A SIZE, named here
           rather than left for a frame that cannot show them: the deleted rule drew 32x32 at a
           6px corner over a `var(--fab-surface-raised)` ground with NO border, and the tile
           draws the same 32x32 at the ladder's 9px over `var(--fab-bg-3)` with a 1px
           `var(--fab-border)` hairline it did not have.

           THE CLAIM THIS PARAGRAPH USED TO MAKE IS FALSE NOW, and it is restated rather than
           deleted because it was a measurement of the tree on the day it was written. It said
           UNPHOTOGRAPHABLE: no View Lab case opened this popover, the registry having no step
           naming `data-crafting-sources-add`. Issue 1513 registered
           `player-crafting-sources-picker`, whose one step is that trigger, so this panel and
           the no-owned-actors line below it now have a published frame.

           THE MOUNTED ASSERTION STAYS ALL THE SAME, and the two prove different things: a frame
           is a photograph of the panel, not a measurement of a 32.00x32.00 tile at a 9px corner.
           `component-sources-bar-mounted` remains what holds the moves named above. -->
      {#snippet option(actor)}
        <Avatar
          art={hasImg(actor) ? actor.img : ''}
          name={actor.label}
          alt=""
          shape="square"
          size={32}
        />
        <span class="crafting-source-option-name">{actor.label}</span>
        {#if selectedIds.has(actor.id)}
          <i class="fas fa-check crafting-source-option-check" aria-hidden="true"></i>
        {/if}
      {/snippet}
    </SearchablePopover>
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

  /* THE PANEL, THE LIST AND THE OPTION ROW ARE THE PRIMITIVE'S NOW (issue 1513), so their
     rules are DELETED rather than restated. `.crafting-sources-popover` positioned itself with
     `position: absolute`, `z-index: 4000` and an 8px corner; `.crafting-source-options` and
     `.crafting-source-option` drew the scroll box and the row. `SearchablePopover` portals,
     measures and clamps the panel and paints the row from `.fabricate-picker-popover
     .manager-travel-option`, so a scoped copy here would either lose (it cannot reach an
     element another component owns, and the compiler would prune it as unused) or fight a
     shared rule for no gain.

     THE TWO RULES BELOW SURVIVE FOR THE OPPOSITE REASON: the `option` snippet is this file's
     markup, so the name span and the check glyph ARE elements this component owns and this
     block reaches. `.crafting-source-option` itself travels as `optionClass`, which keeps the
     published row hook on the primitive's element without asking this block to paint it. */

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
