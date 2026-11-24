/**
 * A scripted die source for the iterative resolver: `rollDie(faces)` answers the next scripted value,
 * records every requested `faces`, and throws once the script is spent unless `fill` is given
 * (a number, or a function of `faces`). `assertDrained()` fails while scripted values remain.
 */
export function scriptedRollDie(values = [], { fill } = {}) {
  const requested = [];
  let next = 0;
  const rollDie = (faces) => {
    requested.push(faces);
    if (next < values.length) return values[next++];
    if (fill === undefined) throw new Error(`the die script is spent (asked for d${faces})`);
    return typeof fill === 'function' ? fill(faces) : fill;
  };
  return {
    rollDie,
    requested,
    assertDrained() {
      if (next < values.length) {
        throw new Error(`${values.length - next} scripted die value(s) were never drawn`);
      }
    },
  };
}
