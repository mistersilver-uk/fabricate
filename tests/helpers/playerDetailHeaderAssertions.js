/** Assertions over the identity row a player detail pane leads with (`PlayerDetailHeader`). */
import assert from 'node:assert/strict';

/**
 * Every primary-styled or craft action rendered under `root`: a `ManagerButton role="primary"`, a
 * hand-rolled `.is-primary` button, or any Craft verb that is not a ghost.
 */
export const primaryButtons = (root) => [
  ...root.querySelectorAll(
    '.manager-button.is-primary, button.is-primary, [data-crafting-craft]:not(.is-ghost)'
  ),
];

/**
 * Assert `pane` leads with one identity row carrying one `h2` and a 38px tile, that the row holds
 * exactly `primaries` primary buttons, and that the pane draws none beyond it. `outside` is for
 * the journal's run action bar beside the row, whose primary issue 1644 owns.
 *
 * @returns {Element} The identity row.
 */
export function assertIdentityHeader(pane, { primaries, outside = 0, name = undefined }) {
  const rows = pane.querySelectorAll('[data-player-detail-header]');
  assert.equal(rows.length, 1, 'the pane has exactly one identity row');
  const [row] = rows;

  const headings = row.querySelectorAll('h2');
  assert.equal(headings.length, 1, 'the identity row names its record on exactly one h2');
  if (name !== undefined) assert.equal(headings[0].textContent, name);

  const tile = row.querySelector('.fab-medallion, .fab-avatar');
  assert.ok(Boolean(tile), 'the identity row leads with an art tile');
  assert.match(
    tile.getAttribute('style'),
    /width:\s*38px;\s*height:\s*38px/u,
    'at the art ladder’s 38'
  );

  assert.equal(primaryButtons(row).length, primaries, 'primaries in the identity row');
  assert.equal(
    primaryButtons(pane).length,
    primaries + outside,
    'primaries in the whole pane, so none hides in a body'
  );
  return row;
}
