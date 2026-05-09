export const FABRICATE_THEME_ATTRIBUTE = 'data-fabricate-theme';

export const FABRICATE_THEME_IDS = Object.freeze({
  FABRICATE: 'fabricate',
  MYTHWRIGHT: 'mythwright'
});

export const DEFAULT_FABRICATE_THEME = FABRICATE_THEME_IDS.FABRICATE;

export const FABRICATE_THEME_CHOICES = Object.freeze({
  [FABRICATE_THEME_IDS.FABRICATE]: 'Fabricate',
  [FABRICATE_THEME_IDS.MYTHWRIGHT]: 'Mythwright'
});

const validThemeIds = new Set(Object.values(FABRICATE_THEME_IDS));

export function normalizeFabricateTheme(themeId) {
  return validThemeIds.has(themeId) ? themeId : DEFAULT_FABRICATE_THEME;
}

export function applyFabricateTheme(themeId, root = globalThis.document?.documentElement) {
  const normalizedThemeId = normalizeFabricateTheme(themeId);
  root?.setAttribute?.(FABRICATE_THEME_ATTRIBUTE, normalizedThemeId);
  return normalizedThemeId;
}

export function applyCurrentFabricateTheme(getSetting, themeSettingKey) {
  const themeId = typeof getSetting === 'function' ? getSetting(themeSettingKey) : undefined;
  return applyFabricateTheme(themeId);
}
