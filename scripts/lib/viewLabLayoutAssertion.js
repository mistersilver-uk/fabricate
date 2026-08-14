/**
 * Assert one responsive View Lab layout from its declarative case expectation.
 *
 * The container query evaluates the content box, while `getBoundingClientRect()` reports the
 * border box. Subtracting both padding and borders keeps the capture contract aligned with CSS.
 *
 * @param {import('playwright').Page} page The rendered View Lab page.
 * @param {object|null} expectation The case's responsive layout expectation.
 * @param {string} label The case id used in diagnostics.
 * @returns {Promise<void>}
 */
export async function assertViewLabLayout(page, expectation, label) {
  if (!expectation) return;

  const { containerSelector, gridSelector, maxContentBoxInlineSize } = expectation;
  const container = await requiredLocator(page, containerSelector, 'container', label);
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

  const grid = await requiredLocator(page, gridSelector, 'grid', label);
  const gridTemplateColumns = await grid.evaluate((element) =>
    globalThis.getComputedStyle(element).gridTemplateColumns.trim()
  );
  if (gridTemplateColumns === 'none') {
    throw new Error(`${label}: ${gridSelector} computed grid-template-columns resolved to "none"`);
  }
  const tracks = resolvedTracks(gridTemplateColumns);
  if (tracks.length !== 1) {
    throw new Error(
      `${label}: ${gridSelector} must resolve to exactly one resolved grid track; got ` +
        `"${gridTemplateColumns}"`
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
