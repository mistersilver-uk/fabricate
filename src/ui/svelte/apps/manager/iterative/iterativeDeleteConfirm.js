/**
 * The confirmation before a Counter is deleted, through the manager's `confirmDialog`. The body is
 * HTML, so every name and use is escaped; an unused Counter confirms with no list.
 */
import { esc } from '../../../../presenters/htmlEscape.js';
import { interpolate } from '../checks/checksCopy.js';

import { counterUseLines } from './iterativeCounterCopy.js';
import { usageCounts } from './iterativeLibraryModel.js';

function confirmBody({ name, uses, text }) {
  const counts = usageCounts(uses);
  const total = counts.actions + counts.steps;
  if (total === 0) {
    return `<p>${esc(
      interpolate(
        text(
          'FABRICATE.Admin.Manager.Iterative.DeleteCounterUnused',
          '{name} is not used by any action or recipe step yet.'
        ),
        { name }
      )
    )}</p>`;
  }
  const key =
    total === 1
      ? 'FABRICATE.Admin.Manager.Iterative.DeleteCounterUsedOne'
      : 'FABRICATE.Admin.Manager.Iterative.DeleteCounterUsed';
  const lead = total === 1 ? '{name} is used in 1 place:' : '{name} is used in {count} places:';
  const lines = counterUseLines(uses, text)
    .map((line) => `<li>${esc(line)}</li>`)
    .join('');
  const consequence = text(
    'FABRICATE.Admin.Manager.Iterative.DeleteCounterConsequence',
    'Each will need another counter. Workpieces in progress are not affected.'
  );
  return `<p>${esc(interpolate(text(key, lead), { name, count: total }))}</p><ul>${lines}</ul><p>${esc(consequence)}</p>`;
}

/**
 * @param {object} seams
 * @param {Function|undefined} seams.confirmDialog The manager services' confirm.
 * @param {Function} seams.text `(key, fallback)` localizer.
 * @param {{ id: string, label: string }} seams.counter The Counter to delete.
 * @param {{ actions: object[], steps: object[] }} seams.uses Where it is used.
 * @returns {Promise<boolean>} `true` only when the GM confirmed.
 */
export async function confirmCounterDelete({ confirmDialog, text, counter, uses }) {
  const name = counter.label || counter.id;
  const confirmed = await confirmDialog?.({
    title: interpolate(
      text('FABRICATE.Admin.Manager.Iterative.DeleteCounterTitle', 'Delete {name}?'),
      {
        name,
      }
    ),
    content: confirmBody({ name, uses, text }),
    yes: {
      label: text('FABRICATE.Admin.Manager.Delete', 'Delete'),
      callback: () => true,
    },
    no: { callback: () => false },
  });
  return confirmed === true;
}
