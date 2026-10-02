/**
 * The Fabricate palette a View Lab frame renders under (issue 2151). A case names it as `theme`, the
 * driver carries it as the `theme` query flag, and the page applies it through the production
 * `applyFabricateTheme` rather than a copy of what that function does.
 */
import {
  FABRICATE_THEME_ATTRIBUTE,
  applyFabricateTheme,
  normalizeFabricateTheme,
} from '../../src/ui/theme.js';

/**
 * @param {URLSearchParams} params The page's query.
 * @returns {string|null} The palette the query names, or null when it names none.
 * @throws {Error} When it names a palette Fabricate does not ship, which would otherwise render the
 *   default palette under a themed case's name.
 */
export function readLabTheme(params) {
  const themeId = params.get('theme');
  if (themeId === null) return null;
  if (normalizeFabricateTheme(themeId) !== themeId) {
    throw new Error(`view lab: unknown Fabricate theme "${themeId}"`);
  }
  return themeId;
}

/**
 * Apply a palette to the document element and every `.fabricate` root, and again whenever a root
 * mounts later without it — a dialog or popover a step opens after the page is ready.
 *
 * @param {string|null} themeId The palette, or null to leave the page as it is.
 * @param {Document} [doc] The lab page.
 * @returns {MutationObserver|null} The observer re-applying it, or null when there is no palette.
 */
export function installLabTheme(themeId, doc = globalThis.document) {
  if (!themeId) return null;
  const apply = () => applyFabricateTheme(themeId, doc.documentElement);
  const unthemed = `.fabricate:not([${FABRICATE_THEME_ATTRIBUTE}="${themeId}"])`;
  apply();
  const observer = new doc.defaultView.MutationObserver(() => {
    if (doc.querySelector(unthemed)) apply();
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  return observer;
}
