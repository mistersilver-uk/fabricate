/**
 * THE TONE MAP IS TOTAL, AND EVERY VALUE IT NAMES IS A TONE `Chip` ACTUALLY PAINTS (issue 1506).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  statusChipTone,
  STATUS_CHIP_TONES,
  STATUS_CHIP_TONE_FALLBACK,
} from '../src/ui/svelte/util/statusChipTone.js';

import { CHIP_TONES } from './helpers/chipTone.js';

/** The whole domain, pinned by NAME rather than by count. */
const DOMAIN = ['subtle', 'success', 'accent', 'danger', 'warning', 'info', 'neutral'];

describe('statusChipTone', () => {
  it('accepts BOTH retired vocabularies and nothing else', () => {
    assert.deepEqual(
      Object.keys(STATUS_CHIP_TONES).toSorted((a, b) => a.localeCompare(b)),
      DOMAIN.toSorted((a, b) => a.localeCompare(b)),
      'the domain is the pill six plus the look-alikes` `neutral`; a name added here without a caller is dead API, and one removed silently drops a converted site to the fallback'
    );
  });

  it('maps every accepted name onto a tone Chip actually paints', () => {
    const painted = CHIP_TONES;
    const unpainted = Object.entries(STATUS_CHIP_TONES).filter(
      ([, chipTone]) => !painted.has(chipTone)
    );
    assert.deepEqual(
      unpainted,
      [],
      'a mapped value Chip does not declare renders an untoned chip: no class, no error, no failing test anywhere else'
    );
    assert.ok(
      painted.has(STATUS_CHIP_TONE_FALLBACK),
      'and the fallback is painted too, or an unmapped name renders worse than it did before'
    );
  });

  it('renames the ONE name the two vocabularies spell differently', () => {
    assert.equal(
      statusChipTone('success'),
      'positive',
      '`success` is not a Chip tone — this is the rename the whole map exists for'
    );
    for (const name of ['subtle', 'accent', 'danger', 'warning', 'info', 'neutral']) {
      assert.equal(statusChipTone(name), name, `${name} is spelled the same on both sides`);
    }
  });

  it('is TOTAL: an unrecognised name resolves to the fallback the retired pill used', () => {
    for (const name of ['', 'positive', 'primary', 'succeeded', undefined, null]) {
      assert.equal(
        statusChipTone(name),
        'subtle',
        `${String(name)} must render the pill's own fallback rather than an untoned chip`
      );
    }
  });

  it('treats a prototype key as a miss rather than as a mapping', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      assert.equal(
        statusChipTone(name),
        'subtle',
        `${name} is not a tone, and a bare property read would have returned a function for it`
      );
    }
  });
});
