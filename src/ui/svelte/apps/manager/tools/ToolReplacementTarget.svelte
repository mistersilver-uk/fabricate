<!-- Svelte 5 runes mode -->
<!--
  THE `REPLACEMENT COMPONENT` CARD, AT BOTH TOOL SCOPES (issue 1373, maintainer round 2).

  == WHAT THE DESIGN DRAWS, AND WHAT EACH SCOPE HAD ============================================
  `proto:2200-2229` is one card with a kicker, a sentence, and then ONE of two faces: a dashed
  DROP ZONE reading `Drop a managed Component here` with a `Click to search` button inside it, or
  a FILLED TILE carrying the chosen Component's art, its name, the source it came from, and an
  unlink control.

  The SYSTEM editor had the search half only — a bare picker button under two headings, with no
  drop target, no source line and no way to clear a choice except by picking another. The WORLD
  entry had NOTHING: `Replace with component` was selectable and named no component, so a world
  default could say "replace it" and never say with what.

  Both faces ship here, once, and the two editors are its callers. Four copies of a card is what
  `ToolInheritCard` already exists to prevent one tab away, and `.svelte` is duplication-analysed.

  == THE SEARCH TRIGGER IS PRESENT IN BOTH FACES, AND THAT IS A CONTRACT =======================
  The design's filled tile carries no picker — it carries the tile and an unlink. Ours makes the
  TILE the trigger, so `.manager-tool-replacement-component-trigger` exists whether or not a
  Component is chosen. That is deliberate rather than incidental: the Foundry smoke walks this
  card by clicking that class, picking an option, and asserting the trigger's own text then
  contains the label it picked (`scripts/foundry-test-run.mjs`). A face that removed the trigger
  on selection would make that assertion unsatisfiable, and it is also the better control — the
  design's own filled tile offers unlink-then-search where one click should re-point it.

  == AND THE TILE IS A TILE, NOT A SELECT (issue 1373, maintainer round 2, E2) =================
  The filled face shipped as a full-width select — a bordered `manager-button` spanning the
  card with a chevron at its right edge, the unlink OUTSIDE it, and the source line in the
  proportional face UNDER the whole row. `proto:2205`-`2208` draws something else entirely and
  the difference is not cosmetic: it is `display: flex; align-items: center; gap: 11px;
  padding: 11px 12px; border-radius: 10px; background: var(--surface-soft); border: 1px solid
  var(--border)` holding the chip glyph, then ONE block whose first line is the name at
  `600 12.5px var(--sans)` and whose second is the SOURCE at `400 9.5px var(--mono);
  color: var(--subtle); margin-top: 2px`, ellipsised inside the tile, then a 30x30 unlink at
  `border-radius: 8px` in the danger treatment. No chevron anywhere.

  THE HOOK SURVIVES THE RESHAPE, which is the whole reason the contract above is stated. The
  trigger is now the tile's chip-and-copy region rather than a select: it still carries
  `.manager-tool-replacement-component-trigger`, it still contains the chosen Component's name,
  and it is still the topmost element at its own centre point, so the smoke's click, its
  `assertPointerTarget` and its `textContent` assertion all read the same control they always
  did. The smoke was not changed.

  THE UNLINK IS A SIBLING OF THE TRIGGER, NOT A CHILD OF IT. A `<button>` inside a `<button>`
  is the nested-button trap this epic has already hit — the browser drops the inner control and
  the outer one swallows its clicks — so the TILE is the flex row that carries the design's
  border, fill and padding, and the trigger is the chromeless region inside it. What a GM sees
  is the design's tile; what the DOM has is two sibling controls.

  THE SOURCE LINE MOVED INSIDE THE TRIGGER, through `SearchablePopover`'s `triggerMeta` — the
  trigger-side twin of the `meta` its OPTIONS have carried since issue 1010, added for this and
  empty at every other call site. Rendering it outside the trigger was the only alternative, and
  it puts the address under the CHIP rather than under the name it qualifies.

  == THE DROP ZONE RESOLVES PURELY, OR IT WRITES NOTHING =======================================
  Both Tool editors are leaves with no `game`: the mounted suites compile them with no Foundry
  global at all. So a drop is answered against the OPTION LIST the caller already passed, by
  `resolveDroppedComponentId` — a Foundry document drag matched on `registeredItemUuid` then
  `originItemUuid`, or a Fabricate drag carrying a component id. A payload naming something this
  scope cannot address resolves to `''` and the card writes nothing, which is the honest answer
  for an Item that is not a managed Component here.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconButton from '../../../components/IconButton.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import { resolveDroppedComponentId } from './toolStudio.js';

  let {
    // `{id, name, img, registeredItemUuid?, originItemUuid?}` per addressable Component.
    componentOptions = [],
    // The authored `onBreak.replacementTarget.componentId`, or `''`.
    componentId = '',
    disabled = false,
    // What the card says about WHERE the chosen Component lives, under its name. The design's
    // tile prints a source and a uuid; ours prints the caller's one sentence, because the two
    // scopes have genuinely different answers and neither is derivable in here.
    sourceText = '',
    onChoose = () => {},
    onClear = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let dragOver = $state(false);

  const options = $derived(Array.isArray(componentOptions) ? componentOptions : []);
  const selected = $derived(options.find((option) => option?.id === componentId) ?? null);
  const pickerOptions = $derived(
    options.map((option) => ({ id: option.id, label: option.name, img: option.img }))
  );

  /**
   * Read a drag payload and choose the Component it names, if this scope has one.
   *
   * @param {DragEvent} event
   * @returns {void}
   */
  function handleDrop(event) {
    event.preventDefault();
    dragOver = false;
    if (disabled) return;
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer?.getData('text/plain') || 'null');
    } catch {
      // A non-JSON drag (plain text, a file, another app's payload) is not an error to report:
      // it simply names no Component, and the resolver answers `''` for it.
      payload = null;
    }
    const resolved = resolveDroppedComponentId(payload, options);
    if (resolved) onChoose(resolved);
  }
</script>

<!-- `manager-tool-replacement-card` IS CARRIED OVER FROM THE SYSTEM EDITOR'S OWN BLOCK, not
     re-minted: `styles/fabricate.css` widens the picker trigger to the card and left-aligns its
     label under that name, and three suites address the trigger through it
     (`manager-layout`, `manager-button-cascade-inventory`, `tool-studio-mounted`). Dropping it
     would have unstyled the control at both scopes and broken three geometry guards to no
     purpose; `manager-tool-replacement` is the new box this file owns. -->
<section
  class="manager-tool-replacement manager-tool-replacement-card"
  data-tool-replacement-target
>
  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponent', 'Replacement component')}
  </p>
  <p class="manager-muted manager-tool-replacement-hint">
    {text(
      'FABRICATE.Admin.Manager.Tools.Editor.ReplacementComponentDropHint',
      'Drop a managed Component here, or search for one. It is produced in place of the Tool when it breaks.'
    )}
  </p>

  {#if selected}
    <div class="manager-tool-replacement-tile" data-tool-replacement-tile={selected.id}>
      <SearchablePopover
        options={pickerOptions}
        value={selected.id}
        {disabled}
        showChevron={false}
        pickerClass="manager-tool-replacement-picker"
        triggerClass="manager-button manager-tool-replacement-component-trigger"
        triggerIcon="fas fa-cube"
        triggerImg={selected.img || ''}
        triggerLabel={selected.name}
        triggerMeta={sourceText}
        triggerData={{ 'data-tool-replacement-source': sourceText || undefined }}
        valueClass="manager-tool-replacement-component-name"
        triggerAriaLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent',
          'Choose component'
        )}
        dialogAriaLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent',
          'Choose component'
        )}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
          'Search components...'
        )}
        {onChoose}
      />
      <IconButton
        class="is-danger"
        {disabled}
        data-tool-replacement-unlink=""
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.UnlinkReplacement',
          'Unlink replacement component'
        )}
        title={text(
          'FABRICATE.Admin.Manager.Tools.Editor.UnlinkReplacement',
          'Unlink replacement component'
        )}
        onclick={() => onClear()}><i class="fas fa-link-slash" aria-hidden="true"></i></IconButton
      >
    </div>
  {:else}
    <!-- A DIV, NOT A BUTTON. The zone holds the picker trigger, and a button inside a button is
         the nested-button trap this epic has already hit: the browser drops the inner control and
         the picker stops opening. The zone is a drop target and nothing else; the CLICK
         affordance is the trigger it contains, which is the control a keyboard reaches. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="manager-tool-replacement-drop"
      class:is-over={dragOver}
      data-tool-replacement-drop={dragOver ? 'over' : 'idle'}
      ondragover={(event) => {
        event.preventDefault();
        dragOver = true;
      }}
      ondragenter={(event) => {
        event.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={handleDrop}
    >
      <!-- `fa-download`, NOT the arrow-into-tray name the design's own markup uses: that one is
           Font Awesome PRO, and `iconSourceLicensing.test.js` fails the build on any Pro name
           appearing anywhere in a shipped file, comments included. This is the glyph the shipped
           `ItemDropZone` already draws in ITS empty face, so the two drop targets on these
           screens carry one mark. -->
      <i class="fas fa-download" aria-hidden="true"></i>
      <span class="manager-tool-replacement-drop-label">
        {text(
          'FABRICATE.Admin.Manager.Tools.Editor.ReplacementDropLabel',
          'Drop a managed Component here'
        )}
      </span>
      <SearchablePopover
        options={pickerOptions}
        value=""
        {disabled}
        showChevron={false}
        pickerClass="manager-tool-replacement-picker"
        triggerClass="manager-button manager-tool-replacement-component-trigger"
        triggerIcon="fas fa-magnifying-glass"
        triggerLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.ReplacementSearchLabel',
          'Click to search'
        )}
        valueClass="manager-tool-replacement-component-name"
        triggerAriaLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent',
          'Choose component'
        )}
        dialogAriaLabel={text(
          'FABRICATE.Admin.Manager.Tools.Editor.ChooseComponent',
          'Choose component'
        )}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
          'Search components...'
        )}
        {onChoose}
      />
    </div>
  {/if}
</section>

<style>
  /* THE CARD IS THE DESIGN'S INSET PANEL (`proto:2201`): `padding: 12px 13px`, `radius: 10px`,
     one ramp rung BELOW the editor card it sits in. `13` has no 4px token and rounds to
     `--fab-space-3`.

     THE RUNG IS `--fab-bg-0`, NOT `--fab-bg-1`, AND THE OFF-BY-ONE IS REAL. This repository's
     ramp is shifted one step against the design's: the design's `--bg1` is this theme's
     `--fab-bg-0` and its `--bg2` is `--fab-bg-1`, which is what both editor cards already use.
     So `--fab-bg-1` here would paint the inset the exact colour of the card around it and leave
     a border floating on a flat surface — measured, not assumed. */
  .manager-tool-replacement {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-bg-0);
    min-width: 0;
  }

  .manager-tool-replacement-hint {
    margin: 0;
    font-size: 0.62rem;
    line-height: 1.5;
  }

  /* ── THE FILLED FACE IS A TILE (issue 1373, maintainer round 2, E2) ──────────────────
     `proto:2205`: `display: flex; align-items: center; gap: 11px; padding: 11px 12px;
     border-radius: 10px; background: var(--surface-soft); border: 1px solid var(--border)`.
     11 and 12 both round to `--fab-space-3` on the 4px scale, and the 10px radius is the
     design's exactly.

     THE BOX IS ON THE ROW, NOT ON THE TRIGGER. The trigger is one of the row's two children
     and the unlink is the other, so the border and fill a GM reads as "the tile" belong to
     the element that contains both. That is also what keeps the unlink out of the trigger
     button; see the file header. */
  .manager-tool-replacement-tile {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  /* ── AND THE TRIGGER IS CHROMELESS INSIDE IT ────────────────────────────────
     `styles/fabricate.css` widens this trigger to `width: 100%` inside
     `.manager-tool-replacement-card` and gives it the shared component-picker box — which is
     what drew the select. Those rules are (0,3,0); anchoring each rule below on TWO classes
     this component writes puts it at (0,5,0) or deeper, so nothing here depends on which
     stylesheet is injected last. `:global()` is required because `SearchablePopover` writes
     the picker root, the button and the portrait, and none of them carries this file's hash.

     `manager-button` STAYS on the trigger. Stripping it would hand the control back to
     Foundry's own `.application button` rule, whose fixed height crops a two-line label —
     the trap this repository has already hit on card action buttons. The primitive's own
     reset is kept and only the box is neutralised. */
  .manager-tool-replacement
    .manager-tool-replacement-tile
    > :global(.manager-tool-replacement-picker) {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
  }

  .manager-tool-replacement
    .manager-tool-replacement-tile
    :global(.manager-tool-replacement-component-trigger) {
    display: flex;
    gap: var(--fab-space-3);
    width: auto;
    max-width: none;
    min-width: 0;
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
  }

  /* The chip glyph: `34px`, radius 9 (`replChip` in the design's own state object). The shared
     component-picker rule sizes it at 24px, which is a select's leading icon rather than a
     tile's mount. 34 is a published control-height rung, so nothing is rounded here. */
  .manager-tool-replacement
    .manager-tool-replacement-tile
    :global(.manager-tool-replacement-component-trigger .manager-travel-portrait) {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  /* The name: `600 12.5px var(--sans); color: var(--text)` (`proto:2207`), which is 0.78rem
     against the 16px root. The source line under it is `SearchablePopover`'s own
     `triggerMeta` and takes its mono, subtle, ellipsised treatment from the primitive. */
  .manager-tool-replacement
    .manager-tool-replacement-tile
    :global(.manager-tool-replacement-component-name) {
    color: var(--fab-text);
    font-size: 0.78rem;
    font-weight: 600;
  }

  /* THE UNLINK, in the same danger treatment as the Overview tab's source unlink and at the
     design's own 30px (`proto:2208`: `width: 30px; height: 30px; border-radius: 8px; border:
     1px solid var(--danger-border); background: var(--danger-soft); color: var(--danger-text);
     font-size: 11px`). `IconButton.is-danger` carries the edge and the ink but leaves the
     resting fill neutral, so the fill is what this adds. */
  .manager-tool-replacement .manager-tool-replacement-tile > :global(.manager-icon-button) {
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--fab-danger-soft);
    font-size: 0.68rem;
  }

  /* THE EMPTY FACE: `proto:2216`'s dashed zone — `padding:16px 12px`, `radius:10px`, a
     `1.5px` dashed strong border and a soft fill, going accent while a drag is over it. The
     border width is stated as `2px` rather than the design's 1.5: a fractional border rounds
     per device pixel ratio and reads as a 1px edge at 1x, which is the hairline this zone is
     deliberately not. */
  .manager-tool-replacement-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-4) var(--fab-space-3);
    border: 2px dashed var(--fab-border-strong);
    border-radius: 10px;
    background: var(--fab-surface-soft);
    min-width: 0;
    text-align: center;
  }

  .manager-tool-replacement-drop.is-over {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-tool-replacement-drop > i {
    color: var(--fab-text-subtle);
    font-size: 0.8rem;
  }

  .manager-tool-replacement-drop-label {
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    font-weight: 500;
  }

  /* THE SEARCH AFFORDANCE IS A PILL, NOT A SECOND SELECT (issue 1373, maintainer round 2, E2).
     `proto:2216`: `display: inline-flex; align-items: center; gap: 6px; height: 28px;
     padding: 0 12px; border-radius: 8px; background: var(--bg1); border: 1px solid
     var(--border-strong); font: 600 10.5px var(--sans); color: var(--text2)`, with a 9px
     magnifier and no chevron.

     It rendered full width with a chevron, because `styles/fabricate.css` widens every
     `.manager-tool-replacement-component-trigger` inside this card to `width: 100%` — the same
     rule that made the FILLED face a select. Both faces are corrected together; the rules are
     anchored on two classes this component writes, so they sit at (0,4,0) against that rule's
     (0,3,0). 6 is `--fab-space-chip`, the published dense unit, and 12 is `--fab-space-3`; 28 is
     a control-height rung, so nothing here is rounded.

     THE RUNG IS `--fab-bg-0`: the design's `--bg1` is this theme's `--fab-bg-0`, and the zone
     it sits in is already `--fab-surface-soft`, so a same-rung fill would leave the pill's
     border floating on a flat surface. */
  .manager-tool-replacement
    .manager-tool-replacement-drop
    > :global(.manager-tool-replacement-picker) {
    width: auto;
    max-width: 100%;
    min-width: 0;
  }

  .manager-tool-replacement
    .manager-tool-replacement-drop
    :global(.manager-tool-replacement-component-trigger) {
    gap: var(--fab-space-chip);
    width: auto;
    max-width: 100%;
    min-width: 0;
    height: 28px;
    min-height: 28px;
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-border-strong);
    border-radius: 8px;
    color: var(--fab-text-secondary);
    background: var(--fab-bg-0);
    font-size: 0.66rem;
    font-weight: 600;
  }
</style>
