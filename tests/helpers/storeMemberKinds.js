/** The public-shape pin the four player-store suites share (issue 1673). */
import { byCodePoint } from './ratchetBaseline.js';

/** Every member's kind, read through its descriptor so no getter is invoked. */
export function storeMemberKinds(store) {
  const entries = Object.keys(store)
    .sort(byCodePoint)
    .map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(store, key);
      return [key, descriptor.get ? 'getter' : typeof descriptor.value];
    });
  return Object.fromEntries(entries);
}

/** The same map from a hand-written roster split by kind. */
export function expectedMemberKinds({ getters, methods }) {
  const entries = [
    ...getters.map((key) => [key, 'getter']),
    ...methods.map((key) => [key, 'function']),
  ].sort(([left], [right]) => byCodePoint(left, right));
  return Object.fromEntries(entries);
}
