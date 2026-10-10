/**
 * The `postMessage` protocol between `mount.js` (the parent page) and `specimenMount.js` (one
 * specimen iframe), shared so a rename cannot hang the handshake. Order: the iframe posts READY,
 * the parent replies ASSIGN with the row, the iframe posts MOUNTED once (counted), then RESIZE any
 * number of times, or ERROR instead of MOUNTED. Both ends target `location.origin`. A fixture with
 * an `act` asks for a turn before acting and ends it after (issue 2339), and later answers RECHECK.
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

/** A fixture asks to run its `act`; the parent grants one turn at a time. */
export const SPECIMEN_ACT_REQUEST = 'primitive-lab-specimen-act-request';

/** The parent grants the asking specimen its act turn. */
export const SPECIMEN_ACT_GRANT = 'primitive-lab-specimen-act-grant';

/** The specimen's act settled, either way; the next turn may start. */
export const SPECIMEN_ACT_DONE = 'primitive-lab-specimen-act-done';

/** The parent asks an acted specimen whether its `reached(root)` still holds. */
export const SPECIMEN_RECHECK = 'primitive-lab-specimen-recheck';

/** The specimen's answer to RECHECK; carries `{reached}`. */
export const SPECIMEN_REACHED = 'primitive-lab-specimen-reached';

/**
 * The parent's act turns: one specimen acts at a time, in the order they asked, so no act's
 * events land while another's state is still being reached.
 *
 * @returns {{request: (id: unknown, grant: () => void) => void, release: (id: unknown) => void}}
 *   `request` queues `grant`, called when the turn is the asker's; `release` ends the holder's
 *   turn or withdraws a waiting request, so a specimen that errors never holds the queue.
 */
export function createActTurns() {
  const waiting = [];
  let holder = null;
  const next = () => {
    if (holder !== null || waiting.length === 0) return;
    const [id, grant] = waiting.shift();
    holder = id;
    grant();
  };
  return {
    request(id, grant) {
      waiting.push([id, grant]);
      next();
    },
    release(id) {
      if (holder === id) {
        holder = null;
        next();
        return;
      }
      const index = waiting.findIndex(([waiter]) => waiter === id);
      if (index !== -1) waiting.splice(index, 1);
    },
  };
}
