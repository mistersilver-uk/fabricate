/**
 * The pure presentation model behind the four COMPONENT screens of epic 1357 (issue 1371).
 *
 * The sibling of `essenceScoped.js` and `worldToolStudio.js`: it decides nothing about
 * persistence, renders nothing, and reads no Foundry global. Every string it answers is built
 * through a caller-supplied localizer, so a unit test needs no localization seam and the module
 * stays a leaf.
 *
 * `scopedStudio.js` is deliberately NOT reopened. It answers the questions every scoped entity
 * shares — is this type enableable, what is a section called — and a component-only note, badge
 * or staging model has no business there.
 *
 * ## Why a category note branches on the WORLD VALUE and never on the switch
 *
 * `applyInheritedSections` writes a world default onto an inheriting row only when the world
 * default HOLDS one: an unauthored world `category` applies nothing, so an inheriting system
 * keeps its own value. A note that branched on the switch first would tell such a system it is
 * "following the world value" over a value that does not exist. {@link componentCategoryNote}
 * therefore tests the world value before it tests the switch, and
 * {@link componentCategoryInheritOffered} withholds the `Inherit from world` option entirely in
 * that state — an option whose label interpolates an empty world value, and which resolves back
 * to the in-system value the moment it is chosen, is a control that changes nothing while looking
 * as though it did.
 *
 * ## Why the shared-system counts are clamped
 *
 * The attribution sentence states how many OTHER systems share this component's identity, which
 * is the member count minus one. A component with NO membership record — every component on a
 * world that has not adopted it anywhere, and every ghost row — would otherwise render
 * `shared with -1 other systems`. Both sentences here clamp at zero and both pluralise.
 */

import { isGeneralComponentCategory } from '../../../../../utils/componentCategories.js';

/**
 * The row's searchable text: the world record's name, its description and its world tags.
 *
 * The tag list is included because it is authored on the entry and displayed on the row's own
 * inspector, so a GM who tagged a component expects to find it by that tag.
 *
 * @param {object|null} entry
 * @returns {string}
 */
export function componentSearchText(entry) {
  const entity = entry?.entity ?? {};
  const tags = Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : [];
  return [entity.name ?? '', entity.description ?? '', ...tags]
    .join(' ')
    .toLowerCase()
    .trim();
}

/**
 * How many crafting systems actually HAVE this component.
 *
 * Read off the projection's own membership count rather than `entry.systems.length`: that array
 * carries one row per system in the world, member or not, so its length is the SYSTEM COUNT and
 * would state the same number on every row.
 *
 * @param {object|null} entry
 * @returns {number}
 */
export function componentMemberCount(entry) {
  return Number(entry?.membershipCount) || 0;
}

/**
 * The catalogue's ONE lane filter: whether the record names a source Item.
 *
 * `hasSourceLink` answers PRESENCE and never resolution — see `componentScopeValidation.js` for
 * why a resolution answer is not the projection's to give — so the two options are exactly the
 * two states presence has.
 *
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<object>}
 */
export function componentSourceFilters(phrase) {
  return [
    {
      id: 'source-type',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterSource', 'Source item'),
      options: [
        {
          value: 'all',
          label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterSourceAll', 'Any source'),
        },
        {
          value: 'linked',
          label: phrase('FABRICATE.Admin.Manager.Scoped.Component.FilterSourceLinked', 'Linked'),
        },
        {
          value: 'unlinked',
          label: phrase(
            'FABRICATE.Admin.Manager.Scoped.Component.FilterSourceUnlinked',
            'Not linked'
          ),
        },
      ],
      matches: (entry, value) =>
        value === 'linked' ? entry?.hasSourceLink === true : entry?.hasSourceLink !== true,
    },
  ];
}

/**
 * The name a row falls back to when a sort ties, so the order is total and a re-project cannot
 * shuffle equal rows.
 *
 * @param {object|null} entry
 * @returns {string}
 */
function nameOf(entry) {
  const name = entry?.entity?.name;
  return typeof name === 'string' && name.trim() ? name : String(entry?.id ?? '');
}

/**
 * The catalogue's ONE lane sort: linked records before unlinked ones.
 *
 * ONE descriptor, with no `-desc` twin, and that is a decision rather than an omission. The
 * shell's direction control is a TOGGLE that inerts against any lane sort id, so a `-desc` twin
 * would be a second select standing beside a greyed toggle. Name, and the system-count sort, are
 * the frame's own and are not restated here.
 *
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<{id: string, label: string, compare: (left: object, right: object) => number}>}
 */
export function componentSorts(phrase) {
  return [
    {
      id: 'source-type',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.SortSource', 'Source item'),
      compare: (left, right) => {
        const order = Number(right?.hasSourceLink === true) - Number(left?.hasSourceLink === true);
        if (order !== 0) return order;
        return nameOf(left).localeCompare(nameOf(right));
      },
    },
  ];
}

/**
 * The row's two reach stats and its one flag.
 *
 * BOTH STATS ARE MUTED TEXT rather than chips, and that follows the shipped tool row's stated
 * rule: a chip on that row says what the entity DOES, and both of these say how far it REACHES,
 * which is a different kind of fact. The component row has nothing in the first category at all —
 * no category chip and no tag run — so it draws no chip.
 *
 * The `Systems` phrase is the shipped shared one, so two world catalogues cannot word one reach
 * two ways; only the `Recipes` count is this lane's.
 *
 * @param {object|null} entry
 * @param {number} systemCount the world's crafting-system roster size.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{stats: Array<{id: string, text: string}>, flag: string}}
 */
export function componentRowStats(entry, systemCount, phrase) {
  const members = componentMemberCount(entry);
  const recipes = Number(entry?.recipeCount) || 0;
  return {
    stats: [
      {
        id: 'recipes',
        text: phrase(
          recipes === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Component.RecipeCountOne'
            : 'FABRICATE.Admin.Manager.Scoped.Component.RecipeCount',
          recipes === 1 ? '{count} recipe' : '{count} recipes',
          { count: recipes }
        ),
      },
      {
        id: 'systems',
        text: phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.MemberFraction',
          '{members}/{systems} systems',
          { members, systems: Number(systemCount) || 0 }
        ),
      },
    ],
    // NOT `Broken link`. That flag would need a resolution answer, which the projection does not
    // hold; `Unused` is answered exactly by the membership count.
    flag:
      members === 0
        ? phrase('FABRICATE.Admin.Manager.Scoped.Component.FlagUnused', 'Unused')
        : '',
  };
}

/**
 * The inspector's two reach lines: how far the component reaches and which systems it reaches.
 *
 * @param {object|null} entry
 * @param {Array<{id: string, name: string}>} systems
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{useText: string, useDetail: string}}
 */
export function componentUseSummary(entry, systems, phrase) {
  const rows = Array.isArray(entry?.systems) ? entry.systems : [];
  const memberNames = rows
    .filter((row) => row?.member === true)
    .map((row) => String(row?.systemName || row?.systemId || ''));
  const total = Array.isArray(systems) ? systems.length : rows.length;
  if (memberNames.length === 0) {
    return {
      useText: phrase('FABRICATE.Admin.Manager.Scoped.Component.UseNone', 'No system uses it'),
      useDetail: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.UseNoneDetail',
        'Registered but unreferenced'
      ),
    };
  }
  const shown = memberNames.slice(0, 3).join(', ');
  const remainder = memberNames.length - 3;
  return {
    useText: phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.UseCount',
      'Rules in {members} of {systems} systems',
      { members: memberNames.length, systems: total }
    ),
    useDetail:
      remainder > 0
        ? phrase('FABRICATE.Admin.Manager.Scoped.Component.UseMore', '{names} +{count} more', {
            names: shown,
            count: remainder,
          })
        : shown,
  };
}

/**
 * The world entry's category note, which states the reach of the value BEFORE the write lands.
 *
 * The inherit count counts MEMBERS ONLY, matching the projection: a system with no membership
 * record does not have the component, so editing the world default changes nothing for it.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentWorldCategoryNote(entry, phrase) {
  const members = componentMemberCount(entry);
  if (members === 0) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryNoneNote',
      'No system has rules for this yet.'
    );
  }
  const inheriting = Number(entry?.inheritCounts?.category) || 0;
  const overriding = members - inheriting;
  return phrase(
    'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryNote',
    '{inheriting} of {members} systems inherit it · {overriding} override locally.',
    { inheriting, members, overriding }
  );
}

/**
 * The world entry's tag note, which states the reach of the tag list and its exceptions.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentWorldTagNote(entry, phrase) {
  const tags = Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : [];
  if (tags.length === 0) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsNoneNote',
      'No world tags. Each system relies on its own list.'
    );
  }
  const muting = (Array.isArray(entry?.systems) ? entry.systems : []).filter(
    (row) => row?.member === true && Array.isArray(row?.mutedTags) && row.mutedTags.length > 0
  ).length;
  const applied = phrase(
    tags.length === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsAppliedOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsApplied',
    tags.length === 1 ? '{count} world tag applied' : '{count} world tags applied',
    { count: tags.length }
  );
  const qualifier =
    muting > 0
      ? phrase(
          muting === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsMutedOne'
            : 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsMuted',
          muting === 1 ? ' · muted in {count} system' : ' · muted in {count} systems',
          { count: muting }
        )
      : phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsEverywhere',
          ' in every system that has rules'
        );
  return `${applied}${qualifier}`;
}

/**
 * The system-scope category note, in its three branches.
 *
 * THE THIRD BRANCH IS `!worldCategory`, NOT `!inheriting`. See the module header.
 *
 * The inheriting branch takes the INFO tone rather than the prototype's raw hex, which has no
 * Fabricate token and would trip the colour gate besides; the overriding branch keeps the warning
 * ink the prototype gives it, and the unauthored branch is muted.
 *
 * @param {object} options
 * @param {unknown} options.worldCategory the world default, or absence.
 * @param {boolean} options.inheriting whether this system's switch is on.
 * @param {string} options.systemName
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{state: string, icon: string, tone: string, text: string}}
 */
export function componentCategoryNote({ worldCategory, inheriting, systemName }, phrase) {
  const world = String(worldCategory ?? '').trim();
  if (!world) {
    return {
      state: 'unset',
      icon: 'fas fa-circle-info',
      tone: 'muted',
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.CatNoteUnset',
        'No world category is set, so this system supplies its own.'
      ),
    };
  }
  if (inheriting) {
    return {
      state: 'inherited',
      icon: 'fas fa-earth-americas',
      tone: 'info',
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.CatNoteInherited',
        'Following the world value. Change it in the catalogue entry and every inheriting system follows.'
      ),
    };
  }
  return {
    state: 'overridden',
    icon: 'fas fa-code-branch',
    tone: 'warning',
    text: phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.CatNoteOverridden',
      'Overriding the world value ({category}) for {system} only.',
      { category: world, system: systemName }
    ),
  };
}

/**
 * Whether the `Inherit from world` OPTION is offered at all.
 *
 * @param {unknown} worldCategory
 * @returns {boolean}
 */
export function componentCategoryInheritOffered(worldCategory) {
  return String(worldCategory ?? '').trim() !== '';
}

/**
 * The catalogue attribution banner's sentence, on either of the two system screens.
 *
 * TWO SENTENCES, NOT ONE, because the two screens say different things: the rules LIST states
 * where identity comes from, and the rules EDITOR adds what does belong to the system it is
 * editing. Both clamp at zero and both pluralise.
 *
 * IT DOES NOT CLAIM THE DISPLAYED NAME COMES FROM THE CATALOGUE, because under the read union it
 * does not: identity is re-derived from the in-system record on every row. It states where
 * identity is AUTHORED, which is true today.
 *
 * @param {object} options
 * @param {'list'|'editor'} options.surface
 * @param {number} options.memberCount how many systems hold this component.
 * @param {string} [options.systemName]
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentAttributionNote({ surface, memberCount, systemName = '' }, phrase) {
  const others = Math.max(0, (Number(memberCount) || 0) - 1);
  const one = others === 1;
  if (surface === 'editor') {
    return phrase(
      one
        ? 'FABRICATE.Admin.Manager.Component.SharedNoteEditorOne'
        : 'FABRICATE.Admin.Manager.Component.SharedNoteEditor',
      one
        ? 'Name, image and description are authored in the world catalogue and shared with {count} other system. Everything below belongs to {system} alone.'
        : 'Name, image and description are authored in the world catalogue and shared with {count} other systems. Everything below belongs to {system} alone.',
      { count: others, system: systemName }
    );
  }
  return phrase(
    one
      ? 'FABRICATE.Admin.Manager.Component.SharedNoteListOne'
      : 'FABRICATE.Admin.Manager.Component.SharedNoteList',
    one
      ? 'Name, art and description are authored in the world catalogue and shared with {count} other system.'
      : 'Name, art and description are authored in the world catalogue and shared with {count} other systems.',
    { count: others }
  );
}

/**
 * The standing disclosure both scopes carry.
 *
 * It is narrower than "nothing here is read" and narrower than "everything here is read", because
 * both would be false: the world `category` IS consumed by every system whose switch is on, while
 * the world identity and the world tag list are authored here and displayed nowhere else yet.
 * MUTING is named explicitly, because a per-system mute is a membership write the identity
 * sentence does not cover and a control that reads its own state back looks live in a way an
 * unwritten field does not.
 *
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentWorldScopeDisclosure(phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Scoped.Component.DisclosureNote',
    'The world name, art, description and tag list — and per-system tag muting — are authored here and are not read by any crafting system yet. The world category IS read: every system inheriting it resolves from this value.'
  );
}

/**
 * The delete control's sentence, in its two branches.
 *
 * The IN-USE branch is REFUSAL copy rather than the prototype's proceed copy: this lane refuses a
 * delete while any system holds a membership record, so a sentence describing a delete that
 * happens would describe the wrong outcome. It names what to do instead, because on a migrated
 * world every component that existed at `1.30.0` is a member everywhere and the refusal is the
 * normal state rather than an edge case.
 *
 * @param {string[]} systemNames the member systems, in roster order.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{refused: boolean, text: string}}
 */
export function componentDeleteNote(systemNames, phrase) {
  const names = (Array.isArray(systemNames) ? systemNames : []).map((name) => String(name ?? ''));
  if (names.length === 0) {
    return {
      refused: false,
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.DeleteFree',
        'No system has rules for this entry, so nothing else is affected.'
      ),
    };
  }
  const shown = names.slice(0, 3).join(', ');
  const remainder = names.length - 3;
  const list =
    remainder > 0
      ? phrase('FABRICATE.Admin.Manager.Scoped.Component.DeleteReachMore', '{names} and {count} more', {
          names: shown,
          count: remainder,
        })
      : shown;
  return {
    refused: true,
    text: phrase(
      names.length === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.DeleteRefusedOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.DeleteRefused',
      names.length === 1
        ? '{count} system has rules for this component, so it cannot be deleted yet. Remove it from that system first: {systems}.'
        : '{count} systems have rules for this component, so it cannot be deleted yet. Remove it from each system first: {systems}.',
      { count: names.length, systems: list }
    ),
  };
}

/**
 * The system rules list's three membership filters, each carrying its count.
 *
 * `Overriding` carries no count: it is a predicate over the member cohort rather than a cohort of
 * its own, and a count beside it would have to be recomputed per row state.
 *
 * @param {{members: number, world: number}} counts
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<{id: string, label: string}>}
 */
export function componentMembershipFilters({ members, world }, phrase) {
  return [
    {
      id: 'in',
      label: phrase(
        'FABRICATE.Admin.Manager.Component.FilterInSystem',
        'In this system ({count})',
        { count: Number(members) || 0 }
      ),
    },
    {
      id: 'all',
      label: phrase(
        'FABRICATE.Admin.Manager.Component.FilterAllWorld',
        'All world components ({count})',
        { count: Number(world) || 0 }
      ),
    },
    {
      id: 'over',
      label: phrase('FABRICATE.Admin.Manager.Component.FilterOverriding', 'Overriding'),
    },
  ];
}

/**
 * What one system rules row says about its relationship to the world default, or `null` when the
 * world corpus has no record of this component and there is therefore nothing to inherit FROM.
 *
 * `null` is a real answer rather than a fallback: a component that exists only in this system
 * inherits nothing, and writing "Inherits world category" over it would claim a parent that does
 * not exist.
 *
 * A component draws ONE section, so the label names it directly rather than listing sections.
 *
 * @param {object|null} systemRow the world projection's row for this `(component, system)` pair.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{state: string, label: string}|null}
 */
export function componentInheritState(systemRow, phrase) {
  if (!systemRow || systemRow.member !== true) return null;
  if (systemRow.inherited?.category === false) {
    return {
      state: 'overridden',
      label: phrase(
        'FABRICATE.Admin.Manager.Component.RowOverridesCategory',
        'Overrides world category'
      ),
    };
  }
  return {
    state: 'inherited',
    label: phrase(
      'FABRICATE.Admin.Manager.Component.RowInheritsCategory',
      'Inherits world category'
    ),
  };
}

/**
 * The rules editor's tag merge note.
 *
 * `{effective}` is the IN-SYSTEM effective tag count and NEVER the additive merge, so the note
 * and the card it sits under agree: the merge is resolver-only and the read union's trailing
 * in-system re-spread discards it, so a note counting the merge would state a number no system
 * resolves.
 *
 * @param {{effective: number, muted: number}} counts
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentTagMergeNote({ effective, muted }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.TagMergeNote',
    '{effective} tags in effect here · {muted} world tags muted',
    { effective: Number(effective) || 0, muted: Number(muted) || 0 }
  );
}

/**
 * The world category OPTIONS a picker may offer, with the reserved bucket removed.
 *
 * THE REFUSAL IS THE SHIPPED CASE-INSENSITIVE PREDICATE, never `!== 'general'`. `General` and
 * ` GENERAL ` are the same category downstream: `resolveComponentCategory` would treat either as
 * authored, `applyInheritedSections` would then write it onto every inheriting row, and every
 * inheriting system would reset to the reserved bucket on the first resolve. A plain-equality
 * implementation lets both variants through and is green against any fixture that spells the
 * bucket one way.
 *
 * Trimmed, de-duplicated case-sensitively after the refusal, and sorted, so the picker's order
 * does not follow corpus order.
 *
 * @param {unknown} vocabulary the categories already authored across the world corpus.
 * @returns {string[]}
 */
export function offeredWorldComponentCategories(vocabulary) {
  const seen = new Set();
  const offered = [];
  for (const raw of Array.isArray(vocabulary) ? vocabulary : []) {
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (!label || isGeneralComponentCategory(label) || seen.has(label)) continue;
    seen.add(label);
    offered.push(label);
  }
  return offered.sort((left, right) => left.localeCompare(right));
}

/**
 * The world category vocabulary the corpus already carries, for the two pickers that offer it.
 *
 * There is no world category ROSTER to read: the World Vocabulary store that will publish one is
 * PR 7's, and the narrowed `{id, name}` system roster cannot carry a vocabulary. The union of
 * what is actually authored is therefore the honest list, and free entry covers the rest.
 *
 * @param {object|null} scope the component family's world-scope projection.
 * @returns {string[]}
 */
export function authoredWorldComponentCategories(scope) {
  return offeredWorldComponentCategories(
    (Array.isArray(scope?.entries) ? scope.entries : []).map((entry) => entry?.defaults?.category)
  );
}

/**
 * The bulk panel's FOUR staging groups, as a model rather than as markup.
 *
 * The panel renders them; this decides what they are, what each one's inert value is, and which
 * write each staged value forwards to. Keeping the axis list here is what lets the mounted
 * criterion assert the ACTION NAME beside the arguments without reading the panel's internals.
 *
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<{id: string, action: string, label: string}>}
 */
export function componentBulkGroups(phrase) {
  return [
    {
      id: 'membership',
      // The action is decided by the MODE, so it is stated per mode rather than here; see
      // `componentBulkMembershipModes`.
      action: '',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkMembership', 'System membership'),
    },
    {
      id: 'systems',
      action: '',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkSystems', 'Systems'),
    },
    {
      id: 'category',
      action: 'updateWorldDefaultSection',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkCategory', 'World category'),
    },
    {
      id: 'tags',
      action: 'setWorldTags',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkTags', 'World tags'),
    },
  ];
}

/**
 * The membership group's two modes and the note each one states.
 *
 * `Add to` and `Remove from` are one keystroke apart and destructive in ONE direction, so the
 * mode's note names the direction rather than restating the label.
 *
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<{id: string, action: string, label: string, note: string}>}
 */
export function componentBulkMembershipModes(phrase) {
  return [
    {
      id: 'add',
      action: 'addToSystem',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkAddTo', 'Add to'),
      note: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkAddNote',
        'Every selected component gains rules in each chosen system, inheriting the world category.'
      ),
    },
    {
      id: 'remove',
      action: 'removeFromSystem',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveFrom', 'Remove from'),
      note: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveNote',
        'Every selected component loses its rules in each chosen system. The world record is untouched.'
      ),
    },
  ];
}

/**
 * How many writes an Apply will make, stated BEFORE it runs.
 *
 * The membership group is N components by M systems, so a selection of twelve across three
 * systems is thirty-six replicated setting writes; a panel that did not say so would look like
 * one action.
 *
 * @param {object} staged
 * @param {number} staged.selected
 * @param {number} staged.systems
 * @param {boolean} staged.category
 * @param {boolean} staged.tags
 * @returns {number}
 */
export function componentBulkWriteCount({ selected, systems, category, tags }) {
  const rows = Number(selected) || 0;
  const systemCount = Number(systems) || 0;
  return rows * systemCount + (category ? rows : 0) + (tags ? rows : 0);
}
