/** The visual-parity spec and fixture schema, and the checks that keep both honest. */

/** The shortest reason that can plausibly say WHY. Shorter than this is a placeholder. */
export const MINIMUM_REASON_LENGTH = 40;

/** How far apart two edges may sit and still be "the same edge". */
export const EDGE_TOLERANCE_PX = 0.5;

/** The edges a group may be asserted on. */
export const ALIGNABLE_EDGES = Object.freeze(['left', 'right', 'top']);

/** The closed locator vocabulary. */
export const LOCATOR_OPS = Object.freeze([
  'select',
  'children',
  'where',
  'at',
  'child',
  'parent',
  'sibling',
]);

/** The keys a `where` step may carry. Anything else is a typo that would filter nothing. */
export const WHERE_KEYS = Object.freeze([
  'op',
  'tag',
  'text',
  'rect',
  'style',
  'styleNot',
  'has',
  'childCount',
  'leaf',
]);

/** Validate one locator's shape. */
export function locatorProblems(locator, label) {
  if (typeof locator === 'string') {
    return locator.trim().length === 0 ? [`${label}: the CSS selector is empty`] : [];
  }
  if (!Array.isArray(locator) || locator.length === 0) {
    return [`${label}: a locator is a CSS selector or a non-empty list of steps`];
  }
  const problems = [];
  for (const [index, step] of locator.entries()) {
    if (!LOCATOR_OPS.includes(step?.op)) {
      problems.push(
        `${label}: step ${index} has op "${step?.op}", which is not one of ` +
          `${LOCATOR_OPS.join(', ')} — a locator is data, never an expression`
      );
      continue;
    }
    if (step.op === 'select' && !step.css) problems.push(`${label}: step ${index} has no css`);
    if (step.op === 'where') {
      for (const key of Object.keys(step)) {
        if (!WHERE_KEYS.includes(key)) {
          problems.push(
            `${label}: step ${index} filters on "${key}", which no filter reads — it would ` +
              `match everything and widen the locator silently`
          );
        }
      }
    }
    for (const key of ['index', 'offset']) {
      if (Object.hasOwn(step, key) && !Number.isInteger(step[key])) {
        problems.push(`${label}: step ${index}'s ${key} must be an integer`);
      }
    }
  }
  return problems;
}

/** Property groups a region may ask for, keyed by name. */
export const DEFAULT_PROPERTY_GROUPS = {
  surface: ['backgroundColor'],
  border: ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius'],
  type: ['color', 'fontSize', 'fontWeight', 'textTransform'],
  tracking: ['letterSpacing'],
  box: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  gap: ['columnGap', 'rowGap'],
  size: ['width', 'height'],
  blockSize: ['height'],
  // A Font Awesome (or other icon-font) glyph.
  glyph: ['color', 'fontSize'],
  // A painted marker that moves no geometry.
  shadow: ['boxShadow'],
  // The scroller's own paint.
  scroll: ['scrollbarColor', 'scrollbarWidth'],
};

/** Validate a spec's shape before either tool acts on it. */
export function validateSpec(spec) {
  const problems = [];
  if (!Array.isArray(spec?.screens) || spec.screens.length === 0) {
    problems.push('spec.screens must be a non-empty array naming the closed set of screens');
  }
  if (!Array.isArray(spec?.regions) || spec.regions.length === 0) {
    problems.push('spec.regions must be a non-empty array');
  }
  const screens = new Set(spec?.screens);
  for (const region of spec?.regions ?? []) {
    if (!region.name) problems.push('a region has no name');
    if (!screens.has(region.screen)) {
      problems.push(`region ${region.name}: screen "${region.screen}" is not in spec.screens`);
    }
    if (!Array.isArray(region.groups) || region.groups.length === 0) {
      problems.push(`region ${region.name}: declares no property groups`);
    }
    if (region.locator) {
      problems.push(...locatorProblems(region.locator, `region ${region.name}`));
    } else {
      problems.push(`region ${region.name}: declares no locator`);
    }
  }
  problems.push(
    ...coverageProblems(spec?.screens ?? [], spec?.regions ?? []),
    ...alignmentProblems(spec)
  );
  return problems;
}

/** Every alignment group names declared regions, on one screen, on edges that exist. */
export function alignmentProblems(spec) {
  const problems = [];
  const byName = new Map((spec?.regions ?? []).map((region) => [region.name, region]));
  const screens = new Set(spec?.screens);
  for (const group of spec?.alignments ?? []) {
    if (!group?.name) {
      problems.push('an alignment group has no name');
      continue;
    }
    if (!screens.has(group.screen)) {
      problems.push(`alignment "${group.name}": screen "${group.screen}" is not in spec.screens`);
    }
    const members = group.regions ?? [];
    if (members.length < 2) {
      problems.push(`alignment "${group.name}": needs at least two regions to share an edge`);
    }
    for (const side of group.edges ?? []) {
      if (!ALIGNABLE_EDGES.includes(side)) {
        problems.push(
          `alignment "${group.name}": edge "${side}" is not one of ${ALIGNABLE_EDGES.join(', ')}`
        );
      }
    }
    if ((group.edges ?? []).length === 0) {
      problems.push(`alignment "${group.name}": declares no edges`);
    }
    const on = group.measuredOn ?? group.screen;
    for (const member of members) {
      const region = byName.get(member);
      if (!region) {
        problems.push(`alignment "${group.name}": region "${member}" is not declared`);
        continue;
      }
      const regionOn = region.measuredOn ?? region.screen;
      if (regionOn !== on) {
        problems.push(
          `alignment "${group.name}": region "${member}" is measured on "${regionOn}", not on ` +
            `"${on}" — two boxes that were never on screen together share no edge`
        );
      }
    }
  }
  return problems;
}

/** Which of the asked-for edges a set of boxes actually shares. */
export function sharedEdges(edges, sides) {
  const shared = {};
  for (const side of sides) shared[side] = edgeSpread(edges, side).delta <= EDGE_TOLERANCE_PX;
  return shared;
}

/** The widest disagreement about one edge, and who is at each end of it. */
export function edgeSpread(edges, side) {
  const values = Object.fromEntries(Object.entries(edges).map(([name, box]) => [name, box[side]]));
  const entries = Object.entries(values).sort((left, right) => left[1] - right[1]);
  const low = entries[0];
  const high = entries.at(-1);
  return {
    delta: entries.length === 0 ? 0 : Math.abs(high[1] - low[1]),
    low: low?.[0] ?? '',
    high: high?.[0] ?? '',
    values,
  };
}

/** Both directions of the coverage rule. */
export function coverageProblems(screens, regions) {
  const problems = [];
  const measured = new Set(regions.map((region) => region.screen));
  for (const screen of screens) {
    if (!measured.has(screen)) {
      problems.push(
        `screen "${screen}" has no regions: an unmeasured screen must FAIL, not pass silently`
      );
    }
  }
  for (const region of regions) {
    if (!screens.includes(region.screen)) {
      problems.push(
        `region "${region.name}" claims screen "${region.screen}", which is not declared`
      );
    }
  }
  return problems;
}

/** Every exemption names a real region, a real measured property, and a stated reason. */
export function exemptionProblems(fixture) {
  const problems = [];
  for (const [name, region] of Object.entries(fixture?.regions ?? {})) {
    if (!region.exemptions) continue;
    for (const [property, reason] of Object.entries(region.exemptions)) {
      if (!Object.hasOwn(region.properties ?? {}, property)) {
        problems.push(`${name}.${property}: exempts a property this region does not measure`);
      }
      if (typeof reason !== 'string' || reason.trim().length < MINIMUM_REASON_LENGTH) {
        problems.push(
          `${name}.${property}: an exemption needs a stated reason of at least ` +
            `${MINIMUM_REASON_LENGTH} characters, not a placeholder`
        );
      }
    }
  }
  return problems;
}

/** Whether two computed values say the same thing. */
export function sameComputedValue(property, actual, expected) {
  if (property === 'columnGap' || property === 'rowGap') {
    const zero = (value) => (value === 'normal' ? '0px' : value);
    return zero(actual) === zero(expected);
  }
  return actual === expected;
}

/**
 * The ceiling on A declared tolerance, and it is deliberately below the smallest thing a design
 * decides.
 */
export const MAX_TOLERANCE_PX = 0.5;

const LENGTH = /^-?\d+(?:\.\d+)?px$/;

/** Classify one property's difference: the same, rounding, or drift. */
export function classifyDifference(property, actual, expected, tolerances = {}) {
  if (sameComputedValue(property, actual, expected)) return { verdict: 'same' };
  const tolerance = tolerances[property];
  if (!tolerance) return { verdict: 'drift' };
  if (!LENGTH.test(String(actual)) || !LENGTH.test(String(expected))) return { verdict: 'drift' };
  const delta = Math.abs(Number.parseFloat(actual) - Number.parseFloat(expected));
  if (delta > tolerance.px) return { verdict: 'drift' };
  return { verdict: 'rounding', delta, px: tolerance.px };
}

/** Every declared tolerance names a property something measures, is under the cap, and says why. */
export function toleranceProblems(spec) {
  const problems = [];
  const groups = { ...DEFAULT_PROPERTY_GROUPS, ...spec?.propertyGroups };
  const measurable = new Set(Object.values(groups).flat());
  for (const [property, tolerance] of Object.entries(spec?.tolerances ?? {})) {
    if (!measurable.has(property)) {
      problems.push(
        `tolerance ${property}: no property group measures it, so the tolerance applies to ` +
          `nothing and would outlive whatever it was written for`
      );
    }
    const px = tolerance?.px;
    if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) {
      problems.push(`tolerance ${property}: needs a positive \`px\` number`);
    } else if (px >= MAX_TOLERANCE_PX) {
      problems.push(
        `tolerance ${property}: ${px}px is at or over the ${MAX_TOLERANCE_PX}px cap — a band ` +
          `that wide can absorb a decision from a published scale, which is a gate that ` +
          `cannot fail rather than a unit conversion`
      );
    }
    if (
      typeof tolerance?.reason !== 'string' ||
      tolerance.reason.trim().length < MINIMUM_REASON_LENGTH
    ) {
      problems.push(
        `tolerance ${property}: needs a stated reason of at least ${MINIMUM_REASON_LENGTH} ` +
          `characters, not a placeholder`
      );
    }
  }
  return problems;
}
