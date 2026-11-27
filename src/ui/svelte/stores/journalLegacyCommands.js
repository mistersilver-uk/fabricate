/**
 * The Journal's commands that never reach the versioned run authority: a legacy run's advance and
 * cancel, and a terminal entry's dismissal. Each holds the journal's one busy key through
 * `claimBusy` while it runs, then reloads the listing once its own write settles.
 */
import { journalCommandRefusal } from '../../presenters/additionalDicePrompt.js';

/** Notifies each non-empty message in turn. */
export function notifyEach(services, messages) {
  for (const message of messages) if (message) services?.notify?.(message);
}

/** A legacy cancel's one toast: its message, else a refusal's localized reason, never a Retry. */
function legacyCancelNotice(result, services) {
  const generic = result?.success === false ? services?.craftErrorMessage?.() : '';
  return journalCommandRefusal(result, services?.localize, generic);
}

/**
 * @param {object} options
 * @param {object} options.services the player services
 * @param {(runKey: string, runId: string) => (() => void) | null} options.claimBusy
 * @param {(run: object) => string} options.runKeyOf
 * @param {() => object|null} options.getListing the journal's current listing
 * @param {(quiet?: boolean) => Promise<void>} options.load
 */
export function createLegacyRunCommands({ services, claimBusy, runKeyOf, getListing, load }) {
  /** Runs `act` under the busy key, reporting a throw as the shipped craft error. */
  async function whileBusy(run, label, act, { reloadOnError = false } = {}) {
    const release = run?.id ? claimBusy(runKeyOf(run), run.id) : null;
    if (!release) return;
    try {
      await act();
    } catch (error) {
      console.error(`Fabricate | Error ${label}:`, error);
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
      if (reloadOnError) await load(true);
    } finally {
      release();
    }
  }

  const actorId = () => getListing()?.selectedActorId ?? null;

  return {
    advance: (run) =>
      whileBusy(run, 'advancing a crafting run', async () => {
        const result = await services?.advanceCraftingRun?.({
          actorId: actorId(),
          runId: run.id,
          interactive: true,
        });
        if (result?.cancelled === true) return;
        if (result?.message) services?.notify?.(result.message);
        await load(true);
      }),
    cancel: (run) =>
      whileBusy(run, 'cancelling a crafting run', async () => {
        const result = await services?.cancelCraftingRun?.({ actorId: actorId(), runId: run.id });
        notifyEach(services, [legacyCancelNotice(result, services)]);
        await load(true);
      }),
    // Refresh only after the user-scoped dismissal write settles; actor history remains intact.
    dismiss: (run) =>
      run?.actions?.dismiss === true
        ? whileBusy(
            run,
            'dismissing a Journal run',
            async () => {
              const result = await services?.dismissJournalRun?.({
                actorUuid: run.actorUuid ?? getListing()?.selectedActorUuid ?? null,
                runType: run.runType,
                runId: run.id,
              });
              if (result?.message) services?.notify?.(result.message);
              await load(true);
            },
            { reloadOnError: true }
          )
        : undefined,
  };
}
