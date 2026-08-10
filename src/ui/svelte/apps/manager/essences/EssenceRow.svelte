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
  import LibraryCard from '../library/LibraryCard.svelte';
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

  // The GRID card's recessed well. BOTH counts read the same (maintainer round): they are two
  // readings of the same kind — how much of the library uses this essence — and emphasising
  // the first implied a precedence between them that does not exist. The prototype's leading
  // stat is emphasised because "2 in · 1 out" is a headline over "2 steps"; "N components"
  // beside "N recipes" is a pair. The `strong` tone stays in the shared card for the studios
  // whose well DOES have a headline. The shared card draws the hairline between them.
  //
  // The classes and data hooks are this studio's, not the primitive's: the mounted tests and
  // the bulk panel read the counts through them.
  const cardFacts = $derived([
    {
      id: 'components',
      label: componentUsage,
      tone: 'muted',
      class: 'manager-essence-usage-components',
      attrs: { 'data-essence-usage-components': '' },
    },
    {
      id: 'recipes',
      label: recipeUsage,
      tone: 'muted',
      attrs: { 'data-essence-usage-recipes': '' },
    },
  ]);

  // Stringified for the READER, not for the renderer: Svelte drops an attribute only for
  // `null`/`undefined`, so a raw `false` would reach `setAttribute` and coerce to "false"
  // by itself. Saying it here means the rendered `data-essence-bulk-selected="false"` is
  // legible at the call site instead of resting on that coercion.
  const cardRootAttrs = $derived({
    'data-essence-id': essence?.id,
    'data-essence-variant': 'grid',
    'data-essence-enabled': disabled ? 'false' : 'true',
    'data-essence-bulk-selected': String(bulkSelected),
  });
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
{#snippet capabilityPills(extraClass = '')}
  <span class={`manager-essence-capabilities ${extraClass}`} data-essence-capabilities>
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

{#if isCard}
  <!-- GRID CARD — the shared `LibraryCard` primitive supplies the anatomy (header, badges,
       description, recessed facts well, divider, footer) and this studio supplies the
       vocabulary. The essence hooks the smoke walk, the View Lab and the mounted tests
       navigate by (`.manager-essence-row`, `.manager-essence-identity`, `data-essence-*`)
       are passed through, so the rendered card is the one those surfaces already know. -->
  <LibraryCard
    rootClass="manager-essence-row is-card"
    identityClass="manager-essence-identity"
    rootAttrs={cardRootAttrs}
    {selected}
    {disabled}
    {bulkSelected}
    name={essence.name}
    nameTitle={essence.name}
    {description}
    descriptionTitle={essence.description}
    facts={cardFacts}
    factsAttrs={{ 'data-essence-usage': '' }}
    onSelect={() => onSelect(essence.id)}
  >
    {#snippet media()}{@render medallionTile()}{/snippet}
    {#snippet badges()}
      {#if disabled}
        <StatusPill
          tone="neutral"
          icon="fas fa-circle-pause"
          label={text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}
        />
      {/if}
      {@render capabilityPills('is-card-badges')}
    {/snippet}
    {#snippet selection()}{@render selectionBox()}{/snippet}
    {#snippet footerStart()}{@render statusToggle()}{/snippet}
    {#snippet footerEnd()}{@render editButton()}{/snippet}
  </LibraryCard>
{:else}
  <li
    class={`manager-essence-row ${selected ? 'is-selected' : ''} ${disabled ? 'is-off' : ''}`}
    class:is-bulk-selected={bulkSelected}
    data-essence-id={essence.id}
    data-essence-variant="row"
    data-essence-enabled={disabled ? 'false' : 'true'}
    data-essence-bulk-selected={bulkSelected}
    aria-current={selected ? 'true' : undefined}
  >
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
  </li>
{/if}

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

  /* The chips in the GRID card wrap and sit on the card's tighter badge rhythm. This is a
     MODIFIER on the span rather than a descendant of `.manager-essence-row.is-card`, because
     the card's `<li>` is rendered by `LibraryCard` now: a selector reaching through it would
     never match (Svelte scopes both halves to THIS component) and would be reported as an
     unused selector, which `lint:svelte:warnings` fails on. The span itself is still ours —
     snippet bodies compile in the parent — so a single-element modifier still applies. */
  .manager-essence-capabilities.is-card-badges {
    flex-wrap: wrap;
    gap: var(--fab-space-1);
    min-width: 0;
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
     the dimming only reinforces it. The card's own dimming lives in `LibraryCard`, which
     owns the card body; this is the LIST row's. */
  .manager-essence-row.is-off .manager-essence-identity,
  .manager-essence-row.is-off .manager-essence-usage-readout {
    opacity: 0.72;
  }

  /* The GRID card's interior — header, badges, description, recessed facts well, divider and
     footer — now lives in `../library/LibraryCard.svelte`, which every studio's grid will
     render. It moved wholesale rather than being duplicated: a card whose look is authored
     twice is two cards. The `.is-card` hooks the global sheet still needs
     (`.manager-essence-row.is-card { margin: 0 }`) stay in `styles/fabricate.css`.

     NARROW (issue 1036). The LIST row keeps `display: flex` and simply wraps: the identity
     block takes the first line and the cluster wraps onto a second, aligned right.
     `.manager-labeled-cell` and its `::before` data-label reveal are not used at all —
     there are no columns left to label. The `:not(.is-card)` guards are gone with the card
     branch: this component only renders the list row now. */
  @container fabricate-manager (max-width: 1120px) {
    .manager-essence-identity {
      flex: 1 1 100%;
    }

    .manager-essence-cluster {
      flex: 1 1 100%;
      justify-content: flex-end;
    }
  }
</style>
