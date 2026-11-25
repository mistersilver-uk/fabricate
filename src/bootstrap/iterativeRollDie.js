/**
 * The edge die an Iterative Attempt's effect dice and start formulas draw from: Foundry's own
 * uniform generator, read on every call so a generator a module installs after boot is used.
 */

/** `rollDie(faces)` answers an integer in `[1, faces]`, and throws for a generator or face count it cannot use. */
export function createFoundryRollDie(randomUniform = () => CONFIG.Dice.randomUniform()) {
  return (faces) => {
    if (!Number.isSafeInteger(faces) || faces < 1) {
      throw new RangeError(`A die needs a positive whole number of faces, not ${faces}`);
    }
    const u = randomUniform();
    if (!Number.isFinite(u) || u < 0 || u >= 1) {
      throw new RangeError(`The dice generator answered ${u}, outside [0, 1)`);
    }
    return Math.ceil((1 - u) * faces);
  };
}
