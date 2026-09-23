/**
 * Differential equivalence for the staged ingredient resolver (issue 1083), with the PRE-1083
 * whole-set solver as the oracle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { utils: { randomID: () => crypto.randomUUID() } };

const { IngredientSet } = await import('../src/models/IngredientSet.js');

const CASE_COUNT = 240;
const SEED = 1083;

/** Mulberry32 — a seeded PRNG, so the corpus is identical on every machine and every run. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pick = (random, values) => values[Math.floor(random() * values.length)];
const between = (random, low, high) => low + Math.floor(random() * (high - low + 1));

const COMPONENT_IDS = ['cmp-a', 'cmp-b', 'cmp-c'];
const TAGS = ['iron', 'wood', 'ember'];
const ESSENCES = ['fire', 'earth'];
const UNITS = ['gp', 'sp'];

/** One held stack: a component identity, a tag list and an essence map, all decided by the seed. */
function heldStack(random, index) {
  return {
    uuid: `held-${index}`,
    system: { quantity: between(random, 1, 4) },
    componentId: random() < 0.75 ? pick(random, COMPONENT_IDS) : null,
    tags: TAGS.filter(() => random() < 0.4),
    essences: Object.fromEntries(
      ESSENCES.filter(() => random() < 0.35).map((id) => [id, between(random, 1, 2)])
    ),
  };
}

const MATCHER = (option, item) => {
  const match = option?.match;
  if (match?.type === 'component') return item.componentId === match.componentId;
  if (match?.type === 'tags') {
    const required = match.tags || [];
    return match.tagMatch === 'all'
      ? required.every((tag) => item.tags.includes(tag))
      : required.some((tag) => item.tags.includes(tag));
  }
  return false;
};

const ESSENCE_PROBE = (item) => item.essences;

function buildOption(random) {
  const kind = pick(random, ['component', 'component', 'tags', 'tags', 'essence', 'currency']);
  if (kind === 'component') {
    return {
      quantity: between(random, 1, 3),
      match: { type: 'component', componentId: pick(random, COMPONENT_IDS) },
    };
  }
  if (kind === 'tags') {
    const tags = [pick(random, TAGS)];
    if (random() < 0.25) tags.push(pick(random, TAGS));
    return {
      quantity: between(random, 1, 3),
      match: { type: 'tags', tags: [...new Set(tags)], tagMatch: random() < 0.3 ? 'all' : 'any' },
    };
  }
  if (kind === 'essence') {
    return {
      quantity: 1,
      match: {
        type: 'essence',
        essenceId: pick(random, ESSENCES),
        amount: between(random, 1, 3),
      },
    };
  }
  return {
    quantity: 1,
    match: { type: 'currency', unit: pick(random, UNITS), amount: between(random, 1, 50) },
  };
}

/** One seeded case: an ingredient set, an inventory and the resolve options to use. */
function buildCase(caseIndex) {
  const random = seededRandom(SEED + caseIndex * 7919);
  const groupCount = between(random, 1, 4);
  const ingredientGroups = Array.from({ length: groupCount }, (_unused, groupIndex) => ({
    id: `g-${groupIndex}`,
    name: `Group ${groupIndex}`,
    options: Array.from({ length: between(random, 1, 3) }, () => buildOption(random)),
  }));

  const items = Array.from({ length: between(random, 2, 7) }, (_unused, index) =>
    heldStack(random, index)
  );

  const options = { resolveItemEssences: ESSENCE_PROBE };
  if (random() < 0.35) {
    // Currency is affordable for one unit only, so the items-strictly-beat-currency ordering and
    // the "unaffordable currency option becomes the missing representative" path both stay live.
    const affordable = pick(random, UNITS);
    options.affordCurrency = (match) => match?.unit === affordable;
  }
  if (random() < 0.25) {
    const groupIndex = between(random, 0, groupCount - 1);
    const group = ingredientGroups[groupIndex];
    const override = { optionIndex: between(random, 0, group.options.length - 1) };
    if (random() < 0.4) override.heldItemId = pick(random, items).uuid;
    options.optionOverrides = { [group.id]: override };
  }

  return { set: new IngredientSet({ id: `set-${caseIndex}`, ingredientGroups }), items, options };
}

const entriesOf = (record) =>
  Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

/** The full observable selection as one string. */
function fingerprint(set, selection) {
  const optionIndexOf = (option) => {
    for (const [groupIndex, group] of set.ingredientGroups.entries()) {
      const index = (group.options || []).indexOf(option);
      if (index !== -1) return `${groupIndex}.${index}`;
    }
    return '?';
  };
  const pool = selection.essencePool;
  const stats = selection.searchStats;
  const parts = [
    selection.success ? 'ok' : 'no',
    `sel[${selection.selectedIngredients.map(optionIndexOf).join(',')}]`,
    `plan[${selection.plan
      .map(
        (entry) =>
          `${entry.item.uuid}x${entry.quantity}` +
          (entry.essenceGroupIds ? `@${entry.essenceGroupIds.join('+')}` : '')
      )
      .join(',')}]`,
    `cur[${selection.currencySpends.map((spend) => `${spend.amount}${spend.unit}`).join(',')}]`,
    `miss[${selection.missingGroups
      .map((missing) => `${missing.group?.id ?? '?'}:${missing.have}/${missing.need}`)
      .join(',')}]`,
    `alloc[${entriesOf(selection.essenceAllocation)}]`,
    `pool[${(pool?.requirements ?? [])
      .map((requirement) => `${requirement.essenceId}:${requirement.delivered}/${requirement.need}`)
      .join(',')}]`,
    `carry[${(pool?.carriers ?? [])
      .map(
        (carrier) =>
          `${carrier.itemKey}:${entriesOf(carrier.perUnit)}:` +
          `${carrier.allocatedUnits}/${carrier.ownedUnits}`
      )
      .join(',')}]`,
    `sugg[${entriesOf(pool?.suggested)}]`,
    `tot[${entriesOf(pool?.totals)}]`,
    `stats[${stats.nodes}/${stats.capHit}/${Object.isFrozen(stats)}]`,
  ];
  return parts.join(' ');
}

function fingerprintAll() {
  const observed = [];
  for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
    const { set, items, options } = buildCase(caseIndex);
    observed.push(fingerprint(set, set.resolveIngredientSelection(items, MATCHER, options)));
  }
  return observed;
}

if (process.env.FABRICATE_PRINT_SOLVER_FINGERPRINTS) {
  // The regeneration hook. Deliberately committed rather than run ad hoc: the table below is
  // only meaningful if the next person can reproduce it from the implementation it describes.
  console.log(JSON.stringify(fingerprintAll(), null, 2));
}

/**
 * The committed oracle: its selection fields carry the pre-1083 solver's answers forward, and its
 * search-cost and essence-pool detail pin the current implementation byte for byte.
 */
const FINGERPRINTS = [
  'no sel[0.1,2.1] plan[held-0x1,held-1x1,held-1x2] cur[] miss[g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[1.0,2.1] plan[held-0x3,held-0x1@g-1,held-1x2@g-0] cur[] miss[g-0:2/3] alloc[held-1=2,held-0=1] pool[earth:2/3,fire:1/1] carry[held-0:fire=2:1/1,held-1:earth=1:2/2] sugg[held-1=2,held-0=1] tot[fire=2,earth=2] stats[0/false/true]',
  'ok sel[0.1] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.2] plan[held-1x2,held-4x1@g-1] cur[] miss[] alloc[held-4=1] pool[fire:1/1] carry[held-4:fire=1:1/4] sugg[held-4=1] tot[fire=1] stats[3/false/true]',
  'no sel[1.1,2.0] plan[held-1x1,held-1x1@g-2] cur[] miss[g-0:0/1] alloc[held-1=1] pool[earth:2/2] carry[held-0:earth=1:0/1,held-1:earth=2:1/2] sugg[held-1=1] tot[earth=2] stats[0/false/true]',
  'ok sel[0.0] plan[held-1x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1,1.0,2.0,3.0] plan[held-2x1,held-0x1,held-3x1,held-5x1,held-3x1@g-1] cur[] miss[] alloc[held-3=1] pool[earth:1/1] carry[held-3:earth=2:1/1] sugg[held-3=1] tot[earth=2] stats[10/false/true]',
  'no sel[] plan[] cur[] miss[g-0:1/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.1] plan[held-1x2,held-0x1@g-2+g-3] cur[] miss[g-1:1/3,g-3:1/2] alloc[held-0=1] pool[earth:1/1,earth:1/2] carry[held-0:earth=2:1/1] sugg[held-0=1] tot[earth=2] stats[1/false/true]',
  'no sel[] plan[] cur[] miss[g-0:1/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[3.0] plan[held-1x3@g-3] cur[] miss[g-0:0/3,g-1:0/3,g-2:0/3] alloc[held-1=3] pool[earth:0/3,earth:0/3,fire:3/3] carry[held-1:fire=1:3/3] sugg[held-1=3] tot[fire=3] stats[0/false/true]',
  'ok sel[0.1,1.0,2.0,3.0] plan[held-0x2,held-2x1,held-1x1] cur[7gp] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'ok sel[0.1] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:0/2] alloc[] pool[earth:0/1,fire:0/2] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-0x2,held-1x1,held-6x3,held-5x2@g-1] cur[] miss[] alloc[held-5=2] pool[earth:2/2] carry[held-2:earth=1:0/2,held-5:earth=1:2/3,held-6:earth=1:0/1] sugg[held-5=2] tot[earth=2] stats[5/false/true]',
  'ok sel[0.0] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1,1.0,2.0] plan[held-1x2,held-0x1@g-0+g-2,held-1x1@g-2] cur[] miss[] alloc[held-0=1,held-1=1] pool[earth:1/1,fire:3/3] carry[held-0:earth=1,fire=2:1/1,held-1:fire=2:1/1] sugg[held-0=1,held-1=1] tot[earth=1,fire=4] stats[4/false/true]',
  'ok sel[0.0] plan[held-1x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.2,2.1] plan[held-1x2,held-0x1,held-1x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[] plan[] cur[] miss[g-0:1/3,g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1,1.0,2.1] plan[held-1x1,held-1x2,held-2x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[0.1] plan[held-0x2] cur[] miss[g-1:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.1] plan[held-0x2] cur[] miss[g-1:0/2,g-2:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[36/false/true]',
  'no sel[0.0,3.0] plan[held-0x1,held-1x2] cur[43gp] miss[g-1:0/1,g-2:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[11/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0,3.0] plan[held-4x1,held-0x3,held-2x1@g-2] cur[] miss[g-1:0/1] alloc[held-2=1] pool[earth:1/1] carry[held-1:earth=2:0/4,held-2:earth=1:1/1] sugg[held-2=1] tot[earth=1] stats[4/false/true]',
  'no sel[0.0,1.0,3.0] plan[held-0x2,held-4x3,held-2x1] cur[] miss[g-2:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.0,2.0,3.1] plan[held-1x2,held-0x1,held-4x2@g-0,held-5x1@g-0] cur[8sp] miss[] alloc[held-4=2,held-5=1] pool[earth:3/3] carry[held-4:earth=1:2/2,held-5:earth=1:1/2] sugg[held-4=2,held-5=1] tot[earth=3] stats[5/false/true]',
  'no sel[1.0,3.0] plan[held-0x1,held-1x2,held-2x1@g-3] cur[] miss[g-0:0/1,g-2:2/3] alloc[held-2=1] pool[earth:0/1,fire:2/2] carry[held-2:fire=2:1/1] sugg[held-2=1] tot[fire=2] stats[0/false/true]',
  'ok sel[0.1,1.1,2.0] plan[held-2x1,held-3x3,held-0x2@g-0] cur[] miss[] alloc[held-0=2] pool[earth:3/3] carry[held-0:earth=2:2/2,held-2:earth=2:0/2] sugg[held-0=2] tot[earth=4] stats[4/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-0x1,held-0x1,held-3x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[1.0] plan[held-0x1] cur[] miss[g-0:0/3] alloc[] pool[fire:0/3] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-2x2@g-0] cur[] miss[] alloc[held-2=2] pool[fire:2/2] carry[held-1:fire=1:0/1,held-2:fire=1:2/4] sugg[held-2=2] tot[fire=2] stats[2/false/true]',
  'ok sel[0.0,1.0] plan[held-1x2,held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.1] plan[held-3x2] cur[] miss[g-1:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0] plan[held-0x2,held-1x1@g-0] cur[] miss[] alloc[held-1=1] pool[earth:1/1] carry[held-1:earth=1:1/2,held-2:earth=1:0/2,held-3:earth=1:0/2] sugg[held-1=1] tot[earth=1] stats[3/false/true]',
  'no sel[0.0,1.1,2.2] plan[held-2x1,held-0x1,held-2x2@g-1] cur[] miss[g-3:0/1] alloc[held-2=2] pool[earth:3/3] carry[held-2:earth=2:2/3] sugg[held-2=2] tot[earth=4] stats[4/false/true]',
  'ok sel[0.0] plan[held-3x2@g-0] cur[] miss[] alloc[held-3=2] pool[fire:3/3] carry[held-0:fire=2:0/1,held-1:fire=2:0/1,held-3:fire=2:2/2] sugg[held-3=2] tot[fire=4] stats[2/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-1x1,held-1x1,held-2x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-1x1@g-0] cur[] miss[] alloc[held-1=1] pool[earth:2/2] carry[held-0:earth=2:0/1,held-1:earth=2:1/4,held-3:earth=2:0/2] sugg[held-1=1] tot[earth=2] stats[2/false/true]',
  'no sel[0.0,2.0] plan[held-0x2,held-2x1@g-2] cur[] miss[g-1:0/1] alloc[held-2=1] pool[fire:2/2] carry[held-2:fire=2:1/4,held-3:fire=1:0/3] sugg[held-2=1] tot[fire=2] stats[3/false/true]',
  'ok sel[0.0] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.1,2.0,3.0] plan[held-0x1,held-4x2,held-1x2,held-1x1,held-6x2] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0] plan[held-1x1@g-1] cur[] miss[g-0:1/2,g-2:1/2,g-3:0/3] alloc[held-1=1] pool[earth:1/1] carry[held-1:earth=2:1/1] sugg[held-1=1] tot[earth=2] stats[1/false/true]',
  'no sel[0.0,3.0] plan[held-1x1,held-5x1@g-3] cur[] miss[g-1:0/1,g-2:0/1] alloc[held-5=1] pool[earth:1/1] carry[held-4:earth=2:0/1,held-5:earth=1:1/4,held-6:earth=2:0/1] sugg[held-5=1] tot[earth=1] stats[3/false/true]',
  'ok sel[0.1] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1,1.1] plan[held-1x1,held-1x1,held-4x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.1] plan[held-2x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0] plan[] cur[25gp] miss[g-1:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.2,1.0,3.0] plan[held-2x3,held-2x1,held-4x1,held-1x1,held-4x1,held-6x1] cur[] miss[g-2:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'ok sel[0.0] plan[] cur[9gp] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[2/false/true]',
  'no sel[0.0,1.0,3.0] plan[held-0x3,held-3x1@g-0,held-4x1@g-0+g-3] cur[] miss[g-2:0/1] alloc[held-4=1,held-3=1] pool[earth:3/3,fire:2/2] carry[held-1:earth=1,fire=2:0/1,held-2:earth=1:0/4,held-3:earth=2:1/3,held-4:earth=1,fire=2:1/2] sugg[held-4=1,held-3=1] tot[earth=3,fire=2] stats[4/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2,g-1:0/1,g-2:0/2] alloc[] pool[earth:0/2,earth:0/2] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,1.0] plan[held-2x3,held-3x3] cur[] miss[g-2:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.0] plan[held-0x1,held-2x2@g-1] cur[] miss[] alloc[held-2=2] pool[fire:2/2] carry[held-1:fire=1:0/1,held-2:fire=1:2/4] sugg[held-2=2] tot[fire=2] stats[3/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-0x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[3.0] plan[] cur[8sp] miss[g-0:0/3,g-1:0/2,g-2:0/3] alloc[] pool[earth:0/2] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.1] plan[held-0x2@g-0+g-2] cur[] miss[g-1:0/3,g-3:0/2] alloc[held-0=2] pool[earth:1/1,earth:1/1] carry[held-0:earth=1:2/3] sugg[held-0=2] tot[earth=2] stats[3/false/true]',
  'no sel[0.0,1.0] plan[held-1x2,held-0x2@g-1+g-2] cur[] miss[g-2:0/1] alloc[held-0=2] pool[fire:2/2,fire:0/1] carry[held-0:fire=1:2/2] sugg[held-0=2] tot[fire=2] stats[21/false/true]',
  'no sel[1.1,3.0] plan[held-1x1,held-4x1] cur[] miss[g-0:0/2,g-2:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.2,1.0] plan[held-4x1,held-3x1@g-0] cur[] miss[g-2:0/1] alloc[held-3=1] pool[fire:1/1] carry[held-3:fire=2:1/2] sugg[held-3=1] tot[fire=2] stats[3/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-1x1@g-0] cur[] miss[] alloc[held-1=1] pool[earth:1/1] carry[held-1:earth=1:1/4] sugg[held-1=1] tot[earth=1] stats[2/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[0.0] plan[held-0x3] cur[] miss[g-1:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[24/false/true]',
  'ok sel[0.1,1.0] plan[held-0x3,held-1x2@g-0] cur[] miss[] alloc[held-1=2] pool[fire:3/3] carry[held-1:fire=2:2/2] sugg[held-1=2] tot[fire=4] stats[9/false/true]',
  'ok sel[0.0] plan[held-3x2,held-4x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-0x1,held-1x1,held-1x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/3,g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-0x2,held-6x1@g-0] cur[31sp] miss[] alloc[held-6=1] pool[earth:2/2] carry[held-2:earth=1:0/2,held-6:earth=2:1/2] sugg[held-6=1] tot[earth=2] stats[2/false/true]',
  'no sel[1.0,2.1] plan[held-0x2,held-0x1] cur[] miss[g-0:0/2] alloc[] pool[earth:0/2] carry[] sugg[] tot[] stats[1/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-2x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0,2.0] plan[held-0x1] cur[15gp] miss[g-0:1/3,g-3:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[fire:0/1] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[2.1] plan[held-1x2,held-2x1] cur[] miss[g-0:0/3,g-1:0/3,g-3:0/1] alloc[] pool[earth:0/3] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1,1.0] plan[held-0x2,held-4x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.1,2.0] plan[held-4x1,held-1x2,held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'ok sel[0.0] plan[held-1x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.1] plan[held-1x1,held-3x1] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-0x1,held-3x3@g-2] cur[] miss[g-1:1/2] alloc[held-3=3] pool[fire:3/3] carry[held-3:fire=1:3/3] sugg[held-3=3] tot[fire=3] stats[11/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1,1.0] plan[held-0x2,held-2x1,held-3x2@g-0] cur[] miss[] alloc[held-3=2] pool[earth:2/2] carry[held-1:earth=1:0/1,held-3:earth=1:2/3] sugg[held-3=2] tot[earth=2] stats[3/false/true]',
  'no sel[] plan[] cur[] miss[g-0:2/3,g-1:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'ok sel[0.0,1.0] plan[held-0x2,held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[1.0,2.0] plan[held-2x2,held-0x1] cur[] miss[g-0:0/1] alloc[] pool[fire:0/1] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[held-1x1@g-0] cur[] miss[g-0:1/2,g-1:0/2,g-2:0/2] alloc[held-1=1] pool[earth:1/2,fire:0/2,fire:0/2] carry[held-1:earth=1:1/1] sugg[held-1=1] tot[earth=1] stats[9/false/true]',
  'ok sel[0.1] plan[held-0x2,held-2x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-4x2,held-3x1,held-6x2@g-1] cur[] miss[g-1:2/3,g-3:0/1] alloc[held-6=2] pool[earth:2/3] carry[held-6:earth=1:2/2] sugg[held-6=2] tot[earth=2] stats[0/false/true]',
  'no sel[0.0] plan[held-0x1] cur[] miss[g-1:0/3,g-2:0/2,g-3:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[5/false/true]',
  'ok sel[0.2,1.0] plan[held-0x3,held-2x2@g-1] cur[] miss[] alloc[held-2=2] pool[fire:2/2] carry[held-2:fire=1:2/3] sugg[held-2=2] tot[fire=2] stats[9/false/true]',
  'no sel[0.0] plan[held-2x3] cur[] miss[g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.1] plan[held-0x1] cur[44sp] miss[g-1:0/1,g-3:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-0x2,held-1x2,held-2x1] cur[] miss[g-1:0/3,g-3:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[0.0] plan[held-0x1,held-3x2] cur[] miss[g-1:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0] plan[held-2x3] cur[] miss[g-1:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.1,3.0] plan[held-2x3,held-3x1,held-3x1,held-6x1@g-0] cur[] miss[] alloc[held-6=1] pool[earth:2/2] carry[held-3:earth=2:0/1,held-6:earth=2:1/3] sugg[held-6=1] tot[earth=2] stats[5/false/true]',
  'ok sel[0.1,1.0] plan[held-0x1,held-1x1@g-1] cur[] miss[] alloc[held-1=1] pool[fire:1/1] carry[held-1:fire=2:1/1] sugg[held-1=1] tot[fire=2] stats[2/false/true]',
  'ok sel[0.1,1.1] plan[held-3x1,held-4x1,held-4x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[0.0,2.0] plan[held-0x1,held-0x2,held-2x1] cur[] miss[g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,3.0] plan[held-0x3,held-2x2] cur[] miss[g-1:2/3,g-2:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[65/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/3,g-1:1/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.2,1.0] plan[held-1x2@g-0+g-1] cur[] miss[g-2:0/3] alloc[held-1=2] pool[fire:3/3,fire:1/1] carry[held-0:fire=2:0/3,held-1:fire=2:2/4,held-2:fire=1:0/4] sugg[held-1=2] tot[fire=4] stats[3/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[3.0] plan[held-1x1] cur[] miss[g-0:0/1,g-1:0/1,g-2:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,3.0] plan[held-0x1,held-0x1@g-3] cur[] miss[g-1:0/3,g-2:0/3] alloc[held-0=1] pool[earth:1/1] carry[held-0:earth=1:1/3] sugg[held-0=1] tot[earth=1] stats[3/false/true]',
  'ok sel[0.0] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0] plan[held-0x1@g-1] cur[] miss[g-0:0/1] alloc[held-0=1] pool[earth:1/1] carry[held-0:earth=1:1/4,held-1:earth=2:0/2] sugg[held-0=1] tot[earth=1] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-0x2,held-1x1] cur[] miss[g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:1/3] alloc[] pool[fire:0/1] carry[] sugg[] tot[] stats[8/false/true]',
  'no sel[1.0] plan[held-1x1@g-1] cur[] miss[g-0:0/1,g-2:0/1] alloc[held-1=1] pool[fire:2/2] carry[held-1:fire=2:1/1] sugg[held-1=1] tot[fire=2] stats[0/false/true]',
  'ok sel[0.0,1.0,2.1] plan[held-0x2,held-4x1,held-0x2,held-1x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[0.0] plan[held-1x2] cur[] miss[g-1:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[17/false/true]',
  'no sel[2.0] plan[held-0x2] cur[] miss[g-0:1/3,g-1:0/2,g-3:1/2] alloc[] pool[earth:0/2] carry[] sugg[] tot[] stats[1/false/true]',
  'ok sel[0.1,1.0] plan[held-0x3,held-1x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0] plan[held-3x1@g-0] cur[] miss[] alloc[held-3=1] pool[fire:2/2] carry[held-0:fire=1:0/3,held-3:fire=2:1/1] sugg[held-3=1] tot[fire=2] stats[2/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0] plan[held-0x1] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0] plan[held-4x2] cur[] miss[g-0:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-2x2,held-1x3,held-6x1,held-0x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[5/false/true]',
  'ok sel[0.1,1.1] plan[held-0x2,held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.1,2.0,3.1] plan[held-1x2,held-5x1,held-2x2,held-3x1,held-5x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[13/false/true]',
  'ok sel[0.0,1.1] plan[held-0x1,held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.0] plan[held-0x2,held-1x1,held-1x1,held-2x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-0x1,held-1x1,held-3x2] cur[] miss[g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[66/false/true]',
  'no sel[1.0,2.0] plan[held-0x1] cur[19gp] miss[g-0:1/2] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[0.0,1.0,3.1] plan[held-2x2,held-1x1@g-0,held-2x1@g-0+g-3] cur[] miss[g-2:0/1] alloc[held-2=1,held-1=1] pool[fire:3/3,earth:1/1] carry[held-0:fire=2:0/3,held-1:fire=1:1/2,held-2:fire=2,earth=1:1/1,held-4:earth=2:0/2,held-5:fire=2,earth=2:0/1] sugg[held-2=1,held-1=1] tot[fire=3,earth=1] stats[4/false/true]',
  'ok sel[0.0] plan[held-2x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0,2.0] plan[held-2x1@g-1] cur[27sp] miss[g-0:0/1] alloc[held-2=1] pool[earth:1/1] carry[held-2:earth=1:1/2] sugg[held-2=1] tot[earth=1] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-0x2,held-0x1,held-1x1,held-1x2@g-1] cur[] miss[] alloc[held-1=2] pool[fire:3/3] carry[held-1:fire=2:2/3] sugg[held-1=2] tot[fire=4] stats[4/false/true]',
  'ok sel[0.2] plan[held-0x1,held-1x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0] plan[held-0x2,held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.0] plan[held-1x1,held-1x3@g-1] cur[] miss[] alloc[held-1=3] pool[earth:3/3] carry[held-1:earth=1:3/3] sugg[held-1=3] tot[earth=3] stats[3/false/true]',
  'no sel[1.0] plan[held-2x1] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-1x3,held-1x1] cur[] miss[g-1:1/2,g-3:1/3] alloc[] pool[] carry[] sugg[] tot[] stats[31/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-0x2,held-6x2,held-3x1@g-2] cur[11gp] miss[] alloc[held-3=1] pool[earth:2/2] carry[held-2:earth=2:0/2,held-3:earth=2:1/4] sugg[held-3=1] tot[earth=2] stats[5/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,1.0] plan[held-1x2,held-0x2] cur[] miss[g-2:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[99/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-1x1@g-0] cur[] miss[] alloc[held-1=1] pool[fire:2/2] carry[held-1:fire=2:1/2] sugg[held-1=1] tot[fire=2] stats[2/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/3] alloc[] pool[earth:0/3] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-1x1,held-3x1,held-4x3,held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[0.2,1.0,2.0] plan[held-0x2,held-0x2,held-1x1,held-1x1@g-2] cur[] miss[g-3:0/1] alloc[held-1=1] pool[fire:2/2] carry[held-1:fire=2:1/2] sugg[held-1=1] tot[fire=2] stats[70/false/true]',
  'ok sel[0.1,1.0] plan[held-1x1,held-2x1@g-0] cur[] miss[] alloc[held-2=1] pool[fire:2/2] carry[held-0:fire=2:0/1,held-2:fire=2:1/4] sugg[held-2=1] tot[fire=2] stats[2/false/true]',
  'ok sel[0.1,1.0] plan[held-2x3,held-2x1,held-3x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[1.1] plan[held-1x1] cur[] miss[g-0:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0] plan[held-0x1@g-0] cur[] miss[g-1:0/2] alloc[held-0=1] pool[fire:2/2] carry[held-0:fire=2:1/2,held-1:fire=1:0/3,held-3:fire=2:0/2] sugg[held-0=1] tot[fire=2] stats[2/false/true]',
  'no sel[0.0,1.1,3.0] plan[held-3x3,held-0x1,held-2x1] cur[] miss[g-2:0/1] alloc[] pool[earth:0/1] carry[] sugg[] tot[] stats[4/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-0x2,held-3x1,held-3x1,held-4x2,held-1x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[120/false/true]',
  'ok sel[0.1] plan[held-0x1@g-0] cur[] miss[] alloc[held-0=1] pool[fire:1/1] carry[held-0:fire=1:1/2] sugg[held-0=1] tot[fire=1] stats[2/false/true]',
  'no sel[0.1] plan[held-3x2] cur[] miss[g-1:0/3] alloc[] pool[earth:0/3] carry[] sugg[] tot[] stats[14/false/true]',
  'no sel[] plan[] cur[] miss[g-0:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0] plan[held-0x1,held-0x2,held-4x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-2x3,held-1x1,held-2x1,held-5x2,held-3x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[5/false/true]',
  'ok sel[0.0] plan[held-1x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-2x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0,2.0] plan[held-0x1,held-1x1@g-1] cur[] miss[g-0:0/3] alloc[held-1=1] pool[fire:1/1] carry[held-1:fire=1:1/3,held-2:fire=2:0/1] sugg[held-1=1] tot[fire=1] stats[0/false/true]',
  'no sel[0.0] plan[held-0x1] cur[] miss[g-1:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[held-1x2@g-1] cur[] miss[g-0:0/1,g-1:2/3] alloc[held-1=2] pool[earth:2/3] carry[held-1:earth=1:2/2] sugg[held-1=2] tot[earth=2] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[1.0] plan[held-4x1] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/3,g-1:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0,3.0] plan[held-0x2] cur[50gp] miss[g-0:1/2,g-2:1/3] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'ok sel[0.1,1.0] plan[held-0x2,held-3x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0] plan[held-0x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0,3.1] plan[held-0x1,held-1x1] cur[] miss[g-0:0/1,g-2:1/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0,2.0] plan[held-0x2,held-2x1@g-0] cur[] miss[g-1:0/1] alloc[held-2=1] pool[earth:2/2] carry[held-2:earth=2:1/4] sugg[held-2=1] tot[earth=2] stats[3/false/true]',
  'no sel[1.1,2.0] plan[held-1x3,held-0x1] cur[] miss[g-0:0/1,g-3:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0] plan[held-0x2,held-5x1@g-0,held-6x1@g-0] cur[] miss[] alloc[held-5=1,held-6=1] pool[earth:3/3] carry[held-0:earth=2:0/1,held-2:earth=1:0/1,held-4:earth=2:0/3,held-5:earth=2:1/4,held-6:earth=1:1/3] sugg[held-5=1,held-6=1] tot[earth=3] stats[3/false/true]',
  'ok sel[0.2,1.0,2.0] plan[held-2x1,held-5x1,held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/2] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'ok sel[0.0,1.0,2.0,3.1] plan[held-0x3,held-2x1,held-4x1,held-1x1,held-5x1,held-3x1@g-2] cur[] miss[] alloc[held-3=1] pool[earth:1/1] carry[held-3:earth=2:1/1] sugg[held-3=1] tot[earth=2] stats[26/false/true]',
  'ok sel[0.0] plan[held-1x1@g-0] cur[] miss[] alloc[held-1=1] pool[earth:1/1] carry[held-0:earth=2:0/2,held-1:earth=2:1/4] sugg[held-1=1] tot[earth=2] stats[2/false/true]',
  'ok sel[0.0] plan[held-1x2,held-3x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[2/false/true]',
  'no sel[2.0] plan[held-1x1@g-2] cur[] miss[g-0:0/1,g-1:0/3,g-3:0/3] alloc[held-1=1] pool[earth:1/1] carry[held-1:earth=1:1/1] sugg[held-1=1] tot[earth=1] stats[0/false/true]',
  'ok sel[0.1,1.0,2.2] plan[held-0x1,held-2x2,held-1x1,held-2x1,held-3x1,held-1x3@g-1] cur[] miss[] alloc[held-1=3] pool[earth:3/3] carry[held-1:earth=1:3/3] sugg[held-1=3] tot[earth=3] stats[75/false/true]',
  'ok sel[0.0] plan[held-0x1,held-1x1,held-2x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0] plan[held-0x1] cur[] miss[g-1:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[2/false/true]',
  'ok sel[0.0] plan[held-5x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0] plan[held-0x2,held-3x1] cur[] miss[g-1:0/1,g-2:1/3] alloc[] pool[] carry[] sugg[] tot[] stats[15/false/true]',
  'ok sel[0.0,1.0] plan[held-2x2,held-1x1,held-5x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0] plan[held-0x2,held-2x1] cur[] miss[g-0:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-1x2,held-0x2,held-5x1@g-0+g-3] cur[] miss[] alloc[held-5=1] pool[earth:1/1,fire:1/1] carry[held-2:fire=2:0/1,held-3:fire=2:0/1,held-4:fire=1:0/1,held-5:earth=1,fire=2:1/2] sugg[held-5=1] tot[earth=1,fire=2] stats[5/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[1.0] plan[held-1x1] cur[] miss[g-0:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'no sel[0.0] plan[held-0x1,held-1x1] cur[] miss[g-1:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0,2.2,3.0] plan[held-2x2,held-4x1,held-1x3,held-0x1@g-2] cur[] miss[] alloc[held-0=1] pool[fire:1/1] carry[held-0:fire=1:1/2] sugg[held-0=1] tot[fire=1] stats[5/false/true]',
  'no sel[0.0,2.0] plan[held-1x1,held-1x1] cur[] miss[g-1:1/2] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[1.0,2.0] plan[held-2x1,held-1x2@g-2] cur[] miss[g-0:0/2] alloc[held-1=2] pool[earth:0/2,fire:2/2] carry[held-1:fire=1:2/3] sugg[held-1=2] tot[fire=2] stats[1/false/true]',
  'no sel[1.1,2.1] plan[held-0x1,held-1x1] cur[] miss[g-0:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'ok sel[0.0,1.0,2.0] plan[held-1x2,held-2x3,held-1x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[1.0] plan[held-1x1@g-1,held-3x1@g-0] cur[] miss[g-0:1/2] alloc[held-1=1,held-3=1] pool[fire:1/2,earth:2/2] carry[held-0:earth=2:0/2,held-1:earth=2:1/4,held-3:fire=1:1/1] sugg[held-1=1,held-3=1] tot[earth=2,fire=1] stats[0/false/true]',
  'no sel[1.1,3.0] plan[held-1x3] cur[16gp] miss[g-0:0/1,g-2:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0] plan[held-2x1,held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.1] plan[held-2x1,held-5x2,held-6x1@g-0] cur[] miss[] alloc[held-6=1] pool[fire:1/1] carry[held-5:fire=1:0/1,held-6:fire=1:1/2] sugg[held-6=1] tot[fire=1] stats[3/false/true]',
  'ok sel[0.0,1.0,2.2] plan[held-0x2,held-3x3@g-1+g-2,held-4x1@g-1+g-2] cur[] miss[] alloc[held-4=1,held-3=3] pool[earth:2/2,earth:3/3] carry[held-3:earth=1:3/3,held-4:earth=2:1/1] sugg[held-4=1,held-3=3] tot[earth=5] stats[4/false/true]',
  'ok sel[0.0,1.0] plan[held-4x3,held-1x2@g-0] cur[] miss[] alloc[held-1=2] pool[earth:3/3] carry[held-1:earth=2:2/4] sugg[held-1=2] tot[earth=4] stats[3/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-3x2,held-0x3,held-5x1] cur[26gp] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[5/false/true]',
  'no sel[1.0,2.0] plan[held-1x2,held-2x1,held-3x2@g-1] cur[] miss[g-0:0/3] alloc[held-3=2] pool[fire:2/2] carry[held-3:fire=1:2/2] sugg[held-3=2] tot[fire=2] stats[0/false/true]',
  'ok sel[0.2,1.0] plan[held-2x1,held-5x2,held-0x1@g-0] cur[] miss[] alloc[held-0=1] pool[earth:2/2] carry[held-0:earth=2:1/3,held-3:earth=2:0/2] sugg[held-0=1] tot[earth=2] stats[3/false/true]',
  'ok sel[0.1] plan[] cur[32sp] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.2] plan[held-0x2,held-3x1@g-1,held-4x1@g-1] cur[] miss[] alloc[held-4=1,held-3=1] pool[earth:3/3] carry[held-0:earth=1:0/2,held-1:earth=1:0/1,held-3:earth=1:1/4,held-4:earth=2:1/4] sugg[held-4=1,held-3=1] tot[earth=3] stats[3/false/true]',
  'no sel[1.0,2.0,3.1] plan[held-0x2,held-3x1,held-2x1,held-4x1] cur[] miss[g-0:0/1] alloc[] pool[earth:0/1] carry[] sugg[] tot[] stats[74/false/true]',
  'no sel[0.0,1.1,2.1] plan[held-0x2,held-2x1,held-0x1,held-3x1] cur[] miss[g-3:0/3] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[1.0,2.0] plan[held-0x3,held-1x2] cur[] miss[g-0:0/3,g-3:0/1] alloc[] pool[] carry[] sugg[] tot[] stats[1/false/true]',
  'no sel[] plan[] cur[] miss[g-0:0/1,g-1:1/2] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.1,2.0] plan[held-2x1,held-3x3,held-1x3] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[4/false/true]',
  'no sel[0.0,1.0] plan[held-1x3,held-0x2@g-1] cur[] miss[g-2:0/2,g-3:0/3] alloc[held-0=2] pool[fire:2/2] carry[held-0:fire=1:2/3] sugg[held-0=2] tot[fire=2] stats[3/false/true]',
  'no sel[2.1] plan[held-1x2@g-2] cur[] miss[g-0:0/2,g-1:0/2,g-3:0/3] alloc[held-1=2] pool[fire:0/2,earth:2/2,fire:0/3] carry[held-1:earth=1:2/3] sugg[held-1=2] tot[earth=2] stats[0/false/true]',
  'ok sel[0.0] plan[held-1x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.1] plan[held-1x2,held-4x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0] plan[held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
  'ok sel[0.0,1.0] plan[held-1x1,held-2x2] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'ok sel[0.0,1.0,2.0,3.0] plan[held-3x1,held-0x3,held-0x1,held-1x1@g-2] cur[] miss[] alloc[held-1=1] pool[fire:2/2] carry[held-1:fire=2:1/4,held-2:fire=2:0/3,held-4:fire=2:0/3] sugg[held-1=1] tot[fire=2] stats[5/false/true]',
  'no sel[1.0,2.0,3.0] plan[held-0x2,held-0x2,held-4x1@g-2] cur[] miss[g-0:0/1] alloc[held-4=1] pool[fire:1/1] carry[held-1:fire=2:0/4,held-3:fire=2:0/1,held-4:fire=1:1/3] sugg[held-4=1] tot[fire=1] stats[0/false/true]',
  'ok sel[0.1,1.0] plan[held-1x1,held-0x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[3/false/true]',
  'no sel[0.1] plan[held-2x1,held-3x1] cur[] miss[g-1:2/3] alloc[] pool[] carry[] sugg[] tot[] stats[11/false/true]',
  'no sel[0.1] plan[held-0x2] cur[] miss[g-1:0/1,g-2:1/3,g-3:1/2] alloc[] pool[fire:0/1] carry[] sugg[] tot[] stats[11/false/true]',
  'ok sel[0.0] plan[held-1x1,held-2x1] cur[] miss[] alloc[] pool[] carry[] sugg[] tot[] stats[0/false/true]',
];

test('the corpus exercises every guarantee it claims to', () => {
  // A corpus that drifted into all-satisfiable, or lost its currency and essence shapes, would
  // make the equivalence table below a green wall proving nothing.
  const observed = fingerprintAll();
  const satisfied = observed.filter((line) => line.startsWith('ok')).length;

  assert.equal(observed.length, CASE_COUNT);
  assert.ok(satisfied > CASE_COUNT * 0.2, `too few satisfiable cases: ${satisfied}/${CASE_COUNT}`);
  assert.ok(
    satisfied < CASE_COUNT * 0.9,
    `too few unsatisfiable cases: ${CASE_COUNT - satisfied}/${CASE_COUNT}`
  );
  assert.ok(
    observed.some((line) => !line.includes('cur[]')),
    'no case spent currency, so the items-before-currency ordering is untested here'
  );
  assert.ok(
    observed.some((line) => !line.includes('pool[]')),
    'no case resolved an essence block'
  );
  assert.ok(
    observed.some((line) => !line.includes('miss[]')),
    'no case reported a missing group'
  );
});

test('a substantial share of the corpus still reaches the backtracking search', () => {
  // The generator is a hand-maintained mirror of the shapes this table claims to cover, and issue
  // 1083 added a fast path that resolves an UNCONTENDED component without visiting a single node.
  // What this does NOT claim is rescue DEPTH.
  let searched = 0;
  let contended = 0;
  for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
    const { set, items, options } = buildCase(caseIndex);
    const { searchStats } = set.resolveIngredientSelection(items, MATCHER, options);
    if (searchStats.nodes > 0) searched += 1;
    if (searchStats.nodes > set.ingredientGroups.length) contended += 1;
    assert.equal(searchStats.capHit, false, `case ${caseIndex} hit the node cap`);
  }

  assert.ok(
    searched > CASE_COUNT * 0.25,
    `only ${searched}/${CASE_COUNT} cases entered the search, so the oracle is mostly pinning ` +
      'the fast path rather than the solver'
  );
  assert.ok(
    contended > CASE_COUNT * 0.1,
    `only ${contended}/${CASE_COUNT} cases cost more nodes than they have groups, so nothing ` +
      'here branches beyond one choice per group'
  );
});

test('the staged resolver is byte-identical to the pre-1083 solver', () => {
  const observed = fingerprintAll();
  assert.equal(
    observed.length,
    FINGERPRINTS.length,
    'the generator changed shape; the captured oracle no longer describes this corpus'
  );

  const drift = [];
  for (const [caseIndex, line] of observed.entries()) {
    if (line !== FINGERPRINTS[caseIndex]) {
      drift.push(`case ${caseIndex}\n    was: ${FINGERPRINTS[caseIndex]}\n    now: ${line}`);
    }
  }
  assert.deepEqual(
    drift,
    [],
    `the staged resolver produced a different selection from the oracle:\n  ${drift.join('\n  ')}`
  );
});

test('every satisfied selection is a valid, non-double-counting draw', () => {
  // Equivalence to the old solver is necessary, not sufficient: two implementations can agree on a
  // wrong answer.
  for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
    const { set, items, options } = buildCase(caseIndex);
    const selection = set.resolveIngredientSelection(items, MATCHER, options);
    if (!selection.success) continue;

    const drawn = new Map();
    for (const entry of selection.plan) {
      drawn.set(entry.item.uuid, (drawn.get(entry.item.uuid) ?? 0) + entry.quantity);
    }
    for (const item of items) {
      assert.ok(
        (drawn.get(item.uuid) ?? 0) <= item.system.quantity,
        `case ${caseIndex} drew ${drawn.get(item.uuid)} of ${item.uuid}, which holds ` +
          `${item.system.quantity}`
      );
    }
    assert.equal(
      selection.selectedIngredients.length,
      set.ingredientGroups.length,
      `case ${caseIndex} must choose exactly one option per group, positionally`
    );
    assert.equal(selection.missingGroups.length, 0, `case ${caseIndex} reported a missing group`);
  }
});

test('resolution is repeatable and independent of held-item order', () => {
  // Determinism is a hard requirement, not a nicety.
  for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
    const { set, items, options } = buildCase(caseIndex);
    const first = set.resolveIngredientSelection(items, MATCHER, options);
    const second = set.resolveIngredientSelection(items, MATCHER, options);
    assert.equal(fingerprint(set, first), fingerprint(set, second), `case ${caseIndex} drifted`);

    const reversed = set.resolveIngredientSelection([...items].reverse(), MATCHER, options);
    assert.equal(
      reversed.success,
      first.success,
      `case ${caseIndex} changed craftability under a reversed inventory`
    );
  }
});
