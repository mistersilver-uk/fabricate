import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_RISKS,
  riskClass,
  riskLabel,
  biomeChipStyle,
  toPercent,
  descriptionOrDefault
} from '../../src/ui/svelte/util/gatheringFormat.js';

// An echo `localize` so assertions read against the resolved keys/formatting.
const localize = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);

describe('gatheringFormat', () => {
  describe('KNOWN_RISKS', () => {
    it('holds exactly the six gathering risk tiers', () => {
      assert.deepEqual(
        [...KNOWN_RISKS],
        ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']
      );
    });
  });

  describe('riskClass', () => {
    it('maps a known tier to its risk-<value> class', () => {
      assert.equal(riskClass('safe'), 'risk-safe');
      assert.equal(riskClass('extreme'), 'risk-extreme');
    });

    it('returns an empty string for an unknown or empty value', () => {
      assert.equal(riskClass('weird'), '');
      assert.equal(riskClass(''), '');
    });
  });

  describe('riskLabel', () => {
    it('localizes a known tier via the Detail.Risk key', () => {
      assert.equal(riskLabel('hazardous', localize), 'FABRICATE.App.Gathering.Detail.Risk.hazardous');
      assert.equal(riskLabel('safe', localize), 'FABRICATE.App.Gathering.Detail.Risk.safe');
    });

    it('returns an unknown value verbatim', () => {
      assert.equal(riskLabel('custom-level', localize), 'custom-level');
    });

    it('preserves the empty-string arm (no danger pip)', () => {
      assert.equal(riskLabel('', localize), '');
    });
  });

  describe('biomeChipStyle', () => {
    it('uses a valid 6-digit hex customColor when present', () => {
      assert.equal(
        biomeChipStyle({ customColor: '#0aF1c2', colorToken: 'forest' }),
        '--fab-chip-color: #0aF1c2'
      );
    });

    it('falls back to the colorToken var when the hex is missing or malformed', () => {
      assert.equal(
        biomeChipStyle({ colorToken: 'forest' }),
        '--fab-chip-color: var(--fab-tag-forest)'
      );
      assert.equal(
        biomeChipStyle({ customColor: '#fff', colorToken: 'forest' }),
        '--fab-chip-color: var(--fab-tag-forest)'
      );
    });

    it('strips a --fab-tag- prefix from the token and defaults to sage', () => {
      assert.equal(
        biomeChipStyle({ colorToken: '--fab-tag-moss' }),
        '--fab-chip-color: var(--fab-tag-moss)'
      );
      assert.equal(biomeChipStyle({}), '--fab-chip-color: var(--fab-tag-sage)');
      assert.equal(biomeChipStyle(null), '--fab-chip-color: var(--fab-tag-sage)');
    });
  });

  describe('toPercent', () => {
    it('clamps a 0-1 fraction to an integer percent', () => {
      assert.equal(toPercent(0), 0);
      assert.equal(toPercent(0.5), 50);
      assert.equal(toPercent(1), 100);
      assert.equal(toPercent(0.123), 12);
    });

    it('clamps out-of-range values into [0, 100]', () => {
      assert.equal(toPercent(-0.4), 0);
      assert.equal(toPercent(2), 100);
    });

    it('treats non-numeric / NaN input as 0', () => {
      assert.equal(toPercent(NaN), 0);
      assert.equal(toPercent('not-a-number'), 0);
      assert.equal(toPercent(null), 0);
      assert.equal(toPercent(undefined), 0);
    });
  });

  describe('descriptionOrDefault', () => {
    it('returns the description when present', () => {
      assert.equal(
        descriptionOrDefault('A mossy glade.', 'FALLBACK.Key', localize),
        'A mossy glade.'
      );
    });

    it('localizes the fallback key when the description is empty or absent', () => {
      assert.equal(descriptionOrDefault('', 'FALLBACK.Key', localize), 'FALLBACK.Key');
      assert.equal(descriptionOrDefault(null, 'FALLBACK.Key', localize), 'FALLBACK.Key');
      assert.equal(descriptionOrDefault(undefined, 'FALLBACK.Key', localize), 'FALLBACK.Key');
    });
  });
});
