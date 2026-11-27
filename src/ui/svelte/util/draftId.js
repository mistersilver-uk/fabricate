import { randomId } from '../../../utils/randomId.js';

/** A fresh id for a draft entry: Foundry's own where it is loaded, else 16 base-36 characters. */
export function newDraftId() {
  return randomId();
}
