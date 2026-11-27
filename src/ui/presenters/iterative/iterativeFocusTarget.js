/**
 * Where focus goes after a press settles (issue 3011, D-3): the pressed card while it is enabled,
 * else the begin control, else the first enabled card, else the first control of the detail pane.
 */
import { arrayOrEmpty } from '../../../utils/scalars.js';

/** @returns {{ kind: 'card', actionId: string } | { kind: 'begin' } | { kind: 'detail' }} */
export function iterativeFocusTarget(run, actionId) {
  const cards = arrayOrEmpty(run?.iterative?.cards);
  if (cards.find((card) => card.actionId === actionId)?.enabled) return { kind: 'card', actionId };
  if (run?.actions?.beginStep === true) return { kind: 'begin' };
  const first = cards.find((card) => card.enabled);
  return first ? { kind: 'card', actionId: first.actionId } : { kind: 'detail' };
}
