/**
 * The chip an iterative recipe's status draws, from `iterativeStatusPill`'s answer: "Needs
 * iterative setup", "N blocking" or "Ready", each with its tone and glyph.
 */
import { fill } from '../../../../../utils/fillPlaceholders.js';

const STATUS_CHIPS = Object.freeze({
  setup: {
    key: 'FABRICATE.Admin.Manager.Recipe.Iterative.StatusSetup',
    fallback: 'Needs iterative setup',
    tone: 'warning',
    icon: 'fas fa-flag',
  },
  blocking: {
    key: 'FABRICATE.Admin.Manager.Recipe.Iterative.StatusBlocking',
    fallback: '{count} blocking',
    tone: 'danger',
    icon: 'fas fa-circle-xmark',
  },
  ready: {
    key: 'FABRICATE.Admin.Manager.Recipe.Iterative.StatusReady',
    fallback: 'Ready',
    tone: 'positive',
    icon: 'fas fa-circle-check',
  },
});

/** `{ id, label, tone, icon }` for `status`, or `null` for none. */
export function iterativeStatusChip(status, text) {
  const chip = status ? STATUS_CHIPS[status.id] : null;
  if (!chip) return null;
  const label = fill(text(chip.key, chip.fallback), { count: status.count ?? 0 });
  return { id: status.id, label, tone: chip.tone, icon: chip.icon };
}
