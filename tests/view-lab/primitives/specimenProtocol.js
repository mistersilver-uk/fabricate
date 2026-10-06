/**
 * The `postMessage` protocol between `mount.js` (the parent page) and `specimenMount.js` (one
 * specimen iframe), shared so a rename cannot hang the handshake. Order: the iframe posts READY,
 * the parent replies ASSIGN with the row, the iframe posts MOUNTED once (counted), then RESIZE any
 * number of times, or ERROR instead of MOUNTED. Both ends target `location.origin`.
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
