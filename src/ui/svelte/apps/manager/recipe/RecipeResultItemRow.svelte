<!-- Svelte 5 runes mode -->
<!--
  One result item inside a result group — the component this recipe produces plus a quantity.
  Result items have no name/tags/currency, so this mirrors only the `component` branch of
  `RecipeIngredientOption`: one `SearchablePopover` trigger carrying the component's image AND
  name, a capped quantity stepper and a remove control. Items have no id of their own, so the
  parent keys them by index and owns the option list, and this row emits the whole updated item
  via `onChange(nextItem)`.

  In `progressive` mode the quantity input is hidden, because the progressive award loop ignores
  `quantity` and awards each ordered entry once. A progressive row instead shows the component's
  DIFFICULTY and its COMPLICATIONS read-only, with a deep link out —
  `openspec/specs/ui-integration/spec.md` → "Progressive UI" and its `### Requirements`
  requirement 16 state both, including why neither is edited in place.

  ── THE COMPLICATION STRIP IS FULL-BLEED ─────────────────────────────────────────────────────
  The stage card is a `column` with NO padding of its own: the padding is on an inner top ROW and
  the band is that row's sibling, so the band's `border-top` runs the card's full width and reads
  as a card DIVIDER. That needs the grip and the ordinal INSIDE this component, as the
  `leadingControls` snippet, because as the card's own leading flex items they pushed the band
  ~58px in and its top rule drew as a short line floating in the middle of the card.

  Both wrappers are `display: contents` when there is no band, so a row without one is the card's
  flex items exactly as before and every global rule keyed on
  `.manager-recipe-result-row.is-reorderable .manager-recipe-ingredient-option-row` still matches.
  The card sheds its own padding onto `.manager-recipe-stage-line` only under
  `:has(.manager-recipe-stage-complications)` — see the scoped rule in styles/fabricate.css.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  // The ONE complication summary row, in its `readonly-gm` variant — shared with the Component
  // Studio's salvage strip rather than copied, across six call sites.
  import ComplicationSummaryRow from '../ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../../../utils/complicationSummary.js';

  let {
    item = {},
    componentOptions = [],
    // Hide the quantity input: progressive results are an ordered, quantity-less list.
    progressive = false,
    onChange = () => {},
    onRemove = () => {},
    // Deep link to the component editor's Difficulty card; the badge here is read-only.
    onOpenComponent = () => {},
    // Optional reorder controls (progressive only), rendered to the RIGHT of the difficulty badge
    // so a stage reads handle · component · DC · reorder · remove.
    reorderControls = null,
    // Optional LEADING controls (progressive only): the drag grip and the stage ordinal, rendered
    // INSIDE this component so the complication band can be FULL-BLEED — see the header.
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

  // The picker lists every system component; the trigger resolves the current id for display.
  const componentPickerOptions = $derived(
    (componentOptions || []).map((option) => ({
      id: option.id,
      label: option.name,
      img: option.img,
    }))
  );

  // `difficulty` is projected onto the component options; one never given reads as unset, not 0.
  const difficulty = $derived(
    Number.isFinite(Number(selectedComponent?.difficulty))
      ? Number(selectedComponent.difficulty)
      : null
  );

  // The complications this stage carries, off the SAME `componentOptions` projection the
  // difficulty badge reads and UNREDACTED, per `openspec/specs/ui-integration/spec.md`
  // `### Requirements` requirement 16 — `forecastComplications` is the PLAYER's projection and
  // would empty this strip of exactly the `gmOnly` default a GM authors. Filtered to the CRAFTING
  // activity, and progressive only, because no other mode has a stage to fire from.
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

  // FULL key literals per severity rather than a composed one: `tests/ui-lang-keys-resolve.test.js`
  // can only prove a key it can SEE written down.
  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? text(...declared) : String(severity ?? '');
  }

  // No `macroName` / `triggerName`: those vocabularies are system-scoped and this row is handed
  // neither, so the builder degrades to the effect's SHAPE and the deep link is one click from
  // the names.
  function stripSummary(complication) {
    return complicationSummary(complication, { translate: text });
  }

  // Spread the existing item so a normalized id (and any unknown fields) survive.
  function chooseComponent(id) {
    onChange({ ...item, componentId: id });
  }

  // Quantities are capped at four digits and floored to 1, which keeps the input narrow.
  function setQuantity(value) {
    const next = Number(value);
    onChange({ ...item, quantity: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1 });
  }
</script>

<!-- `display: contents` unless the strip has something to draw: a wrapper that always
     participated in layout would make the row a column item inside a centred flex card. -->
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
          <!-- The image AND the name live INSIDE one trigger in EVERY mode, the shape the
               ingredient rows and the salvage yield picker use: an image-only trigger with loose
               text beside it gave one picker two anatomies over a mode it has nothing to do with.
               The trigger sizes to the name, so it never grows into the trailing cluster, and
               `manager-recipe-stage-trigger` is the STAGE-row marker only. -->
          <SearchablePopover
            options={componentPickerOptions}
            value={componentId}
            pickerClass="manager-recipe-component-picker"
            triggerClass={`fabricate-button manager-button manager-recipe-component-trigger${progressive ? ' manager-recipe-stage-trigger' : ''}`}
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
          <!-- READ-ONLY `DC n`, then a SEPARATE "Edit ↗", the salvage stage row's shape: one
               combined chip made a read-only FACT look like the control that changes it. The DC
               always renders and anchors the trailing cluster; the Edit link needs a chosen
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
          <!-- The same shared Stepper the Ingredients rows use, so a produced quantity is edited
               identically to an ingredient quantity. -->
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

  <!-- The own-line band inside the stage card, read-only end to end: every complication on it
       belongs to the ONE component this row already names and links to, so it carries no
       per-complication Edit link and no source eyebrow. -->
  {#if stageComplications.length > 0}
    <div class="manager-recipe-stage-complications" data-recipe-result-complications={componentId}>
      {#each stageComplications as complication (complication.id)}
        <ComplicationSummaryRow
          variant="readonly-gm"
          nameEmphasis="inline"
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
  /* The read-only complication strip is component-SCOPED, never `styles/fabricate.css`: it adds
     no shared rule, and in particular does not relax
     `.manager-salvage-stage-row, .manager-recipe-result-row.is-reorderable` — a JOINED selector
     list whose join is deliberate. Theme-ROOT tokens only, on `Chip.svelte`'s note. */
  .manager-recipe-stage-complications-wrap {
    display: contents;
  }

  .manager-recipe-stage-complications-wrap.has-complications {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  /* The stage's own LINE, `display: contents` in the common case for the wrapper's reason: with
     both collapsed the grip, the ordinal and the option row are the card's own flex items. */
  .manager-recipe-stage-line {
    display: contents;
  }

  /* With a band, the LINE rather than the card carries the card's padding (see the `:has()` rule
     in styles/fabricate.css), which is what lets the band run edge to edge. Its own
     `align-items: center` centres the grip and the ordinal against the LINE they label rather
     than against the whole card. */
  .manager-recipe-stage-complications-wrap.has-complications .manager-recipe-stage-line {
    display: flex;
    gap: var(--fab-space-3);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
  }

  /* NO `margin-top`: the band's `border-top` IS the divider from the line above, and only reads
     as one when the two surfaces meet. */
  .manager-recipe-stage-complications {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 11px 11px;
    border-top: 1px solid var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
