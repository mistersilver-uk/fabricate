/**
 * Measure a player view mounted in Chromium for the browse-column footer rule (`design-system`,
 * "Screens are composed from published recipes"): each named selector's box, its left and top
 * border widths, its corner radius and the vertical centres of its direct children, which a
 * wrapping `align-items: center` row such as the pagination bar's shares one per row.
 */
/**
 * @param {object} fixtureServer A started `createViteFixtureServer`.
 * @param {{url: string, readySelector: string, selectors: Record<string, string>}} view The fixture
 *   page (given `?width=`), the selector that marks it mounted, and the boxes to measure by name.
 * @param {number} width The host's width; the viewport is 40px wider and 900px tall.
 * @returns {Promise<Record<string, object>>}
 */
export async function railFooterGeometry(fixtureServer, { url, readySelector, selectors }, width) {
  const page = await fixtureServer.newPage({ viewport: { width: width + 40, height: 900 } });
  try {
    const address = new URL(fixtureServer.url(url));
    address.searchParams.set('width', String(width));
    await page.goto(address.href);
    await page.waitForSelector(readySelector);
    const boxes = await page.evaluate((named) => {
      const measure = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`no element for ${selector}`);
        const { left, top, right, bottom } = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left,
          top,
          right,
          bottom,
          borderLeft: style.borderLeftWidth,
          borderTop: style.borderTopWidth,
          radius: style.borderRadius,
          childMiddles: [...element.children].map((child) => {
            const box = child.getBoundingClientRect();
            return (box.top + box.bottom) / 2;
          }),
        };
      };
      return Object.fromEntries(
        Object.entries(named).map(([name, selector]) => [name, measure(selector)])
      );
    }, selectors);
    return boxes;
  } finally {
    await page.close();
  }
}
