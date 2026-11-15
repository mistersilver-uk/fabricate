/**
 * Class-set assertions for a mounted element (issue 1555). A primitive's root class is its own
 * suite's to pin; every other suite asks which classes the element carries, not the order or
 * spelling of the `class` attribute, so a primitive that reorders or adds a token does not
 * redden suites that are about something else.
 */
import assert from 'node:assert/strict';

/** @returns {string[]} the whitespace-separated tokens of `value`, sorted and de-duplicated */
const tokens = (value) =>
  [...new Set(String(value).split(/\s+/u).filter(Boolean))].sort((left, right) =>
    left < right ? -1 : Number(left > right)
  );

/**
 * Assert an element carries EXACTLY the classes in `expected`, in any order.
 *
 * @param {Element} element The mounted node.
 * @param {string} expected Space-separated class tokens.
 * @param {string} [message] The assertion message.
 */
export function assertClassSet(element, expected, message) {
  assert.deepEqual(tokens(element.className), tokens(expected), message);
}
