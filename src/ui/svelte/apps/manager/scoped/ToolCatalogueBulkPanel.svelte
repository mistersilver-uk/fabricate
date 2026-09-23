<!-- Svelte 5 runes mode -->
<!--
  The world Tools Catalogue's BULK EDIT panel (issue 1373). The catalogue always carried the
  selection and its count; `bulk` is a lane snippet the page never passed, and an `{#if}` on an
  undefined snippet is silent — so the selection affordance had nothing on the other end of it.

  ONE AXIS, AND THE OTHERS ARE NAMED RATHER THAN OMITTED. The world master switch is the only
  property of a world Tool whose value is CLOSED and means the same thing across a selection.
  `breakage` carries a VALUE, `onBreak`'s third mode names a replacement component world scope
  cannot address, `prerequisites` is an id list and `bonus` an expression — so the panel states
  their absence in place. DELETE IS NOT HERE either: the entry editor owns it, with its own armed
  control and impact statement, and the catalogue row offers no destructive verb at all.

  `onApply(status)` is `'on'` or `'off'` and never `'unchanged'`: Apply is disabled until staged.
-->
<script>
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../../../components/Callout.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { count = 0, applying = false, onClearSelection = () => {}, onApply = () => {} } = $props();

  /** The unstaged sentinel, shared by the segment value and the Apply gate. */
  const UNCHANGED = 'unchanged';

  // THE PANEL'S OWN STATE, safe here because the frame renders this snippet only while the
  // selection is non-empty, so a staged instruction cannot outlive the set it was staged against.
  let staged = $state(UNCHANGED);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, String(value));
    }
    return result;
  }

  const inert = $derived(applying === true);
  const canApply = $derived(staged !== UNCHANGED && !inert);

  const headingLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Tools.BulkEdit.HeadingOne', '1 Tool selected')
      : format('FABRICATE.Admin.Manager.Tools.BulkEdit.Heading', '{count} Tools selected', {
          count,
        })
  );

  const applyLabel = $derived(
    count === 1
      ? text('FABRICATE.Admin.Manager.Tools.BulkEdit.ApplyOne', 'Apply to 1 Tool')
      : format('FABRICATE.Admin.Manager.Tools.BulkEdit.Apply', 'Apply to {count} Tools', { count })
  );

  const statusSegments = $derived([
    {
      value: UNCHANGED,
      labelKey: 'FABRICATE.Admin.Manager.BulkEdit.Unchanged',
      fallback: 'Unchanged',
    },
    {
      value: 'on',
      labelKey: 'FABRICATE.Admin.Manager.Tools.BulkEdit.StatusOn',
      fallback: 'On',
    },
    {
      value: 'off',
      labelKey: 'FABRICATE.Admin.Manager.Tools.BulkEdit.StatusOff',
      fallback: 'Off',
    },
  ]);

  // WHAT THE STAGED INSTRUCTION WILL DO, in the world switch's own words: `On` and `Off` alone
  // would restate the highlighted segment rather than the blast radius a GM is deciding on.
  const stagedLabel = $derived(
    {
      on: text(
        'FABRICATE.Admin.Manager.Tools.BulkEdit.StatusOnStaged',
        'On in every crafting system'
      ),
      off: text(
        'FABRICATE.Admin.Manager.Tools.BulkEdit.StatusOffStaged',
        'Off in every crafting system'
      ),
    }[staged] ?? text('FABRICATE.Admin.Manager.BulkEdit.LeaveUnchanged', 'Leave unchanged')
  );
</script>

<BulkEditPanelShell
  heading={headingLabel}
  {applyLabel}
  {canApply}
  panelAttr="data-world-tool-bulk-panel"
  clearAttr="data-world-tool-bulk-clear"
  countAttr="data-world-tool-bulk-count"
  applyAttr="data-world-tool-bulk-apply"
  {onClearSelection}
  onApply={() => {
    if (!canApply) return;
    onApply(staged);
    staged = UNCHANGED;
  }}
>
  <BulkEditSection
    label={text('FABRICATE.Admin.Manager.Tools.BulkEdit.StatusLabel', 'World status')}
    subhint={stagedLabel}
    subhintAttr="data-world-tool-bulk-status-state"
    subhintValue={staged}
  />
  <SegmentedControl
    fill={true}
    options={statusSegments}
    value={staged}
    groupName="world-tool-bulk-status"
    ariaLabel={text('FABRICATE.Admin.Manager.Tools.BulkEdit.StatusLabel', 'World status')}
    dataAttr="data-world-tool-bulk-status"
    optionDataAttr="data-world-tool-bulk-status-option"
    onChange={(next) => {
      if (!inert) staged = next;
    }}
  />

  <!-- NEUTRAL (issue 1505): which settings stay per-Tool is true of every selection. -->
  <Callout
    tone="neutral"
    text={text(
      'FABRICATE.Admin.Manager.Tools.BulkEdit.PerToolNote',
      'Breakage, on-break, prerequisites and the check bonus each carry a value of their own, so they stay per-Tool — open a Tool to edit them.'
    )}
    dataAttr="data-world-tool-bulk-per-tool-note"
  />
</BulkEditPanelShell>
