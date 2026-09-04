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
 *
 * ## Why this module imports ONE leaf and must keep doing so
 *
 * `ComponentEditView.svelte` imports this file, and every mounted suite that renders that view
 * copies the manager's compiled module graph into a hand-rolled tree file by file
 * (`tests/helpers/componentEditViewModules.js`). A module this one imports is a module EVERY
 * such manifest has to carry, and an omission there is reported as `# cancelled`, never as
 * `# fail` — so a new import here breaks five suites in a way that reads as a hang rather than
 * as a failure.
 *
 * That is not hypothetical. This module briefly imported `utils/browserPagination.js` for one
 * bulk-panel helper and took 105 tests down with it across four suites. The helper now lives in
 * `ComponentCatalogueBulkPanel.svelte`, which is mounted only by the catalogue suites, whose
 * manifest already carries the pagination leaf for the list frame.
 * `tests/components/scoped-shell-prop-contract.test.js` pins this file's import list, so the
 * next one fails loudly and HERE rather than quietly and four suites away.
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
 * WHAT KIND OF THING THIS COMPONENT IS BACKED BY, as a sentence rather than as a classification.
 *
 * The reference writes this under the name on both the catalogue inspector and the world entry's
 * header, and in both places it is the SOURCE — `Linked Foundry item`, `Linked Compendium entry`,
 * `No source item` — not the category. The two say different things and only one of them is true
 * of the record itself: a category is a value some system may or may not resolve, and the source
 * is what the entry IS.
 *
 * THE COMPENDIUM BRANCH IS READ OFF THE UUID'S OWN SHAPE, because that is the only place it is
 * recorded: `Compendium.<scope>.<pack>.Item.<id>` is a pack address and `Item.<id>` is a world
 * one, and the projection publishes neither a `pack` field nor a source kind. A uuid this module
 * cannot read at all is reported as an unlinked record rather than guessed at.
 *
 * @param {object|null} entry the projected world entry.
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
export function componentSourceLine(entry, text) {
  const uuid = String(
    entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || ''
  ).trim();
  if (!uuid || entry?.hasSourceLink !== true) {
    return text('FABRICATE.Admin.Manager.Scoped.Component.SourceNone', 'No source item');
  }
  if (uuid.startsWith('Compendium.')) {
    return text(
      'FABRICATE.Admin.Manager.Scoped.Component.SourceCompendium',
      'Linked Compendium entry'
    );
  }
  return text('FABRICATE.Admin.Manager.Scoped.Component.SourceWorld', 'Linked Foundry item');
}

/**
 * The alias note under the inspector's uuid: how many other addresses import will match on.
 *
 * Stated as a sentence in both branches rather than as `0 aliases`, because zero aliases is the
 * NORMAL state of a healthy record and a count reads as a deficiency.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentAliasNote(entry, phrase) {
  const aliases = Array.isArray(entry?.entity?.aliasItemUuids) ? entry.entity.aliasItemUuids : [];
  if (aliases.length === 0) {
    return phrase('FABRICATE.Admin.Manager.Scoped.Component.AliasNoneNote', 'No aliases recorded');
  }
  return phrase(
    aliases.length === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.AliasNoteOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.AliasNote',
    aliases.length === 1 ? '{count} alias recorded' : '{count} aliases recorded',
    { count: aliases.length }
  );
}

/**
 * The `Global tags` card's closing note: where the value LIVES, and how many rule sets exist.
 *
 * IT NO LONGER SAYS `Inherited by all {n} rule sets` (issue 1371, r8 reviewer 5 item 4). The tag
 * merge is not consumed: the read union re-derives identity from the in-system record and `tags`
 * is not a section, so a world tag reaches no system's resolved answer today. A note asserting
 * inheritance was therefore the false half of the merge, which `ui-integration/spec.md`'s
 * `### GM World Component Screens` forbids any surface from stating while it is unconsumed.
 *
 * Both halves of what is left are checkable on the screen the note is on: the tags are set on the
 * WORLD record — this card is that record — and `{n}` is the RULE-SET count, the number of systems
 * that have rules for the component. A count over every system in the world would be a bigger
 * number that is true of nothing.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentGlobalTagNote(entry, phrase) {
  const members = componentMemberCount(entry);
  return phrase(
    members === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.GlobalTagNoteOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.GlobalTagNote',
    members === 1
      ? 'Set on the world record. {count} rule set holds this component.'
      : 'Set on the world record. {count} rule sets hold this component.',
    { count: members }
  );
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
      // BESIDE THE SEARCH FIELD (`proto:578`), which is the frame's default row anyway; it is
      // stated because the membership descriptor below states the other one, and a pair of
      // descriptors where only one answers the question reads as an oversight.
      toolbarRow: 'lead',
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
 * A REVERSIBLE PAIR SHARING ONE OPTION (issue 1371, gap-list row 11). It shipped as one
 * descriptor and therefore as one whole order, which left the frame's direction toggle greyed
 * whenever this sort was chosen — the reference pairs all three of its sort keys with a live
 * direction control (`proto:581`-`584`). The frame composes `${key}-${direction}` for any key it
 * does not hold a descriptor for, so declaring the two ids and naming the shared `optionId` is
 * the whole of it: the select offers one `Source item` entry and the toggle resolves to a real
 * descriptor in both positions. Name, and the system-count sort, are the frame's own and are not
 * restated here.
 *
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<{id: string, label: string, compare: (left: object, right: object) => number}>}
 */
export function componentSorts(phrase) {
  const label = phrase('FABRICATE.Admin.Manager.Scoped.Component.SortSource', 'Source item');
  /**
   * Linked before unlinked, or the reverse, with the NAME tie-break running in the same
   * direction either way — so reversing the sort key does not also shuffle equal rows.
   *
   * @param {number} direction `1` for linked-first, `-1` for unlinked-first.
   * @returns {(left: object, right: object) => number}
   */
  const bySource = (direction) => (left, right) => {
    const order =
      (Number(right?.hasSourceLink === true) - Number(left?.hasSourceLink === true)) * direction;
    if (order !== 0) return order;
    return nameOf(left).localeCompare(nameOf(right));
  };
  return [
    { id: 'source-type-asc', optionId: 'source-type', label, compare: bySource(1) },
    { id: 'source-type-desc', optionId: 'source-type', label, compare: bySource(-1) },
  ];
}

/**
 * The row's two reach stats, as a VALUE over a LABEL rather than as a sentence.
 *
 * TWO COLUMNS, WHICH IS A DIFFERENT CLAIM FROM TWO PHRASES (issue 1371, gap-list row 16). The row
 * read `8 recipes 2/6 systems` as muted body text inside the identity button; the reference draws
 * two right-aligned columns, each a mono numeral over an 8px uppercase micro-label
 * (`proto:606`-`608`). A column of numerals is scannable down the list and a run of sentences is
 * not, which is the whole reason the reference spends the row width on it.
 *
 * Both are still REACH facts rather than behaviour facts, so neither is a chip: a chip beside a
 * name reads as something the entity DOES, and a component's behaviour is a membership fact that
 * belongs to no world row at all.
 *
 * The `Systems` VALUE is the shipped shared fraction phrase, so two world catalogues cannot word
 * one reach two ways; the labels are this lane's.
 *
 * @param {object|null} entry
 * @param {number} systemCount the world's crafting-system roster size.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{stats: Array<{id: string, value: string, label: string}>}}
 */
export function componentRowStats(entry, systemCount, phrase) {
  const members = componentMemberCount(entry);
  const recipes = Number(entry?.recipeCount) || 0;
  return {
    stats: [
      {
        id: 'recipes',
        value: String(recipes),
        label: phrase('FABRICATE.Admin.Manager.Scoped.Component.RecipeStatLabel', 'Recipes'),
      },
      {
        id: 'systems',
        value: phrase('FABRICATE.Admin.Manager.Scoped.Component.MemberRatio', '{members}/{systems}', {
          members,
          systems: Number(systemCount) || 0,
        }),
        label: phrase('FABRICATE.Admin.Manager.Scoped.Component.SystemStatLabel', 'Systems'),
      },
    ],
  };
}

/**
 * WHAT KIND OF SOURCE the row's pill names, in the two words the reference puts on it.
 *
 * `componentSourceLine` answers the INSPECTOR's sentence — `Linked Foundry item` — and this
 * answers the ROW's pill, which sits after the name inside a 999px chip and has room for two
 * words (`proto:601`). Same three states, read off the same uuid shape, so the two can only
 * disagree about wording and never about the record.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
export function componentSourceType(entry, text) {
  const uuid = String(
    entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || ''
  ).trim();
  if (!uuid || entry?.hasSourceLink !== true) {
    return text('FABRICATE.Admin.Manager.Scoped.Component.SourceNone', 'No source item');
  }
  if (uuid.startsWith('Compendium.')) {
    return text('FABRICATE.Admin.Manager.Scoped.Component.SourceTypePack', 'Compendium');
  }
  return text('FABRICATE.Admin.Manager.Scoped.Component.SourceTypeWorld', 'Foundry item');
}

/**
 * Does this record's source link DANGLE — a world address naming an Item the world no longer has?
 *
 * ── WHY THIS IS ANSWERABLE HERE AND NOT IN THE PROJECTION ─────────────────────────────────────
 * `hasSourceLink` answers PRESENCE and deliberately never resolution: the projection holds no
 * document roster and must not reach for one. The catalogue PAGE does hold one — `worldItems`,
 * the game-world Item roster it already carries for the create zone and for a row whose world
 * record has no description of its own — so resolution is answerable exactly where the roster is.
 *
 * ── AND WHY A COMPENDIUM ADDRESS IS NEVER REPORTED BROKEN ─────────────────────────────────────
 * `worldItems` is the WORLD's items. A `Compendium.<scope>.<pack>.Item.<id>` address is not in it
 * and never will be, so testing one against the roster would flag every pack-linked component as
 * dangling — a false alarm on the majority of a module-shipped corpus. Only a world address is
 * checkable from here, so only a world address is checked; a pack address answers `false`, which
 * is "not known to be broken" rather than "known to be sound", and the row says nothing about it.
 *
 * @param {object|null} entry
 * @param {Array<{uuid?: string}>} worldItems the game-world Item roster.
 * @returns {boolean}
 */
export function componentSourceBroken(entry, worldItems) {
  const roster = Array.isArray(worldItems) ? worldItems : [];
  // AN EMPTY ROSTER IS "NOT KNOWN", NEVER "ALL BROKEN". A call site whose Item roster has not
  // been extended to this route hands over `[]` — the defect the page's own `worldItems` note
  // records against the tool screens — and testing every address against an empty list would
  // flag EVERY linked component on the screen at once. The loudest possible false alarm is
  // exactly the failure a resolution answer must not have, so no roster means no claim.
  if (roster.length === 0) return false;
  if (entry?.hasSourceLink !== true) return false;
  const uuid = String(
    entry?.entity?.registeredItemUuid || entry?.entity?.originItemUuid || ''
  ).trim();
  if (!uuid || uuid.startsWith('Compendium.')) return false;
  return !roster.some((item) => item?.uuid === uuid);
}

/**
 * The catalogue's SYSTEM-RELATIVE membership filter, as a lane descriptor.
 *
 * ── FOUR OPTIONS, AND WHY THEY ARE THE LANE'S RATHER THAN THE FRAME'S ─────────────────────────
 * `proto:578`-`586` draws `Any system` / `Has rules in {system}` / `No rules in {system}` /
 * `In no system at all`. The frame's own membership vocabulary is one of two closed sets — a
 * world catalogue's `all|member|unused` or a system list's `all|in|out` — and this is neither: it
 * is the union, asked on a world catalogue that nonetheless has a system in scope, because the
 * rail shows one selected at all times. Adding a third vocabulary to the shared model would make
 * every scoped list carry a case it can never reach, so the four options are a lane FILTER, which
 * is the seam the frame already publishes for exactly this.
 *
 * ── THE SYSTEM-RELATIVE PAIR IS WITHHELD WHEN NO SYSTEM IS IN SCOPE ───────────────────────────
 * `Has rules in ` with nothing after it is worse than an absent option, and a predicate keyed on
 * an empty id would match nothing and read as a corpus of zero.
 *
 * @param {{systemId: string, systemName: string}} addressed the rail's selected system.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {Array<object>}
 */
export function componentMembershipScopeFilter({ systemId, systemName }, phrase) {
  const addressed = String(systemId ?? '').trim();
  const named = String(systemName ?? '').trim() || addressed;
  const memberOf = (entry) =>
    (Array.isArray(entry?.systems) ? entry.systems : []).some(
      (row) => String(row?.systemId ?? '') === addressed && row?.member === true
    );
  const options = [
    {
      value: 'all',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.MembershipAny', 'Any system'),
    },
    ...(addressed
      ? [
          {
            value: 'in',
            label: phrase(
              'FABRICATE.Admin.Manager.Scoped.Component.MembershipIn',
              'Has rules in {system}',
              { system: named }
            ),
          },
          {
            value: 'out',
            label: phrase(
              'FABRICATE.Admin.Manager.Scoped.Component.MembershipOut',
              'No rules in {system}',
              { system: named }
            ),
          },
        ]
      : []),
    {
      value: 'orphan',
      label: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.MembershipOrphan',
        'In no system at all'
      ),
    },
  ];
  const label = phrase('FABRICATE.Admin.Manager.Scoped.Component.MembershipLabel', 'Membership');
  return [
    {
      id: 'membership',
      label,
      // THE REFERENCE LABELS THIS ONE VISIBLY (`proto:579`) and the source select not at all, so
      // the micro-label is a per-descriptor answer rather than a rule about lane filters.
      microLabel: label,
      toolbarRow: 'filters',
      options,
      matches: (entry, value) => {
        if (value === 'orphan') return componentMemberCount(entry) === 0;
        if (!addressed) return true;
        if (value === 'in') return memberOf(entry);
        if (value === 'out') return !memberOf(entry);
        return true;
      },
    },
  ];
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
  // TWO CLAUSES, PLURALISED INDEPENDENTLY (issue 1371, round 3). The single composed sentence read
  // `0 of 1 systems inherit it · 1 override locally.` on the commonest state of all — a component
  // exactly one system has — which is wrong twice in eleven words. The clauses pluralise on
  // DIFFERENT counts (`members` and `overriding`), so one key with one plural rule cannot be right
  // for both, and a composed string is one a translator cannot reorder either. Same four-key shape
  // and same reasoning as `componentTagMergeNote` two functions down.
  const left = phrase(
    members === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryInheritOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryInherit',
    members === 1 ? '{inheriting} of {members} system inherits it' : '{inheriting} of {members} systems inherit it',
    { inheriting, members }
  );
  const right = phrase(
    overriding === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryOverrideOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldCategoryOverride',
    overriding === 1 ? '{overriding} overrides locally.' : '{overriding} override locally.',
    { overriding }
  );
  return `${left} · ${right}`;
}

/**
 * The world entry's tag note: how many world tags this record carries, and any mute against them.
 *
 * ── IT DOES NOT CLAIM REACH, AND THAT IS THE POINT ───────────────────────────────────────────
 * It used to close ` in every system that has rules` whenever nothing was muted, and that
 * sentence was FALSE. World tags are merged by the resolver only; the read union discards them,
 * so no system sees this list yet. A note that told the GM the opposite is worse than no note —
 * it invites them to tag here instead of in the system that actually reads a tag.
 *
 * The mute clause SURVIVES, because it is a statement about DATA rather than about reach: a
 * world migrated from an earlier version can carry `mutedTags` on a membership record, and while
 * `setMutedTags` has no caller anywhere under `src/` (grep: the definition and three comments,
 * no call site) the entry draws no mute surface, so this note is the only place that data is
 * visible at all. Deleting the clause would hide it rather than correct it.
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
  // `WorldTagsSet`, not `…Applied`: the key is renamed with the sentence on purpose. A key still
  // named for the claim the sentence used to make is how the claim comes back.
  const applied = phrase(
    tags.length === 1
      ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsSetOne'
      : 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsSet',
    tags.length === 1
      ? '{count} world tag set on this record'
      : '{count} world tags set on this record',
    { count: tags.length }
  );
  // NO `else` BRANCH. "Nothing is muted" is not news, and the sentence that used to fill this
  // slot was the false reach claim; an empty qualifier leaves a note that says only what is true.
  const qualifier =
    muting > 0
      ? phrase(
          muting === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsMutedOne'
            : 'FABRICATE.Admin.Manager.Scoped.Component.WorldTagsMuted',
          muting === 1 ? ' · muted in {count} system' : ' · muted in {count} systems',
          { count: muting }
        )
      : '';
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
 * ── THE `entry` SURFACE COUNTS DIFFERENTLY, AND IT HAS TO ────────────────────────────────────
 * The other two subtract one, because "other" means "other than the system you are editing" — a
 * referent the WORLD ENTRY does not have. On that screen the subtraction made a component held by
 * three systems read "shared with 2 other systems", and made the zero-member and one-member states
 * render identical copy. So the entry states the MEMBER count directly, with its own zero branch.
 *
 * @param {object} options
 * @param {'list'|'editor'|'entry'} options.surface
 * @param {number} options.memberCount how many systems hold this component.
 * @param {string} [options.systemName]
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentAttributionNote({ surface, memberCount, systemName = '' }, phrase) {
  const members = Number(memberCount) || 0;
  if (surface === 'entry') {
    if (members === 0) {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.SharedNoteEntryNone',
        'No system has rules for this component yet.'
      );
    }
    return phrase(
      members === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.SharedNoteEntryOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.SharedNoteEntry',
      members === 1
        ? 'Shared by the {count} system that has rules for this component.'
        : 'Shared by the {count} systems that have rules for this component.',
      { count: members }
    );
  }
  const others = Math.max(0, members - 1);
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
 * WHICH OF A BULK SELECTION CAN ACTUALLY BE DELETED, and which systems are holding the rest.
 *
 * ── WHY THE BULK PANEL REFUSES AT ALL (epic decision 7) ──────────────────────────────────────
 * The world Component ENTRY refuses to delete a record any system still has rules for
 * ({@link componentDeleteNote}), and it refuses because the delete is not recoverable: the world
 * record, its defaults and every system's rules for it go together, and every recipe that names
 * it stops resolving. The bulk panel deleted the same records without asking, so the SAME record
 * was undeletable one screen away and deletable in a tick-box — and the tick-box is the path a
 * GM reaches with twenty rows selected and no per-row sentence in front of them.
 *
 * So the panel refuses the same members the entry does. It refuses them INDIVIDUALLY rather than
 * refusing the whole instruction, because a mixed selection is the normal one: a GM ticking a
 * page of rows to clear out the unused ones should not have the whole delete withheld by one row
 * that is in use, and should not be left guessing WHICH row that was. The plan therefore answers
 * both halves — what will be deleted, and what was skipped and by whom — and the panel prints
 * the second half where the consequence note already stands.
 *
 * MEMBERSHIP IS READ OFF THE JOIN ROWS, not off `membershipCount`, because the refusal has to
 * NAME the systems and the count cannot. `componentMemberCount` stays the reader for anything
 * that only counts.
 *
 * @param {Array<object>} entries the catalogue's projected entries.
 * @param {string[]} entityIds the ticked rows, in list order.
 * @returns {{deletable: string[], blocked: Array<{id: string, name: string, systemNames: string[]}>}}
 */
export function componentBulkDeletePlan(entries, entityIds) {
  const wanted = new Set((Array.isArray(entityIds) ? entityIds : []).map((id) => String(id ?? '')));
  const deletable = [];
  const blocked = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = String(entry?.id ?? '');
    if (!id || !wanted.has(id)) continue;
    const systemNames = (Array.isArray(entry?.systems) ? entry.systems : [])
      .filter((row) => row?.member === true)
      .map((row) => String(row?.systemName || row?.systemId || ''))
      .filter(Boolean);
    if (systemNames.length === 0) {
      deletable.push(id);
    } else {
      blocked.push({
        id,
        name: String(entry?.entity?.name ?? '').trim() || id,
        systemNames,
      });
    }
  }
  return { deletable, blocked };
}

/**
 * The bulk delete's consequence note, in the three states the plan can be in.
 *
 * It is the SAME sentence the free case always carried when nothing is held, so a selection with
 * no members reads exactly as it did. The other two name the skipped components and the systems
 * holding them, because "some were skipped" is a worse answer than no answer: it tells a GM the
 * instruction did not do what they asked without telling them what to do next.
 *
 * The list is capped at three components for the reason {@link componentDeleteNote}'s is: on a
 * migrated world every component that existed at `1.30.0` is a member everywhere, so an uncapped
 * list is a paragraph rather than a sentence.
 *
 * @param {{deletable: string[], blocked: Array<{name: string, systemNames: string[]}>}} plan
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {{refused: boolean, text: string}} `refused` when NOTHING in the selection can go.
 */
export function componentBulkDeleteNote(plan, phrase) {
  const deletable = Array.isArray(plan?.deletable) ? plan.deletable : [];
  const blocked = Array.isArray(plan?.blocked) ? plan.blocked : [];
  if (blocked.length === 0) {
    return {
      refused: false,
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteNote',
        'This removes the world record, its world defaults and every system’s rules for it. Recipes that reference it stop resolving.'
      ),
    };
  }
  const shown = blocked
    .slice(0, 3)
    .map((held) =>
      phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteHeldEntry', '{name} ({systems})', {
        name: held?.name ?? '',
        systems: (Array.isArray(held?.systemNames) ? held.systemNames : []).join(', '),
      })
    )
    .join('; ');
  const remainder = blocked.length - 3;
  const detail =
    remainder > 0
      ? phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.DeleteReachMore',
          '{names} and {count} more',
          { names: shown, count: remainder }
        )
      : shown;
  if (deletable.length === 0) {
    return {
      refused: true,
      text: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteAllHeld',
        'Every selected component still has rules in at least one system, so none of them can be deleted: {detail}. Remove them from those systems first.',
        { detail }
      ),
    };
  }
  return {
    refused: false,
    text: phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkDeleteSkipping',
      'Deletes {deletable} of {count}. {skipped} are skipped because systems still have rules for them: {detail}. Remove them from those systems first. What is deleted goes with its world defaults and every system’s rules for it, and recipes that reference it stop resolving.',
      {
        deletable: deletable.length,
        count: deletable.length + blocked.length,
        skipped: blocked.length,
        detail,
      }
    ),
  };
}

/**
 * The system rules list's cohort filter, as `SegmentedControl` options.
 *
 * -- TWO SEGMENTS, NOT THREE OPTIONS ON A `<select>` ----------------------------------------
 * The reference draws this as an inline two-segment switch -- `In this system ({n})` then
 * `All world components ({m})` -- and never as a dropdown (`proto:1558`, gap-list row 145). The
 * third shipped option, `Overriding`, has no counterpart anywhere in the reference: it is a
 * PREDICATE over the member cohort rather than a cohort of its own, which is why it alone could
 * carry no count, and it is dropped here rather than kept as a subject-only axis.
 *
 * The COUNT IS THE SEGMENT'S OWN `badge`, not part of its label, because the primitive draws it
 * in the mono face the reference sets it in and a label carrying `({n})` would render the number
 * twice on any caller that also passed a count.
 *
 * @param {{members: number, world: number}} counts
 * @returns {Array<{value: string, labelKey: string, fallback: string, badge: number}>}
 */
export function componentMembershipFilters({ members, world }) {
  return [
    {
      value: 'in',
      labelKey: 'FABRICATE.Admin.Manager.Component.FilterInSystem',
      fallback: 'In this system',
      badge: Number(members) || 0,
    },
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Component.FilterAllWorld',
      fallback: 'All world components',
      badge: Number(world) || 0,
    },
  ];
}

/**
 * The system rules list's count line, in the ONE sentence the reference writes for the cohort
 * being shown.
 *
 * TWO SENTENCES, BECAUSE THE REFERENCE WRITES TWO. Showing only this system's components it
 * reads `{shown} of {total} catalogue entries` (`proto:1069`, and the reference frame reads
 * `8 of 14 catalogue entries`). Widened to the whole world corpus the shown count no longer
 * means the same thing, so the reference states membership instead -- `{shown} shown · {mine} of
 * {all} in this system` (`proto:1556`). A single sentence covering both would be true of neither.
 *
 * IT IS COMPUTED OVER THE RENDERED COHORT IN BOTH BRANCHES. The shipped line counted the member
 * PAGE alone, so under `All world components` on a system with no components the toolbar read
 * `0-0 of 0` above a body drawing sixty-six rows.
 *
 * @param {object} counts
 * @param {boolean} counts.allWorld which cohort is on screen.
 * @param {number} counts.shown rows the body is drawing.
 * @param {number} counts.total this system's whole component library.
 * @param {number} counts.mine how many world components this system has rules for.
 * @param {number} counts.all how many components the world corpus holds.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentCohortCountText({ allWorld, shown, total, mine, all }, phrase) {
  if (!allWorld) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.CountCatalogueEntries',
      '{shown} of {total} catalogue entries',
      { shown: Number(shown) || 0, total: Number(total) || 0 }
    );
  }
  return phrase(
    'FABRICATE.Admin.Manager.Component.CountCohort',
    '{shown} shown · {mine} of {all} in this system',
    { shown: Number(shown) || 0, mine: Number(mine) || 0, all: Number(all) || 0 }
  );
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
 * ITS FOUR KEYS ARE `TagCount…`, NOT `TagMerge…` (revision 8). The rendered sentence was already
 * true, but the key NAMES said `merge` — and a key name is what the next author reads when they
 * look for "the string about the tag merge" and then writes one. Renamed with the two subtitles
 * that did assert the merge, so nothing under this card names a merge no system performs.
 *
 * @param {{effective: number, muted: number}} counts
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentTagMergeNote({ effective, muted }, phrase) {
  // BOTH COUNTS PLURALISE, INDEPENDENTLY. Every other note in this module does, and this one read
  // `1 tags in effect here · 1 world tags muted` on the very first frame of the card it heads.
  // Four keys rather than a shared one, because a composed sentence cannot be reordered by a
  // translator and these two clauses are joined by a separator a language may not want.
  const effectiveCount = Number(effective) || 0;
  const mutedCount = Number(muted) || 0;
  const left = phrase(
    effectiveCount === 1
      ? 'FABRICATE.Admin.Manager.Component.TagCountEffectiveOne'
      : 'FABRICATE.Admin.Manager.Component.TagCountEffective',
    effectiveCount === 1 ? '{count} tag in effect here' : '{count} tags in effect here',
    { count: effectiveCount }
  );
  const right = phrase(
    mutedCount === 1
      ? 'FABRICATE.Admin.Manager.Component.TagCountMutedOne'
      : 'FABRICATE.Admin.Manager.Component.TagCountMuted',
    mutedCount === 1 ? '{count} world tag muted' : '{count} world tags muted',
    { count: mutedCount }
  );
  return `${left} · ${right}`;
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
      // THE DIRECTIONAL GLYPHS ARE THE MODEL'S (issue 1371, gap-list row 42). `proto:622`-`623`
      // leads each segment with an arrow INTO or OUT OF a bracket, and the direction is the one
      // thing about this control that must survive a monochrome render: `Add to` and `Remove
      // from` are one click apart and destructive in one of them.
      icon: 'fas fa-arrow-right-to-bracket',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkAddTo', 'Add to'),
      note: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkAddNote',
        'Every selected component gains rules in each chosen system, inheriting the world category.'
      ),
    },
    {
      id: 'remove',
      action: 'removeFromSystem',
      icon: 'fas fa-arrow-right-from-bracket',
      label: phrase('FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveFrom', 'Remove from'),
      note: phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkRemoveNote',
        // THE CASCADE IS DISCLOSED, not just the overrides (issue 1371 r9-cat, lane STORE's
        // sentence). `removeFromSystem` runs the in-system delete through `deleteComponents`,
        // which repairs every reference, disables the recipes left without a usable ingredient
        // set or result, cleans up salvage and reconciles alchemy. The old sentence named only
        // the overrides, so a GM removing twenty components from a system was told the world
        // record was safe and never told their recipes were about to be rewritten.
        'Removing these components from the selected systems also rewrites every recipe in those systems that names them, and disables any recipe left without a usable ingredient set or result. The world record is untouched, and no other system changes.'
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

/**
 * The bulk dock's primary label, which NAMES THE WRITE rather than counting edits.
 *
 * `design-system/spec.md:415` requires a bulk commit action to name the number of records it
 * writes to, and `Apply 2 changes` names neither the records nor the verb — two GMs reading it
 * cannot tell "add these to two systems" from "set a category and a tag". The reference words the
 * unstaged state as an instruction (`Pick systems to add 1 component to`, `proto:685`) and the
 * staged one as the write itself, which is what this returns.
 *
 * FLAT, WITH EARLY RETURNS, on purpose: one branch per staged shape and no nesting, so the
 * function stays inside the cognitive-complexity budget while every shape is a readable line.
 *
 * @param {{count: number, mode: string, systems: number, category: boolean, tags: boolean,
 *   writes: number}} staged
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentBulkApplyLabel(
  { count, mode, systems, category, tags, writes },
  phrase
) {
  const selected = Number(count) || 0;
  const systemCount = Number(systems) || 0;
  const membership = systemCount > 0 && (mode === 'add' || mode === 'remove');
  if (!membership && !category && !tags) {
    if (mode === 'add' || mode === 'remove') {
      return phrase(
        'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyPickSystems',
        'Pick systems to {verb} {count} components',
        {
          count: selected,
          verb: phrase(
            mode === 'add'
              ? 'FABRICATE.Admin.Manager.Scoped.Component.BulkVerbAdd'
              : 'FABRICATE.Admin.Manager.Scoped.Component.BulkVerbRemove',
            mode === 'add' ? 'add' : 'remove'
          ),
        }
      );
    }
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyIdle',
      'Stage a change to write it to {count} components',
      { count: selected }
    );
  }
  if (membership && !category && !tags) {
    return phrase(
      mode === 'add'
        ? 'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyAdd'
        : 'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyRemove',
      mode === 'add'
        ? 'Add {count} components to {systems} systems'
        : 'Remove {count} components from {systems} systems',
      { count: selected, systems: systemCount }
    );
  }
  if (!membership && category && !tags) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyCategory',
      'Set the world category on {count} components',
      { count: selected }
    );
  }
  if (!membership && !category && tags) {
    return phrase(
      'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyTags',
      'Update world tags on {count} components',
      { count: selected }
    );
  }
  return phrase(
    'FABRICATE.Admin.Manager.Scoped.Component.BulkApplyMixed',
    'Write {writes} records across {count} components',
    { writes: Number(writes) || 0, count: selected }
  );
}

// ── THE WORLD CATALOGUE ENTRY'S OWN MODEL (issue 1371, maintainer parity round 4) ─────────────
//
// Everything below answers a question the ENTRY screen asks and no other component surface does:
// what its header band says, what a system row's two lines read, which filters its systems card
// offers, and what its player-preview rail lists. They live here rather than in the page for the
// reason the rest of this module does — a `.svelte` file's derivations are unreachable from a
// unit test, and every one of these has branches a mounted assertion would have to reach through
// the DOM to see.

/**
 * The world tag vocabulary the corpus already carries.
 *
 * THE TWIN OF {@link authoredWorldComponentCategories}, and it exists for the same reason: there
 * is no world tag ROSTER to read. The World Vocabulary store that will publish one is PR 7's, so
 * the union of what is actually authored across every catalogue entry is the honest list, and it
 * is what the entry's classification card offers as toggles.
 *
 * @param {object|null} scope the component family's world-scope projection.
 * @returns {string[]} sorted, de-duplicated, blank-free.
 */
export function authoredWorldComponentTags(scope) {
  const seen = new Set();
  for (const entry of Array.isArray(scope?.entries) ? scope.entries : []) {
    for (const raw of Array.isArray(entry?.defaults?.tags) ? entry.defaults.tags : []) {
      const tag = typeof raw === 'string' ? raw.trim() : '';
      if (tag) seen.add(tag);
    }
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

/**
 * The header band's subtitle: what the record IS, then how far it reaches.
 *
 * The reference heads this screen with the ENTITY rather than with the page name, and states the
 * source type before the reach — a GM opening an entry asks "is this linked, and who uses it" in
 * that order, and the reach alone is true of a broken record too.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string) => string} text
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentEntryHeaderSubtitle(entry, text, phrase) {
  const rows = Array.isArray(entry?.systems) ? entry.systems : [];
  return phrase(
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.HeaderSubtitle',
    '{source} · rules in {members} of {total} systems',
    {
      source: componentSourceLine(entry, text),
      members: rows.filter((row) => row?.member === true).length,
      total: rows.length,
    }
  );
}

/**
 * The resolution-mode labels the entry's system rows carry as their sub-line.
 *
 * KEYED OFF THE ROSTER'S OWN `resolutionMode`, which the admin store's system projection already
 * publishes, rather than off anything this screen resolves. The reference draws four of them;
 * this map carries the SIX the crafting-system model actually has, because a system set to a mode
 * the reference never drew would otherwise render an empty sub-line that reads as "no mode".
 *
 * @type {Readonly<Record<string, readonly [string, string]>>}
 */
const COMPONENT_SYSTEM_MODE_LABELS = Object.freeze({
  simple: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeSimple', 'Simple'],
  progressive: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeProgressive', 'Progressive'],
  routed: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeRouted', 'Routed'],
  routedByIngredients: [
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeRoutedByIngredients',
    'Routed by ingredients',
  ],
  routedByCheck: [
    'FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeRoutedByCheck',
    'Routed by check',
  ],
  alchemy: ['FABRICATE.Admin.Manager.Scoped.Component.Entry.ModeAlchemy', 'Alchemy'],
});

/**
 * One system's resolution mode, as the row's sub-line reads it.
 *
 * `Object.hasOwn`, never a plain index: `constructor` and `toString` are reachable from a roster
 * value and an inherited member would answer a two-element array this map never declared.
 *
 * @param {unknown} resolutionMode the roster value.
 * @param {(key: string, fallback: string) => string} text
 * @returns {string} the empty string when the roster cannot answer, which draws no sub-line.
 */
export function componentSystemModeLabel(resolutionMode, text) {
  const token = String(resolutionMode ?? '');
  if (!Object.hasOwn(COMPONENT_SYSTEM_MODE_LABELS, token)) return '';
  const [key, fallback] = COMPONENT_SYSTEM_MODE_LABELS[token];
  return text(key, fallback);
}

/**
 * One system row's MIDDLE COLUMN: one ellipsised line saying what that system resolves.
 *
 * ── THE NON-MEMBER BRANCH NAMES THE CONSEQUENCE, NOT THE ABSENCE ─────────────────────────────
 * "No rules" alone is a fact about the record; the reference's sentence says what follows from it
 * — nothing in that system can reach the component — which is the thing a GM is deciding about.
 *
 * ── AND THE MEMBER BRANCH ONLY CLAIMS WHAT THE PROJECTION CARRIES ────────────────────────────
 * The published system row carries `member`, `inherited`, `recipeCount` and `mutedTags` and
 * NOTHING else. So the category clause names the world value while the row inherits and says the
 * value is the system's own while it overrides — reading `row.category` would print
 * `No world category` for an overriding system, which is false rather than merely vague.
 *
 * ── AND THERE IS NO TAG CLAUSE, BECAUSE NO SYSTEM RESOLVES A TAG COUNT ───────────────────────
 * It used to read `{n} tags`, computed as `worldTags.length - mutedTags.length`. That number is
 * a tag set NOTHING resolves: `tags` is not a section, so the read union's trailing re-spread
 * discards the resolver's additive merge and every system's effective tag list is its own,
 * whatever this record holds. The row was therefore stating a per-system fact about a merge that
 * has no consumer — the same false half of the merge the classification subtitle asserted, in
 * numeric form, and the one this file's own docblock at the head calls worse than no note.
 *
 * THE SYSTEM'S OWN TAG COUNT WOULD BE TRUE AND IS NOT AVAILABLE HERE. It lives on the in-system
 * component record, which this projection does not publish — `buildSystemRow` carries the four
 * fields above and nothing more — so the honest clause is NO clause rather than a second wrong
 * number. Restoring one means publishing the count first.
 *
 * @param {object} row the projected system row.
 * @param {object} options
 * @param {string} options.worldCategory the authored world default, or the empty string.
 * @param {(key: string, fallback: string) => string} options.text
 * @param {(key: string, fallback: string, data?: object) => string} options.phrase
 * @returns {{member: boolean, text: string}}
 */
export function componentSystemRowSummary(row, { worldCategory, text, phrase }) {
  if (row?.member !== true) {
    return {
      member: false,
      text: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryNone',
        'No rules — invisible to recipes in this system'
      ),
    };
  }
  const recipes = Number(row?.recipeCount) || 0;
  const clauses = [
    componentRowCategoryClause(row, worldCategory, text),
    phrase(
      recipes === 1
        ? 'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryRecipesOne'
        : 'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryRecipes',
      recipes === 1 ? '{count} recipe' : '{count} recipes',
      { count: recipes }
    ),
  ];
  return { member: true, text: clauses.join(' · ') };
}

/**
 * The category half of a member row's summary, in its three branches.
 *
 * @param {object} row
 * @param {string} worldCategory
 * @param {(key: string, fallback: string) => string} text
 * @returns {string}
 */
function componentRowCategoryClause(row, worldCategory, text) {
  if (row?.inherited?.category === false) {
    return text(
      'FABRICATE.Admin.Manager.Scoped.Component.Entry.SummaryOwnCategory',
      'Its own category'
    );
  }
  const authored = String(worldCategory ?? '').trim();
  if (authored) return authored;
  return text('FABRICATE.Admin.Manager.Scoped.Component.NoWorldCategory', 'No world category');
}

/**
 * The systems card's three segments, each carrying its own count.
 *
 * The counts are computed over the SAME arrays the rows are filtered from, so the widened and the
 * narrowed set are both legible before either is chosen.
 *
 * @param {{total: number, members: number}} counts
 * @returns {Array<{value: string, labelKey: string, fallback: string, badge: number}>}
 */
export function componentEntrySystemFilters({ total, members }) {
  const all = Number(total) || 0;
  const withRules = Number(members) || 0;
  return [
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Entry.FilterAll',
      fallback: 'All',
      badge: all,
    },
    {
      value: 'with',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Entry.FilterWith',
      fallback: 'With rules',
      badge: withRules,
    },
    {
      value: 'without',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Entry.FilterWithout',
      fallback: 'Without',
      badge: Math.max(0, all - withRules),
    },
  ];
}

/**
 * The preview rail's two kickered fact groups, in the shape `ScopedEntityPreview` takes.
 *
 * ── WHY THE BADGES ARE `Ingredient` / `Recipe` / `Gathering` ─────────────────────────────────
 * The reference badges the produced-by rows `Recipe` and `Salvage`. The world component usage leg
 * publishes exactly two producing kinds — a recipe's result set and a gathering task's drop rows
 * — and carries no salvage producer at all, so a `Salvage` badge here would name a relation
 * nothing in the corpus can be. `Gathering` is the kind that IS there.
 *
 * @param {object|null} entry
 * @param {(key: string, fallback: string) => string} text
 * @returns {Array<{kicker: string, rows: object[], emptyNote: string, hookAttribute: string}>}
 */
export function componentEntryPreviewGroups(entry, text) {
  const required = Array.isArray(entry?.requiredBy) ? entry.requiredBy : [];
  const produced = Array.isArray(entry?.producedBy) ? entry.producedBy : [];
  return [
    {
      kicker: text('FABRICATE.Admin.Manager.Scoped.Component.Entry.UsedByKicker', 'Used by'),
      hookAttribute: 'data-world-component-required-by',
      emptyNote: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.UsedByEmpty',
        'No recipe requires it yet.'
      ),
      rows: required.map((reference) =>
        componentEntryPreviewRow(
          reference,
          text('FABRICATE.Admin.Manager.Scoped.Component.Entry.BadgeIngredient', 'Ingredient')
        )
      ),
    },
    {
      kicker: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.ProducedByKicker',
        'Produced by'
      ),
      hookAttribute: 'data-world-component-produced-by',
      emptyNote: text(
        'FABRICATE.Admin.Manager.Scoped.Component.Entry.ProducedByEmpty',
        'Nothing produces it yet.'
      ),
      rows: produced.map((reference) =>
        componentEntryPreviewRow(
          reference,
          reference?.kind === 'gathering'
            ? text('FABRICATE.Admin.Manager.Scoped.Component.Entry.BadgeGathering', 'Gathering')
            : text('FABRICATE.Admin.Manager.Scoped.Component.Entry.BadgeRecipe', 'Recipe')
        )
      ),
    },
  ];
}

/**
 * One fact row in either preview group.
 *
 * The id carries the KIND and the SYSTEM as well as the record id: a recipe and a gathering task
 * can share an id across two systems, and a keyed `{#each}` over a colliding key renders one row
 * and drops the other.
 *
 * @param {object} reference
 * @param {string} badge
 * @returns {object}
 */
function componentEntryPreviewRow(reference, badge) {
  const kind = String(reference?.kind ?? 'recipe');
  return {
    id: `${kind}-${reference?.systemId ?? ''}-${reference?.id ?? ''}`,
    icon: kind === 'gathering' ? 'fas fa-leaf' : 'fas fa-scroll',
    title: String(reference?.name ?? reference?.id ?? ''),
    subtitle: String(reference?.systemName ?? reference?.systemId ?? ''),
    badge,
    badgeTone: kind === 'gathering' ? 'info' : 'neutral',
  };
}

/**
 * How many OTHER catalogue entries name the same source item.
 *
 * ── WHY THIS IS A REAL STATE AND NOT A HYPOTHETICAL ──────────────────────────────────────────
 * `aliasItemUuids` exists because one Foundry Item can be reached by more than one address, and a
 * copy-import preserves ids: two entries pointing at one item is what an import that ran twice
 * leaves behind, and it is the state the source-identity card exists to make visible.
 *
 * Every address a record answers to counts — its registered uuid, its origin uuid and its aliases
 * — because import matches on the union of them, so two entries collide the moment ANY pair
 * intersects rather than only when their primary uuids are equal.
 *
 * @param {object|null} entry the entry under edit.
 * @param {object|null} scope the component family's world-scope projection.
 * @returns {number}
 */
export function componentDuplicateSourceCount(entry, scope) {
  const mine = componentSourceAddresses(entry?.entity);
  if (mine.size === 0) return 0;
  let duplicates = 0;
  for (const candidate of Array.isArray(scope?.entries) ? scope.entries : []) {
    if (!candidate || candidate.id === entry?.id) continue;
    for (const address of componentSourceAddresses(candidate.entity)) {
      if (mine.has(address)) {
        duplicates += 1;
        break;
      }
    }
  }
  return duplicates;
}

/**
 * Every item address one world component answers to.
 *
 * @param {object|null} entity
 * @returns {Set<string>}
 */
function componentSourceAddresses(entity) {
  const addresses = new Set();
  for (const raw of [
    entity?.registeredItemUuid,
    entity?.originItemUuid,
    ...(Array.isArray(entity?.aliasItemUuids) ? entity.aliasItemUuids : []),
  ]) {
    const uuid = typeof raw === 'string' ? raw.trim() : '';
    if (uuid) addresses.add(uuid);
  }
  return addresses;
}

/**
 * The system rules list inspector's identity subline -- `{n} tags · {m} essences`.
 *
 * BOTH CLAUSES PLURALISE INDEPENDENTLY, and the reference's own frame is why: it reads
 * `1 tag · 1 essence`, so a shared plural key would render `1 tags · 1 essences` on the very
 * first component a GM opens. Four keys rather than a composed one, because a translator cannot
 * reorder a sentence this module joined by hand.
 *
 * @param {{tags: number, essences: number}} counts
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentInspectorSubline({ tags, essences }, phrase) {
  const tagCount = Number(tags) || 0;
  const essenceCount = Number(essences) || 0;
  const left = phrase(
    tagCount === 1
      ? 'FABRICATE.Admin.Manager.Component.InspectorTagsOne'
      : 'FABRICATE.Admin.Manager.Component.InspectorTags',
    tagCount === 1 ? '{count} tag' : '{count} tags',
    { count: tagCount }
  );
  const right = phrase(
    essenceCount === 1
      ? 'FABRICATE.Admin.Manager.Component.InspectorEssencesOne'
      : 'FABRICATE.Admin.Manager.Component.InspectorEssences',
    essenceCount === 1 ? '{count} essence' : '{count} essences',
    { count: essenceCount }
  );
  return left + ' · ' + right;
}

/**
 * The inspector's `Tags in effect` split counter -- `{w} world · {s} system`.
 *
 * It is a SPLIT and not a total, because the two halves are authored in different places and the
 * whole point of the block is to say which of the chips beside it the GM can change from here.
 *
 * @param {{world: number, system: number}} counts
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentTagSplitText({ world, system }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.InspectorTagSplit',
    '{world} world · {system} system',
    { world: Number(world) || 0, system: Number(system) || 0 }
  );
}

/**
 * The inspector's `Category` source line -- where the value on screen was resolved from.
 *
 * `''` for a component the world corpus holds no record of: there is nothing to inherit FROM, so
 * neither `inherited from world` nor `set in this system` is a true statement about it, and the
 * reference draws the line only where a source exists.
 *
 * @param {object|null} systemRow the world projection's row for this `(component, system)` pair.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentCategorySourceText(systemRow, phrase) {
  if (!systemRow || systemRow.member !== true) return '';
  return systemRow.inherited?.category === false
    ? phrase('FABRICATE.Admin.Manager.Component.InspectorCategorySet', 'set in this system')
    : phrase(
        'FABRICATE.Admin.Manager.Component.InspectorCategoryInherited',
        'inherited from world'
      );
}

/**
 * The inspector's `Salvage in {system}` note -- the one sentence that says what this component's
 * salvage rules ARE here, without opening the editor.
 *
 * THREE BRANCHES, because the reference's sentence only makes sense in one of them: a system with
 * salvage switched off stores no salvage at all, a component with salvage off yields nothing, and
 * only the third has a mode, a DC and an ordered result count to state.
 *
 * @param {object} options
 * @param {boolean} options.featureEnabled whether the SYSTEM has the salvage feature on.
 * @param {boolean} options.componentEnabled whether THIS component salvages.
 * @param {string} options.modeLabel the system's resolution-mode label, already localized.
 * @param {number|null} options.dc the component's progressive DC, or `null`.
 * @param {number} options.resultCount how many results the rules award.
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentSalvageSummary(
  { featureEnabled, componentEnabled, modeLabel, dc, resultCount },
  phrase
) {
  if (!featureEnabled) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.InspectorSalvageFeatureOff',
      'Salvage is switched off for this system, so these rules store none.'
    );
  }
  if (!componentEnabled) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.InspectorSalvageOff',
      'Salvage is disabled for this component.'
    );
  }
  const count = Number(resultCount) || 0;
  const results = phrase(
    count === 1
      ? 'FABRICATE.Admin.Manager.Component.InspectorSalvageResultsOne'
      : 'FABRICATE.Admin.Manager.Component.InspectorSalvageResults',
    count === 1 ? '{count} ordered result' : '{count} ordered results',
    { count }
  );
  const numericDc = Number(dc);
  if (Number.isFinite(numericDc) && numericDc >= 1) {
    return phrase(
      'FABRICATE.Admin.Manager.Component.InspectorSalvageWithDc',
      '{mode} · these rules’ DC is {dc} · {results}.',
      { mode: modeLabel, dc: numericDc, results }
    );
  }
  return phrase('FABRICATE.Admin.Manager.Component.InspectorSalvageNoDc', '{mode} · {results}.', {
    mode: modeLabel,
    results,
  });
}

/**
 * The system rules LIST header's subtitle -- this system's own posture, not a generic sentence.
 *
 * ── IT NAMES THE CATEGORY AND NOT THE TAGS, BECAUSE ONLY ONE OF THE TWO RESOLVES ──────────
 * It read `world category and tags merge in` until revision 8. The category half is true — the
 * read union resolves the world default for a membership record that inherits the section. The
 * TAG half is not: `resolveComponentTags` folds the world set, the mutes and the system's own
 * list into an effective one, and NOTHING CONSUMES ITS ANSWER — the read union discards it, so
 * a world tag reaches no craft in any system today. `componentScope.js`'s own docblock states
 * that at length, and `### GM World Component Screens` makes it a rule: no surface may assert
 * the false half of the merge while it is unconsumed. A header that told a GM otherwise invites
 * them to author a tag on the world record instead of in the system that actually reads one.
 *
 * @param {{systemName: string, salvageModeLabel: string}} options
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentListSubtitle({ systemName, salvageModeLabel }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.ListSubtitle',
    'Component rules in {system} · {mode} salvage · the world category resolves in; tags, essences, salvage and overrides are this system’s own.',
    { system: systemName, mode: salvageModeLabel }
  );
}

/**
 * The rules EDITOR header's subtitle -- `{system} rules · {category} · {mode}`.
 *
 * @param {{systemName: string, category: string, salvageModeLabel: string}} options
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
export function componentRulesSubtitle({ systemName, category, salvageModeLabel }, phrase) {
  return phrase(
    'FABRICATE.Admin.Manager.Component.RulesSubtitle',
    '{system} rules · {category} · {mode}',
    { system: systemName, category, mode: salvageModeLabel }
  );
}
