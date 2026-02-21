const DEFAULT_MODULE_ID = 'fabricate';

function normalizeBasePath(path) {
  return String(path || '').replace(/[\\/]+$/, '');
}

function toModuleRelativePath(path) {
  const normalized = String(path || '').replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/modules/');
  if (idx >= 0) {
    return normalized.slice(idx + 1);
  }
  if (normalized.startsWith('modules/')) {
    return normalized;
  }
  return null;
}

function detectFromLoadedModuleCollection() {
  const modulesCollection = globalThis.game?.modules;
  if (!modulesCollection) return null;
  const modules = Array.from(modulesCollection.values?.() || modulesCollection);
  if (modules.length === 0) return null;

  const byId = modules.find(m => m?.id === 'fabricate');
  if (byId?.path) {
    return toModuleRelativePath(byId.path) || normalizeBasePath(byId.path);
  }

  const byTitle = modules.find((m) =>
    typeof m?.title === 'string' &&
    m.title.toLowerCase().startsWith('fabricate')
  );
  if (byTitle?.path) {
    return toModuleRelativePath(byTitle.path) || normalizeBasePath(byTitle.path);
  }

  return null;
}

function detectFromRuntimeScriptUrl() {
  const rawUrl = String(import.meta?.url || '');
  if (!rawUrl) return null;
  const decoded = decodeURIComponent(rawUrl).replace(/\\/g, '/');
  const match = decoded.match(/\/modules\/([^/]+)\/dist\/main\.js(?:\?|#|$)/i);
  if (!match) return null;
  return `modules/${match[1]}`;
}

export function getModuleBasePath() {
  const loadedPath = detectFromLoadedModuleCollection();
  if (loadedPath) return normalizeBasePath(loadedPath);

  const scriptDerived = detectFromRuntimeScriptUrl();
  if (scriptDerived) return normalizeBasePath(scriptDerived);

  return `modules/${DEFAULT_MODULE_ID}`;
}

export function getTemplatePath(fileName) {
  return `${getModuleBasePath()}/templates/${fileName}`;
}

export function getPartialTemplatePath(fileName) {
  return `${getModuleBasePath()}/templates/partials/${fileName}`;
}
