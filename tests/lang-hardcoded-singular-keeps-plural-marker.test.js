import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lang = JSON.parse(readFileSync(path.join(here, '..', 'lang', 'en.json'), 'utf8'));

/**
 * Walk the nested lang tree to `dotted.key -> value` pairs.
 *
 * @param {object} node Current subtree.
 * @param {string} prefix Dotted path accumulated so far.
 * @yields {[string, unknown]} Key/value pair.
 */
function* entries(node, prefix = '') {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      yield* entries(value, prefix ? `${prefix}.${key}` : key);
    }
    return;
  }
  yield [prefix, node];
}

// The `(s)` idiom is this corpus's accepted shorthand for a count that VARIES — "{count}
// recipe(s)" is fine because the number is interpolated and could be anything. A `…One`
// sibling exists precisely so the SINGULAR case can be written out properly, so a hardcoded
// literal `1` beside a `(s)` marker is the two conventions colliding: it renders "1 recipe(s)",
// which is the ugliest possible reading of a string whose whole reason to exist is that it
// handles one gracefully.
//
// Issue 1156 shipped exactly that twice ("1 recipe(s) that requires it") while fixing a verb
// agreement in the same sentence — the verb was split into a `…One` key and the plural marker
// was carried across with it.
const HARDCODED_ONE_WITH_PLURAL_MARKER = /\b1 [A-Za-z][A-Za-z ]*?\(s\)/;

describe('1156/lang a hardcoded singular does not also carry the plural marker', () => {
  it('finds no string that renders "1 <noun>(s)"', () => {
    const offenders = [];
    for (const [key, value] of entries(lang)) {
      if (typeof value !== 'string') continue;
      const hit = HARDCODED_ONE_WITH_PLURAL_MARKER.exec(value);
      if (hit) offenders.push(`${key}: ${JSON.stringify(hit[0])} in ${JSON.stringify(value)}`);
    }
    assert.deepEqual(
      offenders,
      [],
      `a literal 1 beside a "(s)" marker renders "1 recipe(s)"; write the noun out singular:\n${offenders.join('\n')}`
    );
  });

  it('would catch the defect it was written for', () => {
    // Non-vacuity: the pattern must actually fire on the string that motivated the gate, or a
    // green result above proves nothing. See the repo's standing rule that a mechanical check is
    // worthless until it has been shown able to fail.
    assert.match(
      'Delete essence {name}? 1 recipe(s) that requires it will be rewritten.',
      HARDCODED_ONE_WITH_PLURAL_MARKER
    );
    assert.doesNotMatch(
      'Delete essence {name}? 1 recipe that requires it will be rewritten.',
      HARDCODED_ONE_WITH_PLURAL_MARKER
    );
    // And it must not fire on the legitimate interpolated form.
    assert.doesNotMatch(
      'Delete essence {name}? {recipes} recipe(s) that require it will be rewritten.',
      HARDCODED_ONE_WITH_PLURAL_MARKER
    );
  });
});
