<!-- Svelte 5 runes mode -->
<!--
  ONE essence, rendered as either a LIST ROW or a GRID CARD (issue 1036).

  Two presentations, one component, deliberately. The delta requires the grid card to carry
  the SAME state vocabulary as the row — the Disabled pill, the capability pills and the
  recipe count — because a presentation toggle must not silently remove state, and the
  prototype's grid signals disabled by dimming alone, which fails "icon + word, always". Two
  components would make that a convention; one component makes it a construction.

  What legitimately differs is the ACTIONS. Row actions are row-only: the grid card carries
  the selection box and nothing else, and grid selection routes through the inspector. That
  is the prototype's own division and it is why `variant` gates only the trailing cluster.

  ── ARIA (issue 1036) ─────────────────────────────────────────────────────────────
  The list is a real `<ul role="list">` of `<li>` cards and this row carries NO `role="row"`
  / `role="cell"` / `aria-selected`: the `role="table"` head they depended on is deleted,
  and `aria-selected` is not valid on an `<li>` outside a listbox. Selection is conveyed by
  the `.is-selected` ring, `aria-current` and the inspector heading, exactly as
  `RecipesBrowserView` does.

  ── THE FIRST `.manager-icon-button` MUST STAY THE EDIT PENCIL ────────────────────
  The View Lab case `manager-essence-edit-first-state` navigates by
  `.manager-essence-row[data-essence-id="earth"] .manager-icon-button`. The row also carries
  an enable toggle and a selection box; the toggle wears `.manager-status-toggle`, not
  `.manager-icon-button`, and `SelectionCheckbox` renders no `<button>` at all, so neither
  can intercept. A new icon button placed BEFORE the pencil would.

  ── THE CARD IS NOT A `<button>`; ITS IDENTITY IS ─────────────────────────────────
  The row/card root is an `<li>` and carries NO click or keydown handler. The selecting
  control is an inner `<button class="manager-essence-identity">`, exactly as
  `.manager-recipe-identity` and `.manager-component-identity` already are.

  The plan said "a `<div>` with a click/keydown handler and `tabindex=\"0\"`, as
  `.manager-essence-row` does today", and this DEVIATES from that — deliberately, and in the
  direction the plan's own reasoning points. The plan's stated concern was that the card
  must not BECOME a `<button>`, because it contains `SelectionCheckbox` (a `<label><input>`)
  and an interactive inside a `<button>` is invalid DOM that `createElement` lands silently.
  That concern is fully honoured: the checkbox, the toggle and the pencil are all OUTSIDE
  the identity button. Meanwhile a handler-bearing `<div>` with `tabindex="0"` and no role
  raises two Svelte compiler warnings, and `npm run lint:svelte:warnings` fails on any
  warning at all — the shipped row escaped them only because of the `role="row"` this
  redesign deletes along with the table head. Nesting rather than converting is the rule the
  hazard list states, and this nests.

  The identity button needs the manager's `<button>` RESET (`appearance: none`,
  `text-align: left`, `height: auto`, `min-height`, no border/background) or Foundry's fixed
  button height crops it — a defect no mounted test can see. It is therefore joined into the
  existing reset, focus and focus-visible lists in `styles/fabricate.css` beside its three
  siblings, rather than restated here.

  `height: auto` was ADDED to that shared list for this change, and adding it there rather
  than restating it on the card variant is deliberate. `min-height` alone does not defeat
  Foundry's fixed `height`: used height is `max(height, min-height)`, so a grow-tall variant
  still resolves to 46px. The four row-shaped siblings never noticed because their content
  never exceeds 46px; this card, a ~150px stack of the SAME button, is the first that does.
  CONTRIBUTING.md states the two properties as one rule, so splitting them across two blocks
  would leave the next tall identity button to rediscover the same crop.
-->
<script>
  import Chip from '../Chip.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { essenceCapabilityPills } from './essenceStudio.js';

  let {
    essence = null,
    variant = 'row',
    selected = false,
    bulkSelected = false,
    effectTransferEnabled = false,
    propertyMacrosEnabled = false,
    text = (_key, fallback) => fallback,
    format = (_key, fallback) => fallback,
    onSelect = () => {},
    onEdit = () => {},
    onToggleEnabled = () => {},
    onToggleBulkSelected = () => {},
  } = $props();

  const isCard = $derived(variant === 'grid');
  const disabled = $derived(essence?.enabled === false);
  const capabilities = $derived(
    essenceCapabilityPills(essence, { effectTransferEnabled, propertyMacrosEnabled }, text)
  );
  const description = $derived(
    essence?.description || text('FABRICATE.Admin.Manager.NoDescription', 'No description')
  );
  const componentUsage = $derived(
    format('FABRICATE.Admin.Manager.Essence.ComponentUsageCount', '{count} components', {
      count: essence?.componentUsageCount || 0,
    })
  );
  const recipeUsage = $derived(
    format('FABRICATE.Admin.Manager.Essence.RecipeUsageCount', '{count} recipes', {
      count: essence?.recipeUsageCount || 0,
    })
  );
</script>

<!-- The tile carries the essence's own colour. `Medallion.tint` recolours the glyph and
     washes the surface; unset resolves to the accent, which is the shipped render. -->
{#snippet medallionTile()}
  <Medallion
    icon={essence.icon || 'fas fa-mortar-pestle'}
    tint={essence.colorToken || ''}
    size={40}
  />
{/snippet}

<!-- NO colour-name chip (issue 1036, maintainer round 2). The medallion already carries the
     essence's colour, and a maintained display name for every theme colour is upkeep with no
     reader. Removing it also un-wraps the DISABLED pill. -->
{#snippet nameRow()}
  <span class="manager-essence-name-row">
    <span class="manager-system-name" title={essence.name}>{essence.name}</span>
    {#if disabled}
      <StatusPill
        tone="neutral"
        icon="fas fa-circle-pause"
        label={text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}
      />
    {/if}
  </span>
{/snippet}

<!-- NEVER hidden for a disabled essence: hiding a pill removes state. They render in the
     muted tone beside the Disabled badge instead. In the GRID card they sit in the header
     row beside the medallion; in the LIST row they stay in the trailing cluster. -->
{#snippet capabilityPills()}
  <span class="manager-essence-capabilities" data-essence-capabilities>
    {#each capabilities as pill (pill.id)}
      <Chip
        tone={pill.tone}
        icon={pill.icon}
        title={pill.title || undefined}
        data-essence-capability={pill.id}
        data-essence-capability-state={pill.tone === 'warning' ? 'broken' : 'ok'}>{pill.label}</Chip
      >
    {/each}
  </span>
{/snippet}

<!-- The two usage counts. Deleting an essence is warned, not blocked (issue 1036, maintainer
     round), so the component count renders plainly — the impact of a delete is stated in the
     confirm dialog and the bulk panel rather than as a padlock here. -->
{#snippet usageReadout()}
  <span class="manager-essence-usage-readout" data-essence-usage>
    <span class="manager-essence-usage-components" data-essence-usage-components
      >{componentUsage}</span
    >
    <span data-essence-usage-recipes>{recipeUsage}</span>
  </span>
{/snippet}

{#snippet selectionBox()}
  <SelectionCheckbox
    size="lg"
    wrapper="label"
    checked={bulkSelected}
    ariaLabel={format('FABRICATE.Admin.Manager.BulkEdit.SelectRow', 'Select {name} for bulk edit', {
      name: essence.name,
    })}
    data-essence-select={essence.id}
    onChange={() => onToggleBulkSelected(essence.id)}
  />
{/snippet}

<!-- The enable/disable toggle and the edit pencil. Shared by the LIST row's trailing cluster
     and the GRID card's footer (issue 1036, maintainer round): the prototype's grid card carries
     these actions in a divided footer, not only in the inspector. -->
{#snippet statusToggle()}
  <button
    type="button"
    class={`manager-status-toggle ${disabled ? 'is-off' : 'is-on'}`}
    data-essence-toggle={essence.id}
    aria-pressed={!disabled}
    aria-label={format(
      disabled
        ? 'FABRICATE.Admin.Manager.Essence.EnableNamed'
        : 'FABRICATE.Admin.Manager.Essence.DisableNamed',
      disabled ? 'Enable {name}' : 'Disable {name}',
      { name: essence.name }
    )}
    onclick={(event) => {
      event.stopPropagation();
      onToggleEnabled(essence.id, disabled);
    }}
  >
    <span class="manager-status-toggle-track" aria-hidden="true"
      ><span class="manager-status-toggle-knob"></span></span
    >
  </button>
{/snippet}

{#snippet editButton()}
  <button
    type="button"
    class="manager-icon-button manager-essence-edit"
    data-essence-edit={essence.id}
    aria-label={format('FABRICATE.Admin.Manager.Essence.EditNamed', 'Edit {name}', {
      name: essence.name,
    })}
    title={text('FABRICATE.Admin.Manager.Essence.Edit', 'Edit essence')}
    onclick={(event) => {
      event.stopPropagation();
      onEdit(essence.id);
    }}
  >
    <i class="fas fa-pen" aria-hidden="true"></i>
  </button>
{/snippet}

<li
  class={`manager-essence-row ${isCard ? 'is-card' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-off' : ''}`}
  class:is-bulk-selected={bulkSelected}
  data-essence-id={essence.id}
  data-essence-variant={isCard ? 'grid' : 'row'}
  data-essence-enabled={disabled ? 'false' : 'true'}
  data-essence-bulk-selected={bulkSelected}
  aria-current={selected ? 'true' : undefined}
>
  {#if isCard}
    <!-- GRID CARD (issue 1036, maintainer round) — the prototype's left-aligned stack, in order:
         a HEADER pairing the medallion with the name to its right; a BADGES row (Disabled pill +
         capability chips); the DESCRIPTION; a bordered FACTS box carrying the component and recipe
         counts; then a divided FOOTER with the enable toggle and the edit pencil. Every row has a
         fixed height so the cards in a shelf stay level. The identity `<button>` wraps only the
         non-interactive body (header → facts); the checkbox (absolute, top-right) and the footer
         controls are its siblings so no interactive element nests inside the button. -->
    <button type="button" class="manager-essence-identity" onclick={() => onSelect(essence.id)}>
      <span class="manager-essence-card-header">
        {@render medallionTile()}
        <span class="manager-essence-card-heading">
          <span class="manager-system-name" title={essence.name}>{essence.name}</span>
        </span>
      </span>
      <span class="manager-essence-card-badges">
        {#if disabled}
          <StatusPill
            tone="neutral"
            icon="fas fa-circle-pause"
            label={text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}
          />
        {/if}
        {@render capabilityPills()}
      </span>
      <span
        class="manager-system-description manager-essence-description"
        title={essence.description}
      >
        {description}
      </span>
      <span class="manager-essence-card-facts" data-essence-usage>
        <span class="manager-essence-usage-components" data-essence-usage-components
          >{componentUsage}</span
        >
        <span class="manager-essence-card-facts-sep" aria-hidden="true"></span>
        <span data-essence-usage-recipes>{recipeUsage}</span>
      </span>
    </button>
    {@render selectionBox()}
    <div class="manager-essence-card-footer">
      {@render statusToggle()}
      {@render editButton()}
    </div>
  {:else}
    <button type="button" class="manager-essence-identity" onclick={() => onSelect(essence.id)}>
      {@render medallionTile()}
      <span class="manager-system-copy">
        {@render nameRow()}
        <span
          class="manager-system-description manager-essence-description"
          title={essence.description}
        >
          {description}
        </span>
      </span>
    </button>

    <div class="manager-essence-cluster">
      {@render capabilityPills()}
      {@render usageReadout()}
      {@render statusToggle()}
      <!-- FIRST `.manager-icon-button` in the row stays the edit pencil (View Lab navigates by it). -->
      {@render editButton()}
      {@render selectionBox()}
    </div>
  {/if}
</li>

<style>
  /* The row's INTERIOR only. `.manager-essence-row` itself stays in the four shared
     selector lists in `styles/fabricate.css` — the row skin, the 76px geometry group, the
     hover group and the `.is-selected` accent-ring group — so the one-consistent-
     selected-row-signal rule holds by construction and two of those lists stay pinned by
     exact multi-line selector text in `manager-layout.test.js`.

     The row LEAVES the narrow `@container` join and the `display: grid` +
     `--fab-mv2-essence-grid` join: the first sets `align-items: stretch`, a live flex
     property that would stretch the medallion and the controls to full card height, and
     the second has no table head left to serve. The replacement narrow behaviour is
     specified below and photographed. */
  .manager-essence-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    list-style: none;
  }

  /* Layout only. The `<button>` RESET lives in `styles/fabricate.css`, joined to the three
     sibling identity buttons, because it must beat Foundry's host button geometry — which
     a scoped block at equal specificity is not guaranteed to do. */
  .manager-essence-identity {
    flex: 1 1 260px;
    min-width: 0;
  }

  .manager-essence-name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* One line with a `title`, so a long description cannot grow the row past its shared
     76px minimum and desynchronise it from every other manager browser row. */
  .manager-essence-description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .manager-essence-cluster {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--fab-space-3);
    margin-left: auto;
  }

  .manager-essence-capabilities {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-essence-usage-readout {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    color: var(--fab-text-muted);
    font-size: 0.7rem;
    line-height: 1.3;
    white-space: nowrap;
  }

  /* A disabled essence is DIMMED as well as pilled — the pill is what carries the state,
     the dimming only reinforces it. */
  .manager-essence-row.is-off .manager-essence-identity,
  .manager-essence-row.is-off .manager-essence-usage-readout {
    opacity: 0.72;
  }

  /* The GRID card. A column rather than a row, with the selection box floated into the
     top-right corner over the tile — which is what the prototype shows and what keeps the
     card's body a single readable stack. */
  /* GRID CARD (issue 1036, maintainer round) — the prototype's left-aligned vertical stack.
     `align-items: stretch` overrides the shared identity reset's `center`. Every row has a
     bounded height (fixed medallion header, reserved badge row, fixed 2-line description,
     one-line facts box, footer) so the cards in a shelf stay level regardless of content. */
  .manager-essence-row.is-card {
    position: relative;
    flex-direction: column;
    align-items: stretch;
    min-height: 0;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
  }

  /* The identity `<button>` is the card BODY (header → facts). The global reset makes it a
     two-column grid for the list row, so the card re-declares flex-column to stack its rows. */
  .manager-essence-row.is-card .manager-essence-identity {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    flex: 0 0 auto;
    gap: var(--fab-space-2);
  }

  /* HEADER: medallion on the left, the name to its right. `padding-right` reserves room for the
     absolute selection checkbox pinned in the top-right corner, so the name never runs under it. */
  .manager-essence-card-header {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    padding-right: 2.25rem;
  }

  .manager-essence-card-heading {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    min-height: 40px;
  }

  .manager-essence-row.is-card .manager-system-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--fab-font-serif);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.2;
  }

  /* BADGES row: the Disabled pill and the capability chips, left-aligned. A reserved min-height
     keeps a card with no badges the same height as one that has them. */
  .manager-essence-card-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-height: 1.35rem;
  }

  .manager-essence-row.is-card .manager-essence-capabilities {
    flex-wrap: wrap;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* DESCRIPTION: a fixed 2-line box so the facts box and footer beneath land at the same
     offset in every card. `title` on the span keeps the full text reachable. */
  .manager-essence-row.is-card .manager-essence-description {
    -webkit-line-clamp: 2;
    line-clamp: 2;
    line-height: 1.4;
    min-height: calc(1.4em * 2);
    font-size: 0.72rem;
  }

  /* FACTS box: the component and recipe counts in a RECESSED well, split by a hairline —
     the prototype's "in · out / steps" box, carrying the essence's two usage counts.

     The surface is `--fab-bg-1` rather than transparent, and that is not a guess: the
     maintainer's prototype was measured in Chromium, and its facts-box background computes
     to the SAME value `--fab-bg-1` resolves to in the default theme, with its muted half
     landing on `--fab-text-subtle` exactly. The mock was drawn from this palette, so the
     faithful render and the tokenised one are the same render. The inspector's stat tiles
     (`.manager-essence-stat`, `styles/fabricate.css`) already state this idiom in-house —
     recessed `--fab-bg-1` well, bordered, with a full-strength value over a subtle label —
     so this box now agrees with BOTH the prototype and the surface one click away, instead
     of being a flat outline that matched neither. */
  .manager-essence-card-facts {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    white-space: nowrap;
  }

  /* The component count is the PRIMARY fact and carries the emphasis, exactly as the
     prototype's leading "2 in · 1 out" does against its trailing "2 steps": full-strength
     text at 600 over the subtle recipe count. A well in which both halves read identically
     is a box with no hierarchy, which is what this was. */
  .manager-essence-card-facts .manager-essence-usage-components {
    color: var(--fab-mv2-text);
    font-size: 0.66rem;
    font-weight: 600;
  }

  .manager-essence-card-facts-sep {
    flex: 0 0 auto;
    width: 1px;
    height: 0.9em;
    background: var(--fab-mv2-border);
  }

  /* FOOTER: a divider, then the enable toggle on the left and the edit pencil on the right —
     the prototype's card actions, which the essence grid previously routed only to the inspector. */
  .manager-essence-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-1);
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-mv2-border);
  }

  /* The card's selection box is pinned to the top-right corner over the header. */
  .manager-essence-row.is-card :global(.fab-selection-checkbox) {
    position: absolute;
    top: var(--fab-space-3);
    right: var(--fab-space-3);
  }

  /* NARROW (issue 1036). The row keeps `display: flex` and simply wraps: the identity
     block takes the first line and the cluster wraps onto a second, aligned right.
     `.manager-labeled-cell` and its `::before` data-label reveal are not used at all —
     there are no columns left to label. */
  @container fabricate-manager (max-width: 1120px) {
    .manager-essence-row:not(.is-card) .manager-essence-identity {
      flex: 1 1 100%;
    }

    .manager-essence-row:not(.is-card) .manager-essence-cluster {
      flex: 1 1 100%;
      justify-content: flex-end;
    }
  }
</style>
