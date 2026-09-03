/**
 * The pure presentation model behind the four TOOL screens of epic 1357 (issue 1373).
 *
 * The sibling of `scopedStudio.js`: it decides nothing about persistence, reads no Foundry
 * global and renders nothing. What it owns is the one thing the tool family has that neither
 * other scoped entity does - a BREAK MODE authored at world scope and overridable per crafting
 * system - plus the world catalogue's sort and search projections.
 *
 * ## The break mode is THREE values, not one, and a control offering "inherit" needs all three
 *
 * `resolveToolBreakageAuthority` answers the RESOLVED token, and `checkDriven` looks identical
 * whether this system chose it or inherited it. So a tri-state selects on the AUTHORING LAYER:
 *
 *  - `worldAuthority` - what the WORLD authored, or `''` when it authored nothing. It reaches a
 *    system-scope screen through the world-scope projection's `toolBreakage` block, which
 *    `projectWorldScopeEntity` attaches ONLY when the corpus holds one, so `''` is a real answer
 *    rather than a coerced default;
 *  - `systemAuthority` - the RESOLVED token, which is what the shipped surfaces already read;
 *  - `source` - `system` / `world` / `default`, the branch the resolver took.
 *
 * SELECTION IS `source === 'system' ? systemAuthority : 'inherit'`, and that is exact rather
 * than approximate. Deriving it from `resolved !== worldAuthority` would be wrong for a
 * REDUNDANT override - a system that authored the same token the world did - which is exactly
 * the state a GM lands in by clicking the currently-selected segment of the two-state control
 * this replaces.
 *
 * ## `World default -` and `Inherit -` are two labels, and the difference is honesty
 *
 * The prototype's inherit segment reads `World default - <label>` because its fixture always
 * authors a world value. Fabricate has a third state the prototype cannot reach: NOTHING is
 * authored anywhere, and the answer is `DEFAULT_TOOL_BREAKAGE_AUTHORITY`. Calling that a world
 * default would be a lie about a value no GM chose, so the absent branch reads
 * `Inherit - <label> (default)` instead, and the pill beside it says so too.
 *
 * ## The override COUNT is derived here and may be UNANSWERABLE at a call site
 *
 * `{n} systems override it` is the prototype's own
 * `SYS.filter(sy => S.sysBreak[sy.id] && S.sysBreak[sy.id] !== S.wBreakMode).length` - an
 * AUTHORED per-system token that DIFFERS from the world's. A roster that does not carry each
 * system's own `toolBreakage` block cannot answer it, and answering `0` off an absent field is
 * a silently wrong number rather than a missing one. So `breakModeOverridesKnown` is a separate
 * predicate and a caller that cannot answer states nothing instead of guessing.
 */

import {
  DEFAULT_TOOL_BREAKAGE_AUTHORITY,
  TOOL_BREAKAGE_AUTHORITIES,
  TOOL_SEEDED_SECTIONS,
} from '../../../../../systems/toolScope.js';
import { WORLD_SCOPE_DESCRIPTORS } from '../../../stores/worldScopeProjection.js';

/**
 * The tri-state's third value: inherit whatever the world says.
 *
 * NOT a member of {@link TOOL_BREAKAGE_AUTHORITIES}, deliberately - it is the ABSENCE of an
 * authored token, and the write it drives is a CLEAR rather than a store.
 *
 * @type {string}
 */
export const INHERIT_BREAK_MODE = 'inherit';

/**
 * The glyph each segment leads with, for the WORLD card ALONE.
 *
 * The system card's segments carry no glyph, which is the prototype's own composition rather
 * than an omission: the world screen AUTHORS the break mode and leads each choice with the
 * thing it is about, while the system screen is choosing between three provenances of the
 * same value and a glyph there labels the wrong noun. There is consequently no icon for
 * {@link INHERIT_BREAK_MODE}, because inherit is only ever a SYSTEM segment.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TOOL_BREAK_MODE_ICONS = Object.freeze({
  toolSpecific: 'fas fa-screwdriver-wrench',
  checkDriven: 'fas fa-dice-d20',
});

/**
 * Per-token copy: the segment label and the lang key it is localized under.
 *
 * @type {Readonly<Record<string, {key: string, label: string}>>}
 */
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

/**
 * A recognized authority token, or `''`.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toolBreakModeToken(value) {
  return typeof value === 'string' && TOOL_BREAKAGE_AUTHORITIES.includes(value) ? value : '';
}

/**
 * The label one authority token renders under. An unrecognized token reads as the shipped
 * fallback, matching `resolveToolBreakageAuthority`'s own last branch.
 *
 * @param {unknown} authority
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
export function toolBreakModeLabel(authority, text) {
  const copy = BREAK_MODE_COPY[toolBreakModeToken(authority) || DEFAULT_TOOL_BREAKAGE_AUTHORITY];
  return text(copy.key, copy.label);
}

/**
 * The WORLD catalogue's two-state break-mode option model.
 *
 * TWO options, never three: the world is where this value is authored, so there is nothing
 * above it to inherit from.
 *
 * @param {unknown} worldAuthority The world's own token, or anything falsy.
 * @param {(key: string, fallback: string) => string} text
 * @returns {Array<{value: string, label: string, icon: string, selected: boolean}>}
 */
export function worldBreakModeOptions(worldAuthority, text) {
  const authored = toolBreakModeToken(worldAuthority);
  return TOOL_BREAKAGE_AUTHORITIES.map((value) => ({
    value,
    label: toolBreakModeLabel(value, text),
    icon: TOOL_BREAK_MODE_ICONS[value],
    selected: authored === value,
  }));
}

/**
 * The inherit segment's label: what the world actually says, named.
 *
 * @param {unknown} worldAuthority
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
export function inheritBreakModeLabel(worldAuthority, text) {
  const authored = toolBreakModeToken(worldAuthority);
  const template = authored
    ? text('FABRICATE.Admin.Manager.Tools.AuthorityInheritWorld', 'World default - {label}')
    : text('FABRICATE.Admin.Manager.Tools.AuthorityInheritDefault', 'Inherit - {label} (default)');
  return template.replace('{label}', toolBreakModeLabel(authored, text));
}

/**
 * The SYSTEM rules list's TRI-STATE break-mode option model.
 *
 * `selected` is read off `source`, never off a comparison of the two tokens. See the module
 * note: a redundant override is indistinguishable from an inherit by token alone, and it is the
 * exact state the two-state control this replaces mints on a click.
 *
 * @param {object} options
 * @param {unknown} [options.worldAuthority] the world's own token.
 * @param {unknown} [options.systemAuthority] the RESOLVED token published to the screen.
 * @param {unknown} [options.source] `system` / `world` / `default`.
 * @param {(key: string, fallback: string) => string} options.text
 * @returns {Array<{value: string, label: string, selected: boolean}>}
 */
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

/**
 * The pill beside the tri-state: which layer the current answer came from.
 *
 * THREE STATES, not the prototype's two. Its fixture always authors a world value, so
 * `!sysBreak[sysId]` is exactly "inherited from the world" there; here `default` is reachable
 * and naming it `World default` would credit the world with a choice it did not make.
 *
 * @param {unknown} source
 * @param {(key: string, fallback: string) => string} text
 * @returns {{tone: string, label: string, state: string}}
 */
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

/**
 * Whether the crafting-system roster can answer "which systems override the world break mode".
 *
 * IT IS A SEPARATE QUESTION FROM THE COUNT, and that is the point. A roster projected through
 * an allowlist that drops `toolBreakage` answers `0` for every system, which reads as "no
 * system overrides it" and is a WRONG number rather than a missing one. A caller that cannot
 * answer renders nothing.
 *
 * @param {unknown} systems The crafting-system roster.
 * @returns {boolean}
 */
export function breakModeOverridesKnown(systems) {
  return (
    Array.isArray(systems) &&
    systems.some((system) => system && typeof system === 'object' && 'toolBreakage' in system)
  );
}

/**
 * How many crafting systems author a break mode that DIFFERS from the world's.
 *
 * The prototype's own rule, and it is the right one: an authored token that MATCHES the world
 * is not an override a GM needs warning about before they change the world value, because a
 * system that agrees is unaffected either way.
 *
 * @param {unknown} systems The crafting-system roster.
 * @param {unknown} worldAuthority
 * @returns {number}
 */
export function breakModeOverrideCount(systems, worldAuthority) {
  const world = toolBreakModeToken(worldAuthority) || DEFAULT_TOOL_BREAKAGE_AUTHORITY;
  if (!Array.isArray(systems)) return 0;
  return systems.filter((system) => {
    const authored = toolBreakModeToken(system?.toolBreakage?.authority);
    return authored !== '' && authored !== world;
  }).length;
}

/**
 * The world Tool entry's section tab set: the world-default sections, then the SEEDED one.
 *
 * READ FROM THE DESCRIPTOR, never listed. `scopedStudio.js` states the rule for the inherit
 * rows - a screen must not draw a control for a field the resolver does not read through - and
 * the same rule decides which tabs exist. The seeded section is APPENDED rather than filtered
 * out, because the world entry is exactly the screen that authors it; what it does not get is
 * an inherit switch, which `inheritableSections` already withholds.
 *
 * @returns {string[]}
 */
export function worldToolSectionTabs() {
  const descriptor = WORLD_SCOPE_DESCRIPTORS.tool;
  return [...(descriptor?.sections ?? []), ...TOOL_SEEDED_SECTIONS];
}

/**
 * Whether one world-default section is SEEDED rather than inherited.
 *
 * @param {string} section
 * @returns {boolean}
 */
export function isSeededToolSection(section) {
  return TOOL_SEEDED_SECTIONS.includes(section);
}

/**
 * The world tool catalogue's searchable string: the shared name and description, plus the
 * SOURCE ITEM uuids.
 *
 * A tool is the entity type a GM most often looks up by the Item behind it - one record per
 * game-world Item is the catalogue's whole premise - and the shared default cannot see it.
 *
 * @param {object} entry a projected entry.
 * @returns {string}
 */
export function worldToolSearchText(entry) {
  const entity = entry?.entity ?? null;
  const name = typeof entity?.name === 'string' ? entity.name : '';
  const description = typeof entity?.description === 'string' ? entity.description : '';
  const origin = typeof entity?.originItemUuid === 'string' ? entity.originItemUuid : '';
  const registered =
    typeof entity?.registeredItemUuid === 'string' ? entity.registeredItemUuid : '';
  return `${name} ${description} ${origin} ${registered}`.toLowerCase();
}

/**
 * The name a row falls back to when a sort ties.
 *
 * @param {object} entry
 * @returns {string}
 */
function nameOf(entry) {
  const name = entry?.entity?.name;
  return typeof name === 'string' && name.trim() ? name : String(entry?.id ?? '');
}

/**
 * The catalogue's ONE extra sort descriptor: by breakage summary.
 *
 * The prototype's tool sorts are name, USE count and BREAK. The first two are the shared
 * `name-asc` / `name-desc` / `systems-desc` the frame already offers; `break` has no component
 * or essence analogue, so it arrives as a lane descriptor.
 *
 * THE LABEL FUNCTION IS INJECTED rather than derived here, because a breakage summary is
 * `tools/toolStudio.js`'s answer and this module is a leaf that deliberately does not import
 * the manager's tool studio. Ties fall back to the entity name, so the order is total and a
 * re-project cannot shuffle equal rows.
 *
 * @param {(key: string, fallback: string) => string} text
 * @param {(entry: object) => string} labelOf
 * @returns {Array<{id: string, label: string, compare: (left: object, right: object) => number}>}
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
