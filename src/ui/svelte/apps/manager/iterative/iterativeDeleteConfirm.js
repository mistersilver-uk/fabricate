/**
 * The confirmation before a Counter or Crafting Action is deleted, through the manager's
 * `confirmDialog`. The body is HTML, so every name and use is escaped; an unused entry confirms with
 * no list. Every key is a literal, because `lang-keys-no-orphans` cannot see a built one.
 */
import { esc } from '../../../../presenters/htmlEscape.js';
import { interpolate } from '../checks/checksCopy.js';

import { counterUseLines } from './iterativeCounterCopy.js';
import { usageCounts } from './iterativeLibraryModel.js';

const DELETE = ['FABRICATE.Admin.Manager.Delete', 'Delete'];

const COUNTER_COPY = (text) => ({
  kind: 'counter',
  title: text('FABRICATE.Admin.Manager.Iterative.DeleteCounterTitle', 'Delete {name}?'),
  unused: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteCounterUnused',
    '{name} is not used by any action or recipe step yet.'
  ),
  usedOne: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteCounterUsedOne',
    '{name} is used in 1 place:'
  ),
  used: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteCounterUsed',
    '{name} is used in {count} places:'
  ),
  consequence: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteCounterConsequence',
    'Each will need another counter. Workpieces in progress are not affected.'
  ),
});

const ACTION_COPY = (text) => ({
  kind: 'action',
  title: text('FABRICATE.Admin.Manager.Iterative.DeleteActionTitle', 'Delete {name}?'),
  unused: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteActionUnused',
    'No recipe step or rule names {name} yet.'
  ),
  usedOne: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteActionUsedOne',
    '{name} is named in 1 place:'
  ),
  used: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteActionUsed',
    '{name} is named in {count} places:'
  ),
  consequence: text(
    'FABRICATE.Admin.Manager.Iterative.DeleteActionConsequence',
    'Each will need another action. Workpieces in progress are not affected.'
  ),
});

function confirmBody({ name, uses, text, copy }) {
  const counts = usageCounts(uses);
  const total = counts.actions + counts.steps;
  if (total === 0) return `<p>${esc(interpolate(copy.unused, { name }))}</p>`;
  const lead = total === 1 ? copy.usedOne : copy.used;
  const lines = counterUseLines(uses, text)
    .map((line) => `<li>${esc(line)}</li>`)
    .join('');
  return `<p>${esc(interpolate(lead, { name, count: total }))}</p><ul data-iterative-delete-uses="${copy.kind}">${lines}</ul><p>${esc(copy.consequence)}</p>`;
}

async function confirmDelete({ confirmDialog, text, entry, uses, copyOf }) {
  const name = entry.label || entry.id;
  const copy = copyOf(text);
  const confirmed = await confirmDialog?.({
    title: interpolate(copy.title, { name }),
    content: confirmBody({ name, uses, text, copy }),
    yes: { label: text(...DELETE), callback: () => true },
    no: { callback: () => false },
  });
  return confirmed === true;
}

/**
 * @param {object} seams
 * @param {Function|undefined} seams.confirmDialog The manager services' confirm.
 * @param {Function} seams.text `(key, fallback)` localizer.
 * @param {{ id: string, label: string }} seams.counter The Counter to delete.
 * @param {{ actions: object[], steps: object[] }} seams.uses Where it is used.
 * @returns {Promise<boolean>} `true` only when the GM confirmed.
 */
export const confirmCounterDelete = ({ counter, ...rest }) =>
  confirmDelete({ ...rest, entry: counter, copyOf: COUNTER_COPY });

/**
 * As {@link confirmCounterDelete}, for a Crafting Action: the steps that allow it and the rules
 * that name it are listed.
 */
export const confirmActionDelete = ({ action, ...rest }) =>
  confirmDelete({ ...rest, entry: action, copyOf: ACTION_COPY });
