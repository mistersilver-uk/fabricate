<!-- Svelte 5 runes mode -->
<!--
  The GM read-only list of the complications a progressive stage's component authors, in the stage
  row's body in both studios (issues 1286, 2445): a muted "Complications" kicker over a nested,
  non-reorderable, unnumbered `SortableList` whose rows are `ComplicationSummaryRow`'s `readonly-gm`
  variant. It draws no band, fill, accent rule, tile or control; the stage row's own Edit is the route.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `complications` | complication[] | `[]` | already filtered to the surface's activity by the caller, whose same filter decides `has-band` |
  | `ownerId` | string | `''` | the referenced component's id, written to the list as the `data-stage-complications` hook |
  | `ownerName` | string | `''` | the referenced component's name, for the list's count-and-owner accessible name |
  | `macroNames` / `triggerLabels` | `Map` | `undefined` | the system-scoped uuid→name and trigger id→label vocabularies; absent, the sentence names the shape |

  Invariants:
  - No complications renders nothing at all — pinned by `tests/components/stage-complication-list-mounted.test.js`.
-->
<script>
  import { localizeOr } from '../../util/localizeOr.js';
  import Kicker from '../../components/Kicker.svelte';
  import SortableList from '../../components/SortableList.svelte';
  import ComplicationSummaryRow from './ComplicationSummaryRow.svelte';
  import { complicationSummary } from '../../../model/complicationSummary.js';

  let { complications = [], ownerId = '', ownerName = '', macroNames, triggerLabels } = $props();

  const stageComplications = $derived(Array.isArray(complications) ? complications : []);

  const SEVERITY_LABELS = Object.freeze({
    minor: ['FABRICATE.Admin.Manager.Component.Complications.Severity.minor', 'Minor'],
    major: ['FABRICATE.Admin.Manager.Component.Complications.Severity.major', 'Major'],
    severe: ['FABRICATE.Admin.Manager.Component.Complications.Severity.severe', 'Severe'],
  });

  // Full key literals per severity: `ui-lang-keys-resolve.test.js` admits a composed
  // `${BASE}.${severity}` as a namespace base without resolving the leaf.
  function severityLabel(severity) {
    const declared = SEVERITY_LABELS[severity];
    return declared ? localizeOr(...declared) : String(severity ?? '');
  }

  // Two FULL key literals rather than one composed key, for the same reason.
  const listName = $derived(
    stageComplications.length === 1
      ? localizeOr(
          'FABRICATE.Admin.Manager.Component.Complications.StripTitleOne',
          '1 complication on {name}',
          { name: ownerName }
        )
      : localizeOr(
          'FABRICATE.Admin.Manager.Component.Complications.StripTitle',
          '{count} complications on {name}',
          { count: stageComplications.length, name: ownerName }
        )
  );

  function triggerSentence(complication) {
    return complicationSummary(complication, {
      translate: localizeOr,
      macroName: macroNames?.get(complication?.macroUuid) || '',
      triggerName: triggerLabels?.get(complication?.when?.checkTrigger) || '',
    });
  }
</script>

{#if stageComplications.length > 0}
  <div class="manager-stage-complications">
    <Kicker
      >{localizeOr(
        'FABRICATE.Admin.Manager.Component.Complications.Title',
        'Complications'
      )}</Kicker
    >
    <SortableList
      items={stageComplications}
      itemLabel={(complication) => complication?.name || ''}
      reorderable={false}
      ariaLabel={listName}
      data-stage-complications={ownerId}
    >
      {#snippet row(complication)}
        <ComplicationSummaryRow
          variant="readonly-gm"
          nameEmphasis="display"
          name={complication.name}
          severity={complication.severity}
          severityLabel={severityLabel(complication.severity)}
          visibility={complication.visibility}
          playerLabel={localizeOr(
            'FABRICATE.Admin.Manager.Component.Complications.PlayerPill',
            'Player'
          )}
          playerTitle={localizeOr(
            'FABRICATE.Admin.Manager.Component.Complications.PlayerPillTitle',
            'Shown to the player when it fires.'
          )}
          triggerSentence={triggerSentence(complication)}
          data-stage-complication={complication.id || true}
        />
      {/snippet}
    </SortableList>
  </div>
{/if}

<style>
  /* A plain column: the list rows are the boxes, so this draws no border, fill or padding. Its
     weight is stated because the Component Studio mounts it inside a `.fabricate-field`, whose 700
     the trigger sentence would otherwise inherit. */
  .manager-stage-complications {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    font-weight: 400;
  }
</style>
