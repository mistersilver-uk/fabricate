/**
 * Base adapter interface for game-system-specific crafting checks.
 * Implementors should extend this class and override getAbilities(), getSkills(), and executeCheck().
 */
export class CraftingCheckAdapter {
  constructor(systemId) {
    this.systemId = systemId;
  }

  /** @returns {Array<{key: string, label: string}>} */
  getAbilities() {
    return [];
  }

  /** @returns {Array<{key: string, label: string}>} */
  getSkills() {
    return [];
  }

  /**
   * Execute a crafting check for the given actor and configuration.
   * @param {object} actor - The crafting actor
   * @param {object} config - The builtIn check config { ability, skill, dc, advantage }
   * @returns {Promise<{success: boolean, outcome: string|null, value: number|null, data: object}>}
   */
  async executeCheck(_actor, _config) {
    throw new Error('Not implemented');
  }
}

/**
 * dnd5e system adapter for built-in crafting checks.
 * Uses actor.rollAbilityCheck() or actor.rollSkill() depending on config.skill.
 */
export class Dnd5eCraftingCheckAdapter extends CraftingCheckAdapter {
  constructor() {
    super('dnd5e');
  }

  getAbilities() {
    return [
      { key: 'str', label: 'Strength' },
      { key: 'dex', label: 'Dexterity' },
      { key: 'con', label: 'Constitution' },
      { key: 'int', label: 'Intelligence' },
      { key: 'wis', label: 'Wisdom' },
      { key: 'cha', label: 'Charisma' },
    ];
  }

  getSkills() {
    return [
      { key: 'acr', label: 'Acrobatics' },
      { key: 'ani', label: 'Animal Handling' },
      { key: 'arc', label: 'Arcana' },
      { key: 'ath', label: 'Athletics' },
      { key: 'dec', label: 'Deception' },
      { key: 'his', label: 'History' },
      { key: 'ins', label: 'Insight' },
      { key: 'itm', label: 'Intimidation' },
      { key: 'inv', label: 'Investigation' },
      { key: 'med', label: 'Medicine' },
      { key: 'nat', label: 'Nature' },
      { key: 'prc', label: 'Perception' },
      { key: 'prf', label: 'Performance' },
      { key: 'per', label: 'Persuasion' },
      { key: 'rel', label: 'Religion' },
      { key: 'slt', label: 'Sleight of Hand' },
      { key: 'ste', label: 'Stealth' },
      { key: 'sur', label: 'Survival' },
    ];
  }

  async executeCheck(actor, config) {
    const { ability, skill, dc, advantage } = config || {};
    const rollOptions = {};
    if (advantage === 'advantage') rollOptions.advantage = true;
    if (advantage === 'disadvantage') rollOptions.disadvantage = true;

    let roll;
    try {
      roll = await (skill
        ? actor.rollSkill(skill, rollOptions)
        : actor.rollAbilityCheck(ability, rollOptions));
    } catch (error) {
      throw new Error(`dnd5e check failed: ${error.message}`, { cause: error });
    }

    if (!roll) {
      return { success: false, outcome: null, value: null, data: {} };
    }

    const total = roll.total ?? roll._total ?? 0;
    const success = total >= (dc ?? 15);
    return {
      success,
      outcome: success ? 'pass' : 'fail',
      value: total,
      data: { roll },
    };
  }
}

/**
 * Registry for CraftingCheckAdapter implementations.
 * Allows game systems to register custom adapters and the engine to retrieve them.
 */
export const CraftingCheckAdapterRegistry = {
  _adapters: new Map(),

  /**
   * Register an adapter class for a game system ID.
   * @param {string} systemId
   * @param {typeof CraftingCheckAdapter} adapterClass
   */
  register(systemId, adapterClass) {
    this._adapters.set(systemId, adapterClass);
  },

  /**
   * Get an instantiated adapter for the given system ID, or null if not registered.
   * @param {string} systemId
   * @returns {CraftingCheckAdapter|null}
   */
  get(systemId) {
    const AdapterClass = this._adapters.get(systemId);
    if (!AdapterClass) return null;
    return new AdapterClass();
  },

  /**
   * Returns true if an adapter is registered for the given system ID.
   * @param {string} systemId
   * @returns {boolean}
   */
  has(systemId) {
    return this._adapters.has(systemId);
  },

  /**
   * Auto-register known adapters based on the current game system.
   * Called during module initialization.
   */
  initialize() {
    const gameSystemId = typeof game === 'undefined' ? null : game.system?.id;
    if (gameSystemId === 'dnd5e') {
      this.register('dnd5e', Dnd5eCraftingCheckAdapter);
    }
  },
};
