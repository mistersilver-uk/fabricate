// How a crafting quantity is written on a chip (issue 1506). Every reading here is TOTAL: an
// unreadable count reads as 0 rather than printing the gap in the model, while a fractional or
// negative count is kept, because rounding one would misreport a holding.

export function countText(value) {
  const count = Number(value);
  return Number.isFinite(count) ? String(count) : '0';
}

export function haveOfNeedText(have, need) {
  return `${countText(have)}/${countText(need)}`;
}

// U+00D7, not the letter x: a player reads it as a quantity rather than as part of a name.
export function stackCountText(have) {
  return `×${countText(have)}`;
}
