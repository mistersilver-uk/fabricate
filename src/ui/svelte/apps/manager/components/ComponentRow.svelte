<!-- Svelte 5 runes mode -->
<!--
  One row of the system Component Rules list (issue 676; rebuilt to the design reference for
  issue 1371, maintainer parity round 4 — `rebuild-spec.md` C5 and C6, `proto:1078-1093` and
  `proto:1573-1580`).

  A card row has no columns, so it is an `<li>` inside the browser's `<ul role="list">`,
  carrying `aria-current` for the selected row — NOT a `<div>` with table/row/cell ARIA.
  `.manager-component-row` survives — the smoke harness and `managerLayoutGuards` both probe it.

  ── THE ANATOMY, LEFT TO RIGHT ────────────────────────────────────────────────────────────
   1. the bulk-selection box, LEADING. It was trailing, after the pen; the reference puts it
      first, before the chip (`proto:1080`, gap-list row 109).
   2. the `Medallion`, tinted by the component's own colour.
   3. the copy column: the name at the reference's 13.5px/600 serif with a `Salvage` pill beside
      it when this component salvages here, over a single ellipsised description line.
   4. the trailing cluster: the essence dots, the `Recipes` stat, and ONE labelled control.

  The CATEGORY CHIP and the SOURCE-ORIGIN pill are gone (gap-list row 114). Category is the
  group header's job on this screen and the source belongs to the world catalogue; the system
  row's only state pill is `Salvage`. The row's open control is a LABELLED `Edit rules ↗` rather
  than a 34px pen icon (row 113).

  ── ONE ROW COMPONENT DRAWS BOTH COHORTS ─────────────────────────────────────────────────
  `member={false}` is the GHOST row: a world component this system has no rules for. The
  reference does not draw a two-line stub for it — it draws THIS row, dimmed and stated
  (`rebuild-spec.md` C6, gap-list row 146). Everything stays: the medallion, the copy column,
  the `Recipes` column. Four things change, and the caller supplies each of them:
   - the name-line pill reads `Not in this system` instead of `Salvage`;
   - the description is the WORLD description;
   - the essence dots are absent, because this system has authored none;
   - the `Recipes` value is an em dash and the control is a dashed `+ Add to system`.
  A second component would have been a second row anatomy to keep in step with this one, which
  is precisely the drift that produced the stub.

  ── THE PROGRESSIVE-DC BADGE IS SUBJECT-ONLY AND IS RETAINED ─────────────────────────────
  `difficultyBadge` has no counterpart anywhere in the reference's system row. It is NOT in the
  gap list's removal set (row 114 names the category chip and the source pill and nothing else),
  it is a shipped read-only parity affordance (issues 651 and 772) with its own re-gate test, and
  removing a capability the audit did not ask to remove is not a parity fix. It is reported to
  the driver alongside gap-list row 148 as a subject-only element awaiting a maintainer ruling,
  and it renders on the NAME LINE beside `Salvage`, because that is the row's pill run.

  Strings arrive pre-localized — this is a presentational leaf.
-->
<script>
  import Chip from '../Chip.svelte';
  import EssenceChip from './EssenceChip.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    component = null,
    // Whether this system has a rules record for the component. `false` is the ghost cohort.
    member = true,
    selected = false,
    // Pre-localized progressive-difficulty badge text, or '' to omit. See the header note.
    difficultyBadge = '',
    // The badge's own text is the VALUE alone, so the thing it measures is named here instead.
    difficultyBadgeTitle = '',
    // The `Salvage` name-line pill's label, or '' when this component does not salvage here.
    salvageLabel = '',
    // The ghost row's own name-line pill.
    notInSystemLabel = '',
    // The `Recipes` stat: the value (already an em dash for a ghost row) over its micro-label.
    recipesValue = '',
    recipesLabel = '',
    noDescriptionText = '',
    // Whether this row is ticked for BULK edit (issue 772), and the pre-localized
    // accessible name for the box that ticks it.
    bulkSelected = false,
    selectLabel = '',
    // The member row's control, and the ghost row's. Each takes a VISIBLE label and a NAMED one:
    // the reference's control reads `Edit rules ↗` on every row, which is ambiguous the moment a
    // screen reader lists them, so the named form is the accessible name and the tooltip while the
    // reference's words stay on screen.
    editLabel = '',
    editNamedLabel = '',
    addLabel = '',
    addNamedLabel = '',
    onSelect = () => {},
    onEdit = () => {},
    onAdd = () => {},
    onToggleSelect = () => {},
  } = $props();

  // THE DRAWN RUN, NOT THE RESOLVED MAP (issue 1371 r22-store4). The card carries both: whole
  // under `essences`, because the component editor is seeded from that same card and a narrowed
  // seed drops every off-roster essence on the next save; drawn under `essenceChips`, which is
  // the shared chip model — the world catalogue's order, and no chip for an id this system's
  // roster does not list. A hand-built card carries `essences` alone, and for one of those the
  // two runs are the same thing.
  const essenceRun = $derived(component?.essenceChips ?? component?.essences);
  const essences = $derived(member && Array.isArray(essenceRun) ? essenceRun : []);
</script>

<li
  class="manager-component-row"
  class:is-selected={selected}
  class:is-bulk-selected={bulkSelected}
  class:is-ghost={!member}
  data-component-id={component?.id}
  data-component-bulk-selected={bulkSelected}
  data-component-member={member}
  aria-current={selected ? 'true' : undefined}
>
  <!-- LEADING, per `proto:1080`. `SelectionCheckbox` renders NO `<button>`, which is
       load-bearing: the Foundry smoke walk reaches the row's open control through a
       `.manager-component-row … button` selector and must not start matching this box.
       The row's own `<li>` is not a label context, so the primitive brings its own.

       A GHOST ROW CARRIES NONE, and that is mechanical rather than a preference. The browser's
       prune effect drops every selected id the system has no component for, so a ticked ghost
       would be removed on the very next render with nothing on screen explaining why — a control
       that visibly does nothing. It is the one knowing divergence from the reference's ghost-row
       anatomy, and it is reported to the driver as such. -->
  {#if member}
    <SelectionCheckbox
      size="lg"
      wrapper="label"
      checked={bulkSelected}
      ariaLabel={selectLabel}
      data-component-select={component?.id}
      onChange={() => onToggleSelect(component?.id)}
    />
  {/if}

  <button type="button" class="manager-component-identity" onclick={() => onSelect(component?.id)}>
    <!-- The shared Medallion, as the recipe row uses: a flat fill on the surface ramp with a
         real glyph fallback. `tint` carries the component's own colour where the projection
         resolves one, which is what the reference's per-row chip ink is.

         `variant="glyph-chip"` (UX F12 → F-B): the reference draws this leading chip BORDERLESS
         (`proto:1085` declares no `border` at all, so it computes `none`), and the shipped tile
         wears a hairline. That single difference measured as three `compare` lines on this row —
         `borderTopWidth`, `borderTopStyle` and `borderTopColor` — and the variant was built for
         exactly these three sites and wired at only one of them. The size and the tint stay the
         caller's: the variant owns only the absent edge, and the fact that a tinted glyph on this
         chip does not bring a tinted SURFACE with it, which is also the reference's drawing —
         every row's chip shares one slate fill and differs in the glyph's ink alone. -->
    <Medallion
      src={component?.img}
      icon="fas fa-cube"
      size={40}
      tint={component?.color || ''}
      variant="glyph-chip"
    />
    <span class="manager-system-copy">
      <span class="manager-component-name-line">
        <span class="manager-system-name" title={component?.name}>{component?.name}</span>
        {#if member && salvageLabel}
          <StatusPill tone="info" icon="fas fa-recycle" label={salvageLabel} />
        {/if}
        {#if !member && notInSystemLabel}
          <!-- `subtle` is the reference's own paint for this pill: the soft surface, the
               hairline and the disabled ink (`proto:4997`). -->
          <StatusPill tone="subtle" label={notInSystemLabel} />
        {/if}
        {#if member && difficultyBadge}
          <Chip
            tone="info"
            icon="fas fa-gauge-high"
            class="manager-component-difficulty-badge"
            title={difficultyBadgeTitle}
            data-component-difficulty
          >
            <span>{difficultyBadge}</span>
          </Chip>
        {/if}
      </span>
      <span class="manager-system-description" title={component?.description || noDescriptionText}>
        {component?.description || noDescriptionText}
      </span>
    </span>
  </button>

  <span class="manager-component-row-meta">
    {#if essences.length > 0}
      <!-- The essence badges (issue 1371 r18-colour, M29): each one is the shared `EssenceChip`,
           so the row's dots carry the colour the Essence Catalogue gave the essence — the
           reference inks the dot's glyph and numeral in `e.color` (`proto:5502`), and this row
           drew every one the same grey. The chip owns the glyph fallback and the
           `{name} {quantity}` accessible name the row used to spell out here; the row keeps its
           own sheet hook (`manager-essence-compact-chip`) and gains a per-essence one. -->
      <span class="manager-chip-row manager-component-essence-dots">
        {#each essences as essence (essence.id)}
          <EssenceChip
            {essence}
            class="manager-essence-compact-chip"
            data-component-essence={essence.id}
          />
        {/each}
      </span>
    {/if}
    <!-- The `Recipes` column is drawn on BOTH cohorts. A ghost row's value is an em dash the
         caller supplies, never an omitted column: dropping the column moves every row beside
         it and says nothing, while the dash says "this system has no rules, so there is no
         number". -->
    <span class="manager-component-recipes-stat" data-component-recipes={recipesValue}>
      <span class="manager-component-recipes-value">{recipesValue}</span>
      <span class="manager-component-recipes-label">{recipesLabel}</span>
    </span>
  </span>

  <!-- The row's ONE action, in the cluster class the shared multi-select cases and the smoke
       walk both name. It stays a cluster of one rather than a bare button, because the contract
       those cases state is "the selection box must not join the row's action cluster" and a
       cluster that stopped existing would make that unassertable. -->
  <span class="manager-action-group">
    {#if member}
      <ManagerButton
        class="manager-component-row-open"
        data-component-edit={component?.id}
        aria-label={editNamedLabel}
        title={editNamedLabel}
        onclick={() => onEdit(component?.id)}
      >
        <span>{editLabel}</span>
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </ManagerButton>
    {:else}
      <!-- DASHED, not the filled green `+ Add` that shipped (gap-list row 146). Adopting a world
           component is an offer, not the row's primary act, and the reference paints it as one. -->
      <ManagerButton
        role="dashed"
        class="manager-component-row-open"
        data-component-ghost-add={component?.id}
        aria-label={addNamedLabel}
        title={addNamedLabel}
        onclick={() => onAdd(component?.id)}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{addLabel}</span>
      </ManagerButton>
    {/if}
  </span>
</li>
