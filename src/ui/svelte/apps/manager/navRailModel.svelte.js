/**
 * The manager navigation rail's group expansion and its collapse seam (issue 1717). Every input is
 * a THUNK: the two route inputs because each caller value is itself a `$derived` and must be read
 * inside this module's own `$derived.by` to subscribe across the boundary, and `services` because
 * reading the root's prop in the call expression would capture its initial value under
 * `state_referenced_locally`. `expanded` is user intent OR the route lock, so a locked group
 * renders open before `syncLocks()` has recorded that intent; and `collapsedDisplay` is
 * display-only, so a locked-open rail reads expanded without overwriting the stored preference.
 */
const RAIL_GROUP_IDS = Object.freeze([
  'crafting',
  'checks',
  'gathering',
  'worldTravel',
  'worldRules',
  'worldDowntime',
]);

export function createNavRailModel({ services: servicesSeam, groupLocks, railLocked } = {}) {
  const services = servicesSeam?.();
  const userExpanded = $state({
    crafting: false,
    checks: false,
    gathering: false,
    worldTravel: false,
    worldRules: false,
    worldDowntime: false,
  });
  let collapsed = $state(services?.getSetting?.('managerRailCollapsed') === true);

  const lockedOpen = $derived.by(() => groupLocks?.() ?? {});
  const expanded = $derived.by(() => {
    const locks = lockedOpen;
    return {
      crafting: userExpanded.crafting || locks.crafting === true,
      checks: userExpanded.checks || locks.checks === true,
      gathering: userExpanded.gathering || locks.gathering === true,
      worldTravel: userExpanded.worldTravel || locks.worldTravel === true,
      worldRules: userExpanded.worldRules || locks.worldRules === true,
      worldDowntime: userExpanded.worldDowntime || locks.worldDowntime === true,
    };
  });
  const railLockedOpen = $derived.by(() => railLocked?.() === true);
  const collapsedDisplay = $derived.by(() => collapsed && !railLockedOpen);

  // Belt and braces beside the `disabled` attribute: the lock is a rule about state, not about
  // one control, so it holds for a programmatic call too.
  function toggleRail() {
    if (railLockedOpen) return;
    collapsed = !collapsed;
    services?.setSetting?.('managerRailCollapsed', collapsed);
  }

  function toggleGroup(group, event) {
    event?.stopPropagation?.();
    if (lockedOpen[group]) return;
    userExpanded[group] = !userExpanded[group];
  }

  function expandGroup(group) {
    userExpanded[group] = true;
  }

  function setGroupExpanded(group, on) {
    userExpanded[group] = on;
  }

  // Entering a sub-tab also records the INTENT, so the group stays open when the GM later
  // navigates away instead of snapping shut behind them.
  function syncLocks() {
    const locks = lockedOpen;
    for (const group of RAIL_GROUP_IDS) {
      if (locks[group]) userExpanded[group] = true;
    }
  }

  return {
    get lockedOpen() {
      return lockedOpen;
    },
    get expanded() {
      return expanded;
    },
    get collapsed() {
      return collapsed;
    },
    get collapsedDisplay() {
      return collapsedDisplay;
    },
    get railLockedOpen() {
      return railLockedOpen;
    },
    toggleRail,
    toggleGroup,
    expandGroup,
    setGroupExpanded,
    syncLocks,
  };
}
