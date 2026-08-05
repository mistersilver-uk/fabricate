/**
 * Resolving a linked Macro for an authoring surface (issue 1036).
 *
 * Lifted out of `SimpleCraftingCheckEditor`, whose dynamic-DC macro card was the only place
 * in the repo that resolved a macro uuid for display, and moved here because the essence
 * editor's property-macro card needs the identical two behaviours and a second copy would
 * drift. It lives under `src/utils/` rather than `src/ui/svelte/util/`, which neither
 * `npm run lint` nor `format:check` covers while SonarCloud still indexes it.
 *
 * Foundry is reached ONLY through `globalThis.fromUuid`, never through an import: this
 * module is loaded by mounted component tests and by the Vite build alike, and importing a
 * Foundry global would make it unloadable outside a live world.
 */

/** Why a dropped macro was refused. `null` means it was accepted. */
export const MACRO_DROP_REJECTED_MISSING = 'missing';
export const MACRO_DROP_REJECTED_NOT_SCRIPT = 'not-script';

/**
 * Resolve a macro uuid to a display NAME, cancellably.
 *
 * Two behaviours, both lifted verbatim because both are load-bearing:
 *
 * - **the `globalThis.fromUuid` indirection with a raw-uuid fallback.** Outside a live
 *   world — a mounted component test, the View Lab, a Vite dev render — there is no
 *   resolver at all, and the uuid itself is then the best available label. Reporting
 *   "not found" there would paint every linked macro as broken in every screenshot.
 * - **the `cancelled` latch.** Resolution is async and the linked uuid can change while a
 *   lookup is in flight, so without it a slow lookup of the OLD uuid lands after a fast
 *   lookup of the new one and the card ends up naming a macro that is no longer linked.
 *
 * @param {?string} uuid
 * @param {(state: {name: string, missing: boolean}) => void} onResolved called at most once
 *   per non-cancelled call. `missing` is true only on a PROVEN miss — a resolver that ran
 *   and returned nothing, or threw.
 * @returns {() => void} a cancel function. Call it from the caller's effect teardown; after
 *   it runs, `onResolved` will not be called.
 */
export function resolveMacroName(uuid, onResolved) {
  const linked = String(uuid || '').trim();
  if (!linked) {
    onResolved({ name: '', missing: false });
    return () => {};
  }

  const resolve = globalThis.fromUuid;
  if (typeof resolve !== 'function') {
    onResolved({ name: linked, missing: false });
    return () => {};
  }

  let cancelled = false;
  Promise.resolve(resolve(linked))
    .then((doc) => {
      if (cancelled) return;
      if (doc) onResolved({ name: doc.name || linked, missing: false });
      else onResolved({ name: '', missing: true });
    })
    .catch(() => {
      if (!cancelled) onResolved({ name: '', missing: true });
    });

  return () => {
    cancelled = true;
  };
}

/**
 * Whether a dropped macro uuid may be LINKED as an executable macro.
 *
 * This is the `type !== 'script'` rejection, and it deliberately does NOT live in a drop
 * predicate. A drag payload's `type` is the DOCUMENT NAME (`'Macro'`), not the macro's own
 * type, and reading the macro's type needs `await fromUuid` — which a synchronous predicate
 * cannot do. So the predicate accepts a Macro document and the handler decides whether that
 * macro is runnable.
 *
 * It matters more than the shipped result-macro precedent suggests: Foundry defaults a NEW
 * Macro to `type: 'chat'`, so a GM who creates a macro, pastes JavaScript into it and never
 * changes the type produces exactly this payload — and `MacroExecutor.run` guards only that
 * `command` is a string, so a chat macro would be executed as if it were a script and its
 * text would be posted rather than run.
 *
 * FAILS OPEN when there is no resolver. Outside a live world nothing can be checked, and
 * refusing every drop there would make the control untestable and unusable in the View Lab
 * while proving nothing about real data.
 *
 * The caller warns. This module returns a REASON rather than raising a notification,
 * because `ui.notifications` is a Foundry global and a leaf that reached for one could not
 * be unit-tested — and because the copy belongs to the surface, not to the check.
 *
 * @param {?string} uuid
 * @returns {Promise<{accepted: boolean, uuid: string, name: string, reason: ?string}>}
 */
export async function evaluateMacroDrop(uuid) {
  const linked = String(uuid || '').trim();
  if (!linked) {
    return { accepted: false, uuid: '', name: '', reason: MACRO_DROP_REJECTED_MISSING };
  }

  const resolve = globalThis.fromUuid;
  if (typeof resolve !== 'function') {
    return { accepted: true, uuid: linked, name: linked, reason: null };
  }

  let doc;
  try {
    doc = await resolve(linked);
  } catch {
    // A pack that is offline, or a malformed uuid, is a MISS rather than an exception: this
    // runs inside a drop handler, and a rejection there would surface as an unhandled
    // promise rejection with no user-visible cause.
    doc = null;
  }
  if (!doc) {
    return { accepted: false, uuid: linked, name: '', reason: MACRO_DROP_REJECTED_MISSING };
  }
  if (doc.type !== 'script') {
    return {
      accepted: false,
      uuid: linked,
      name: doc.name || linked,
      reason: MACRO_DROP_REJECTED_NOT_SCRIPT,
    };
  }
  return { accepted: true, uuid: linked, name: doc.name || linked, reason: null };
}
