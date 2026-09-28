<!-- Svelte 5 runes mode -->
<!--
  The "Player sees" block of a salvage or gathering-task check override: the line a player is shown,
  and, where the target reads a character value, the shared Preview-as picker choosing whose value
  it resolves. With no character chosen the line names the formula and the Studio's no-actor note.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `subject` | string | `''` | The line's lead: `Salvage check`, or the task's name. |
  | `evaluation` / `thresholdMode` / `type` | normalized evaluation / `'meet'` \| `'exceed'` / the routed `type` \| `null` | — / `'meet'` / `null` | The check being overridden; a count or fixed-range check renders no line. |
  | `dcOverride` / `adjustmentOverride` / `anchorDc` | number \| `null` / number \| `null` / number | `null` / `null` / `15` | The subject's overrides and the system DC a fixed target falls back to. |
  | `actors` / `resolveCharacter(id)` | `[{ id, name, img }]` / `{ name, rollData }` \| `null` | `[]` / `() => null` | The Preview-as roster and the lookup for the chosen actor's roll data. |

  Invariants:
  - The chosen character is transient preview state, never draft data; it starts at "No actor".
-->
<script>
  import Kicker from '../../../components/Kicker.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import PreviewAsPicker from '../checks/PreviewAsPicker.svelte';
  import { NO_ACTOR_ID } from '../checks/previewActorId.js';
  import { overridePlayerSees } from './overridePlayerSees.js';

  let {
    subject = '',
    evaluation,
    thresholdMode = 'meet',
    type = null,
    dcOverride = null,
    adjustmentOverride = null,
    anchorDc = 15,
    actors = [],
    resolveCharacter = () => null,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let actorId = $state(NO_ACTOR_ID);
  const character = $derived(actorId === NO_ACTOR_ID ? null : resolveCharacter(actorId));
  const seen = $derived(
    overridePlayerSees({
      subject,
      evaluation,
      thresholdMode,
      type,
      dcOverride,
      adjustmentOverride,
      anchorDc,
      character,
      text,
    })
  );
</script>

{#if seen.line}
  <div class="manager-override-player-sees" data-override-player-sees={seen.state}>
    <div class="manager-override-player-sees-head">
      <Kicker as="span">
        {text('FABRICATE.Admin.Manager.Checks.PlayerSees.Title', 'Player sees')}
      </Kicker>
      {#if seen.readsCharacter}
        <PreviewAsPicker
          {actors}
          value={actorId}
          triggerData={{ 'data-override-preview-actor': '' }}
          onChoose={(id) => (actorId = id)}
        />
      {/if}
    </div>
    <p class="manager-override-player-sees-line" data-override-player-sees-line>
      <i class="fas fa-dice" aria-hidden="true"></i>
      <span>{seen.line}</span>
    </p>
    {#if seen.note}
      <p class="manager-muted manager-override-player-sees-note" data-override-player-sees-note>
        {seen.note}
      </p>
    {/if}
  </div>
{/if}

<style>
  .manager-override-player-sees {
    display: flex;
    flex: 1 1 100%;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .manager-override-player-sees-head {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
  }

  .manager-override-player-sees-line {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    margin: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
    color: var(--fab-text-secondary);
    font-weight: 500;
    font-size: 0.72rem;
  }

  .manager-override-player-sees-line i {
    color: var(--fab-accent);
    font-size: 0.69rem;
  }

  .manager-override-player-sees-note {
    margin: 0;
    font-size: 0.66rem;
  }
</style>
