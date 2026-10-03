/**
 * Assert one View Lab layout from its declarative case expectation. `gridSelector` is optional: a
 * case may assert only the row geometry keys, each of which measures every match of its selector.
 */
export async function assertViewLabLayout(page, expectation, label) {
  if (!expectation) return;

  const {
    containerSelector,
    gridSelector,
    maxContentBoxInlineSize,
    expectedTracks = 1,
    absentSelector = '',
    fillSelector = '',
  } = expectation;
  const container = await requiredLocator(page, containerSelector, 'container', label);
  if (Number.isFinite(maxContentBoxInlineSize)) {
    const contentBoxInlineSize = await container.evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      const pixels = (value) => Number.parseFloat(value) || 0;
      return (
        element.getBoundingClientRect().width -
        pixels(style.paddingLeft) -
        pixels(style.paddingRight) -
        pixels(style.borderLeftWidth) -
        pixels(style.borderRightWidth)
      );
    });
    if (contentBoxInlineSize > maxContentBoxInlineSize) {
      throw new Error(
        `${label}: ${containerSelector} content-box inline size ${contentBoxInlineSize}px exceeds ` +
          `${maxContentBoxInlineSize}px`
      );
    }
  }

  await assertRowGeometry(page, expectation, label);
  if (!gridSelector) return;

  const grid = await requiredLocator(page, gridSelector, 'grid', label);
  const gridTemplateColumns = await grid.evaluate((element) =>
    globalThis.getComputedStyle(element).gridTemplateColumns.trim()
  );
  if (gridTemplateColumns === 'none') {
    throw new Error(`${label}: ${gridSelector} computed grid-template-columns resolved to "none"`);
  }
  const tracks = resolvedTracks(gridTemplateColumns);
  if (tracks.length !== expectedTracks) {
    throw new Error(
      `${label}: ${gridSelector} must resolve to exactly ${expectedTracks} resolved grid ` +
        `track(s); got "${gridTemplateColumns}"`
    );
  }

  if (fillSelector) await assertFillsGrid(page, grid, expectation, label);

  if (!absentSelector) return;
  const absentCount = await page.locator(absentSelector).count();
  if (absentCount !== 0) {
    throw new Error(
      `${label}: ${absentSelector} must not be rendered on this route; found ${absentCount}. ` +
        'A released column with the aside still rendered photographs a dead strip.'
    );
  }
}

// The fill element must end where the grid ends: a capped rail stops short of it (issue 1972).
async function assertFillsGrid(page, grid, { gridSelector, fillSelector }, label) {
  const fill = await requiredLocator(page, fillSelector, 'fill', label);
  const bottom = (element) => element.getBoundingClientRect().bottom;
  const gridBottom = await grid.evaluate(bottom);
  const fillBottom = await fill.evaluate(bottom);
  if (Math.abs(fillBottom - gridBottom) > 1) {
    throw new Error(
      `${label}: ${fillSelector} bottom ${fillBottom}px must reach ${gridSelector} bottom ` +
        `${gridBottom}px`
    );
  }
}

/**
 * The requirement row's geometry (issue 1516): `oneLineRows` rows whose direct children share a
 * line, `alignedRight` and `alignedLeft` controls on one edge, and `minInlineSize`
 * `{ selector, pixels }` fields no narrower than their stated minimum.
 */
async function assertRowGeometry(page, expectation, label) {
  const { oneLineRows, alignedRight, alignedLeft, minInlineSize } = expectation;
  if (oneLineRows) {
    const rows = await measureAll(page, oneLineRows, { label, measure: childSpans });
    for (const [index, spans] of rows.entries()) {
      const lowestTop = Math.max(...spans.map(([top]) => top));
      const highestBottom = Math.min(...spans.map(([, bottom]) => bottom));
      if (lowestTop >= highestBottom) {
        throw new Error(
          `${label}: ${oneLineRows} #${index + 1} wraps: a direct child starts at ${lowestTop}px, ` +
            `at or below another child's bottom ${highestBottom}px`
        );
      }
    }
  }
  for (const [selector, edge] of [
    [alignedRight, 'right'],
    [alignedLeft, 'left'],
  ]) {
    if (!selector) continue;
    const edges = await measureAll(page, selector, {
      label,
      least: 2,
      measure: boxEdge,
      arg: edge,
    });
    if (Math.max(...edges) - Math.min(...edges) > 0.5) {
      throw new Error(
        `${label}: ${selector} must share one ${edge} edge; got ${edges.join(', ')}px`
      );
    }
  }
  if (minInlineSize) {
    const { selector, pixels } = minInlineSize;
    const widths = await measureAll(page, selector, { label, measure: boxEdge, arg: 'width' });
    const narrowest = Math.min(...widths);
    if (narrowest < pixels) {
      throw new Error(
        `${label}: ${selector} is ${narrowest}px wide, under its ${pixels}px minimum`
      );
    }
  }
}

// Both run in the page, so each is self-contained: no closure reaches back into this module.
function childSpans(rows) {
  return rows.map((row) =>
    [...row.children]
      .map((child) => child.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => [box.top, box.bottom])
  );
}

function boxEdge(elements, key) {
  return elements.map((element) => element.getBoundingClientRect()[key]);
}

/** Every match of `selector` through `measure`; fewer than `least` would make the check vacuous. */
async function measureAll(page, selector, { label, least = 1, measure, arg = null }) {
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count < least) {
    throw new Error(
      `${label}: "${selector}" matched ${count}, fewer than the ${least} it measures`
    );
  }
  return locator.evaluateAll(measure, arg);
}

async function requiredLocator(page, selector, kind, label) {
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count !== 1) {
    const detail = count === 0 ? 'was not found' : `matched ${count} elements`;
    throw new Error(`${label}: ${kind} selector "${selector}" ${detail}`);
  }
  return locator;
}

function resolvedTracks(value) {
  const tracks = [];
  let token = '';
  let parentheses = 0;
  let brackets = 0;
  for (const character of value) {
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses -= 1;
    if (character === '[') brackets += 1;
    if (character === ']') brackets -= 1;
    if (/\s/.test(character) && parentheses === 0 && brackets === 0) {
      if (token && !token.startsWith('[')) tracks.push(token);
      token = '';
      continue;
    }
    token += character;
  }
  if (token && !token.startsWith('[')) tracks.push(token);
  return tracks;
}
