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
  The card itself is the shared `BulkDeleteCard` primitive (issue 1132), which owns the
  heading, the impact list, the armed control, the description association, the live region,
  the busy face, the zero-row gate and the scoped CSS that keeps the danger button at the
  right-rail label size. What is here is only what is about ESSENCES: the three sentences and
  the arithmetic behind them. `data-essence-bulk-*` hook names survive the move as `*Attr`
  overrides, so the mounted suites, the smoke selectors and the View Lab cases are untouched.

  It is shown BEFORE the action is armed, and it recomputes when the selection changes,
  because it is `$derived` from the selected ROWS rather than latched at arm time.

  Two of the three rows are now GATED on a non-zero count, which they were not before: the
  primitive omits a consequence row that says nothing and always renders the subject row, so
  a selection carried by nothing states one fact instead of one fact and a nought. That rule
  was already shipped on the Component Studio; the conversion is what makes the two agree.

  Its three numbers are three different questions and none is derived from another: how many
  essences will be deleted, how many COMPONENTS carry any of them, and how many RECIPES will
  be rewritten. The two carrier numbers are UNIONS over identities, never sums —
  `deleteEssences` rewrites a shared recipe ONCE for the whole selection, so a sum would
  promise "4 recipes" before an operation that rewrites 2. `describeEssenceDeleteImpact`
  owns that arithmetic; this component only renders it.

  The delete is WARNED, not BLOCKED (maintainer round): every selected essence is deleted
  regardless of component usage, because the cascade strips it from every carrying component
  and rewrites every referencing recipe. There is no blocked partition and nothing is
  skipped — the impact statement is the whole warning.
-->
<script>
  import BulkDeleteCard from '../BulkDeleteCard.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../Callout.svelte';
  import Chip from '../Chip.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';
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
    // An OPTIONAL sentence announcing what a finished delete did when it left this panel
    // mounted — a refused or no-op write (issue 1157). The card's own live region is the only
    // place that outcome can be spoken, because on the success path the card is gone; without
    // it a refused delete leaves the GM on `<body>` with nothing said but a Foundry toast,
    // which is not a live region. The owner clears it as it arms.
    deleteOutcome = '',
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

  // No colour-NAME copy here (maintainer feedback): naming the staged swatch is overhead
  // across every theme and colour combination, and the palette cell below already marks
  // which one is staged. `No colour` and `Leave unchanged` both name no colour and stay.
  function colourStageLabel(value) {
    if (value === ESSENCE_BULK_COLOUR_UNCHANGED) {
      return text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged');
    }
    if (value === ESSENCE_BULK_COLOUR_NONE) {
      return text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour');
    }
    return text('FABRICATE.Admin.Manager.Essence.BulkEdit.ColourStaged', 'Every selected essence');
  }

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
  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible label, so a
  // speech-input user can activate the control by saying what they can read. The plural pair
  // shipped as "Delete 3 essences" / "Delete 3 essence definitions", which does NOT contain the
  // visible string, so the idle face of a destructive control was unactivatable by voice; the
  // `…One` branch passed only by luck, since "Delete 1 essence definition" happens to contain
  // "Delete 1 essence". The word "definitions" moved into the impact list, where the count it
  // qualifies already lives.
  const deleteAriaLabel = $derived(
    impact.deletable === 1
      ? text(
          'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteAriaOne',
          'Delete 1 essence definition'
        )
      : format('FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteAria', 'Delete {count} essences', {
          count: impact.deletable,
        })
  );
  // The armed name opens with the armed visible label for the same rule. "Confirm deleting 3
  // essence definition(s)…" does not contain "Confirm delete".
  const deleteArmedAriaLabel = $derived(
    format(
      'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteConfirmAria',
      'Confirm delete — {count} essence definition(s) will be deleted and {recipes} recipe(s) rewritten',
      { count: impact.deletable, recipes: impact.recipeRewrites }
    )
  );
  // Arming changes the button's label and name UNDER FOCUS, where a name change is not
  // reliably announced, so the state change is announced in the card's own polite region.
  const deleteArmedAnnouncement = $derived(
    format(
      'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteArmedAnnouncement',
      'Delete armed. Activate again to delete {count} essence definition(s) and rewrite {recipes} recipe(s).',
      { count: impact.deletable, recipes: impact.recipeRewrites }
    )
  );

  // Three sentences, three different questions, and the two carrier rows are gated on their
  // own count by the card. The subject row carries no `count`, so it always renders.
  const deleteImpactRows = $derived([
    { key: 'essences', text: impactEssencesLabel },
    { key: 'components', text: impactComponentsLabel, count: impact.componentsAffected },
    { key: 'recipes', text: impactRecipesLabel, count: impact.recipeRewrites },
  ]);
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
  second way of applying the staged edit. It un-pins the shell's sticky Apply dock, which is
  accepted and gated — see `BulkEditPanelShell`'s dock comment for what survives the un-pin.

  The `components` row is a DISTINCT-carrier union over the selection: a component carrying two
  selected essences is one carrier, not two, because the cascade strips it in one pass. The copy
  says "one or more of the selected essences" for exactly that reason. See
  `describeEssenceDeleteImpact`.

  `busy` is the caller's own `deleting` flag and is NOT folded into `disabled` here: the card
  needs to tell an in-flight write apart from an inert one to render the third face at all.
  `applying` still inerts the control, because a staged apply and a delete must not race.
-->
<BulkDeleteCard
  token="delete-essences"
  heading={text(
    'FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteHeading',
    'Delete selected essences'
  )}
  rows={deleteImpactRows}
  idleLabel={deleteLabel}
  armedLabel={text('FABRICATE.Admin.Manager.Essence.BulkEdit.DeleteConfirm', 'Confirm delete')}
  busyLabel={text('FABRICATE.Admin.Manager.BulkEdit.Deleting', 'Deleting…')}
  idleAriaLabel={deleteAriaLabel}
  armedAriaLabel={deleteArmedAriaLabel}
  armedAnnouncement={deleteArmedAnnouncement}
  disarmedAnnouncement={text(
    'FABRICATE.Admin.Manager.BulkEdit.DeleteCancelled',
    'Delete cancelled. Nothing was deleted.'
  )}
  outcomeAnnouncement={deleteOutcome}
  armed={deleteArmed === true}
  busy={deleting === true}
  disabled={impact.deletable === 0 || applying === true}
  cardAttr="data-essence-bulk-delete-card"
  impactAttr="data-essence-bulk-impact"
  rowAttr="data-essence-bulk-impact-row"
  announceAttr="data-essence-bulk-delete-announce"
  onArm={onArmDelete}
  onDisarm={onDisarmDelete}
  onConfirm={() => onDelete(impact.deletableIds)}
/>

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

  /* The delete card's three rules — the card box, the 34px/0.72rem/700 danger button and the
     impact list's indent, colour and weight — moved to `BulkDeleteCard.svelte` with the markup
     they style (issue 1132). They could not stay: Svelte scoping is per component, so the
     moment that `<section>` rendered from there these selectors matched nothing, and the
     rendered result would have been the issue 1036 defect back in every studio at once. */
</style>
