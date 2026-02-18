export const FABRICATE_FLAG_NAMESPACE = 'fabricate';
export const LEGACY_FLAG_NAMESPACE = 'fabricate-v2';

export function getFabricateFlag(document, key, defaultValue = null) {
  if (!document || typeof document.getFlag !== 'function') {
    return defaultValue;
  }

  const current = document.getFlag(FABRICATE_FLAG_NAMESPACE, key);
  if (current !== undefined && current !== null) {
    return current;
  }

  const legacy = document.getFlag(LEGACY_FLAG_NAMESPACE, key);
  if (legacy !== undefined && legacy !== null) {
    return legacy;
  }

  return defaultValue;
}

export async function setFabricateFlag(document, key, value) {
  if (!document || typeof document.setFlag !== 'function') {
    return null;
  }
  return document.setFlag(FABRICATE_FLAG_NAMESPACE, key, value);
}

