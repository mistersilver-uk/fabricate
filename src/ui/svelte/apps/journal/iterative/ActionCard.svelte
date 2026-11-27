<!-- Svelte 5 runes mode -->
<!-- One Crafting Action of the live step (issue 3011, D-9): a card `ListRow` whose press takes one
     Iterative Attempt. It names the action, whether it rolls, what it does, the one note that says
     why it can or cannot be taken, and each cost and hazard it will apply whatever the check gives. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { worldTimeLabel } from '../../../util/worldTimeLabel.js';
  import Chip from '../../../components/Chip.svelte';
  import ListRow from '../../../components/ListRow.svelte';

  const K = Object.freeze({
    busy: 'FABRICATE.App.Journal.Iterative.Card.Busy',
    check: 'FABRICATE.App.Journal.Iterative.Card.CheckTag',
    noCost: 'FABRICATE.App.Journal.Iterative.Card.NoCost',
    waiting: 'FABRICATE.App.Journal.Iterative.Card.Waiting',
  });

  /** `state` is `ready`, `busy` or `disabled`; `onPress(actionId, event)` takes the attempt. */
  let { card, state = 'disabled', services = null, onPress = () => {} } = $props();

  const busy = $derived(state === 'busy');
  const note = $derived(busy ? 'working' : card.note);
  const noteText = $derived.by(() => {
    if (busy) return card.busyNote;
    if (card.note !== 'waiting') return card.noteText ?? '';
    const at = Number(card.availableAt);
    const components = Number.isFinite(at) ? services?.getWorldTimeComponents?.(at) : null;
    return localize(K.waiting, { time: worldTimeLabel(components ?? null, { localize }) });
  });
  const ink = $derived(busy ? 'info' : card.noteTone === 'danger' ? 'danger' : 'muted');
</script>

<ListRow
  layout="card"
  name={card.name}
  icon={card.icon || 'fas fa-hammer'}
  {busy}
  disabled={state === 'disabled'}
  onOpen={(event) => onPress(card.actionId, event)}
  openProps={{ 'aria-label': busy ? localize(K.busy, { action: card.name }) : card.name }}
  class="workpiece-action"
  data-iterative-action={card.actionId}
  data-iterative-card-state={state}
  data-iterative-card-note={note}
>
  {#snippet badges()}
    {#if card.check}<Chip density="row" icon="fas fa-dice-d20">{localize(K.check)}</Chip>{/if}
  {/snippet}
  {#snippet meta()}{card.description}{/snippet}
  <span class={['workpiece-action-note', `is-${ink}`]}>{noteText}</span>
  {#snippet aside()}
    <span class="workpiece-action-costs">
      {#each card.costs ?? [] as cost (cost.costId)}
        <Chip density="row" tone={cost.short ? 'danger' : ''} mono>{cost.label}</Chip>
      {/each}
      {#each card.hazards ?? [] as hazard (hazard.effectId)}
        <Chip density="row" tone="danger" emphasis="lit" mono>{hazard.label}</Chip>
      {/each}
      {#if card.noCost}<span class="workpiece-action-free">{localize(K.noCost)}</span>{/if}
    </span>
  {/snippet}
</ListRow>

<style>
  .workpiece-action-note {
    display: block;
    font-size: 10px;
    line-height: 1.4;
  }
  .workpiece-action-note.is-muted {
    color: var(--fab-text-muted);
  }
  .workpiece-action-note.is-info {
    color: var(--fab-info-text);
  }
  .workpiece-action-note.is-danger {
    color: var(--fab-danger-text);
    font-weight: 600;
  }
  .workpiece-action-costs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
  }
  .workpiece-action-free {
    font-size: 10px;
    color: var(--fab-text-muted);
  }
</style>
