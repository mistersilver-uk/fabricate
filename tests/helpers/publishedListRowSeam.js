/**
 * A suite's published `ListRow` through `publishedEntrySeam` (issues 2850 and 2851). Calling it
 * registers the suite's hooks, which assert that nothing escaped the seam and nothing was reported.
 */
import { publishedEntrySeam } from './publishedEntrySeam.js';

/** The suite's `mountRow(props)`, over `name`, as `{ target, handle, row(), button(), mark() }`. */
export function publishedListRowSeam(tmpPrefix, name) {
  const { ui, mountEntry } = publishedEntrySeam(tmpPrefix);

  function mountRow(props = {}) {
    const { target, handle } = mountEntry('ListRow', { name, ...props });
    return {
      target,
      handle,
      row: () => target.querySelector('.fabricate-list-row'),
      button: () => target.querySelector('button.fabricate-list-row-open'),
      mark: () => target.querySelector('.fab-medallion'),
    };
  }

  return { ui, mountRow };
}
