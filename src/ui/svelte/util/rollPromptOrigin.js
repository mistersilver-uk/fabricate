/** The Fabricate window a roll was started from, held while the action it started runs. */
import { APPLICATION_HOST_SELECTOR } from './overlayHost.js';

const activeOrigins = [];

/**
 * Run `action` with the Fabricate root `event` was dispatched in as the host of every roll prompt
 * it opens, whatever the input device: a keyboard activation leaves neither focus nor the pointer
 * on that window once the button disables itself. Resolves with the action's own result.
 */
export async function withRollPromptOrigin(event, action) {
  const entry = { root: event?.target?.closest?.(APPLICATION_HOST_SELECTOR) ?? null };
  activeOrigins.push(entry);
  try {
    return await action();
  } finally {
    activeOrigins.splice(activeOrigins.indexOf(entry), 1);
  }
}

/** The root of the most recently started action still running, or `null`. */
export function activeRollPromptOrigin() {
  return activeOrigins.at(-1)?.root ?? null;
}
