/**
 * `salvageCheckUsability` — the SINGLE derivation of "which salvage check is active, and
 * is it usable" (issue 859).
 *
 * The pair `(salvageResolutionMode, salvageCraftingCheck[mode].rollFormula)` was being
 * derived independently in five places, and they had ALREADY drifted: the engine's check
 * runner tested the formula with raw truthiness while the builder and the whole crafting
 * path tested it trimmed, so a whitespace-only formula rolled `"   "` for the engine and
 * read as "no check" for the player's panel.
 *
 * ## The no-op half comes FIRST, deliberately
 *
 * Most of this extraction must change nothing. Pinning the unchanged answers before the
 * two intended changes is what makes the changes legible as changes rather than as
 * whatever the new module happens to return.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasCheckFormula, resolveSalvageCheck } from '../src/systems/salvageCheckUsability.js';

/** A system authored in `mode` with `rollFormula` on THAT mode's sub-config. */
const systemFor = (mode, rollFormula, extra = {}) => ({
  salvageResolutionMode: mode,
  salvageCraftingCheck: { [mode]: { rollFormula, ...extra } },
});

const MODES = ['simple', 'routed', 'progressive'];

// ---------------------------------------------------------------------------
// THE NO-OP HALF. Every tuple below is what `InventoryListingBuilder._buildSalvage`
// already computed before the extraction, per mode, with and without a formula.
// ---------------------------------------------------------------------------

describe('resolveSalvageCheck: the builder tuple, unchanged, for every mode', () => {
  for (const mode of MODES) {
    it(`${mode} WITH an authored formula`, () => {
      const config = { rollFormula: '1d20 + 3', dc: 15 };
      const system = { salvageResolutionMode: mode, salvageCraftingCheck: { [mode]: config } };
      const resolved = resolveSalvageCheck(system);

      assert.equal(resolved.mode, mode);
      assert.equal(resolved.config, config, "the mode's OWN sub-config, by identity");
      assert.equal(resolved.rollFormula, '1d20 + 3');
      assert.equal(resolved.checkUsable, true);
      assert.equal(resolved.unsupportedMode, false);
    });

    it(`${mode} with NO formula`, () => {
      const resolved = resolveSalvageCheck(systemFor(mode, ''));

      assert.equal(resolved.mode, mode);
      assert.equal(resolved.rollFormula, '', 'never null or undefined');
      assert.equal(resolved.checkUsable, false);
      assert.equal(resolved.unsupportedMode, false);
    });
  }

  it('defaults an ABSENT mode token to simple', () => {
    const resolved = resolveSalvageCheck({
      salvageCraftingCheck: { simple: { rollFormula: '1d20' } },
    });
    assert.equal(resolved.mode, 'simple');
    assert.equal(resolved.checkUsable, true);
    assert.equal(resolved.unsupportedMode, false, 'absent is not unsupported');
  });

  it('reports a null config, not a throw, when the mode has no sub-config at all', () => {
    for (const system of [
      { salvageResolutionMode: 'routed' },
      { salvageResolutionMode: 'routed', salvageCraftingCheck: {} },
      {
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: { simple: { rollFormula: '1d20' } },
      },
      null,
      undefined,
    ]) {
      const resolved = resolveSalvageCheck(system);
      assert.equal(resolved.config, null, JSON.stringify(system));
      assert.equal(resolved.checkUsable, false);
      assert.equal(resolved.rollFormula, '');
    }
  });

  it('reads `salvageCraftingCheck`, NEVER the recipe `craftingCheck` block', () => {
    // Both exist and both are typically authored, so reading the wrong one renders and
    // rolls plausibly while using a formula and a DC salvage never configured.
    const resolved = resolveSalvageCheck({
      salvageResolutionMode: 'simple',
      craftingCheck: { simple: { rollFormula: '1d20 + 99', dc: 30 } },
      salvageCraftingCheck: { simple: { rollFormula: '2d6', dc: 7 } },
    });
    assert.equal(resolved.rollFormula, '2d6');
    assert.equal(resolved.config.dc, 7);
  });

  it('marks routed and progressive as REQUIRING a check, and simple as not', () => {
    // `requiresCheck && !checkUsable` is the misconfiguration the engine aborts on with
    // zero mutation; a simple mode with no formula is a guaranteed no-check success.
    assert.equal(resolveSalvageCheck(systemFor('simple', '')).requiresCheck, false);
    assert.equal(resolveSalvageCheck(systemFor('routed', '')).requiresCheck, true);
    assert.equal(resolveSalvageCheck(systemFor('progressive', '')).requiresCheck, true);
  });
});

describe('hasCheckFormula: the promoted predicate answers identically at its OWN call sites', () => {
  // The predicate was promoted out of `CraftingEngine._hasCheckFormula`, whose ONLY two
  // call sites are the `mode === 'alchemy'` guards of `_runCraftingCheck` — the alchemy
  // `simple` and `tiered` sub-configs of `system.craftingCheck`. Those are the shapes it
  // has to keep answering identically for the promotion to be a pure move; the mainline
  // crafting readers use raw truthiness and are NOT covered by it.
  const ALCHEMY_CONFIGS = [
    {
      label: 'alchemy simple, authored',
      config: { rollFormula: '1d20 + @abilities.int.mod' },
      expected: true,
    },
    { label: 'alchemy simple, empty', config: { rollFormula: '' }, expected: false },
    { label: 'alchemy simple, absent key', config: {}, expected: false },
    {
      label: 'alchemy tiered, authored',
      config: { rollFormula: '1d20', type: 'relative' },
      expected: true,
    },
    {
      label: 'alchemy tiered, empty',
      config: { rollFormula: '', type: 'relative' },
      expected: false,
    },
    { label: 'alchemy tiered, null sub-config', config: null, expected: false },
    { label: 'alchemy tiered, undefined sub-config', config: undefined, expected: false },
  ];

  for (const testCase of ALCHEMY_CONFIGS) {
    it(`${testCase.label} -> ${testCase.expected}`, () => {
      assert.equal(hasCheckFormula(testCase.config), testCase.expected);
    });
  }

  it('is false for every non-string formula, never truthy-coerced', () => {
    for (const rollFormula of [null, undefined, 0, 1, true, {}, [], ['1d20']]) {
      assert.equal(hasCheckFormula({ rollFormula }), false, JSON.stringify(rollFormula));
    }
  });

  it('is the SAME predicate `resolveSalvageCheck` gates `checkUsable` on', () => {
    // One notion of a "usable" check, shared by the crafting and salvage paths. Two
    // predicates that agreed today and drifted tomorrow is the defect this promotion
    // closes, so the agreement is asserted rather than assumed.
    for (const rollFormula of ['1d20', '', '   ', '\t\n', '0', undefined, null]) {
      assert.equal(
        resolveSalvageCheck(systemFor('simple', rollFormula)).checkUsable,
        hasCheckFormula({ rollFormula }),
        JSON.stringify(rollFormula)
      );
    }
  });
});

// ---------------------------------------------------------------------------
// THE TWO STATED BEHAVIOUR CHANGES.
// ---------------------------------------------------------------------------

describe('change 1 — a WHITESPACE-ONLY formula is not a check', () => {
  it('reads as unusable, bringing salvage into line with crafting', () => {
    // Before: `_runSalvageCraftingCheck` used raw truthiness, so `"   "` reached `Roll`,
    // threw inside the runner, and surfaced as a rolled (CONSUMING) failure — while the
    // player's panel, which trimmed, showed no check at all. Unifying on trimmed is
    // alignment with the crafting path, not a new global constraint.
    for (const rollFormula of ['   ', '\t', '\n', ' \t\n ']) {
      const resolved = resolveSalvageCheck(systemFor('simple', rollFormula));
      assert.equal(resolved.checkUsable, false, JSON.stringify(rollFormula));
      assert.equal(resolved.rollFormula, '', 'and it is normalized away, not passed on');
    }
  });

  it('turns whitespace-only SIMPLE into a guaranteed no-check success', () => {
    const resolved = resolveSalvageCheck(systemFor('simple', '   '));
    assert.equal(resolved.checkUsable, false);
    assert.equal(resolved.requiresCheck, false, 'no check required, so the salvage succeeds');
  });

  it('turns whitespace-only ROUTED and PROGRESSIVE into a misconfiguration', () => {
    for (const mode of ['routed', 'progressive']) {
      const resolved = resolveSalvageCheck(systemFor(mode, '   '));
      assert.equal(resolved.checkUsable, false);
      assert.equal(resolved.requiresCheck, true, `${mode}: required && unusable = misconfigured`);
    }
  });

  it('TRIMS an authored formula rather than passing the padding through', () => {
    assert.equal(resolveSalvageCheck(systemFor('simple', '  1d20 + 3  ')).rollFormula, '1d20 + 3');
  });
});

describe('change 2 — an unsupported mode, BOTH halves of the contract', () => {
  // The two halves do different jobs, and a test asserting only the flag passes against
  // an implementation that returns the raw token and silently breaks the builder:
  //
  //  - `mode: 'simple'` is the COERCION that keeps `_buildSalvage`'s projection
  //    byte-identical, so a display-only consumer renders something rather than nothing;
  //  - `unsupportedMode: true` is what the three MUTATING engine readers guard on BEFORE
  //    reading `mode`, because acting on the coerced `simple` would award
  //    `resultGroups[0]` for a configuration `validateSalvage` already reports invalid.
  const UNSUPPORTED = [
    'tiered',
    'mapped',
    'Simple',
    'SIMPLE',
    'routedByCheck',
    'alchemy',
    'nonsense',
  ];

  for (const token of UNSUPPORTED) {
    it(`"${token}" reports mode: 'simple' AND unsupportedMode: true`, () => {
      const resolved = resolveSalvageCheck({
        salvageResolutionMode: token,
        salvageCraftingCheck: { simple: { rollFormula: '1d20' } },
      });
      assert.equal(resolved.unsupportedMode, true, 'the flag the mutating readers guard on');
      assert.equal(resolved.mode, 'simple', 'the coercion that keeps the projection intact');
    });
  }

  it('the coercion is real: the tuple is byte-identical to a genuine simple system', () => {
    // If the resolver returned the raw token instead, this deep-equal would red — which
    // is the assertion that a flag-only test cannot make.
    const authored = { rollFormula: '1d20 + 3', dc: 12 };
    const unsupported = resolveSalvageCheck({
      salvageResolutionMode: 'tiered',
      salvageCraftingCheck: { simple: authored },
    });
    const genuine = resolveSalvageCheck({
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { simple: authored },
    });
    assert.deepEqual(
      { ...unsupported, unsupportedMode: false },
      genuine,
      'everything except the flag matches a real simple system'
    );
  });

  it('is a DEFENSIVE GUARD, not a fix — every supported token clears it', () => {
    // The salvage token normalizer and the 1.4.0 migration rewrite the legacy spellings,
    // so a token outside the set is a config defect rather than a legacy value. The same
    // posture `ResolutionModeService.validateSalvage` takes, which guards the identical
    // case despite the normalizer claiming to have removed it.
    for (const mode of MODES) {
      assert.equal(resolveSalvageCheck(systemFor(mode, '1d20')).unsupportedMode, false, mode);
    }
    assert.equal(resolveSalvageCheck({}).unsupportedMode, false, 'and so does an absent token');
  });

  it('still resolves the simple sub-config, so a coerced read is not also blank', () => {
    const resolved = resolveSalvageCheck({
      salvageResolutionMode: 'mapped',
      salvageCraftingCheck: { simple: { rollFormula: '2d6' }, routed: { rollFormula: '1d20' } },
    });
    assert.equal(resolved.rollFormula, '2d6', 'the coerced mode picks the SIMPLE sub-config');
    assert.equal(resolved.checkUsable, true);
  });
});

describe('resolveSalvageCheck is pure', () => {
  it('never mutates the system it is handed', () => {
    const system = {
      salvageResolutionMode: 'tiered',
      salvageCraftingCheck: { simple: { rollFormula: '  1d20  ' } },
    };
    const before = JSON.stringify(system);
    resolveSalvageCheck(system);
    assert.equal(JSON.stringify(system), before, 'the trim is applied to the RETURN, not in place');
  });

  it('returns a fresh object every call, so a consumer cannot poison the next', () => {
    const system = systemFor('simple', '1d20');
    const first = resolveSalvageCheck(system);
    first.checkUsable = false;
    assert.equal(resolveSalvageCheck(system).checkUsable, true);
  });
});

// ── the retirement shim, applied BEFORE the emptiness test (issue 1094) ─────
//
// These exist because rewriting `resolveSalvageCheck` to skip the shim entirely left the
// whole 622-test file green. Salvage never AUTHORED the retired placeholder, so nothing
// else in this suite could notice — but an imported bundle can carry one, and the whole
// point of the shim here is that readiness and the roll path cannot disagree about it.
describe('resolveSalvageCheck applies the retirement shim before its emptiness test', () => {
  it('reports a placeholder-only formula as NOT usable', () => {
    const resolved = resolveSalvageCheck(systemFor('simple', '@craftingmod'));
    assert.equal(resolved.rollFormula, '');
    assert.equal(
      resolved.checkUsable,
      false,
      'otherwise it reports usable, reaches evaluateCheckRoll and throws inside new Roll("")'
    );
  });

  it('reports the POST-shim formula, not the authored one', () => {
    const resolved = resolveSalvageCheck(systemFor('simple', '1d20 + @craftingmod'));
    assert.equal(resolved.rollFormula, '1d20', 'the placeholder and its operator are gone');
    assert.equal(resolved.checkUsable, true);
  });

  it('reports a placement the shim refuses as NOT usable', () => {
    for (const formula of ['1d20 * @craftingmod', 'max(@craftingmod, 2)', '(2 + @craftingmod)d6']) {
      assert.equal(resolveSalvageCheck(systemFor('simple', formula)).checkUsable, false, formula);
    }
  });

  // The pair that MUTATES on this answer: `requiresCheck && !checkUsable` is the
  // misconfiguration the engine aborts on with zero mutation, so a shim-emptied formula
  // has to reach it exactly as a blank one does.
  for (const mode of ['routed', 'progressive']) {
    it(`pairs requiresCheck with the post-shim usability on ${mode}`, () => {
      const resolved = resolveSalvageCheck(systemFor(mode, '@craftingmod'));
      assert.equal(resolved.mode, mode);
      assert.equal(resolved.requiresCheck, true, `${mode} cannot resolve without a rolled outcome`);
      assert.equal(resolved.checkUsable, false);
      assert.equal(
        resolved.requiresCheck && !resolved.checkUsable,
        true,
        'so the engine takes its zero-mutation abort rather than rolling'
      );
    });
  }

  // `hasCheckFormula` is the RAW predicate and stays raw on purpose: it answers "did the
  // GM author anything", which the shim must not repaint, and `resolveSalvageCheck` is
  // where the post-shim reading is composed.
  it('leaves hasCheckFormula reading the authored field', () => {
    assert.equal(hasCheckFormula({ rollFormula: '@craftingmod' }), true, 'authored, but unusable');
    assert.equal(resolveSalvageCheck(systemFor('simple', '@craftingmod')).checkUsable, false);
  });
});
