/** Deterministic replacements for every source of entropy a Fabricate render can reach. */

/** 2026-06-01T12:00:00Z — a fixed "now" for every lab render. */
export const LAB_EPOCH_MS = 1_780_315_200_000;

/**
 * mulberry32: small, fast, and — the only property that matters here — exactly reproducible from
 * a seed across engines.
 *
 * @param {number} seed Initial state.
 * @returns {() => number} A `Math.random`-shaped generator.
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Install seeded, monotonic replacements for the realm's entropy and clock.
 *
 * @param {object} [options] Options.
 * @param {number} [options.seed] PRNG seed; the same seed yields the same frames.
 * @param {number} [options.epochMs] Fixed wall-clock time.
 */
export function installLabRandom({ seed = 20_260_601, epochMs = LAB_EPOCH_MS } = {}) {
  const random = mulberry32(seed);

  let idCounter = 0;
  const randomID = (length = 16) => {
    idCounter += 1;
    // Counter-derived rather than PRNG-derived: ids stay stable even if an unrelated change
    // alters how many times something else draws from the generator.
    const suffix = String(idCounter).padStart(6, '0');
    let out = 'lab';
    for (let i = out.length + suffix.length; i < length; i++) {
      out += ID_ALPHABET[(idCounter * 31 + i * 17) % ID_ALPHABET.length];
    }
    return `${out}${suffix}`.slice(0, Math.max(length, 9));
  };

  const originals = {
    random: Math.random,
    now: Date.now,
    Date: globalThis.Date,
    randomUUID: globalThis.crypto?.randomUUID,
    performanceNow: globalThis.performance?.now?.bind(globalThis.performance),
  };

  Math.random = random;
  Date.now = () => epochMs;

  // `new Date()` with no arguments must also be pinned; a component formatting "now" would
  // otherwise render a different string every run.
  const RealDate = originals.Date;
  class LabDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(epochMs);
      else super(...args);
    }

    static now() {
      return epochMs;
    }
  }
  globalThis.Date = LabDate;

  if (globalThis.crypto) {
    let uuidCounter = 0;
    globalThis.crypto.randomUUID = () => {
      uuidCounter += 1;
      const hex = uuidCounter.toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${hex}`;
    };
  }

  if (globalThis.performance) {
    let tick = 0;
    globalThis.performance.now = () => {
      tick += 16;
      return tick;
    };
  }

  const restore = () => {
    Math.random = originals.random;
    globalThis.Date = originals.Date;
    globalThis.Date.now = originals.now;
    if (globalThis.crypto && originals.randomUUID) globalThis.crypto.randomUUID = originals.randomUUID;
    if (globalThis.performance && originals.performanceNow) globalThis.performance.now = originals.performanceNow;
  };

  return { random, randomID, restore };
}
