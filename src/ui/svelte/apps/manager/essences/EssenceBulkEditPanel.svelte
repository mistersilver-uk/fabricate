<!--
  The essence browser's BULK EDIT panel, rendering in the shell's `.manager-inspector` column and
  REPLACING `EssenceBrowserInspector` while the selection is non-empty. Its CHROME is the shared
  `BulkEditPanelShell` / `BulkEditSection` / `BulkEditSelect` primitives; what is here is about
  ESSENCES — the Icon, Colour and Status axes, the per-essence note and the delete impact. See
  `openspec/specs/ui-integration/spec.md` → "Bulk edit panels" for the shared contract.

  THREE AXES, AND NO MORE: names, descriptions, linked sources and property macros stay PER-ESSENCE,
  each either unique to one essence or carrying behaviour a whole-selection overwrite would destroy,
  and the panel says so in place. THE COLOUR AXIS IS ALSO WITHHELD FOR A WORLD-KNOWN SELECTION,
  because the catalogue's colour overlay WINS over the in-system row, so a write here landed on a
  field the next refresh hid. ANY world-known essence withholds it, not all: one instruction goes to
  the whole selection, so an axis shadowed for some cannot promise anything true about the set.

  THE BULK DELETE IS ARMED, A DELIBERATE DEVIATION from `AGENTS.md`'s carve-out on the maintainer's
  binding decision for this action; do not substitute a `confirmDialog`. The card is the shared
  `BulkDeleteCard`, and what is here is the three sentences and their arithmetic.

  The impact shows BEFORE the arm and recomputes with the selection, being `$derived` from the
  selected ROWS. Two of its three rows are GATED on a non-zero count, and the two carrier numbers
  are UNIONS over identities rather than sums — a shared recipe is rewritten ONCE for the whole
  selection, so a sum would promise "4 recipes" before an operation that rewrites 2. The delete is
  WARNED, not BLOCKED: there is no blocked partition, and the impact is the whole warning.
-->
<script>
  import BulkDeleteCard from '../BulkDeleteCard.svelte';
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
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
  } from '../../../../model/essenceBulkEditModel.js';

  let {
    count = 0,
    selectedRows = [],
    draft = null,
    applying = false,
    deleting = false,
    deleteArmed = false,
    // An OPTIONAL sentence for a refused or no-op write. The card's live region is the only place
    // that outcome can be spoken, since on the success path the card is gone.
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
  // Whether the WORLD catalogue holds any selected essence, off the marker the refresh stamps on
  // each row. Absent on a fixture or a corpus-less world, which leaves the axis as it shipped.
  const worldOwnsColour = $derived(
    (Array.isArray(selectedRows) ? selectedRows : []).some((row) => row?.worldDefined === true)
  );
  const impact = $derived(describeEssenceDeleteImpact(selectedRows));
  const colourValue = $derived(bulkEssenceColourControlValue(draft));
  // The three staged colour instructions are `''` (leave unchanged), `'__none__'` (clear)
  // and a token; only the third marks a preset cell.
  const isTokenStaged = $derived(
    colourValue !== ESSENCE_BULK_COLOUR_UNCHANGED && colourValue !== ESSENCE_BULK_COLOUR_NONE
  );
  const stagedStatus = $derived(draft?.status || ESSENCE_BULK_STATUS_VALUES[0]);
  const canApply = $derived(bulkEssenceDraftHasChanges(draft) && !inert);

  // WITHHOLDING THE CONTROL MUST ALSO DISARM THE INSTRUCTION, because the gate is a property of
  // the SELECTION and the selection moves under a staged draft: the axis vanishes while
  // `colorTokenStaged` stays true, leaving Apply enabled on an axis the panel no longer showed.
  // Clearing the DRAFT rather than filtering the write is what makes the screen and the write
  // agree, since `canApply`, the labels, the sub-hints and `toBulkEssenceEdit` all read it.
  $effect(() => {
    if (worldOwnsColour && draft?.colorTokenStaged === true) {
      onDraftChange(setBulkEssenceColour(draft, ESSENCE_BULK_COLOUR_UNCHANGED));
    }
  });

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

  // No colour-NAME copy: naming the staged swatch is overhead across every theme, and the palette
  // cell already marks which is staged. `No colour` and `Leave unchanged` name no colour and stay.
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

  // The same `…One` sibling-key ternary the rest of this panel uses, so the impact statement never
  // says "1 essence definitions".
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
  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible label. The plural pair
  // shipped as "Delete 3 essences" / "Delete 3 essence definitions", which does not, so a
  // destructive control's idle face was unactivatable by voice. "definitions" moved into the
  // impact list, where the count it qualifies already lives.
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
  <!-- THE AXIS RESET IS A TRAILING CHIP, NOT A SECOND FULL-WIDTH BUTTON: `BulkEditSection`'s
       `trailing` snippet already puts a staged-axis control on the label's baseline, which is where
       the Component Studio puts its own chips, so reusing it costs no new primitive. -->
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

  {#if worldOwnsColour}
    <!-- THE WITHHELD AXIS, STATED IN PLACE AND UNDER ITS OWN HEADING. THE HEADING STAYS, because
         withholding the control is not withholding the AXIS: dropping the label left a bare note
         floating between two headed sections. It is the same `BulkEditSection` the offered branch
         renders, with the note where its control would be. -->
    <BulkEditSection label={text('FABRICATE.Admin.Manager.Essence.Colour.Label', 'Colour')} />
    <Callout
      tone="info"
      text={text(
        'FABRICATE.Admin.Manager.Essence.BulkEdit.ColourWorldNote',
        'One or more of the selected essences takes its colour from the Essence Catalogue, where it is shared by every system, so colour is not edited here.'
      )}
      dataAttr="data-essence-bulk-colour-world"
    />
  {:else}
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
    <!-- THREE instructions, never two: leave unchanged, clear to the theme accent, or a token. The
         palette renders INLINE with the No-colour cell on, its only route back to unset; both are
         gated props, so the environments biome popover is untouched. -->
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
  {/if}

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

  <!-- NEUTRAL, per `openspec/specs/ui-integration/spec.md` → "Standing statements": which fields
       stay per-essence is true of every selection. -->
  <Callout
    tone="neutral"
    text={text(
      'FABRICATE.Admin.Manager.Essence.BulkEdit.PerEssenceNote',
      'Names, descriptions, linked sources and property macros stay per-essence — edit those individually.'
    )}
    dataAttr="data-essence-bulk-per-essence-note"
  />
</BulkEditPanelShell>

<!--
  The DELETE block sits BELOW the shell: the shell's Apply is the panel's primary action, and a
  destructive action in the same card would read as a second way of applying the staged edit. It
  un-pins the sticky Apply dock, which is accepted and gated — see `BulkEditPanelShell`.

  The `components` row is a DISTINCT-carrier union: a component carrying two selected essences is
  one carrier, because the cascade strips it in one pass, which is why the copy says "one or more".

  `busy` is the caller's own `deleting` flag and is NOT folded into `disabled`, because the card
  must tell an in-flight write from an inert one; `applying` still inerts the control.
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
  /* ONE control each, now both axis resets live on their label row. The stack survives because
     each wrapper is still the hook the mounted tests and the state attribute hang on. */
  .manager-essence-bulk-icon,
  .manager-essence-bulk-colour {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The delete card's three rules moved to `BulkDeleteCard.svelte` with the markup they style:
     Svelte scoping is per component, so the moment that `<section>` rendered from there these
     selectors matched nothing. */
</style>
