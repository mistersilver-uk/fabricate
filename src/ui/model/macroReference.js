/** Resolving a linked Macro for an authoring surface (issue 1036). */

/** Why a dropped macro was refused. */
export const MACRO_DROP_REJECTED_MISSING = 'missing';
export const MACRO_DROP_REJECTED_NOT_SCRIPT = 'not-script';

/** Resolve a macro uuid to a display NAME, cancellably. */
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

/** Whether a dropped macro uuid may be LINKED as an executable macro. */
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
    // A pack that is offline, or a malformed uuid, is a MISS rather than an exception: this runs
    // inside a drop handler, and a rejection there would surface as an unhandled promise rejection
    // with no user-visible cause.
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
