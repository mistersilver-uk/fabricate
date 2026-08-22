/**
 * The visual-parity SPEC and FIXTURE schema, and the checks that keep both honest.
 *
 * Screen-agnostic on purpose: nothing here knows what a "checks studio" is. A spec names a
 * prototype, a closed set of screens, and the regions to measure on each; a fixture is what
 * the extractor writes and the comparator reads.
 *
 * The three rules encoded here are the ones a parity gate loses first, and each of them was
 * paid for:
 *
 * 1. **A closed set of screens.** Without it a fixture that covers two screens out of six
 *    reads as coverage while gating a third of the surface, which is the failure that lets
 *    visual drift ship in the first place. Every declared screen must own at least one
 *    region, and every region must belong to a declared screen — both directions, because
 *    either one alone narrows silently.
 * 2. **An exemption must carry a written reason.** An exemption is a claim that a difference
 *    is intentional. Unreasoned, it is indistinguishable from a value someone deleted to make
 *    the run green, which is how a parity gate stops gating without anyone noticing.
 * 3. **An exemption must name a property the region actually measures.** Otherwise a region
 *    can drop the property and keep the exemption, and the pair reads as covered.
 * 4. **A per-region value cannot see a RELATIONSHIP between two regions.** Every region on a
 *    screen can measure exactly right and still sit in the wrong place relative to its
 *    neighbour, because an inset applied by an ancestor moves a whole subtree and changes
 *    none of its own computed values. `alignments` is the rule for that class, and it is
 *    DERIVED from the prototype rather than declared: a group asserts a shared edge only
 *    where the prototype actually shares one.
 */

/** The shortest reason that can plausibly say WHY. Shorter than this is a placeholder. */
export const MINIMUM_REASON_LENGTH = 40;

/**
 * How far apart two edges may sit and still be "the same edge".
 *
 * This is NOT a tolerance band on a measured value — those are forbidden here, because they
 * are the beginning of a gate that cannot fail. It is the resolution of the question being
 * asked: two boxes laid out by independent rules land on fractional device pixels, and a
 * shared edge is a claim about layout intent rather than about a float. Half a pixel is an
 * order of magnitude below the smallest spacing token this design system owns (4px), so no
 * spacing mistake can hide under it — the inset that motivated the rule was 12px.
 */
export const EDGE_TOLERANCE_PX = 0.5;

/** The edges a group may be asserted on. Vertical rhythm is a different question. */
export const ALIGNABLE_EDGES = Object.freeze(['left', 'right']);

/**
 * The CLOSED locator vocabulary.
 *
 * A locator is a CSS selector string, or a list of steps drawn from these operations. It is
 * DATA rather than an expression, and that is a security property as much as a readability
 * one: locators used to be JavaScript source reconstituted in the page with `new Function`, so
 * a fixture could express anything a script can. Data that selects, walks and filters cannot.
 *
 * - `select`   `{ css }`                  — every descendant matching a CSS selector.
 * - `children` `{}`                       — the element children of the current nodes.
 * - `where`    `{ tag, text, rect, style, styleNot, has, childCount, leaf }` — filter.
 * - `at`       `{ index }`                — one candidate, negative counting from the end.
 * - `child`    `{ index }`                — each node's nth child, negative from the end.
 * - `parent`   `{ times }`                — walk up.
 * - `sibling`  `{ offset }`               — walk sideways, negative for previous.
 */
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

/**
 * Validate one locator's shape.
 *
 * A malformed step is worse than a missing one: `STEPS[step.op]` would throw deep inside the
 * page, and an unknown `where` key would filter nothing at all and quietly widen the locator.
 *
 * @param {string|object[]} locator The locator to check.
 * @param {string} label What to call it in a message.
 * @returns {string[]} Problems, empty when the locator is usable.
 */
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

/**
 * Property groups a region may ask for, keyed by name.
 *
 * A region declares GROUPS rather than properties so that adding a region cannot quietly
 * record a narrower property set than its siblings. A spec may replace or extend this.
 *
 * `gap` covers BOTH axes deliberately: `columnGap` alone cannot see a stacking gutter, and a
 * stray row gap is exactly the kind of dead space a reader notices and a fixture does not.
 */
export const DEFAULT_PROPERTY_GROUPS = {
  surface: ['backgroundColor'],
  border: ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius'],
  type: ['color', 'fontSize', 'fontWeight', 'textTransform'],
  tracking: ['letterSpacing'],
  box: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  gap: ['columnGap', 'rowGap'],
  size: ['width', 'height'],
  blockSize: ['height'],
  // A Font Awesome (or other icon-font) GLYPH. Narrower than `type` on purpose: an icon's
  // weight and transform come from the icon font's own sheet, which neither side owns and a
  // markup harness usually does not load, so recording them compares the harness to itself.
  glyph: ['color', 'fontSize'],
  // The SCROLLER's own paint. Host chrome (Foundry's, in this repo) can leak a scrollbar
  // colour through a pane nothing ever selected a token for, and it draws as two full-height
  // rules at the pane's edges that no named region is looking at.
  scroll: ['scrollbarColor', 'scrollbarWidth'],
};

/**
 * Validate a spec's shape before either tool acts on it.
 *
 * @param {object} spec Loaded spec module.
 * @returns {string[]} Problems, empty when the spec is usable.
 */
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

/**
 * Every alignment group names declared regions, on one screen, on edges that exist.
 *
 * The same-screen rule is the one that matters: a group whose members are measured on
 * different screens would compare two boxes that were never on screen together, and produce a
 * confident number about nothing.
 *
 * @param {object} spec Loaded spec module.
 * @returns {string[]} Problems, empty when every group is usable.
 */
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

/**
 * Which of the asked-for edges a set of boxes actually shares.
 *
 * @param {Record<string, {left: number, right: number}>} edges Region name → its box edges.
 * @param {string[]} sides Edges to test.
 * @returns {Record<string, boolean>} Side → whether every box agrees on it.
 */
export function sharedEdges(edges, sides) {
  const shared = {};
  for (const side of sides) shared[side] = edgeSpread(edges, side).delta <= EDGE_TOLERANCE_PX;
  return shared;
}

/**
 * The widest disagreement about one edge, and who is at each end of it.
 *
 * Naming both ends is what makes the report actionable: "these two do not line up" is a fact
 * about a pair, and a report that named only the group would send a reader to measure it again.
 *
 * @param {Record<string, {left: number, right: number}>} edges Region name → its box edges.
 * @param {string} side Edge to test.
 * @returns {{delta: number, low: string, high: string, values: Record<string, number>}} Spread.
 */
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

/**
 * Both directions of the coverage rule.
 *
 * @param {string[]} screens Declared closed set.
 * @param {{name: string, screen: string}[]} regions Regions to check.
 * @returns {string[]} Problems, empty when every screen is measured.
 */
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

/**
 * Every exemption names a real region, a real measured property, and a stated reason.
 *
 * @param {object} fixture Fixture as written by the extractor.
 * @returns {string[]} Problems, empty when every exemption is well formed.
 */
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

/**
 * Whether two computed values say the same thing.
 *
 * Exactly ONE normalisation, and it is a CSS fact rather than a tolerance: on a grid or flex
 * container `column-gap: normal` IS zero — the initial value computes to `normal` and lays out
 * as 0 — so a fixture recording `normal` and a sheet declaring `0` describe one gutter.
 * Nothing else is normalised. A tolerance band on colours or lengths is the beginning of a
 * gate that cannot fail.
 *
 * @param {string} property CSS property name.
 * @param {string} actual Subject's computed value.
 * @param {string} expected Prototype's recorded value.
 * @returns {boolean} True when they agree.
 */
export function sameComputedValue(property, actual, expected) {
  if (property === 'columnGap' || property === 'rowGap') {
    const zero = (value) => (value === 'normal' ? '0px' : value);
    return zero(actual) === zero(expected);
  }
  return actual === expected;
}
