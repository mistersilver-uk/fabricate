<!-- Svelte 5 runes mode -->
<!--
  The Crafting Action editor's Check card: whether the action rolls the system's one routed crafting
  check or no check, with that check shown read-only and a way to Checks. Which difficulty or tier an
  action asks for is not set here.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `draft` | the staged action | — | read for `check` |
  | `routed` | the system's `craftingCheck.routed` | `null` | the facts the strip shows |
  | `systemName` | string | `''` | named by the missing-check sentence |
  | `faults` | `{ code, reason?, field }[]` | `[]` | the action-level marks; this card draws its `check` one |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `edit(change)` / `onOpenChecks()` | functions | no-ops | the only write, and the way to Checks |

  Invariants:
  - The routed slot has no off state: an action without a check is the No check choice.
  - A routed check with no usable roll replaces the facts with a warning Notice carrying the same
    way to Checks.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Chip from '../../../components/Chip.svelte';
  import InfoStrip from '../../../components/InfoStrip.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Notice from '../../../components/Notice.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import { hasActiveCheck } from '../../../../../systems/salvageCheckUsability.js';
  import { interpolate } from '../checks/checksCopy.js';
  import { routedCheckFacts } from '../recipe/routedCheckFacts.js';

  import FaultLine from './FaultLine.svelte';

  let {
    draft,
    routed = null,
    systemName = '',
    faults = [],
    text = (_key, fallback) => fallback,
    edit = () => {},
    onOpenChecks = () => {},
  } = $props();

  const rolls = $derived(draft.check === 'roll');
  const marks = $derived(faults.filter((fault) => fault.field === 'check'));
  const usable = $derived(hasActiveCheck(routed));
  const facts = $derived(routedCheckFacts(routed));

  const options = $derived([
    {
      value: 'roll',
      label: text('FABRICATE.Admin.Manager.Iterative.CheckRoll', 'Roll the crafting check'),
    },
    { value: 'none', label: text('FABRICATE.Admin.Manager.Iterative.CheckNone', 'No check') },
  ]);

  const strip = $derived([
    {
      icon: 'fas fa-dice-d20',
      label: text('FABRICATE.Admin.Manager.Iterative.CheckFactFormula', 'Roll'),
      value: routed?.rollFormula || '—',
      props: { 'data-iterative-check-fact': 'formula' },
    },
    {
      icon: 'fas fa-plus',
      label: text('FABRICATE.Admin.Manager.Iterative.CheckFactResult', 'Result'),
      value:
        facts.evaluation.product === 'count'
          ? text('FABRICATE.Admin.Manager.Iterative.CheckFactCount', 'Count')
          : text('FABRICATE.Admin.Manager.Iterative.CheckFactSum', 'Sum'),
      props: { 'data-iterative-check-fact': 'product' },
    },
    {
      icon: 'fas fa-arrows-up-down',
      label: text('FABRICATE.Admin.Manager.Iterative.CheckFactDirection', 'Wins'),
      value:
        facts.evaluation.direction === 'under'
          ? text('FABRICATE.Admin.Manager.Iterative.CheckFactUnder', 'Under')
          : text('FABRICATE.Admin.Manager.Iterative.CheckFactOver', 'Over'),
      props: { 'data-iterative-check-fact': 'direction' },
    },
    {
      icon: 'fas fa-layer-group',
      label: text('FABRICATE.Admin.Manager.Iterative.CheckFactOutcomes', 'Outcomes'),
      value: String(facts.tiers.length),
      props: { 'data-iterative-check-fact': 'outcomes' },
    },
  ]);

  const openChecksLabel = $derived(
    text('FABRICATE.Admin.Manager.Iterative.OpenChecks', 'Open Checks')
  );
</script>

<InspectorCard data-iterative-section="check">
  {#snippet leading()}<Chip tone="neutral" mono>2</Chip>{/snippet}
  {#snippet title()}{text('FABRICATE.Admin.Manager.Iterative.SectionCheck', 'Check')}{/snippet}
  {#snippet note()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionCheckNote',
      'Rolled once per session'
    )}{/snippet}
  <div class="manager-iterative-card-body">
    <p class="manager-iterative-note">
      {text(
        'FABRICATE.Admin.Manager.Iterative.CheckLead',
        'A failed check still uses up the session: its costs are paid and any effects that match a failure apply.'
      )}
    </p>
    <SegmentedControl
      {options}
      value={draft.check}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.SectionCheck', 'Check')}
      optionDataAttr="data-iterative-check-option"
      onChange={(next) =>
        edit((action) => {
          action.check = next;
        })}
    />
    {#if rolls}
      <Callout
        tone="info"
        text={text(
          'FABRICATE.Admin.Manager.Iterative.CheckRollsNote',
          'Rolls the crafting check, set for the whole system in Checks.'
        )}
        data-iterative-check-note
      >
        {#snippet actions()}
          <Button
            role="ghost"
            icon="fas fa-arrow-up-right-from-square"
            data-iterative-open-checks
            onclick={onOpenChecks}
          >
            {openChecksLabel}
          </Button>
        {/snippet}
      </Callout>
      {#if usable}
        <InfoStrip
          label={text('FABRICATE.Admin.Manager.Iterative.CheckStripLabel', 'Crafting check')}
          facts={strip}
          data-iterative-check-facts
          data-iterative-check-product={facts.evaluation.product}
          data-iterative-check-direction={facts.evaluation.direction}
        />
      {:else}
        <Notice
          tone="warning"
          title={interpolate(
            text(
              'FABRICATE.Admin.Manager.Iterative.CheckMissing',
              '{system} has no crafting check set up, so this action cannot be taken.'
            ),
            { system: systemName }
          )}
          detail={text(
            'FABRICATE.Admin.Manager.Iterative.CheckMissingDetail',
            'Set one up in Checks or choose No check.'
          )}
          action={{ label: openChecksLabel, onClick: onOpenChecks }}
          data-iterative-check-missing
        />
      {/if}
    {:else if draft.check === 'none'}
      <p class="manager-iterative-note" data-iterative-no-check>
        {text(
          'FABRICATE.Admin.Manager.Iterative.CheckNoneNote',
          'Every effect applies every session, subject to its workpiece rules.'
        )}
      </p>
    {/if}
    <FaultLine faults={marks} {text} />
  </div>
</InspectorCard>
