/**
 * The one table of an iterative status's words, tone and glyph: "Needs iterative setup",
 * "N blocking" or "Ready". The Recipes library row, the recipe editor header and the Crafting
 * Action editor header all read it, so the three draw one meaning one way.
 */
import { fill } from '../../../../../utils/fillPlaceholders.js';
import { statusChipTone } from '../../../util/statusChipTone.js';

/** Per status: its lang key and English, its library pill id, and its pill-vocabulary tone and glyph. */
export const ITERATIVE_STATUS = Object.freeze({
  setup: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Recipe.Iterative.StatusSetup',
    fallback: 'Needs iterative setup',
    pill: 'iterativeSetup',
    tone: 'warning',
    icon: 'fas fa-flag',
  }),
  blocking: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Iterative.StatusBlocking',
    fallback: '{count} blocking',
    pill: 'iterativeBlocking',
    tone: 'danger',
    icon: 'fas fa-circle-xmark',
  }),
  ready: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Iterative.StatusReady',
    fallback: 'Ready',
    pill: 'iterativeReady',
    tone: 'success',
    icon: 'fas fa-circle-check',
  }),
});

/** The table's entry for `id`, or `null` for any other. */
export const iterativeStatusEntry = (id) =>
  Object.hasOwn(ITERATIVE_STATUS, id ?? '') ? ITERATIVE_STATUS[id] : null;

/** `{ id, label, tone, icon }` for `status`, its tone in `Chip`'s vocabulary, or `null` for none. */
export function iterativeStatusChip(status, text) {
  const entry = iterativeStatusEntry(status?.id);
  if (!entry) return null;
  const label = fill(text(entry.key, entry.fallback), { count: status.count ?? 0 });
  return { id: status.id, label, tone: statusChipTone(entry.tone), icon: entry.icon };
}
