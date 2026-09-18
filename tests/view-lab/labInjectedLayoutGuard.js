/**
 * Finds content-width reductions caused specifically by the View Lab stylesheet.
 *
 * @param {number} [tolerance=1] Sub-pixel rounding allowance in CSS pixels.
 */
export function findLabInjectedContentWidthLosses(withLab, withoutLab, tolerance = 1) {
  const withoutLabByElement = new Map(
    withoutLab.map((measurement) => [measurement.element, measurement])
  );

  return withLab.flatMap((measurement) => {
    const baseline = withoutLabByElement.get(measurement.element);
    if (!baseline) return [];

    const lost = baseline.clientWidth - measurement.clientWidth;
    return lost > tolerance ? [{ ...measurement, lost }] : [];
  });
}

/**
 * Takes a measurement with the supplied View Lab stylesheet disabled, always restoring it.
 *
 * @template T
 * @param {{disabled: boolean}} styleSheet The View Lab stylesheet.
 * @param {() => T} measure Reads the production-layout measurement.
 * @returns {T}
 */
export function measureWithoutLabStyles(styleSheet, measure) {
  const wasDisabled = styleSheet.disabled;
  try {
    styleSheet.disabled = true;
    return measure();
  } finally {
    styleSheet.disabled = wasDisabled;
  }
}
