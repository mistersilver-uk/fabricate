export const RECIPE_AVAILABILITY_STATES = Object.freeze({
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  LOCKED: 'locked'
});

export function getRecipeAvailabilityState(recipe = {}) {
  if (recipe?.enabled === false) {
    return RECIPE_AVAILABILITY_STATES.DISABLED;
  }

  if (recipe?.locked === true) {
    return RECIPE_AVAILABILITY_STATES.LOCKED;
  }

  return RECIPE_AVAILABILITY_STATES.ENABLED;
}

export function getRecipeAvailabilityFlags(state) {
  switch (state) {
    case RECIPE_AVAILABILITY_STATES.DISABLED:
      return { enabled: false, locked: false };
    case RECIPE_AVAILABILITY_STATES.LOCKED:
      return { enabled: true, locked: true };
    case RECIPE_AVAILABILITY_STATES.ENABLED:
    default:
      return { enabled: true, locked: false };
  }
}

export function applyRecipeAvailabilityState(target, state) {
  const flags = getRecipeAvailabilityFlags(state);
  target.enabled = flags.enabled;
  target.locked = flags.locked;
  return target;
}
