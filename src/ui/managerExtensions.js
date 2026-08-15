export const DOWNTIME_TAB_IDS = Object.freeze(['tracking', 'activities', 'factions', 'settings']);

const DOWNTIME_TAB_SEQUENCE = DOWNTIME_TAB_IDS.join(', ');

function validateTab(tab, expectedId, index) {
  if (!tab || typeof tab !== 'object' || tab.id !== expectedId) {
    throw new TypeError(
      `Fabricate manager extension must provide exact ordered tab ids: ${DOWNTIME_TAB_SEQUENCE}`
    );
  }
  for (const field of ['label', 'accessibleName', 'tooltip', 'icon']) {
    if (typeof tab[field] !== 'string' || tab[field].trim() === '') {
      throw new TypeError(`Fabricate manager extension tab ${index} requires a non-empty ${field}`);
    }
  }
}

function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError('Fabricate World navigation provider must be an object');
  }
  if (provider.apiVersion !== 1) {
    throw new TypeError(
      `Unsupported World navigation provider API version: ${String(provider.apiVersion)}`
    );
  }
  if (provider.id !== 'downtime') {
    throw new TypeError(`Unsupported World navigation provider id: "${String(provider.id)}"`);
  }
  if (!Array.isArray(provider.tabs) || provider.tabs.length !== DOWNTIME_TAB_IDS.length) {
    throw new TypeError(
      `Fabricate manager extension must provide exact ordered tab ids: ${DOWNTIME_TAB_SEQUENCE}`
    );
  }
  provider.tabs.forEach((tab, index) => validateTab(tab, DOWNTIME_TAB_IDS[index], index));
  if (typeof provider.mount !== 'function') {
    throw new TypeError('Fabricate World navigation provider mount must be a function');
  }
  if (provider.mount.constructor?.name === 'AsyncFunction') {
    throw new TypeError('Fabricate World navigation provider mount must be synchronous');
  }
}

export function createManagerExtensionsRegistry({ reportError = console.error } = {}) {
  let worldNavProvider = null;
  let registrationToken = null;
  const listeners = new Set();

  function publish() {
    for (const listener of listeners) {
      try {
        listener(worldNavProvider);
      } catch (error) {
        reportError('Fabricate | Manager extension subscriber failed:', error);
      }
    }
  }

  function registerWorldNavProvider(provider) {
    validateProvider(provider);
    if (worldNavProvider) {
      throw new Error(`World navigation provider "${provider.id}" is already registered`);
    }

    const token = {};
    registrationToken = token;
    worldNavProvider = provider;
    publish();

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      if (registrationToken !== token) return;
      registrationToken = null;
      worldNavProvider = null;
      publish();
    };
  }

  const publicApi = Object.freeze({ registerWorldNavProvider });

  return Object.freeze({
    publicApi,
    bindPublicApi(api) {
      if (!api || typeof api !== 'object') {
        throw new TypeError('Fabricate manager extension API target must be an object');
      }
      api.managerExtensions = publicApi;
      return api;
    },
    getWorldNavProvider: () => worldNavProvider,
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('Fabricate manager extension subscriber must be a function');
      }
      listeners.add(listener);
      listener(worldNavProvider);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
  });
}

// One registry per evaluated Fabricate module. `bindFabricateGlobal()` replays the
// same public object at init and ready, so companion registrations survive both binds.
export const managerExtensions = createManagerExtensionsRegistry();
