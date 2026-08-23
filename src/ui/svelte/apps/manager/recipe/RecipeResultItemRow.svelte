<!-- Svelte 5 runes mode -->
<!--
  One result item inside a result group — the component this recipe produces plus
  a quantity. Result items have no name/tags/currency (unlike ingredient
  alternatives), so this mirrors only the `component` branch of
  RecipeIngredientOption: one SearchablePopover trigger carrying the component's image
  AND name (sized to the name — issue 676) to pick/swap it, a capped quantity stepper,
  and a remove control. Items have no id of their own, so the parent keys them by index
  and owns the option list; this row emits the whole updated item via
  `onChange(nextItem)` (spreading the existing item so a normalized id and any
  unknown fields survive the first edit).

  In `progressive` mode the quantity input is hidden: the progressive award loop
  ignores `quantity` and awards each ordered entry once, so the GM expresses "more
  of X" by listing X again (and prioritises via reorder) rather than via a count.
  The component picker and remove control stay.

  Progressive rows also show the component's DIFFICULTY as a READ-ONLY badge with a
  deep-link to the component editor — never an inline stepper. `component.difficulty`
  is consumed by progressive recipes, progressive salvage, progressive gathering AND
  the system-validation blocker, so editing it here would either write across an
  aggregate boundary immediately (bypassing both dirty guards) or make "Save recipe"
  silently persist a *Component* change.

  ── THE COMPLICATION STRIP IS FULL-BLEED (issue 1286) ────────────────────────────
  The prototype's stage card is `flex-direction: column; overflow: hidden` with NO padding
  of its own: the padding is on an inner top ROW, and the band is that row's sibling, so
  the band's `border-top` runs the full width of the card and reads as a card DIVIDER.
  Reproducing that needs the grip and the ordinal INSIDE this component — as the
  `leadingControls` snippet, alongside the `reorderControls` one that is already here —
  because as the card's own leading flex items they pushed the band ~58px in and its top
  rule drew as a short line floating in the middle of the card.

  Both wrappers are `display: contents` when there is no band, so a row without one is the
  card's flex items exactly as before: grip, ordinal, option row. The card sheds its own
  padding onto `.manager-recipe-stage-line` only under `:has(.manager-recipe-stage-complications)`
  — see the scoped rule in styles/fabricate.css.

  ── THE COMPLICATION STRIP (issue 1286) ──────────────────────────────────────────
  A progressive stage row also shows, read-only, what the GM has said goes WRONG when
  this stage is produced. It takes the difficulty badge's doctrine wholesale, and for
  the identical reason: a complication belongs to the referenced component, whose own
  editor owns its save lifecycle, so this surface reads it and links out. The Recipe
  Studio prototype draws an inline DC stepper beside it; the doctrine above OVERRIDES
  the prototype on that control, and the strip inherits the override rather than
  reopening it.

  The strip renders inside the stage card, as the prototype has it, so the ROOT ROW is
  wrapped. The wrapper is `display: contents` whenever there is nothing to show, which
  is every non-progressive row and every progressive row whose component authors no
  crafting complication: the row is then the stage card's flex item exactly as before,
  every global rule keyed on `.manager-recipe-result-row.is-reorderable
  .manager-recipe-ingredient-option-row` still matches, and the layout is unchanged.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  // The ONE complication summary row (issue 1286), in its `readonly-gm` variant — shared
  // with the Component Studio's salvage strip rather than copied, because SonarCloud's
  // copy-paste detector reads `.svelte` and this shape has six call sites across the
  // feature's two PRs.
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../../utils/complicationSummary.js';

  let {
    item = {},
    componentOptions = [],
    // Hide the quantity input — progressive results are an ordered, quantity-less
    // list (see the parent RecipeResultGroupCard's addItem/reorder handling).
    progressive = false,
    onChange = () => {},
    onRemove = () => {},
    // Deep-link to the component editor's Difficulty card. The difficulty badge is
    // read-only here by design (see the note above).
    onOpenComponent = () => {},
    // Optional reorder controls (progressive only): the parent's up/down buttons,
    // rendered to the RIGHT of the difficulty badge — after the component's DC, before
    // the remove control — so a stage reads left-to-right as handle · component · DC ·
    // reorder · remove (issue 643). Absent (a flat row) in every other mode.
    reorderControls = null,
    // Optional LEADING controls (progressive only): the parent's drag grip and its stage
    // ordinal. They render INSIDE this component rather than as the stage card's own first
    // two flex items so that the complication band can be FULL-BLEED — see the band note
    // in the header.
    leadingControls = null,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const componentId = $derived(item?.componentId || '');
  const quantity = $derived(Number(item?.quantity) > 0 ? Number(item.quantity) : 1);

  const selectedComponent = $derived(
    componentId
      ? (componentOptions || []).find((option) => option.id === componentId) || null
      : null
  );

  // The picker lists every system component; the trigger resolves the current id
  // to its name/image so a chosen component reads back clearly.
  const componentPickerOptions = $derived(
    (componentOptions || []).map((option) => ({
      id: option.id,
      label: option.name,
      img: option.img,
    }))
  );

  // `difficulty` is projected onto the component options; a component that has never
  // been given one reads as unset rather than as a fabricated 0.
  const difficulty = $derived(
    Number.isFinite(Number(selectedComponent?.difficulty))
      ? Number(selectedComponent.difficulty)
      : null
  );

  // The complications this stage carries, read off the SAME `componentOptions` projection
  // the difficulty badge reads. It is the UNREDACTED authored list: `forecastComplications`
  // filters to `visibility: 'visible'`, which is the player's projection, and the authored
  // default is `gmOnly` — a GM strip fed from it would be empty for exactly the
  // complications a GM authors by default.
  //
  // Filtered to the CRAFTING activity, matching the prototype's `compsFor(component, mode)`:
  // a complication enabled only for salvage says nothing about a recipe stage, and listing
  // it here would tell the GM this result carries a consequence it does not. Progressive
  // only, because a complication has no stage to fire from in any other resolution mode.
  const stageComplications = $derived(
    progressive && Array.isArray(selectedComponent?.complications)
      ? selectedComponent.complications.filter(
          (complication) => complication?.activities?.crafting === true
        )
      : []
  );

  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.Admin.Manager.Component.Complications.Severity.minor', 'Minor'],
    major: ['FABRICATE.Admin.Manager.Component.Complications.Severity.major', 'Major'],
    severe: ['FABRICATE.Admin.Manager.Component.Complications.Severity.severe', 'Severe'],
  });

  // FULL key literals per severity rather than a composed `${BASE}.${severity}`:
  // `tests/ui-lang-keys-resolve.test.js` can only prove a key it can see written down, and
  // a composed one is a namespace base it admits without ever resolving the leaf.
  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  // No `macroName` / `triggerName`: those vocabularies are system-scoped and this row is
  // handed neither (they would have to be threaded through RecipeResultGroupCard and
  // RecipeResultsSection to reach here). The builder degrades to "runs a macro" and "a check
  // trigger fires", which states the SHAPE of the effect correctly; the deep-link is one
  // click from the names.
  function stripSummary(complication) {
    return complicationSummary(complication, { translate: text });
  }

  // Spread the existing item so a normalized id (and any unknown fields) survive.
  function chooseComponent(id) {
    onChange({ ...item, componentId: id });
  }

  // Quantities are capped at 9999 (four digits) and floored to 1 — more of a
  // single component is not a meaningful result, and it keeps the input narrow.
  function setQuantity(value) {
    const next = Number(value);
    onChange({ ...item, quantity: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1 });
  }
</script>

<!-- `display: contents` unless the strip has something to draw — see the header note.
     A wrapper that always participated in layout would make the row a column item inside a
     card that is `display: flex; align-items: center`, moving every progressive stage row in
     the Studio for a feature almost no recipe uses. -->
<div
  class="manager-recipe-stage-complications-wrap"
  class:has-complications={stageComplications.length > 0}
>
  <div class="manager-recipe-stage-line">
    {#if leadingControls}
      {@render leadingControls()}
    {/if}
    <div class="manager-recipe-ingredient-option-row" data-recipe-option data-recipe-result-item>
      <div class="manager-recipe-option-target">
        <div class="manager-recipe-option-component">
          <!-- The image AND the name live INSIDE one trigger, in EVERY mode (issue 676) —
               the same shape the ingredient rows and the salvage yield picker now use. The
               progressive row was migrated first and the flat row kept an image-only trigger
               with the name as loose text beside it; that split meant the same picker had two
               anatomies depending on a mode the picker itself has nothing to do with. The
               trigger sizes to the name's length, so it never grows into the trailing cluster.
               `manager-recipe-stage-trigger` remains as the STAGE-row marker only — the
               trigger anatomy no longer depends on it. -->
          <SearchablePopover
            options={componentPickerOptions}
            value={componentId}
            pickerClass="manager-recipe-component-picker"
            triggerClass={`manager-button manager-recipe-component-trigger${progressive ? ' manager-recipe-stage-trigger' : ''}`}
            triggerImg={selectedComponent?.img || ''}
            triggerIcon={selectedComponent ? '' : 'fas fa-cube'}
            triggerLabel={selectedComponent?.name ||
              text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
            valueClass={progressive
              ? 'manager-recipe-stage-trigger-name'
              : 'manager-recipe-component-name'}
            triggerTitle={selectedComponent?.name || ''}
            triggerAriaLabel={text(
              'FABRICATE.Admin.Manager.Recipe.PickComponent',
              'Pick component'
            )}
            dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
            searchPlaceholder={text(
              'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
              'Search components...'
            )}
            searchAriaLabel={text(
              'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
              'Search components...'
            )}
            emptyHint={text(
              'FABRICATE.Admin.Manager.Recipe.NoComponentsDefined',
              'No components defined'
            )}
            onChoose={(id) => chooseComponent(id)}
          />
        </div>
      </div>

      <div class="manager-recipe-option-controls">
        {#if progressive}
          <!-- READ-ONLY `DC n`, then a SEPARATE "Edit ↗" — the salvage stage row's shape
               (issue 676). It was a "DIFFICULTY" micro-label plus one combined
               `Difficulty 4 ↗` chip, which made a read-only FACT look like the control that
               changes it. `component.difficulty` has four consumers and the component
               editor's Difficulty card owns its save/discard lifecycle, so the fact is
               read-only here and the link is the only route to changing it. The DC always
               renders (it anchors the trailing cluster); the Edit link needs a chosen
               component. -->
          <span
            class="manager-recipe-stage-dc"
            data-recipe-result-difficulty={difficulty === null ? '' : String(difficulty)}
            >{difficulty === null
              ? text('FABRICATE.Admin.Manager.Recipe.DifficultyUnset', 'No difficulty')
              : `${text('FABRICATE.Admin.Manager.Recipe.DifficultyShort', 'DC')} ${difficulty}`}</span
          >

          {#if selectedComponent}
            <button
              type="button"
              class="manager-recipe-stage-edit"
              data-recipe-result-edit={componentId}
              aria-label={`${text('FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty', 'Edit difficulty on the component')} — ${selectedComponent.name}`}
              title={text(
                'FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty',
                'Edit difficulty on the component'
              )}
              onclick={() => onOpenComponent(componentId)}
            >
              <span>{text('FABRICATE.Admin.Manager.Recipe.EditDifficulty', 'Edit')}</span>
              <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
            </button>
          {/if}
        {/if}

        {#if !progressive}
          <!-- The same shared Stepper the Ingredients rows use (−/value/+), not a bare
               number input, so a produced quantity is edited identically to an ingredient
               quantity. -->
          <Stepper
            value={quantity}
            min={1}
            max={9999}
            ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
            decrementLabel={text(
              'FABRICATE.Admin.Manager.Recipe.QuantityDecrement',
              'Decrease quantity'
            )}
            incrementLabel={text(
              'FABRICATE.Admin.Manager.Recipe.QuantityIncrement',
              'Increase quantity'
            )}
            inputProps={{
              'data-recipe-option-quantity': '',
              class: 'fab-stepper-input manager-recipe-option-quantity',
            }}
            onChange={(value) => setQuantity(value)}
          />
        {/if}

        {#if reorderControls}
          {@render reorderControls()}
        {/if}

        <!-- A subtle × (§C7), never a loud red fa-minus. -->
        <button
          type="button"
          class="manager-recipe-result-remove manager-recipe-option-remove"
          data-recipe-remove="result-item"
          aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
          title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
          onclick={() => onRemove()}><i class="fas fa-times" aria-hidden="true"></i></button
        >
      </div>
    </div>
  </div>

  <!-- The prototype's own-line band inside the stage card. Read-only end to end: there is
       no per-complication Edit link here, because in this build every complication on the
       band belongs to the ONE component this row already names and already links to
       (issue 1287 is what gives the band complications from other components, and the
       `eyebrow` prop on the shared row is what will name their source then). -->
  {#if stageComplications.length > 0}
    <div class="manager-recipe-stage-complications" data-recipe-result-complications={componentId}>
      {#each stageComplications as complication (complication.id)}
        <ComplicationSummaryRow
          variant="readonly-gm"
          name={complication.name}
          severity={complication.severity}
          severityLabel={severityLabel(complication.severity)}
          visibility={complication.visibility}
          playerLabel={text('FABRICATE.Admin.Manager.Component.Complications.PlayerPill', 'Player')}
          playerTitle={text(
            'FABRICATE.Admin.Manager.Component.Complications.PlayerPillTitle',
            'Shown to the player when it fires.'
          )}
          triggerSentence={stripSummary(complication)}
          dataAttr="data-recipe-result-complication"
          dataValue={complication.id}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  /* ── The read-only complication strip (issue 1286) ──────────────────────────────────
     Component-SCOPED, never `styles/fabricate.css`: the strip's whole point is that it
     adds no shared rule, and in particular does not relax
     `.manager-salvage-stage-row, .manager-recipe-result-row.is-reorderable` — a JOINED
     selector list whose join is deliberate, so a change there re-shapes the progressive
     stage row in BOTH studios. Theme-ROOT tokens only, on `Chip.svelte`'s note. */
  .manager-recipe-stage-complications-wrap {
    display: contents;
  }

  .manager-recipe-stage-complications-wrap.has-complications {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  /* The stage's own LINE. `display: contents` in the common case, for the same reason the
     wrapper is: with both collapsed, the grip, the ordinal and the option row are the
     card's flex items exactly as they were before this component ever took a band. */
  .manager-recipe-stage-line {
    display: contents;
  }

  /* With a band, the line becomes the real row — and it is the line, not the card, that
     carries the card's padding (see the `:has()` rule in styles/fabricate.css). That is
     what lets the band below run edge to edge. Its own `align-items: center` is also what
     retires the card-level `align-items: flex-start` this band used to need: the grip and
     the ordinal now centre against the LINE they label, which is all they were ever
     supposed to do, rather than against the whole card. */
  .manager-recipe-stage-complications-wrap.has-complications .manager-recipe-stage-line {
    display: flex;
    gap: var(--fab-space-3);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
  }

  /* NO `margin-top`. The band's `border-top` IS the divider between it and the line above,
     which only reads as one when the two surfaces meet — a 9px gap in the card's own fill
     turned that rule into a short line floating above a detached panel. */
  .manager-recipe-stage-complications {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 11px 11px;
    border-top: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
