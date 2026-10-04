<!--
  VIEW LAB SPECIMEN, NOT A FABRICATE SURFACE (issue 1782). It mounts the shipped
  `BulkEditPanelShell` directly, three times, with the `subjectCount`, `blocked` and `report` props
  no shipped caller passes yet, so the real notice and its reason list can be photographed before a
  studio adopts them. Nothing in `src/` imports this file, and it ships in neither the free module
  nor Premium; `tests/view-lab/mount.js` mounts it for `?specimen=bulk-edit-panel-shell` only.

  Each column is a `.manager-inspector`, the shared rail at its production 300px track, so the
  dock bleeds by the rail's own padding (`dockBleed` unset). The children are the Essence Rules
  panel's Status axis, so each notice sits between the staged axes and the dock as it will in a
  studio.
-->
<script>
  import BulkEditPanelShell from '../../../src/ui/svelte/apps/manager/BulkEditPanelShell.svelte';
  import BulkEditSection from '../../../src/ui/svelte/apps/manager/BulkEditSection.svelte';
  import SegmentedControl from '../../../src/ui/svelte/components/SegmentedControl.svelte';

  // Each reason names its row, as the library's `blocked` API requires.
  const BLOCKED = [
    { id: 'moonsilver', reason: 'Moonsilver is referenced by a locked compendium.' },
    { id: 'starmetal', reason: 'Starmetal is in use by a running craft.' },
  ];

  const STATUS = [
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
  ];

  const STATES = [
    {
      id: 'blocked',
      caption: 'Blocked forecast: 2 of 4, before Apply',
      status: 'enable',
      props: { canApply: true, subjectCount: 4, blocked: BLOCKED },
    },
    {
      id: 'report-clean',
      caption: 'Report: a clean write',
      status: 'unchanged',
      props: { canApply: false, subjectCount: 4, report: { changed: 4 } },
    },
    {
      id: 'report-skipped',
      caption: 'Report: a write that skipped two',
      status: 'unchanged',
      props: {
        canApply: false,
        subjectCount: 4,
        blocked: BLOCKED,
        report: { changed: 2, skipped: BLOCKED },
      },
    },
  ];
</script>

<div class="fabricate-manager">
  <div class="lab-specimen" data-lab-specimen="bulk-edit-panel-shell">
    <p class="lab-specimen-banner">
      SPECIMEN OF UNADOPTED PROPS: BulkEditPanelShell with subjectCount, blocked and report, which
      no studio passes yet (issue 1782). Mounted by the View Lab; not a screen a GM can reach.
    </p>
    <div class="lab-specimen-row">
      {#each STATES as state (state.id)}
        <section class="lab-specimen-column" data-lab-specimen-state={state.id}>
          <p class="lab-specimen-caption">{state.caption}</p>
          <aside class="manager-inspector">
            <BulkEditPanelShell heading="4 essences selected" {...state.props}>
              <BulkEditSection label="Status" />
              <SegmentedControl
                options={STATUS}
                value={state.status}
                fill={true}
                groupName={`lab-specimen-status-${state.id}`}
                ariaLabel="Status"
              />
            </BulkEditPanelShell>
          </aside>
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .lab-specimen {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding: var(--fab-space-4);
  }

  .lab-specimen-banner {
    margin: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-warning-border);
    border-radius: 8px;
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .lab-specimen-row {
    display: flex;
    gap: var(--fab-space-4);
    align-items: flex-start;
  }

  .lab-specimen-column {
    display: flex;
    flex: 0 0 300px;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .lab-specimen-caption {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 600;
  }
</style>
