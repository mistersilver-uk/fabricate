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
  `text-align: left`, `min-height`, no border/background) or Foundry's fixed button height
  crops it — a defect no mounted test can see. It is therefore joined into the existing
  reset, focus and focus-visible lists in `styles/fabricate.css` beside its three siblings,
  rather than restated here.
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
    colourLabel = '',
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

<li
  class={`manager-essence-row ${isCard ? 'is-card' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-off' : ''}`}
  class:is-bulk-selected={bulkSelected}
  data-essence-id={essence.id}
  data-essence-variant={isCard ? 'grid' : 'row'}
  data-essence-enabled={disabled ? 'false' : 'true'}
  data-essence-bulk-selected={bulkSelected}
  aria-current={selected ? 'true' : undefined}
>
  <button type="button" class="manager-essence-identity" onclick={() => onSelect(essence.id)}>
    <!-- The tile carries the essence's own colour. `Medallion.tint` recolours the glyph and
         washes the surface; unset resolves to the accent, which is the shipped render. -->
    <Medallion
      icon={essence.icon || 'fas fa-mortar-pestle'}
      tint={essence.colorToken || ''}
      size={40}
    />
    <span class="manager-system-copy">
      <span class="manager-essence-name-row">
        <span class="manager-system-name" title={essence.name}>{essence.name}</span>
        {#if essence.colorToken}
          <Chip tone="neutral" swatch={essence.colorToken} data-essence-colour={essence.colorToken}>
            {colourLabel}
          </Chip>
        {/if}
        {#if disabled}
          <StatusPill
            tone="neutral"
            icon="fas fa-circle-pause"
            label={text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}
          />
        {/if}
      </span>
      <span
        class="manager-system-description manager-essence-description"
        title={essence.description}
      >
        {description}
      </span>
    </span>
  </button>

  <div class="manager-essence-cluster">
    <!-- NEVER hidden for a disabled essence: hiding a pill removes state. They render in
         the muted tone beside the Disabled badge instead. -->
    <span class="manager-essence-capabilities" data-essence-capabilities>
      {#each capabilities as pill (pill.id)}
        <Chip tone={pill.tone} icon={pill.icon} data-essence-capability={pill.id}>{pill.label}</Chip
        >
      {/each}
    </span>

    <span class="manager-essence-usage-readout" data-essence-usage>
      <span data-essence-usage-components>{componentUsage}</span>
      <span data-essence-usage-recipes>{recipeUsage}</span>
    </span>

    {#if !isCard}
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

      <!-- FIRST `.manager-icon-button` in the row. See the header. -->
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
    {/if}

    <SelectionCheckbox
      size="lg"
      wrapper="label"
      checked={bulkSelected}
      ariaLabel={format(
        'FABRICATE.Admin.Manager.BulkEdit.SelectRow',
        'Select {name} for bulk edit',
        {
          name: essence.name,
        }
      )}
      data-essence-select={essence.id}
      onChange={() => onToggleBulkSelected(essence.id)}
    />
  </div>
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
  .manager-essence-row.is-card {
    position: relative;
    flex-direction: column;
    align-items: stretch;
    min-height: 0;
    padding: var(--fab-space-4);
  }

  /* The card's identity stacks: tile above copy, rather than tile beside copy. The global
     reset makes it a two-column grid, so the card overrides the template rather than the
     display mode — a `flex-direction` here would not reach a grid. */
  .manager-essence-row.is-card .manager-essence-identity {
    flex: 0 0 auto;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-2);
  }

  .manager-essence-row.is-card .manager-essence-description {
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .manager-essence-row.is-card .manager-essence-cluster {
    flex-wrap: wrap;
    margin-top: var(--fab-space-3);
    margin-left: 0;
  }

  .manager-essence-row.is-card .manager-essence-usage-readout {
    align-items: flex-start;
  }

  /* The card's selection box is the only action it carries, so it is pinned to the corner
     rather than left in the cluster where it would read as a fourth stat. */
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
