<!-- Svelte 5 runes mode -->
<!--
  The essence browser's BULK EDIT panel (issue 1036). It renders in the shell's existing
  `.manager-inspector` column and REPLACES `EssenceBrowserInspector` for as long as the
  selection is non-empty — the same `> 0` threshold the Component and Recipe Studios use,
  and for the same reason: one ticked box is already a bulk edit.

  Its CHROME is not its own. The header, hero, section headings, staged select and Apply are
  the shared `BulkEditPanelShell` / `BulkEditSection` / `BulkEditSelect` primitives. What is
  here is what is genuinely about ESSENCES: the Icon, Colour and Status axes, the
  per-essence note, and the delete-impact statement.

  ── THREE AXES, AND NO MORE ───────────────────────────────────────────────────────
  Names, descriptions, linked sources and property macros stay PER-ESSENCE: each is either
  unique to one essence or carries behaviour a whole-selection overwrite would destroy. The
  panel says so, in place, rather than leaving their absence to be inferred.

  ── THE BULK DELETE IS ARMED, AND THAT IS A DELIBERATE DEVIATION ──────────────────
  `AGENTS.md`'s carve-out reserves the two-step arm for high-frequency destructive ROW
  actions and keeps `confirmDialog` for "any bulk or reset action". The maintainer's binding
  decision for THIS action is the opposite: *"Warn the GM about the impact of the delete in
  the bulk edit sidebar and use the Arm/Confirm delete pattern on the bulk delete button."*
  So this panel states the impact and arms, and the docs loop proposes the corresponding
  `AGENTS.md` amendment rather than leaving the file and the shipped behaviour in
  contradiction. Do not substitute a `confirmDialog` here.

  ── THE IMPACT STATEMENT ──────────────────────────────────────────────────────────
  It is shown BEFORE the action is armed, and it recomputes when the selection changes,
  because it is `$derived` from the selected ROWS rather than latched at arm time.

  Its three numbers are three different questions and none is derived from another: how many
  essences will be deleted, how many COMPONENTS carry any of them, and how many RECIPES will
  be rewritten. The two carrier numbers are UNIONS over identities, never sums —
  `deleteEssences` rewrites a shared recipe ONCE for the whole selection, so a sum would
  promise "4 recipes" before an operation that rewrites 2. `describeEssenceDeleteImpact`
  owns that arithmetic; this component only renders it.

  BLOCKED members are excluded and NAMED, and the action is inert when every member is
  blocked. The single-delete guard is a data-loss guard and removing it was not what was
  directed.
-->
<script>
  import ArmedDangerButton from '../ArmedDangerButton.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../Callout.svelte';
  import Chip from '../Chip.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { managerColorTokenLabel } from '../../../util/managerColorTokens.js';
  import {
    ESSENCE_BULK_COLOUR_NONE,
    ESSENCE_BULK_COLOUR_UNCHANGED,
    ESSENCE_BULK_STATUS_VALUES,
    bulkEssenceColourControlValue,
    bulkEssenceDraftHasChanges,
    describeEssenceDeleteImpact,
    setBulkEssenceColour,
    setBulkEssenceIcon,
    setBulkEssenceStatus,
  } from '../../../../../utils/essenceBulkEditModel.js';

  let {
    count = 0,
    selectedRows = [],
    draft = null,
    applying = false,
    deleting = false,
    deleteArmed = false,
    onDraftChange = () => {},
    onClearSelection = () => {},
    onApply = () => {},
    onArmDelete = () => {},
    onDisarmDelete = () => {},
    onDelete = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data)) {
      result = result.replace(`{${token}}`, String(value));
    }
    return result;
  }

  const inert = $derived(applying === true || deleting === true);
  const impact = $derived(describeEssenceDeleteImpact(selectedRows));
  const colourValue = $derived(bulkEssenceColourControlValue(draft));
  // The three staged colour instructions are `''` (leave unchanged), `'__none__'` (clear)
  // and a token; only the third marks a preset cell.
  const isTokenStaged = $derived(
    colourValue !== ESSENCE_BULK_COLOUR_UNCHANGED && colourValue !== ESSENCE_BULK_COLOUR_NONE
  );
  const stagedStatus = $derived(draft?.status || ESSENCE_BULK_STATUS_VALUES[0]);
  const canApply = $derived(bulkEssenceDraftHasChanges(draft) && !inert);

  const headingLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Essence.BulkEdit.HeadingOne', '1 essence selected')
      : format('FABRICATE.Admin.Manager.Essence.BulkEdit.Heading', '{count} essences selected', {
          count,
        })
  );
  const applyLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Essence.BulkEdit.ApplyOne', 'Apply to 1 essence')
      : format('FABRICATE.Admin.Manager.Essence.BulkEdit.Apply', 'Apply to {count} essences', {
          count,
        })
  );

  const statusSegments = $derived([
    {
      value: 'unchanged',
      labelKey: 'FABRICATE.Admin.Manager.BulkEdit.Unchanged',
      fallback: 'Unchanged',
    },
    {
      value: 'enable',
      labelKey: 'FABRICATE.Admin.Manager.Essence.BulkEdit.Enable',
      fallback: 'Enable',
    },
    {
      value: 'disable',
      labelKey: 'FABRICATE.Admin.Manager.Essence.BulkEdit.Disable',
      fallback: 'Disable',
    },
  ]);

  const stagedIconLabel = $derived(
    draft?.icon
      ? text('FABRICATE.Admin.Manager.Essence.BulkEdit.IconStaged', 'Every selected essence')
      : text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')
  );
  const stagedColourLabel = $derived(colourStageLabel(colourValue));

  function colourStageLabel(value) {
    if (value === ESSENCE_BULK_COLOUR_UNCHANGED) {
      return text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged');
    }
    if (value === ESSENCE_BULK_COLOUR_NONE) {
      return text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour');
    }
    return managerColorTokenLabel(value, localize);
  }

  // `blockedNames` is CAPPED by the model. `Select all matching` can select every essence
  // in the system, so the tail is SUMMARISED rather than comma-joined into one callout —
  // and it is summarised rather than dropped, so the count and the names never disagree.
  const blockedNamesLabel = $derived(
    impact.blockedOverflow > 0
      ? format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactBlockedMore',
          '{names} and {count} more',
          { names: impact.blockedNames.join(', '), count: impact.blockedOverflow }
        )
      : impact.blockedNames.join(', ')
  );

  const deleteLabel = $derived(
    impact.deletable === 1
      ? text('FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteOne', 'Delete 1 essence')
      : format('FABRICATE.Admin.Manager.Essence.BulkEdit.Delete', 'Delete {count} essences', {
          count: impact.deletable,
        })
  );

  // Same ternary the rest of this panel already uses (`headingLabel`, `applyLabel`,
  // `deleteLabel`): a literal `…One` sibling key for the count-is-1 case, so the impact
  // statement never says "1 essence definitions" or "1 components carry".
  const impactEssencesLabel = $derived(
    impact.deletable === 1
      ? text(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactEssencesOne',
          '1 essence definition will be deleted.'
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactEssences',
          '{count} essence definitions will be deleted.',
          { count: impact.deletable }
        )
  );
  const impactComponentsLabel = $derived(
    impact.componentsAffected === 1
      ? text(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactComponentsOne',
          '1 component carries one or more of the selected essences.'
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactComponents',
          '{count} components carry one or more of the selected essences.',
          { count: impact.componentsAffected }
        )
  );
  const impactRecipesLabel = $derived(
    impact.recipeRewrites === 1
      ? text(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactRecipesOne',
          '1 recipe will be rewritten.'
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactRecipes',
          '{count} recipes will be rewritten.',
          { count: impact.recipeRewrites }
        )
  );
  const impactBlockedLabel = $derived(
    impact.blocked === 1
      ? format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactBlockedOne',
          '1 selected essence is still carried by components and will be skipped: {names}',
          { names: blockedNamesLabel }
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.ImpactBlocked',
          '{count} selected essences are still carried by components and will be skipped: {names}',
          { count: impact.blocked, names: blockedNamesLabel }
        )
  );
  const deleteAriaLabel = $derived(
    impact.deletable === 1
      ? text(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteAriaOne',
          'Delete 1 essence definition'
        )
      : format(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteAria',
          'Delete {count} essence definitions',
          { count: impact.deletable }
        )
  );
</script>

<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  panelAttr="data-essence-bulk-panel"
  clearAttr="data-essence-bulk-clear"
  countAttr="data-essence-bulk-count"
  applyAttr="data-essence-bulk-apply"
  {onClearSelection}
  {onApply}
>
  <!--
    THE AXIS RESET IS A TRAILING CHIP, NOT A SECOND FULL-WIDTH BUTTON (issue 1036 fidelity
    pass). Both axes shipped as three stacked full-width elements — a sub-hint, a full-width
    control, and a full-width `Leave unchanged` button under it — where the prototype draws
    one compact row per axis. `BulkEditSection` already owns a slot for exactly this: its
    `trailing` snippet puts a staged-axis control on the label's baseline, which is where the
    Component Studio puts its own `Will overwrite` / `Unchanged` chips. Reusing that slot
    removes two full-width buttons from the rail and costs no new primitive.
  -->
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Essence.Icon', 'Icon')}
    subhint={stagedIconLabel}
    subhintAttr="data-essence-bulk-icon-state"
    subhintValue={draft?.icon ? 'staged' : 'unchanged'}
  >
    {#snippet trailing()}
      <!-- The `Leave unchanged` RESET. `''` is the model's unstaged sentinel, so this is a
           real instruction rather than a second way of picking an icon. Inert when nothing
           is staged, because there is then nothing to undo. -->
      <Chip
        tag="button"
        type="button"
        tone={draft?.icon ? 'warning' : 'neutral'}
        icon="fas fa-undo"
        data-essence-bulk-icon-reset
        disabled={inert || !draft?.icon}
        onclick={() => onDraftChange(setBulkEssenceIcon(draft, ''))}
        >{text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')}</Chip
      >
    {/snippet}
  </BulkEditSection>
  <div class="manager-essence-bulk-icon">
    <IconPicker
      value={draft?.icon || ''}
      disabled={inert}
      buttonTitle={text('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
      onChange={(icon) => onDraftChange(setBulkEssenceIcon(draft, icon))}
    />
  </div>

  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Essence.Colour.Label', 'Colour')}
    subhint={stagedColourLabel}
    subhintAttr="data-essence-bulk-colour-state"
    subhintValue={colourValue || 'unchanged'}
  >
    {#snippet trailing()}
      <Chip
        tag="button"
        type="button"
        tone={colourValue === ESSENCE_BULK_COLOUR_UNCHANGED ? 'neutral' : 'warning'}
        icon="fas fa-undo"
        data-essence-bulk-colour-reset
        disabled={inert || colourValue === ESSENCE_BULK_COLOUR_UNCHANGED}
        onclick={() => onDraftChange(setBulkEssenceColour(draft, ESSENCE_BULK_COLOUR_UNCHANGED))}
        >{text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')}</Chip
      >
    {/snippet}
  </BulkEditSection>
  <!--
    THREE instructions, never two: leave unchanged, clear to the theme accent, or a token.
    The palette is rendered INLINE (`layout="inline"`) with the No-colour cell switched on,
    which is the only route this palette has ever had back to unset — and both are gated
    props, so the environments biome popover is untouched.
  -->
  <div class="manager-essence-bulk-colour" data-essence-bulk-colour={colourValue || 'unchanged'}>
    <ManagerColorPopover
      layout="inline"
      allowNone
      allowCustom={false}
      manageDismiss={false}
      colorToken={isTokenStaged ? colourValue : ''}
      unset={!isTokenStaged}
      noneSelected={colourValue === ESSENCE_BULK_COLOUR_NONE}
      customColor=""
      presetGridLabel={text(
        'FABRICATE.Admin.Manager.Essence.Colour.Presets',
        'Essence colour presets'
      )}
      noneLabel={text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')}
      onClear={() => onDraftChange(setBulkEssenceColour(draft, ESSENCE_BULK_COLOUR_NONE))}
      onChange={(next) => onDraftChange(setBulkEssenceColour(draft, next?.colorToken || ''))}
    />
  </div>

  <BulkEditSection label={text('FABRICATE.Admin.Manager.Essence.Status.Label', 'Status')} />
  <SegmentedControl
    options={statusSegments}
    value={stagedStatus}
    fill={true}
    groupName="essence-bulk-status"
    ariaLabel={text('FABRICATE.Admin.Manager.Essence.Status.Label', 'Status')}
    dataAttr="data-essence-bulk-status"
    optionDataAttr="data-essence-bulk-status-option"
    onChange={(value) => onDraftChange(setBulkEssenceStatus(draft, value))}
  />

  <Callout
    tone="info"
    text={text(
      'FABRICATE.Admin.Manager.Essence.BulkEdit.PerEssenceNote',
      'Names, descriptions, linked sources and property macros stay per-essence — edit those individually.'
    )}
    dataAttr="data-essence-bulk-per-essence-note"
  />
</BulkEditPanelShell>

<!--
  The DELETE block sits below the shell rather than inside it: the shell's Apply is the
  panel's primary action, and a destructive action inside the same card would read as a
  second way of applying the staged edit.
-->
<section class="manager-inspector-card manager-essence-bulk-delete" data-essence-bulk-delete-card>
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteHeading', 'Delete selected essences')}
  </h3>

  <!-- Stated BEFORE the action is armed, and recomputed from the selection. -->
  <ul class="manager-essence-bulk-impact" data-essence-bulk-impact>
    <li data-essence-bulk-impact-row="essences">
      {impactEssencesLabel}
    </li>
    <!--
      Counted over the WHOLE SELECTION, not over the deletable members, and worded to say
      so. A component carrying an essence is exactly what BLOCKS that essence's delete, so
      counted over the deletable rows this number is zero by construction — which is what
      it read before, directly above a callout naming the essences those components keep.
      See `describeEssenceDeleteImpact`.
    -->
    <li data-essence-bulk-impact-row="components">
      {impactComponentsLabel}
    </li>
    <li data-essence-bulk-impact-row="recipes">
      {impactRecipesLabel}
    </li>
  </ul>

  {#if impact.blocked > 0}
    <Callout
      tone="warning"
      text={impactBlockedLabel}
      dataAttr="data-essence-bulk-blocked"
      dataValue={String(impact.blocked)}
    />
  {/if}

  <ArmedDangerButton
    token="delete-essences"
    armed={deleteArmed === true}
    disabled={!impact.canDelete || inert}
    idleLabel={deleteLabel}
    armedLabel={text('FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteConfirm', 'Confirm delete')}
    idleAriaLabel={deleteAriaLabel}
    armedAriaLabel={format(
      'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteConfirmAria',
      'Confirm deleting {count} essence definition(s) and rewriting {recipes} recipe(s)',
      { count: impact.deletable, recipes: impact.recipeRewrites }
    )}
    onArm={onArmDelete}
    onDisarm={onDisarmDelete}
    onConfirm={() => onDelete(impact.deletableIds)}
  />
</section>

<style>
  /* ONE control each, now that both axis resets live on their section's label row. The
     stack survives because each wrapper is still the hook the mounted tests and the
     `data-essence-bulk-colour` state attribute hang on, and because the palette is a grid
     that must occupy the rail's full width to lay its cells out. */
  .manager-essence-bulk-icon,
  .manager-essence-bulk-colour {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-essence-bulk-delete {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* WEIGHT, not size. This is the sentence the GM is asked to act on and it sits under a
     louder warning `Callout`; at the muted tone it was the quietest thing on a destructive
     card. It keeps the small type — the card is a rail, not a dialog — and gains the
     secondary text colour and a heavier face so it reads as a statement rather than a
     footnote. */
  .manager-essence-bulk-impact {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    margin: 0;
    padding-left: var(--fab-space-4);
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
    font-weight: 600;
  }
</style>
