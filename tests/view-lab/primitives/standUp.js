/**
 * The order the Primitive Lab stands its specimens up in (issue 2307). Every slot is placed and
 * measured first, in catalogue order, so no measurement depends on which load finishes first; the
 * loads then run a bounded few at a time.
 */
import { mapInPool } from '../../../scripts/lib/viewLabRenderPool.js';

/** What a specimen's load settles as when its document never announced ready. */
export const SILENT = 'silent';

/**
 * Place every slot, then load them through a pool of `poolSize`. A load that goes silent before any
 * specimen has announced ready means the graph every specimen shares is broken, so no further load
 * is started and one problem names how many were skipped.
 *
 * @param {object[]} slots The resolved slots, in catalogue order.
 * @param {{place: (slot: object) => object, load: (placed: object, onReady: () => void) =>
 *   Promise<string|undefined>, poolSize: number, problems: string[]}} stage `place` is synchronous;
 *   `load` calls `onReady` on READY and settles as {@link SILENT} when READY never came.
 */
export async function standUpSlots(slots, { place, load, poolSize, problems }) {
  const placed = slots.map((slot) => place(slot));
  let ready = 0;
  let stopped = false;
  let notLoaded = 0;
  await mapInPool(placed, poolSize, async (specimen) => {
    if (stopped) {
      notLoaded += 1;
      return;
    }
    const outcome = await load(specimen, () => {
      ready += 1;
    });
    if (outcome === SILENT && ready === 0) stopped = true;
  });
  if (notLoaded === 0) return;
  problems.push(
    `${notLoaded} specimens were not loaded: the first to settle never announced ready and none ` +
      "has, so specimen.html's own module graph failed to compile or import, or the browser " +
      'refused its requests (the dev server log or the console names the cause).'
  );
}
