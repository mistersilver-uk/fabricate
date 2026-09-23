/**
 * The pure presentation model behind the four TOOL screens of epic 1357 (issue 1373): the BREAK
 * MODE authored at world scope and overridable per system, plus the catalogue's sorts and search.
 * The tri-state selects on the AUTHORING LAYER (`source === 'system' ? systemAuthority :
 * 'inherit'`), because a REDUNDANT override is indistinguishable from an inherit by token alone.
 */

import {
  DEFAULT_TOOL_BREAKAGE_AUTHORITY,
  TOOL_BREAKAGE_AUTHORITIES,
  TOOL_SEEDED_SECTIONS,
} from '../../../../../systems/toolScope.js';
import { WORLD_SCOPE_DESCRIPTORS } from '../../../stores/worldScopeProjection.js';

/** The tri-state's third value. NOT an authority token: it drives a CLEAR, not a store. */
export const INHERIT_BREAK_MODE = 'inherit';

/** The glyph each segment leads with, for the WORLD card alone; inherit is a SYSTEM segment. */
export const TOOL_BREAK_MODE_ICONS = Object.freeze({
  toolSpecific: 'fas fa-screwdriver-wrench',
  checkDriven: 'fas fa-dice-d20',
});

/** Per-token copy: the segment label and the lang key it is localized under. */
const BREAK_MODE_COPY = Object.freeze({
  toolSpecific: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific',
    label: 'Tool-specific',
  }),
  checkDriven: Object.freeze({
    key: 'FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven',
    label: 'Check-driven',
  }),
});

/** A recognized authority token, or `''`. */
export function toolBreakModeToken(value) {
  return typeof value === 'string' && TOOL_BREAKAGE_AUTHORITIES.includes(value) ? value : '';
}

/** One token's label; an unrecognized one reads as `resolveToolBreakageAuthority`'s fallback. */
export function toolBreakModeLabel(authority, text) {
  const copy = BREAK_MODE_COPY[toolBreakModeToken(authority) || DEFAULT_TOOL_BREAKAGE_AUTHORITY];
  return text(copy.key, copy.label);
}

/**
 * The WORLD catalogue's TWO-state break-mode model; nothing sits above the world to inherit from.
 * An unauthored world selects the shipped fallback, the value every system actually resolves to.
 */
export function worldBreakModeOptions(worldAuthority, text) {
  const authored = toolBreakModeToken(worldAuthority) || DEFAULT_TOOL_BREAKAGE_AUTHORITY;
  return TOOL_BREAKAGE_AUTHORITIES.map((value) => ({
    value,
    label: toolBreakModeLabel(value, text),
    icon: TOOL_BREAK_MODE_ICONS[value],
    selected: authored === value,
  }));
}

/** The inherit segment's label: what the world actually says, named. */
export function inheritBreakModeLabel(worldAuthority, text) {
  const authored = toolBreakModeToken(worldAuthority);
  const template = authored
    ? text('FABRICATE.Admin.Manager.Tools.AuthorityInheritWorld', 'World default - {label}')
    : text('FABRICATE.Admin.Manager.Tools.AuthorityInheritDefault', 'Inherit - {label} (default)');
  return template.replace('{label}', toolBreakModeLabel(authored, text));
}

/** The SYSTEM list's TRI-STATE model; `selected` is read off `source`, never off the tokens. */
export function systemBreakModeOptions({ worldAuthority, systemAuthority, source, text }) {
  const authored = source === 'system' ? toolBreakModeToken(systemAuthority) : '';
  return [
    {
      value: INHERIT_BREAK_MODE,
      label: inheritBreakModeLabel(worldAuthority, text),
      selected: authored === '',
    },
    ...TOOL_BREAKAGE_AUTHORITIES.map((value) => ({
      value,
      label: toolBreakModeLabel(value, text),
      selected: authored === value,
    })),
  ];
}

/** Which layer the answer came from — THREE states, since `default` credits the world with none. */
export function breakModeSourcePill(source, text) {
  if (source === 'system') {
    return {
      state: 'system',
      tone: 'warning',
      label: text('FABRICATE.Admin.Manager.Tools.AuthorityPillOverridden', 'Overridden here'),
    };
  }
  if (source === 'world') {
    return {
      state: 'world',
      tone: 'info',
      label: text('FABRICATE.Admin.Manager.Tools.AuthorityPillWorld', 'World default'),
    };
  }
  return {
    state: 'default',
    tone: 'info',
    label: text('FABRICATE.Admin.Manager.Tools.AuthorityPillDefault', 'Fabricate default'),
  };
}

/** Whether the roster can answer the override count at all; `0` off an absent field is wrong. */
export function breakModeOverridesKnown(systems) {
  return (
    Array.isArray(systems) &&
    systems.some((system) => system && typeof system === 'object' && 'toolBreakage' in system)
  );
}

/** How many systems author a break mode that DIFFERS from the world's; agreement is no override. */
export function breakModeOverrideCount(systems, worldAuthority) {
  const world = toolBreakModeToken(worldAuthority) || DEFAULT_TOOL_BREAKAGE_AUTHORITY;
  if (!Array.isArray(systems)) return 0;
  return systems.filter((system) => {
    const authored = toolBreakModeToken(system?.toolBreakage?.authority);
    return authored !== '' && authored !== world;
  }).length;
}

/** The entry's section tabs, READ FROM THE DESCRIPTOR; the seeded section is appended, not cut. */
export function worldToolSectionTabs() {
  const descriptor = WORLD_SCOPE_DESCRIPTORS.tool;
  return [...(descriptor?.sections ?? []), ...TOOL_SEEDED_SECTIONS];
}

/** Whether one world-default section is SEEDED rather than inherited. */
export function isSeededToolSection(section) {
  return TOOL_SEEDED_SECTIONS.includes(section);
}

/** The catalogue's searchable string; it adds the SOURCE ITEM uuids the shared default cannot see. */
export function worldToolSearchText(entry) {
  const entity = entry?.entity ?? null;
  const name = typeof entity?.name === 'string' ? entity.name : '';
  const description = typeof entity?.description === 'string' ? entity.description : '';
  const origin = typeof entity?.originItemUuid === 'string' ? entity.originItemUuid : '';
  const registered =
    typeof entity?.registeredItemUuid === 'string' ? entity.registeredItemUuid : '';
  return `${name} ${description} ${origin} ${registered}`.toLowerCase();
}

/** The name a row falls back to when a sort ties. */
function nameOf(entry) {
  const name = entry?.entity?.name;
  return typeof name === 'string' && name.trim() ? name : String(entry?.id ?? '');
}

/**
 * The catalogue's ONE extra sort, by breakage summary; its label function is INJECTED because a
 * summary is `tools/toolStudio.js`'s answer and this is a leaf. Ties fall back to the name.
 */
export function worldToolSorts(text, labelOf) {
  return [
    {
      id: 'break-asc',
      label: text('FABRICATE.Admin.Manager.Tools.SortBreakage', 'Breakage'),
      compare: (left, right) => {
        const order = String(labelOf(left)).localeCompare(String(labelOf(right)));
        if (order !== 0) return order;
        return nameOf(left).localeCompare(nameOf(right));
      },
    },
  ];
}
