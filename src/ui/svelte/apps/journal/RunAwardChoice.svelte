<!--
  The award face (issue 1773): each reward a run still owes as an `award` slot of the requirement
  chooser, the picks held here until confirm sends one `chooseAward`, and after the last settle a
  focusable success notice naming what was claimed.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `run` | `RunModel` | `null` | Reads `awardChoices`, `awardChoiceBlocker`, `actions.chooseAward` and `recoveryEvidence`. |
  | `journal` | journal store | `null` | Its `chooseAward(run, { choiceId, picks })` sends the settle. |

  Invariants:
  - The first owed choice's confirm is the stage's only primary; a viewer who may not settle sees
    read-only tiles and no confirm, and a run awaiting recovery draws nothing here.
  - A held pick counts only while it is claimable, and a refused confirm drops the choice's picks.
  - After a settle focus moves to the next owed choice's first open tile, else to the notice
    naming what was claimed, or that the choice closed without a reward, never to the document.
    Pinned by `tests/components/run-detail-mounted.test.js`.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../components/Button.svelte';
  import Notice from '../../components/Notice.svelte';
  import RequirementChooser from '../../components/RequirementChooser.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { journalRunReasonMessage } from '../../util/journalRunReasons.js';
  import {
    awardPip,
    awardSlot,
    canConfirm,
    claimableIds,
    confirmLabel,
    nextAwardPicks,
  } from '../../../presenters/awardChoiceRows.js';

  let { run = null, journal = null } = $props();

  let root = $state(null);
  let held = $state({});
  // What this face settled on the run, so its notice survives the reload that drops the choice.
  let settled = $state({ runKey: null, claimed: [] });

  const runKey = $derived(String(run?.key ?? run?.id ?? ''));
  const choices = $derived(
    run?.recoveryEvidence?.required === true ? [] : (run?.awardChoices ?? [])
  );
  const readOnly = $derived(run?.awardChoiceBlocker === 'notOwner');
  const blockerText = $derived(
    readOnly
      ? localize('FABRICATE.App.Journal.AwardChoice.ReadOnly')
      : journalRunReasonMessage(run?.awardChoiceBlocker, localize)
  );
  const busy = $derived(String(journal?.busyRunKey ?? '') === runKey && runKey !== '');
  const claimedText = $derived(settled.claimed.join(' · '));

  const choiceKey = (choice) => `${runKey}:${choice.stepIndex}:${choice.choiceId}`;
  const picksOf = (choice) =>
    (held[choiceKey(choice)] ?? []).filter((id) => claimableIds(choice).includes(id));
  const dropHeld = (key) => {
    held = Object.fromEntries(Object.entries(held).filter(([entry]) => entry !== key));
  };

  function choose(choice, alternative) {
    if (readOnly) return;
    held = {
      ...held,
      [choiceKey(choice)]: nextAwardPicks(choice, picksOf(choice), alternative.id),
    };
  }

  /** The picks by name and amount, as the notice after the last settle names them. */
  const pickedNames = (choice, picks) =>
    (choice.alternatives ?? [])
      .filter((alternative) => picks.includes(alternative.id))
      .map((alternative) => `${alternative.name} ${awardPip(alternative)}`.trim());

  async function confirm(choice) {
    const picks = picksOf(choice);
    const key = choiceKey(choice);
    const result = await journal?.chooseAward?.(run, { choiceId: choice.choiceId, picks });
    dropHeld(key);
    if (result?.success !== true) return;
    const earlier = settled.runKey === runKey ? settled.claimed : [];
    settled = { runKey, claimed: [...earlier, ...pickedNames(choice, picks)] };
    await tick();
    await tick();
    const next = root?.querySelector('[data-award-choice-id] button[aria-pressed]:not([disabled])');
    (next ?? root?.querySelector('[data-award-claimed]'))?.focus();
  }
</script>

{#if choices.length > 0 || settled.runKey === runKey}<div
    class="run-award-choice"
    bind:this={root}
    data-award-face
  >
    {#each choices as choice, index (choiceKey(choice))}
      {@const picks = picksOf(choice)}
      <section class="run-award-choice-entry" data-award-choice-id={choice.choiceId}>
        <RequirementChooser
          slots={[awardSlot(choice, picks, localize)]}
          {readOnly}
          onChoose={(_slot, alternative) => choose(choice, alternative)}
        />
        {#if claimableIds(choice).length === 0}<p class="run-award-choice-note">
            {localize('FABRICATE.App.Journal.AwardChoice.ForfeitDetail')}
          </p>{/if}
        {#if blockerText}<p
            class="run-award-choice-note"
            data-award-blocker={run?.awardChoiceBlocker}
          >
            {blockerText}
          </p>{/if}
        {#if !readOnly}
          <div class="run-award-choice-actions">
            <Button
              role={index === 0 ? 'primary' : 'neutral'}
              disabled={busy || run?.actions?.chooseAward !== true || !canConfirm(choice, picks)}
              aria-busy={busy || undefined}
              data-award-confirm={choice.choiceId}
              onclick={() => confirm(choice)}
            >
              <i class="fas fa-gift" aria-hidden="true"></i>
              {confirmLabel(choice, picks, localize)}
            </Button>
          </div>
        {/if}
      </section>
    {/each}
    {#if choices.length === 0}
      <!-- The focus target after the last settle: what was claimed, or that nothing was. -->
      <div tabindex="-1" data-keyboard-focus="true" data-award-claimed>
        <Notice
          tone={claimedText ? 'success' : 'info'}
          title={localize(
            claimedText
              ? 'FABRICATE.App.Journal.AwardChoice.Claimed'
              : 'FABRICATE.App.Journal.AwardChoice.ClosedEmpty'
          )}
          detail={claimedText}
          data-award-outcome={claimedText ? 'claimed' : 'forfeited'}
        />
      </div>
    {/if}
  </div>{/if}

<style>
  .run-award-choice,
  .run-award-choice-entry {
    display: grid;
    gap: var(--fab-space-2);
  }

  .run-award-choice-note {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .run-award-choice-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
