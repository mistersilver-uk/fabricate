<!--
  ONE essence, rendered as either a LIST ROW or a GRID CARD, from one component deliberately: the
  card must carry the SAME state vocabulary as the row, because a presentation toggle must not
  silently remove state, and two components would make that a convention where one makes it a
  construction. What legitimately differs is the ACTIONS, so `variant` gates only the cluster.

  ARIA: the list is a real `<ul role="list">` of `<li>` cards, and this row carries NO `role="row"` /
  `role="cell"` / `aria-selected` — the `role="table"` head they depended on is deleted, and
  `aria-selected` is not valid on an `<li>` outside a listbox. Selection is conveyed by the
  `.is-selected` ring, `aria-current` and the inspector heading. THE FIRST `.manager-icon-button`
  MUST STAY THE EDIT PENCIL, because a View Lab case navigates by it; the toggle and the selection
  box emit other elements, so only a new icon button placed BEFORE the pencil could intercept.

  THE CARD IS NOT A `<button>`; ITS IDENTITY IS. The root `<li>` carries no handler and the selecting
  control is an inner `<button class="manager-essence-identity">`, with the checkbox, the toggle and
  the pencil all OUTSIDE it, because interactive content inside a `<button>` is invalid DOM that
  `createElement` lands silently. A handler-bearing `<div>` with `tabindex="0"` is not the
  alternative: it raises two Svelte compiler warnings, which `lint:svelte:warnings` fails on.

  The identity button needs the manager's `<button>` RESET or Foundry's fixed height crops it — a
  defect no mounted test can see — so it joins the shared reset, focus and focus-visible lists in
  `styles/fabricate.css` rather than restating them. `height: auto` belongs in that shared list too,
  because used height is `max(height, min-height)`.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import LibraryCard from '../library/LibraryCard.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import { essenceCapabilityPills } from './essenceStudio.js';
  import IconButton from '../../../components/IconButton.svelte';

  let {
    essence = null,
    variant = 'row',
    selected = false,
    bulkSelected = false,
    effectTransferEnabled = false,
    propertyMacrosEnabled = false,
    // THE THREE-STATE MEMBERSHIP ANSWER. `''` means the world corpus could not answer, which is
    // NOT `absent`: collapsing the two would put an Add button on every row of an unreadable world.
    membershipState = '',
    // One CLAUSE per world-default section, naming the value it resolves to here and marking a
    // local override; `EssenceBrowserView.summaryClauses` owns the wording.
    summaryClauses = [],
    text = (_key, fallback) => fallback,
    format = (_key, fallback) => fallback,
    onSelect = () => {},
    onEdit = () => {},
    onToggleEnabled = () => {},
    onToggleBulkSelected = () => {},
    onAddToSystem = null,
  } = $props();

  const isCard = $derived(variant === 'grid');
  const disabled = $derived(essence?.enabled === false);
  // AN ABSENT ROW HAS NOTHING TO EDIT, DISABLE, SELECT OR DELETE: it is a world essence this system
  // has no record for, so it renders its identity, its state and ONE verb — Add.
  const absent = $derived(membershipState === 'absent');
  const capabilities = $derived(
    essenceCapabilityPills(essence, { effectTransferEnabled, propertyMacrosEnabled }, text)
  );
  const description = $derived(
    essence?.description || text('FABRICATE.Admin.Manager.NoDescription', 'No description')
  );
  /**
   * A usage sentence that AGREES WITH ITS NUMBER, through a `…One` sibling holding the singular
   * written out rather than the `(s)` marker. BOTH KEYS ARE LITERALS, because an interpolated one
   * is reported as unreferenced by `lang-keys-no-orphans` while rendering perfectly.
   */
  function usageSentence(spec) {
    if (spec.count === 1) return format(spec.singular, spec.singularText, { count: 1 });
    return format(spec.plural, spec.pluralText, { count: spec.count });
  }

  const componentUsage = $derived(
    usageSentence({
      plural: 'FABRICATE.Admin.Manager.Essence.ComponentUsageCount',
      singular: 'FABRICATE.Admin.Manager.Essence.ComponentUsageCountOne',
      pluralText: '{count} components',
      singularText: '1 component',
      count: essence?.componentUsageCount || 0,
    })
  );
  const recipeUsage = $derived(
    usageSentence({
      plural: 'FABRICATE.Admin.Manager.Essence.RecipeUsageCount',
      singular: 'FABRICATE.Admin.Manager.Essence.RecipeUsageCountOne',
      pluralText: '{count} recipes',
      singularText: '1 recipe',
      count: essence?.recipeUsageCount || 0,
    })
  );

  /**
   * One usage sentence split into the NUMBER and the unit naming it, so two counts read as a column
   * down the list. IT SPLITS THE ALREADY-FORMATTED SENTENCE rather than composing from a second
   * lang key, so the LIST and the GRID card cannot drift; a translation not leading with the count
   * degrades to the whole sentence as the value rather than to a mis-split.
   */
  function statParts(sentence, count) {
    const value = String(count);
    const lead = `${value} `;
    if (!sentence.startsWith(lead)) return { value: sentence, unit: '' };
    return { value, unit: sentence.slice(lead.length) };
  }

  const componentStat = $derived(statParts(componentUsage, essence?.componentUsageCount || 0));
  const recipeStat = $derived(statParts(recipeUsage, essence?.recipeUsageCount || 0));

  // The GRID card's recessed well. BOTH counts read the same: they are two readings of one kind,
  // and emphasising the first would imply a precedence that does not exist — the `strong` tone
  // stays in the shared card for the studios whose well DOES have a headline. The classes and data
  // hooks are this studio's, because the mounted tests and the bulk panel read the counts by them.
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

  // Stringified for the READER, not the renderer: a raw `false` would coerce identically, but the
  // rendered `data-essence-bulk-selected="false"` is legible at the call site this way.
  const cardRootAttrs = $derived({
    'data-essence-id': essence?.id,
    'data-essence-variant': 'grid',
    'data-essence-enabled': disabled ? 'false' : 'true',
    'data-essence-bulk-selected': String(bulkSelected),
    ...(membershipState ? { 'data-essence-membership-state': membershipState } : {}),
  });
</script>

<!-- The tile carries the essence's own colour. `Medallion.tint` recolours the glyph and, since
     issue 1506, nothing else; unset resolves to the accent, which is the shipped render. -->
{#snippet medallionTile()}
  <Medallion
    icon={essence.icon || 'fas fa-mortar-pestle'}
    tint={essence.colorToken || ''}
    size={40}
  />
{/snippet}

<!-- NO colour-name chip: the medallion carries the colour, and a display name per theme colour
     is upkeep with no reader. Removing it also un-wraps the DISABLED pill. -->
{#snippet nameRow()}
  <span class="manager-essence-name-row">
    <span class="manager-system-name" title={essence.name}>{essence.name}</span>
    {#if absent}
      <Chip tone="subtle" icon="fas fa-circle-minus"
        >{text('FABRICATE.Admin.Manager.Essence.NotInSystem', 'Not in this system')}</Chip
      >
    {:else if disabled}
      <Chip tone="subtle" icon="fas fa-circle-pause"
        >{text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}</Chip
      >
    {/if}
  </span>
{/snippet}

<!-- WHAT THIS ESSENCE DOES IN THIS SYSTEM, one clause per world-default section, each NAMING ITS
     VALUE and marking a local override in parentheses. The clauses arrive already worded from
     `EssenceBrowserView.summaryClauses`; this snippet owns the separator and the clamp. -->
{#snippet summaryReadout()}
  {#if summaryClauses.length > 0}
    <!-- A `title` carrying the WHOLE readout, because the row's width decides how much is on
         screen: it clamps to one line, and a row overriding both sections shows only the first.
         Without it the second clause is unrecoverable rather than merely abbreviated. -->
    <span
      class="manager-essence-inherit-readout"
      data-essence-inherit-readout={essence.id}
      title={summaryClauses.map((clause) => clause.label).join(' · ')}
    >
      {#each summaryClauses as clause (clause.section)}
        <span class="manager-essence-inherit-item" data-essence-inherit={clause.section}>
          {clause.label}
        </span>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet addToSystemButton()}
  <ManagerButton
    role="primary"
    data-essence-add-to-system={essence.id}
    onclick={() => onAddToSystem?.(essence.id)}
  >
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Essence.AddToSystem', 'Add to this system')}</span>
  </ManagerButton>
{/snippet}

<!-- NEVER hidden for a disabled essence, since hiding a pill removes state: they render muted. -->
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

<!-- The two usage counts, plain: deleting an essence is warned rather than blocked. -->
{#snippet usageReadout()}
  <span class="manager-essence-usage-readout" data-essence-usage>
    <span
      class="manager-essence-usage-components manager-essence-usage-stat"
      data-essence-usage-components
    >
      <span class="manager-essence-usage-value">{componentStat.value}</span>
      <span class="manager-essence-usage-label">{componentStat.unit}</span>
    </span>
    <span class="manager-essence-usage-stat" data-essence-usage-recipes>
      <span class="manager-essence-usage-value">{recipeStat.value}</span>
      <span class="manager-essence-usage-label">{recipeStat.unit}</span>
    </span>
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

<!-- The toggle and the edit control: the GRID card carries them too, not only the inspector. -->
{#snippet statusToggle()}
  <StatusToggle
    on={!disabled}
    ariaLabel={format(
      disabled
        ? 'FABRICATE.Admin.Manager.Essence.EnableNamed'
        : 'FABRICATE.Admin.Manager.Essence.DisableNamed',
      disabled ? 'Enable {name}' : 'Disable {name}',
      { name: essence.name }
    )}
    data-essence-toggle={essence.id}
    onclick={(event) => {
      event.stopPropagation();
      onToggleEnabled(essence.id, disabled);
    }}
  />
{/snippet}

<!--
  THE ROW'S EDIT CONTROL, LABELLED IN THE LIST AND ICON-ONLY IN THE GRID CARD: the words say which
  layer it opens, where an unlabelled pencil beside a world-shared name reads as "edit the essence".
  IT IS STILL `.manager-icon-button`, AND THAT IS LOAD-BEARING: three surfaces address it by that
  class alone, and the smoke's locator sits behind a `count() > 0` guard, so losing it would stop a
  published frame rather than fail. `IconButton.svelte` prepends the class itself, so this is the
  caller's EXTRA, and `is-labelled` is computed in because a `class:` directive is element-only.
-->
{#snippet editButton(labelled = false)}
  <IconButton
    class={labelled ? 'manager-essence-edit is-labelled' : 'manager-essence-edit'}
    data-essence-edit={essence.id}
    ariaLabel={labelled
      ? format('FABRICATE.Admin.Manager.Essence.EditRulesNamed', 'Edit rules for {name}', {
          name: essence.name,
        })
      : format('FABRICATE.Admin.Manager.Essence.EditNamed', 'Edit {name}', {
          name: essence.name,
        })}
    title={labelled
      ? text('FABRICATE.Admin.Manager.Essence.EditRules', 'Edit rules')
      : text('FABRICATE.Admin.Manager.Essence.Edit', 'Edit essence')}
    onclick={(event) => {
      event.stopPropagation();
      onEdit(essence.id);
    }}
  >
    {#if labelled}
      <span class="manager-essence-edit-label"
        >{text('FABRICATE.Admin.Manager.Essence.EditRules', 'Edit rules')}</span
      >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    {:else}
      <i class="fas fa-pen" aria-hidden="true"></i>
    {/if}
  </IconButton>
{/snippet}

{#if isCard}
  <!-- GRID CARD — the shared `LibraryCard` supplies the anatomy and this studio the vocabulary.
       The essence hooks the smoke walk, the View Lab and the mounted tests navigate by
       (`.manager-essence-row`, `.manager-essence-identity`, `data-essence-*`) pass through. -->
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
      {#if absent}
        <Chip tone="subtle" icon="fas fa-circle-minus"
          >{text('FABRICATE.Admin.Manager.Essence.NotInSystem', 'Not in this system')}</Chip
        >
      {:else if disabled}
        <Chip tone="subtle" icon="fas fa-circle-pause"
          >{text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}</Chip
        >
      {/if}
      {@render capabilityPills('is-card-badges')}
    {/snippet}
    {#snippet selection()}{#if !absent}{@render selectionBox()}{/if}{/snippet}
    {#snippet footerStart()}
      {#if absent}{@render addToSystemButton()}{:else}{@render statusToggle()}{/if}
    {/snippet}
    {#snippet footerEnd()}{#if !absent}{@render editButton()}{/if}{/snippet}
  </LibraryCard>
{:else}
  <li
    class={`manager-essence-row ${selected ? 'is-selected' : ''} ${disabled ? 'is-off' : ''}`}
    class:is-bulk-selected={bulkSelected}
    data-essence-id={essence.id}
    data-essence-variant="row"
    data-essence-membership-state={membershipState || undefined}
    data-essence-enabled={disabled ? 'false' : 'true'}
    data-essence-bulk-selected={bulkSelected}
    aria-current={selected ? 'true' : undefined}
  >
    <!-- THE SELECTION BOX LEADS THE ROW: shipped TRAILING it read as the last of five trailing
         controls rather than as the row's membership in a set. It stays OUTSIDE the identity
         `<button>`, because `SelectionCheckbox` renders a `<label>` around an `<input>`. An ABSENT
         row renders none — there is nothing for a bulk edit on this system's list to act on. -->
    {#if !absent}{@render selectionBox()}{/if}
    <button type="button" class="manager-essence-identity" onclick={() => onSelect(essence.id)}>
      {@render medallionTile()}
      <span class="manager-system-copy">
        {@render nameRow()}
        <!-- THE SUMMARY LINE, WHICH IS THE INHERIT READOUT WHENEVER THERE IS ONE: a system that
             HAS rules for the essence is described by what those rules resolve to, and only one
             that does not falls back to the world description. Its position in the identity block
             also repairs a measured overflow — in the trailing cluster, which is `flex: 0 0 auto`
             and cannot shrink, ~390px of readout cropped the first row's bulk checkbox. -->
        {#if summaryClauses.length > 0}
          {@render summaryReadout()}
        {:else}
          <span
            class="manager-system-description manager-essence-description"
            title={essence.description}
          >
            {description}
          </span>
        {/if}
      </span>
    </button>

    <div class="manager-essence-cluster">
      {@render capabilityPills()}
      {#if absent}
        {@render addToSystemButton()}
      {:else}
        {@render usageReadout()}
        {@render statusToggle()}
        <!-- FIRST (and only) `.manager-icon-button` in the row stays the edit control; the
             View Lab, the smoke and two mounted tests navigate by exactly that selector. -->
        {@render editButton(true)}
      {/if}
    </div>
  </li>
{/if}

<style>
  /* The row's INTERIOR only. `.manager-essence-row` itself stays in the four shared selector lists
     in `styles/fabricate.css`, so the one-consistent-selected-row-signal rule holds by construction
     and two of those lists stay pinned by exact multi-line selector text in
     `manager-layout.test.js`. The row LEAVES the narrow `@container` join, whose `align-items:
     stretch` would stretch the medallion and the controls to full card height, and the grid join,
     which has no table head left to serve. */
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

  /* THE LABELLED VARIANT OF `.manager-icon-button`, every value COPIED from the labelled-button
     authority rather than chosen; it cannot BE a `ManagerButton`, whose auto width would fight the
     square 34px box. Compounded through `.manager-essence-row` on purpose, because a bare selector
     ties at (0,2,0) and is decided by injection order. THE CHILD HALF IS `:global` BECAUSE
     `IconButton.svelte` WRITES THE BUTTON: a forwarded `class` carries no `svelte-<hash>`, so a
     fully scoped selector stopped matching the moment the control converted. */
  .manager-essence-row :global(.manager-essence-edit.is-labelled) {
    width: auto;
    height: auto;
    min-height: 34px;
    flex: 0 0 auto;
    gap: var(--fab-space-2);
    padding: 0 var(--fab-space-3);
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }

  /* A small trailing mark, not a second icon at label size. The `i` sits INSIDE the `:global(...)`
     because Svelte rejects one in the middle of a sequence (`css_global_invalid_placement`), and
     the chain has to cross the component boundary in one step: the BUTTON between the snippet and
     the glyph carries no hash of ours. Specificity is (0,3,1) either way. */
  .manager-essence-row :global(.manager-essence-edit.is-labelled i) {
    font-size: 0.55rem;
  }

  /* A MODIFIER on the span rather than a descendant of the card root, because that `<li>` is
     `LibraryCard`'s: a selector reaching through it would never match and would be reported as an
     unused selector, which `lint:svelte:warnings` fails on. The span is still ours. */
  .manager-essence-capabilities.is-card-badges {
    flex-wrap: wrap;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  /* TWO STAT CELLS SIDE BY SIDE. A fixed `min-width` turns two per-row numbers into two columns
     down the list, and `tabular-nums` holds the digits on one advance within a cell. */
  .manager-essence-usage-readout {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    white-space: nowrap;
  }

  .manager-essence-usage-stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    min-width: 2.6rem;
    text-align: right;
  }

  .manager-essence-usage-value {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .manager-essence-usage-label {
    color: var(--fab-text-subtle);
    font-size: 0.46rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  /* A disabled essence is DIMMED as well as pilled — the pill is what carries the state,
     the dimming only reinforces it. The card's own dimming lives in `LibraryCard`, which
     owns the card body; this is the LIST row's. */
  .manager-essence-row.is-off .manager-essence-identity,
  .manager-essence-row.is-off .manager-essence-usage-readout {
    opacity: 0.72;
  }

  /* The GRID card's interior lives in `../library/LibraryCard.svelte`, moved wholesale rather than
     duplicated, because a card whose look is authored twice is two cards. NARROW: the LIST row
     keeps `display: flex` and wraps, and there are no columns left to label. */
  @container fabricate-manager (max-width: 1120px) {
    .manager-essence-identity {
      flex: 1 1 100%;
    }

    .manager-essence-cluster {
      flex: 1 1 100%;
      justify-content: flex-end;
    }
  }
  /* Each entry is one whole clause naming one section's value, so two sections read as two facts
     rather than as the same words twice. */
  .manager-essence-inherit-item {
    display: inline;
  }

  .manager-essence-inherit-item + .manager-essence-inherit-item::before {
    content: '·';
    margin-right: var(--fab-space-1);
    margin-left: var(--fab-space-1);
    color: var(--fab-text-subtle);
  }

  /* The readout is the row's SUB-LINE now, so it takes the description's size and clamps to one
     line rather than growing the row when both sections are overridden. */
  .manager-essence-inherit-readout {
    display: block;
    overflow: hidden;
    color: var(--fab-text-muted);
    font-size: 0.7rem;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
