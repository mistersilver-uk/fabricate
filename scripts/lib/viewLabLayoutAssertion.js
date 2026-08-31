/**
 * Assert one View Lab layout from its declarative case expectation.
 *
 * The container query evaluates the content box, while `getBoundingClientRect()` reports the
 * border box. Subtracting both padding and borders keeps the capture contract aligned with CSS.
 *
 * THE TRACK COUNT IS AN INPUT, not a constant (issue 1362). It was literally
 * `if (tracks.length !== 1)`, which suited the five 1024px responsive cases — every one of
 * which asserts "this stacked" — and suits nothing else. A full-width route asserts the
 * OPPOSITE shape: the rail plus one released content column, exactly TWO resolved tracks, and
 * no inspector at all. Hard-coding one meant a case could only ever say "it stacked".
 *
 * `absentSelector` is the other half of that, and it has to be MEASURED rather than inferred
 * from the track count. Suppressing the aside in the component and releasing the column in the
 * stylesheet are two separate edits: do only the second and the (empty) aside wraps to an
 * implicit grid row underneath the content, where the track count is still two and the frame
 * still photographs a dead strip.
 *
 * A case that reaches its route with an aside present, or with the wrong number of resolved
 * tracks, FAILS THE CAPTURE rather than publishing a frame of the dead strip.
 *
 * @param {import('playwright').Page} page The rendered View Lab page.
 * @param {object|null} expectation The case's layout expectation.
 * @param {string} label The case id used in diagnostics.
 * @returns {Promise<void>}
 */
export async function assertViewLabLayout(page, expectation, label) {
  if (!expectation) return;

  const {
    containerSelector,
    gridSelector,
    maxContentBoxInlineSize,
    expectedTracks = 1,
    absentSelector = '',
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

  if (!absentSelector) return;
  const absentCount = await page.locator(absentSelector).count();
  if (absentCount !== 0) {
    throw new Error(
      `${label}: ${absentSelector} must not be rendered on this route; found ${absentCount}. ` +
        'A released column with the aside still rendered photographs a dead strip.'
    );
  }
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
