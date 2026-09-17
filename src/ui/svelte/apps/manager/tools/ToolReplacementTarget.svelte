<!--
  THE `REPLACEMENT COMPONENT` CARD, AT BOTH TOOL SCOPES: one card with a kicker, a sentence, and
  then ONE of two faces — a dashed DROP ZONE with a search trigger inside it, or a FILLED TILE
  carrying the chosen Component's art, its name, the source it came from and an unlink control.
  The SYSTEM editor had the search half only, with no drop target, no source line and no way to
  clear a choice; the WORLD entry had nothing at all, so a world default could say "replace it"
  and never say with what. Both faces ship here once, and the two editors are its callers.

  THE SEARCH TRIGGER IS PRESENT IN BOTH FACES, AND THAT IS A CONTRACT. The design's filled tile
  carries only a tile and an unlink; ours makes the TILE the trigger, so
  `.manager-tool-replacement-component-trigger` exists whether or not a Component is chosen. The
  Foundry smoke walks this card by clicking that class, picking an option and asserting the
  trigger's own text then contains the label, so a face that removed the trigger on selection
  would make that unsatisfiable — and one click to re-point beats unlink-then-search anyway.

  THE TILE IS A TILE, NOT A SELECT. The filled face shipped as a full-width bordered button with a
  chevron, the unlink outside it and the source line under the whole row. The reference draws a
  flex row holding the chip glyph, then ONE block whose first line is the name and whose second is
  the SOURCE, ellipsised inside the tile, then a small unlink in the danger treatment, and no
  chevron anywhere. THE HOOK SURVIVES THE RESHAPE, which is why the contract above is stated: the
  trigger is now the tile's chip-and-copy region, still carrying the class, still containing the
  name, and still the topmost element at its own centre point, so the smoke's click, its
  `assertPointerTarget` and its `textContent` assertion all read the control they always did.

  THE UNLINK IS A SIBLING OF THE TRIGGER, NOT A CHILD OF IT, because a `<button>` inside a
  `<button>` is the nested-button trap this epic has already hit: the TILE is the flex row
  carrying the border, fill and padding, and the trigger is the chromeless region inside it. THE
  SOURCE LINE MOVED INSIDE THE TRIGGER through `SearchablePopover`'s `triggerMeta`, the
  trigger-side twin of the `meta` its options carry, because rendering it outside puts the address
  under the CHIP rather than under the name it qualifies.

  THE DROP ZONE RESOLVES PURELY, OR IT WRITES NOTHING. Both Tool editors are leaves with no
  `game`, so a drop is answered against the OPTION LIST the caller passed, by
  `resolveDroppedComponentId`. A payload naming something this scope cannot address resolves to
  `''` and the card writes nothing, which is the honest answer for an unmanaged Item.
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
    // Where the chosen Component lives, under its name: the caller's one sentence, because the
    // two scopes have genuinely different answers and neither is derivable in here.
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

  /** Read a drag payload and choose the Component it names, if this scope has one. */
  function handleDrop(event) {
    event.preventDefault();
    dragOver = false;
    if (disabled) return;
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer?.getData('text/plain') || 'null');
    } catch {
      // A non-JSON drag names no Component, which is not an error to report.
      payload = null;
    }
    const resolved = resolveDroppedComponentId(payload, options);
    if (resolved) onChoose(resolved);
  }
</script>

<!-- `manager-tool-replacement-card` IS CARRIED OVER FROM THE SYSTEM EDITOR'S OWN BLOCK rather
     than re-minted: `styles/fabricate.css` widens the picker trigger under that name and three
     suites address the trigger through it. `manager-tool-replacement` is this file's own box. -->
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
        triggerClass="fabricate-button manager-button manager-tool-replacement-component-trigger"
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
    <!-- A DIV, NOT A BUTTON: the zone holds the picker trigger, and a button inside a button is
         the nested-button trap. The zone is a drop target and nothing else. -->
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
      <!-- The glyph the shipped `ItemDropZone` already draws in ITS empty face, so the two drop
           targets carry one mark. The design's own name is Font Awesome PRO, which
           `iconSourceLicensing.test.js` fails the build on anywhere in a shipped file. -->
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
        triggerClass="fabricate-button manager-button manager-tool-replacement-component-trigger"
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
  /* THE CARD IS THE DESIGN'S INSET PANEL, one ramp rung BELOW the editor card it sits in. THE
     OFF-BY-ONE IS REAL: this repository's ramp is shifted one step against the design's, so the
     next rung up would paint the inset the exact colour of the card around it and leave a border
     floating on a flat surface — measured, not assumed. */
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

  /* THE FILLED FACE IS A TILE, and THE BOX IS ON THE ROW, NOT ON THE TRIGGER: the trigger is one
     of the row's two children and the unlink is the other, so the border and fill a GM reads as
     "the tile" belong to the element containing both. That is what keeps the unlink out of the
     trigger button; see the file header. */
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

  /* AND THE TRIGGER IS CHROMELESS INSIDE IT. `styles/fabricate.css` widens this trigger and gives
     it the shared component-picker box, which is what drew the select; anchoring each rule below
     on TWO classes this component writes puts it deeper than that sheet's, so nothing depends on
     injection order. `:global()` is required because `SearchablePopover` writes the picker root,
     the button and the portrait. `manager-button` STAYS: stripping it hands the control back to
     Foundry's own `.application button` rule, whose fixed height crops a two-line label. */
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

  /* The chip glyph at a published control-height rung: the shared component-picker rule sizes it
     as a select's leading icon rather than a tile's mount. */
  .manager-tool-replacement
    .manager-tool-replacement-tile
    :global(.manager-tool-replacement-component-trigger .manager-travel-portrait) {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  /* The name; the source line under it is `SearchablePopover`'s own `triggerMeta` and takes its
     mono, subtle, ellipsised treatment from the primitive. */
  .manager-tool-replacement
    .manager-tool-replacement-tile
    :global(.manager-tool-replacement-component-name) {
    color: var(--fab-text);
    font-size: 0.78rem;
    font-weight: 600;
  }

  /* THE UNLINK, in the same danger treatment as the Overview tab's source unlink.
     `IconButton.is-danger` carries the edge and the ink and leaves the resting fill neutral, so
     the fill is what this adds. */
  .manager-tool-replacement .manager-tool-replacement-tile > :global(.manager-icon-button) {
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--fab-danger-soft);
    font-size: 0.68rem;
  }

  /* THE EMPTY FACE: a dashed zone going accent while a drag is over it. The border width is a
     whole pixel rather than the design's fractional one, which rounds per device pixel ratio and
     reads as a 1px edge at 1x — the hairline this zone is deliberately not. */
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

  /* THE SEARCH AFFORDANCE IS A PILL, NOT A SECOND SELECT. It rendered full width with a chevron,
     because `styles/fabricate.css` widens every trigger inside this card — the same rule that made
     the FILLED face a select — so both faces are corrected together, anchored on two classes this
     component writes to outrank it. THE RUNG IS A STEP DOWN, because the zone it sits in is
     already `--fab-surface-soft` and a same-rung fill would leave its border floating. */
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
