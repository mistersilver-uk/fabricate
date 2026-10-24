/**
 * An optimistic hold on a radio group's value while its save is in flight (issue 2601).
 *
 * `latestRequestHold(write)` answers `hold(next, save)`: it writes `next`, calls `save`, and writes
 * `''` once that save settles, unless a later `hold` began meanwhile, so an earlier save settling
 * never releases a later press, a repeated press of the same value included. A save that throws or
 * rejects releases its hold too, and is reported with `console.error`.
 *
 * @param {(held: string) => void} write
 * @returns {(next: string, save: () => unknown) => void}
 */
export function latestRequestHold(write) {
  let latest = 0;
  return (next, save) => {
    const request = ++latest;
    const release = () => {
      if (request === latest) write('');
    };
    write(next);
    new Promise((resolve) => resolve(save())).then(release, (error) => {
      release();
      console.error(error);
    });
  };
}
