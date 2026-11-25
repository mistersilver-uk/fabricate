<!-- Svelte 5 runes mode -->
<!--
  The Crafting Action editor's "How it is taken" card: whether the action uses a session, and the
  counter rules that must hold before it can be taken, combined as All or Any.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `draft` | the staged action | — | read for `usesSession` and `availability` |
  | `counters` / `actions` | `{ id, label }[]` | `[]` | the rule sources, from the library |
  | `faults` | `{ code, reason?, field }[]` | `[]` | the action-level marks; this card draws its `availability` ones |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `edit(change)` | function | no-op | runs `change(draft)`, the only way this card writes |

  Invariants:
  - "Uses a session" is a staged `aria-pressed` toggle, because the editor applies on Save, named by a
    snippet so its name is never capped, and described by the session note beside it.
-->
<script>
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import Kicker from '../../../components/Kicker.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import { arrayOrEmpty } from '../../../../../utils/scalars.js';

  import CounterRuleList from './CounterRuleList.svelte';
  import FaultLine from './FaultLine.svelte';

  let {
    draft,
    counters = [],
    actions = [],
    faults = [],
    text = (_key, fallback) => fallback,
    edit = () => {},
  } = $props();

  const uid = $props.id();
  const noteId = `${uid}-session-note`;
  const usesSession = $derived(draft.usesSession !== false);
  const marks = $derived(faults.filter((fault) => fault.field === 'availability'));
  const sessionNote = $derived(
    usesSession
      ? text('FABRICATE.Admin.Manager.Iterative.UsesSessionOn', 'Taking it uses a session.')
      : text(
          'FABRICATE.Admin.Manager.Iterative.UsesSessionOff',
          'Free action: nothing counts down.'
        )
  );

  function setRules({ rules, combine }) {
    edit((action) => {
      action.availability = { combine, rules };
    });
  }
</script>

{#snippet usesSessionName()}{text(
    'FABRICATE.Admin.Manager.Iterative.UsesSession',
    'Uses a session'
  )}{/snippet}

<InspectorCard data-iterative-section="taken">
  {#snippet title()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionTaken',
      'How it is taken'
    )}{/snippet}
  {#snippet note()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionTakenNote',
      'Checked before every session. Leave the restrictions empty to allow it in every session.'
    )}{/snippet}
  <div class="manager-iterative-card-body">
    <div class="manager-iterative-toggle-line">
      <StatusToggle
        on={usesSession}
        label={usesSessionName}
        aria-describedby={noteId}
        data-iterative-uses-session
        onclick={() =>
          edit((action) => {
            action.usesSession = !usesSession;
          })}
      />
      <span class="manager-iterative-note" id={noteId} data-iterative-session-note
        >{sessionNote}</span
      >
    </div>
    <Kicker>{text('FABRICATE.Admin.Manager.Iterative.CounterRulesHeading', 'Counters')}</Kicker>
    <CounterRuleList
      rules={arrayOrEmpty(draft.availability?.rules)}
      combine={draft.availability?.combine ?? 'all'}
      counterSources={counters}
      {actions}
      {text}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.CounterRulesHeading', 'Counters')}
      emptyText={text(
        'FABRICATE.Admin.Manager.Iterative.CounterRulesEmpty',
        'No counter rules, so any counter values are fine.'
      )}
      data-iterative-availability
      onChange={setRules}
    />
    <FaultLine faults={marks} {text} />
  </div>
</InspectorCard>

<style>
  .manager-iterative-toggle-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
  }
</style>
