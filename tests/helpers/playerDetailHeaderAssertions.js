/** Assertions over the identity row a player detail pane leads with (`PlayerDetailHeader`). */
import assert from 'node:assert/strict';

const PRIMARY_SELECTOR = [
  '.manager-button.is-primary',
  'button.is-primary',
  '[data-crafting-craft]:not(.is-ghost)',
  '[data-gathering-attempt]',
].join(', ');
// An inline `background` or `background-color` on the accent or success fill (not `-soft` etc.).
const PRIMARY_FILL_STYLE = /background(?:-color)?\s*:[^;]*var\(\s*--fab-(?:accent|success)\s*[,)]/u;

/**
 * Every primary action rendered under `root`: a `Button role="primary"`, a hand-rolled
 * `.is-primary` button, a Craft verb that is not a ghost, a gathering Attempt, or a button whose
 * inline style fills it with the accent or success colour. happy-dom computes no cascade, so a
 * fill reached only through a stylesheet rule is not seen.
 */
export const primaryButtons = (root) => {
  const filled = [...root.querySelectorAll('button[style], [role="button"][style]')].filter(
    (element) => PRIMARY_FILL_STYLE.test(element.getAttribute('style'))
  );
  return [...new Set([...root.querySelectorAll(PRIMARY_SELECTOR), ...filled])];
};

/**
 * Assert `pane` leads with one identity row carrying one `h2` and a tile on its ladder's rung (38 for a record, 32 for a portrait), that the row holds
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
  const rung = tile.classList.contains('fab-avatar') ? 32 : 38;
  assert.match(
    tile.getAttribute('style'),
    new RegExp(String.raw`width:\s*${rung}px;\s*height:\s*${rung}px`, 'u'),
    'at the art ladder’s 38, or the portrait ladder’s 32'
  );

  assert.equal(primaryButtons(row).length, primaries, 'primaries in the identity row');
  assert.equal(
    primaryButtons(pane).length,
    primaries + outside,
    'primaries in the whole pane, so none hides in a body'
  );
  return row;
}
