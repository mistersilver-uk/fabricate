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
 */

/** The shortest reason that can plausibly say WHY. Shorter than this is a placeholder. */
export const MINIMUM_REASON_LENGTH = 40;

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
  const screens = new Set(spec?.screens ?? []);
  for (const region of spec?.regions ?? []) {
    if (!region.name) problems.push('a region has no name');
    if (!screens.has(region.screen)) {
      problems.push(`region ${region.name}: screen "${region.screen}" is not in spec.screens`);
    }
    if (!Array.isArray(region.groups) || region.groups.length === 0) {
      problems.push(`region ${region.name}: declares no property groups`);
    }
    if (!region.locator) problems.push(`region ${region.name}: declares no locator`);
  }
  problems.push(...coverageProblems(spec?.screens ?? [], spec?.regions ?? []));
  return problems;
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
      problems.push(`region "${region.name}" claims screen "${region.screen}", which is not declared`);
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
