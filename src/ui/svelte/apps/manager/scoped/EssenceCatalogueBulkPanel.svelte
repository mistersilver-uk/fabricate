<!-- Svelte 5 runes mode -->
<!--
  The world Essence Catalogue's bulk edit panel (issue 2485): the two closed fields of a world
  essence, `Icon` and `Colour`, staged over the selection, and one standing note naming what stays
  per-essence and where it is edited. It offers no delete, enable or membership control.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `count` | number | `0` | the selection register's count |
  | `applying` | boolean | `false` | a run is in flight; the panel is inert until it ends |

  Callbacks:
  - `onClearSelection()` — the frame's own `clearSelection`.
  - `onApply(edit)` — `edit` holds only the staged `icon` and `colorToken` keys, `colorToken: null`
    for `No colour`; Apply is inert until one is staged.

  Invariants:
  - `ui-world-scope/spec.md` `## GM World Essence Screens` requirement 22 — pinned by
    `tests/components/world-essence-catalogue-bulk-mounted.test.js`.
-->
<script>
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import TintPicker from '../../../components/TintPicker.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import {
    ESSENCE_BULK_COLOUR_NONE,
    ESSENCE_BULK_COLOUR_UNCHANGED,
    bulkEssenceColourControlValue,
    bulkEssenceDraftHasChanges,
    createEssenceBulkDraft,
    setBulkEssenceColour,
    setBulkEssenceIcon,
    toBulkEssenceEdit,
  } from '../../../../model/essenceBulkEditModel.js';

  let { count = 0, applying = false, onClearSelection = () => {}, onApply = () => {} } = $props();

  // The frame renders this panel only while the selection is non-empty, so a draft cannot outlive it.
  let draft = $state(createEssenceBulkDraft());

  const busy = $derived(applying === true);
  const colourValue = $derived(bulkEssenceColourControlValue(draft));
  const isTokenStaged = $derived(
    colourValue !== ESSENCE_BULK_COLOUR_UNCHANGED && colourValue !== ESSENCE_BULK_COLOUR_NONE
  );
  const canApply = $derived(bulkEssenceDraftHasChanges(draft) && !busy);
  const leaveUnchanged = $derived(
    localizeOr('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')
  );

  const headingLabel = $derived(
    count === 1
      ? localizeOr(
          'FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.HeadingOne',
          '1 essence selected'
        )
      : localizeOr(
          'FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.Heading',
          '{count} essences selected',
          { count }
        )
  );
  const applyLabel = $derived(
    count === 1
      ? localizeOr('FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.ApplyOne', 'Apply to 1 essence')
      : localizeOr(
          'FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.Apply',
          'Apply to {count} essences',
          { count }
        )
  );

  // Each sub-hint states the staged field's reach, which differs: requirement 22.
  const iconStageLabel = $derived(
    draft.icon
      ? localizeOr(
          'FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.IconStaged',
          'Every selected essence, on its world entry and catalogue'
        )
      : leaveUnchanged
  );
  const colourStageLabel = $derived.by(() => {
    if (colourValue === ESSENCE_BULK_COLOUR_UNCHANGED) return leaveUnchanged;
    if (colourValue === ESSENCE_BULK_COLOUR_NONE) {
      return localizeOr('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour');
    }
    return localizeOr(
      'FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.ColourStaged',
      'Every selected essence, on GM screens in every crafting system'
    );
  });

  function stage(next) {
    if (!busy) draft = next;
  }
</script>

<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  dockBleed="space-4"
  panelAttr="data-world-essence-bulk-panel"
  clearAttr="data-world-essence-bulk-clear"
  countAttr="data-world-essence-bulk-count"
  applyAttr="data-world-essence-bulk-apply"
  {onClearSelection}
  onApply={() => {
    if (!canApply) return;
    onApply(toBulkEssenceEdit(draft));
    draft = createEssenceBulkDraft();
  }}
>
  <BulkEditSection
    label={localizeOr('FABRICATE.Admin.Manager.Essence.Icon', 'Icon')}
    subhint={iconStageLabel}
    subhintAttr="data-world-essence-bulk-icon-state"
    subhintValue={draft.icon ? 'staged' : 'unchanged'}
  >
    {#snippet trailing()}
      <Chip
        tag="button"
        type="button"
        tone={draft.icon ? 'warning' : 'neutral'}
        icon="fas fa-undo"
        data-world-essence-bulk-icon-reset
        disabled={busy || !draft.icon}
        onclick={() => stage(setBulkEssenceIcon(draft, ''))}>{leaveUnchanged}</Chip
      >
    {/snippet}
  </BulkEditSection>
  <div class="manager-world-essence-bulk-axis" data-world-essence-bulk-icon>
    <IconPicker
      value={draft.icon || ''}
      disabled={busy}
      ariaLabel={localizeOr('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
      onChange={(icon) => stage(setBulkEssenceIcon(draft, icon))}
    />
  </div>

  <BulkEditSection
    label={localizeOr('FABRICATE.Admin.Manager.Essence.Colour.Label', 'Colour')}
    subhint={colourStageLabel}
    subhintAttr="data-world-essence-bulk-colour-state"
    subhintValue={colourValue || 'unchanged'}
  >
    {#snippet trailing()}
      <Chip
        tag="button"
        type="button"
        tone={colourValue === ESSENCE_BULK_COLOUR_UNCHANGED ? 'neutral' : 'warning'}
        icon="fas fa-undo"
        data-world-essence-bulk-colour-reset
        disabled={busy || colourValue === ESSENCE_BULK_COLOUR_UNCHANGED}
        onclick={() => stage(setBulkEssenceColour(draft, ESSENCE_BULK_COLOUR_UNCHANGED))}
        >{leaveUnchanged}</Chip
      >
    {/snippet}
  </BulkEditSection>
  <!-- `TintPicker` takes no `disabled`, so the run inerts its wrapper. -->
  <div
    class="manager-world-essence-bulk-axis"
    data-world-essence-bulk-colour={colourValue || 'unchanged'}
    inert={busy}
  >
    <TintPicker
      layout="inline"
      allowNone
      allowCustom={false}
      manageDismiss={false}
      colorToken={isTokenStaged ? colourValue : ''}
      unset={!isTokenStaged}
      noneSelected={colourValue === ESSENCE_BULK_COLOUR_NONE}
      customColor=""
      presetGridLabel={localizeOr(
        'FABRICATE.Admin.Manager.Essence.Colour.Presets',
        'Essence colour presets'
      )}
      noneLabel={localizeOr('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')}
      onClear={() => stage(setBulkEssenceColour(draft, ESSENCE_BULK_COLOUR_NONE))}
      onChange={(next) => stage(setBulkEssenceColour(draft, next?.colorToken || ''))}
    />
  </div>

  <Callout
    tone="neutral"
    text={localizeOr(
      'FABRICATE.Admin.Manager.Scoped.Essence.BulkEdit.PerEssenceNote',
      "Names, descriptions, linked sources and property macros stay per-essence: open an essence to edit them. Enabling an essence happens on each crafting system's Essence Rules screen; adding one to a system happens there or on the essence's own page, and deleting one happens on its own page."
    )}
    data-world-essence-bulk-per-essence-note
  />
</BulkEditPanelShell>

<style>
  .manager-world-essence-bulk-axis {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }
</style>
