<!-- Svelte 5 runes mode -->
<!--
  The world Tools Catalogue's BULK EDIT panel (issue 1373, maintainer feedback round 2).

  ── WHAT WAS ACTUALLY WRONG ────────────────────────────────────────────────────────────────────
  The catalogue's rows have always carried a selection box and its toolbar has always counted the
  ticks — `4 selected`, with a `Select all` and a `Clear` beside it — and the inspector went on
  saying `Nothing selected` however many were. The selection was never the problem: the frame
  renders `{#if bulk && selection.count > 0}` off the SAME `selection` object it hands the
  toolbar's count, so both halves of that condition read the same tick. The missing half was the
  second one. `bulk` is a lane snippet, the page passed none, and a `{#if}` on an undefined
  snippet is silent — so the screen shipped a selection affordance with nothing on the other end
  of it. This is that other end.

  ── ONE AXIS, AND THE OTHERS ARE NAMED RATHER THAN OMITTED ─────────────────────────────────────
  The world master switch is the only property of a world Tool whose value is CLOSED and means
  the same thing for every Tool in a selection, which is what a staged bulk write needs. It is
  also the one the rows already offer one at a time, so bulk is exactly "that, for the twelve I
  ticked".

  The four world DEFAULTS are deliberately not here, and the reason is per-section rather than a
  blanket one:

   - `breakage` carries a VALUE — a percentage, a formula and a threshold, or a use count — so a
     segment cannot stage it without also staging a number, and one number written across a
     mixed selection is a worse answer than no control;
   - `onBreak`'s third mode names a REPLACEMENT COMPONENT, and `toolScope.js` says world scope
     cannot address a component in an owning system. A control offering two of three modes reads
     as the whole vocabulary and silently is not;
   - `prerequisites` is an id LIST and `bonus` is an expression; both are per-Tool by nature.

  The panel says so in place, exactly as the essence bulk panel names its own per-entity axes,
  rather than leaving their absence to be inferred from a short panel.

  DELETE IS NOT HERE EITHER. The catalogue row offers `Edit tool` and the world switch and no
  destructive verb at all; deleting a world Tool takes its world defaults and every system's
  membership record with it, and the entry editor owns that action with its own armed control and
  its own impact statement. Adding a bulk delete to a screen with no single delete would put the
  most destructive verb in the product on the surface with the least context for it.

  ── THE CHROME IS THE SHIPPED PRIMITIVES ───────────────────────────────────────────────────────
  `BulkEditPanelShell` owns the eyebrow, the Clear action, the count hero and the Apply dock;
  `BulkEditSection` owns the axis label row and its staged chip; `SegmentedControl` owns the
  track. Nothing here is hand-rolled, which is what keeps this panel the same object a GM already
  knows from the Component, Recipe and Essence studios.

  Props:
   - count: how many rows are ticked. Pre-counted by the frame; the panel only words it.
   - applying: an in-flight write. Inerts the track and the Apply.
   - onClearSelection(): drop the whole selection.
   - onApply(status): `'on'` or `'off'`. Never called with `'unchanged'` — Apply is genuinely
     disabled until an axis is staged, so a GM cannot fire a no-op write and read success from it.
-->
<script>
  import BulkEditPanelShell from '../BulkEditPanelShell.svelte';
  import BulkEditSection from '../BulkEditSection.svelte';
  import Callout from '../Callout.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let { count = 0, applying = false, onClearSelection = () => {}, onApply = () => {} } = $props();

  /** The unstaged sentinel, shared by the segment value and the Apply gate. */
  const UNCHANGED = 'unchanged';

  // THE PANEL'S OWN STATE, and it is safe to hold here precisely because the frame renders this
  // snippet only while the selection is non-empty: clearing the selection unmounts the panel, so
  // a staged instruction can never outlive the set it was staged against.
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

  // WHAT THE STAGED INSTRUCTION WILL DO, in the words the world switch itself uses. `On` and
  // `Off` alone would restate the highlighted segment; these say the blast radius, which is the
  // fact a GM is deciding on.
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

  <Callout
    tone="info"
    text={text(
      'FABRICATE.Admin.Manager.Tools.BulkEdit.PerToolNote',
      'Breakage, on-break, prerequisites and the check bonus each carry a value of their own, so they stay per-Tool — open a Tool to edit them.'
    )}
    dataAttr="data-world-tool-bulk-per-tool-note"
  />
</BulkEditPanelShell>
