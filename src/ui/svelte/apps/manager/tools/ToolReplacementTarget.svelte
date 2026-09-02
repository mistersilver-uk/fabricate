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
  import SearchablePopover from '../SearchablePopover.svelte';
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
      <div class="manager-tool-replacement-tile-copy">
        <SearchablePopover
          options={pickerOptions}
          value={selected.id}
          {disabled}
          triggerClass="manager-button manager-tool-replacement-component-trigger"
          triggerIcon="fas fa-cube"
          triggerImg={selected.img || ''}
          triggerLabel={selected.name}
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
        {#if sourceText}
          <p class="manager-tool-replacement-source" data-tool-replacement-source>{sourceText}</p>
        {/if}
      </div>
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
      <i class="fas fa-arrow-down-to-bracket" aria-hidden="true"></i>
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

  /* THE FILLED FACE: a name over a source, and a 30px unlink centred against both at the right
     — `proto:2207` states 30px for that control exactly.

     A FLEX ROW AROUND A FLEX COLUMN, NOT A TWO-BY-TWO GRID. The grid form is the natural
     reading of the design and it does not survive contact with `SearchablePopover`: the picker
     is a child this template does not write, so it cannot be given an explicit grid area
     without a `:global()` rule per participant, and an unlink placed by row alone auto-places
     into whichever column the picker left — measured, it landed to the LEFT of the trigger.
     Nesting the two text lines makes the placement structural instead of positional. */
  .manager-tool-replacement-tile {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-tool-replacement-tile-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .manager-tool-replacement-source {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    font-size: 0.62rem;
    font-weight: 500;
  }
</style>
