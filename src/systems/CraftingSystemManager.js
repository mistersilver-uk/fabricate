/**
 * Manages crafting systems and their item libraries
 */
export class CraftingSystemManager {
  constructor(recipeManager) {
    this.recipeManager = recipeManager;
    this.systems = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const saved = game.settings.get('fabricate-v2', 'craftingSystems') || [];
    for (const system of saved) {
      const normalized = this._normalizeSystem(system);
      this.systems.set(normalized.id, normalized);
    }
    this.initialized = true;
  }

  _assertGM(action) {
    if (!game.user?.isGM) {
      throw new Error(`GM permissions required: ${action}`);
    }
  }

  _normalizeSystem(system = {}) {
    return {
      id: system.id || foundry.utils.randomID(),
      name: system.name || 'New Crafting System',
      description: system.description || '',
      enabled: system.enabled !== false,
      difficulty: system.difficulty || {
        base: 10,
        tierWeight: 0,
        tagWeights: {},
        essenceWeights: {}
      },
      tiers: Array.isArray(system.tiers) ? system.tiers : ['common', 'uncommon', 'rare', 'legendary'],
      tags: Array.isArray(system.tags) ? system.tags : [],
      essences: Array.isArray(system.essences) ? system.essences : [],
      categories: Array.isArray(system.categories) ? system.categories : [],
      items: Array.isArray(system.items) ? system.items.map(i => this._normalizeItem(i)) : []
    };
  }

  _normalizeItem(item = {}) {
    return {
      id: item.id || foundry.utils.randomID(),
      name: item.name || 'Unnamed Item',
      img: item.img || 'icons/svg/item-bag.svg',
      sourceUuid: item.sourceUuid || null,
      tier: item.tier || null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      essences: item.essences || {}
    };
  }

  async save() {
    const payload = Array.from(this.systems.values());
    await game.settings.set('fabricate-v2', 'craftingSystems', payload);
  }

  getSystems() {
    return Array.from(this.systems.values());
  }

  getSystem(systemId) {
    return this.systems.get(systemId) || null;
  }

  getItems(systemId, search = '') {
    const system = this.getSystem(systemId);
    if (!system) return [];
    if (!search) return [...system.items];
    const q = search.toLowerCase();
    return system.items.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.sourceUuid || '').toLowerCase().includes(q)
    );
  }

  async createSystem(data = {}) {
    this._assertGM('create crafting system');
    const system = this._normalizeSystem(data);
    this.systems.set(system.id, system);
    await this.save();
    return system;
  }

  async updateSystem(systemId, updates = {}) {
    this._assertGM('update crafting system');
    const current = this.getSystem(systemId);
    if (!current) throw new Error(`Crafting system not found: ${systemId}`);
    const merged = this._normalizeSystem({ ...current, ...updates, id: systemId });
    this.systems.set(systemId, merged);
    await this.save();
    return merged;
  }

  async deleteSystem(systemId) {
    this._assertGM('delete crafting system');
    if (!this.systems.has(systemId)) {
      throw new Error(`Crafting system not found: ${systemId}`);
    }
    this.systems.delete(systemId);

    // Disable or detach recipes that pointed to this crafting system.
    const affected = this.recipeManager.getRecipes({}).filter(r => r.craftingSystemId === systemId);
    for (const recipe of affected) {
      await this.recipeManager.updateRecipe(recipe.id, {
        craftingSystemId: null,
        enabled: false
      });
    }

    await this.save();
  }

  async createItem(systemId, data = {}) {
    this._assertGM('create system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const item = this._normalizeItem(data);
    system.items.push(item);
    await this.save();
    return item;
  }

  async addItemFromUuid(systemId, itemUuid) {
    this._assertGM('add system item from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const existing = system.items.find(i => i.sourceUuid === itemUuid);
    if (existing) return existing;

    let source = null;
    try {
      source = await fromUuid(itemUuid);
    } catch (err) {
      source = null;
    }

    const item = this._normalizeItem({
      name: source?.name || itemUuid.split('.').pop() || 'Imported Item',
      img: source?.img || 'icons/svg/item-bag.svg',
      sourceUuid: itemUuid
    });

    system.items.push(item);
    await this.save();
    return item;
  }

  async updateItem(systemId, itemId, updates = {}) {
    this._assertGM('update system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const idx = system.items.findIndex(i => i.id === itemId);
    if (idx < 0) throw new Error(`System item not found: ${itemId}`);
    system.items[idx] = this._normalizeItem({ ...system.items[idx], ...updates, id: itemId });
    await this.save();
    return system.items[idx];
  }

  async deleteItem(systemId, itemId) {
    this._assertGM('delete system item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const before = system.items.length;
    system.items = system.items.filter(i => i.id !== itemId);
    if (system.items.length === before) return false;

    // Remove item references from recipes in this system and clean up empty groups.
    const recipes = this.recipeManager.getRecipes({}).filter(r => r.craftingSystemId === systemId);
    for (const recipe of recipes) {
      const updated = recipe.toJSON();
      updated.ingredientSets = (updated.ingredientSets || [])
        .map(set => ({
          ...set,
          ingredients: (set.ingredients || []).filter(ing => ing.systemItemId !== itemId),
          catalysts: (set.catalysts || []).filter(cat => cat.systemItemId !== itemId)
        }))
        .filter(set => (set.ingredients?.length || 0) > 0 || Object.keys(set.essences || {}).length > 0);

      updated.catalysts = (updated.catalysts || []).filter(cat => cat.systemItemId !== itemId);
      updated.results = (updated.results || []).filter(res => res.systemItemId !== itemId);

      if (updated.ingredientSets.length === 0 || updated.results.length === 0) {
        updated.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, updated);
    }

    await this.save();
    return true;
  }
}
