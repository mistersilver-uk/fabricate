/**
 * The radius ladder by size (`design-system/spec.md`, "Geometry comes from the published ladders"),
 * read by the stylesheet corner gate and the View Lab's computed census alike.
 */

/**
 * `[lowest px, highest px, corner px]` per band. 25, 33 and 39 to 43 fall between bands, so the
 * retired 40 takes none and is held by the control-height gate rather than by a corner.
 */
const CORNER_BANDS = Object.freeze([
  [0, 24, 6],
  [26, 32, 7],
  [34, 38, 9],
  [44, 44, 11],
]);

/** The corner a box `px` tall or wide takes on the ladder, or `null` where the spec bands none. */
export function bandCorner(px) {
  const band = CORNER_BANDS.find(([lowest, highest]) => px >= lowest && px <= highest);
  return band ? band[2] : null;
}
