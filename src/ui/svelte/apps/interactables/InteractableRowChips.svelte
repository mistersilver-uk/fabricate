<!-- Svelte 5 runes mode -->
<!--
  The chip strip of one Manage Interactables row: type, source, state and marker status.
  A fragment of `Chip`s with no wrapper of its own, so the row's `.fab-im-row-meta` lays them out.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `row` | a row from `buildInteractableRow` | required | Carries `interactableType`, `sourceLabel`, `sourceResolved`, `sourceConfigured`, `sourceId`, `state` and `markerStatus`. |

  Invariants:
  - The source chip is one of three, by what the row knows: neutral with the resolved label, warning `Unresolved` when a configured Tool or Task no longer resolves, warning `Needs configuration` when no source is chosen.
  - The unresolved chip carries the source id as its `title` and as visually hidden text, both only when the id is known; the unconfigured chip carries no id, and no internal sentinel reaches any of them.
-->
<script>
  import { localizeOr } from '../../util/localizeOr.js';
  import Chip from '../../components/Chip.svelte';

  let { row } = $props();

  function markerLabel(status) {
    switch (status) {
      case 'Tile':
        return localizeOr('FABRICATE.Canvas.Manage.MarkerTile', 'Tile');
      case 'Drawing':
        return localizeOr('FABRICATE.Canvas.Manage.MarkerDrawing', 'Drawing');
      case 'Token':
        return localizeOr('FABRICATE.Canvas.Manage.MarkerToken', 'Token');
      case 'region-only':
        return localizeOr('FABRICATE.Canvas.Manage.MarkerRegionOnly', 'Region only');
      case 'missing':
      default:
        return localizeOr('FABRICATE.Canvas.Manage.MarkerMissing', 'Missing');
    }
  }

  // `missing` is a fault to act on; `region-only` is a deliberate configuration, not a fault.
  function markerTone(status) {
    if (status === 'missing') return 'danger';
    if (status === 'region-only') return 'muted';
    return 'neutral';
  }

  function typeLabel(interactableType) {
    return interactableType === 'gatheringTask'
      ? localizeOr('FABRICATE.Canvas.Manage.TypeGatheringTask', 'Gathering task')
      : localizeOr('FABRICATE.Canvas.Manage.TypeTool', 'Tool');
  }

  // Enabled is the default, so surface the notable states: disabled, locked, consumed.
  function stateBadges(state) {
    const badges = [];
    if (!state.enabled)
      badges.push(localizeOr('FABRICATE.Canvas.Manage.StateDisabled', 'Disabled'));
    if (state.locked) badges.push(localizeOr('FABRICATE.Canvas.Manage.StateLocked', 'Locked'));
    if (state.consumed)
      badges.push(localizeOr('FABRICATE.Canvas.Manage.StateConsumed', 'Consumed'));
    if (badges.length === 0)
      badges.push(localizeOr('FABRICATE.Canvas.Manage.StateEnabled', 'Enabled'));
    return badges;
  }

  const sourceIdText = $derived(
    localizeOr('FABRICATE.Canvas.Manage.UnresolvedSourceId', 'Source not found: {id}', {
      id: row.sourceId,
    })
  );
</script>

<Chip tone="secondary" data-interactable-manager-chip-type=""
  >{typeLabel(row.interactableType)}</Chip
>
{#if !row.sourceConfigured}
  <Chip tone="warning" data-interactable-manager-chip-source="unconfigured"
    >{localizeOr(
      'FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigTitle',
      'Needs configuration'
    )}</Chip
  >
{:else if !row.sourceResolved}
  <Chip
    tone="warning"
    title={row.sourceId || undefined}
    data-interactable-manager-chip-source="unresolved"
    >{localizeOr(
      'FABRICATE.Canvas.Interactable.Config.UnresolvedSource',
      'Unresolved'
    )}{#if row.sourceId}<span class="visually-hidden" data-interactable-manager-chip-source-id
        >{` ${sourceIdText}`}</span
      >{/if}</Chip
  >
{:else}
  <Chip tone="neutral" data-interactable-manager-chip-source="">{row.sourceLabel}</Chip>
{/if}
{#each stateBadges(row.state) as badge (badge)}
  <Chip tone="neutral" data-interactable-manager-chip-state="">{badge}</Chip>
{/each}
<Chip tone={markerTone(row.markerStatus)} data-interactable-manager-chip-marker={row.markerStatus}>
  {markerLabel(row.markerStatus)}
</Chip>
