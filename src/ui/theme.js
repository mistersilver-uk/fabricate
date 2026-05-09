export const FABRICATE_THEME_ATTRIBUTE = 'data-fabricate-theme';

export const FABRICATE_THEME_IDS = Object.freeze({
  FABRICATE: 'fabricate',
  MYTHWRIGHT: 'mythwright',
  IRONBLOOD_FORGE: 'ironblood-forge',
  HEARTH_HERB: 'hearth-herb',
  STARGLASS_ARCANA: 'starglass-arcana',
  FOUNDRY_NATIVE: 'foundry-native'
});

export const DEFAULT_FABRICATE_THEME = FABRICATE_THEME_IDS.FABRICATE;

export const FABRICATE_THEME_CHOICES = Object.freeze({
  [FABRICATE_THEME_IDS.FABRICATE]: 'Fabricate',
  [FABRICATE_THEME_IDS.MYTHWRIGHT]: 'Mythwright',
  [FABRICATE_THEME_IDS.IRONBLOOD_FORGE]: 'Ironblood Forge',
  [FABRICATE_THEME_IDS.HEARTH_HERB]: 'Hearth & Herb',
  [FABRICATE_THEME_IDS.STARGLASS_ARCANA]: 'Starglass Arcana',
  [FABRICATE_THEME_IDS.FOUNDRY_NATIVE]: 'Foundry Native'
});

const validThemeIds = new Set(Object.values(FABRICATE_THEME_IDS));
const FABRICATE_APP_ROOT_SELECTOR = '.fabricate';

function setFabricateThemeAttribute(target, themeId) {
  target?.setAttribute?.(FABRICATE_THEME_ATTRIBUTE, themeId);
}

function resolveThemeDocument(root) {
  if (root?.documentElement) return root;
  return root?.ownerDocument ?? globalThis.document;
}

export function normalizeFabricateTheme(themeId) {
  return validThemeIds.has(themeId) ? themeId : DEFAULT_FABRICATE_THEME;
}

export function applyFabricateTheme(themeId, root = globalThis.document?.documentElement) {
  const normalizedThemeId = normalizeFabricateTheme(themeId);
  const documentRef = resolveThemeDocument(root);
  const targets = new Set();

  targets.add(documentRef?.documentElement);
  if (root?.setAttribute) {
    targets.add(root);
  }

  for (const appRoot of documentRef?.querySelectorAll?.(FABRICATE_APP_ROOT_SELECTOR) ?? []) {
    targets.add(appRoot);
  }

  for (const target of targets) {
    setFabricateThemeAttribute(target, normalizedThemeId);
  }

  return normalizedThemeId;
}

export function applyCurrentFabricateTheme(getSetting, themeSettingKey) {
  const themeId = typeof getSetting === 'function' ? getSetting(themeSettingKey) : undefined;
  return applyFabricateTheme(themeId);
}
