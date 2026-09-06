/**
 * THE TONE MAP IS TOTAL, AND EVERY VALUE IT NAMES IS A TONE `Chip` ACTUALLY PAINTS (issue 1506).
 *
 * The map exists because the two components disagree about an unrecognised tone in opposite
 * SILENT directions: the retired pill resolved one to `subtle`, and `Chip` drops it — no class,
 * no error, no failing test. So the failure this file has to be able to see is not "the mapper
 * threw", it is "the mapper returned a name `Chip` will quietly ignore".
 *
 * That is why the expectation is DERIVED from `Chip.svelte`'s own `TONES` literal — through the
 * shared reader `tests/helpers/chipTone.js`, which the converted suites use to read a rendered
 * chip's tone off the same vocabulary — rather than typed here: a hand-typed list of `Chip`'s tones is a second copy of the vocabulary, and a copy
 * cannot see the original change. `Chip` survives this change, so reading it from disk is a
 * landed assertion rather than a transient one — the retired pill is NOT read here for exactly
 * that reason, since this same phase deletes it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  statusChipTone,
  STATUS_CHIP_TONES,
  STATUS_CHIP_TONE_FALLBACK,
} from '../src/ui/svelte/util/statusChipTone.js';

import { CHIP_TONES } from './helpers/chipTone.js';

/**
 * The whole domain, pinned by NAME rather than by count. Both retired vocabularies are in it:
 * the status pill's six, and the look-alike badges' `neutral` — which the journal's cancelled
 * run and the crafting badge's locked recipe emit, and which the pill never had.
 */
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
