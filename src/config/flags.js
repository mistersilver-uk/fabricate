export const FABRICATE_FLAG_NAMESPACE = 'fabricate';

function normalizeFlagKey(key) {
  const rawKey = String(key || '');
  if (!rawKey) return 'fabricate';
  return rawKey.startsWith('fabricate.') ? rawKey : `fabricate.${rawKey}`;
}

export function getFabricateFlag(document, key, defaultValue = null) {
  if (!document || typeof document.getFlag !== 'function') {
    return defaultValue;
  }

  try {
    const value = document.getFlag(FABRICATE_FLAG_NAMESPACE, normalizeFlagKey(key));
    return value !== undefined && value !== null ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setFabricateFlag(document, key, value) {
  if (!document || typeof document.setFlag !== 'function') {
    return null;
  }

  try {
    return await document.setFlag(FABRICATE_FLAG_NAMESPACE, normalizeFlagKey(key), value);
  } catch {
    return null;
  }
}
