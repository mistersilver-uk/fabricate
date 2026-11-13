/**
 * The seam's accessible-name checks over every manifest entry that declares `waivedBy` or
 * `contains` (issue 2882): M9 reads white space alone as empty on a `text` key a name must contain,
 * and M22 sees a name only as a non-blank string, a name of any other kind being dropped from the
 * validated copy so the component draws the label's own name. Entries are derived from the
 * manifest, so a new one is held without a list here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';
import { PREFIX, copyProps } from '../src/ui/publishedComponentProps.js';

const named = (entry) =>
  Object.entries(entry.props).filter(([, spec]) => spec.contains !== undefined);

const NAMED_ENTRIES = PUBLISHED_COMPONENT_MANIFEST.filter(
  (entry) =>
    named(entry).length > 0 ||
    Object.values(entry.props).some((spec) => spec.waivedBy !== undefined)
);

/** Props that satisfy every required key but the ones a case sets. */
function required(entry) {
  const props = {};
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.required !== true) continue;
    props[key] = spec.kind === 'callback' ? () => {} : spec.kind === 'text' ? 'Shown' : 'x';
  }
  return props;
}

const refusing = (message) => ({ name: 'TypeError', message: PREFIX + message });
const BLANKS = Object.freeze(['', ' ', '\t \n']);
const NOT_STRINGS = Object.freeze([true, false, 0, {}, ['Shown'], null]);

describe('the entries whose name the seam holds (issue 2882)', () => {
  it('derives Button, Chip, SelectionCheckbox, StatusToggle and Popover from the manifest', () => {
    const names = NAMED_ENTRIES.map((entry) => entry.name);
    for (const expected of ['Button', 'Chip', 'SelectionCheckbox', 'StatusToggle', 'Popover']) {
      assert.ok(names.includes(expected), expected);
    }
  });

  it('has no entry whose name key is also required, since the drop runs after M9', () => {
    for (const entry of NAMED_ENTRIES) {
      for (const [nameKey] of named(entry)) {
        assert.notEqual(entry.props[nameKey].required, true, `${entry.name} ${nameKey}`);
      }
    }
  });

  for (const entry of NAMED_ENTRIES) {
    for (const [nameKey, { contains: textKey }] of named(entry)) {
      describe(`${entry.name} ${nameKey} against ${textKey}`, () => {
        const { waivedBy } = entry.props[textKey];
        const waivers = Object.fromEntries((waivedBy ?? []).map((key) => [key, 'Held']));

        for (const blank of BLANKS) {
          const label = JSON.stringify(blank);
          it(`M9: refuses a ${textKey} of ${label} beside no name`, () => {
            const props = { ...required(entry), [textKey]: blank };
            assert.throws(
              () => copyProps(entry, props),
              refusing(`${entry.name} requires a non-empty "${textKey}"`)
            );
          });

          if (waivedBy === undefined) continue;
          it(`takes a ${textKey} of ${label} beside a name, and draws it as absent`, () => {
            const props = { ...required(entry), ...waivers, [textKey]: blank };
            const copy = copyProps(entry, props);
            assert.equal(copy[textKey], undefined);
            assert.equal(copy[nameKey], 'Held');
          });
        }

        it('M9: still takes a non-blank text with no name (negative control)', () => {
          const copy = copyProps(entry, { ...required(entry), [textKey]: 'Shown' });
          assert.equal(copy[textKey], 'Shown');
        });

        for (const value of [...BLANKS, ...NOT_STRINGS]) {
          const label = JSON.stringify(value) ?? String(value);
          it(`drops a ${nameKey} of ${label}, so no name overrides the label`, () => {
            const copy = copyProps(entry, {
              ...required(entry),
              [textKey]: 'Shown',
              [nameKey]: value,
            });
            assert.equal(copy[textKey], 'Shown');
            assert.equal(copy[nameKey], undefined);
          });
        }

        it('M22: keeps a name that holds the text and still refuses one that does not (negative control)', () => {
          const base = { ...required(entry), [textKey]: 'Shown' };
          assert.equal(copyProps(entry, { ...base, [nameKey]: 'Shown now' })[nameKey], 'Shown now');
          assert.throws(
            () => copyProps(entry, { ...base, [nameKey]: 'Elsewhere' }),
            refusing(
              `"${nameKey}" must contain the text of "${textKey}" ("Shown" is not in "Elsewhere")`
            )
          );
        });
      });
    }
  }
});

const NAME_KEYS = Object.freeze(['ariaLabel', 'label', 'title', 'legend']);
const namedBy = (entry) =>
  new Set(
    Object.values(entry.props)
      .map(({ contains }) => contains)
      .filter((key) => key !== undefined)
  );

/** Each `required` name key of `entry` with no `contains` partner, `waivedBy` or `waivedWhen`. */
const bareNameKeys = (entry) =>
  Object.entries(entry.props)
    .filter(
      ([key, spec]) =>
        NAME_KEYS.includes(key) &&
        spec.required === true &&
        !namedBy(entry).has(key) &&
        spec.waivedBy === undefined &&
        spec.waivedWhen === undefined
    )
    .map(([key]) => key);

const BARE_ENTRIES = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => bareNameKeys(entry).length > 0);

describe('the required name keys with no contains partner (issue 2924)', () => {
  it('derives the entries from the manifest, the ones the issue names among them', () => {
    const names = BARE_ENTRIES.map((entry) => entry.name);
    for (const expected of [
      'SegmentedControl',
      'Stepper',
      'Typeahead',
      'Select',
      'Pagination',
      'ActionMenu',
      'Modal',
      'ToggleCard',
    ]) {
      assert.ok(names.includes(expected), expected);
    }
  });

  for (const entry of BARE_ENTRIES) {
    for (const key of bareNameKeys(entry)) {
      describe(`${entry.name} ${key}`, () => {
        const refused = [...BLANKS.filter((value) => value !== ''), ...NOT_STRINGS];
        for (const value of refused) {
          it(`M9: refuses ${JSON.stringify(value)}, which would write no name or a wrong one`, () => {
            assert.throws(
              () => copyProps(entry, { ...required(entry), [key]: value }),
              refusing(`${entry.name} requires a non-blank string "${key}"`)
            );
          });
        }

        it('still refuses an empty or absent one as before, and takes a non-blank string', () => {
          assert.throws(
            () => copyProps(entry, { ...required(entry), [key]: '' }),
            refusing(`${entry.name} requires a non-empty "${key}"`)
          );
          const without = required(entry);
          delete without[key];
          assert.throws(() => copyProps(entry, without), /requires a non-empty/);
          assert.equal(copyProps(entry, { ...required(entry), [key]: 'Reward' })[key], 'Reward');
        });
      });
    }
  }
});
