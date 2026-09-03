/**
 * The `postMessage` protocol between `mount.js` (the parent page) and `specimenMount.js` (one
 * specimen iframe).
 *
 * A SHARED module rather than two independently-spelled copies, unlike `data-primitive-lab-*` —
 * that attribute is spelled twice on purpose because its two readers are a browser bundle and a
 * `node:fs` script that cannot import one (see `LiveSpecimen.svelte`'s docblock). Both halves of
 * THIS protocol are browser bundles served by the same Vite instance, so nothing stops them
 * sharing one module, and letting them drift would mean a rename on one side silently stops the
 * other from ever resolving — the handshake would hang, forever, with nothing on the page saying
 * why.
 *
 * ── THE FIVE MESSAGES, IN THE ORDER THEY ARE SENT ─────────────────────────────────────────────
 *
 *   iframe  → parent   READY     "my module has run and I'm listening." Sent once, immediately.
 *   parent  → iframe   ASSIGN    the one catalogue row this iframe stands up, `{row}`. The only
 *                                message the parent ever sends; everything else flows the other
 *                                way.
 *   iframe  → parent   MOUNTED   the component mounted and its first size is known, `{width,
 *                                height}`. Read as BOTH "count this specimen" and "size the
 *                                iframe" — sent exactly once per iframe.
 *   iframe  → parent   RESIZE    the mounted content changed size after MOUNTED already fired
 *                                (e.g. a web font swap) — `{width, height}`, sent zero or more
 *                                times, and never counted again.
 *   iframe  → parent   ERROR     mounting failed, `{message, width, height}`. The width/height are
 *                                a fallback box big enough to show the printed error, since a
 *                                failed specimen never reaches MOUNTED and has no measured size.
 *
 * `targetOrigin` is always `window.location.origin` on both ends — the lab is same-origin with
 * itself by construction, and a wildcard target would accept a message from a document this page
 * never opened.
 */

/** The iframe's module has run and is listening for its assignment. */
export const SPECIMEN_READY = 'primitive-lab-specimen-ready';

/** The parent hands the iframe the one catalogue row it stands up. */
export const SPECIMEN_ASSIGN = 'primitive-lab-specimen-assign';

/** The specimen mounted; carries its first measured `{width, height}`. Counted once. */
export const SPECIMEN_MOUNTED = 'primitive-lab-specimen-mounted';

/** The mounted specimen's measured size changed again. Never counted. */
export const SPECIMEN_RESIZE = 'primitive-lab-specimen-resize';

/** The specimen failed to mount; carries `{message}` plus a fallback `{width, height}`. */
export const SPECIMEN_ERROR = 'primitive-lab-specimen-error';
